/**
 * getTempUrls 云函数
 * 通过云函数 admin 权限获取云存储临时链接，绕过免费版存储权限限制
 * 客户端 wx.cloud.getTempFileURL 受存储权限限制，非上传者无法获取
 * 云函数调用 cloud.getTempFileURL 有 admin 权限，不受限制
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event, context) => {
  const { fileList } = event;
  if (!fileList || !Array.isArray(fileList) || fileList.length === 0) {
    return { success: false, message: 'fileList 不能为空', data: [] };
  }

  try {
    const res = await cloud.getTempFileURL({ fileList: fileList });
    return {
      success: true,
      data: res.fileList.map(function (f) {
        return { fileID: f.fileID, tempFileURL: f.tempFileURL || '', status: f.status };
      }),
    };
  } catch (err) {
    console.error('getTempFileURL 失败:', err);
    return { success: false, message: err.message, data: [] };
  }
};