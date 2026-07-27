/**
 * 恋爱日历小程序 - 应用入口
 * 用户标识：优先微信 openid（Cloudflare Worker），兜底本地 UUID
 * 三层兜底策略：Worker 成功 → UUID 降级 → 权限兜底
 */

// Cloudflare Worker URL（部署后替换为实际地址）
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

    // 全局数据（含缓存，避免各页面重复查询）
    this.globalData = {
      openid: '',           // 微信 openid（Worker 获取后写入）
      myUid: '',            // 本地 UUID（兜底）
      userInfo: null,
      partnerInfo: null,
      coupleId: null,
      isBound: false,
      togetherDate: null,
      openidReady: false,
      useOpenid: false,         // 是否使用 openid 模式
      usersCache: null,         // users 表缓存
      anniversariesCache: null, // 纪念日列表缓存
    };

    // 初始化本地 UUID（兜底用）
    this.initMyUid();
    // 尝试通过 Worker 获取 openid
    this.fetchOpenid();
  },

  /**
   * 初始化本地 UUID（云函数未部署时的兜底方案）
   */
  initMyUid: function () {
    var uid = wx.getStorageSync('love_calendar_uid');
    if (!uid) {
      uid = this.generateUUID();
      wx.setStorageSync('love_calendar_uid', uid);
    }
    this.globalData.myUid = uid;
  },

  /**
   * 生成 UUID v4
   */
  generateUUID: function () {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      var v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  },

  /**
   * 通过 wx.login + Cloudflare Worker 获取微信 openid
   * 失败时降级为 UUID 模式，不丢数据
   */
  async fetchOpenid() {
    try {
      // 1. 通过 wx.login 获取临时 code
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
        // 持久化 openid，换手机后虽然本地存储会丢，但 Worker 会重新获取
        wx.setStorageSync('love_calendar_openid', openid);
        console.log('✅ openid 模式已启用');
      } else {
        throw new Error('Worker 返回异常: ' + JSON.stringify(resp.data));
      }
    } catch (err) {
      // 降级：Worker 不可用 → 使用 UUID 模式
      console.warn('⚠️ Worker 获取 openid 失败，降级 UUID 模式:', err.message || err);
      this.globalData.useOpenid = false;
    }

    await this.checkBindStatus();
    this.globalData.openidReady = true;
  },

  /**
   * 获取当前用户标识（openid 或 UUID）
   */
  getUserId: function () {
    if (this.globalData.useOpenid && this.globalData.openid) {
      return this.globalData.openid;
    }
    return this.globalData.myUid;
  },

  /**
   * 获取数据库实例
   */
  getDb: function () {
    return this.db;
  },

  /**
   * 检查用户绑定状态（三层兜底）
   * 第一层：openid 模式 → 按 openid 查 DB → 找不到则权限兜底补全
   * 第二层：UUID 模式 → 按 uid 查 DB
   * 第三层：权限兜底 → db.get() 不加条件，系统按 _openid 过滤
   */
  checkBindStatus: function () {
    var app = this;
    var uid = app.getUserId();
    var db = app.getDb();

    // openid 模式：直接查数据库（不再依赖云函数）
    if (app.globalData.useOpenid) {
      var openid = app.globalData.openid;
      return db.collection('users').where({ openid: openid }).get().then(function (res) {
        if (res.data.length > 0) {
          return app.setupUserState(res.data[0]);
        }
        // 兜底：DB 中只有旧 UUID 记录（没有 openid 字段）
        // 利用权限系统自动查找，找到后补全 openid
        return db.collection('users').get().then(function (fb) {
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

    // UUID 模式：直接查数据库
    return db.collection('users').where({ uid: uid }).get().then(function (res) {
      if (res.data.length > 0) {
        return app.setupUserState(res.data[0]);
      }
      // 兜底：UUID 丢失（清缓存/重装小程序），利用数据库"仅创建者可读写"权限
      return db.collection('users').get().then(function (fallbackRes) {
        if (fallbackRes.data.length > 0) {
          var user = fallbackRes.data[0];
          console.log('通过权限兜底找回用户记录，更新 UUID');
          db.collection('users').doc(user._id).update({
            data: { uid: uid }
          }).catch(function () {});
          return app.setupUserState(user);
        }
        return false;
      });
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

    // 获取对方信息 + 缓存 users 表数据，避免各页面重复查询
    return db.collection('users').where({
      coupleId: user.coupleId
    }).get().then(function (partnerRes) {
      // 缓存 users 数据，供日历页等复用
      app.globalData.usersCache = partnerRes.data;

      var partner = null;
      for (var i = 0; i < partnerRes.data.length; i++) {
        var u = partnerRes.data[i];
        var isMe = (u.openid && u.openid === myId) ||
                   (u.uid && u.uid === myId) ||
                   (u._id === user._id);
        if (!isMe) { partner = u; break; }
      }
      if (partner) {
        app.globalData.partnerInfo = partner;
      }
      // 获取纪念日列表 + 缓存，供日历页复用
      return db.collection('anniversaries').where({
        coupleId: user.coupleId
      }).orderBy('date', 'asc').get().then(function (anniRes) {
        app.globalData.anniversariesCache = anniRes.data;
        if (anniRes.data.length > 0) {
          app.globalData.togetherDate = anniRes.data[0].date;
        }
        return true;
      });
    });
  }
});