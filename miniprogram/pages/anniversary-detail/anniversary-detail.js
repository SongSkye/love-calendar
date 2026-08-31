/**
 * 纪念日详情页 - 历史今日
 */
const util = require('../../utils/util');
const app = getApp();

/**
 * 生成从纪念日年份到当前年份的年份列表
 * @param {string} dateStr - 纪念日日期 "YYYY-MM-DD"
 * @returns {Array<{year: number, hasRecord: boolean}>} 年份状态数组
 */
function buildYearList(dateStr, records) {
  var startYear = new Date(dateStr).getFullYear();
  var currentYear = new Date().getFullYear();
  var recordYearSet = {};
  records.forEach(function (r) { recordYearSet[r.year] = true; });

  var years = [];
  for (var y = currentYear; y >= startYear; y--) {
    years.push({ year: y, hasRecord: !!recordYearSet[y] });
  }
  return years;
}

Page({
  data: {
    anniversaryId: '',
    anniversary: {},
    records: [],
    yearList: [],           // 所有年份及有无记录的状态
    loading: true,
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ anniversaryId: options.id });
    }
  },

  onShow() {
    this.loadDetail();
  },

  /**
   * 加载纪念日详情和历史记录
   */
  async loadDetail() {
    var db = app.getDb();
    var id = this.data.anniversaryId;
    if (!id) return;

    this.setData({ loading: true });

    try {
      // 获取纪念日信息
      var anniRes = await db.collection('anniversaries').doc(id).get();
      var anniversary = anniRes.data;
      if (!anniversary) {
        wx.showToast({ title: '纪念日不存在', icon: 'none' });
        wx.navigateBack();
        return;
      }

      var today = new Date();
      today.setHours(0, 0, 0, 0);
      var d = new Date(anniversary.date);
      var totalDiffTime = today.getTime() - d.getTime();
      var totalDays = Math.floor(totalDiffTime / (1000 * 60 * 60 * 24));

      var enriched = {
        ...anniversary,
        totalDays: totalDays >= 0 ? totalDays : 0,
        isToday: d.getMonth() === today.getMonth() && d.getDate() === today.getDate(),
      };
      this.setData({ anniversary: enriched });

      // 封面图转临时链接
      // 保留原始 cloud:// fileID，删除纪念日时 deleteFile 只认 cloud:// ID，
      // 转成 https 临时链接后就删不掉云存储原文件了
      if (enriched.coverImage && enriched.coverImage.indexOf('cloud://') === 0) {
        enriched.coverFileId = enriched.coverImage;
        util.convertCloudFileIDs([enriched.coverImage]).then(function (urlMap) {
          if (urlMap[enriched.coverImage]) {
            enriched.coverImage = urlMap[enriched.coverImage];
            this.setData({ anniversary: enriched });
          }
        }.bind(this));
      }

      // 获取历史记录
      var recordsRes = await db.collection('anniversary_records')
        .where({ anniversaryId: id })
        .orderBy('year', 'desc')
        .get();

      // 获取用户昵称
      var userRes = await db.collection('users')
        .where({ coupleId: anniversary.coupleId })
        .get();
      var userMap = {};
      userRes.data.forEach(function (u) {
        var entry = { nickname: u.nickname };
        if (u.openid) userMap[u.openid] = entry;
        if (u.uid) userMap[u.uid] = entry;  // 兼容旧数据
        if (u._openid) userMap[u._openid] = entry;
      });

      var records = recordsRes.data.map(function (item) {
        return {
          ...item,
          nickname: userMap[item.uid] ? userMap[item.uid].nickname : '未知',
        };
      });

      // 构建年份列表（含是否有记录的状态）
      var yearList = buildYearList(anniversary.date, records);

      this.setData({ records: records, yearList: yearList });

      // 历史记录中的图片转临时链接
      var allImages = [];
      records.forEach(function (item) {
        if (item.images && item.images.length > 0) {
          item.images.forEach(function (img) {
            if (img.indexOf('cloud://') === 0) {
              allImages.push(img);
            }
          });
        }
      });
      if (allImages.length > 0) {
        util.convertCloudFileIDs(allImages).then(function (urlMap) {
          records.forEach(function (item) {
            if (item.images) {
              item.images = item.images.map(function (img) {
                return urlMap[img] || img;
              });
            }
          });
          this.setData({ records: records });
        }.bind(this));
      }

    } catch (err) {
      console.error('加载详情失败:', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  /**
   * 编辑纪念日
   */
  editAnniversary() {
    wx.navigateTo({ url: '/pages/anniversary-record/anniversary-record?id=' + this.data.anniversaryId });
  },

  /**
   * 记录某个年份（跳转到记录页，带年份参数）
   */
  recordYear(e) {
    var year = e.currentTarget.dataset.year;
    wx.navigateTo({ url: '/pages/anniversary-record/anniversary-record?id=' + this.data.anniversaryId + '&record=1&year=' + year });
  },

  /**
   * 记录今年（快捷入口）
   */
  recordToday() {
    var currentYear = new Date().getFullYear();
    wx.navigateTo({ url: '/pages/anniversary-record/anniversary-record?id=' + this.data.anniversaryId + '&record=1&year=' + currentYear });
  },

  /**
   * 删除纪念日
   */
  deleteAnniversary() {
    var that = this;
    wx.showModal({
      title: '删除确认',
      content: '确定删除「' + that.data.anniversary.title + '」吗？所有历史记录也会被删除。',
      success: async function (res) {
        if (res.confirm) {
          try {
            var db = app.getDb();
            var id = that.data.anniversaryId;
            // 删除封面图：优先用原始 cloud:// fileID（deleteFile 只认这个，
            // coverImage 已被转成 https 临时链接，删不掉云存储原文件）
            var coverFileId = that.data.anniversary.coverFileId;
            if (coverFileId) {
              wx.cloud.deleteFile({ fileList: [coverFileId] }).catch(function () {});
            }
            // 删除历史记录中的图片
            var recordsRes = await db.collection('anniversary_records').where({ anniversaryId: id }).get();
            recordsRes.data.forEach(function (item) {
              if (item.images && item.images.length > 0) {
                wx.cloud.deleteFile({ fileList: item.images }).catch(function () {});
              }
            });
            // 删除记录和纪念日
            await db.collection('anniversary_records').where({ anniversaryId: id }).remove();
            await db.collection('anniversaries').doc(id).remove();
            // 清除纪念日缓存，确保日历页和列表页重新加载
            app.globalData.anniversariesCache = null;
            wx.showToast({ title: '已删除', icon: 'success' });
            setTimeout(function () { wx.navigateBack(); }, 1500);
          } catch (err) {
            wx.showToast({ title: '删除失败', icon: 'none' });
          }
        }
      }
    });
  },

  previewImage(e) {
    var url = e.currentTarget.dataset.url;
    var urls = e.currentTarget.dataset.urls;
    util.previewImage(urls, urls.indexOf(url));
  },

  onShareAppMessage() {
    return { title: '恋爱日历 - 记录属于我们的每一天 💕', path: '/pages/welcome/welcome' };
  },
});