/**
 * 恋爱日历 - 工具函数
 * 日期格式化、倒计时计算、邀请码生成等
 */

const app = getApp();

// 图片 URL 内存缓存：fileID → base64/tempURL，避免重复查库
var imageUrlCache = {};

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
 * 优先从内存缓存获取，其次从 image_thumbs 集合查 base64 缩略图
 * 查不到的降级走云函数 getTempUrls，最后 wx.cloud.getTempFileURL 兜底
 * @param {Array<string>} fileIds - cloud:// 格式的 fileID 数组
 * @returns {Promise<Object>} fileID -> url 的映射对象（base64 或 tempFileURL）
 */
async function convertCloudFileIDs(fileIds) {
  if (!fileIds || fileIds.length === 0) return {};

  var map = {};
  var missIds = [];  // 缓存和 image_thumbs 都查不到的，需要走降级逻辑

  // 第零层：内存缓存（最快，避免重复查库）
  fileIds.forEach(function (fid) {
    if (imageUrlCache[fid]) {
      map[fid] = imageUrlCache[fid];
    } else {
      missIds.push(fid);
    }
  });

  if (missIds.length === 0) return map;

  try {
    // 第一层：从 image_thumbs 集合查 base64 缩略图
    var db = app.getDb();
    var _ = db.command;
    // _.in 数组过长会报错，分批查；每批再分页取全部（默认 .get() 只返 20 条）
    var allThumbs = [];
    var batchSize = 50;
    for (var b = 0; b < missIds.length; b += batchSize) {
      var batchIds = missIds.slice(b, b + batchSize);
      var batchThumbs = await fetchAll(db, 'image_thumbs', { fileID: _.in(batchIds) });
      allThumbs = allThumbs.concat(batchThumbs);
    }

    allThumbs.forEach(function (item) {
      if (item.base64) {
        map[item.fileID] = item.base64;
        imageUrlCache[item.fileID] = item.base64;  // 写入缓存
      }
    });

    // 找出没命中的 fileID
    var stillMiss = [];
    missIds.forEach(function (fid) {
      if (!map[fid]) {
        stillMiss.push(fid);
      }
    });
    missIds = stillMiss;
  } catch (e) {
    console.warn('查询 image_thumbs 失败，全部走降级:', e);
    missIds = fileIds.filter(function (fid) { return !map[fid]; });
  }

  if (missIds.length === 0) return map;

  // 第二层：没命中的走云函数 getTempUrls（admin 权限，绕过存储限制）
  try {
    var cfRes = await wx.cloud.callFunction({
      name: 'getTempUrls',
      data: { fileList: missIds },
    });
    if (cfRes.result && cfRes.result.success && cfRes.result.data) {
      cfRes.result.data.forEach(function (f) {
        if (f.tempFileURL && !map[f.fileID]) {
          map[f.fileID] = f.tempFileURL;
          imageUrlCache[f.fileID] = f.tempFileURL;  // 写入缓存
        }
      });
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

  // 第三层：直接调用 wx.cloud.getTempFileURL（至少上传者自己的能看到，兜底）
  try {
    var directRes = await wx.cloud.getTempFileURL({ fileList: missIds });
    directRes.fileList.forEach(function (f) {
      if (f.tempFileURL && !map[f.fileID]) {
        map[f.fileID] = f.tempFileURL;
        imageUrlCache[f.fileID] = f.tempFileURL;  // 写入缓存
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

/**
 * 爱情树 - 根据累计开花数计算成长阶段
 * @param {number} totalFlowers - 累计开花数
 * @returns {object} { stage, emoji, label, nextStageFlowers }
 */
function getTreeStage(totalFlowers) {
  totalFlowers = totalFlowers || 0;
  if (totalFlowers === 0)          return { stage: 0, emoji: '🌱', label: '种子', nextStageFlowers: 1 };
  if (totalFlowers <= 3)           return { stage: 1, emoji: '🌿', label: '发芽', nextStageFlowers: 4 };
  if (totalFlowers <= 10)          return { stage: 2, emoji: '🪴', label: '幼苗', nextStageFlowers: 11 };
  if (totalFlowers <= 30)          return { stage: 3, emoji: '🌳', label: '小树', nextStageFlowers: 31 };
  if (totalFlowers <= 60)          return { stage: 4, emoji: '🌸', label: '开花树', nextStageFlowers: 61 };
  return { stage: 5, emoji: '🍎', label: '结果树', nextStageFlowers: null };
}

/**
 * 爱情树 - 计算阶段进度百分比
 * @param {number} totalFlowers - 累计开花数
 * @returns {number} 0-100
 */
function getTreeProgress(totalFlowers) {
  totalFlowers = totalFlowers || 0;
  var stage = getTreeStage(totalFlowers);
  if (stage.nextStageFlowers === null) return 100;
  var ranges = [0, 1, 4, 11, 31, 61];
  var currentMin = ranges[stage.stage];
  var currentMax = ranges[stage.stage + 1];
  var progress = ((totalFlowers - currentMin) / (currentMax - currentMin)) * 100;
  return Math.min(100, Math.max(0, Math.round(progress)));
}

// ===== 扭蛋卡片定义 =====

/**
 * 所有扭蛋卡片数据（4 套系 × 6 张 = 24 张）
 */
var GACHA_CARDS = [
  // 套系1：甜蜜任务
  { cardId: 'card_001', title: '给对方发一张自拍', description: '拍一张此刻的自拍发给TA，让TA看到现在的你', rarity: 1, setId: 'set_sweet_tasks', setName: '甜蜜任务', emoji: '📸', color: '#FFB3BF' },
  { cardId: 'card_002', title: '分享一首正在听的歌', description: '把耳机里的歌分享给TA，让音乐连接彼此', rarity: 1, setId: 'set_sweet_tasks', setName: '甜蜜任务', emoji: '🎵', color: '#FFB3BF' },
  { cardId: 'card_003', title: '语音说一句"我想你"', description: '用声音传递思念，比文字更温暖', rarity: 2, setId: 'set_sweet_tasks', setName: '甜蜜任务', emoji: '🎤', color: '#B3D4FF' },
  { cardId: 'card_004', title: '告诉TA今天最想TA的瞬间', description: '分享你一天中那个突然想起TA的时刻', rarity: 2, setId: 'set_sweet_tasks', setName: '甜蜜任务', emoji: '💭', color: '#B3D4FF' },
  { cardId: 'card_005', title: '同步看一部电影', description: '选一部电影，同时按下播放键，边看边聊', rarity: 3, setId: 'set_sweet_tasks', setName: '甜蜜任务', emoji: '🎬', color: '#D4B3FF' },
  { cardId: 'card_006', title: '视频通话30分钟', description: '放下手头的事，好好看看TA，聊聊天', rarity: 4, setId: 'set_sweet_tasks', setName: '甜蜜任务', emoji: '📞', color: '#FFD700' },

  // 套系2：真心话
  { cardId: 'card_007', title: 'TA最让你心动的瞬间', description: '回忆并告诉TA，哪个瞬间让你确定就是TA了', rarity: 1, setId: 'set_truth', setName: '真心话', emoji: '💗', color: '#FFB3BF' },
  { cardId: 'card_008', title: '分享今天发生的一件小事', description: '再小的事也值得分享，因为TA想了解你的一切', rarity: 1, setId: 'set_truth', setName: '真心话', emoji: '📝', color: '#FFB3BF' },
  { cardId: 'card_009', title: '你最喜欢TA的哪个特点', description: '认真地告诉TA，你最喜欢TA身上什么', rarity: 2, setId: 'set_truth', setName: '真心话', emoji: '💝', color: '#B3D4FF' },
  { cardId: 'card_010', title: '说说你最近的一个小愿望', description: '分享你的愿望，说不定TA会帮你实现呢', rarity: 2, setId: 'set_truth', setName: '真心话', emoji: '⭐', color: '#B3D4FF' },
  { cardId: 'card_011', title: '分享一个秘密回忆', description: '只有你们两个人知道的专属回忆，重温一下', rarity: 3, setId: 'set_truth', setName: '真心话', emoji: '🔒', color: '#D4B3FF' },
  { cardId: 'card_012', title: '写一封小情书', description: '用心写一段话给TA，不需要很长，但要认真', rarity: 4, setId: 'set_truth', setName: '真心话', emoji: '✉️', color: '#FFD700' },

  // 套系3：惊喜时刻
  { cardId: 'card_013', title: '给对方点一杯奶茶', description: '远程点一杯TA喜欢的奶茶，附上暖心备注', rarity: 1, setId: 'set_surprise', setName: '惊喜时刻', emoji: '🧋', color: '#FFB3BF' },
  { cardId: 'card_014', title: '发一张搞笑表情包', description: '找一个能让TA笑出来的表情包发过去', rarity: 1, setId: 'set_surprise', setName: '惊喜时刻', emoji: '😂', color: '#FFB3BF' },
  { cardId: 'card_015', title: '用TA的名字唱一句歌', description: '随便哼一句，把TA的名字编进去，好不好听不重要', rarity: 2, setId: 'set_surprise', setName: '惊喜时刻', emoji: '🎶', color: '#B3D4FF' },
  { cardId: 'card_016', title: '画一张简笔画发给TA', description: '不用画得好，心意最重要！画个小人、小动物都行', rarity: 2, setId: 'set_surprise', setName: '惊喜时刻', emoji: '✏️', color: '#B3D4FF' },
  { cardId: 'card_017', title: '给对方点一份外卖', description: '给TA一个惊喜，帮TA解决一顿饭', rarity: 3, setId: 'set_surprise', setName: '惊喜时刻', emoji: '🍕', color: '#D4B3FF' },
  { cardId: 'card_018', title: '录一段哄睡语音', description: '录一段温柔的话，让TA听着你的声音入睡', rarity: 4, setId: 'set_surprise', setName: '惊喜时刻', emoji: '🌙', color: '#FFD700' },

  // 套系4：未来约定
  { cardId: 'card_019', title: '下次见面最想做的事', description: '告诉TA，下次见面你最想和TA一起做什么', rarity: 1, setId: 'set_future', setName: '未来约定', emoji: '🤗', color: '#FFB3BF' },
  { cardId: 'card_020', title: '一起规划一次旅行', description: '找一个都想去的地方，一起做攻略', rarity: 1, setId: 'set_future', setName: '未来约定', emoji: '✈️', color: '#FFB3BF' },
  { cardId: 'card_021', title: '约定一个专属暗号', description: '创造一个只有你们懂的暗号，以后聊天用', rarity: 2, setId: 'set_future', setName: '未来约定', emoji: '🤫', color: '#B3D4FF' },
  { cardId: 'card_022', title: '一起存钱买一样东西', description: '设定一个共同目标，一起为它努力', rarity: 2, setId: 'set_future', setName: '未来约定', emoji: '💰', color: '#B3D4FF' },
  { cardId: 'card_023', title: '写给一年后的TA', description: '写下你想对一年后的TA说的话，明年今日再看', rarity: 3, setId: 'set_future', setName: '未来约定', emoji: '✍️', color: '#D4B3FF' },
  { cardId: 'card_024', title: '一起在线看日出/日落', description: '打开视频，一起看一次日出或日落，哪怕隔着屏幕', rarity: 4, setId: 'set_future', setName: '未来约定', emoji: '🌅', color: '#FFD700' },
];

/**
 * 获取所有卡片定义
 * @returns {Array} 卡片数组
 */
function getGachaCards() {
  return GACHA_CARDS;
}

/**
 * 获取卡片套系列表
 * @returns {Array} [{ setId, setName, emoji, color }]
 */
function getGachaSets() {
  var sets = [];
  var seen = {};
  GACHA_CARDS.forEach(function (card) {
    if (!seen[card.setId]) {
      seen[card.setId] = true;
      sets.push({ setId: card.setId, setName: card.setName, emoji: card.emoji, color: card.color });
    }
  });
  return sets;
}

/**
 * 扭蛋抽卡 - 根据稀有度权重随机抽取
 * 稀有度：1=普通(55%), 2=稀有(25%), 3=史诗(15%), 4=传说(5%)
 * @returns {object} 抽到的卡片对象
 */
function drawGachaCard() {
  var rand = Math.random() * 100;
  var rarity;
  if (rand < 5)      rarity = 4;   // 传说 5%
  else if (rand < 20) rarity = 3;  // 史诗 15%
  else if (rand < 45) rarity = 2;  // 稀有 25%
  else                rarity = 1;  // 普通 55%

  // 从该稀有度中随机选一张
  var pool = GACHA_CARDS.filter(function (c) { return c.rarity === rarity; });
  var idx = Math.floor(Math.random() * pool.length);
  return pool[idx];
}

/**
 * 获取稀有度配置
 * @param {number} rarity - 稀有度 1-4
 * @returns {object} { label, color, glowColor }
 */
function getRarityConfig(rarity) {
  var configs = {
    1: { label: '普通', color: '#B0B0B0', glowColor: 'rgba(176,176,176,0.3)' },
    2: { label: '稀有', color: '#4A90D9', glowColor: 'rgba(74,144,217,0.4)' },
    3: { label: '史诗', color: '#9B59B6', glowColor: 'rgba(155,89,182,0.5)' },
    4: { label: '传说', color: '#FFD700', glowColor: 'rgba(255,215,0,0.6)' },
  };
  return configs[rarity] || configs[1];
}

/**
 * 分页取出集合中符合条件的全部记录
 * 云数据库 .get() 默认只返 20 条，数据多了会丢，此函数循环分页取全部
 * @param {object} db - wx.cloud.database() 实例
 * @param {string} coll - 集合名
 * @param {object} where - 查询条件
 * @param {string} [orderField] - 排序字段（可选）
 * @param {string} [orderDir='asc'] - 排序方向
 * @returns {Promise<Array>} 全部记录数组
 */
async function fetchAll(db, coll, where, orderField, orderDir) {
  var all = [];
  var pageSize = 20;
  var skip = 0;
  while (true) {
    var q = db.collection(coll).where(where);
    if (orderField) q = q.orderBy(orderField, orderDir || 'asc');
    var res = await q.skip(skip).limit(pageSize).get();
    all = all.concat(res.data);
    if (res.data.length < pageSize) break;
    skip += pageSize;
    if (skip > 1000) break; // 安全上限，避免异常死循环
  }
  return all;
}

/**
 * 分页删除集合中符合条件的全部记录
 * where().remove() 单次最多删 20 条，数据多了会漏删，此函数先分页取全部再逐条 doc.remove
 * @param {object} db - wx.cloud.database() 实例
 * @param {string} coll - 集合名
 * @param {object} where - 查询条件
 * @returns {Promise<number>} 实际删除条数
 */
async function removeAll(db, coll, where) {
  var all = await fetchAll(db, coll, where);
  for (var i = 0; i < all.length; i++) {
    await db.collection(coll).doc(all[i]._id).remove();
  }
  return all.length;
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
  getTreeStage,
  getTreeProgress,
  getGachaCards,
  getGachaSets,
  drawGachaCard,
  getRarityConfig,
  fetchAll,
  removeAll,
};