/**
 * 日历页 - 首页Tab（无云函数版）
 * 月历展示、心情记录、在一起天数
 */
const util = require('../../utils/util');
const app = getApp();

Page({
  data: {
    currentYear: 2026,
    currentMonth: 7,
    weekdays: ['日', '一', '二', '三', '四', '五', '六'],
    calendarGrid: [],
    togetherDays: 0,
    todayDate: util.getToday(),
    moodMap: {},
    moodOptions: util.getMoodOptions(),
    nextAnniversary: null,
    hasTodayMood: false,

    // 心情记录弹窗
    showMoodPopup: false,
    showMoodDetail: false,
    popupDate: '',
    selectedMood: '',
    moodNote: '',
    moodImages: [],
    isEditing: false,
    editingMoodId: null,
    savingMood: false,

    // 详情
    moodDetailList: [],

    // 心情统计
    statRange: 'month',      // month | year | all
    moodStats: [],           // 统计结果
    moodStatsTotal: 0,       // 总计
    moodStatsTopLabel: '',   // 占比最高的心情
    moodStatsTopPercent: 0,  // 最高占比
    allMoodsCache: null,     // 全部心情缓存（用于维度切换时前端过滤）
  },

  onLoad() {
    this.initCalendar();
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
        if (!bound) {
          wx.reLaunch({ url: '/pages/welcome/welcome' });
          return;
        }
        this.loadMoods();
        this.loadAnniversaries();
        this.loadMoodStats();
        this.checkTodayMood();
      }.bind(this));
      return;
    }
    this.loadMoods();
    this.loadAnniversaries();
    this.loadMoodStats();
    this.checkTodayMood();
  },

  initCalendar() {
    const now = new Date();
    this.setData({
      currentYear: now.getFullYear(),
      currentMonth: now.getMonth() + 1,
    });
    this.generateCalendar();
  },

  generateCalendar() {
    const grid = util.generateCalendarGrid(this.data.currentYear, this.data.currentMonth);
    this.setData({ calendarGrid: grid });
  },

  prevMonth() {
    let { currentYear, currentMonth } = this.data;
    if (currentMonth === 1) {
      this.setData({ currentYear: currentYear - 1, currentMonth: 12 });
    } else {
      this.setData({ currentMonth: currentMonth - 1 });
    }
    this.generateCalendar();
    this.loadMoods();
    this.computeStats();
  },

  nextMonth() {
    let { currentYear, currentMonth } = this.data;
    const now = new Date();
    if (currentYear > now.getFullYear() || (currentYear === now.getFullYear() && currentMonth >= now.getMonth() + 2)) {
      return;
    }
    if (currentMonth === 12) {
      this.setData({ currentYear: currentYear + 1, currentMonth: 1 });
    } else {
      this.setData({ currentMonth: currentMonth + 1 });
    }
    this.generateCalendar();
    this.loadMoods();
    this.computeStats();
  },

  /**
   * 加载当月心情数据
   */
  async loadMoods() {
    const { currentYear, currentMonth } = this.data;
    const month = currentYear + '-' + String(currentMonth).padStart(2, '0');
    const coupleId = app.globalData.coupleId;
    if (!coupleId) return;

    const db = app.getDb();
    const _ = app._;

    try {
      const startDate = month + '-01';
      const endDate = month + '-31';

      // 并行加载 moods 和 users
      const [moodsRes, usersRes] = await Promise.all([
        db.collection('moods').where({
          coupleId: coupleId,
          date: _.gte(startDate).and(_.lte(endDate)),
        }).orderBy('date', 'asc').get(),
        db.collection('users').where({ coupleId: coupleId }).get()
      ]);

      // 构建 uid → nickname 映射（兼容新旧数据）
      const userMap = {};
      usersRes.data.forEach(function (u) {
        var entry = { nickname: u.nickname, role: u.role };
        if (u.openid) userMap[u.openid] = entry;
        if (u.uid) userMap[u.uid] = entry;
      });

      const moodMap = {};
      moodsRes.data.forEach(function (item) {
        if (!moodMap[item.date]) {
          moodMap[item.date] = { users: [], hasPhoto: false };
        }
        const moodInfo = util.getMoodInfo(item.mood);
        const userInfo = userMap[item.uid] || { nickname: '未知', role: 'unknown' };
        moodMap[item.date].users.push({
          uid: item.uid,
          nickname: userInfo.nickname,
          role: userInfo.role,
          emoji: moodInfo.emoji,
          label: moodInfo.label,
          mood: item.mood,
          note: item.note || '',
          images: item.images || [],
          _id: item._id,
        });
        if (item.images && item.images.length > 0) {
          moodMap[item.date].hasPhoto = true;
        }
      });

      this.setData({ moodMap: moodMap });
    } catch (err) {
      console.error('加载心情失败:', err);
    }
  },

  /**
   * 加载纪念日信息
   */
  async loadAnniversaries() {
    const coupleId = app.globalData.coupleId;
    if (!coupleId) return;
    const db = app.getDb();

    try {
      const res = await db.collection('anniversaries')
        .where({ coupleId: coupleId })
        .orderBy('date', 'asc')
        .get();

      if (res.data.length > 0) {
        const list = res.data;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const enriched = list.map(function (item) {
          const d = new Date(item.date);
          const m = d.getMonth();
          const day = d.getDate();
          const thisYear = new Date(today.getFullYear(), m, day);
          const nextYear = new Date(today.getFullYear() + 1, m, day);
          const nextDate = thisYear >= today ? thisYear : nextYear;
          const diffTime = nextDate.getTime() - today.getTime();
          const countdownDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          const totalDiffTime = today.getTime() - d.getTime();
          const totalDays = Math.floor(totalDiffTime / (1000 * 60 * 60 * 24));
          return {
            ...item,
            totalDays: totalDays >= 0 ? totalDays : 0,
            countdownDays: countdownDays,
          };
        });

        // 在一起天数
        const togetherItem = enriched.find(function (item) { return item.type === 'together'; });
        if (togetherItem) {
          this.setData({ togetherDays: togetherItem.totalDays });
        } else if (enriched.length > 0) {
          this.setData({ togetherDays: enriched[0].totalDays });
        }

        // 下一个纪念日
        const upcoming = enriched.filter(function (item) { return item.countdownDays > 0; })
          .sort(function (a, b) { return a.countdownDays - b.countdownDays; });
        if (upcoming.length > 0) {
          this.setData({
            nextAnniversary: {
              title: upcoming[0].title,
              countdownDays: upcoming[0].countdownDays,
            }
          });
        }
      }
    } catch (err) {
      console.error('加载纪念日失败:', err);
    }
  },

  checkTodayMood() {
    const today = this.data.todayDate;
    const moodMap = this.data.moodMap;
    const hasToday = moodMap[today] && moodMap[today].users.length > 0;
    this.setData({ hasTodayMood: hasToday });
  },

  /**
   * 加载心情统计数据
   * 首次加载时缓存全部心情数据，后续切换维度只需前端过滤
   */
  async loadMoodStats() {
    const coupleId = app.globalData.coupleId;
    if (!coupleId) return;
    const db = app.getDb();

    try {
      // 首次加载拉取全部心情记录，缓存起来
      if (!this.data.allMoodsCache) {
        const res = await db.collection('moods').where({ coupleId: coupleId }).get();
        this.data.allMoodsCache = res.data;
      }
      this.computeStats();
    } catch (err) {
      console.error('加载心情统计失败:', err);
    }
  },

  /**
   * 根据当前维度计算统计数据
   */
  computeStats() {
    const allMoods = this.data.allMoodsCache || [];
    const range = this.data.statRange;
    const now = new Date();
    const currentYear = this.data.currentYear;
    const currentMonth = this.data.currentMonth;

    // 按维度过滤数据
    const filtered = allMoods.filter(function (item) {
      if (range === 'all') return true;
      const d = item.date; // YYYY-MM-DD
      if (range === 'year') return d.startsWith(String(currentYear));
      if (range === 'month') {
        const month = currentYear + '-' + String(currentMonth).padStart(2, '0');
        return d.startsWith(month);
      }
      return true;
    });

    // 按 mood 分组统计
    const moodOptions = util.getMoodOptions();
    const countMap = {};
    moodOptions.forEach(function (m) { countMap[m.key] = 0; });

    filtered.forEach(function (item) {
      if (countMap[item.mood] !== undefined) {
        countMap[item.mood]++;
      }
    });

    const total = filtered.length;
    const maxCount = Math.max.apply(null, Object.values(countMap)) || 1;

    // 找出占比最高的心情
    let topKey = '';
    let topCount = 0;
    Object.keys(countMap).forEach(function (k) {
      if (countMap[k] > topCount) { topCount = countMap[k]; topKey = k; }
    });
    const moodInfo = util.getMoodInfo(topKey);
    const topPercent = total > 0 ? Math.round((topCount / total) * 100) : 0;

    const stats = moodOptions.map(function (m) {
      return {
        key: m.key,
        emoji: m.emoji,
        label: m.label,
        count: countMap[m.key],
        percent: total > 0 ? Math.round((countMap[m.key] / maxCount) * 100) : 0,
      };
    });

    this.setData({
      moodStats: stats,
      moodStatsTotal: total,
      moodStatsTopLabel: moodInfo.label,
      moodStatsTopPercent: topPercent,
    });
  },

  /**
   * 切换统计维度
   */
  switchStatRange(e) {
    const range = e.currentTarget.dataset.range;
    this.setData({ statRange: range });
    this.computeStats();
  },

  onDateTap(e) {
    const { date, empty } = e.currentTarget.dataset;
    if (empty) return;
    const moodMap = this.data.moodMap;
    const hasMood = moodMap[date] && moodMap[date].users.length > 0;
    if (hasMood) {
      this.showMoodDetailPopup(date);
    } else {
      this.showMoodRecordPopup(date);
    }
  },

  showMoodRecordPopup(date, editData) {
    this.setData({
      showMoodPopup: true,
      showMoodDetail: false,
      popupDate: date,
      isEditing: !!editData,
      selectedMood: editData ? editData.mood : '',
      moodNote: editData ? (editData.note || '') : '',
      moodImages: editData ? (editData.images || []) : [],
      editingMoodId: editData ? editData._id : null,
    });
  },

  showMoodDetailPopup(date) {
    const moodMap = this.data.moodMap;
    const dayData = moodMap[date];
    const myUid = app.getUserId();

    const detailList = dayData.users.map(function (item) {
      return {
        ...item,
        isMine: item.uid === myUid,
      };
    });

    this.setData({
      showMoodDetail: true,
      showMoodPopup: false,
      popupDate: date,
      moodDetailList: detailList,
    });
  },

  editMoodFromDetail(e) {
    const item = e.currentTarget.dataset.item;
    this.setData({ showMoodDetail: false });
    this.showMoodRecordPopup(this.data.popupDate, item);
  },

  selectMood(e) {
    this.setData({ selectedMood: e.currentTarget.dataset.mood });
  },

  onMoodNoteInput(e) {
    this.setData({ moodNote: e.detail.value });
  },

  addMoodImage() {
    const remaining = 9 - this.data.moodImages.length;
    const that = this;
    wx.chooseImage({
      count: remaining,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: function (res) {
        wx.showLoading({ title: '上传中...' });
        const promises = res.tempFilePaths.map(function (fp) {
          return wx.cloud.uploadFile({
            cloudPath: 'moods/' + Date.now() + '_' + Math.random().toString(36).substr(2, 8) + '.jpg',
            filePath: fp,
          });
        });
        Promise.all(promises).then(function (results) {
          wx.hideLoading();
          const newImages = results.map(function (r) { return r.fileID; });
          that.setData({ moodImages: that.data.moodImages.concat(newImages) });
        }).catch(function () {
          wx.hideLoading();
          wx.showToast({ title: '上传失败', icon: 'none' });
        });
      }
    });
  },

  deleteMoodImage(e) {
    const index = e.currentTarget.dataset.index;
    const images = this.data.moodImages;
    const fileID = images[index];
    if (fileID && fileID.indexOf('cloud://') === 0) {
      wx.cloud.deleteFile({ fileList: [fileID] }).catch(function () {});
    }
    images.splice(index, 1);
    this.setData({ moodImages: images });
  },

  previewMoodImage(e) {
    const index = e.currentTarget.dataset.index;
    wx.previewImage({ current: this.data.moodImages[index], urls: this.data.moodImages });
  },

  previewDetailImage(e) {
    const { url, urls } = e.currentTarget.dataset;
    wx.previewImage({ current: url, urls: urls });
  },

  /**
   * 保存心情
   */
  async saveMood() {
    if (!this.data.selectedMood) {
      wx.showToast({ title: '请选择心情', icon: 'none' });
      return;
    }
    this.setData({ savingMood: true });
    const db = app.getDb();
    const uid = app.getUserId();
    const coupleId = app.globalData.coupleId;
    const date = this.data.popupDate;
    const mood = this.data.selectedMood;
    const note = this.data.moodNote.trim();
    const images = this.data.moodImages;

    try {
      if (this.data.isEditing && this.data.editingMoodId) {
        // 更新
        await db.collection('moods').doc(this.data.editingMoodId).update({
          data: { mood: mood, note: note, images: images, updatedAt: new Date().toISOString() }
        });
        wx.showToast({ title: '心情已更新', icon: 'success' });
      } else {
        // 检查是否已有记录
        const existRes = await db.collection('moods').where({
          coupleId: coupleId, uid: uid, date: date
        }).get();
        if (existRes.data.length > 0) {
          await db.collection('moods').doc(existRes.data[0]._id).update({
            data: { mood: mood, note: note, images: images, updatedAt: new Date().toISOString() }
          });
          wx.showToast({ title: '心情已更新', icon: 'success' });
        } else {
          await db.collection('moods').add({
            data: { coupleId: coupleId, uid: uid, date: date, mood: mood, note: note, images: images, createdAt: new Date().toISOString() }
          });
          wx.showToast({ title: '心情已记录', icon: 'success' });
        }
      }
      this.setData({ showMoodPopup: false });
      this.data.allMoodsCache = null;  // 清除缓存，强制重新加载
      this.loadMoods();
      this.loadMoodStats();
      this.checkTodayMood();
    } catch (err) {
      console.error('保存心情失败:', err);
      wx.showToast({ title: '保存失败', icon: 'none' });
    } finally {
      this.setData({ savingMood: false });
    }
  },

  closeMoodPopup() { this.setData({ showMoodPopup: false }); },
  closeMoodDetail() { this.setData({ showMoodDetail: false }); },
  noop() {},

  onShareAppMessage() {
    return { title: '恋爱日历 - 记录属于我们的每一天 💕', path: '/pages/welcome/welcome' };
  },
});