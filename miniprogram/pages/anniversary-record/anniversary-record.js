/**
 * 纪念日编辑/记录页
 * 三种模式：新建纪念日、编辑纪念日、记录纪念日（支持选择年份）
 */
const app = getApp();

/**
 * 生成从纪念日开始年份到当前年份的年份列表
 * @param {string} dateStr - 纪念日日期字符串 "YYYY-MM-DD"
 * @returns {Array<number>} 年份数组
 */
function generateYearRange(dateStr) {
  var startYear = new Date(dateStr).getFullYear();
  var currentYear = new Date().getFullYear();
  var years = [];
  for (var y = currentYear; y >= startYear; y--) {
    years.push(y);
  }
  return years;
}

Page({
  data: {
    isEdit: false,           // 编辑模式
    isRecord: false,         // 记录模式（可选择年份录入记录）
    anniversaryId: '',
    title: '',
    anniversaryDate: '',
    type: 'custom',
    coverImage: '',          // 封面图

    // 记录
    currentYear: new Date().getFullYear(),
    recordYear: new Date().getFullYear(),  // 当前选择的记录年份
    yearRange: [],           // 可选年份列表
    recordContent: '',
    recordImages: [],

    saving: false,
  },

  onLoad(options) {
    var currentYear = new Date().getFullYear();
    this.setData({ currentYear: currentYear, recordYear: currentYear });

    if (options.id) {
      if (options.record === '1') {
        // 如果传了 year 参数，使用指定年份
        var targetYear = options.year ? parseInt(options.year) : currentYear;
        this.setData({ isRecord: true, anniversaryId: options.id, recordYear: targetYear });
      } else {
        this.setData({ isEdit: true, anniversaryId: options.id });
      }
      this.loadAnniversary(options.id);
    }
  },

  async loadAnniversary(id) {
    try {
      wx.showLoading({ title: '加载中...' });
      var res = await app.getDb().collection('anniversaries').doc(id).get();
      if (res.data) {
        var item = res.data;
        // 生成可选年份范围
        var yearRange = generateYearRange(item.date);
        this.setData({
          title: item.title,
          anniversaryDate: item.date,
          type: item.type || 'custom',
          coverImage: item.coverImage || '',
          yearRange: yearRange,
        });

        // 如果是记录模式，加载选中年份的已有记录
        if (this.data.isRecord) {
          this.loadRecordForYear(id, this.data.recordYear);
        }
      }
    } catch (err) {
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  /**
   * 加载指定年份的已有记录
   * @param {string} anniversaryId - 纪念日ID
   * @param {number} year - 年份
   */
  async loadRecordForYear(anniversaryId, year) {
    try {
      var recordRes = await app.getDb().collection('anniversary_records')
        .where({ anniversaryId: anniversaryId, year: year })
        .get();
      if (recordRes.data.length > 0) {
        this.setData({
          recordContent: recordRes.data[0].content || '',
          recordImages: recordRes.data[0].images || [],
          existingRecordId: recordRes.data[0]._id,
        });
      } else {
        // 该年份没有记录，清空表单
        this.setData({
          recordContent: '',
          recordImages: [],
          existingRecordId: '',
        });
      }
    } catch (err) {
      console.error('加载记录失败:', err);
    }
  },

  /**
   * 切换记录年份
   */
  onYearChange(e) {
    var year = parseInt(e.detail.value);
    this.setData({ recordYear: year });
    // 重新加载该年份的已有记录
    if (this.data.anniversaryId) {
      this.loadRecordForYear(this.data.anniversaryId, year);
    }
  },

  // 封面图
  chooseCover() {
    const that = this;
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: function (res) {
        wx.showLoading({ title: '上传中...' });
        wx.cloud.uploadFile({
          cloudPath: 'covers/' + Date.now() + '_' + Math.random().toString(36).substr(2, 8) + '.jpg',
          filePath: res.tempFilePaths[0],
        }).then(function (uploadRes) {
          wx.hideLoading();
          // 删除旧封面
          if (that.data.coverImage) {
            wx.cloud.deleteFile({ fileList: [that.data.coverImage] }).catch(function () {});
          }
          that.setData({ coverImage: uploadRes.fileID });
        }).catch(function () {
          wx.hideLoading();
          wx.showToast({ title: '上传失败', icon: 'none' });
        });
      }
    });
  },

  onTitleInput(e) { this.setData({ title: e.detail.value }); },
  onDateChange(e) { this.setData({ anniversaryDate: e.detail.value }); },
  selectType(e) { this.setData({ type: e.currentTarget.dataset.type }); },
  onRecordContentInput(e) { this.setData({ recordContent: e.detail.value }); },

  addRecordImage() {
    const remaining = 9 - this.data.recordImages.length;
    const that = this;
    wx.chooseImage({
      count: remaining,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: function (res) {
        wx.showLoading({ title: '上传中...' });
        const promises = res.tempFilePaths.map(function (fp) {
          return wx.cloud.uploadFile({
            cloudPath: 'anniversary_records/' + Date.now() + '_' + Math.random().toString(36).substr(2, 8) + '.jpg',
            filePath: fp,
          });
        });
        Promise.all(promises).then(function (results) {
          wx.hideLoading();
          that.setData({ recordImages: that.data.recordImages.concat(results.map(function (r) { return r.fileID; })) });
        }).catch(function () {
          wx.hideLoading();
          wx.showToast({ title: '上传失败', icon: 'none' });
        });
      }
    });
  },

  deleteRecordImage(e) {
    const index = e.currentTarget.dataset.index;
    const images = this.data.recordImages;
    if (images[index] && images[index].indexOf('cloud://') === 0) {
      wx.cloud.deleteFile({ fileList: [images[index]] }).catch(function () {});
    }
    images.splice(index, 1);
    this.setData({ recordImages: images });
  },

  previewRecordImage(e) {
    wx.previewImage({ current: e.currentTarget.dataset.url, urls: this.data.recordImages });
  },

  /**
   * 保存所有
   */
  async saveAll() {
    const title = this.data.title.trim();
    if (!title) { wx.showToast({ title: '请输入名称', icon: 'none' }); return; }
    if (!this.data.anniversaryDate) { wx.showToast({ title: '请选择日期', icon: 'none' }); return; }

    this.setData({ saving: true });
    const db = app.getDb();
    const coupleId = app.globalData.coupleId;
    const uid = app.getUserId();     // openid 或 UUID（云函数不可用时兜底）
    const now = new Date().toISOString();

    try {
      let anniversaryId = this.data.anniversaryId;

      // 保存纪念日本身（新建或更新）
      if (this.data.isEdit) {
        await db.collection('anniversaries').doc(anniversaryId).update({
          data: {
            title: title,
            date: this.data.anniversaryDate,
            type: this.data.type,
            coverImage: this.data.coverImage,
            updatedAt: now,
          }
        });
      } else if (!this.data.isRecord) {
        // 新建纪念日
        const res = await db.collection('anniversaries').add({
          data: {
            coupleId: coupleId,
            title: title,
            date: this.data.anniversaryDate,
            type: this.data.type,
            coverImage: this.data.coverImage,
            createdBy: uid,
            createdAt: now,
          }
        });
        anniversaryId = res._id;
      }

      // 保存记录（使用选中的年份）
      if (this.data.isRecord || this.data.recordContent || this.data.recordImages.length > 0) {
        var recordYear = this.data.recordYear || this.data.currentYear;
        var recordData = {
          content: this.data.recordContent.trim(),
          images: this.data.recordImages,
          updatedAt: now,
        };

        if (this.data.existingRecordId) {
          // 更新已有记录
          await db.collection('anniversary_records').doc(this.data.existingRecordId).update({ data: recordData });
        } else {
          // 新建记录
          await db.collection('anniversary_records').add({
            data: {
              anniversaryId: anniversaryId,
              coupleId: coupleId,
              uid: uid,
              year: recordYear,
              date: this.data.anniversaryDate,
              content: this.data.recordContent.trim(),
              images: this.data.recordImages,
              createdAt: now,
            }
          });
        }
      }

      wx.showToast({ title: this.data.isRecord ? '记录已保存' : '保存成功', icon: 'success' });
      // 清除纪念日缓存，确保日历页和纪念日列表页重新加载
      app.globalData.anniversariesCache = null;
      setTimeout(function () {
        if (anniversaryId && !this.data.isEdit) {
          // 跳转到详情页
          wx.redirectTo({ url: '/pages/anniversary-detail/anniversary-detail?id=' + anniversaryId });
        } else {
          wx.navigateBack();
        }
      }.bind(this), 1500);

    } catch (err) {
      console.error('保存失败:', err);
      wx.showToast({ title: '保存失败', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  },
});