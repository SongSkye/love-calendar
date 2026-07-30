/**
 * 我的页面 - 支持修改头像和昵称
 * 用户标识：微信 openid
 */
const app = getApp();

Page({
  data: {
    userInfo: {},
    partnerInfo: null,
    inviteCode: '',
    showNicknameModal: false,
    newNickname: '',
  },

  onShow() {
    if (!app.globalData.isBound) {
      app.checkBindStatus().then(function (bound) {
        if (!bound) { wx.reLaunch({ url: '/pages/welcome/welcome' }); }
      });
      return;
    }
    this.loadUserInfo();
  },

  async loadUserInfo() {
    var db = app.getDb();
    var userId = app.getUserId();  // openid 或 UUID（云函数不可用时兜底）
    var coupleId = app.globalData.coupleId;

    try {
      // 用 userId 查询当前用户（兼容 openid 和 UUID 两种模式）
      var user = null;
      var userRes = await db.collection('users').where({ uid: userId }).get();
      if (userRes.data.length === 0) {
        userRes = await db.collection('users').where({ openid: userId }).get();
      }
      if (userRes.data.length > 0) {
        user = userRes.data[0];
        this.setData({ userInfo: user });
        app.globalData.userInfo = user;
        // 头像转临时链接
        if (user.avatar && user.avatar.indexOf('cloud://') === 0) {
          this.convertAvatar(user.avatar, 'userInfo');
        }
      }
      if (!user) return;

      // 获取对方信息（兼容迁移前后：对方可能还没 openid 字段）
      var partnerRes = await db.collection('users').where({ coupleId: coupleId }).get();
      var partner = null;
      for (var i = 0; i < partnerRes.data.length; i++) {
        var u = partnerRes.data[i];
        var isMe = (u.openid && u.openid === userId) || (u.uid && u.uid === userId) || (u._openid && u._openid === userId) || (user._id === u._id);
        if (!isMe) { partner = u; break; }
      }
      if (partner) {
        this.setData({ partnerInfo: partner });
        app.globalData.partnerInfo = partner;
        // 对方头像转临时链接
        if (partner.avatar && partner.avatar.indexOf('cloud://') === 0) {
          this.convertAvatar(partner.avatar, 'partnerInfo');
        }
      }

      var coupleRes = await db.collection('couples').doc(coupleId).get();
      if (coupleRes.data) {
        this.setData({ inviteCode: coupleRes.data.inviteCode });
      }
    } catch (err) {
      console.error('加载用户信息失败:', err);
    }
  },

  /**
   * 将云存储 fileID 转为临时链接
   */
  convertAvatar: function (fileID, key) {
    var that = this;
    wx.cloud.getTempFileURL({ fileList: [fileID] }).then(function (res) {
      if (res.fileList[0] && res.fileList[0].tempFileURL) {
        var update = {};
        update[key] = Object.assign({}, that.data[key], { avatar: res.fileList[0].tempFileURL });
        that.setData(update);
      }
    }).catch(function () {});
  },

  /**
   * 修改头像
   */
  changeAvatar() {
    var that = this;
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: function (res) {
        wx.showLoading({ title: '上传中...' });
        wx.cloud.uploadFile({
          cloudPath: 'avatars/' + Date.now() + '_' + Math.random().toString(36).substr(2, 8) + '.jpg',
          filePath: res.tempFilePaths[0],
        }).then(function (uploadRes) {
          // 删除旧头像
          if (that.data.userInfo.avatar) {
            wx.cloud.deleteFile({ fileList: [that.data.userInfo.avatar] }).catch(function () {});
          }
          // 更新数据库
          var db = app.getDb();
          return db.collection('users').doc(that.data.userInfo._id).update({
            data: { avatar: uploadRes.fileID }
          });
        }).then(function () {
          wx.hideLoading();
          wx.showToast({ title: '头像已更新', icon: 'success' });
          // 清除全局缓存，确保其他页面刷新时获取最新头像
          app.globalData.usersCache = null;
          var pages = getCurrentPages();
          for (var i = 0; i < pages.length; i++) {
            if (pages[i].clearUserCache) {
              pages[i].clearUserCache();
            }
          }
          that.loadUserInfo();
        }).catch(function (err) {
          wx.hideLoading();
          console.error(err);
          wx.showToast({ title: '上传失败', icon: 'none' });
        });
      }
    });
  },

  /**
   * 编辑昵称
   */
  editNickname() {
    this.setData({ showNicknameModal: true, newNickname: this.data.userInfo.nickname || '' });
  },

  closeNicknameModal() {
    this.setData({ showNicknameModal: false });
  },

  onNicknameInput(e) {
    this.setData({ newNickname: e.detail.value });
  },

  async saveNickname() {
    var nickname = this.data.newNickname.trim();
    if (!nickname) {
      wx.showToast({ title: '请输入昵称', icon: 'none' });
      return;
    }

    var db = app.getDb();

    try {
      await db.collection('users').doc(this.data.userInfo._id).update({
        data: { nickname: nickname }
      });
      this.setData({ showNicknameModal: false });
      wx.showToast({ title: '昵称已更新', icon: 'success' });
      // 清除全局缓存，确保其他页面刷新时获取最新数据
      app.globalData.usersCache = null;
      // 通知日记列表页清除缓存
      var pages = getCurrentPages();
      for (var i = 0; i < pages.length; i++) {
        if (pages[i].clearUserCache) {
          pages[i].clearUserCache();
        }
      }
      this.loadUserInfo();
    } catch (err) {
      console.error(err);
      wx.showToast({ title: '修改失败', icon: 'none' });
    }
  },

  copyInviteCode() {
    wx.setClipboardData({
      data: this.data.inviteCode,
      success: function () { wx.showToast({ title: '已复制', icon: 'success' }); }
    });
  },

  aboutApp() {
    wx.showModal({
      title: '关于恋爱日历',
      content: '💕 恋爱日历 - 记录属于我们的每一天\n\n记录每日心情、日常日记、纪念日，让每一天都值得被记住。\n\n版本 1.0.0',
      showCancel: false,
      confirmText: '知道了',
    });
  },

  /**
   * 解绑并退出空间
   * 同一微信号在所有设备上共享数据，解绑即删除此账号的全部数据
   */
  unbindSpace() {
    var that = this;
    wx.showModal({
      title: '确认解绑',
      content: '解绑后，你的所有数据将被删除。\n\n如果你是创建者，整个空间的数据都会被清除。\n\n确定要解绑吗？',
      confirmText: '确定解绑',
      confirmColor: '#FF6B81',
      success: async function (res) {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '解绑中...' });
            var db = app.getDb();
            var coupleId = app.globalData.coupleId;
            var userInfo = app.globalData.userInfo;

            if (userInfo.role === 'creator') {
              // 创建者解绑：删除所有数据
              await db.collection('moods').where({ coupleId: coupleId }).remove();
              await db.collection('diaries').where({ coupleId: coupleId }).remove();
              await db.collection('anniversary_records').where({ coupleId: coupleId }).remove();
              await db.collection('anniversaries').where({ coupleId: coupleId }).remove();
              await db.collection('users').where({ coupleId: coupleId }).remove();
              await db.collection('couples').doc(coupleId).remove();
            } else {
              // partner 解绑：删除用户记录，清空 partnerOpenid
              await db.collection('users').doc(userInfo._id).remove();
              // 兼容新旧字段：清空 partnerOpenid 和 partnerUid
              await db.collection('couples').doc(coupleId).update({
                data: { partnerOpenid: '', partnerUid: '' }
              });
            }

            app.globalData.userInfo = null;
            app.globalData.partnerInfo = null;
            app.globalData.coupleId = null;
            app.globalData.isBound = false;
            app.globalData.togetherDate = null;
            // 清除启动缓存，下次重新走完整流程
            wx.removeStorageSync('love_calendar_state');

            wx.hideLoading();
            wx.showToast({ title: '已解绑', icon: 'success' });
            setTimeout(function () { wx.reLaunch({ url: '/pages/welcome/welcome' }); }, 1500);
          } catch (err) {
            wx.hideLoading();
            wx.showToast({ title: '解绑失败', icon: 'none' });
          }
        }
      }
    });
  },

  noop() {},
  onShareAppMessage() {
    return { title: '邀请你加入恋爱日历！邀请码：' + this.data.inviteCode, path: '/pages/welcome/welcome' };
  },
});