/**
 * 恋爱日历小程序 - 应用入口
 * 用户标识：微信 openid（Cloudflare Worker），兜底本地 UUID
 * 启动优化：openid + 绑定状态缓存到本地，秒开跳转
 */

// Cloudflare Worker URL
var WORKER_URL = 'https://love-calendar.zhaoqingyi.workers.dev/api/getOpenid';

App({
  onLaunch: function () {
    // 初始化云开发环境
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
    } else {
      wx.cloud.init({
        env: 'cloudbase-d2gr49l7r2f948ed1',
        traceUser: true,
      });
    }

    this.db = wx.cloud.database();
    this._ = this.db.command;

    this.globalData = {
      openid: '',
      myUid: '',
      userInfo: null,
      partnerInfo: null,
      coupleId: null,
      isBound: false,
      togetherDate: null,
      openidReady: false,
      useOpenid: false,
      usersCache: null,
      anniversariesCache: null,
    };

    // 初始化本地 UUID
    this.initMyUid();

    // 先从缓存恢复状态（秒开），再后台刷新
    var restored = this.restoreFromCache();
    if (restored) {
      // 缓存命中 → 立即就绪，后台静默刷新
      this.globalData.openidReady = true;
      this.fetchOpenid(); // 后台刷新，不阻塞
    } else {
      // 首次启动或无缓存 → 走完整流程
      this.fetchOpenid().then(function () {
        // 刷新完成后缓存状态
        this.saveToCache();
      }.bind(this));
    }
  },

  /**
   * 从 localStorage 恢复 openid 和绑定状态
   * @returns {boolean} 是否恢复成功
   */
  restoreFromCache: function () {
    try {
      var cached = wx.getStorageSync('love_calendar_state');
      if (!cached) return false;

      // 恢复 openid（同一微信号永远不变，100% 可靠）
      if (cached.openid) {
        this.globalData.openid = cached.openid;
        this.globalData.useOpenid = true;
      }

      // 恢复绑定状态
      if (cached.isBound && cached.coupleId) {
        this.globalData.isBound = true;
        this.globalData.coupleId = cached.coupleId;
        this.globalData.userInfo = cached.userInfo || null;
        this.globalData.partnerInfo = cached.partnerInfo || null;
        this.globalData.togetherDate = cached.togetherDate || null;
        console.log('⚡ 从缓存恢复状态，秒开');
      }

      return true;
    } catch (e) {
      return false;
    }
  },

  /**
   * 保存 openid 和绑定状态到 localStorage
   */
  saveToCache: function () {
    try {
      wx.setStorageSync('love_calendar_state', {
        openid: this.globalData.openid,
        isBound: this.globalData.isBound,
        coupleId: this.globalData.coupleId,
        userInfo: this.globalData.userInfo,
        partnerInfo: this.globalData.partnerInfo,
        togetherDate: this.globalData.togetherDate,
      });
    } catch (e) {}
  },

  /**
   * 初始化本地 UUID（兜底用）
   */
  initMyUid: function () {
    var uid = wx.getStorageSync('love_calendar_uid');
    if (!uid) {
      uid = this.generateUUID();
      wx.setStorageSync('love_calendar_uid', uid);
    }
    this.globalData.myUid = uid;
  },

  generateUUID: function () {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      var v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  },

  /**
   * 通过 wx.login + Cloudflare Worker 获取微信 openid
   * 失败时降级为 UUID 模式。支持后台静默刷新
   */
  async fetchOpenid() {
    try {
      // 1. wx.login 获取临时 code
      var loginRes = await new Promise(function (resolve, reject) {
        wx.login({ success: resolve, fail: reject });
      });
      if (!loginRes.code) throw new Error('wx.login 未返回 code');

      // 2. 调用 Cloudflare Worker 换取 openid
      var resp = await new Promise(function (resolve, reject) {
        wx.request({
          url: WORKER_URL,
          method: 'POST',
          data: { code: loginRes.code },
          header: { 'Content-Type': 'application/json' },
          success: resolve,
          fail: reject,
        });
      });

      if (resp.statusCode === 200 && resp.data && resp.data.success) {
        var openid = resp.data.data.openid;
        this.globalData.openid = openid;
        this.globalData.useOpenid = true;
        wx.setStorageSync('love_calendar_openid', openid);
        console.log('✅ openid 模式已启用');
      } else {
        throw new Error('Worker 返回异常: ' + JSON.stringify(resp.data));
      }
    } catch (err) {
      console.warn('⚠️ Worker 获取 openid 失败，降级 UUID 模式:', err.message || err);
      this.globalData.useOpenid = false;
    }

    await this.checkBindStatus();
    this.globalData.openidReady = true;
  },

  getUserId: function () {
    if (this.globalData.useOpenid && this.globalData.openid) {
      return this.globalData.openid;
    }
    return this.globalData.myUid;
  },

  getDb: function () {
    return this.db;
  },

  /**
   * 检查用户绑定状态（三层兜底）
   */
  checkBindStatus: function () {
    var app = this;
    var uid = app.getUserId();
    var db = app.getDb();

    if (app.globalData.useOpenid) {
      var openid = app.globalData.openid;
      return db.collection('users').where({ openid: openid }).get().then(function (res) {
        if (res.data.length > 0) {
          return app.setupUserState(res.data[0]);
        }
        // 按 _openid 系统字段查找（比 get() 全量更精确），避免取到别人的数据
        return db.collection('users').where({ _openid: openid }).get().then(function (fb) {
          if (fb.data.length > 0) {
            var user = fb.data[0];
            console.log('通过权限兜底找回旧记录，自动补全 openid');
            return db.collection('users').doc(user._id).update({
              data: { openid: openid }
            }).then(function () {
              user.openid = openid;
              return app.setupUserState(user);
            });
          }
          return false;
        });
      }).catch(function (err) {
        console.error('检查绑定状态失败:', err);
        return false;
      });
    }

    return db.collection('users').where({ uid: uid }).get().then(function (res) {
      if (res.data.length > 0) {
        return app.setupUserState(res.data[0]);
      }
      // 查不到 uid 即未绑定，不再全量 get() 兜底取第一条
      // （旧逻辑会取到别人的记录导致跨用户数据错配，UUID 模式数据归属本就不可靠）
      return false;
    }).catch(function (err) {
      console.error('检查绑定状态失败:', err);
      return false;
    });
  },

  /**
   * 根据用户记录设置全局状态
   */
  setupUserState: function (user) {
    var app = this;
    var db = this.db;
    var myId = app.getUserId();
    app.globalData.userInfo = user;
    app.globalData.coupleId = user.coupleId;
    app.globalData.isBound = true;

    return db.collection('users').where({
      coupleId: user.coupleId
    }).get().then(function (partnerRes) {
      app.globalData.usersCache = partnerRes.data;

      var partner = null;
      for (var i = 0; i < partnerRes.data.length; i++) {
        var u = partnerRes.data[i];
        var isMe = (u.openid && u.openid === myId) ||
                   (u.uid && u.uid === myId) ||
                   (u._openid && u._openid === myId) ||
                   (u._id === user._id);
        if (!isMe) { partner = u; break; }
      }
      if (partner) {
        app.globalData.partnerInfo = partner;
      }
      // 分页取全部纪念日（默认 .get() 只返 20 条，纪念日多了启动缓存会丢）
      return fetchAllAnniversaries(db, user.coupleId).then(function (anniList) {
        app.globalData.anniversariesCache = anniList;
        if (anniList.length > 0) {
          app.globalData.togetherDate = anniList[0].date;
        }
        // 后台刷新后更新缓存
        app.saveToCache();
        return true;
      });
    });
  },
});

/**
 * 分页取出某空间全部纪念日（按日期升序）
 * 云数据库 .get() 默认只返 20 条，纪念日多了会丢，循环分页取全部
 * app.js 启动最早执行，不能依赖 utils/util.js（util 内部用 getApp），故内联
 */
function fetchAllAnniversaries(db, coupleId) {
  var all = [];
  var pageSize = 20;
  var skip = 0;
  function next() {
    return db.collection('anniversaries')
      .where({ coupleId: coupleId })
      .orderBy('date', 'asc')
      .skip(skip)
      .limit(pageSize)
      .get()
      .then(function (res) {
        all = all.concat(res.data);
        if (res.data.length < pageSize) return all;
        skip += pageSize;
        if (skip > 1000) return all; // 安全上限
        return next();
      });
  }
  return next();
}