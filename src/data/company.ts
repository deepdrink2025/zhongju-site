/**
 * 站点静态数据（公司信息、统计、业务板块、历程、荣誉、案例、客户墙）
 * 数据来源：公司简介 PDF。后续可在此文件直接替换/增删内容。
 */

export interface StatItem {
  /** 展示数值（纯文本，便于排版） */
  value: string;
  label: string;
}

export interface Solution {
  id: string;
  title: string;
  icon: string;
  intro: string;
  points: string[];
  /** 板块配图（public/images 下，源自公司简介 PDF，可选） */
  img?: string;
}

export interface TimelineItem {
  year: string;
  title: string;
  desc: string;
}

export interface ClientCompany {
  name: string;
  /** 公司/产品 logo（public/images/logos 下） */
  logo: string;
}

export interface ClientGroup {
  industry: string;
  companies: ClientCompany[];
}

export const company = {
  fullName: '临邑中聚人力资源有限公司',
  shortName: '中聚人力',
  brandText: '中聚人力',
  slogan: '连接人才与机会，助力企业高效用工',
  heroTitle: '让每一家企业用工无忧',
  heroSubtitle: '为三亿国人找到理想的工作',
  hotline: '0534-2146777',
  address: '山东省德州市临邑县永兴大街与东岳路交叉口西100米路北',
  gigMarket: '临邑县人力资源和社会保障局一楼大厅',
  intro:
    '临邑中聚人力资源有限公司成立于2017年，注册资金500万元，总部位于山东省德州市临邑县。公司深耕人力资源服务行业，形成了劳务派遣、生产线外包、中小微企业人事托管、产业园运营、OPC社区运营、OEM工厂六大业务板块。截至目前，公司在全国设有分子公司28家，拥有专职招聘人员195人，年安置就业100,000人次，累计安置就业47万余人次，合作企业200余家，并自2025年起正式运营德州人力资源产业园，是德州市人力资源服务行业的领军机构。',
};

export const stats: StatItem[] = [
  { value: '28家', label: '分子公司' },
  { value: '195人', label: '专职招聘人员' },
  { value: '100,000', label: '年安置就业（人次）' },
  { value: '47万+', label: '累计安置就业（人次）' },
  { value: '200+', label: '合作企业' },
  { value: '12家', label: '运营零工市场' },
];

export const culture = [
  {
    title: '愿景',
    desc: '为三亿国人找到理想的工作，成为中国领先的人力资源服务供应商',
  },
  {
    title: '使命',
    desc: '为客户提供优质服务，为员工创造丰厚收入，为社会做出更大贡献',
  },
  {
    title: '核心价值观',
    desc: '以客户为中心，诚信负责',
  },
  {
    title: '公司宗旨',
    desc: '动机至善、私心了无',
  },
];

export const solutions: Solution[] = [
  {
    id: 'dispatch',
    title: '劳务派遣',
    icon: 'users',
    intro:
      '规范化劳务派遣服务，覆盖招聘、入职、薪酬、社保全流程，帮助企业灵活用工、降本增效。',
    points: ['全流程规范化管理', '灵活用工降本增效', '专职招聘团队保障到岗率'],
    img: '/images/dispatch.jpg',
  },
  {
    id: 'outsourcing',
    title: '生产线外包',
    icon: 'factory',
    intro:
      '服务客户包括达利园、旺旺、京东物流、申通、中通云仓、长城汽车、蓝帆医疗、金麒麟等知名企业，拥有27名专业生产管理经理，执行6S管理与精益生产。',
    points: ['27名专业生产管理经理', '6S管理 / 精益生产', '知名企业长期合作验证'],
    img: '/images/production.jpg',
  },
  {
    id: 'hr-hosting',
    title: '中小微企业人事托管',
    icon: 'idcard',
    intro:
      '为中小微企业提供一站式人事托管服务，涵盖招聘流程外包（RPO）、社保代缴、薪酬核算、劳动合同管理，并依托调研200个用工风险点、解决30个用工难点构建的10大管控系统，全面防控企业用工风险。',
    points: [
      '招聘流程RPO：四步标准化交付',
      '社保代缴 / 薪酬核算一站式托管',
      '10大用工管控系统防控风险',
    ],
    img: '/images/hr-hosting.jpg',
  },
  {
    id: 'park',
    title: '产业园运营',
    icon: 'building',
    intro:
      '自2025年起正式运营德州人力资源产业园，并在临邑运营2000㎡零工市场、承接德州、济南等8地零工市场运营，曾受山东省人社厅与国家人社部调研关注，构建人力资源产业集聚与就业服务生态。',
    points: [
      '2025年起运营德州人力资源产业园',
      '临邑零工市场2000㎡ / 承接8地运营',
      '省市人社部门调研关注',
    ],
    img: '/images/park.jpg',
  },
  {
    id: 'opc',
    title: 'OPC社区运营',
    icon: 'briefcase',
    intro:
      '运营德州市青年就业创业服务中心，面向青年创业计划发展OPC创业模式，配套"齐鲁招聘"平台（已助力2万人次就业）、多彩云人事SaaS与直播带岗（累计观看547.8万人次）等数字化就业服务，助力青年就业创业。',
    points: [
      '运营德州市青年就业创业服务中心',
      'OPC青年创业计划孵化',
      '直播带岗累计观看547.8万人次',
    ],
    img: '/images/opc.jpg',
  },
  {
    id: 'oem',
    title: 'OEM工厂',
    icon: 'cog',
    intro:
      '2024年全资建设生产型工厂，提供OEM代工生产服务，依托自有工厂与成熟的生产管理团队，实现人力资源与实体产能的深度融合，为客户提供从用工到交付的一体化解决方案。',
    points: ['2024年全资建设自有工厂', '成熟生产管理团队', '用工+产能一体化交付'],
    img: '/images/factory.jpg',
  },
];

export const timeline: TimelineItem[] = [
  {
    year: '2017',
    title: '公司成立',
    desc: '临邑中聚人力资源有限公司成立；2018年成立外包项目部，年安置就业突破1000人。',
  },
  {
    year: '2019',
    title: '区域扩张',
    desc: '累计设立14家分公司，获评德州市诚信服务示范机构。',
  },
  {
    year: '2020',
    title: '布局全省',
    desc: '累计20余家分公司，成立山东中聚入驻德州人力资源服务产业园，运营临邑县人力资源市场。',
  },
  {
    year: '2021',
    title: '省级认可',
    desc: '荣获山东省促就业奖、成长创新奖。',
  },
  {
    year: '2022',
    title: '科技赋能',
    desc: '成立中聚科技，开发"齐鲁招聘"小程序。',
  },
  {
    year: '2023',
    title: '行业引领',
    desc: '荣膺临邑县人力资源行业协会会长单位、德州市副会长单位；网招部开启直播带岗。',
  },
  {
    year: '2024',
    title: '多元发展',
    desc: '组建多彩云人事SaaS项目组，全资建设生产型工厂，再获省促就业奖，入选省发展报告。',
  },
  {
    year: '2025',
    title: '创新夺魁',
    desc: '荣获德州市第二届人力资源服务业创新大赛一等奖。',
  },
];

export interface HonorItem {
  name: string;
  /** 奖牌照片（源自公司简介 PDF 第 9 页，可选） */
  img?: string;
}

export const honors: HonorItem[] = [
  { name: '山东省人力资源服务机构促就业奖（2022）', img: '/images/honor-jiuye.jpg' },
  { name: '山东省人力资源服务机构成长创新奖', img: '/images/honor-chuangxin.jpg' },
  { name: '德州市人力资源服务业领军机构', img: '/images/honor-lingjun.jpg' },
  { name: '德州市诚信服务示范机构', img: '/images/honor-chengxin.jpg' },
  { name: '德州市就业服务质量市级标杆机构', img: '/images/honor-biaogan.jpg' },
  { name: '达利食品最佳合作伙伴', img: '/images/honor-hezuohuo.jpg' },
  { name: '山东省人力资源服务机构促就业奖（2024）' },
  { name: '临邑县人力资源行业协会会长单位' },
  { name: '德州市人力资源服务行业协会副会长单位' },
  { name: '2025德州市级人力资源创新大赛一等奖' },
];

export const clientGroups: ClientGroup[] = [
  {
    industry: '汽车',
    companies: [
      { name: '中国重汽', logo: '/images/logos/std/sinotruk.png' },
      { name: '长城汽车', logo: '/images/logos/std/gwm.png' },
      { name: '福田汽车', logo: '/images/logos/std/foton.png' },
      { name: '金麒麟', logo: '/images/logos/std/jinqilin.png' },
    ],
  },
  {
    industry: '电子',
    companies: [
      { name: 'LG', logo: '/images/logos/std/lg.png' },
      { name: '海信', logo: '/images/logos/std/hisense.png' },
      { name: '歌尔', logo: '/images/logos/std/goertek.png' },
    ],
  },
  {
    industry: '食品',
    companies: [
      { name: '旺旺', logo: '/images/logos/std/wantwant.png' },
      { name: '达利园', logo: '/images/logos/std/dali.png' },
      { name: '双汇', logo: '/images/logos/std/shuanghui.png' },
      { name: '华莱士', logo: '/images/logos/std/hls.png' },
    ],
  },
  {
    industry: '物流',
    companies: [
      { name: '京东物流', logo: '/images/logos/std/jdl.png' },
      { name: '中通', logo: '/images/logos/std/zto.png' },
      { name: '申通', logo: '/images/logos/std/sto.png' },
    ],
  },
  {
    industry: '通信',
    companies: [
      { name: '中国电信', logo: '/images/logos/std/telecom.png' },
      { name: '中国联通', logo: '/images/logos/std/unicom.png' },
    ],
  },
];

/** 导航锚点配置（与 Home 页 section id 保持一致） */
export const navSections = [
  { id: 'hero', label: '首页' },
  { id: 'about', label: '关于我们' },
  { id: 'solutions', label: '业务板块' },
  { id: 'timeline', label: '发展历程' },
  { id: 'honors', label: '荣誉资质' },
  { id: 'clients', label: '合作客户' },
  { id: 'contact', label: '联系我们' },
];
