/**
 * 扭蛋机页面 - 每日抽卡互动
 * 玩法：每天免费扭蛋 1~3 次，随机获得异地恋主题卡片
 */
var util = require('../../utils/util');
var app = getApp();

Page({
  data: {
    // 扭蛋状态
    freePulls: 0,           // 今日剩余免费次数
    maxPulls: 3,            // 每日最大次数
    pulling: false,         // 正在扭蛋中

    // 扭蛋动画状态
    showAnimation: false,   // 显示扭蛋动画
    animationPhase: 'idle', // idle → shaking → opening → reveal
    resultCard: null,       // 抽到的卡片

    // 今日已抽记录
    todayRecords: [],

    // 弹窗
    showResult: false,      // 显示抽卡结果弹窗
  },

  onLoad: function () {
    // 等待 openid 就绪
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
   * 加载扭蛋数据：计算今日剩余次数、已抽记录
   */
  async loadData() {
    var db = app.getDb();
    var coupleId = app.globalData.coupleId;
    var myUid = app.getUserId();
    var today = util.getToday();

    try {
      // 1. 查询今日已抽记录
      var recordsRes = await db.collection('gacha_records').where({
        coupleId: coupleId, uid: myUid, date: today
      }).get();
      var todayRecords = recordsRes.data;

      // 2. 计算已用次数和剩余次数
      var usedPulls = todayRecords.length;

      // 附加卡片信息到每条记录（WXML 中无法调用方法，需提前处理）
      var allCards = util.getGachaCards();
      var cardMap = {};
      allCards.forEach(function (c) { cardMap[c.cardId] = c; });
      todayRecords = todayRecords.map(function (r) {
        var card = cardMap[r.cardId] || {};
        return {
          _id: r._id,
          cardId: r.cardId,
          cardEmoji: card.emoji || '❓',
          cardTitle: card.title || '未知卡片',
          cardColor: card.color || '#CCCCCC',
          cardRarity: card.rarity || 1,
        };
      });

      // 3. 计算获得的额外次数（心情+1，日记+1）
      var bonusPulls = 0;
      try {
        var moodRes = await db.collection('moods').where({
          coupleId: coupleId, uid: myUid, date: today
        }).get();
        if (moodRes.data.length > 0) bonusPulls += 1;

        var diaryRes = await db.collection('diaries').where({
          coupleId: coupleId, uid: myUid, date: today
        }).get();
        if (diaryRes.data.length > 0) bonusPulls += 1;
      } catch (e) { /* 忽略 */ }

      var totalPulls = 1 + bonusPulls;  // 基础1次 + 额外
      var freePulls = Math.max(0, totalPulls - usedPulls);

      this.setData({
        freePulls: freePulls,
        maxPulls: totalPulls,
        todayRecords: todayRecords,
      });
    } catch (err) {
      console.error('加载扭蛋数据失败:', err);
    }
  },

  /**
   * 开始扭蛋
   */
  async startPull() {
    if (this.data.pulling) return;
    if (this.data.freePulls <= 0) {
      wx.showToast({ title: '今日次数已用完，明天再来吧~', icon: 'none' });
      return;
    }

    this.setData({ pulling: true, showAnimation: true, animationPhase: 'shaking', resultCard: null });

    // 1. 扭蛋震动动画（1.5秒）
    var that = this;
    setTimeout(function () {
      that.setData({ animationPhase: 'opening' });
    }, 1500);

    // 2. 蛋壳打开动画（0.5秒）
    setTimeout(function () {
      // 抽卡
      var card = util.drawGachaCard();
      that.setData({ animationPhase: 'reveal', resultCard: card });
    }, 2000);

    // 3. 显示结果弹窗（0.5秒后）
    setTimeout(async function () {
      that.setData({ showAnimation: false, showResult: true, animationPhase: 'idle' });

      // 保存到数据库
      var db = app.getDb();
      var coupleId = app.globalData.coupleId;
      var myUid = app.getUserId();
      var today = util.getToday();

      try {
        await db.collection('gacha_records').add({
          data: {
            coupleId: coupleId,
            uid: myUid,
            date: today,
            cardId: card.cardId,
            createdAt: new Date().toISOString(),
          }
        });
      } catch (e) {
        console.error('保存扭蛋记录失败:', e);
      }

      that.setData({ pulling: false });
      that.loadData();
    }, 2500);
  },

  /**
   * 关闭结果弹窗
   */
  closeResult() {
    this.setData({ showResult: false });
  },

  /**
   * 跳转到图鉴页
   */
  goCollection() {
    wx.navigateTo({ url: '/pages/gacha-collection/gacha-collection' });
  },

  /**
   * 获取已抽到的卡片信息
   */
  getCardInfo: function (cardId) {
    var cards = util.getGachaCards();
    for (var i = 0; i < cards.length; i++) {
      if (cards[i].cardId === cardId) return cards[i];
    }
    return null;
  },

  noop: function () {},
  onShareAppMessage: function () {
    return { title: '恋爱日历 - 扭蛋收集 💕', path: '/pages/welcome/welcome' };
  },
});