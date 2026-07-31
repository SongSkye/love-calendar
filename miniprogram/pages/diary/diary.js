/**
 * 日记列表页 - 支持搜索过滤，性能优化版，含评论功能
 */
const util = require('../../utils/util');
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

    // 评论相关
    expandedComments: {},   // 展开的评论 { diaryId: true }
    commentsMap: {},        // 评论数据 { diaryId: [comments] }
    commentLoading: {},     // 评论加载状态 { diaryId: true }
    commentText: {},        // 评论输入框内容 { diaryId: 'xxx' }
    submittingComment: {},  // 提交状态 { diaryId: true }
    newCommentDiaries: {},  // 有新评论的日记 { diaryId: true }
    detailComments: [],     // 详情弹窗的评论
    detailCommentText: '',  // 详情弹窗的评论输入
    detailCommentExpanded: false,
    detailCommentLoading: false,
    detailSubmittingComment: false,
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
      this.setData({ page: 1, diaries: [], hasMore: true, firstLoad: true, commentsMap: {}, expandedComments: {} });
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
   * 头像 cloud:// 需转临时链接，否则对方看不到
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
      if (u._openid) map[u._openid] = entry;
    });

    // 转换 cloud:// 头像为临时链接（跨用户访问必须）
    var cloudAvatars = userRes.data
      .filter(function (u) { return u.avatar && u.avatar.indexOf('cloud://') === 0; })
      .map(function (u) { return u.avatar; });

    if (cloudAvatars.length > 0) {
      try {
        var urlMap = await util.convertCloudFileIDs(cloudAvatars);
        // 更新 map 中所有引用该头像的 entry
        Object.keys(map).forEach(function (key) {
          if (map[key].avatar && urlMap[map[key].avatar]) {
            map[key].avatar = urlMap[map[key].avatar];
          }
        });
      } catch (e) {
        console.warn('转换头像临时链接失败:', e);
      }
    }

    userMapCache = map;
    cacheCoupleId = coupleId;
    return map;
  },

  /**
   * 清除用户缓存（对方加入/修改昵称后调用）
   * 同时标记需要刷新，确保 onShow 时重新加载数据
   */
  clearUserCache: function () {
    userMapCache = null;
    this.setData({ firstLoad: true });
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
      that.setData({ page: 1, diaries: [], hasMore: true, commentsMap: {}, expandedComments: {} });
      that.loadDiaries();
    }, 300);
  },

  /**
   * 清除搜索
   */
  clearSearch() {
    this.setData({ keyword: '', page: 1, diaries: [], hasMore: true, commentsMap: {}, expandedComments: {} });
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
          // 优先用系统注入的 _openid 匹配（最可靠），兼容历史 uid/openid 字段
          var u = userMap[item._openid] || userMap[item.uid] || userMap[item.openid] || { nickname: '未知', role: 'unknown', avatar: '' };
          return {
            ...item,
            nickname: u.nickname,
            role: u.role,
            avatar: u.avatar || '',
            isMine: (item.uid === myUid) || (item.openid === myUid) || (item._openid === myUid),
          };
        });

        this.setData({
          diaries: this.data.page === 1 ? diaries : this.data.diaries.concat(diaries),
          hasMore: skip + pageSize < total,
          page: this.data.page + 1,
        });

        // 批量加载评论
        this.loadCommentsBatch(diaries);
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
          // 优先用系统注入的 _openid 匹配（最可靠），兼容历史 uid/openid 字段
          var u = userMap[item._openid] || userMap[item.uid] || userMap[item.openid] || { nickname: '未知', role: 'unknown', avatar: '' };
          return {
            ...item,
            nickname: u.nickname,
            role: u.role,
            avatar: u.avatar || '',
            isMine: (item.uid === myUid) || (item.openid === myUid) || (item._openid === myUid),
          };
        });

        this.setData({
          diaries: this.data.page === 1 ? diaries : this.data.diaries.concat(diaries),
          hasMore: skip + pageSize < countRes.total,
          page: this.data.page + 1,
        });

        // 批量加载评论
        this.loadCommentsBatch(diaries);
      }
    } catch (err) {
      console.error('加载日记失败:', err);
    } finally {
      this.setData({ loading: false });
    }
  },

  /**
   * 批量加载评论并检查新评论
   * @param {Array} diaries - 日记列表
   */
  async loadCommentsBatch(diaries) {
    if (!diaries || diaries.length === 0) return;
    var db = app.getDb();
    var _ = app._;
    var diaryIds = diaries.map(function (d) { return d._id; });

    try {
      // 一次查询所有相关评论
      var commentRes = await db.collection('comments')
        .where({ diaryId: _.in(diaryIds) })
        .orderBy('createdAt', 'asc')
        .get();

      var myUid = app.getUserId();
      var userMap = userMapCache || await this.getUserMap();

      // 按 diaryId 分组，附带用户信息
      var map = this.data.commentsMap || {};
      diaryIds.forEach(function (id) { if (!map[id]) map[id] = []; });
      commentRes.data.forEach(function (c) {
        if (map[c.diaryId]) {
          // 优先用系统注入的 _openid 匹配，兼容历史 uid/openid 字段
          var commentUserId = c._openid || c.uid || c.openid;
          var u = userMap[commentUserId] || { nickname: '未知', role: '', avatar: '' };
          map[c.diaryId].push({
            ...c,
            nickname: u.nickname,
            avatar: u.avatar || '',
            isMine: commentUserId === myUid,
          });
        }
      });

      // 检查新评论
      var newCommentDiaries = this.data.newCommentDiaries || {};
      var lastReadTime = wx.getStorageSync('lastCommentReadTime') || '';

      commentRes.data.forEach(function (c) {
        var commentUserId = c.uid || c.openid;
        if (commentUserId !== myUid && c.createdAt > lastReadTime) {
          newCommentDiaries[c.diaryId] = true;
        }
      });

      this.setData({
        commentsMap: map,
        newCommentDiaries: newCommentDiaries,
      });
    } catch (err) {
      console.error('加载评论失败:', err);
    }
  },

  /**
   * 展开/收起评论区
   */
  toggleComments(e) {
    var diaryId = e.currentTarget.dataset.id;
    var expanded = this.data.expandedComments || {};
    var newCommentDiaries = this.data.newCommentDiaries || {};

    if (expanded[diaryId]) {
      // 收起
      expanded[diaryId] = false;
    } else {
      // 展开 -> 标记为已读，清除新评论标记
      expanded[diaryId] = true;
      newCommentDiaries[diaryId] = false;
      // 更新最后阅读时间
      wx.setStorageSync('lastCommentReadTime', new Date().toISOString());
    }

    this.setData({
      expandedComments: expanded,
      newCommentDiaries: newCommentDiaries,
    });
  },

  /**
   * 评论输入框内容变化
   */
  onCommentInput(e) {
    var diaryId = e.currentTarget.dataset.id;
    var commentText = this.data.commentText || {};
    commentText[diaryId] = e.detail.value;
    this.setData({ commentText: commentText });
  },

  /**
   * 提交评论
   */
  async submitComment(e) {
    var diaryId = e.currentTarget.dataset.id;
    var commentText = this.data.commentText || {};
    var content = (commentText[diaryId] || '').trim();
    if (!content) {
      wx.showToast({ title: '请输入评论内容', icon: 'none' });
      return;
    }

    var submitting = this.data.submittingComment || {};
    if (submitting[diaryId]) return;
    submitting[diaryId] = true;
    this.setData({ submittingComment: submitting });

    var db = app.getDb();
    var coupleId = app.globalData.coupleId;
    var myUid = app.getUserId();
    var now = new Date().toISOString();

    try {
      // 写入评论
      var addRes = await db.collection('comments').add({
        data: {
          diaryId: diaryId,
          coupleId: coupleId,
          uid: myUid,
          content: content,
          createdAt: now,
        }
      });

      // 更新日记的 commentCount
      try {
        var diaryRes = await db.collection('diaries').doc(diaryId).get();
        var currentCount = diaryRes.data.commentCount || 0;
        await db.collection('diaries').doc(diaryId).update({
          data: { commentCount: currentCount + 1 }
        });
      } catch (e) {
        // 更新计数失败不影响评论本身
        console.warn('更新 commentCount 失败:', e);
      }

      // 更新本地评论列表
      var userMap = userMapCache || await this.getUserMap();
      var u = userMap[myUid] || { nickname: '我', role: '', avatar: '' };
      var newComment = {
        _id: addRes._id,
        diaryId: diaryId,
        uid: myUid,
        content: content,
        createdAt: now,
        nickname: u.nickname,
        avatar: u.avatar || '',
        isMine: true,
      };

      var commentsMap = this.data.commentsMap || {};
      if (!commentsMap[diaryId]) commentsMap[diaryId] = [];
      commentsMap[diaryId].push(newComment);

      // 清空输入框
      commentText[diaryId] = '';

      this.setData({
        commentsMap: commentsMap,
        commentText: commentText,
      });

      wx.showToast({ title: '评论成功', icon: 'success' });
    } catch (err) {
      console.error('评论失败:', err);
      wx.showToast({ title: '评论失败', icon: 'none' });
    } finally {
      submitting[diaryId] = false;
      this.setData({ submittingComment: submitting });
    }
  },

  /**
   * 删除评论（仅自己的评论可删）
   */
  deleteComment(e) {
    var that = this;
    var commentId = e.currentTarget.dataset.commentId;
    var diaryId = e.currentTarget.dataset.diaryId;

    wx.showModal({
      title: '删除确认',
      content: '确定要删除这条评论吗？',
      success: async function (res) {
        if (!res.confirm) return;
        var db = app.getDb();
        try {
          await db.collection('comments').doc(commentId).remove();

          // 更新日记的 commentCount
          try {
            var diaryRes = await db.collection('diaries').doc(diaryId).get();
            var currentCount = diaryRes.data.commentCount || 0;
            await db.collection('diaries').doc(diaryId).update({
              data: { commentCount: Math.max(0, currentCount - 1) }
            });
          } catch (e) {
            console.warn('更新 commentCount 失败:', e);
          }

          // 更新本地评论列表
          var commentsMap = that.data.commentsMap || {};
          if (commentsMap[diaryId]) {
            commentsMap[diaryId] = commentsMap[diaryId].filter(function (c) {
              return c._id !== commentId;
            });
          }

          that.setData({ commentsMap: commentsMap });
          wx.showToast({ title: '已删除', icon: 'success' });
        } catch (err) {
          wx.showToast({ title: '删除失败', icon: 'none' });
        }
      }
    });
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
        // 优先用系统注入的 _openid（最可靠），兼容历史 uid/openid 字段
        var diaryUserId = diary._openid || diary.uid || diary.openid;

        // 优先使用缓存的用户信息，避免重复查库
        var userInfo = (userMapCache && (userMapCache[diaryUserId]))
          ? userMapCache[diaryUserId]
          : null;

        if (!userInfo) {
          // 缓存未命中时才查库，兼容 _openid/uid/openid 三种字段
          var _ = app._;
          var userRes = await db.collection('users').where(
            _.or([{ _openid: diaryUserId }, { openid: diaryUserId }, { uid: diaryUserId }])
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
            isMine: diaryUserId === myUid,
          },
          detailCommentExpanded: true,
          detailCommentText: '',
          detailComments: [],
        });

        // 加载详情页的评论
        this.loadDetailComments(id);
      }
    } catch (err) {
      console.error(err);
    }
  },

  /**
   * 加载详情弹窗的评论
   */
  async loadDetailComments(diaryId) {
    this.setData({ detailCommentLoading: true });
    var db = app.getDb();
    try {
      var commentRes = await db.collection('comments')
        .where({ diaryId: diaryId })
        .orderBy('createdAt', 'asc')
        .get();

      var userMap = userMapCache || await this.getUserMap();
      var myUid = app.getUserId();
      var comments = commentRes.data.map(function (c) {
        // 优先用系统注入的 _openid 匹配，兼容历史 uid/openid 字段
        var commentUserId = c._openid || c.uid || c.openid;
        var u = userMap[commentUserId] || { nickname: '未知', role: '', avatar: '' };
        return {
          ...c,
          nickname: u.nickname,
          avatar: u.avatar || '',
          isMine: commentUserId === myUid,
        };
      });

      this.setData({ detailComments: comments });
    } catch (err) {
      console.error('加载详情评论失败:', err);
    } finally {
      this.setData({ detailCommentLoading: false });
    }
  },

  /**
   * 详情弹窗评论输入
   */
  onDetailCommentInput(e) {
    this.setData({ detailCommentText: e.detail.value });
  },

  /**
   * 详情弹窗提交评论
   */
  async submitDetailComment() {
    var content = (this.data.detailCommentText || '').trim();
    var diaryId = this.data.detailDiary._id;
    if (!content) {
      wx.showToast({ title: '请输入评论内容', icon: 'none' });
      return;
    }
    if (this.data.detailSubmittingComment) return;
    this.setData({ detailSubmittingComment: true });

    var db = app.getDb();
    var coupleId = app.globalData.coupleId;
    var myUid = app.getUserId();
    var now = new Date().toISOString();

    try {
      var addRes = await db.collection('comments').add({
        data: {
          diaryId: diaryId,
          coupleId: coupleId,
          uid: myUid,
          content: content,
          createdAt: now,
        }
      });

      // 更新本地
      var userMap = userMapCache || await this.getUserMap();
      var u = userMap[myUid] || { nickname: '我', role: '', avatar: '' };
      var newComment = {
        _id: addRes._id,
        diaryId: diaryId,
        uid: myUid,
        content: content,
        createdAt: now,
        nickname: u.nickname,
        avatar: u.avatar || '',
        isMine: true,
      };

      var detailComments = this.data.detailComments || [];
      detailComments.push(newComment);

      this.setData({
        detailComments: detailComments,
        detailCommentText: '',
      });

      // 更新日记的 commentCount
      try {
        var diaryRes = await db.collection('diaries').doc(diaryId).get();
        var currentCount = diaryRes.data.commentCount || 0;
        await db.collection('diaries').doc(diaryId).update({
          data: { commentCount: currentCount + 1 }
        });
      } catch (e) {
        console.warn('更新 commentCount 失败:', e);
      }

      // 同步更新列表页的评论缓存
      var commentsMap = this.data.commentsMap || {};
      if (!commentsMap[diaryId]) commentsMap[diaryId] = [];
      commentsMap[diaryId].push(newComment);
      this.setData({ commentsMap: commentsMap });

      wx.showToast({ title: '评论成功', icon: 'success' });
    } catch (err) {
      console.error('评论失败:', err);
      wx.showToast({ title: '评论失败', icon: 'none' });
    } finally {
      this.setData({ detailSubmittingComment: false });
    }
  },

  /**
   * 详情弹窗删除评论
   */
  deleteDetailComment(e) {
    var that = this;
    var commentId = e.currentTarget.dataset.commentId;
    var diaryId = this.data.detailDiary._id;

    wx.showModal({
      title: '删除确认',
      content: '确定要删除这条评论吗？',
      success: async function (res) {
        if (!res.confirm) return;
        var db = app.getDb();
        try {
          await db.collection('comments').doc(commentId).remove();

          // 更新日记的 commentCount
          try {
            var diaryRes = await db.collection('diaries').doc(diaryId).get();
            var currentCount = diaryRes.data.commentCount || 0;
            await db.collection('diaries').doc(diaryId).update({
              data: { commentCount: Math.max(0, currentCount - 1) }
            });
          } catch (e) {
            console.warn('更新 commentCount 失败:', e);
          }

          // 更新本地详情评论列表
          var detailComments = that.data.detailComments.filter(function (c) {
            return c._id !== commentId;
          });
          that.setData({ detailComments: detailComments });

          // 同步更新列表页缓存
          var commentsMap = that.data.commentsMap || {};
          if (commentsMap[diaryId]) {
            commentsMap[diaryId] = commentsMap[diaryId].filter(function (c) {
              return c._id !== commentId;
            });
            that.setData({ commentsMap: commentsMap });
          }

          wx.showToast({ title: '已删除', icon: 'success' });
        } catch (err) {
          wx.showToast({ title: '删除失败', icon: 'none' });
        }
      }
    });
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
          that.setData({ page: 1, diaries: [], hasMore: true, commentsMap: {}, expandedComments: {} });
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