/**
 * 旅行计划 - 通用出行准备清单默认数据（全局共享，所有旅行共用一份）
 * 存 couples.packingList 字段，走 updateTripItem 云函数 admin 权限写入，双方同步
 * 首次进入列表页时若 couples.packingList 为空，用本默认清单初始化展示
 * 用户可在列表页「🎒 出行准备」入口编辑，保存后覆盖 couples.packingList
 *
 * 结构：[{ category, emoji, items: [String] }]
 */
var PACKING_LIST = [
  {
    category: '证件',
    emoji: '🪪',
    items: ['身份证', '驾驶证（租车需要）', '机票/高铁票截图', '酒店预订凭证'],
  },
  {
    category: '衣物',
    emoji: '👕',
    items: ['薄外套（早晚温差大）', '裙子/拍照 outfit', '舒适走路鞋', '披肩（拍照+保暖）'],
  },
  {
    category: '防晒',
    emoji: '🧴',
    items: ['防晒霜', '墨镜', '帽子', '防晒喷雾'],
  },
  {
    category: '药品',
    emoji: '💊',
    items: ['晕车药', '肠胃药', '创可贴', '感冒药'],
  },
  {
    category: '电子',
    emoji: '📱',
    items: ['充电宝', '相机+自拍杆', '数据线', '耳机'],
  },
  {
    category: '其他',
    emoji: '🎒',
    items: ['雨伞', '保温杯', '零食', '现金零钱'],
  },
];

module.exports = {
  PACKING_LIST: PACKING_LIST,
};
