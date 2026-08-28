/**
 * updateTripItem 云函数
 * 用 admin 权限操作 trip_items / trips / couples 集合，绕过"修改本人数据"限制
 * 让情侣双方都能编辑/删除/新增旅行明细、旅行基本信息、出行准备清单（不限创建者）
 *
 * event 参数：
 *   action: 'update' | 'delete' | 'add' | 'deleteTrip' | 'updateTrip' | 'updatePackingList'
 *   id:     明细 _id（update/delete 必填）或旅行 _id（deleteTrip/updateTrip 必填）
 *   coupleId: updatePackingList 必填
 *   data:   明细/旅行/准备清单数据（add/update/updateTrip/updatePackingList 必填）
 *           add 需含 tripId + coupleId；deleteTrip 会分页取全部明细级联删除（避免 >20 条漏删）
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
      if (!data.tripId) return { success: false, message: '缺少 tripId' };
      if (!data.coupleId) return { success: false, message: '缺少 coupleId' };
      const addData = Object.assign({}, data, {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      const res = await db.collection('trip_items').add({ data: addData });
      return { success: true, _id: res._id };

    } else if (action === 'deleteTrip') {
      // 删除整条旅行：级联删除所有 trip_items + trips 文档（admin 权限，双方都能删）
      if (!id) return { success: false, message: '缺少 id' };
      // 云数据库 get 默认只返 20 条，明细可能很多，分页循环取全部再删，避免漏删孤儿数据
      var allItems = [];
      var pageSize = 20;
      var skip = 0;
      while (true) {
        var pageRes = await db.collection('trip_items').where({ tripId: id }).skip(skip).limit(pageSize).get();
        allItems = allItems.concat(pageRes.data);
        if (pageRes.data.length < pageSize) break;
        skip += pageSize;
        if (skip > 500) break; // 安全上限
      }
      // 逐条删除（where().remove() 受单次删除上限限制，doc 删除更稳）
      var tasks = allItems.map(function (item) {
        return db.collection('trip_items').doc(item._id).remove();
      });
      await Promise.all(tasks);
      // 删除旅行文档
      await db.collection('trips').doc(id).remove();
      return { success: true, removedItems: allItems.length };

    } else if (action === 'updateTrip') {
      // 更新旅行基本信息（admin 权限，双方都能改）
      if (!id) return { success: false, message: '缺少 id' };
      const updateData = Object.assign({}, data, { updatedAt: new Date().toISOString() });
      const res = await db.collection('trips').doc(id).update({ data: updateData });
      return { success: true, updated: res.stats.updated };

    } else if (action === 'updatePackingList') {
      // 更新出行准备清单（存 couples.packingList，双方共享同步）
      if (!event.coupleId) return { success: false, message: '缺少 coupleId' };
      if (!data || !data.packingList) return { success: false, message: '缺少 packingList' };
      const res = await db.collection('couples').doc(event.coupleId).update({
        data: { packingList: data.packingList, packingUpdatedAt: new Date().toISOString() },
      });
      return { success: true, updated: res.stats.updated };

    } else {
      return { success: false, message: '未知 action: ' + action };
    }
  } catch (err) {
    console.error('updateTripItem 失败:', err);
    return { success: false, message: err.message };
  }
};
