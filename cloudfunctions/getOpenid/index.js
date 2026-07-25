/**
 * getOpenid 云函数
 * 功能：
 * 1. getOpenid - 获取当前微信用户的 openid
 * 2. check - 检查绑定状态（openid 优先，UUID 兜底）
 * 3. migrate - 将旧 UUID 数据迁移到 openid
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const { action, oldUid } = event;
  const { OPENID } = cloud.getWXContext();

  if (!OPENID) {
    return { success: false, message: '获取 openid 失败，请重试' };
  }

  try {
    switch (action) {

      // ========== 获取 openid ==========
      case 'getOpenid': {
        return { success: true, data: { openid: OPENID } };
      }

      // ========== 检查绑定状态 ==========
      case 'check': {
        // 先按 openid 查
        let userRes = await db.collection('users').where({ openid: OPENID }).get();
        if (userRes.data.length > 0) {
          const user = userRes.data[0];
          return {
            success: true,
            data: {
              found: true,
              migrated: true,
              user: user,
            }
          };
        }

        // 再按旧 uid 查（兼容旧数据）
        if (oldUid) {
          userRes = await db.collection('users').where({ uid: oldUid }).get();
          if (userRes.data.length > 0) {
            return {
              success: true,
              data: {
                found: true,
                migrated: false,   // 需要迁移
                user: userRes.data[0],
              }
            };
          }
        }

        // 第三步：按系统字段 _openid 查（兼容旧数据只有 _openid 没有 openid 自定义字段的情况）
        // 当创建空间时 openid 还未写入自定义字段，只有系统自动生成的 _openid
        let userResByOpenid = await db.collection('users').where({ _openid: OPENID }).get();
        if (userResByOpenid.data.length > 0) {
          const user = userResByOpenid.data[0];
          // 自动补全 openid 自定义字段，后续查询就能正常匹配
          if (!user.openid) {
            await db.collection('users').doc(user._id).update({
              data: { openid: OPENID }
            });
            user.openid = OPENID;
          }
          return {
            success: true,
            data: {
              found: true,
              migrated: true,
              user: user,
            }
          };
        }

        return { success: true, data: { found: false } };
      }

      // ========== 数据迁移：UUID → openid ==========
      case 'migrate': {
        if (!oldUid) {
          return { success: false, message: '缺少 oldUid 参数' };
        }

        // 检查是否已经迁移过（幂等性保护），同时检查 openid 和 _openid 字段
        const existingUser = await db.collection('users').where(
          _.or([{ openid: OPENID }, { _openid: OPENID }])
        ).get();
        if (existingUser.data.length > 0) {
          // 已经迁移过了，直接返回成功
          return {
            success: true,
            message: '已完成迁移（无需重复迁移）',
            data: { user: existingUser.data[0] }
          };
        }

        // 1. 更新 moods 表中的 uid
        const moodsResult = await db.collection('moods')
          .where({ uid: oldUid })
          .update({ data: { uid: OPENID } });

        // 2. 更新 diaries 表中的 uid
        const diariesResult = await db.collection('diaries')
          .where({ uid: oldUid })
          .update({ data: { uid: OPENID } });

        // 3. 更新 anniversary_records 表中的 uid
        const recordsResult = await db.collection('anniversary_records')
          .where({ uid: oldUid })
          .update({ data: { uid: OPENID } });

        // 4. 更新 anniversaries 表中的 createdBy
        const anniversariesResult = await db.collection('anniversaries')
          .where({ createdBy: oldUid })
          .update({ data: { createdBy: OPENID } });

        // 5. 更新 couples 表：添加新字段 creatorOpenid/partnerOpenid（保留旧字段兼容）
        const coupleAsCreator = await db.collection('couples')
          .where({ creatorUid: oldUid })
          .update({ data: { creatorOpenid: OPENID } });

        const coupleAsPartner = await db.collection('couples')
          .where({ partnerUid: oldUid })
          .update({ data: { partnerOpenid: OPENID } });

        // 6. 更新 users 表：添加 openid，保留 uid 作为备份
        const userResult = await db.collection('users')
          .where({ uid: oldUid })
          .update({
            data: {
              openid: OPENID,
              migratedAt: new Date().toISOString(),
            }
          });

        return {
          success: true,
          message: '迁移成功',
          data: {
            moods: moodsResult.stats.updated || 0,
            diaries: diariesResult.stats.updated || 0,
            records: recordsResult.stats.updated || 0,
            anniversaries: anniversariesResult.stats.updated || 0,
            coupleCreator: coupleAsCreator.stats.updated || 0,
            couplePartner: coupleAsPartner.stats.updated || 0,
          }
        };
      }

      default:
        return { success: false, message: '未知操作: ' + action };
    }

  } catch (error) {
    console.error('getOpenid 云函数错误:', error);
    return { success: false, message: '服务器错误', error: error.message };
  }
};