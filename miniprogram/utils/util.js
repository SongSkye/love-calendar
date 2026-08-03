/**
 * 恋爱日历 - 工具函数
 * 日期格式化、倒计时计算、邀请码生成等
 */

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
 * 通过云函数调用（有 admin 权限），绕过免费版存储权限限制
 * 注意：直接调用 wx.cloud.getTempFileURL 受存储权限限制，非上传者无法获取
 * @param {Array<string>} fileIds - cloud:// 格式的 fileID 数组
 * @returns {Promise<Object>} fileID -> tempFileURL 的映射对象
 */
async function convertCloudFileIDs(fileIds) {
  if (!fileIds || fileIds.length === 0) return {};
  try {
    // 通过云函数获取临时链接（云函数有 admin 权限，不受存储权限限制）
    const res = await wx.cloud.callFunction({
      name: 'getTempUrls',
      data: { fileList: fileIds },
    });
    if (res.result && res.result.success && res.result.data) {
      const map = {};
      res.result.data.forEach(function (f) {
        if (f.tempFileURL) {
          map[f.fileID] = f.tempFileURL;
        }
      });
      return map;
    }
    console.warn('云函数转换临时链接失败，尝试直接调用:', res.result);
    // 云函数失败时，降级为直接调用（至少上传者自己的图片能显示）
    const directRes = await wx.cloud.getTempFileURL({ fileList: fileIds });
    const map = {};
    directRes.fileList.forEach(function (f) {
      if (f.tempFileURL) {
        map[f.fileID] = f.tempFileURL;
      }
    });
    return map;
  } catch (e) {
    console.warn('转换云存储临时链接失败:', e);
    return {};
  }
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
  buildAnniversaryDateMap,
  getTodayAnniversary,
  MOOD_MAP,
};