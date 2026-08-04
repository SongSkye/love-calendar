/**
 * 历史图片迁移脚本
 * 直连微信 TCB API，不依赖 Worker/云函数，不受免费版存储权限限制
 *
 * 用法：
 *   1. 从云开发控制台导出数据集合的 JSON 文件，放到 export/ 目录下：
 *      - moods.json
 *      - diaries.json
 *      - anniversaries.json (纪念日封面)
 *      - anniversary_records.json
 *      - users.json (用户头像)
 *   2. npm install  (已装好 sharp 依赖)
 *   3. node migrate-images.js
 *   4. 将生成的 image_thumbs_import.jsonl 导入云开发控制台的 image_thumbs 集合
 *
 * 特性：
 *   - 直连微信 API（api.weixin.qq.com），国内网络稳定
 *   - 支持增量续传：中断后重新运行会跳过已处理的图片
 *   - 自动压缩：400px 宽、70% JPEG 质量，和前端保持一致
 *   - 支持 JSON 数组和 JSON Lines 两种导出格式
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const sharp = require('sharp');

// ========== 配置 ==========
// 微信小程序 AppID 和 AppSecret（从 mp.weixin.qq.com → 开发 → 开发管理 → 开发设置 获取）
const APPID = 'wx58f20f88ad0c27c7';
const SECRET = '82090c79045c0228cbc5c2a728ff6902';
const CLOUD_ENV = 'cloudbase-d2gr49l7r2f948ed1';

const EXPORT_DIR = path.join(__dirname, 'export');
const OUTPUT_FILE = path.join(__dirname, 'image_thumbs_import.json');  // .json 后缀，内容为 JSON Lines 格式
const RESUME_FILE = path.join(__dirname, '.migrate_resume.jsonl');     // 增量续传记录
const MAX_WIDTH = 400;       // 缩略图最大宽度
const JPEG_QUALITY = 70;     // JPEG 质量
const BATCH_SIZE = 10;       // 每批获取临时链接的 fileID 数量（微信API限制较严，不宜过大）
const REQUEST_DELAY = 500;   // 每批请求间隔（毫秒）

// access_token 缓存（有效期 7200 秒）
let accessTokenCache = { token: '', expireAt: 0 };

// ========== 工具函数 ==========

/**
 * 发起 HTTPS 请求
 */
function request(url, options) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const lib = urlObj.protocol === 'https:' ? https : http;
    const req = lib.request(url, options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          resolve({ statusCode: res.statusCode, data: body });
        }
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

/**
 * 下载文件到 Buffer
 */
function downloadFile(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https:') ? https : http;
    lib.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // 跟随重定向
        downloadFile(res.headers.location).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`下载失败，状态码: ${res.statusCode}`));
        return;
      }
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
  });
}

/**
 * 获取微信 access_token（应用级，带缓存）
 * 脚本直连微信 API，不依赖 Worker，避免网络超时
 */
async function getAccessToken() {
  const now = Date.now();
  if (accessTokenCache.token && accessTokenCache.expireAt > now) {
    return accessTokenCache.token;
  }

  console.log('  🔑 获取 access_token...');
  const resp = await request(
    `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${APPID}&secret=${SECRET}`,
    { method: 'GET' }
  );

  if (resp.statusCode === 200 && resp.data && resp.data.access_token) {
    accessTokenCache = {
      token: resp.data.access_token,
      expireAt: now + (resp.data.expires_in - 300) * 1000,
    };
    console.log('  ✅ access_token 已获取');
    return resp.data.access_token;
  }
  throw new Error('获取 access_token 失败: ' + JSON.stringify(resp.data));
}

/**
 * 批量获取云存储临时下载链接（直连微信 TCB HTTP API）
 * 使用应用级 access_token，不受免费版存储权限限制
 * @param {Array<string>} fileList - cloud:// 格式的 fileID 数组
 * @returns {Promise<Object>} fileID → tempFileURL 映射
 */
async function batchGetTempUrls(fileList) {
  const accessToken = await getAccessToken();
  const url = `https://api.weixin.qq.com/tcb/batchdownloadfile?access_token=${accessToken}`;
  const body = JSON.stringify({
    env: CLOUD_ENV,
    file_list: fileList.map(function (fid) {
      return { fileid: fid, max_age: 7200 };
    }),
  });

  // 用更底层的方式请求，拿到完整的原始响应
  const resp = await rawRequest(url, { method: 'POST', body: body });
  console.log('    → API 状态码:', resp.statusCode, '| 响应长度:', resp.body.length);
  if (resp.body.length > 0 && resp.body.length < 500) {
    console.log('    → 原始响应:', resp.body.substring(0, 500));
  }

  if (resp.statusCode !== 200 || !resp.body) {
    return {};
  }

  let data;
  try { data = JSON.parse(resp.body); } catch (e) {
    console.log('    → JSON 解析失败');
    return {};
  }

  if (data.errcode) {
    console.log('    ⚠️ batchdownloadfile errcode:', data.errcode, data.errmsg);
    return {};
  }

  const urlMap = {};
  (data.file_list || []).forEach(function (f) {
    if (f.download_url) {
      urlMap[f.fileid] = f.download_url;
    }
  });
  return urlMap;
}

/**
 * 原始 HTTP 请求（不解析 JSON）
 */
function rawRequest(url, options) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const lib = urlObj.protocol === 'https:' ? https : http;
    const body = options.body || '';
    const headers = Object.assign({
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    }, options.headers || {});

    const req = lib.request(url, {
      method: options.method || 'GET',
      headers: headers,
    }, (res) => {
      let bodyStr = '';
      res.on('data', (chunk) => { bodyStr += chunk; });
      res.on('end', () => resolve({ statusCode: res.statusCode, body: bodyStr }));
    });
    req.on('error', reject);
    req.setTimeout(30000, function () {
      req.destroy();
      reject(new Error('请求超时'));
    });
    if (body) req.write(body);
    req.end();
  });
}

/**
 * 将图片 Buffer 压缩并转为 base64 Data URI
 */
async function compressToBase64(buffer) {
  const metadata = await sharp(buffer).metadata();
  const width = Math.min(MAX_WIDTH, metadata.width || MAX_WIDTH);
  const compressed = await sharp(buffer)
    .resize({ width: width, withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();
  return 'data:image/jpeg;base64,' + compressed.toString('base64');
}

/**
 * 延迟
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 读取 JSON 文件（支持 JSON 数组和 JSON Lines 两种格式）
 */
function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) {
    console.log(`  ⚠️ 文件不存在: ${filePath}，跳过`);
    return [];
  }
  const content = fs.readFileSync(filePath, 'utf-8').trim();
  if (!content) return [];

  // 尝试作为 JSON 数组解析
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) return parsed;
    // 如果是单个对象，包装成数组
    return [parsed];
  } catch (e) {
    // JSON 数组解析失败，尝试 JSON Lines 格式
    console.log('  → 检测到 JSON Lines 格式，按行解析');
    const lines = content.split('\n').filter((line) => line.trim());
    return lines.map((line) => {
      try { return JSON.parse(line); } catch (e) { return null; }
    }).filter(Boolean);
  }
}

/**
 * 从数据中提取所有 cloud:// 格式的 fileID（附带 coupleId）
 * @returns {Array<{fileID: string, coupleId: string}>}
 */
function extractFileIDs(allRecords) {
  const seen = new Set();
  const result = [];
  for (const record of allRecords) {
    const coupleId = record.coupleId || '';
    const imageFields = ['images', 'coverImage', 'avatar'];
    for (const field of imageFields) {
      const val = record[field];
      if (!val) continue;
      if (Array.isArray(val)) {
        val.forEach((img) => {
          if (typeof img === 'string' && img.startsWith('cloud://') && !seen.has(img)) {
            seen.add(img);
            result.push({ fileID: img, coupleId: coupleId });
          }
        });
      } else if (typeof val === 'string' && val.startsWith('cloud://') && !seen.has(val)) {
        seen.add(val);
        result.push({ fileID: val, coupleId: coupleId });
      }
    }
  }
  return result;
}

// ========== 主流程 ==========

async function main() {
  console.log('📸 历史图片迁移工具');
  console.log('====================\n');

  // 确保 export 目录存在
  if (!fs.existsSync(EXPORT_DIR)) {
    fs.mkdirSync(EXPORT_DIR, { recursive: true });
    console.log('📁 已创建 export/ 目录');
    console.log('   请将以下文件放入 export/ 目录：');
    console.log('   - moods.json');
    console.log('   - diaries.json');
    console.log('   - anniversary_records.json');
    console.log('\n   从云开发控制台 → 数据库 → 对应集合 → 导出（JSON 格式）\n');
    return;
  }

  // 1. 读取所有数据文件
  console.log('📖 步骤 1: 读取导出数据...');
  const configs = [
    { file: 'moods.json', label: '心情' },
    { file: 'diaries.json', label: '日记' },
    { file: 'anniversaries.json', label: '纪念日封面' },
    { file: 'anniversary_records.json', label: '纪念日记录' },
    { file: 'users.json', label: '用户头像' },
  ];

  let allRecords = [];
  for (const cfg of configs) {
    const filePath = path.join(EXPORT_DIR, cfg.file);
    const records = readJsonFile(filePath);
    if (records.length > 0) {
      allRecords = allRecords.concat(records);
      console.log(`  ✅ ${cfg.label}: ${records.length} 条`);
    }
  }

  if (allRecords.length === 0) {
    console.log('❌ 没有读取到任何数据，请检查 export/ 目录下的文件');
    return;
  }
  console.log(`  总计: ${allRecords.length} 条记录\n`);

  // 2. 提取所有 fileID
  console.log('🔍 步骤 2: 提取所有 cloud:// 图片...');
  const fileIdEntries = extractFileIDs(allRecords);
  if (fileIdEntries.length === 0) {
    console.log('❌ 没有找到任何 cloud:// 格式的图片');
    return;
  }
  console.log(`  找到 ${fileIdEntries.length} 个唯一图片\n`);

  // 构建 fileID → coupleId 映射
  const coupleIdMap = {};
  fileIdEntries.forEach(function (entry) {
    coupleIdMap[entry.fileID] = entry.coupleId;
  });
  const allFileIDs = fileIdEntries.map(function (e) { return e.fileID; });

  // 3. 检查已处理的（增量续传，用独立的续传文件记录）
  console.log('📋 步骤 3: 检查已处理记录...');
  const processed = new Set();
  if (fs.existsSync(RESUME_FILE)) {
    const existing = fs.readFileSync(RESUME_FILE, 'utf-8').trim();
    if (existing) {
      existing.split('\n').forEach(function (line) {
        try {
          const obj = JSON.parse(line);
          if (obj.fileID) processed.add(obj.fileID);
        } catch (e) {}
      });
    }
    console.log(`  已有 ${processed.size} 条已处理记录`);
  }
  const remaining = allFileIDs.filter(function (id) { return !processed.has(id); });
  if (remaining.length === 0) {
    console.log('✅ 所有图片已处理完毕！');
    return;
  }
  console.log(`  还需处理 ${remaining.length} 个图片\n`);

  // 4. 分批获取临时下载链接
  console.log('🌐 步骤 4: 获取临时下载链接并压缩...');
  console.log(`  每批 ${BATCH_SIZE} 个，批次间隔 ${REQUEST_DELAY}ms\n`);

  let successCount = 0;
  let failCount = 0;
  const startTime = Date.now();

  for (let i = 0; i < remaining.length; i += BATCH_SIZE) {
    const batch = remaining.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(remaining.length / BATCH_SIZE);
    console.log(`  📦 批次 ${batchNum}/${totalBatches} (${batch.length} 个)`);

    // 获取临时链接（直连微信 TCB API，不依赖 Worker）
    const urlMap = await batchGetTempUrls(batch);

    // 逐个下载并压缩
    for (const fileID of batch) {
      const tempUrl = urlMap[fileID];
      if (!tempUrl) {
        console.log(`    ❌ ${fileID.substring(0, 50)}... → 无临时链接`);
        failCount++;
        continue;
      }

      try {
        const buffer = await downloadFile(tempUrl);
        const base64 = await compressToBase64(buffer);
        const record = {
          fileID: fileID,
          base64: base64,
          coupleId: coupleIdMap[fileID] || '',
          createdAt: new Date().toISOString(),
        };
        // 追加写入续传文件（JSONL 格式）
        fs.appendFileSync(RESUME_FILE, JSON.stringify(record) + '\n');
        console.log(`    ✅ ${fileID.substring(0, 50)}... → ${(buffer.length / 1024).toFixed(1)}KB → ${(base64.length / 1024).toFixed(1)}KB base64`);
        successCount++;
      } catch (e) {
        console.log(`    ❌ ${fileID.substring(0, 50)}... → ${e.message}`);
        failCount++;
      }
    }

    // 批次间延迟
    if (i + BATCH_SIZE < remaining.length) {
      await sleep(REQUEST_DELAY);
    }
  }

  // 5. 完成——续传文件本身就是 JSON Lines 格式，直接复制为输出文件
  if (successCount > 0 || (fs.existsSync(RESUME_FILE) && fs.statSync(RESUME_FILE).size > 0)) {
    fs.copyFileSync(RESUME_FILE, OUTPUT_FILE);
    const lines = fs.readFileSync(OUTPUT_FILE, 'utf-8').trim().split('\n').filter(Boolean);
    console.log(`\n✅ 已生成 JSON Lines 文件: ${OUTPUT_FILE} (${lines.length} 条记录)`);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n====================`);
  console.log(`✅ 迁移完成！`);
  console.log(`   成功: ${successCount} 个`);
  console.log(`   失败: ${failCount} 个`);
  console.log(`   耗时: ${elapsed}s`);
  console.log(`   输出文件: ${OUTPUT_FILE}`);
  console.log(`\n📋 下一步：`);
  console.log(`   1. 打开云开发控制台 → 数据库 → image_thumbs 集合`);
  console.log(`   2. 点击「导入」→ 选择 ${OUTPUT_FILE}`);
  console.log(`   3. 默认 JSON Lines 格式，直接确认导入即可`);
  console.log(`\n💡 提示：脚本支持增量续传，重新运行会跳过已处理的图片`);
}

main().catch((err) => {
  console.error('❌ 脚本异常:', err);
  process.exit(1);
});