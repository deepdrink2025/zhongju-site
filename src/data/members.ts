/**
 * 业务人员名片数据（示例数据，供用户后续替换为真实业务人员名单）
 * 注意：以下电话与微信号均为占位示例，非真实联系方式。
 */

export interface Member {
  /** 名片路由 id，如 /card/wang */
  id: string;
  name: string;
  title: string;
  /** 部门 */
  department: string;
  /** 示例电话（占位） */
  phone: string;
  /** 示例微信号（占位） */
  wechat: string;
  /** 简介 */
  bio: string;
  /** 头像（可选，dataURL） */
  avatar?: string;
}

export const members: Member[] = [
  {
    id: 'wang',
    name: '王经理',
    title: '业务一部经理',
    department: '业务一部',
    phone: '13800000001',
    wechat: 'zhongju_wang01',
    bio: '专注制造业一线用工解决方案，熟悉劳务派遣与生产线外包全流程。',
  },
  {
    id: 'li',
    name: '李经理',
    title: '业务二部经理',
    department: '业务二部',
    phone: '13800000002',
    wechat: 'zhongju_li02',
    bio: '深耕物流与食品行业人力供应，服务多家知名上市企业，高峰保供经验丰富。',
  },
  {
    id: 'zhang',
    name: '张主管',
    title: '驻厂服务主管',
    department: '驻厂服务部',
    phone: '13800000003',
    wechat: 'zhongju_zhang03',
    bio: '负责驻厂员工日常管理与关系维护，执行6S管理与精益生产标准。',
  },
  {
    id: 'liu',
    name: '刘顾问',
    title: '用工风险咨询顾问',
    department: '用工风险咨询部',
    phone: '13800000004',
    wechat: 'zhongju_liu04',
    bio: '擅长企业用工风险防控咨询，覆盖入职、社保、工时、离职全环节合规设计。',
  },
];

/** 按 id 查找成员；找不到返回 undefined */
export function findMember(id: string | undefined): Member | undefined {
  return members.find((m) => m.id === id);
}
