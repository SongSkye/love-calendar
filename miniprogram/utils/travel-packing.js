/**
 * 旅行计划 - 通用出行准备清单（全局共享，所有旅行共用）
 * 纯提示信息，不存数据库、不勾选状态
 * 详情页「🎒 出行准备」小框点击后弹窗展示
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
