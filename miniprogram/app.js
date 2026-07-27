/**
 * 恋爱日历小程序 - 应用入口
 * 用户标识：优先微信 openid（云函数），兜底本地 UUID
 * 云函数部署后自动切换为 openid 模式
 */
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
      openid: '',           // 微信 openid（云函数部署后才有）
      myUid: '',            // 本地 UUID（兜底，云函数未部署时使用）
      userInfo: null,
      partnerInfo: null,
      coupleId: null,
      isBound: false,
      togetherDate: null,
      openidReady: false,
      useOpenid: false,     // 是否使用 openid 模式（云函数可用）
      usersCache: null,         // users 表缓存（两人数据），避免各页面重复查询
      anniversariesCache: null, // 纪念日列表缓存
    };

    // 初始化本地 UUID（兜底用）
    this.initMyUid();
    // 尝试获取 openid
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
   * 尝试获取 openid，如果云函数不可用则降级为 UUID 模式
   */
  async fetchOpenid() {
    // 如果之前已确认云函数不可用，直接跳过，避免每次等待超时
    var cloudFnDisabled = wx.getStorageSync('cloudFnDisabled');
    if (cloudFnDisabled) {
      console.log('⏭️ 云函数已确认不可用，直接使用 UUID 模式');
      this.globalData.useOpenid = false;
      await this.checkBindStatus();
      this.globalData.openidReady = true;
      return;
    }

    try {
      var res = await wx.cloud.callFunction({
        name: 'getOpenid',
        data: { action: 'getOpenid' }
      });

      if (res.result && res.result.success) {
        this.globalData.openid = res.result.data.openid;
        this.globalData.useOpenid = true;
        console.log('✅ openid 模式已启用');
      }
    } catch (err) {
      // 云函数未部署，降级为 UUID 模式，并记住状态避免下次重试
      console.warn('⚠️ getOpenid 云函数不可用，使用 UUID 模式:', err.message);
      this.globalData.useOpenid = false;
      wx.setStorageSync('cloudFnDisabled', true);
    }

    // 检查绑定状态
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
   * 检查用户绑定状态
   */
  checkBindStatus: function () {
    var app = this;
    var uid = app.getUserId();

    // openid 模式：通过云函数检查
    if (app.globalData.useOpenid) {
      var oldUid = wx.getStorageSync('love_calendar_uid') || '';
      return wx.cloud.callFunction({
        name: 'getOpenid',
        data: { action: 'check', oldUid: oldUid }
      }).then(function (res) {
        if (!res.result || !res.result.success || !res.result.data.found) {
          return false;
        }
        var data = res.result.data;
        var user = data.user;
        if (!data.migrated) {
          return app.migrateData(oldUid).then(function () {
            user.openid = app.globalData.openid;
            return app.setupUserState(user);
          });
        }
        return app.setupUserState(user);
      }).catch(function (err) {
        console.error('检查绑定状态失败:', err);
        return false;
      });
    }

    // UUID 模式：直接查数据库
    return app.getDb().collection('users').where({ uid: uid }).get().then(function (res) {
      if (res.data.length > 0) {
        return app.setupUserState(res.data[0]);
      }
      // 兜底：UUID 丢失（清缓存/重装小程序），利用数据库"仅创建者可读写"权限
      // 不加 where 条件查询时，系统自动按 _openid 过滤，只返回当前用户创建的记录
      return app.getDb().collection('users').get().then(function (fallbackRes) {
        if (fallbackRes.data.length > 0) {
          var user = fallbackRes.data[0];
          console.log('通过权限兜底找回用户记录，更新 UUID');
          // 把当前 UUID 写回记录，确保下次能正常匹配
          app.getDb().collection('users').doc(user._id).update({
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
   * 迁移旧 UUID 数据到 openid
   */
  migrateData: function (oldUid) {
    if (!oldUid) return Promise.resolve();
    return wx.cloud.callFunction({
      name: 'getOpenid',
      data: { action: 'migrate', oldUid: oldUid }
    }).then(function (res) {
      if (res.result && res.result.success) {
        console.log('数据迁移成功:', res.result.data);
      } else {
        console.error('数据迁移失败:', res.result);
      }
    }).catch(function (err) {
      console.error('数据迁移异常:', err);
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