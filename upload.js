/**
 * 恋爱日历 - 命令行上传小程序代码
 * 使用 miniprogram-ci 上传到微信后台
 *
 * 使用方法：
 *   node upload.js              # 上传代码（开发版）
 *   node upload.js --preview    # 生成预览二维码
 *   node upload.js --desc "修复bug"  # 自定义版本描述
 */
const ci = require('miniprogram-ci');
const path = require('path');
const fs = require('fs');

// ========== 配置 ==========
const CONFIG = {
  appid: 'wx58f20f88ad0c27c7',
  projectPath: path.join(__dirname, 'miniprogram'),
  privateKeyPath: path.join(__dirname, 'private.key'),
  // 版本号，取当前时间
  version: getVersion(),
  // 版本描述
  desc: process.argv.includes('--desc')
    ? process.argv[process.argv.indexOf('--desc') + 1]
    : '更新代码',
  // 机器人编号（1-30），用于区分不同开发者
  robot: 1,
};

// 生成版本号
function getVersion() {
  const now = new Date();
  const Y = now.getFullYear();
  const M = String(now.getMonth() + 1).padStart(2, '0');
  const D = String(now.getDate()).padStart(2, '0');
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  return `${Y}.${M}.${D}.${h}${m}`;
}

// 检查必要文件
function checkFiles() {
  const errors = [];

  if (!fs.existsSync(CONFIG.projectPath)) {
    errors.push(`项目目录不存在: ${CONFIG.projectPath}`);
  }
  if (!fs.existsSync(CONFIG.privateKeyPath)) {
    errors.push(`上传密钥不存在: ${CONFIG.privateKeyPath}`);
  }
  if (!fs.existsSync(path.join(CONFIG.projectPath, 'app.json'))) {
    errors.push(`app.json 不存在，项目结构不正确`);
  }

  if (errors.length > 0) {
    console.error('❌ 检查失败：');
    errors.forEach(e => console.error('   -', e));
    process.exit(1);
  }

  console.log('✅ 项目文件检查通过');
}

// 上传
async function upload() {
  console.log('🚀 开始上传小程序代码...');
  console.log(`   AppID: ${CONFIG.appid}`);
  console.log(`   版本: ${CONFIG.version}`);
  console.log(`   描述: ${CONFIG.desc}`);
  console.log('');

  checkFiles();

  // 创建项目实例
  const project = new ci.Project({
    appid: CONFIG.appid,
    type: 'miniProgram',
    projectPath: CONFIG.projectPath,
    privateKeyPath: CONFIG.privateKeyPath,
    ignores: [
      'node_modules/**/*',
      '.git/**/*',
      '*.md',
      'cloudfunctions/**/node_modules/**/*',
    ],
  });

  try {
    // 上传代码
    const uploadResult = await ci.upload({
      project,
      version: CONFIG.version,
      desc: CONFIG.desc,
      robot: CONFIG.robot,
      setting: {
        es6: true,
        es7: true,
        minify: true,
        codeProtect: false,
        autoPrefixWXSS: true,
      },
      onProgressUpdate: (progress) => {
        // 进度回调
        if (progress.status === 'doing') {
          console.log(`   📤 上传中... ${progress.message || ''}`);
        }
      },
    });

    console.log('');
    console.log('✅ 上传成功！');
    console.log('');
    console.log('📋 下一步操作：');
    console.log('   1. 打开 https://mp.weixin.qq.com');
    console.log('   2. 登录小程序后台');
    console.log('   3. 左侧菜单 → 管理 → 版本管理');
    console.log('   4. 找到刚上传的版本（开发版本），设为体验版');
    console.log('   5. 用手机微信扫码体验版测试');
    console.log('   6. 测试没问题后，提交审核');
    console.log('');

  } catch (error) {
    console.error('');
    console.error('❌ 上传失败:', error.message);
    if (error.message.includes('private key')) {
      console.error('   → 请检查密钥文件是否正确');
    }
    if (error.message.includes('appid')) {
      console.error('   → 请检查 AppID 是否正确');
    }
    if (error.message.includes('network') || error.message.includes('ENOTFOUND')) {
      console.error('   → 网络连接失败，请检查网络（可能需要关闭代理）');
    }
    process.exit(1);
  }
}

// 生成预览二维码
async function preview() {
  console.log('📱 生成预览二维码...\n');

  checkFiles();

  const project = new ci.Project({
    appid: CONFIG.appid,
    type: 'miniProgram',
    projectPath: CONFIG.projectPath,
    privateKeyPath: CONFIG.privateKeyPath,
    ignores: [
      'node_modules/**/*',
      '.git/**/*',
      '*.md',
      'cloudfunctions/**/node_modules/**/*',
    ],
  });

  try {
    const previewResult = await ci.preview({
      project,
      desc: '预览测试',
      setting: {
        es6: true,
        es7: true,
        minify: false,
        autoPrefixWXSS: true,
      },
      qrcodeFormat: 'image',
      qrcodeOutputDest: path.join(__dirname, 'preview-qrcode.png'),
      onProgressUpdate: (progress) => {
        console.log(`   📤 ${progress.message || ''}`);
      },
    });

    console.log('');
    console.log('✅ 预览二维码已生成！');
    console.log(`   📱 二维码图片: ${path.join(__dirname, 'preview-qrcode.png')}`);
    console.log('   → 用手机微信扫描二维码即可预览');
    console.log('');

  } catch (error) {
    console.error('');
    console.error('❌ 生成预览二维码失败:', error.message);
    process.exit(1);
  }
}

// 主函数
async function main() {
  if (process.argv.includes('--preview')) {
    await preview();
  } else {
    await upload();
  }
}

main();