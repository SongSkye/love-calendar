/**
 * 用户云函数
 * 支持 action: info（获取用户信息）、unbind（解绑）
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const { action } = event;
  const { OPENID } = cloud.getWXContext();

  if (!OPENID) {
    return { success: false, message: '获取用户信息失败' };
  }

  try {
    switch (action) {

      // ========== 获取用户信息 ==========
      case 'info': {
        const userResult = await db.collection('users')
          .where({ openid: OPENID })
          .get();

        if (userResult.data.length === 0) {
          return { success: false, message: '未绑定' };
        }

        const user = userResult.data[0];
        const coupleId = user.coupleId;

        // 获取空间信息
        const coupleResult = await db.collection('couples').doc(coupleId).get();
        const couple = coupleResult.data;

        // 获取对方信息
        let partner = null;
        const partnerOpenid = user.role === 'creator'
          ? couple.partnerOpenid
          : couple.creatorOpenid;

        if (partnerOpenid) {
          const partnerResult = await db.collection('users')
            .where({ openid: partnerOpenid, coupleId: coupleId })
            .get();
          if (partnerResult.data.length > 0) {
            partner = {
              nickname: partnerResult.data[0].nickname,
              role: partnerResult.data[0].role,
              avatar: partnerResult.data[0].avatar || '',
            };
          }
        }

        // 获取"在一起"纪念日（取最早的）
        let togetherDate = null;
        const anniversaryResult = await db.collection('anniversaries')
          .where({ coupleId: coupleId })
          .orderBy('date', 'asc')
          .limit(1)
          .get();
        if (anniversaryResult.data.length > 0) {
          togetherDate = anniversaryResult.data[0].date;
        }

        return {
          success: true,
          data: {
            user: {
              openid: user.openid,
              nickname: user.nickname,
              role: user.role,
              coupleId: user.coupleId,
              avatar: user.avatar || '',
            },
            couple: {
              inviteCode: couple.inviteCode,
              createdAt: couple.createdAt,
            },
            partner: partner,
            togetherDate: togetherDate,
          }
        };
      }

      // ========== 解绑 ==========
      case 'unbind': {
        const userResult = await db.collection('users')
          .where({ openid: OPENID })
          .get();

        if (userResult.data.length === 0) {
          return { success: false, message: '未绑定' };
        }

        const user = userResult.data[0];
        const coupleId = user.coupleId;

        // 获取空间信息
        const coupleResult = await db.collection('couples').doc(coupleId).get();
        const couple = coupleResult.data;

        // 删除用户记录
        await db.collection('users').doc(user._id).remove();

        // 如果是 creator 解绑，清空整个空间（包括所有数据）
        if (user.role === 'creator') {
          // 删除该空间的所有数据
          await db.collection('moods').where({ coupleId: coupleId }).remove();
          await db.collection('diaries').where({ coupleId: coupleId }).remove();
          await db.collection('anniversaries').where({ coupleId: coupleId }).remove();

          // 删除 partner 的用户记录
          if (couple.partnerOpenid) {
            await db.collection('users')
              .where({ openid: couple.partnerOpenid, coupleId: coupleId })
              .remove();
          }

          // 删除空间
          await db.collection('couples').doc(coupleId).remove();
        } else {
          // partner 解绑：只清空 partnerOpenid
          await db.collection('couples').doc(coupleId).update({
            data: { partnerOpenid: null }
          });
        }

        return {
          success: true,
          message: '解绑成功',
        };
      }

      default:
        return { success: false, message: '未知操作' };
    }

  } catch (error) {
    console.error('user 云函数错误:', error);
    return { success: false, message: '服务器错误', error: error.message };
  }
};