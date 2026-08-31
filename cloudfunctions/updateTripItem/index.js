/**
 * updateTripItem 云函数
 * 用 admin 权限操作 trip_items / trips / couples 集合，绕过"修改本人数据"限制
 * 让情侣双方都能编辑/删除/新增旅行明细、旅行基本信息、出行准备清单（不限创建者）
 *
 * 安全：每个 action 操作前用 assertMember 校验调用者 OPENID 属于目标 coupleId，
 *       防止越权删改他人空间数据。UUID 降级模式（无 OPENID）会被拒绝。
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

/**
 * 校验调用者 OPENID 是否属于目标 coupleId
 * @param {string} coupleId - 目标空间 ID
 * @returns {Promise<string>} OPENID（校验通过）
 * @throws {Error} OPENID 为空或不属于该空间时抛错
 */
async function assertMember(coupleId) {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) throw new Error('未获取到用户身份，请重新进入小程序');
  if (!coupleId) throw new Error('缺少 coupleId');
  // 查 users 表确认该 OPENID 属于此 coupleId（openid 业务字段优先）
  var res = await db.collection('users').where({ openid: OPENID, coupleId: coupleId }).get();
  if (res.data.length === 0) {
    // 兼容旧数据：_openid 系统字段
    var fb = await db.collection('users').where({ _openid: OPENID, coupleId: coupleId }).get();
    if (fb.data.length === 0) throw new Error('无权操作此空间数据');
  }
  return OPENID;
}

/**
 * 取 trip_items 文档的 coupleId（用于 update/delete 前校验）
 * @param {string} id - trip_items 的 _id
 * @returns {Promise<string>} coupleId
 */
async function getItemCoupleId(id) {
  var res = await db.collection('trip_items').doc(id).get();
  if (!res.data) throw new Error('明细不存在');
  return res.data.coupleId;
}

/**
 * 取 trips 文档的 coupleId（用于 deleteTrip/updateTrip 前校验）
 * @param {string} id - trips 的 _id
 * @returns {Promise<string>} coupleId
 */
async function getTripCoupleId(id) {
  var res = await db.collection('trips').doc(id).get();
  if (!res.data) throw new Error('旅行不存在');
  return res.data.coupleId;
}

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
      // 身份校验：先查该明细所属 coupleId，再校验调用者归属
      var itemCoupleId = await getItemCoupleId(id);
      await assertMember(itemCoupleId);
      const updateData = Object.assign({}, data, { updatedAt: new Date().toISOString() });
      // 删除嵌套子字段：前端传 removeFields=['bookingStatus'] 表示删除 fields 下这些子字段
      // 原因：云数据库 update 对对象是深度合并，不传的子字段会保留原值，
      //       必须用 db.command.remove() 显式删除，否则"清空预订状态"等场景删不掉旧值
      if (Array.isArray(updateData.removeFields)) {
        const removeObj = {};
        updateData.removeFields.forEach(function (k) { removeObj[k] = db.command.remove(); });
        updateData.fields = Object.assign({}, updateData.fields || {}, removeObj);
        delete updateData.removeFields;
      }
      const res = await db.collection('trip_items').doc(id).update({ data: updateData });
      return { success: true, updated: res.stats.updated };

    } else if (action === 'delete') {
      // 删除明细（admin 权限，不限创建者）
      if (!id) return { success: false, message: '缺少 id' };
      var delCoupleId = await getItemCoupleId(id);
      await assertMember(delCoupleId);
      const res = await db.collection('trip_items').doc(id).remove();
      return { success: true, removed: res.stats.removed };

    } else if (action === 'add') {
      // 新增明细（admin 权限，_openid 会被设为云函数的 admin 标识）
      if (!data) return { success: false, message: '缺少 data' };
      if (!data.tripId) return { success: false, message: '缺少 tripId' };
      if (!data.coupleId) return { success: false, message: '缺少 coupleId' };
      // 身份校验：调用者必须属于 data.coupleId
      await assertMember(data.coupleId);
      // 防伪造 tripId：校验 tripId 属于该 coupleId
      var tripCid = await getTripCoupleId(data.tripId);
      if (tripCid !== data.coupleId) {
        return { success: false, message: 'tripId 与 coupleId 不匹配' };
      }
      const addData = Object.assign({}, data, {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      const res = await db.collection('trip_items').add({ data: addData });
      return { success: true, _id: res._id };

    } else if (action === 'deleteTrip') {
      // 删除整条旅行：级联删除所有 trip_items + trips 文档（admin 权限，双方都能删）
      if (!id) return { success: false, message: '缺少 id' };
      // 身份校验：先查旅行所属 coupleId，再校验调用者归属
      var delTripCid = await getTripCoupleId(id);
      await assertMember(delTripCid);
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
      // 身份校验：先查旅行所属 coupleId，再校验调用者归属
      var updTripCid = await getTripCoupleId(id);
      await assertMember(updTripCid);
      const updateData = Object.assign({}, data, { updatedAt: new Date().toISOString() });
      const res = await db.collection('trips').doc(id).update({ data: updateData });
      return { success: true, updated: res.stats.updated };

    } else if (action === 'updatePackingList') {
      // 更新出行准备清单（存 couples.packingList，双方共享同步）
      if (!event.coupleId) return { success: false, message: '缺少 coupleId' };
      if (!data || !data.packingList) return { success: false, message: '缺少 packingList' };
      // 身份校验：调用者必须属于 event.coupleId
      await assertMember(event.coupleId);
      const res = await db.collection('couples').doc(event.coupleId).update({
        data: { packingList: data.packingList, packingUpdatedAt: new Date().toISOString() },
      });
      return { success: true, updated: res.stats.updated };

    } else {
      return { success: false, message: '未知 action: ' + action };
    }
  } catch (err) {
    console.error('updateTripItem 失败:', err);
    // 鉴权失败返回明确信息，其他错误返回通用信息
    var msg = err.message || '操作失败';
    return { success: false, message: msg };
  }
};
