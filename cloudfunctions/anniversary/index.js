/**
 * 纪念日云函数
 * 支持 action: list（列表）、create（新建）、update（修改）、delete（删除）
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const { action, anniversaryId, title, date, type, coverImage } = event;
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

      // ========== 获取纪念日列表 ==========
      case 'list': {
        const listResult = await db.collection('anniversaries')
          .where({ coupleId: coupleId })
          .orderBy('date', 'asc')
          .get();

        // 计算每个纪念日的信息
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const anniversaries = listResult.data.map(item => {
          const originalDate = new Date(item.date);
          const month = originalDate.getMonth();
          const day = originalDate.getDate();

          // 今年的纪念日
          const thisYearDate = new Date(today.getFullYear(), month, day);
          const nextYearDate = new Date(today.getFullYear() + 1, month, day);

          let nextDate, isPast;
          if (thisYearDate >= today) {
            nextDate = thisYearDate;
            isPast = false;
          } else {
            nextDate = nextYearDate;
            isPast = true;
          }

          const diffTime = nextDate.getTime() - today.getTime();
          const countdownDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

          // 从起始日到今天的总天数
          const totalDiffTime = today.getTime() - originalDate.getTime();
          const totalDays = Math.floor(totalDiffTime / (1000 * 60 * 60 * 24));

          return {
            ...item,
            countdownDays: countdownDays,
            totalDays: totalDays >= 0 ? totalDays : 0,
            isPast: isPast,
            nextDate: `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}-${String(nextDate.getDate()).padStart(2, '0')}`,
          };
        });

        return {
          success: true,
          data: {
            list: anniversaries,
          }
        };
      }

      // ========== 新建纪念日 ==========
      case 'create': {
        if (!title || !title.trim()) {
          return { success: false, message: '请输入纪念日名称' };
        }
        if (!date) {
          return { success: false, message: '请选择日期' };
        }

        const result = await db.collection('anniversaries').add({
          data: {
            coupleId: coupleId,
            title: title.trim(),
            date: date,
            type: type || 'custom',
            coverImage: coverImage || '',
            createdBy: OPENID,
            createdAt: new Date().toISOString(),
          }
        });

        return {
          success: true,
          message: '纪念日已添加',
          data: { _id: result._id }
        };
      }

      // ========== 修改纪念日 ==========
      case 'update': {
        if (!anniversaryId) {
          return { success: false, message: '缺少纪念日ID' };
        }

        const updateData = {
          updatedAt: new Date().toISOString(),
        };
        if (title !== undefined) updateData.title = title.trim();
        if (date !== undefined) updateData.date = date;
        if (type !== undefined) updateData.type = type;
        if (coverImage !== undefined) updateData.coverImage = coverImage;

        await db.collection('anniversaries').doc(anniversaryId).update({
          data: updateData,
        });

        return {
          success: true,
          message: '纪念日已更新',
        };
      }

      // ========== 删除纪念日 ==========
      case 'delete': {
        if (!anniversaryId) {
          return { success: false, message: '缺少纪念日ID' };
        }

        const item = await db.collection('anniversaries').doc(anniversaryId).get();
        if (!item.data) {
          return { success: false, message: '纪念日不存在' };
        }

        // 删除封面图
        if (item.data.coverImage) {
          try {
            await cloud.deleteFile({
              fileList: [item.data.coverImage],
            });
          } catch (e) {
            console.warn('删除封面图失败:', e);
          }
        }

        await db.collection('anniversaries').doc(anniversaryId).remove();

        return {
          success: true,
          message: '纪念日已删除',
        };
      }

      default:
        return { success: false, message: '未知操作' };
    }

  } catch (error) {
    console.error('anniversary 云函数错误:', error);
    return { success: false, message: '服务器错误', error: error.message };
  }
};