/**
 * 我的页面 - 支持修改头像和昵称
 * 用户标识：微信 openid
 */
const util = require('../../utils/util');
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
    // 等待 openid 获取完成
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
      }

      // 批量转换双方头像（一次查库，避免两次请求）
      var avatarIds = [];
      if (user.avatar && user.avatar.indexOf('cloud://') === 0) avatarIds.push(user.avatar);
      if (partner && partner.avatar && partner.avatar.indexOf('cloud://') === 0) avatarIds.push(partner.avatar);
      if (avatarIds.length > 0) {
        this.convertAvatars(avatarIds);
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
   * 批量转换云存储 fileID，同时更新 userInfo 和 partnerInfo 的头像
   */
  convertAvatars: function (fileIDs) {
    var that = this;
    util.convertCloudFileIDs(fileIDs).then(function (urlMap) {
      var update = {};
      var userAvatar = that.data.userInfo.avatar;
      var partnerAvatar = that.data.partnerInfo && that.data.partnerInfo.avatar;

      // 用户头像转换：如果 urlMap 中有则用，没有则保留原 cloud:// fileID（image 组件可直接渲染）
      if (userAvatar) {
        var newUserAvatar = urlMap[userAvatar] || userAvatar;
        update.userInfo = Object.assign({}, that.data.userInfo, { avatar: newUserAvatar });
      }

      // 对方头像转换
      if (partnerAvatar) {
        var newPartnerAvatar = urlMap[partnerAvatar] || partnerAvatar;
        update.partnerInfo = Object.assign({}, that.data.partnerInfo, { avatar: newPartnerAvatar });
      }

      if (Object.keys(update).length > 0) {
        that.setData(update);
      }
    }).catch(function (err) {
      console.warn('convertAvatars 失败，保留原始 cloud:// fileID:', err);
      // 转换失败时不做任何操作，image 组件会尝试直接渲染 cloud:// fileID
    });
  },

  /**
   * 头像加载失败时的降级处理
   */
  onAvatarError: function () {
    // 如果头像加载失败，清空 avatar 让默认 emoji 显示
    var userInfo = this.data.userInfo;
    if (userInfo.avatar) {
      this.setData({
        userInfo: Object.assign({}, userInfo, { avatar: '' })
      });
    }
  },

  /**
   * 对方头像加载失败时的降级处理
   */
  onPartnerAvatarError: function () {
    var partnerInfo = this.data.partnerInfo;
    if (partnerInfo && partnerInfo.avatar) {
      this.setData({
        partnerInfo: Object.assign({}, partnerInfo, { avatar: '' })
      });
    }
  },

  /**
   * 修改头像
   */
  changeAvatar() {
    var that = this;
    // 在上传前保存旧头像 fileID，避免异步期间 userInfo 被刷新导致误删
    var oldAvatar = that.data.userInfo.avatar || '';
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: function (res) {
        wx.showLoading({ title: '上传中...' });
        var tempPath = res.tempFilePaths[0];
        wx.cloud.uploadFile({
          cloudPath: 'avatars/' + Date.now() + '_' + Math.random().toString(36).substr(2, 8) + '.jpg',
          filePath: tempPath,
        }).then(function (uploadRes) {
          // 生成缩略图 base64 存入 image_thumbs，供跨用户显示
          util.compressImageToBase64(tempPath, 400, 0.7).then(function (base64) {
            util.saveImageThumb(uploadRes.fileID, base64);
          }).catch(function (e) {
            console.warn('生成缩略图失败:', e);
          });
          // 删除旧头像
          if (oldAvatar) {
            wx.cloud.deleteFile({ fileList: [oldAvatar] }).catch(function () {});
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

  shareApp() {
    wx.showModal({
      title: '分享给TA',
      content: '请点击右上角「···」按钮，选择「发送给朋友」即可分享',
      showCancel: false,
      confirmText: '知道了',
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

  goPhotos() {
    wx.navigateTo({ url: '/pages/photos/photos' });
  },

  /**
   * 跳转到卡片图鉴
   */
  goCollection() {
    wx.navigateTo({ url: '/pages/gacha-collection/gacha-collection' });
  },

  /**
   * 解绑并退出空间
   * 同一微信号在所有设备上共享数据，解绑即删除此账号的全部数据
   */
  unbindSpace() {
    var that = this;
    // 第一次确认
    wx.showModal({
      title: '⚠️ 危险操作',
      content: '解绑后，你的所有数据将被删除。\n\n如果你是创建者，整个空间的数据都会被清除。\n\n是否继续？',
      confirmText: '继续',
      confirmColor: '#FF6B81',
      success: function (modalRes) {
        if (!modalRes.confirm) return;
        // 第二次确认
        wx.showModal({
          title: '⚠️ 再次确认',
          content: '数据删除后无法恢复，确定要解绑吗？',
          confirmText: '确认解绑',
          confirmColor: '#FF6B81',
          success: async function (res) {
            if (!res.confirm) return;
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
      });
    }
  });
  },

  noop() {},
  onShareAppMessage() {
    return { title: '邀请你加入恋爱日历！邀请码：' + this.data.inviteCode, path: '/pages/welcome/welcome' };
  },
});