/**
 * 认证云函数
 * 支持 action: create（创建空间）、join（加入空间）、check（检查绑定状态）
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

/**
 * 生成6位随机邀请码（大写字母+数字）
 */
function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 去掉容易混淆的 0/O/1/I
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

exports.main = async (event, context) => {
  const { action, nickname, inviteCode } = event;
  const { OPENID } = cloud.getWXContext();

  if (!OPENID) {
    return { success: false, message: '获取用户信息失败，请重试' };
  }

  try {
    switch (action) {

      // ========== 创建情侣空间 ==========
      case 'create': {
        if (!nickname || !nickname.trim()) {
          return { success: false, message: '请输入昵称' };
        }

        // 检查是否已有空间
        const existingUser = await db.collection('users')
          .where({ openid: OPENID })
          .get();

        if (existingUser.data.length > 0) {
          return { success: false, message: '你已经绑定了一个情侣空间，请先解绑' };
        }

        // 生成唯一邀请码
        let code = '';
        let isUnique = false;
        let attempts = 0;
        while (!isUnique && attempts < 20) {
          code = generateInviteCode();
          const checkResult = await db.collection('couples')
            .where({ inviteCode: code })
            .get();
          if (checkResult.data.length === 0) {
            isUnique = true;
          }
          attempts++;
        }

        if (!isUnique) {
          return { success: false, message: '生成邀请码失败，请重试' };
        }

        // 创建情侣空间
        const coupleResult = await db.collection('couples').add({
          data: {
            inviteCode: code,
            creatorOpenid: OPENID,
            partnerOpenid: null,
            createdAt: new Date().toISOString(),
          }
        });

        // 创建用户记录
        await db.collection('users').add({
          data: {
            openid: OPENID,
            coupleId: coupleResult._id,
            nickname: nickname.trim(),
            role: 'creator',
            avatar: '',
            createdAt: new Date().toISOString(),
          }
        });

        return {
          success: true,
          message: '创建成功',
          data: {
            inviteCode: code,
            coupleId: coupleResult._id,
            role: 'creator',
            nickname: nickname.trim(),
          }
        };
      }

      // ========== 加入情侣空间 ==========
      case 'join': {
        if (!nickname || !nickname.trim()) {
          return { success: false, message: '请输入昵称' };
        }
        if (!inviteCode) {
          return { success: false, message: '请输入邀请码' };
        }

        // 检查是否已有空间
        const existingUser = await db.collection('users')
          .where({ openid: OPENID })
          .get();

        if (existingUser.data.length > 0) {
          return { success: false, message: '你已经绑定了一个情侣空间，请先解绑' };
        }

        // 查找邀请码
        const coupleResult = await db.collection('couples')
          .where({
            inviteCode: inviteCode.toUpperCase().trim(),
          })
          .get();

        if (coupleResult.data.length === 0) {
          return { success: false, message: '邀请码不存在，请检查' };
        }

        const couple = coupleResult.data[0];

        // 检查是否已有 partner
        if (couple.partnerOpenid) {
          return { success: false, message: '这个邀请码已被使用，每个空间只能绑定两个人' };
        }

        // 不能加入自己创建的空间
        if (couple.creatorOpenid === OPENID) {
          return { success: false, message: '不能加入自己创建的空间' };
        }

        // 更新 couple 记录
        await db.collection('couples').doc(couple._id).update({
          data: {
            partnerOpenid: OPENID,
          }
        });

        // 创建用户记录
        await db.collection('users').add({
          data: {
            openid: OPENID,
            coupleId: couple._id,
            nickname: nickname.trim(),
            role: 'partner',
            avatar: '',
            createdAt: new Date().toISOString(),
          }
        });

        return {
          success: true,
          message: '加入成功',
          data: {
            coupleId: couple._id,
            role: 'partner',
            nickname: nickname.trim(),
          }
        };
      }

      default:
        return { success: false, message: '未知操作' };
    }

  } catch (error) {
    console.error('auth 云函数错误:', error);
    return { success: false, message: '服务器错误，请稍后重试', error: error.message };
  }
};