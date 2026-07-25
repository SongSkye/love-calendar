/**
 * 心情云函数
 * 支持 action: getMonth（获取月份心情）、set（记录/更新心情）、getDay（获取某天详情）
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const { action, month, date, mood, note, images } = event;
  const { OPENID } = cloud.getWXContext();

  if (!OPENID) {
    return { success: false, message: '获取用户信息失败' };
  }

  try {
    // 先获取用户信息，确认所属空间
    const userResult = await db.collection('users')
      .where({ openid: OPENID })
      .get();

    if (userResult.data.length === 0) {
      return { success: false, message: '请先创建或加入情侣空间' };
    }

    const user = userResult.data[0];
    const coupleId = user.coupleId;

    switch (action) {

      // ========== 获取某月心情数据 ==========
      case 'getMonth': {
        // month 格式: "2026-07"
        const [year, m] = month.split('-');
        const startDate = `${year}-${m}-01`;
        const endDate = `${year}-${m}-31`; // 查询范围宽一点，具体过滤由前端做

        // 获取该月两人所有心情记录
        const moods = await db.collection('moods')
          .where({
            coupleId: coupleId,
            date: _.gte(startDate).and(_.lte(endDate)),
          })
          .orderBy('date', 'asc')
          .get();

        // 按日期和用户组织数据
        const moodMap = {};
        moods.data.forEach(item => {
          if (!moodMap[item.date]) {
            moodMap[item.date] = {};
          }
          moodMap[item.date][item.openid] = {
            mood: item.mood,
            note: item.note || '',
            images: item.images || [],
            _id: item._id,
          };
        });

        return {
          success: true,
          data: {
            moods: moodMap,
            userOpenid: OPENID,
            partnerOpenid: null, // 前端可以从 globalData 取
          }
        };
      }

      // ========== 记录/更新心情 ==========
      case 'set': {
        if (!date) {
          return { success: false, message: '请选择日期' };
        }
        if (!mood) {
          return { success: false, message: '请选择心情' };
        }

        // 检查是否已有记录
        const existing = await db.collection('moods')
          .where({
            coupleId: coupleId,
            openid: OPENID,
            date: date,
          })
          .get();

        if (existing.data.length > 0) {
          // 更新已有记录
          await db.collection('moods').doc(existing.data[0]._id).update({
            data: {
              mood: mood,
              note: note || '',
              images: images || [],
              updatedAt: new Date().toISOString(),
            }
          });

          return {
            success: true,
            message: '心情已更新',
            data: { _id: existing.data[0]._id, isUpdate: true }
          };
        } else {
          // 新增记录
          const result = await db.collection('moods').add({
            data: {
              coupleId: coupleId,
              openid: OPENID,
              date: date,
              mood: mood,
              note: note || '',
              images: images || [],
              createdAt: new Date().toISOString(),
            }
          });

          return {
            success: true,
            message: '心情已记录',
            data: { _id: result._id, isUpdate: false }
          };
        }
      }

      // ========== 获取某天心情详情 ==========
      case 'getDay': {
        if (!date) {
          return { success: false, message: '请选择日期' };
        }

        const dayMoods = await db.collection('moods')
          .where({
            coupleId: coupleId,
            date: date,
          })
          .get();

        // 获取用户昵称
        const users = await db.collection('users')
          .where({ coupleId: coupleId })
          .get();

        const userMap = {};
        users.data.forEach(u => {
          userMap[u.openid] = { nickname: u.nickname, role: u.role };
        });

        // 组装详情数据
        const details = dayMoods.data.map(item => ({
          ...item,
          nickname: userMap[item.openid] ? userMap[item.openid].nickname : '未知',
          role: userMap[item.openid] ? userMap[item.openid].role : 'unknown',
        }));

        return {
          success: true,
          data: {
            date: date,
            moods: details,
          }
        };
      }

      default:
        return { success: false, message: '未知操作' };
    }

  } catch (error) {
    console.error('mood 云函数错误:', error);
    return { success: false, message: '服务器错误', error: error.message };
  }
};