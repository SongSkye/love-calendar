/**
 * 日记编辑页（无云函数版）
 */
const util = require('../../utils/util');
const app = getApp();

Page({
  data: {
    isEdit: false,
    diaryId: '',
    diaryDate: util.getToday(),
    title: '',
    content: '',
    images: [],
    saving: false,
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ isEdit: true, diaryId: options.id });
      this.loadDiary(options.id);
    }
  },

  async loadDiary(id) {
    const db = app.getDb();
    try {
      wx.showLoading({ title: '加载中...' });
      const res = await db.collection('diaries').doc(id).get();
      if (res.data) {
        this.setData({
          diaryDate: res.data.date,
          title: res.data.title || '',
          content: res.data.content,
          images: res.data.images || [],
        });
      }
    } catch (err) {
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  onDateChange(e) { this.setData({ diaryDate: e.detail.value }); },
  onTitleInput(e) { this.setData({ title: e.detail.value }); },
  onContentInput(e) { this.setData({ content: e.detail.value }); },

  addImage() {
    const remaining = 9 - this.data.images.length;
    const that = this;
    wx.chooseImage({
      count: remaining,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: function (res) {
        wx.showLoading({ title: '上传中...' });
        const promises = res.tempFilePaths.map(function (fp) {
          return wx.cloud.uploadFile({
            cloudPath: 'diaries/' + Date.now() + '_' + Math.random().toString(36).substr(2, 8) + '.jpg',
            filePath: fp,
          }).then(function (uploadResult) {
            // 生成缩略图 base64 存入 image_thumbs，供跨用户显示
            util.compressImageToBase64(fp, 400, 0.7).then(function (base64) {
              util.saveImageThumb(uploadResult.fileID, base64);
            }).catch(function (e) {
              console.warn('生成缩略图失败:', e);
            });
            return uploadResult;
          });
        });
        Promise.all(promises).then(function (results) {
          wx.hideLoading();
          that.setData({ images: that.data.images.concat(results.map(function (r) { return r.fileID; })) });
        }).catch(function () {
          wx.hideLoading();
          wx.showToast({ title: '上传失败', icon: 'none' });
        });
      }
    });
  },

  deleteImage(e) {
    const index = e.currentTarget.dataset.index;
    const images = this.data.images;
    const fileID = images[index];
    if (fileID && fileID.indexOf('cloud://') === 0) {
      wx.cloud.deleteFile({ fileList: [fileID] }).catch(function () {});
    }
    images.splice(index, 1);
    this.setData({ images: images });
  },

  previewImage(e) {
    util.previewImage(this.data.images, e.currentTarget.dataset.index);
  },

  async saveDiary() {
    const content = this.data.content.trim();
    if (!content) {
      wx.showToast({ title: '请输入日记内容', icon: 'none' });
      return;
    }
    this.setData({ saving: true });
    const db = app.getDb();
    const coupleId = app.globalData.coupleId;
    const uid = app.getUserId();     // openid 或 UUID（云函数不可用时兜底）
    const now = new Date().toISOString();

    try {
      if (this.data.isEdit) {
        await db.collection('diaries').doc(this.data.diaryId).update({
          data: {
            date: this.data.diaryDate,
            title: this.data.title.trim(),
            content: content,
            images: this.data.images,
            updatedAt: now,
          }
        });
        wx.showToast({ title: '日记已更新', icon: 'success' });
      } else {
        await db.collection('diaries').add({
          data: {
            coupleId: coupleId,
            uid: uid,
            date: this.data.diaryDate,
            title: this.data.title.trim(),
            content: content,
            images: this.data.images,
            createdAt: now,
            updatedAt: now,
          }
        });
        wx.showToast({ title: '日记已保存', icon: 'success' });
      }
      // 通知日记列表页清除缓存，下次进入时刷新
      var pages = getCurrentPages();
      for (var i = 0; i < pages.length; i++) {
        if (pages[i].clearUserCache) {
          pages[i].clearUserCache();
        }
      }
      setTimeout(function () { wx.navigateBack(); }, 1500);
    } catch (err) {
      console.error('保存失败:', err);
      wx.showToast({ title: '保存失败', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  },
});