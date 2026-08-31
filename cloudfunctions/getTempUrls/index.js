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
    // cloud.getTempFileURL 单次最多 50 个 fileID，超了会报错，分批处理
    var allResults = [];
    var batchSize = 50;
    for (var i = 0; i < fileList.length; i += batchSize) {
      var batch = fileList.slice(i, i + batchSize);
      var batchRes = await cloud.getTempFileURL({ fileList: batch });
      allResults = allResults.concat(batchRes.fileList);
    }
    return {
      success: true,
      data: allResults.map(function (f) {
        return { fileID: f.fileID, tempFileURL: f.tempFileURL || '', status: f.status };
      }),
    };
  } catch (err) {
    console.error('getTempFileURL 失败:', err);
    return { success: false, message: err.message, data: [] };
  }
};