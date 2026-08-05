/**
 * 卡片图鉴页面 - 展示收集的扭蛋卡片
 * 按套系分组，未收集的显示黑影
 */
var util = require('../../utils/util');
var app = getApp();

Page({
  data: {
    allCards: [],           // 所有卡片定义
    collectedCardIds: [],   // 已收集的卡片ID列表
    sets: [],               // 套系列表
    activeSetId: '',        // 当前选中的套系
    filterCards: [],        // 过滤后的卡片列表
    totalCollected: 0,      // 总收集数
    totalCards: 0,          // 总卡片数
  },

  onLoad: function () {
    if (!app.globalData.openidReady) {
      var that = this;
      setTimeout(function () { that.onLoad(); }, 300);
      return;
    }
    if (!app.globalData.isBound) {
      app.checkBindStatus().then(function (bound) {
        if (!bound) {
          wx.reLaunch({ url: '/pages/welcome/welcome' });
          return;
        }
        this.loadData();
      }.bind(this));
      return;
    }
    this.loadData();
  },

  onShow: function () {
    if (app.globalData.openidReady && app.globalData.isBound) {
      this.loadData();
    }
  },

  /**
   * 加载图鉴数据
   */
  async loadData() {
    var allCards = util.getGachaCards();
    var sets = util.getGachaSets();
    var myUid = app.getUserId();
    var coupleId = app.globalData.coupleId;
    var db = app.getDb();

    // 查询双方收集的卡片（两人所有记录一起查）
    var collectedCardIds = [];
    try {
      var allRes = await db.collection('gacha_records').where({
        coupleId: coupleId
      }).get();
      allRes.data.forEach(function (r) {
        if (collectedCardIds.indexOf(r.cardId) === -1) {
          collectedCardIds.push(r.cardId);
        }
      });
    } catch (e) {
      console.error('加载收集记录失败:', e);
    }

    // 默认选中第一个套系
    var activeSetId = sets.length > 0 ? sets[0].setId : '';

    // 计算每个套系的收集进度（WXML 中无法调用方法，需提前计算）
    sets = sets.map(function (s) {
      var setCards = allCards.filter(function (c) { return c.setId === s.setId; });
      var collected = setCards.filter(function (c) { return collectedCardIds.indexOf(c.cardId) !== -1; });
      s.progress = collected.length + '/' + setCards.length;
      return s;
    });

    this.setData({
      allCards: allCards,
      collectedCardIds: collectedCardIds,
      sets: sets,
      activeSetId: activeSetId,
      totalCollected: collectedCardIds.length,
      totalCards: allCards.length,
    });

    this.filterBySet();
  },

  /**
   * 按套系过滤卡片
   */
  filterBySet: function () {
    var activeSetId = this.data.activeSetId;
    var allCards = this.data.allCards;
    var collectedCardIds = this.data.collectedCardIds;

    var filterCards = allCards.filter(function (c) {
      return c.setId === activeSetId;
    }).map(function (c) {
      return {
        cardId: c.cardId,
        title: c.title,
        description: c.description,
        rarity: c.rarity,
        emoji: c.emoji,
        color: c.color,
        setName: c.setName,
        collected: collectedCardIds.indexOf(c.cardId) !== -1,
      };
    });

    this.setData({ filterCards: filterCards });
  },

  /**
   * 切换套系
   */
  switchSet: function (e) {
    var setId = e.currentTarget.dataset.setid;
    this.setData({ activeSetId: setId });
    this.filterBySet();
  },

  /**
   * 跳转到扭蛋页
   */
  goGacha() {
    wx.navigateTo({ url: '/pages/gacha/gacha' });
  },

  noop: function () {},
  onShareAppMessage: function () {
    return { title: '恋爱日历 - 卡片图鉴 💕', path: '/pages/welcome/welcome' };
  },
});