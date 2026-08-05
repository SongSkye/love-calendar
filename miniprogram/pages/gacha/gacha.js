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
    resultCard: null,       // 抽到的卡片（带完整信息）

    // 今日已抽记录（已拼接好卡片信息）
    todayRecords: [],
    hasRecords: false,      // 是否有今日记录
    partnerRecords: [],      // 对方今日抽到的卡片
    hasPartnerRecords: false,

    // 弹窗
    showResult: false,      // 显示抽卡结果弹窗
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
   * 加载扭蛋数据：计算今日剩余次数、已抽记录，以及对方抽到的卡片
   */
  async loadData() {
    var db = app.getDb();
    var coupleId = app.globalData.coupleId;
    var myUid = app.getUserId();
    var partnerUid = app.globalData.partnerInfo
      ? (app.globalData.partnerInfo.openid || app.globalData.partnerInfo.uid)
      : '';
    var today = util.getToday();

    try {
      // 卡片映射表
      var allCards = util.getGachaCards();
      var cardMap = {};
      allCards.forEach(function (c) { cardMap[c.cardId] = c; });

      // 查询今日所有记录（两人一起查，一次请求）
      var recordsRes = await db.collection('gacha_records').where({
        coupleId: coupleId, date: today
      }).get();

      var myRawRecords = [];
      var partnerRawRecords = [];
      recordsRes.data.forEach(function (r) {
        if (r.uid === myUid) {
          myRawRecords.push(r);
        } else if (partnerUid && r.uid === partnerUid) {
          partnerRawRecords.push(r);
        }
      });

      // 拼接卡片信息
      function buildCard(r) {
        var card = cardMap[r.cardId] || {};
        var rarityCfg = util.getRarityConfig(card.rarity || 1);
        return {
          _id: r._id,
          cardId: r.cardId,
          cardEmoji: card.emoji || '❓',
          cardTitle: card.title || '未知卡片',
          cardDesc: card.description || '',
          cardColor: card.color || '#CCCCCC',
          cardRarity: card.rarity || 1,
          rarityLabel: rarityCfg.label,
          cardSetName: card.setName || '',
        };
      }

      var todayRecords = myRawRecords.map(buildCard);
      var partnerRecords = partnerRawRecords.map(buildCard);

      // 计算剩余次数
      var usedPulls = todayRecords.length;

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

      var totalPulls = 1 + bonusPulls;
      var freePulls = Math.max(0, totalPulls - usedPulls);

      this.setData({
        freePulls: freePulls,
        maxPulls: totalPulls,
        todayRecords: todayRecords,
        hasRecords: todayRecords.length > 0,
        partnerRecords: partnerRecords,
        hasPartnerRecords: partnerRecords.length > 0,
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

    // 抽卡（先抽出来，动画播完再展示）
    var card = util.drawGachaCard();
    var rarityCfg = util.getRarityConfig(card.rarity);
    var resultCard = {
      cardId: card.cardId,
      cardEmoji: card.emoji,
      cardTitle: card.title,
      cardDesc: card.description,
      cardColor: card.color,
      cardRarity: card.rarity,
      rarityLabel: rarityCfg.label,
      cardSetName: card.setName,
    };

    this.setData({ pulling: true, showAnimation: true, animationPhase: 'shaking', resultCard: null });

    var that = this;

    // 1. 蛋壳震动动画（1.5秒）
    setTimeout(function () {
      that.setData({ animationPhase: 'opening' });
    }, 1500);

    // 2. 蛋壳打开 + 抽卡结果（0.5秒后）
    setTimeout(function () {
      that.setData({ animationPhase: 'reveal', resultCard: resultCard });
    }, 2000);

    // 3. 显示结果弹窗 + 保存到数据库（0.5秒后）
    setTimeout(async function () {
      that.setData({ showAnimation: false, showResult: true, animationPhase: 'idle' });

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
    }, 2500);
  },

  /**
   * 收下卡片：关闭弹窗，立即把卡片加到列表，同时后台刷新
   */
  closeResult() {
    var card = this.data.resultCard;
    this.setData({ showResult: false });

    if (card) {
      // 立即追加到今日记录列表
      var todayRecords = this.data.todayRecords.concat([card]);
      var usedPulls = todayRecords.length;
      var freePulls = Math.max(0, this.data.maxPulls - usedPulls);

      this.setData({
        todayRecords: todayRecords,
        hasRecords: true,
        freePulls: freePulls,
        resultCard: null,
      });

      // 后台静默刷新（确保与数据库一致）
      this.loadData();
    }
  },

  /**
   * 跳转到图鉴页
   */
  goCollection() {
    wx.navigateTo({ url: '/pages/gacha-collection/gacha-collection' });
  },

  noop: function () {},
  onShareAppMessage: function () {
    return { title: '恋爱日历 - 扭蛋收集 💕', path: '/pages/welcome/welcome' };
  },
});