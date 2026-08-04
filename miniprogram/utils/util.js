/**
 * 恋爱日历 - 工具函数
 * 日期格式化、倒计时计算、邀请码生成等
 */

const app = getApp();

/**
 * 将图片压缩并转为 base64 Data URI
 * 使用 OffscreenCanvas 压缩，生成的 base64 存入 image_thumbs 集合，
 * 供跨用户显示使用（绕过微信免费版存储权限限制）
 * @param {string} filePath - 图片临时路径（wx.chooseImage 返回的 tempFilePath）
 * @param {number} maxWidth - 最大宽度（像素），默认 400
 * @param {number} quality - JPEG 质量 0-1，默认 0.7
 * @returns {Promise<string>} data:image/jpeg;base64,... 格式的 Data URI
 */
function compressImageToBase64(filePath, maxWidth, quality) {
  maxWidth = maxWidth || 400;
  quality = quality || 0.7;

  return new Promise(function (resolve, reject) {
    wx.getImageInfo({
      src: filePath,
      success: function (info) {
        var scale = Math.min(1, maxWidth / info.width);
        var w = Math.round(info.width * scale);
        var h = Math.round(info.height * scale);

        try {
          var canvas = wx.createOffscreenCanvas({ type: '2d', width: w, height: h });
          var ctx = canvas.getContext('2d');
          var img = canvas.createImage();

          img.onload = function () {
            ctx.drawImage(img, 0, 0, w, h);
            var base64 = canvas.toDataURL('image/jpeg', quality);
            resolve(base64);
          };
          img.onerror = function () {
            // 降级：直接读文件转 base64（不压缩，但至少能用）
            readFileAsBase64(filePath, resolve, reject);
          };
          img.src = filePath;
        } catch (e) {
          // OffscreenCanvas 不可用，降级
          readFileAsBase64(filePath, resolve, reject);
        }
      },
      fail: function () {
        readFileAsBase64(filePath, resolve, reject);
      }
    });
  });
}

/**
 * 降级方案：直接读取文件为 base64
 */
function readFileAsBase64(filePath, resolve, reject) {
  wx.getFileSystemManager().readFile({
    filePath: filePath,
    encoding: 'base64',
    success: function (res) {
      resolve('data:image/jpeg;base64,' + res.data);
    },
    fail: reject
  });
}

/**
 * 将缩略图 base64 存入 image_thumbs 集合
 * 用于跨用户显示图片，绕过免费版存储权限限制
 * @param {string} fileID - cloud:// 格式的 fileID
 * @param {string} base64 - data:image/jpeg;base64,... 格式的 Data URI
 */
async function saveImageThumb(fileID, base64) {
  try {
    var db = app.getDb();
    var coupleId = app.globalData.coupleId || '';
    var existRes = await db.collection('image_thumbs').where({ fileID: fileID }).get();
    if (existRes.data.length > 0) {
      await db.collection('image_thumbs').doc(existRes.data[0]._id).update({
        data: { base64: base64, coupleId: coupleId, updatedAt: new Date().toISOString() }
      });
    } else {
      await db.collection('image_thumbs').add({
        data: { fileID: fileID, base64: base64, coupleId: coupleId, createdAt: new Date().toISOString() }
      });
    }
  } catch (err) {
    console.warn('saveImageThumb 失败:', err);
  }
}

/**
 * 预览图片，兼容 base64 Data URI
 * 先将 base64 写入临时文件，再用 wx.previewImage 预览
 * cloud:// 和 https:// 格式直接传入
 * @param {Array<string>} urls - 图片 URL 数组（可能混合 base64、cloud://、https://）
 * @param {number} currentIndex - 当前预览的索引
 */
async function previewImage(urls, currentIndex) {
  if (!urls || urls.length === 0) return;

  var processed = [];
  for (var i = 0; i < urls.length; i++) {
    var url = urls[i];
    if (url && url.indexOf('data:') === 0) {
      try {
        var tempPath = await base64ToTempFile(url);
        processed.push(tempPath);
      } catch (e) {
        console.warn('base64 转临时文件失败:', e);
        processed.push(url);
      }
    } else {
      processed.push(url);
    }
  }

  wx.previewImage({
    current: processed[currentIndex] || processed[0],
    urls: processed
  });
}

/**
 * 将 base64 Data URI 写入临时文件
 * @param {string} dataUri - data:image/jpeg;base64,... 格式
 * @returns {Promise<string>} 临时文件路径
 */
function base64ToTempFile(dataUri) {
  return new Promise(function (resolve, reject) {
    var parts = dataUri.split(',');
    var base64 = parts.length > 1 ? parts[1] : parts[0];
    var extMatch = parts[0].match(/data:image\/(\w+);/);
    var ext = extMatch ? extMatch[1] : 'jpg';

    var filePath = wx.env.USER_DATA_PATH + '/preview_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6) + '.' + ext;

    wx.getFileSystemManager().writeFile({
      filePath: filePath,
      data: base64,
      encoding: 'base64',
      success: function () { resolve(filePath); },
      fail: reject
    });
  });
}

/**
 * 格式化日期为 YYYY-MM-DD
 * @param {Date} date - 日期对象
 * @returns {string} 格式化后的日期字符串
 */
function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 获取今天的日期字符串
 * @returns {string} YYYY-MM-DD
 */
function getToday() {
  return formatDate(new Date());
}

/**
 * 计算两个日期之间的天数差
 * @param {string} date1 - 较早的日期 YYYY-MM-DD
 * @param {string} date2 - 较晚的日期 YYYY-MM-DD（默认今天）
 * @returns {number} 天数差
 */
function daysBetween(date1, date2) {
  const d1 = new Date(date1);
  const d2 = date2 ? new Date(date2) : new Date();
  const diffTime = d2.getTime() - d1.getTime();
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * 计算纪念日倒计时
 * 如果纪念日已过，返回距今年纪念日的天数（倒计时到下一次）
 * 如果纪念日未过，返回距今年纪念日的天数
 * @param {string} dateStr - 纪念日日期 YYYY-MM-DD
 * @returns {object} { days: 天数, isPast: 是否已过, nextDate: 下次日期 }
 */
function getAnniversaryCountdown(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const originalDate = new Date(dateStr);
  const month = originalDate.getMonth();
  const day = originalDate.getDate();

  // 今年的纪念日
  const thisYear = new Date(today.getFullYear(), month, day);
  const nextYear = new Date(today.getFullYear() + 1, month, day);

  let nextDate;
  let isPast = false;

  if (thisYear >= today) {
    // 今年还没到
    nextDate = thisYear;
    isPast = false;
  } else {
    // 今年已经过了，看明年的
    nextDate = nextYear;
    isPast = true;
  }

  const diffTime = nextDate.getTime() - today.getTime();
  const days = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  return {
    days: days,
    isPast: isPast,
    nextDate: formatDate(nextDate),
    totalDays: daysBetween(dateStr, getToday()), // 从起始日到今天的总天数
  };
}

/**
 * 获取某个月的天数
 * @param {number} year - 年份
 * @param {number} month - 月份 (1-12)
 * @returns {number} 该月天数
 */
function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

/**
 * 获取某个月第一天是星期几
 * @param {number} year - 年份
 * @param {number} month - 月份 (1-12)
 * @returns {number} 0=周日, 1=周一, ..., 6=周六
 */
function getFirstDayOfMonth(year, month) {
  return new Date(year, month - 1, 1).getDay();
}

/**
 * 生成月份的日历格子数据
 * @param {number} year - 年份
 * @param {number} month - 月份 (1-12)
 * @returns {Array} 日历格子数组，包含空白天和实际日期
 */
function generateCalendarGrid(year, month) {
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const grid = [];

  // 填充前面的空白
  for (let i = 0; i < firstDay; i++) {
    grid.push({ day: '', empty: true });
  }

  // 填充实际日期
  for (let d = 1; d <= daysInMonth; d++) {
    grid.push({
      day: d,
      date: `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
      empty: false,
      isToday: formatDate(new Date()) === `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
    });
  }

  return grid;
}

/**
 * 心情映射：英文 -> 表情 + 中文
 */
const MOOD_MAP = {
  happy: { emoji: '😊', label: '开心' },
  sweet: { emoji: '😍', label: '甜蜜' },
  calm: { emoji: '😐', label: '平静' },
  sad: { emoji: '😢', label: '难过' },
  angry: { emoji: '😡', label: '生气' },
};

/**
 * 获取心情的表情和标签
 * @param {string} moodKey - 心情英文 key
 * @returns {object} { emoji, label }
 */
function getMoodInfo(moodKey) {
  return MOOD_MAP[moodKey] || { emoji: '❓', label: '未知' };
}

/**
 * 获取所有心情选项
 * @returns {Array} 心情选项数组
 */
function getMoodOptions() {
  return Object.entries(MOOD_MAP).map(([key, value]) => ({
    key,
    ...value,
  }));
}

/**
 * 相对时间格式化
 * @param {string} dateStr - 日期字符串
 * @returns {string} 如 "今天"、"昨天"、"3天前"、"2026-07-01"
 */
function formatRelativeDate(dateStr) {
  const today = getToday();
  const diff = daysBetween(dateStr, today);

  if (diff === 0) return '今天';
  if (diff === 1) return '昨天';
  if (diff === 2) return '前天';
  if (diff <= 7) return `${diff}天前`;
  return dateStr;
}

/**
 * 格式化完整日期时间
 * @param {string} dateStr - ISO 日期字符串
 * @returns {string} 如 "2026年7月24日 14:30"
 */
function formatDateTime(dateStr) {
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${year}年${month}月${day}日 ${hour}:${minute}`;
}

/**
 * 将云存储 fileID（cloud://）批量转换为临时链接
 * 优先从 image_thumbs 集合查 base64 缩略图（跨用户可见，无需 Worker）
 * 查不到的旧数据降级走 Worker，Worker 失败则用 wx.cloud.getTempFileURL
 * @param {Array<string>} fileIds - cloud:// 格式的 fileID 数组
 * @returns {Promise<Object>} fileID -> url 的映射对象（base64 或 tempFileURL）
 */
async function convertCloudFileIDs(fileIds) {
  if (!fileIds || fileIds.length === 0) return {};

  var map = {};
  var missIds = [];  // image_thumbs 中查不到的，需要走降级逻辑

  try {
    // 第一层：从 image_thumbs 集合查 base64 缩略图
    var db = app.getDb();
    var _ = db.command;
    var thumbRes = await db.collection('image_thumbs')
      .where({ fileID: _.in(fileIds) })
      .get();

    thumbRes.data.forEach(function (item) {
      if (item.base64) {
        map[item.fileID] = item.base64;
      }
    });

    // 找出没命中的 fileID
    fileIds.forEach(function (fid) {
      if (!map[fid]) {
        missIds.push(fid);
      }
    });
  } catch (e) {
    // image_thumbs 查询失败（比如集合不存在），全部走降级
    console.warn('查询 image_thumbs 失败，全部走降级:', e);
    missIds = fileIds.slice();
  }

  if (missIds.length === 0) return map;

  // 第二层：没命中的走云函数 getTempUrls（admin 权限，绕过存储限制，最可靠）
  try {
    var cfRes = await wx.cloud.callFunction({
      name: 'getTempUrls',
      data: { fileList: missIds },
    });
    if (cfRes.result && cfRes.result.success && cfRes.result.data) {
      cfRes.result.data.forEach(function (f) {
        if (f.tempFileURL && !map[f.fileID]) {
          map[f.fileID] = f.tempFileURL;
        }
      });
      // 检查是否还有未命中的
      var cfStillMiss = [];
      missIds.forEach(function (fid) {
        if (!map[fid]) cfStillMiss.push(fid);
      });
      missIds = cfStillMiss;
    }
  } catch (e) {
    console.warn('云函数 getTempUrls 失败:', e);
  }

  if (missIds.length === 0) return map;

  // 第三层：没命中的走 Worker（应用级 access_token API）
  var WORKER_URL = 'https://love-calendar.zhaoqingyi.workers.dev/api/getTempUrls';
  try {
    var resp = await new Promise(function (resolve, reject) {
      wx.request({
        url: WORKER_URL,
        method: 'POST',
        data: { fileList: missIds },
        header: { 'Content-Type': 'application/json' },
        success: resolve,
        fail: reject,
      });
    });

    if (resp.statusCode === 200 && resp.data && resp.data.success && resp.data.data) {
      resp.data.data.forEach(function (f) {
        if (f.tempFileURL && !map[f.fileID]) {
          map[f.fileID] = f.tempFileURL;
        }
      });
      // 检查是否还有未命中的
      var stillMiss = [];
      missIds.forEach(function (fid) {
        if (!map[fid]) stillMiss.push(fid);
      });
      missIds = stillMiss;
    }
  } catch (e) {
    console.warn('Worker 请求异常:', e);
  }

  if (missIds.length === 0) return map;

  // 第四层：直接调用 wx.cloud.getTempFileURL（至少上传者自己的能看到）
  try {
    var directRes = await wx.cloud.getTempFileURL({ fileList: missIds });
    directRes.fileList.forEach(function (f) {
      if (f.tempFileURL && !map[f.fileID]) {
        map[f.fileID] = f.tempFileURL;
      }
    });
  } catch (e) {
    console.warn('转换云存储临时链接失败:', e);
  }

  return map;
}

/**
 * 从纪念日列表构建日期映射（用于日历角标和今天判断）
 * 按 MM-DD 格式分组，同一天可能有多个纪念日
 * @param {Array} anniversaryList - 纪念日列表
 * @returns {Object} { "MM-DD": [{title, type, _id, ...}] }
 */
function buildAnniversaryDateMap(anniversaryList) {
  var map = {};
  anniversaryList.forEach(function (item) {
    var d = new Date(item.date);
    var key = String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    if (!map[key]) map[key] = [];
    map[key].push({
      title: item.title,
      type: item.type,
      _id: item._id,
      date: item.date,
    });
  });
  return map;
}

/**
 * 判断今天是否为纪念日，返回纪念日对象（按月日匹配，忽略年份）
 * 如果有多个纪念日在同一天，返回第一个（通常为"在一起"）
 * @param {Array} anniversaryList - 纪念日列表
 * @returns {Object|null} 今天的纪念日对象（附带 totalDays），或 null
 */
function getTodayAnniversary(anniversaryList) {
  var today = new Date();
  var todayMonth = today.getMonth();
  var todayDate = today.getDate();
  for (var i = 0; i < anniversaryList.length; i++) {
    var item = anniversaryList[i];
    var d = new Date(item.date);
    if (d.getMonth() === todayMonth && d.getDate() === todayDate) {
      var totalDiffTime = today.getTime() - d.getTime();
      return {
        title: item.title,
        type: item.type,
        date: item.date,
        totalDays: Math.floor(totalDiffTime / (1000 * 60 * 60 * 24)),
      };
    }
  }
  return null;
}

module.exports = {
  formatDate,
  getToday,
  daysBetween,
  getAnniversaryCountdown,
  getDaysInMonth,
  getFirstDayOfMonth,
  generateCalendarGrid,
  getMoodInfo,
  getMoodOptions,
  formatRelativeDate,
  formatDateTime,
  convertCloudFileIDs,
  compressImageToBase64,
  saveImageThumb,
  previewImage,
  buildAnniversaryDateMap,
  getTodayAnniversary,
  MOOD_MAP,
};