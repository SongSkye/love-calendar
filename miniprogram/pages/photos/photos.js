/**
 * 照片墙页面 - 聚合浏览心情和日记中的照片
 * 从 moods 和 diaries 两张表中提取带图片的记录，按日期倒序展示
 */
const util = require('../../utils/util');
const app = getApp();

Page({
  data: {
    groupedPhotos: [],   // 按日期分组 [{date, label, photos: [{id, url, source, sourceId, note, userNickname}]}]
    loading: false,
    hasMore: true,
    allPhotos: [],       // 全量照片（用于预览时传入所有 url）
  },

  onLoad() {
    this.loadPhotos();
  },

  onShow() {
    if (!app.globalData.openidReady) {
      var that = this;
      setTimeout(function () { that.onShow(); }, 300);
      return;
    }
    if (!app.globalData.isBound) {
      app.checkBindStatus().then(function (bound) {
        if (!bound) { wx.reLaunch({ url: '/pages/welcome/welcome' }); }
      });
      return;
    }
  },

  /**
   * 获取用户昵称映射
   */
  async getUserMap() {
    var coupleId = app.globalData.coupleId;
    var db = app.getDb();
    var userRes = await db.collection('users').where({ coupleId: coupleId }).get();
    var map = {};
    userRes.data.forEach(function (u) {
      var entry = { nickname: u.nickname, role: u.role };
      if (u.openid) map[u.openid] = entry;
      if (u.uid) map[u.uid] = entry;
      if (u._openid) map[u._openid] = entry;
    });
    return map;
  },

  /**
   * 加载聚合照片数据
   * 从 moods 和 diaries 中提取有图片的记录，按日期分组
   */
  async loadPhotos() {
    if (this.data.loading) return;
    this.setData({ loading: true });

    var db = app.getDb();
    var coupleId = app.globalData.coupleId;

    try {
      // 并查查询 moods 和 diaries
      var moodRes = await db.collection('moods')
        .where({ coupleId: coupleId })
        .orderBy('date', 'desc')
        .limit(100)
        .get();
      var diaryRes = await db.collection('diaries')
        .where({ coupleId: coupleId })
        .orderBy('date', 'desc')
        .limit(100)
        .get();

      var userMap = await this.getUserMap();

      // 提取所有照片
      var photos = [];
      var allCloudFileIds = [];

      moodRes.data.forEach(function (item) {
        if (item.images && item.images.length > 0) {
          var user = userMap[item.uid] || { nickname: '未知' };
          item.images.forEach(function (img, idx) {
            if (img.indexOf('cloud://') === 0) {
              allCloudFileIds.push(img);
            }
            photos.push({
              id: 'mood_' + item._id + '_' + idx,
              url: img,
              date: item.date,
              source: 'mood',
              sourceId: item._id,
              note: item.note || '',
              userNickname: user.nickname,
            });
          });
        }
      });

      diaryRes.data.forEach(function (item) {
        if (item.images && item.images.length > 0) {
          var user = userMap[item.uid] || { nickname: '未知' };
          item.images.forEach(function (img, idx) {
            if (img.indexOf('cloud://') === 0) {
              allCloudFileIds.push(img);
            }
            photos.push({
              id: 'diary_' + item._id + '_' + idx,
              url: img,
              date: item.date,
              source: 'diary',
              sourceId: item._id,
              note: (item.content || item.title || '').substring(0, 50),
              userNickname: user.nickname,
            });
          });
        }
      });

      // 按日期倒序排列
      photos.sort(function (a, b) {
        return b.date.localeCompare(a.date);
      });

      // 批量转换 cloud:// 为临时链接（分批次，每批最多 50 个）
      if (allCloudFileIds.length > 0) {
        var urlMap = {};
        for (var i = 0; i < allCloudFileIds.length; i += 50) {
          var batch = allCloudFileIds.slice(i, i + 50);
          var batchMap = await util.convertCloudFileIDs(batch);
          Object.keys(batchMap).forEach(function (k) {
            urlMap[k] = batchMap[k];
          });
        }
        photos.forEach(function (p) {
          if (urlMap[p.url]) {
            p.url = urlMap[p.url];
          }
        });
      }

      // 按日期分组
      var grouped = this.groupByDate(photos);

      this.setData({
        groupedPhotos: grouped,
        allPhotos: photos,
        hasMore: false,
      });
    } catch (err) {
      console.error('加载照片失败:', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  /**
   * 按日期分组，并生成日期标签
   */
  groupByDate(photos) {
    var map = {};
    photos.forEach(function (p) {
      if (!map[p.date]) map[p.date] = [];
      map[p.date].push(p);
    });

    return Object.keys(map).sort(function (a, b) {
      return b.localeCompare(a);
    }).map(function (date) {
      var label = util.formatRelativeDate(date);
      return {
        date: date,
        label: label,
        photos: map[date],
      };
    });
  },

  /**
   * 点击照片预览大图
   */
  previewPhoto(e) {
    var url = e.currentTarget.dataset.url;
    var urls = this.data.allPhotos.map(function (p) { return p.url; });
    util.previewImage(urls, urls.indexOf(url));
  },

  onShareAppMessage() {
    return { title: '恋爱日历 - 记录属于我们的每一天 💕', path: '/pages/welcome/welcome' };
  },
});