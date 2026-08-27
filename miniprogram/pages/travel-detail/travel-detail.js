/**
 * 旅行详情页 - 基本信息 + 6 个 tab 分区明细
 * 支持查看、弹窗内联编辑/新增/删除明细，编辑/删除旅行
 * 模式照抄 anniversary-detail 的 loadDetail + gacha-collection 的 tab 切换
 */
var util = require('../../utils/util');
var app = getApp();

// 6 个分区配置：key / 名称 / emoji / 字段定义（用于弹窗表单渲染）
var CATEGORIES = [
  { key: 'itinerary', name: '行程', emoji: '🗺️' },
  { key: 'lodging', name: '住宿', emoji: '🏨' },
  { key: 'restaurant', name: '餐厅', emoji: '🍽️' },
  { key: 'ticket', name: '门票', emoji: '🎫' },
  { key: 'budget', name: '预算', emoji: '💰' },
  { key: 'packing', name: '准备', emoji: '🎒' },
];

// 各分区弹窗表单字段配置：fieldKey / label / 类型(input/textarea)
var FIELD_CONFIG = {
  itinerary: [
    { key: 'day', label: '第几天', type: 'input', placeholder: '如 1' },
    { key: 'timeSlot', label: '时段', type: 'input', placeholder: '如 早上' },
    { key: 'activity', label: '景点/活动', type: 'input', placeholder: '如 漫步大理古城' },
    { key: 'playDuration', label: '建议游玩', type: 'input', placeholder: '如 1.5-2h' },
    { key: 'nextStop', label: '前往下一站', type: 'input', placeholder: '如 步行' },
    { key: 'remark', label: '备注', type: 'input', placeholder: '备注信息' },
    { key: 'lodgingNote', label: '当日住宿', type: 'input', placeholder: '当天住宿说明（可空）' },
  ],
  lodging: [
    { key: 'date', label: '日期', type: 'input', placeholder: '如 Day 1' },
    { key: 'area', label: '推荐区域', type: 'input', placeholder: '如 大理古城' },
    { key: 'hotel', label: '民宿/酒店', type: 'input', placeholder: '如 大理沐山汐·沽月酒店' },
    { key: 'price', label: '预算(双人/晚)', type: 'input', placeholder: '如 500-800 元' },
    { key: 'feature', label: '特色', type: 'input', placeholder: '如 古城内，闹中取静' },
  ],
  restaurant: [
    { key: 'name', label: '餐厅名称', type: 'input', placeholder: '如 段公子餐厅' },
    { key: 'area', label: '所在区域', type: 'input', placeholder: '如 大理古城（Day1）' },
    { key: 'dishes', label: '推荐菜品/特色', type: 'input', placeholder: '如 云南特色菜、雕梅扣肉' },
    { key: 'perCapita', label: '人均(元)', type: 'input', placeholder: '如 约 80-120' },
    { key: 'remark', label: '备注', type: 'input', placeholder: '备注信息' },
  ],
  ticket: [
    { key: 'project', label: '项目', type: 'input', placeholder: '如 苍山洗马潭大索道' },
    { key: 'singlePrice', label: '单人票价', type: 'input', placeholder: '如 300 元' },
    { key: 'couplePrice', label: '双人费用', type: 'input', placeholder: '如 600 元' },
    { key: 'bookingMethod', label: '预订方式', type: 'input', placeholder: '如 携程/美团提前订' },
    { key: 'remark', label: '备注', type: 'input', placeholder: '备注信息' },
  ],
  budget: [
    { key: 'budgetCategory', label: '费用类别', type: 'input', placeholder: '如 往返交通' },
    { key: 'amount', label: '预估金额(双人)', type: 'input', placeholder: '如 5000-7000 元' },
    { key: 'remark', label: '备注', type: 'input', placeholder: '备注信息' },
  ],
  packing: [
    { key: 'packCategory', label: '类别', type: 'input', placeholder: '如 证件' },
    { key: 'item', label: '物品', type: 'input', placeholder: '如 身份证、驾驶证' },
    { key: 'remark', label: '备注', type: 'input', placeholder: '备注信息' },
  ],
};

Page({
  data: {
    tripId: '',
    trip: {},
    loading: true,
    categories: CATEGORIES,
    activeCategory: 'itinerary',  // 当前选中 tab
    groupedItems: {},            // 按 category 分组的明细
    currentList: [],             // 当前 tab 的明细列表（渲染用）
    // 弹窗编辑
    showEditModal: false,
    editCategory: '',
    editFields: [],
    editingItem: null,           // null=新增，对象=编辑
    formData: {},                 // 弹窗表单数据
    saving: false,
  },

  onLoad: function (options) {
    if (options.id) {
      this.setData({ tripId: options.id });
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
      return;
    }
    this.loadDetail();
  },

  /**
   * 加载旅行详情 + 所有明细行
   */
  async loadDetail() {
    var db = app.getDb();
    var id = this.data.tripId;
    if (!id) return;

    this.setData({ loading: true });

    try {
      // 1. 旅行基本信息
      var tripRes = await db.collection('trips').doc(id).get();
      var trip = tripRes.data;
      if (!trip) {
        wx.showToast({ title: '旅行不存在', icon: 'none' });
        wx.navigateBack();
        return;
      }

      // 倒计时
      var today = util.getToday();
      var daysToStart = util.daysBetween(today, trip.startDate);
      var daysToEnd = util.daysBetween(today, trip.endDate);
      if (daysToStart > 0) {
        trip.countdown = daysToStart;
        trip.countdownLabel = '天后出发';
      } else if (daysToEnd >= 0) {
        trip.countdown = '进行中';
        trip.countdownLabel = '旅行中';
      } else {
        trip.countdown = Math.abs(daysToEnd);
        trip.countdownLabel = '天前结束';
      }

      this.setData({ trip: trip });

      // 封面图转换（照抄 anniversary-detail 模式）
      if (trip.coverImage && trip.coverImage.indexOf('cloud://') === 0) {
        util.convertCloudFileIDs([trip.coverImage]).then(function (urlMap) {
          if (urlMap[trip.coverImage]) {
            trip.coverImage = urlMap[trip.coverImage];
            this.setData({ trip: trip });
          }
        }.bind(this));
      }

      // 2. 所有明细行（云数据库 get 默认只返回 20 条，需分页取全部）
      var allItems = [];
      var pageSize = 20;
      var skip = 0;
      // 循环取，每次 20 条，直到取空
      while (true) {
        var pageRes = await db.collection('trip_items')
          .where({ tripId: id })
          .orderBy('category', 'asc')
          .orderBy('sortOrder', 'asc')
          .skip(skip)
          .limit(pageSize)
          .get();
        allItems = allItems.concat(pageRes.data);
        if (pageRes.data.length < pageSize) break;
        skip += pageSize;
        // 安全上限，避免异常死循环
        if (skip > 500) break;
      }

      // 3. 按 category 分组
      var grouped = {};
      CATEGORIES.forEach(function (c) { grouped[c.key] = []; });
      allItems.forEach(function (item) {
        if (grouped[item.category]) grouped[item.category].push(item);
      });

      // 4. itinerary 再按 day 分组（渲染时按天展示）
      grouped.itinerary = this.groupItineraryByDay(grouped.itinerary);

      this.setData({ groupedItems: grouped });
      this.renderCurrentList();
    } catch (err) {
      console.error('加载旅行详情失败:', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  /**
   * 将行程明细按 day 分组，返回 [{day, items}] 结构
   */
  groupItineraryByDay: function (items) {
    var dayMap = {};
    var dayOrder = [];
    items.forEach(function (item) {
      var day = item.fields.day || 0;
      if (!dayMap[day]) {
        dayMap[day] = [];
        dayOrder.push(day);
      }
      dayMap[day].push(item);
    });
    dayOrder.sort(function (a, b) { return a - b; });
    return dayOrder.map(function (day) {
      return { day: day, items: dayMap[day] };
    });
  },

  /**
   * 渲染当前 tab 的明细列表
   */
  renderCurrentList: function () {
    var active = this.data.activeCategory;
    var grouped = this.data.groupedItems;
    this.setData({ currentList: grouped[active] || [] });
  },

  /**
   * 切换 tab
   */
  switchCategory: function (e) {
    var key = e.currentTarget.dataset.key;
    this.setData({ activeCategory: key });
    this.renderCurrentList();
  },

  /**
   * 打开新增明细弹窗
   */
  addItem: function () {
    var category = this.data.activeCategory;
    // 新增时 day 默认取当前 tab 最大 day+1（仅 itinerary）
    var formData = {};
    if (category === 'itinerary') {
      var days = this.data.groupedItems.itinerary || [];
      var maxDay = days.length > 0 ? days[days.length - 1].day : 0;
      formData.day = String(maxDay + 1);
    }
    // 把 value 注入字段配置，避免 WXML 动态 key 绑定不刷新
    var editFields = FIELD_CONFIG[category].map(function (f) {
      return { key: f.key, label: f.label, type: f.type, placeholder: f.placeholder, value: formData[f.key] || '' };
    });
    this.setData({
      showEditModal: true,
      editCategory: category,
      editFields: editFields,
      editingItem: null,
      formData: formData,
    });
  },

  /**
   * 打开编辑明细弹窗
   */
  editItem: function (e) {
    var item = e.currentTarget.dataset.item;
    var category = item.category;
    // 把 fields 拷到 formData 供表单回填
    var formData = {};
    // 把 value 注入字段配置，避免 WXML 动态 key 绑定不刷新
    var editFields = FIELD_CONFIG[category].map(function (f) {
      var v = item.fields[f.key] != null ? String(item.fields[f.key]) : '';
      formData[f.key] = v;
      return { key: f.key, label: f.label, type: f.type, placeholder: f.placeholder, value: v };
    });
    this.setData({
      showEditModal: true,
      editCategory: category,
      editFields: editFields,
      editingItem: item,
      formData: formData,
    });
  },

  /**
   * 表单输入：同步更新 editFields[index].value 和 formData[key]
   */
  onFieldInput: function (e) {
    var index = e.currentTarget.dataset.index;
    var key = e.currentTarget.dataset.key;
    var value = e.detail.value;
    var editFields = this.data.editFields;
    editFields[index].value = value;
    var formData = this.data.formData;
    formData[key] = value;
    this.setData({ editFields: editFields, formData: formData });
  },

  /**
   * 关闭弹窗
   */
  closeEditModal: function () {
    this.setData({ showEditModal: false });
  },

  noop: function () {},

  /**
   * 保存明细（新增或更新）
   */
  async saveItem() {
    if (this.data.saving) return;
    var category = this.data.editCategory;
    var formData = this.data.formData;
    var fields = {};
    var hasContent = false;
    FIELD_CONFIG[category].forEach(function (f) {
      var v = (formData[f.key] || '').trim();
      fields[f.key] = v;
      if (v) hasContent = true;
    });
    if (!hasContent) {
      wx.showToast({ title: '请至少填写一项', icon: 'none' });
      return;
    }
    // itinerary 的 day 转数字
    if (category === 'itinerary' && fields.day) {
      fields.day = parseInt(fields.day) || 0;
    }

    this.setData({ saving: true });
    var db = app.getDb();
    var now = new Date().toISOString();
    var uid = app.getUserId();

    try {
      if (this.data.editingItem) {
        // 更新
        await db.collection('trip_items').doc(this.data.editingItem._id).update({
          data: { fields: fields, updatedAt: now },
        });
      } else {
        // 新增：sortOrder 取当前分区最大值+1
        var list = this.data.groupedItems[category] || [];
        var maxSort = 0;
        if (category === 'itinerary') {
          // itinerary 是按天分组的结构，需展开取最大 sortOrder
          list.forEach(function (g) {
            (g.items || []).forEach(function (it) {
              if (it.sortOrder > maxSort) maxSort = it.sortOrder;
            });
          });
        } else {
          list.forEach(function (it) {
            if (it.sortOrder > maxSort) maxSort = it.sortOrder;
          });
        }
        await db.collection('trip_items').add({
          data: {
            tripId: this.data.tripId,
            coupleId: app.globalData.coupleId,
            category: category,
            sortOrder: maxSort + 1,
            fields: fields,
            createdBy: uid,
            createdAt: now,
            updatedAt: now,
          },
        });
      }
      wx.showToast({ title: '已保存', icon: 'success' });
      this.setData({ showEditModal: false });
      this.loadDetail();
    } catch (err) {
      console.error('保存明细失败:', err);
      wx.showToast({ title: '保存失败', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  },

  /**
   * 删除明细
   */
  deleteItem: function (e) {
    var that = this;
    var item = e.currentTarget.dataset.item;
    wx.showModal({
      title: '删除确认',
      content: '确定删除这条明细吗？',
      confirmColor: '#FF6B81',
      success: async function (res) {
        if (!res.confirm) return;
        try {
          await app.getDb().collection('trip_items').doc(item._id).remove();
          wx.showToast({ title: '已删除', icon: 'success' });
          that.loadDetail();
        } catch (err) {
          console.error('删除明细失败:', err);
          wx.showToast({ title: '删除失败（无权限）', icon: 'none' });
        }
      },
    });
  },

  /**
   * 编辑旅行基本信息
   */
  editTrip: function () {
    wx.navigateTo({ url: '/pages/travel-edit/travel-edit?id=' + this.data.tripId });
  },

  /**
   * 删除旅行（级联删除明细）
   */
  deleteTrip: function () {
    var that = this;
    wx.showModal({
      title: '删除旅行',
      content: '确定删除「' + that.data.trip.title + '」吗？所有行程明细也会被删除。',
      confirmColor: '#FF6B81',
      success: async function (res) {
        if (!res.confirm) return;
        try {
          wx.showLoading({ title: '删除中...' });
          var db = app.getDb();
          var id = that.data.tripId;
          // 删除封面图
          if (that.data.trip.coverImage) {
            wx.cloud.deleteFile({ fileList: [that.data.trip.coverImage] }).catch(function () {});
          }
          // 删除所有明细
          await db.collection('trip_items').where({ tripId: id }).remove();
          // 删除旅行
          await db.collection('trips').doc(id).remove();
          wx.hideLoading();
          wx.showToast({ title: '已删除', icon: 'success' });
          setTimeout(function () { wx.navigateBack(); }, 1500);
        } catch (err) {
          wx.hideLoading();
          console.error('删除旅行失败:', err);
          wx.showToast({ title: '删除失败', icon: 'none' });
        }
      },
    });
  },

  onShareAppMessage: function () {
    return { title: '恋爱日历 - 旅行计划 ✈️', path: '/pages/welcome/welcome' };
  },
});
