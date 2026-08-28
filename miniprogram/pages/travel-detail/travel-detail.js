/**
 * 旅行详情页 - 基本信息 + 5 个 tab 分区明细
 * 支持查看、弹窗内联编辑/新增/删除明细，编辑/删除旅行
 * 出行准备清单已移至旅行列表页（travel），此处不再展示
 * 模式照抄 anniversary-detail 的 loadDetail + gacha-collection 的 tab 切换
 */
var util = require('../../utils/util');
var app = getApp();

// 4 个分区配置：key / 名称 / emoji / 是否支持预订状态
// 交通已整合进行程（航班/时间/价格写 activity 或 remark，座位+预订状态并入行程字段）
// 准备（packing）已移至旅行列表页（travel）的「🎒 出行准备」入口，存 couples.packingList 双方共享
var CATEGORIES = [
  { key: 'itinerary', name: '行程', emoji: '🗺️', hasBooking: true },
  { key: 'lodging', name: '住宿', emoji: '🏨', hasBooking: true },
  { key: 'restaurant', name: '餐厅', emoji: '🍽️', hasBooking: true },
  { key: 'ticket', name: '门票', emoji: '🎫', hasBooking: true },
];

// 预订状态选项（hasBooking=true 的分区共用）
var BOOKING_OPTIONS = [
  { value: 'pending', label: '待订' },
  { value: 'booked', label: '已订' },
];

// 把预订状态 value（booked/pending）转成 BOOKING_OPTIONS 索引，供 picker 回填
function bookingValueToIndex(value) {
  for (var i = 0; i < BOOKING_OPTIONS.length; i++) {
    if (BOOKING_OPTIONS[i].value === value) return i;
  }
  return 0; // 默认「待订」
}

// 各分区弹窗表单字段配置：fieldKey / label / 类型(input/textarea)
var FIELD_CONFIG = {
  // 行程：景点/活动可填航班车次+时间，座位+预订状态结构化，价格写备注
  itinerary: [
    { key: 'day', label: '第几天', type: 'input', placeholder: '如 1' },
    { key: 'timeSlot', label: '时段', type: 'input', placeholder: '如 早上' },
    { key: 'activity', label: '景点/活动', type: 'input', placeholder: '如 漫步大理古城 / 洛阳✈昆明 MU5780 08:30-11:00' },
    { key: 'playDuration', label: '建议游玩', type: 'input', placeholder: '如 1.5-2h / 飞行2.5h' },
    { key: 'nextStop', label: '前往下一站', type: 'input', placeholder: '如 步行 / 机场→昆明南站' },
    { key: 'seat', label: '座位', type: 'input', placeholder: '如 23A/23B' },
    { key: 'remark', label: '备注', type: 'input', placeholder: '如 1280元/人 去程' },
    { key: 'lodgingNote', label: '当日住宿', type: 'input', placeholder: '当天住宿说明（可空）' },
    { key: 'bookingStatus', label: '预订状态', type: 'booking', placeholder: '' },
  ],
  lodging: [
    { key: 'date', label: '日期', type: 'input', placeholder: '如 Day 1' },
    { key: 'area', label: '推荐区域', type: 'input', placeholder: '如 大理古城' },
    { key: 'hotel', label: '民宿/酒店', type: 'input', placeholder: '如 大理沐山汐·沽月酒店' },
    { key: 'price', label: '预算(双人/晚)', type: 'input', placeholder: '如 500-800 元' },
    { key: 'feature', label: '特色', type: 'input', placeholder: '如 古城内，闹中取静' },
    { key: 'bookingStatus', label: '预订状态', type: 'booking', placeholder: '' },
  ],
  restaurant: [
    { key: 'name', label: '餐厅名称', type: 'input', placeholder: '如 段公子餐厅' },
    { key: 'area', label: '所在区域', type: 'input', placeholder: '如 大理古城（Day1）' },
    { key: 'dishes', label: '推荐菜品/特色', type: 'input', placeholder: '如 云南特色菜、雕梅扣肉' },
    { key: 'perCapita', label: '人均(元)', type: 'input', placeholder: '如 约 80-120' },
    { key: 'remark', label: '备注', type: 'input', placeholder: '备注信息' },
    { key: 'bookingStatus', label: '预订状态', type: 'booking', placeholder: '' },
  ],
  ticket: [
    { key: 'project', label: '项目', type: 'input', placeholder: '如 苍山洗马潭大索道' },
    { key: 'singlePrice', label: '单人票价', type: 'input', placeholder: '如 300 元' },
    { key: 'couplePrice', label: '双人费用', type: 'input', placeholder: '如 600 元' },
    { key: 'bookingMethod', label: '预订方式', type: 'input', placeholder: '如 携程/美团提前订' },
    { key: 'remark', label: '备注', type: 'input', placeholder: '备注信息' },
    { key: 'bookingStatus', label: '预订状态', type: 'booking', placeholder: '' },
  ],
};

Page({
  data: {
    tripId: '',
    trip: {},
    loading: true,
    categories: CATEGORIES,
    bookingOptions: BOOKING_OPTIONS,
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

      // 4. 住宿/餐厅/门票按「已订置顶」排序（booked 在前，pending/空 在后，组内保持 sortOrder）
      //    行程（itinerary）不参与——行程按时间顺序排，已订置顶会打乱时间线
      CATEGORIES.forEach(function (c) {
        if (c.hasBooking && c.key !== 'itinerary' && grouped[c.key]) {
          grouped[c.key].sort(function (a, b) {
            var aBooked = a.fields && a.fields.bookingStatus === 'booked';
            var bBooked = b.fields && b.fields.bookingStatus === 'booked';
            if (aBooked && !bBooked) return -1;
            if (!aBooked && bBooked) return 1;
            return (a.sortOrder || 0) - (b.sortOrder || 0);
          });
        }
      });

      // 5. itinerary 再按 day 分组（渲染时按天展示）
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
   * 没填 day 的归到「未排期」组（day 用 null 标记，渲染时显示"未排期"而非"Day 0"）
   */
  groupItineraryByDay: function (items) {
    var dayMap = {};
    var dayOrder = [];
    var unsorted = []; // 没填 day 的行程
    items.forEach(function (item) {
      var rawDay = item.fields.day;
      var day = rawDay ? Number(rawDay) : 0;
      if (!rawDay || isNaN(day) || day <= 0) {
        // 没填天数或非法值，归到「未排期」组
        unsorted.push(item);
        return;
      }
      if (!dayMap[day]) {
        dayMap[day] = [];
        dayOrder.push(day);
      }
      dayMap[day].push(item);
    });
    dayOrder.sort(function (a, b) { return a - b; });
    var groups = dayOrder.map(function (day) {
      return { day: day, items: dayMap[day] };
    });
    // 「未排期」组放最后
    if (unsorted.length > 0) {
      groups.push({ day: null, items: unsorted });
    }
    return groups;
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
      // 找最大的有效 day（排除「未排期」组 day=null）
      var maxDay = 0;
      days.forEach(function (g) {
        if (g.day && g.day > maxDay) maxDay = g.day;
      });
      formData.day = String(maxDay + 1);
    }
    // 有预订状态的分区，新增时默认「待订」
    var catConfig = CATEGORIES.find(function (c) { return c.key === category; });
    if (catConfig && catConfig.hasBooking) {
      formData.bookingStatus = 'pending';
    }
    // 把 value 注入字段配置，避免 WXML 动态 key 绑定不刷新
    var editFields = FIELD_CONFIG[category].map(function (f) {
      var val = formData[f.key] || '';
      var field = { key: f.key, label: f.label, type: f.type, placeholder: f.placeholder, value: val };
      // booking 字段额外存 valueIndex（picker 的 value 要索引而非字符串）
      if (f.type === 'booking') {
        field.valueIndex = bookingValueToIndex(val);
      }
      return field;
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
      var raw = item.fields[f.key];
      var v;
      if (f.type === 'booking') {
        // booking 字段存的是 status 值（booked/pending），原样保留，不转 String 以免 'null'/'undefined'
        v = raw || 'pending';
      } else {
        v = raw != null ? String(raw) : '';
      }
      formData[f.key] = v;
      var field = { key: f.key, label: f.label, type: f.type, placeholder: f.placeholder, value: v };
      if (f.type === 'booking') {
        field.valueIndex = bookingValueToIndex(v);
      }
      return field;
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
   * 仅用于 input/textarea（bindinput），e.detail.value 是文本
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
   * 预订状态 picker 选中：bindchange 的 e.detail.value 是选中项索引（0/1），
   * 需转成实际 value（booked/pending）再存，否则存进去是数字导致显示异常
   * 同时更新 valueIndex 供 picker 回填
   */
  onBookingChange: function (e) {
    var index = e.currentTarget.dataset.index;
    var key = e.currentTarget.dataset.key;
    var idx = Number(e.detail.value);
    var opt = this.data.bookingOptions[idx] || this.data.bookingOptions[0];
    var value = opt.value;
    var editFields = this.data.editFields;
    editFields[index].value = value;
    editFields[index].valueIndex = idx;
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
    var now = new Date().toISOString();
    var uid = app.getUserId();

    try {
      if (this.data.editingItem) {
        // 更新（走云函数，admin 权限，双方都能改）
        var updateRes = await wx.cloud.callFunction({
          name: 'updateTripItem',
          data: { action: 'update', id: this.data.editingItem._id, data: { fields: fields } },
        });
        if (!updateRes.result || !updateRes.result.success) {
          throw new Error(updateRes.result ? updateRes.result.message : '云函数返回异常');
        }
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
        // 新增也走云函数（admin 权限写入，_openid 统一，后续双方都能改）
        var addRes = await wx.cloud.callFunction({
          name: 'updateTripItem',
          data: {
            action: 'add',
            data: {
              tripId: this.data.tripId,
              coupleId: app.globalData.coupleId,
              category: category,
              sortOrder: maxSort + 1,
              fields: fields,
              createdBy: uid,
            },
          },
        });
        if (!addRes.result || !addRes.result.success) {
          throw new Error(addRes.result ? addRes.result.message : '云函数返回异常');
        }
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
          // 走云函数删除（admin 权限，双方都能删）
          var delRes = await wx.cloud.callFunction({
            name: 'updateTripItem',
            data: { action: 'delete', id: item._id },
          });
          if (!delRes.result || !delRes.result.success) {
            throw new Error(delRes.result ? delRes.result.message : '云函数返回异常');
          }
          wx.showToast({ title: '已删除', icon: 'success' });
          that.loadDetail();
        } catch (err) {
          console.error('删除明细失败:', err);
          wx.showToast({ title: '删除失败', icon: 'none' });
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
          var id = that.data.tripId;
          // 删除封面图
          if (that.data.trip.coverImage) {
            wx.cloud.deleteFile({ fileList: [that.data.trip.coverImage] }).catch(function () {});
          }
          // 走云函数级联删除（admin 权限，双方都能删）
          var delRes = await wx.cloud.callFunction({
            name: 'updateTripItem',
            data: { action: 'deleteTrip', id: id },
          });
          if (!delRes.result || !delRes.result.success) {
            throw new Error(delRes.result ? delRes.result.message : '云函数返回异常');
          }
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
