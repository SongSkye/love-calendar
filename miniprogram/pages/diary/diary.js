/**
 * 日记列表页 - 支持搜索过滤，性能优化版
 */
const app = getApp();

// 页面级缓存：避免重复查询
var userMapCache = null;    // 用户昵称+头像缓存
var cacheCoupleId = null;   // 缓存对应的 coupleId

Page({
  data: {
    diaries: [],
    page: 1,
    hasMore: true,
    loading: false,
    showDetail: false,
    detailDiary: {},
    keyword: '',
    firstLoad: true,        // 是否首次加载
  },

  onLoad() {
    this._searchTimer = null;
    this.loadDiaries();
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

    // 如果 coupleId 变化了（比如解绑后重新绑定），清除缓存
    if (cacheCoupleId !== app.globalData.coupleId) {
      userMapCache = null;
      cacheCoupleId = app.globalData.coupleId;
      this.setData({ page: 1, diaries: [], hasMore: true, firstLoad: true });
      this.loadDiaries();
    } else if (this.data.firstLoad) {
      // 首次加载
      this.loadDiaries();
    }
    // 非首次且 coupleId 没变 -> 不重新加载，使用已有数据
    this.setData({ firstLoad: false });
  },

  /**
   * 获取用户信息映射（带缓存，只查一次）
   * 注意：小程序 <image> 原生支持 cloud:// 路径，无需转换
   */
  async getUserMap() {
    var coupleId = app.globalData.coupleId;
    if (userMapCache && cacheCoupleId === coupleId) {
      return userMapCache;
    }

    var db = app.getDb();
    var userRes = await db.collection('users').where({ coupleId: coupleId }).get();

    var map = {};
    userRes.data.forEach(function (u) {
      var entry = { nickname: u.nickname, role: u.role, avatar: u.avatar || '' };
      if (u.openid) map[u.openid] = entry;
      if (u.uid) map[u.uid] = entry;
    });

    userMapCache = map;
    cacheCoupleId = coupleId;
    return map;
  },

  /**
   * 清除用户缓存（对方加入/修改昵称后调用）
   */
  clearUserCache: function () {
    userMapCache = null;
  },

  /**
   * 搜索输入（300ms 防抖）
   */
  onSearchInput(e) {
    var keyword = e.detail.value;
    this.setData({ keyword: keyword });

    if (this._searchTimer) {
      clearTimeout(this._searchTimer);
    }

    var that = this;
    this._searchTimer = setTimeout(function () {
      that.setData({ page: 1, diaries: [], hasMore: true });
      that.loadDiaries();
    }, 300);
  },

  /**
   * 清除搜索
   */
  clearSearch() {
    this.setData({ keyword: '', page: 1, diaries: [], hasMore: true });
    this.loadDiaries();
  },

  /**
   * 加载日记列表
   */
  async loadDiaries() {
    if (this.data.loading || !this.data.hasMore) return;
    this.setData({ loading: true });
    var db = app.getDb();
    var coupleId = app.globalData.coupleId;
    var pageSize = 20;
    var skip = (this.data.page - 1) * pageSize;
    var _ = app._;
    var keyword = this.data.keyword.trim();

    try {
      var userMap = await this.getUserMap();
      var myUid = app.getUserId();

      if (keyword) {
        // 搜索模式：用正则搜索（标题或内容），后端分页
        var regexp = db.RegExp({ regexp: keyword, options: 'i' });

        // 并行查询标题和内容匹配
        var [titleRes, contentRes] = await Promise.all([
          db.collection('diaries')
            .where({ coupleId: coupleId, title: regexp })
            .orderBy('date', 'desc')
            .orderBy('createdAt', 'desc')
            .get(),
          db.collection('diaries')
            .where({ coupleId: coupleId, content: regexp })
            .orderBy('date', 'desc')
            .orderBy('createdAt', 'desc')
            .get()
        ]);

        // 合并去重
        var seen = {};
        var allData = [];
        titleRes.data.forEach(function (item) {
          if (!seen[item._id]) { seen[item._id] = true; allData.push(item); }
        });
        contentRes.data.forEach(function (item) {
          if (!seen[item._id]) { seen[item._id] = true; allData.push(item); }
        });

        // 排序
        allData.sort(function (a, b) {
          if (a.date !== b.date) return b.date.localeCompare(a.date);
          return b.createdAt.localeCompare(a.createdAt);
        });

        var total = allData.length;
        var pageData = allData.slice(skip, skip + pageSize);

        var diaries = pageData.map(function (item) {
          var u = userMap[item.uid] || { nickname: '未知', role: 'unknown', avatar: '' };
          return {
            ...item,
            nickname: u.nickname,
            role: u.role,
            avatar: u.avatar || '',
            isMine: item.uid === myUid,
          };
        });

        this.setData({
          diaries: this.data.page === 1 ? diaries : this.data.diaries.concat(diaries),
          hasMore: skip + pageSize < total,
          page: this.data.page + 1,
        });
      } else {
        // 普通模式：正常分页，只查一次 count
        var [countRes, res] = await Promise.all([
          db.collection('diaries').where({ coupleId: coupleId }).count(),
          db.collection('diaries')
            .where({ coupleId: coupleId })
            .orderBy('date', 'desc')
            .orderBy('createdAt', 'desc')
            .skip(skip)
            .limit(pageSize)
            .get()
        ]);

        var diaries = res.data.map(function (item) {
          var u = userMap[item.uid] || { nickname: '未知', role: 'unknown', avatar: '' };
          return {
            ...item,
            nickname: u.nickname,
            role: u.role,
            avatar: u.avatar || '',
            isMine: item.uid === myUid,
          };
        });

        this.setData({
          diaries: this.data.page === 1 ? diaries : this.data.diaries.concat(diaries),
          hasMore: skip + pageSize < countRes.total,
          page: this.data.page + 1,
        });
      }
    } catch (err) {
      console.error('加载日记失败:', err);
    } finally {
      this.setData({ loading: false });
    }
  },

  loadMore() { this.loadDiaries(); },

  addDiary() {
    wx.navigateTo({ url: '/pages/diary-edit/diary-edit' });
  },

  editDiary(e) {
    wx.navigateTo({ url: '/pages/diary-edit/diary-edit?id=' + e.currentTarget.dataset.id });
  },

  async viewDetail(e) {
    var db = app.getDb();
    var id = e.currentTarget.dataset.id;
    try {
      var res = await db.collection('diaries').doc(id).get();
      if (res.data) {
        var diary = res.data;
        var myUid = app.getUserId();

        // 优先使用缓存的用户信息，避免重复查库
        var userInfo = userMapCache && userMapCache[diary.uid]
          ? userMapCache[diary.uid]
          : null;

        if (!userInfo) {
          // 缓存未命中时才查库
          var _ = app._;
          var userRes = await db.collection('users').where(
            _.or([{ openid: diary.uid }, { uid: diary.uid }])
          ).get();
          userInfo = userRes.data.length > 0
            ? { nickname: userRes.data[0].nickname, role: userRes.data[0].role, avatar: userRes.data[0].avatar || '' }
            : { nickname: '未知', role: 'unknown', avatar: '' };
        }

        this.setData({
          showDetail: true,
          detailDiary: {
            ...diary,
            nickname: userInfo.nickname,
            role: userInfo.role,
            avatar: userInfo.avatar,
            isMine: diary.uid === myUid,
          },
        });
      }
    } catch (err) {
      console.error(err);
    }
  },

  closeDetail() { this.setData({ showDetail: false }); },

  editDiaryFromDetail() {
    var id = this.data.detailDiary._id;
    this.setData({ showDetail: false });
    wx.navigateTo({ url: '/pages/diary-edit/diary-edit?id=' + id });
  },

  /**
   * 统一的删除逻辑
   */
  _doDeleteDiary(id, closeDetail) {
    var that = this;
    if (closeDetail) this.setData({ showDetail: false });

    wx.showModal({
      title: '删除确认',
      content: '确定要删除这篇日记吗？',
      success: async function (res) {
        if (!res.confirm) return;
        try {
          var diaryRes = await app.getDb().collection('diaries').doc(id).get();
          if (diaryRes.data && diaryRes.data.images && diaryRes.data.images.length > 0) {
            wx.cloud.deleteFile({ fileList: diaryRes.data.images }).catch(function () {});
          }
          await app.getDb().collection('diaries').doc(id).remove();
          wx.showToast({ title: '已删除', icon: 'success' });
          userMapCache = null;
          that.setData({ page: 1, diaries: [], hasMore: true });
          that.loadDiaries();
        } catch (err) {
          wx.showToast({ title: '删除失败', icon: 'none' });
        }
      }
    });
  },

  deleteDiary(e) {
    this._doDeleteDiary(e.currentTarget.dataset.id);
  },

  deleteDiaryFromDetail() {
    this._doDeleteDiary(this.data.detailDiary._id, true);
  },

  previewImage(e) {
    var url = e.currentTarget.dataset.url;
    var urls = e.currentTarget.dataset.urls;
    wx.previewImage({ current: url, urls: urls });
  },

  noop() {},
  onShareAppMessage() {
    return { title: '恋爱日历 - 记录属于我们的每一天 💕', path: '/pages/welcome/welcome' };
  },
});