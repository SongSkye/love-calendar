/**
 * 旅行计划列表页
 * 展示所有旅行卡片，支持新增、加载示例攻略
 * 模式照抄 anniversary 列表页
 */
var util = require('../../utils/util');
var sample = require('../../utils/travel-sample');
var packing = require('../../utils/travel-packing');
var app = getApp();

Page({
  data: {
    trips: [],
    loading: false,
    // 出行准备清单（存 couples.packingList，双方共享，所有旅行共用一份）
    packingList: [],
    showPackingModal: false,
    packingEditing: false,
    packingSaving: false,
    packingDraft: null,
  },

  onShow: function () {
    // 等待 openid 获取完成（照抄 anniversary 模式）
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
    this.loadTrips();
    this.loadPackingList();
  },

  /**
   * 加载出行准备清单（存 couples.packingList，双方共享）
   * 首次没有 / 加载失败时用 travel-packing.js 的默认清单初始化展示，保证弹窗不为空
   */
  async loadPackingList() {
    var db = app.getDb();
    var coupleId = app.globalData.coupleId;
    if (!coupleId) {
      // 无 coupleId 也兜底默认清单，避免弹窗空白
      this.setData({ packingList: packing.PACKING_LIST });
      return;
    }
    try {
      var res = await db.collection('couples').doc(coupleId).get();
      var list = res.data && res.data.packingList;
      if (!list || list.length === 0) {
        list = packing.PACKING_LIST;
      }
      this.setData({ packingList: list });
    } catch (err) {
      console.error('加载准备清单失败:', err);
      // 出错兜底默认清单，避免弹窗空白
      this.setData({ packingList: packing.PACKING_LIST });
    }
  },

  // ===== 出行准备弹窗 =====
  togglePacking: function () {
    this.setData({ showPackingModal: !this.data.showPackingModal, packingEditing: false });
  },

  closePacking: function () {
    this.setData({ showPackingModal: false, packingEditing: false });
  },

  noop: function () {},

  editPacking: function () {
    var draft = JSON.parse(JSON.stringify(this.data.packingList));
    this.setData({ packingEditing: true, packingDraft: draft });
  },

  cancelEditPacking: function () {
    this.setData({ packingEditing: false, packingDraft: null });
  },

  onPackingItemInput: function (e) {
    var catIdx = e.currentTarget.dataset.cat;
    var idx = e.currentTarget.dataset.idx;
    var draft = this.data.packingDraft;
    draft[catIdx].items[idx] = e.detail.value;
    this.setData({ packingDraft: draft });
  },

  onPackingCategoryInput: function (e) {
    var catIdx = e.currentTarget.dataset.cat;
    var draft = this.data.packingDraft;
    draft[catIdx].category = e.detail.value;
    this.setData({ packingDraft: draft });
  },

  addPackingItem: function (e) {
    var catIdx = e.currentTarget.dataset.cat;
    var draft = this.data.packingDraft;
    draft[catIdx].items.push('');
    this.setData({ packingDraft: draft });
  },

  removePackingItem: function (e) {
    var catIdx = e.currentTarget.dataset.cat;
    var idx = e.currentTarget.dataset.idx;
    var draft = this.data.packingDraft;
    draft[catIdx].items.splice(idx, 1);
    this.setData({ packingDraft: draft });
  },

  addPackingCategory: function () {
    var draft = this.data.packingDraft;
    draft.push({ category: '新类别', emoji: '🎒', items: [''] });
    this.setData({ packingDraft: draft });
  },

  removePackingCategory: function (e) {
    var catIdx = e.currentTarget.dataset.cat;
    var draft = this.data.packingDraft;
    draft.splice(catIdx, 1);
    this.setData({ packingDraft: draft });
  },

  /**
   * 保存准备清单到 couples.packingList（走云函数，双方同步）
   */
  async savePacking() {
    if (this.data.packingSaving) return;
    var draft = this.data.packingDraft;
    // 清洗：去掉空类别、空条目
    var cleaned = draft
      .filter(function (c) { return (c.category || '').trim() && c.items.length > 0; })
      .map(function (c) {
        return {
          category: (c.category || '').trim(),
          emoji: c.emoji || '🎒',
          items: c.items.filter(function (it) { return (it || '').trim(); }).map(function (it) { return (it || '').trim(); }),
        };
      })
      .filter(function (c) { return c.items.length > 0; });

    this.setData({ packingSaving: true });
    try {
      var res = await wx.cloud.callFunction({
        name: 'updateTripItem',
        data: {
          action: 'updatePackingList',
          coupleId: app.globalData.coupleId,
          data: { packingList: cleaned },
        },
      });
      if (!res.result || !res.result.success) {
        throw new Error(res.result ? res.result.message : '云函数返回异常');
      }
      this.setData({ packingList: cleaned, packingEditing: false, packingDraft: null });
      wx.showToast({ title: '已保存', icon: 'success' });
    } catch (err) {
      console.error('保存准备清单失败:', err);
      wx.showToast({ title: '保存失败', icon: 'none' });
    } finally {
      this.setData({ packingSaving: false });
    }
  },

  /**
   * 加载所有旅行
   */
  async loadTrips() {
    this.setData({ loading: true });
    var db = app.getDb();
    var coupleId = app.globalData.coupleId;

    try {
      // 云数据库 get 默认只返 20 条，旅行多了会丢，分页循环取全部（同详情页 loadDetail 模式）
      var allTrips = [];
      var pageSize = 20;
      var skip = 0;
      while (true) {
        var pageRes = await db.collection('trips')
          .where({ coupleId: coupleId })
          .orderBy('startDate', 'desc')
          .skip(skip)
          .limit(pageSize)
          .get();
        allTrips = allTrips.concat(pageRes.data);
        if (pageRes.data.length < pageSize) break;
        skip += pageSize;
        if (skip > 500) break; // 安全上限，避免异常死循环
      }
      var res = { data: allTrips };

      var today = util.getToday();
      var list = res.data.map(function (item) {
        // 倒计时：正数=距出发还有X天，负数=已结束X天
        var daysToStart = util.daysBetween(today, item.startDate);
        var daysToEnd = util.daysBetween(today, item.endDate);
        var countdown;
        var countdownLabel;
        if (daysToStart > 0) {
          countdown = daysToStart;
          countdownLabel = '天后出发';
        } else if (daysToEnd >= 0) {
          countdown = '进行中';
          countdownLabel = '旅行中';
        } else {
          countdown = Math.abs(daysToEnd);
          countdownLabel = '天前结束';
        }
        return Object.assign({}, item, {
          countdown: countdown,
          countdownLabel: countdownLabel,
        });
      });

      this.setData({ trips: list });

      // 封面图 cloud:// 转临时链接（照抄 anniversary 模式）
      var fileIds = list
        .filter(function (item) { return item.coverImage && item.coverImage.indexOf('cloud://') === 0; })
        .map(function (item) { return item.coverImage; });

      if (fileIds.length > 0) {
        util.convertCloudFileIDs(fileIds).then(function (urlMap) {
          var updated = list.map(function (item) {
            if (item.coverImage && urlMap[item.coverImage]) {
              item.coverImage = urlMap[item.coverImage];
            }
            return item;
          });
          this.setData({ trips: updated });
        }.bind(this));
      }
    } catch (err) {
      console.error('加载旅行失败:', err);
    } finally {
      this.setData({ loading: false });
    }
  },

  /**
   * 新增旅行
   */
  addTrip: function () {
    wx.navigateTo({ url: '/pages/travel-edit/travel-edit' });
  },

  /**
   * 进入旅行详情
   */
  goDetail: function (e) {
    var id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/travel-detail/travel-detail?id=' + id });
  },

  /**
   * 一键加载大理蜜月攻略示例数据
   * 创建 trips 文档 + 批量创建 trip_items 明细行
   */
  loadSample: async function () {
    var that = this;
    wx.showModal({
      title: '加载示例攻略',
      content: '将导入「大理蜜月旅行攻略」完整内容（行程、住宿、餐厅、门票、准备），可在此基础上修改。是否继续？',
      confirmText: '导入',
      confirmColor: '#FF6B81',
      success: async function (res) {
        if (!res.confirm) return;
        await that.doLoadSample();
      },
    });
  },

  async doLoadSample() {
    wx.showLoading({ title: '导入中...', mask: true });
    var db = app.getDb();
    var coupleId = app.globalData.coupleId;
    var uid = app.getUserId();
    var now = new Date().toISOString();

    try {
      // 1. 创建 trips 文档
      var tripRes = await db.collection('trips').add({
        data: Object.assign({}, sample.TRIP_BASE, {
          coupleId: coupleId,
          createdBy: uid,
          createdAt: now,
          updatedAt: now,
        }),
      });
      var tripId = tripRes._id;

      // 2. 逐条创建 trip_items（串行 add，避免并发限流导致部分丢失）
      var items = sample.TRIP_ITEMS.map(function (item) {
        return {
          tripId: tripId,
          coupleId: coupleId,
          category: item.category,
          sortOrder: item.sortOrder,
          fields: item.fields,
          createdBy: uid,
          createdAt: now,
          updatedAt: now,
        };
      });

      var successCount = 0;
      for (var i = 0; i < items.length; i++) {
        try {
          await db.collection('trip_items').add({ data: items[i] });
          successCount++;
        } catch (e) {
          console.warn('第' + i + '条明细导入失败:', e);
        }
      }

      wx.hideLoading();
      if (successCount < items.length) {
        wx.showToast({ title: '部分明细未导入(' + successCount + '/' + items.length + ')', icon: 'none', duration: 3000 });
      } else {
        wx.showToast({ title: '攻略已导入', icon: 'success' });
      }
      // 跳转到详情页查看
      setTimeout(function () {
        wx.navigateTo({ url: '/pages/travel-detail/travel-detail?id=' + tripId });
      }, 1500);
    } catch (err) {
      wx.hideLoading();
      console.error('导入示例攻略失败:', err);
      wx.showToast({ title: '导入失败', icon: 'none' });
    }
  },

  onShareAppMessage: function () {
    return { title: '恋爱日历 - 旅行计划 ✈️', path: '/pages/welcome/welcome' };
  },
});
