/**
 * 旅行编辑页 - 新建/编辑旅行基本信息
 * 不含明细（明细在详情页 tab 内弹窗录入）
 * 模式照抄 anniversary-record 的 isEdit + chooseCover + saveAll
 */
var util = require('../../utils/util');
var app = getApp();

Page({
  data: {
    isEdit: false,
    tripId: '',
    title: '',
    destination: '',
    departure: '',
    startDate: '',
    endDate: '',
    days: '',
    nights: '',
    travelType: '',
    travelers: '',
    transport: '',
    budgetMin: '',
    budgetMax: '',
    budgetNote: '',
    tone: '',
    coverImage: '',
    dailyOverview: [],   // [{day, summary}]
    tips: [],            // [String]
    saving: false,
  },

  onLoad: function (options) {
    if (options.id) {
      this.setData({ isEdit: true, tripId: options.id });
      this.loadTrip(options.id);
    }
  },

  onShow: function () {
    // 等待 openid（照抄 anniversary 模式）
    if (!app.globalData.openidReady) {
      var that = this;
      setTimeout(function () { that.onShow(); }, 300);
      return;
    }
    if (!app.globalData.isBound) {
      app.checkBindStatus().then(function (bound) {
        if (!bound) { wx.reLaunch({ url: '/pages/welcome/welcome' }); }
      });
    }
  },

  /**
   * 加载已有旅行信息（编辑模式）
   */
  async loadTrip(id) {
    try {
      wx.showLoading({ title: '加载中...' });
      var res = await app.getDb().collection('trips').doc(id).get();
      if (res.data) {
        var t = res.data;
        this.setData({
          title: t.title || '',
          destination: t.destination || '',
          departure: t.departure || '',
          startDate: t.startDate || '',
          endDate: t.endDate || '',
          days: t.days != null ? String(t.days) : '',
          nights: t.nights != null ? String(t.nights) : '',
          travelType: t.travelType || '',
          travelers: t.travelers || '',
          transport: t.transport || '',
          budgetMin: t.budgetMin != null ? String(t.budgetMin) : '',
          budgetMax: t.budgetMax != null ? String(t.budgetMax) : '',
          budgetNote: t.budgetNote || '',
          tone: t.tone || '',
          coverImage: t.coverImage || '',
          dailyOverview: t.dailyOverview || [],
          tips: t.tips || [],
        });
        // 封面图转临时链接
        if (t.coverImage && t.coverImage.indexOf('cloud://') === 0) {
          util.convertCloudFileIDs([t.coverImage]).then(function (urlMap) {
            if (urlMap[t.coverImage]) {
              this.setData({ coverImage: urlMap[t.coverImage] });
            }
          }.bind(this));
        }
      }
    } catch (err) {
      console.error('加载旅行失败:', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  // ===== 表单输入 =====
  onTitleInput: function (e) { this.setData({ title: e.detail.value }); },
  onDestinationInput: function (e) { this.setData({ destination: e.detail.value }); },
  onDepartureInput: function (e) { this.setData({ departure: e.detail.value }); },
  onStartDateChange: function (e) { this.setData({ startDate: e.detail.value }); },
  onEndDateChange: function (e) { this.setData({ endDate: e.detail.value }); },
  onDaysInput: function (e) { this.setData({ days: e.detail.value }); },
  onNightsInput: function (e) { this.setData({ nights: e.detail.value }); },
  onTravelTypeInput: function (e) { this.setData({ travelType: e.detail.value }); },
  onTravelersInput: function (e) { this.setData({ travelers: e.detail.value }); },
  onTransportInput: function (e) { this.setData({ transport: e.detail.value }); },
  onBudgetMinInput: function (e) { this.setData({ budgetMin: e.detail.value }); },
  onBudgetMaxInput: function (e) { this.setData({ budgetMax: e.detail.value }); },
  onBudgetNoteInput: function (e) { this.setData({ budgetNote: e.detail.value }); },
  onToneInput: function (e) { this.setData({ tone: e.detail.value }); },

  // ===== 每日概览子表单 =====
  onOverviewInput: function (e) {
    var index = e.currentTarget.dataset.index;
    var dailyOverview = this.data.dailyOverview;
    dailyOverview[index].summary = e.detail.value;
    this.setData({ dailyOverview: dailyOverview });
  },
  addOverview: function () {
    var dailyOverview = this.data.dailyOverview;
    dailyOverview.push({ day: dailyOverview.length + 1, summary: '' });
    this.setData({ dailyOverview: dailyOverview });
  },
  removeOverview: function (e) {
    var index = e.currentTarget.dataset.index;
    var dailyOverview = this.data.dailyOverview;
    dailyOverview.splice(index, 1);
    // 重新编号
    dailyOverview.forEach(function (item, i) { item.day = i + 1; });
    this.setData({ dailyOverview: dailyOverview });
  },

  // ===== 温馨提示子表单 =====
  onTipInput: function (e) {
    var index = e.currentTarget.dataset.index;
    var tips = this.data.tips;
    tips[index] = e.detail.value;
    this.setData({ tips: tips });
  },
  addTip: function () {
    var tips = this.data.tips;
    tips.push('');
    this.setData({ tips: tips });
  },
  removeTip: function (e) {
    var index = e.currentTarget.dataset.index;
    var tips = this.data.tips;
    tips.splice(index, 1);
    this.setData({ tips: tips });
  },

  // ===== 封面图上传（照抄 anniversary-record chooseCover）=====
  chooseCover: function () {
    var that = this;
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: function (res) {
        wx.showLoading({ title: '上传中...' });
        var tempPath = res.tempFilePaths[0];
        wx.cloud.uploadFile({
          cloudPath: 'trip_covers/' + Date.now() + '_' + Math.random().toString(36).substr(2, 8) + '.jpg',
          filePath: tempPath,
        }).then(function (uploadRes) {
          // 生成缩略图 base64 存 image_thumbs，供跨用户显示
          util.compressImageToBase64(tempPath, 400, 0.7).then(function (base64) {
            util.saveImageThumb(uploadRes.fileID, base64);
          }).catch(function (e) {
            console.warn('生成缩略图失败:', e);
          });
          wx.hideLoading();
          // 删除旧封面
          if (that.data.coverImage && that.data.coverImage.indexOf('cloud://') === 0) {
            wx.cloud.deleteFile({ fileList: [that.data.coverImage] }).catch(function () {});
          }
          that.setData({ coverImage: uploadRes.fileID });
        }).catch(function () {
          wx.hideLoading();
          wx.showToast({ title: '上传失败', icon: 'none' });
        });
      },
    });
  },

  // ===== 保存 =====
  async saveAll() {
    var title = (this.data.title || '').trim();
    if (!title) { wx.showToast({ title: '请输入旅行名称', icon: 'none' }); return; }
    if (!this.data.startDate) { wx.showToast({ title: '请选择开始日期', icon: 'none' }); return; }

    this.setData({ saving: true });
    var db = app.getDb();
    var coupleId = app.globalData.coupleId;
    var uid = app.getUserId();
    var now = new Date().toISOString();

    // 组装数据，数字字段转 number
    var data = {
      title: title,
      destination: (this.data.destination || '').trim(),
      departure: (this.data.departure || '').trim(),
      startDate: this.data.startDate,
      endDate: this.data.endDate,
      days: this.data.days ? parseInt(this.data.days) : null,
      nights: this.data.nights ? parseInt(this.data.nights) : null,
      travelType: (this.data.travelType || '').trim(),
      travelers: (this.data.travelers || '').trim(),
      transport: (this.data.transport || '').trim(),
      budgetMin: this.data.budgetMin ? parseInt(this.data.budgetMin) : null,
      budgetMax: this.data.budgetMax ? parseInt(this.data.budgetMax) : null,
      budgetNote: (this.data.budgetNote || '').trim(),
      tone: (this.data.tone || '').trim(),
      coverImage: this.data.coverImage,
      dailyOverview: this.data.dailyOverview.filter(function (o) { return (o.summary || '').trim(); }),
      tips: this.data.tips.filter(function (t) { return (t || '').trim(); }),
      updatedAt: now,
    };

    try {
      if (this.data.isEdit) {
        // 编辑走云函数（admin 权限，双方都能改旅行基本信息）
        var updateRes = await wx.cloud.callFunction({
          name: 'updateTripItem',
          data: { action: 'updateTrip', id: this.data.tripId, data: data },
        });
        if (!updateRes.result || !updateRes.result.success) {
          throw new Error(updateRes.result ? updateRes.result.message : '云函数返回异常');
        }
        wx.showToast({ title: '已保存', icon: 'success' });
        setTimeout(function () { wx.navigateBack(); }, 1500);
      } else {
        data.coupleId = coupleId;
        data.createdBy = uid;
        data.createdAt = now;
        var res = await db.collection('trips').add({ data: data });
        var newId = res._id;
        wx.showToast({ title: '已创建', icon: 'success' });
        // 新建后跳转详情页录入明细
        setTimeout(function () {
          wx.redirectTo({ url: '/pages/travel-detail/travel-detail?id=' + newId });
        }, 1500);
      }
    } catch (err) {
      console.error('保存旅行失败:', err);
      wx.showToast({ title: '保存失败', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  },

  onShareAppMessage: function () {
    return { title: '恋爱日历 - 旅行计划 ✈️', path: '/pages/welcome/welcome' };
  },
});
