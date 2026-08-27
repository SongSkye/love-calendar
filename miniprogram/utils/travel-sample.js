/**
 * 旅行计划 - 大理蜜月攻略示例数据
 * 从「大理蜜月旅行攻略.xlsx」7 个 sheet 提取，用于「加载示例攻略」一键导入
 * 结构对应 trips 文档 + trip_items 明细行（category 区分 6 个分区）
 */

// trips 文档基本信息（对应 Sheet1 行程总览）
var TRIP_BASE = {
  title: '大理蜜月旅行',
  destination: '云南大理',
  departure: '洛阳',
  startDate: '2026-10-01',
  endDate: '2026-10-05',
  days: 5,
  nights: 4,
  travelType: '蜜月旅行',
  travelers: '双人',
  transport: '去程：洛阳 ✈ 昆明 → 高铁 大理 ／ 返程：大理 → 高铁 昆明 ✈ 洛阳',
  budgetMin: 12000,
  budgetMax: 18000,
  budgetNote: '约 1.2万 - 1.8万（双人，含交通 / 住宿 / 门票 / 餐饮）',
  tone: '轻松浪漫、丰俭由人，时间宽松不赶场，随时可调整',
  // 每日概览（Sheet1 二、每日行程概览）
  dailyOverview: [
    { day: 1, summary: '洛阳出发，飞昆明转高铁，夜抵大理古城，漫步古城听民谣' },
    { day: 2, summary: '洱海西线环湖：龙龛日出 + 磻溪S湾 + 喜洲 + 双廊看日落' },
    { day: 3, summary: '洱海东线：小普陀 + 文笔村 + 理想邦，一路向南顺时针环湖' },
    { day: 4, summary: '苍山祈福 + 沙溪古镇慢时光（可选留宿沙溪一晚）' },
    { day: 5, summary: '周城扎染体验，亲手做蜜月信物，返程洛阳' },
  ],
  // 温馨提示（Sheet1 三、温馨提示）
  tips: [
    '十一为旺季，机票 / 高铁 / 热门民宿 / 索道票建议提前 15 天预订。',
    '大理海拔约 2000m，苍山索道登顶近 4000m，避免剧烈运动，备好防晒与薄外套。',
    '早晚温差大，拍照穿裙子建议带披肩；高原紫外线强，防晒霜墨镜帽子必备。',
    '行程为参考节奏，可按体力与心情随时增减，蜜月嘛，舒服最重要。',
  ],
};

// trip_items 明细行（Sheet2-7），每条含 category / sortOrder / fields
var TRIP_ITEMS = [
  // ===== itinerary 每日行程（Sheet2，5列：时段/景点活动/建议游玩/前往下一站/备注）=====
  // Day 1 · 洛阳出发，夜抵大理古城  住宿：大理古城 / 龙龛码头民宿
  { category: 'itinerary', sortOrder: 0, fields: { day: 1, timeSlot: '早上', activity: '洛阳北郊机场值机', playDuration: '—', nextStop: '—', remark: '提前 2 小时到，办理值机安检', lodgingNote: '大理古城 / 龙龛码头民宿' } },
  { category: 'itinerary', sortOrder: 1, fields: { day: 1, timeSlot: '上午', activity: '洛阳 ✈ 昆明', playDuration: '飞行 2.5h', nextStop: '机场 → 昆明南站', remark: '航班 MU5800 / 8L9872 等；地铁 6 号线转 1 号线约 1h', lodgingNote: '' } },
  { category: 'itinerary', sortOrder: 2, fields: { day: 1, timeSlot: '中午', activity: '昆明南 → 高铁 大理', playDuration: '高铁 2h', nextStop: '大理站 → 古城', remark: '班次密集；打车 / 接站约 40 分钟', lodgingNote: '' } },
  { category: 'itinerary', sortOrder: 3, fields: { day: 1, timeSlot: '下午', activity: '抵达大理，入住休整', playDuration: '1h', nextStop: '步行 / 打车', remark: '放行李稍作休息', lodgingNote: '' } },
  { category: 'itinerary', sortOrder: 4, fields: { day: 1, timeSlot: '傍晚', activity: '漫步大理古城', playDuration: '1.5-2h', nextStop: '步行', remark: '南门城墙、五华楼、洋人街', lodgingNote: '' } },
  { category: 'itinerary', sortOrder: 5, fields: { day: 1, timeSlot: '晚上', activity: '古城晚餐 + 小酒馆', playDuration: '2h', nextStop: '步行回民宿', remark: '段公子 / 我在大理等你；人民路听民谣', lodgingNote: '' } },
  // Day 2 · 洱海西线 · 浪漫环湖日（一路向北）  住宿：双廊海景民宿
  { category: 'itinerary', sortOrder: 6, fields: { day: 2, timeSlot: '清晨', activity: '龙龛码头看日出', playDuration: '1h', nextStop: '古城 → 龙龛打车 10 分钟', remark: '日出约 07:10', lodgingNote: '双廊海景民宿' } },
  { category: 'itinerary', sortOrder: 7, fields: { day: 2, timeSlot: '早上', activity: '洱海生态廊道骑行', playDuration: '1-1.5h', nextStop: '骑行至磻溪', remark: '租双人自行车 / 电动车，约 50-80 元', lodgingNote: '' } },
  { category: 'itinerary', sortOrder: 8, fields: { day: 2, timeSlot: '上午', activity: '磻溪 S 湾拍照', playDuration: '30-40 分钟', nextStop: '骑行 / 包车至喜洲', remark: '网红打卡点，蜜月大片拍摄地', lodgingNote: '' } },
  { category: 'itinerary', sortOrder: 9, fields: { day: 2, timeSlot: '中午', activity: '喜洲古镇 + 午餐', playDuration: '2h', nextStop: '包车至双廊约 40 分钟', remark: '转角楼、喜洲粑粑、稻田；翰林餐厅', lodgingNote: '' } },
  { category: 'itinerary', sortOrder: 10, fields: { day: 2, timeSlot: '下午', activity: '前往双廊古镇', playDuration: '—', nextStop: '包车 / 打车 40 分钟', remark: '一路向北，顺路', lodgingNote: '' } },
  { category: 'itinerary', sortOrder: 11, fields: { day: 2, timeSlot: '傍晚', activity: '双廊漫步 + 日落晚餐', playDuration: '2h+', nextStop: '步行', remark: '玉几岛、南诏风情岛、海边咖啡馆', lodgingNote: '' } },
  { category: 'itinerary', sortOrder: 12, fields: { day: 2, timeSlot: '晚上', activity: '入住双廊海景民宿', playDuration: '—', nextStop: '—', remark: '枕浪入眠，享受洱海夜景', lodgingNote: '' } },
  // Day 3 · 洱海东线 · 文艺大片日（一路向南，顺时针环湖）  住宿：大理古城民宿
  { category: 'itinerary', sortOrder: 13, fields: { day: 3, timeSlot: '早上', activity: '睡到自然醒', playDuration: '1h', nextStop: '双廊 → 小普陀包车 30-40 分钟', remark: '享受海景民宿早餐', lodgingNote: '大理古城民宿' } },
  { category: 'itinerary', sortOrder: 14, fields: { day: 3, timeSlot: '上午', activity: '小普陀喂海鸥', playDuration: '40 分钟', nextStop: '车程 15-20 分钟至文笔村', remark: '海上小岛', lodgingNote: '' } },
  { category: 'itinerary', sortOrder: 15, fields: { day: 3, timeSlot: '中午', activity: '文笔村 + 午餐', playDuration: '1.5h', nextStop: '车程 15 分钟至理想邦', remark: '彩虹公路、海之礼堂', lodgingNote: '' } },
  { category: 'itinerary', sortOrder: 16, fields: { day: 3, timeSlot: '下午', activity: '理想邦（圣托里尼风）', playDuration: '1.5h', nextStop: '包车 40-50 分钟回古城', remark: '白色建筑 + 洱海蓝，拍照圣地', lodgingNote: '' } },
  { category: 'itinerary', sortOrder: 17, fields: { day: 3, timeSlot: '傍晚', activity: '返回大理古城', playDuration: '—', nextStop: '包车约 1 小时', remark: '入住休整换装', lodgingNote: '' } },
  { category: 'itinerary', sortOrder: 18, fields: { day: 3, timeSlot: '晚上', activity: '古城晚餐 + 自由闲逛', playDuration: '2h', nextStop: '步行', remark: '花意间野生菌火锅；酒吧 / 按摩放松', lodgingNote: '' } },
  // Day 4 · 苍山祈福 · 沙溪慢时光  住宿：大理古城（或沙溪古镇民宿）
  { category: 'itinerary', sortOrder: 19, fields: { day: 4, timeSlot: '早上', activity: '古城早餐', playDuration: '1h', nextStop: '古城 → 苍山打车 20 分钟', remark: '—', lodgingNote: '大理古城（或沙溪古镇民宿）' } },
  { category: 'itinerary', sortOrder: 20, fields: { day: 4, timeSlot: '上午', activity: '苍山索道祈福', playDuration: '3-4h', nextStop: '包车赴沙溪约 2h', remark: '洗马潭大索道登顶许愿；或感通索道 + 寂照庵吃斋饭', lodgingNote: '' } },
  { category: 'itinerary', sortOrder: 21, fields: { day: 4, timeSlot: '中午', activity: '山上简餐', playDuration: '1h', nextStop: '—', remark: '寂照庵斋饭约 20 元 / 人', lodgingNote: '' } },
  { category: 'itinerary', sortOrder: 22, fields: { day: 4, timeSlot: '下午', activity: '沙溪古镇漫步', playDuration: '2-3h', nextStop: '返大理包车约 2h', remark: '寺登街、古戏台、玉津桥、茶马古道', lodgingNote: '' } },
  { category: 'itinerary', sortOrder: 23, fields: { day: 4, timeSlot: '傍晚', activity: '沙溪晚餐', playDuration: '1h', nextStop: '—', remark: '老马店 / 溪语咖啡', lodgingNote: '' } },
  { category: 'itinerary', sortOrder: 24, fields: { day: 4, timeSlot: '晚上', activity: '返回大理古城', playDuration: '—', nextStop: '包车约 2h', remark: '或留宿沙溪一晚，次日返程', lodgingNote: '' } },
  // Day 5 · 扎染体验 · 返程洛阳
  { category: 'itinerary', sortOrder: 25, fields: { day: 5, timeSlot: '早上', activity: '早餐，收拾行李', playDuration: '1h', nextStop: '古城 → 周城打车 40 分钟', remark: '退房，行李可寄存', lodgingNote: '' } },
  { category: 'itinerary', sortOrder: 26, fields: { day: 5, timeSlot: '上午', activity: '周城扎染体验', playDuration: '2h', nextStop: '周城 → 大理站打车 30 分钟', remark: '白族扎染之乡，亲手制作蜜月信物', lodgingNote: '' } },
  { category: 'itinerary', sortOrder: 27, fields: { day: 5, timeSlot: '中午', activity: '周城 / 古城午餐', playDuration: '1h', nextStop: '—', remark: '—', lodgingNote: '' } },
  { category: 'itinerary', sortOrder: 28, fields: { day: 5, timeSlot: '下午', activity: '大理 → 昆明', playDuration: '高铁 2h', nextStop: '昆明南 → 机场地铁 / 打车 1.5h', remark: '高铁至昆明南站', lodgingNote: '' } },
  { category: 'itinerary', sortOrder: 29, fields: { day: 5, timeSlot: '傍晚', activity: '昆明 ✈ 洛阳', playDuration: '飞行 2.5h', nextStop: '—', remark: '蜜月圆满结束', lodgingNote: '' } },

  // ===== lodging 住宿推荐（Sheet3）=====
  { category: 'lodging', sortOrder: 0, fields: { date: 'Day 1', area: '大理古城', hotel: '大理沐山汐·沽月酒店', price: '500-800 元', feature: '古城内，闹中取静' } },
  { category: 'lodging', sortOrder: 1, fields: { date: 'Day 1', area: '龙龛码头', hotel: '大理洱海醒来海景民宿', price: '600-1000 元', feature: '看日出方便' } },
  { category: 'lodging', sortOrder: 2, fields: { date: 'Day 2', area: '双廊古镇', hotel: '大理双廊·明月松间', price: '800-1500 元', feature: '一线海景，蜜月首选' } },
  { category: 'lodging', sortOrder: 3, fields: { date: 'Day 2', area: '双廊古镇', hotel: '大理双廊·木夕大里', price: '1000-2000 元', feature: '网红海景，鲜花铺床' } },
  { category: 'lodging', sortOrder: 4, fields: { date: 'Day 3', area: '大理古城', hotel: '大理古城·既下山', price: '500-800 元', feature: '设计感强，服务好' } },
  { category: 'lodging', sortOrder: 5, fields: { date: 'Day 4', area: '大理古城', hotel: '同 Day 3 或续住', price: '500-800 元', feature: '省去搬行李' } },
  { category: 'lodging', sortOrder: 6, fields: { date: 'Day 4', area: '沙溪古镇', hotel: '沙溪·既下山', price: '600-1000 元', feature: '茶马古道风情' } },

  // ===== restaurant 餐厅推荐（Sheet4，5列：餐厅名称/所在区域/推荐菜品/人均/备注）=====
  { category: 'restaurant', sortOrder: 0, fields: { name: '段公子餐厅', area: '大理古城（Day1/3/4）', dishes: '云南特色菜、雕梅扣肉', perCapita: '约 80-120', remark: '古城网红，环境出片' } },
  { category: 'restaurant', sortOrder: 1, fields: { name: '我在大理等你·方舟胖子厨房', area: '大理古城（Day1）', dishes: '私房菜、酸辣鱼', perCapita: '约 90-130', remark: '名字浪漫，蜜月应景' } },
  { category: 'restaurant', sortOrder: 2, fields: { name: '花意间野生菌火锅', area: '大理古城（Day3）', dishes: '野生菌火锅、松茸', perCapita: '约 120-180', remark: '到大理必吃菌子锅' } },
  { category: 'restaurant', sortOrder: 3, fields: { name: '再回首黄焖鸡', area: '大理古城', dishes: '黄焖鸡、米饭套餐', perCapita: '约 30-50', remark: '平价快餐，本地老牌' } },
  { category: 'restaurant', sortOrder: 4, fields: { name: '梅子井餐厅', area: '大理古城', dishes: '白族风味、梅子系列', perCapita: '约 100-150', remark: '老字号庭院餐厅' } },
  { category: 'restaurant', sortOrder: 5, fields: { name: '翰林餐厅', area: '喜洲古镇（Day2）', dishes: '白族家常菜', perCapita: '约 60-90', remark: '喜洲用餐首选' } },
  { category: 'restaurant', sortOrder: 6, fields: { name: '喜洲粑粑', area: '喜洲古镇（Day2）', dishes: '破酥粑粑（甜/咸）', perCapita: '约 5-10/个', remark: '街边小吃，必尝' } },
  { category: 'restaurant', sortOrder: 7, fields: { name: '双廊海景餐厅', area: '双廊古镇（Day2）', dishes: '海鲜、滇菜、日落晚餐', perCapita: '约 150-250', remark: '边吃边看洱海日落' } },
  { category: 'restaurant', sortOrder: 8, fields: { name: '老马店', area: '沙溪古镇（Day4）', dishes: '本地农家菜、土鸡', perCapita: '约 70-110', remark: '沙溪老牌餐厅' } },
  { category: 'restaurant', sortOrder: 9, fields: { name: '溪语咖啡', area: '沙溪古镇（Day4）', dishes: '咖啡、轻食、甜点', perCapita: '约 40-70', remark: '古戏台旁，发呆好去处' } },
  { category: 'restaurant', sortOrder: 10, fields: { name: '周城农家菜', area: '周城（Day5）', dishes: '白族家常、扎染人家', perCapita: '约 50-80', remark: '扎染体验后就近午餐' } },

  // ===== ticket 门票体验（Sheet5）=====
  { category: 'ticket', sortOrder: 0, fields: { project: '苍山洗马潭大索道', singlePrice: '300 元', couplePrice: '600 元', bookingMethod: '携程 / 美团提前订', remark: '含门票 + 索道 + 天龙八部影视城' } },
  { category: 'ticket', sortOrder: 1, fields: { project: '苍山感通索道', singlePrice: '110 元', couplePrice: '220 元', bookingMethod: '携程 / 美团提前订', remark: '含门票 + 索道，可去寂照庵' } },
  { category: 'ticket', sortOrder: 2, fields: { project: '崇圣寺三塔', singlePrice: '75 元', couplePrice: '150 元', bookingMethod: '携程 / 美团提前订', remark: '可选，Day 3 下午可去' } },
  { category: 'ticket', sortOrder: 3, fields: { project: '南诏风情岛', singlePrice: '50 元', couplePrice: '100 元', bookingMethod: '现场购票', remark: '双廊玉几岛旁' } },
  { category: 'ticket', sortOrder: 4, fields: { project: '周城扎染体验', singlePrice: '80-150 元', couplePrice: '160-300 元', bookingMethod: '现场参加', remark: '含教学 + 布料' } },
  { category: 'ticket', sortOrder: 5, fields: { project: '洱海生态廊道骑行', singlePrice: '50-80 元', couplePrice: '80-160 元', bookingMethod: '现场租车', remark: '双人自行车 / 电动车' } },

  // ===== budget 预算总览（Sheet6）=====
  { category: 'budget', sortOrder: 0, fields: { budgetCategory: '往返交通（洛阳⇌大理）', amount: '5000-7000 元', remark: '机票 + 高铁，十一价格浮动大' } },
  { category: 'budget', sortOrder: 1, fields: { budgetCategory: '当地交通（包车 + 打车）', amount: '1500-2000 元', remark: '环洱海包车为主' } },
  { category: 'budget', sortOrder: 2, fields: { budgetCategory: '住宿（4 晚）', amount: '2500-5000 元', remark: '根据选择浮动' } },
  { category: 'budget', sortOrder: 3, fields: { budgetCategory: '餐饮（5 天）', amount: '1500-2500 元', remark: '含特色餐厅' } },
  { category: 'budget', sortOrder: 4, fields: { budgetCategory: '门票 + 体验', amount: '1000-1500 元', remark: '索道 + 扎染 + 骑行' } },
  { category: 'budget', sortOrder: 5, fields: { budgetCategory: '其他（购物 + 零食）', amount: '500-1000 元', remark: '纪念品、鲜花饼等' } },
  { category: 'budget', sortOrder: 6, fields: { budgetCategory: '合计', amount: '约 1.2 万 - 1.8 万', remark: '丰俭由人' } },

  // ===== packing 出行准备（Sheet7）=====
  { category: 'packing', sortOrder: 0, fields: { packCategory: '证件', item: '身份证、驾驶证', remark: '租车需要驾驶证' } },
  { category: 'packing', sortOrder: 1, fields: { packCategory: '衣物', item: '薄外套、裙子、舒适鞋', remark: '早晚温差大，拍照 + 走路兼顾' } },
  { category: 'packing', sortOrder: 2, fields: { packCategory: '防晒', item: '防晒霜、墨镜、帽子', remark: '高原紫外线强' } },
  { category: 'packing', sortOrder: 3, fields: { packCategory: '药品', item: '晕车药、肠胃药、创可贴', remark: '以备不时之需' } },
  { category: 'packing', sortOrder: 4, fields: { packCategory: '电子', item: '充电宝、相机、自拍杆', remark: '蜜月大片必备' } },
  { category: 'packing', sortOrder: 5, fields: { packCategory: '预订', item: '机票、高铁票、酒店、索道票', remark: '十一务必提前 15 天抢票' } },
];

module.exports = {
  TRIP_BASE: TRIP_BASE,
  TRIP_ITEMS: TRIP_ITEMS,
};
