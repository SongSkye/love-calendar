/**
 * 纪念日编辑页（无云函数版）
 */
const app = getApp();

Page({
  data: {
    isEdit: false,
    anniversaryId: '',
    title: '',
    anniversaryDate: '',
    type: 'custom',
    saving: false,
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ isEdit: true, anniversaryId: options.id });
      this.loadAnniversary(options.id);
    }
  },

  async loadAnniversary(id) {
    try {
      wx.showLoading({ title: '加载中...' });
      const res = await app.getDb().collection('anniversaries').doc(id).get();
      if (res.data) {
        this.setData({
          title: res.data.title,
          anniversaryDate: res.data.date,
          type: res.data.type || 'custom',
        });
      }
    } catch (err) {
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  onTitleInput(e) { this.setData({ title: e.detail.value }); },
  onDateChange(e) { this.setData({ anniversaryDate: e.detail.value }); },
  selectType(e) { this.setData({ type: e.currentTarget.dataset.type }); },

  async saveAnniversary() {
    const title = this.data.title.trim();
    if (!title) { wx.showToast({ title: '请输入名称', icon: 'none' }); return; }
    if (!this.data.anniversaryDate) { wx.showToast({ title: '请选择日期', icon: 'none' }); return; }

    this.setData({ saving: true });
    const db = app.getDb();
    const coupleId = app.globalData.coupleId;
    const uid = app.getUserId();     // openid 或 UUID（云函数不可用时兜底）

    try {
      if (this.data.isEdit) {
        await db.collection('anniversaries').doc(this.data.anniversaryId).update({
          data: { title: title, date: this.data.anniversaryDate, type: this.data.type, updatedAt: new Date().toISOString() }
        });
        wx.showToast({ title: '已更新', icon: 'success' });
      } else {
        await db.collection('anniversaries').add({
          data: { coupleId: coupleId, title: title, date: this.data.anniversaryDate, type: this.data.type, createdBy: uid, createdAt: new Date().toISOString() }
        });
        wx.showToast({ title: '已添加', icon: 'success' });
      }
      setTimeout(function () { wx.navigateBack(); }, 1500);
    } catch (err) {
      console.error(err);
      wx.showToast({ title: '保存失败', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  },
});