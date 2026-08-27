/**
 * updateTripItem 云函数
 * 用 admin 权限操作 trip_items 集合，绕过"修改本人数据"限制
 * 让情侣双方都能编辑/删除/新增旅行明细（不限创建者）
 *
 * event 参数：
 *   action: 'update' | 'delete' | 'add'
 *   id:     明细 _id（update/delete 必填）
 *   data:   明细数据（add/update 必填）
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

exports.main = async (event, context) => {
  const { action, id, data } = event;

  // 参数校验
  if (!action) {
    return { success: false, message: '缺少 action 参数' };
  }

  try {
    if (action === 'update') {
      // 更新明细（admin 权限，不限创建者）
      if (!id) return { success: false, message: '缺少 id' };
      const updateData = Object.assign({}, data, { updatedAt: new Date().toISOString() });
      const res = await db.collection('trip_items').doc(id).update({ data: updateData });
      return { success: true, updated: res.stats.updated };

    } else if (action === 'delete') {
      // 删除明细（admin 权限，不限创建者）
      if (!id) return { success: false, message: '缺少 id' };
      const res = await db.collection('trip_items').doc(id).remove();
      return { success: true, removed: res.stats.removed };

    } else if (action === 'add') {
      // 新增明细（admin 权限，_openid 会被设为云函数的 admin 标识）
      if (!data) return { success: false, message: '缺少 data' };
      const addData = Object.assign({}, data, {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      const res = await db.collection('trip_items').add({ data: addData });
      return { success: true, _id: res._id };

    } else if (action === 'deleteTrip') {
      // 删除整条旅行：级联删除所有 trip_items + trips 文档（admin 权限，双方都能删）
      if (!id) return { success: false, message: '缺少 id' };
      // 删除所有关联明细
      const itemsRes = await db.collection('trip_items').where({ tripId: id }).get();
      const tasks = itemsRes.data.map(function (item) {
        return db.collection('trip_items').doc(item._id).remove();
      });
      await Promise.all(tasks);
      // 删除旅行文档
      await db.collection('trips').doc(id).remove();
      return { success: true, removedItems: itemsRes.data.length };

    } else if (action === 'updateTrip') {
      // 更新旅行基本信息（admin 权限，双方都能改）
      if (!id) return { success: false, message: '缺少 id' };
      const updateData = Object.assign({}, data, { updatedAt: new Date().toISOString() });
      const res = await db.collection('trips').doc(id).update({ data: updateData });
      return { success: true, updated: res.stats.updated };

    } else {
      return { success: false, message: '未知 action: ' + action };
    }
  } catch (err) {
    console.error('updateTripItem 失败:', err);
    return { success: false, message: err.message };
  }
};
