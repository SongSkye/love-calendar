/**
 * 日记云函数
 * 支持 action: list（分页列表）、detail（详情）、create（新建）、update（修改）、delete（删除）
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const { action, page, size, diaryId, title, content, date, images } = event;
  const { OPENID } = cloud.getWXContext();

  if (!OPENID) {
    return { success: false, message: '获取用户信息失败' };
  }

  try {
    // 获取用户信息
    const userResult = await db.collection('users')
      .where({ openid: OPENID })
      .get();

    if (userResult.data.length === 0) {
      return { success: false, message: '请先创建或加入情侣空间' };
    }

    const user = userResult.data[0];
    const coupleId = user.coupleId;

    switch (action) {

      // ========== 分页获取日记列表 ==========
      case 'list': {
        const pageNum = page || 1;
        const pageSize = size || 20;
        const skip = (pageNum - 1) * pageSize;

        // 获取总数
        const countResult = await db.collection('diaries')
          .where({ coupleId: coupleId })
          .count();

        // 获取列表（按日期倒序）
        const listResult = await db.collection('diaries')
          .where({ coupleId: coupleId })
          .orderBy('date', 'desc')
          .orderBy('createdAt', 'desc')
          .skip(skip)
          .limit(pageSize)
          .get();

        // 获取用户昵称映射
        const users = await db.collection('users')
          .where({ coupleId: coupleId })
          .get();

        const userMap = {};
        users.data.forEach(u => {
          userMap[u.openid] = { nickname: u.nickname, role: u.role };
        });

        // 组装数据
        const diaries = listResult.data.map(item => ({
          ...item,
          nickname: userMap[item.openid] ? userMap[item.openid].nickname : '未知',
          role: userMap[item.openid] ? userMap[item.openid].role : 'unknown',
          isMine: item.openid === OPENID,
        }));

        return {
          success: true,
          data: {
            list: diaries,
            total: countResult.total,
            page: pageNum,
            size: pageSize,
            hasMore: skip + pageSize < countResult.total,
          }
        };
      }

      // ========== 获取日记详情 ==========
      case 'detail': {
        if (!diaryId) {
          return { success: false, message: '缺少日记ID' };
        }

        const detailResult = await db.collection('diaries').doc(diaryId).get();

        if (!detailResult.data) {
          return { success: false, message: '日记不存在' };
        }

        const diary = detailResult.data;

        // 获取用户昵称
        const authorResult = await db.collection('users')
          .where({ openid: diary.openid, coupleId: coupleId })
          .get();

        const nickname = authorResult.data.length > 0
          ? authorResult.data[0].nickname
          : '未知';

        return {
          success: true,
          data: {
            ...diary,
            nickname: nickname,
            isMine: diary.openid === OPENID,
          }
        };
      }

      // ========== 新建日记 ==========
      case 'create': {
        if (!content || !content.trim()) {
          return { success: false, message: '请输入日记内容' };
        }

        const result = await db.collection('diaries').add({
          data: {
            coupleId: coupleId,
            openid: OPENID,
            date: date || new Date().toISOString().split('T')[0],
            title: title || '',
            content: content.trim(),
            images: images || [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
        });

        return {
          success: true,
          message: '日记已保存',
          data: { _id: result._id }
        };
      }

      // ========== 修改日记 ==========
      case 'update': {
        if (!diaryId) {
          return { success: false, message: '缺少日记ID' };
        }

        // 检查是否是自己的日记
        const diary = await db.collection('diaries').doc(diaryId).get();
        if (!diary.data) {
          return { success: false, message: '日记不存在' };
        }
        if (diary.data.openid !== OPENID) {
          return { success: false, message: '只能修改自己的日记' };
        }

        const updateData = {
          updatedAt: new Date().toISOString(),
        };
        if (title !== undefined) updateData.title = title;
        if (content !== undefined) updateData.content = content.trim();
        if (images !== undefined) updateData.images = images;
        if (date !== undefined) updateData.date = date;

        await db.collection('diaries').doc(diaryId).update({
          data: updateData,
        });

        return {
          success: true,
          message: '日记已更新',
        };
      }

      // ========== 删除日记 ==========
      case 'delete': {
        if (!diaryId) {
          return { success: false, message: '缺少日记ID' };
        }

        // 检查是否是自己的日记
        const diary = await db.collection('diaries').doc(diaryId).get();
        if (!diary.data) {
          return { success: false, message: '日记不存在' };
        }
        if (diary.data.openid !== OPENID) {
          return { success: false, message: '只能删除自己的日记' };
        }

        // 删除云存储中的图片
        if (diary.data.images && diary.data.images.length > 0) {
          try {
            await cloud.deleteFile({
              fileList: diary.data.images,
            });
          } catch (e) {
            console.warn('删除图片失败:', e);
          }
        }

        await db.collection('diaries').doc(diaryId).remove();

        return {
          success: true,
          message: '日记已删除',
        };
      }

      default:
        return { success: false, message: '未知操作' };
    }

  } catch (error) {
    console.error('diary 云函数错误:', error);
    return { success: false, message: '服务器错误', error: error.message };
  }
};