/**
 * data.js - 助贷员工端H5 Mock 数据层
 * 包含：员工、客户(16)、银行产品(12)、对话历史、匹配规则配置
 */
window.MOCK_DATA = (function () {

  // ============ 员工数据 ============
  const EMPLOYEES = [
    { id: 'E001', name: '张明远', phone: '13800138001', department: '业务一部', password: '123456', jiandaoyunBound: true,  jiandaoyunAccount: '张明远（简道云）', avatar: '' },
    { id: 'E002', name: '李晓燕', phone: '13900139002', department: '业务二部', password: '123456', jiandaoyunBound: true,  jiandaoyunAccount: '李晓燕（简道云）', avatar: '' },
    { id: 'E003', name: '王海涛', phone: '13700137003', department: '业务一部', password: '123456', jiandaoyunBound: false, jiandaoyunAccount: '',                avatar: '' },
    { id: 'E004', name: '陈思琪', phone: '13600136004', department: '业务三部', password: '123456', jiandaoyunBound: false, jiandaoyunAccount: '',                avatar: '' },
  ];

  // 简道云业务员列表（供管理员绑定用）
  const JIANDAOYUN_USERS = [
    { id: 'JDY001', name: '张明远', workId: 'BZ001' },
    { id: 'JDY002', name: '李晓燕', workId: 'BZ002' },
    { id: 'JDY003', name: '王海涛', workId: 'BZ003' },
    { id: 'JDY004', name: '陈思琪', workId: 'BZ004' },
    { id: 'JDY005', name: '刘建国', workId: 'BZ005' },
    { id: 'JDY006', name: '赵雅琴', workId: 'BZ006' },
  ];

  // ============ 银行信贷产品 (12) ============
  const PRODUCTS = [
    // --- 国有大行 ---
    { id: 'P01', name: '融e借',       bank: '工商银行', bankType: '国有大行',   type: '信用贷', minAmt: 60000,  maxAmt: 800000,  minRate: 3.6, maxRate: 5.6, terms: [12,24,36], req: { minCredit: 650, minIncome: 5000,  maxDebtRatio: 50, collateral: false, minYears: 1 }, features: ['纯信用无抵押','线上审批','随借随还'] },
    { id: 'P02', name: '快贷',         bank: '建设银行', bankType: '国有大行',   type: '信用贷', minAmt: 50000,  maxAmt: 500000,  minRate: 3.7, maxRate: 5.8, terms: [12,24,36], req: { minCredit: 640, minIncome: 4500,  maxDebtRatio: 55, collateral: false, minYears: 1 }, features: ['秒批秒贷','按日计息','提前还款无手续费'] },
    { id: 'P03', name: '网捷贷',       bank: '农业银行', bankType: '国有大行',   type: '信用贷', minAmt: 30000,  maxAmt: 300000,  minRate: 3.8, maxRate: 6.0, terms: [12,24,36], req: { minCredit: 630, minIncome: 4000,  maxDebtRatio: 55, collateral: false, minYears: 1 }, features: ['自助申请','自动审批','循环使用'] },
    { id: 'P04', name: '中银E贷',      bank: '中国银行', bankType: '国有大行',   type: '信用贷', minAmt: 50000,  maxAmt: 300000,  minRate: 3.9, maxRate: 6.2, terms: [12,24,36], req: { minCredit: 640, minIncome: 5000,  maxDebtRatio: 50, collateral: false, minYears: 1 }, features: ['全流程线上','实时审批','灵活还款'] },
    // --- 股份制银行 ---
    { id: 'P05', name: '闪电贷',       bank: '招商银行', bankType: '股份制银行', type: '信用贷', minAmt: 20000,  maxAmt: 300000,  minRate: 4.2, maxRate: 7.2, terms: [12,24,36,48], req: { minCredit: 620, minIncome: 4000,  maxDebtRatio: 60, collateral: false, minYears: 1 }, features: ['最快60秒到账','受邀客户专享','支持提前还款'] },
    { id: 'P06', name: '消费微贷',     bank: '民生银行', bankType: '股份制银行', type: '信用贷', minAmt: 30000,  maxAmt: 500000,  minRate: 4.5, maxRate: 7.8, terms: [12,24,36], req: { minCredit: 610, minIncome: 3500,  maxDebtRatio: 60, collateral: false, minYears: 1 }, features: ['额度高','期限灵活','线上申请'] },
    { id: 'P07', name: '新一贷',       bank: '平安银行', bankType: '股份制银行', type: '信用贷', minAmt: 30000,  maxAmt: 500000,  minRate: 4.9, maxRate: 8.5, terms: [12,24,36], req: { minCredit: 600, minIncome: 4000,  maxDebtRatio: 65, collateral: false, minYears: 1 }, features: ['门槛低','审批快','用途广泛'] },
    { id: 'P08', name: '兴闪贷',       bank: '兴业银行', bankType: '股份制银行', type: '信用贷', minAmt: 20000,  maxAmt: 300000,  minRate: 4.3, maxRate: 7.5, terms: [12,24,36], req: { minCredit: 620, minIncome: 4000,  maxDebtRatio: 60, collateral: false, minYears: 1 }, features: ['线上秒批','循环额度','按日计息'] },
    { id: 'P09', name: '信金贷',       bank: '中信银行', bankType: '股份制银行', type: '信用贷', minAmt: 30000,  maxAmt: 300000,  minRate: 4.4, maxRate: 7.6, terms: [12,24,36], req: { minCredit: 620, minIncome: 4500,  maxDebtRatio: 55, collateral: false, minYears: 1 }, features: ['快速审批','灵活期限','随借随还'] },
    // --- 消费金融 / 兜底机构 ---
    { id: 'P10', name: '好期贷',       bank: '招联金融', bankType: '消费金融',   type: '信用贷', minAmt: 5000,   maxAmt: 200000,  minRate: 7.2, maxRate: 14.6, terms: [3,6,12,24,36], req: { minCredit: 560, minIncome: 2500,  maxDebtRatio: 75, collateral: false, minYears: 0 }, features: ['门槛低','放款快','支持分期'] },
    { id: 'P11', name: '乐享贷',       bank: '中银消费金融', bankType: '消费金融', type: '信用贷', minAmt: 10000,  maxAmt: 200000,  minRate: 8.5, maxRate: 15.4, terms: [6,12,24,36], req: { minCredit: 550, minIncome: 2000,  maxDebtRatio: 80, collateral: false, minYears: 0 }, features: ['信用贷','额度灵活','快速放款'] },
    { id: 'P12', name: '经营抵押贷',   bank: '建设银行', bankType: '国有大行',   type: '抵押贷', minAmt: 200000, maxAmt: 5000000, minRate: 3.4, maxRate: 4.8, terms: [12,24,36,60,120], req: { minCredit: 600, minIncome: 8000,  maxDebtRatio: 60, collateral: true,  minYears: 2 }, features: ['额度高','利率低','支持房产/商铺抵押'] },
  ];

  // ============ 客户数据 (16) ============
  // status: new(新线索) / following(跟进中) / matched(已匹配) / approving(审批中) / rejected(已拒绝/失效)
  function daysAgo(n) {
    const d = new Date('2026-08-04T16:46:05+08:00');
    d.setDate(d.getDate() - n);
    return d.toISOString();
  }

  const CUSTOMERS = [
    { id: 'C01', name: '张伟',   phone: '13812345001', gender: '男', age: 42, marital: '已婚', income: 28000, employer: '兴旺餐饮店',           industry: '餐饮',     years: 6, assets: '自有房产(估值280万)+一辆车', liabilities: 450000, creditScore: 680, creditDesc: '信用良好，无逾期记录', collateral: true,  collateralType: '房产', collateralValue: 2800000, demandAmount: 500000,  status: 'new',        lastFollowUp: daysAgo(0),  createdAt: daysAgo(0),  assignedTo: 'E001', tags: ['个体工商户','有抵押物'], matchRecords: [], followUps: [] },
    { id: 'C02', name: '李芳',   phone: '13912345002', gender: '女', age: 35, marital: '已婚', income: 22000, employer: '锦程电子商务有限公司', industry: '电商',     years: 3, assets: '按揭房一套',               liabilities: 1200000, creditScore: 720, creditDesc: '信用优秀',               collateral: false, collateralType: '',     collateralValue: 0,      demandAmount: 300000,  status: 'following',  lastFollowUp: daysAgo(1),  createdAt: daysAgo(3),  assignedTo: 'E001', tags: ['小微企业','电商'], matchRecords: [{ time: daysAgo(2), banks: '工商银行融e借 / 招商银行闪电贷' }], followUps: [{ time: daysAgo(1), note: '电话沟通，客户表示对利率有顾虑' }] },
    { id: 'C03', name: '王强',   phone: '13712345003', gender: '男', age: 48, marital: '已婚', income: 35000, employer: '恒达机械加工厂',         industry: '机械制造', years: 10, assets: '厂房+设备+两套房产',       liabilities: 800000, creditScore: 750, creditDesc: '信用优秀，长期合作客户',   collateral: true,  collateralType: '房产', collateralValue: 4500000, demandAmount: 2000000, status: 'matched',    lastFollowUp: daysAgo(2),  createdAt: daysAgo(10), assignedTo: 'E001', tags: ['中小企业','抵押贷'], matchRecords: [{ time: daysAgo(5), banks: '建设银行经营抵押贷 / 工商银行融e借' }], followUps: [{ time: daysAgo(2), note: '已确认抵押贷方案，正在准备材料' }] },
    { id: 'C04', name: '刘洋',   phone: '13612345004', gender: '男', age: 31, marital: '未婚', income: 18000, employer: '云端软件科技有限公司',   industry: '软件',     years: 2, assets: '无房产，一辆车',           liabilities: 200000, creditScore: 690, creditDesc: '信用良好',               collateral: false, collateralType: '',     collateralValue: 0,      demandAmount: 150000,  status: 'approving',  lastFollowUp: daysAgo(1),  createdAt: daysAgo(7),  assignedTo: 'E001', tags: ['小微企业','信用贷'], matchRecords: [{ time: daysAgo(4), banks: '招商银行闪电贷 / 平安银行新一贷' }], followUps: [{ time: daysAgo(1), note: '已提交审批，等待银行反馈' }] },
    { id: 'C05', name: '陈静',   phone: '13512345005', gender: '女', age: 38, marital: '已婚', income: 15000, employer: '美丽人生服装店',         industry: '服装零售', years: 5, assets: '自有小商铺',               liabilities: 300000, creditScore: 660, creditDesc: '信用一般，有1次信用卡逾期', collateral: false, collateralType: '',     collateralValue: 0,      demandAmount: 200000,  status: 'following',  lastFollowUp: daysAgo(3),  createdAt: daysAgo(5),  assignedTo: 'E001', tags: ['个体工商户','零售'], matchRecords: [], followUps: [{ time: daysAgo(3), note: '客户犹豫中，需要对比利率' }] },
    { id: 'C06', name: '赵磊',   phone: '13412345006', gender: '男', age: 45, marital: '已婚', income: 40000, employer: '磊盛建材有限公司',       industry: '建材',     years: 8, assets: '厂房+三套房产',             liabilities: 2500000, creditScore: 710, creditDesc: '信用良好',               collateral: true,  collateralType: '房产', collateralValue: 6000000, demandAmount: 3000000, status: 'new',        lastFollowUp: daysAgo(0),  createdAt: daysAgo(0),  assignedTo: 'E001', tags: ['中小企业','大额需求'], matchRecords: [], followUps: [] },
    { id: 'C07', name: '孙莉',   phone: '13312345007', gender: '女', age: 33, marital: '已婚', income: 20000, employer: '启航教育咨询公司',       industry: '教育',     years: 4, assets: '按揭房一套',               liabilities: 900000, creditScore: 700, creditDesc: '信用良好',               collateral: false, collateralType: '',     collateralValue: 0,      demandAmount: 250000,  status: 'matched',    lastFollowUp: daysAgo(2),  createdAt: daysAgo(8),  assignedTo: 'E001', tags: ['小微企业','教育行业'], matchRecords: [{ time: daysAgo(3), banks: '建设银行快贷 / 农业银行网捷贷' }], followUps: [{ time: daysAgo(2), note: '已确认快贷方案，准备签约' }] },
    { id: 'C08', name: '周明',   phone: '13212345008', gender: '男', age: 39, marital: '已婚', income: 16000, employer: '顺达物流服务部',         industry: '物流',     years: 5, assets: '货车2辆+一套房',            liabilities: 600000, creditScore: 640, creditDesc: '信用一般，负债略高',       collateral: true,  collateralType: '房产', collateralValue: 1500000, demandAmount: 400000,  status: 'following',  lastFollowUp: daysAgo(1),  createdAt: daysAgo(4),  assignedTo: 'E001', tags: ['个体工商户','物流'], matchRecords: [], followUps: [{ time: daysAgo(1), note: '客户考虑抵押贷方案' }] },
    { id: 'C09', name: '吴婷',   phone: '13112345009', gender: '女', age: 29, marital: '未婚', income: 12000, employer: '康泽医疗器械经营部',     industry: '医疗',     years: 2, assets: '无房产',                   liabilities: 80000, creditScore: 670, creditDesc: '信用良好，无逾期',         collateral: false, collateralType: '',     collateralValue: 0,      demandAmount: 100000,  status: 'new',        lastFollowUp: daysAgo(0),  createdAt: daysAgo(0),  assignedTo: 'E001', tags: ['个体工商户','小额需求'], matchRecords: [], followUps: [] },
    { id: 'C10', name: '郑浩',   phone: '13012345010', gender: '男', age: 41, marital: '已婚', income: 45000, employer: '鸿图电子科技有限公司',   industry: '电子科技', years: 7, assets: '厂房+两套房产+设备',       liabilities: 1800000, creditScore: 730, creditDesc: '信用优秀',               collateral: true,  collateralType: '房产', collateralValue: 3800000, demandAmount: 1500000, status: 'approving',  lastFollowUp: daysAgo(1),  createdAt: daysAgo(6),  assignedTo: 'E001', tags: ['中小企业','抵押贷'], matchRecords: [{ time: daysAgo(3), banks: '建设银行经营抵押贷' }], followUps: [{ time: daysAgo(1), note: '银行已受理，预计3个工作日出结果' }] },
    { id: 'C11', name: '马超',   phone: '18812345011', gender: '男', age: 36, marital: '离异', income: 9000,  employer: '超哥汽修店',             industry: '汽修',     years: 3, assets: '无房产，设备若干',           liabilities: 250000, creditScore: 580, creditDesc: '信用较差，近半年有2次逾期', collateral: false, collateralType: '',     collateralValue: 0,      demandAmount: 80000,   status: 'rejected',   lastFollowUp: daysAgo(5),  createdAt: daysAgo(12), assignedTo: 'E001', tags: ['个体工商户','信用修复中'], matchRecords: [{ time: daysAgo(6), banks: '招联金融好期贷（被拒）' }], followUps: [{ time: daysAgo(5), note: '银行审批未通过，建议修复征信后重试' }] },
    { id: 'C12', name: '林雪',   phone: '18712345012', gender: '女', age: 28, marital: '未婚', income: 14000, employer: '创意无限广告工作室',     industry: '广告设计', years: 2, assets: '无房产',                   liabilities: 100000, creditScore: 650, creditDesc: '信用良好',               collateral: false, collateralType: '',     collateralValue: 0,      demandAmount: 120000,  status: 'following',  lastFollowUp: daysAgo(2),  createdAt: daysAgo(4),  assignedTo: 'E001', tags: ['小微企业','创意行业'], matchRecords: [], followUps: [{ time: daysAgo(2), note: '客户需要时间考虑还款压力' }] },
    { id: 'C13', name: '黄勇',   phone: '18612345013', gender: '男', age: 50, marital: '已婚', income: 25000, employer: '勇记水产养殖场',         industry: '水产养殖', years: 12, assets: '养殖场+一套房',             liabilities: 500000, creditScore: 690, creditDesc: '信用良好',               collateral: true,  collateralType: '房产', collateralValue: 2000000, demandAmount: 600000,  status: 'new',        lastFollowUp: daysAgo(0),  createdAt: daysAgo(0),  assignedTo: 'E001', tags: ['个体工商户','农业'], matchRecords: [], followUps: [] },
    { id: 'C14', name: '高敏',   phone: '18512345014', gender: '女', age: 34, marital: '已婚', income: 11000, employer: '温馨家政服务公司',       industry: '家政服务', years: 3, assets: '无房产',                   liabilities: 50000, creditScore: 620, creditDesc: '信用一般',               collateral: false, collateralType: '',     collateralValue: 0,      demandAmount: 80000,   status: 'matched',    lastFollowUp: daysAgo(3),  createdAt: daysAgo(9),  assignedTo: 'E001', tags: ['小微企业','小额需求'], matchRecords: [{ time: daysAgo(4), banks: '平安银行新一贷' }], followUps: [{ time: daysAgo(3), note: '已确认新一贷方案' }] },
    { id: 'C15', name: '何鑫',   phone: '18412345015', gender: '男', age: 43, marital: '已婚', income: 38000, employer: '鑫达五金制造有限公司',   industry: '五金制造', years: 9, assets: '厂房+两套房+设备',          liabilities: 1500000, creditScore: 740, creditDesc: '信用优秀',               collateral: true,  collateralType: '房产', collateralValue: 4200000, demandAmount: 2500000, status: 'approving',  lastFollowUp: daysAgo(1),  createdAt: daysAgo(5),  assignedTo: 'E001', tags: ['中小企业','大额抵押'], matchRecords: [{ time: daysAgo(3), banks: '建设银行经营抵押贷 / 工商银行融e借' }], followUps: [{ time: daysAgo(1), note: '正在评估抵押物价值' }] },
    { id: 'C16', name: '罗琳',   phone: '18312345016', gender: '女', age: 32, marital: '已婚', income: 13000, employer: '琳琳美容美发工作室',     industry: '美容美发', years: 4, assets: '无房产，店面设备',           liabilities: 150000, creditScore: 630, creditDesc: '信用一般，历史正常',       collateral: false, collateralType: '',     collateralValue: 0,      demandAmount: 100000,  status: 'following',  lastFollowUp: daysAgo(1),  createdAt: daysAgo(3),  assignedTo: 'E001', tags: ['个体工商户','小额需求'], matchRecords: [], followUps: [{ time: daysAgo(1), note: '客户对额度有期望，需要匹配多家对比' }] },
  ];

  // ============ 对话历史 ============
  const CONVERSATIONS = [
    { id: 'CV01', title: '与王强的匹配对话', time: '2026-08-03 14:30', customerName: '王强', strategyCount: 3, messages: [
      { role: 'user',      text: '帮我为王强匹配产品' },
      { role: 'assistant', text: '为您找到以下匹配方案：', strategies: [
        { tier: 'preferred', bank: '建设银行', product: '经营抵押贷', amountRange: '200万-500万', rateRange: '3.4%-4.8%', note: '查 建设银行 经营抵押贷 是否支持厂房抵押' },
        { tier: 'backup',    bank: '工商银行', product: '融e借',     amountRange: '6万-80万',   rateRange: '3.6%-5.6%', note: '需补充：近6个月银行流水' },
        { tier: 'fallback',  bank: '招联金融', product: '好期贷',     amountRange: '5000-20万',  rateRange: '7.2%-14.6%', note: '' },
      ]},
    ]},
    { id: 'CV02', title: '与李芳的匹配对话', time: '2026-08-02 10:15', customerName: '李芳', strategyCount: 3, messages: [
      { role: 'user',      text: '李芳，月入2.2万，无负债抵押，信用720' },
      { role: 'assistant', text: '为您找到以下匹配方案：', strategies: [
        { tier: 'preferred', bank: '工商银行', product: '融e借',     amountRange: '6万-80万',  rateRange: '3.6%-5.6%', note: '查 工商银行 融e借 线上申请流程' },
        { tier: 'backup',    bank: '招商银行', product: '闪电贷',     amountRange: '2万-30万',  rateRange: '4.2%-7.2%', note: '需补充：社保缴纳记录截图' },
        { tier: 'fallback',  bank: '平安银行', product: '新一贷',     amountRange: '3万-50万',  rateRange: '4.9%-8.5%', note: '' },
      ]},
    ]},
  ];

  // ============ 匹配规则配置（后台可编辑） ============
  const MATCH_RULES = {
    // 优先推荐档位
    preferred: {
      minCreditScore: 650,
      maxDebtRatio: 55,
      bankTypes: ['国有大行'],
      rateCeiling: 6.0,
    },
    // 备选方案档位
    backup: {
      minCreditScore: 600,
      maxDebtRatio: 65,
      bankTypes: ['国有大行', '股份制银行'],
      rateCeiling: 8.5,
    },
    // 兜底方案档位
    fallback: {
      minCreditScore: 500,
      maxDebtRatio: 80,
      bankTypes: ['消费金融'],
      rateCeiling: 20,
    },
    // 额度建议倍数（月收入倍数）
    amountMultiplier: { preferred: 30, backup: 20, fallback: 10 },
  };

  // ============ 系统通知 ============
  const NOTIFICATIONS = [
    { id: 'N01', type: 'system', title: '新客户分配', content: '系统已为您分配3名新客户，请及时跟进', time: '2026-08-04 09:00', read: false },
    { id: 'N02', type: 'system', title: '审批结果通知', content: '客户刘洋的贷款审批已通过，请通知客户', time: '2026-08-04 14:30', read: false },
    { id: 'N03', type: 'system', title: '贷款临期提醒', content: '客户王强的贷款将于8月10日到期，请安排续贷', time: '2026-08-04 10:00', read: true },
  ];

  return { EMPLOYEES, JIANDAOYUN_USERS, PRODUCTS, CUSTOMERS, CONVERSATIONS, MATCH_RULES, NOTIFICATIONS };
})();
