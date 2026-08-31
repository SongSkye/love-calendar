/**
 * 纪念日列表页 - 带封面图
 */
const util = require('../../utils/util');
const app = getApp();

Page({
  data: {
    anniversaries: [],
    loading: false,
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
    this.loadAnniversaries();
  },

  async loadAnniversaries() {
    this.setData({ loading: true });
    const db = app.getDb();
    const coupleId = app.globalData.coupleId;

    try {
      // 分页取全部（默认 .get() 只返 20 条，纪念日多了会丢）
      const res = await util.fetchAll(db, 'anniversaries', { coupleId: coupleId }, 'date', 'asc');

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const list = res.map(function (item) {
        const d = new Date(item.date);
        // 从纪念日到今天的总天数
        const diffTime = today.getTime() - d.getTime();
        const totalDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

        // 计算距离下一个纪念日还有多少天
        const m = d.getMonth();
        const day = d.getDate();
        const thisYearDate = new Date(today.getFullYear(), m, day);
        const nextYearDate = new Date(today.getFullYear() + 1, m, day);
        const nextDate = thisYearDate >= today ? thisYearDate : nextYearDate;
        const countdownDiff = nextDate.getTime() - today.getTime();
        const countdownDays = Math.ceil(countdownDiff / (1000 * 60 * 60 * 24));

        return {
          ...item,
          totalDays: totalDays >= 0 ? totalDays : 0,
          countdownDays: countdownDays,
          isToday: thisYearDate.getTime() === today.getTime(),
        };
      });

      this.setData({ anniversaries: list });

      // 把云存储 fileID 转为临时链接，封面图才能显示
      const fileIds = list
        .filter(function (item) { return item.coverImage && item.coverImage.indexOf('cloud://') === 0; })
        .map(function (item) { return item.coverImage; });

      if (fileIds.length > 0) {
        util.convertCloudFileIDs(fileIds).then(function (urlMap) {
          const updated = list.map(function (item) {
            if (item.coverImage && urlMap[item.coverImage]) {
              item.coverImage = urlMap[item.coverImage];
            }
            return item;
          });
          this.setData({ anniversaries: updated });
        }.bind(this));
      }
    } catch (err) {
      console.error('加载纪念日失败:', err);
    } finally {
      this.setData({ loading: false });
    }
  },

  addAnniversary() {
    wx.navigateTo({ url: '/pages/anniversary-record/anniversary-record' });
  },

  goDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/anniversary-detail/anniversary-detail?id=' + id });
  },

  onShareAppMessage() {
    return { title: '恋爱日历 - 记录属于我们的每一天 💕', path: '/pages/welcome/welcome' };
  },
});