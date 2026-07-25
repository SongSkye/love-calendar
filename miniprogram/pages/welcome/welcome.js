/**
 * 欢迎页 - 创建/加入情侣空间
 * 使用微信 openid 作为用户唯一标识
 */
const app = getApp();

Page({
  data: {
    activeTab: 'create',    // create | join
    nickname: '',
    inviteCode: '',
    inviteCodeInput: '',
    loading: false,
    openidReady: false,     // openid 是否已获取
  },

  onLoad() {
    this.waitForOpenid();
  },

  onShow() {
    this.waitForOpenid();
  },

  /**
   * 等待 openid 获取完成后检查绑定状态
   */
  waitForOpenid() {
    // 如果 openid 已就绪，直接检查
    if (app.globalData.openidReady) {
      this.checkBindStatus();
      return;
    }
    // 轮询等待
    this.setData({ openidReady: false });
    var that = this;
    var check = function () {
      if (app.globalData.openidReady) {
        that.setData({ openidReady: true });
        that.checkBindStatus();
      } else {
        setTimeout(check, 200);
      }
    };
    check();
  },

  async checkBindStatus() {
    if (app.globalData.isBound) {
      wx.switchTab({ url: '/pages/calendar/calendar' });
      return;
    }
    try {
      var bound = await app.checkBindStatus();
      if (bound) {
        wx.switchTab({ url: '/pages/calendar/calendar' });
      }
    } catch (err) {
      console.error(err);
    }
  },

  switchTab(e) {
    var tab = e.currentTarget.dataset.tab;
    this.setData({ activeTab: tab, inviteCode: '', inviteCodeInput: '', nickname: '' });
  },

  onNicknameInput(e) {
    this.setData({ nickname: e.detail.value });
  },

  onInviteCodeInput(e) {
    this.setData({ inviteCodeInput: e.detail.value.toUpperCase().trim() });
  },

  /**
   * 创建情侣空间
   */
  async createSpace() {
    var nickname = this.data.nickname.trim();
    if (!nickname) {
      wx.showToast({ title: '请输入昵称', icon: 'none' });
      return;
    }

    this.setData({ loading: true });
    var db = app.getDb();
    var userId = app.getUserId();  // openid 或 UUID（云函数不可用时兜底）

    try {
      // 检查是否已有空间
      var bound = await app.checkBindStatus();
      if (bound) {
        wx.showToast({ title: '已经绑定了一个空间，请先解绑', icon: 'none' });
        this.setData({ loading: false });
        return;
      }

      // 生成唯一邀请码
      var inviteCode = this.genCode();

      // 创建情侣空间
      var coupleRes = await db.collection('couples').add({
        data: {
          inviteCode: inviteCode,
          creatorOpenid: userId,
          partnerOpenid: '',
          createdAt: new Date().toISOString(),
        }
      });

      // 创建用户记录
      await db.collection('users').add({
        data: {
          openid: userId,
          uid: userId,  // 同时写 uid 字段，兼容 UUID 模式
          coupleId: coupleRes._id,
          nickname: nickname,
          role: 'creator',
          avatar: '',
          createdAt: new Date().toISOString(),
        }
      });

      // 更新全局状态
      app.globalData.userInfo = {
        openid: userId, coupleId: coupleRes._id, nickname: nickname, role: 'creator'
      };
      app.globalData.coupleId = coupleRes._id;
      app.globalData.isBound = true;

      this.setData({ inviteCode: inviteCode });
      wx.showToast({ title: '创建成功！', icon: 'success' });

    } catch (err) {
      console.error(err);
      wx.showToast({ title: '创建失败，请重试', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  /**
   * 加入情侣空间
   */
  async joinSpace() {
    var nickname = this.data.nickname.trim();
    var inviteCode = this.data.inviteCodeInput.trim();

    if (!nickname) {
      wx.showToast({ title: '请输入昵称', icon: 'none' });
      return;
    }
    if (!inviteCode || inviteCode.length !== 6) {
      wx.showToast({ title: '请输入6位邀请码', icon: 'none' });
      return;
    }

    this.setData({ loading: true });
    var db = app.getDb();
    var userId = app.getUserId();  // openid 或 UUID（云函数不可用时兜底）

    try {
      // 检查是否已有空间
      var bound = await app.checkBindStatus();
      if (bound) {
        wx.showToast({ title: '已经绑定了一个空间，请先解绑', icon: 'none' });
        this.setData({ loading: false });
        return;
      }

      // 查找邀请码
      var coupleRes = await db.collection('couples').where({ inviteCode: inviteCode }).get();
      if (coupleRes.data.length === 0) {
        wx.showToast({ title: '邀请码不存在', icon: 'none' });
        this.setData({ loading: false });
        return;
      }

      var couple = coupleRes.data[0];
      // 兼容新旧字段：partnerOpenid（新）或 partnerUid（旧）
      if (couple.partnerOpenid || couple.partnerUid) {
        wx.showToast({ title: '邀请码已被使用', icon: 'none' });
        this.setData({ loading: false });
        return;
      }
      // 不能加入自己创建的空间（兼容新旧字段）
      var creatorId = couple.creatorOpenid || couple.creatorUid;
      if (creatorId === userId) {
        wx.showToast({ title: '不能加入自己创建的空间', icon: 'none' });
        this.setData({ loading: false });
        return;
      }

      // 更新空间
      await db.collection('couples').doc(couple._id).update({
        data: { partnerOpenid: userId }
      });

      // 创建用户记录
      await db.collection('users').add({
        data: {
          openid: userId,
          uid: userId,  // 同时写 uid 字段，兼容 UUID 模式
          coupleId: couple._id,
          nickname: nickname,
          role: 'partner',
          avatar: '',
          createdAt: new Date().toISOString(),
        }
      });

      // 更新全局状态
      app.globalData.userInfo = {
        openid: userId, coupleId: couple._id, nickname: nickname, role: 'partner'
      };
      app.globalData.coupleId = couple._id;
      app.globalData.isBound = true;

      wx.showToast({ title: '加入成功！', icon: 'success', duration: 1500 });
      setTimeout(function () { wx.switchTab({ url: '/pages/calendar/calendar' }); }, 1500);

    } catch (err) {
      console.error(err);
      wx.showToast({ title: '加入失败，请重试', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  /**
   * 生成6位邀请码
   */
  genCode() {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var code = '';
    for (var i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  },

  copyInviteCode() {
    wx.setClipboardData({
      data: this.data.inviteCode,
      success: function () { wx.showToast({ title: '已复制，发给TA吧！', icon: 'success' }); }
    });
  },

  enterApp() {
    wx.switchTab({ url: '/pages/calendar/calendar' });
  },

  onShareAppMessage() {
    var code = this.data.inviteCode;
    return { title: '邀请你加入恋爱日历！邀请码：' + code, path: '/pages/welcome/welcome' };
  },
});