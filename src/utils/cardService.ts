/**
 * 名片数据服务层（前端阶段：本地实现）
 *
 * UI 组件只调用本模块接口，不直接操作存储。
 * 将来部署服务端时，仅需新增一个 HTTP 实现并替换这里导出的函数，
 * 接口签名已按未来后端契约设计（shortCode / status / 审计字段）。
 */
import type { CardData } from './cardCodec';

/** 名片记录（与服务端契约对齐的数据结构） */
export interface CardRecord extends CardData {
  /** 唯一 ID（uuid 短格式） */
  id: string;
  /** 8 位短码，用于 /card/:shortCode 短链接 */
  shortCode: string;
  /** 状态：active 正常 / disabled 已停用 */
  status: 'active' | 'disabled';
  createdAt: number;
  updatedAt: number;
}

const STORE_KEY = 'zhongju_card_store';
const MINE_KEY = 'zhongju_my_codes';
const GEN_LOG_KEY = 'zhongju_gen_log';

/** 每台设备每天最多生成名片数（防滥用） */
export const DAILY_GEN_LIMIT = 5;

/* ---------------- shortCode ---------------- */

const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'; // 去除易混淆字符

/** 生成 8 位短码（crypto 随机，避免冲突时由调用方重试） */
export function generateShortCode(): string {
  const buf = new Uint8Array(8);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(buf);
  } else {
    for (let i = 0; i < 8; i++) buf[i] = Math.floor(Math.random() * 256);
  }
  let out = '';
  for (let i = 0; i < 8; i++) out += CODE_ALPHABET[buf[i] % CODE_ALPHABET.length];
  return out;
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/* ---------------- 本地存储 ---------------- */

interface StoreShape {
  records: Record<string, CardRecord>; // shortCode -> record
  order: string[]; // 创建顺序（最新在前）
}

function readStore(): StoreShape {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === 'object' && parsed.records) return parsed;
  } catch {
    /* ignore */
  }
  return { records: {}, order: [] };
}

function writeStore(store: StoreShape): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {
    /* ignore */
  }
}

function readMine(): string[] {
  try {
    const raw = localStorage.getItem(MINE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeMine(codes: string[]): void {
  try {
    localStorage.setItem(MINE_KEY, JSON.stringify(codes));
  } catch {
    /* ignore */
  }
}

/* ---------------- 对外接口 ---------------- */

export interface CreateResult {
  ok: true;
  record: CardRecord;
}

export interface CreateError {
  ok: false;
  error: string;
}

/** 名片字段校验（与服务端未来校验规则保持一致） */
export function validateCardData(data: CardData): string | null {
  if (!data.name.trim()) return '请填写姓名';
  if (data.name.trim().length > 12) return '姓名不能超过 12 个字';
  if (!/^1\d{10}$/.test(data.phone.trim())) return '请填写正确的 11 位手机号';
  if (data.title.trim().length > 20) return '职位不能超过 20 个字';
  if (data.department.trim().length > 20) return '部门不能超过 20 个字';
  if (data.wechat.trim().length > 30) return '微信号过长';
  if (data.bio.trim().length > 60) return '一句话介绍不能超过 60 个字';
  return null;
}

/** 本设备今日已生成次数 */
export function todayGenCount(): number {
  try {
    const raw = localStorage.getItem(GEN_LOG_KEY);
    const list: number[] = raw ? JSON.parse(raw) : [];
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return list.filter((t) => t >= start.getTime()).length;
  } catch {
    return 0;
  }
}

function logGen(): void {
  try {
    const raw = localStorage.getItem(GEN_LOG_KEY);
    const list: number[] = raw ? JSON.parse(raw) : [];
    list.push(Date.now());
    localStorage.setItem(GEN_LOG_KEY, JSON.stringify(list.slice(-50)));
  } catch {
    /* ignore */
  }
}

/** 创建名片（本地实现；服务端阶段替换为 POST /api/cards） */
export function createCard(data: CardData): CreateResult | CreateError {
  const invalid = validateCardData(data);
  if (invalid) return { ok: false, error: invalid };
  if (todayGenCount() >= DAILY_GEN_LIMIT) {
    return {
      ok: false,
      error: `今日生成次数已达上限（${DAILY_GEN_LIMIT} 张），请明天再试`,
    };
  }
  const store = readStore();
  let shortCode = generateShortCode();
  while (store.records[shortCode]) shortCode = generateShortCode(); // 防碰撞
  const now = Date.now();
  const record: CardRecord = {
    ...data,
    id: uuid(),
    shortCode,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };
  store.records[shortCode] = record;
  store.order.unshift(shortCode);
  writeStore(store);
  writeMine([shortCode, ...readMine().slice(0, 19)]);
  logGen();
  return { ok: true, record };
}

/** 按短码查询名片（本地实现；服务端阶段替换为 GET /api/cards/:code） */
export function getCardByCode(code: string): CardRecord | null {
  const store = readStore();
  return store.records[code] ?? null;
}

/** 更新名片状态（本地实现；服务端阶段替换为 PATCH /api/cards/:code） */
export function setCardStatus(code: string, status: CardRecord['status']): void {
  const store = readStore();
  const rec = store.records[code];
  if (!rec) return;
  rec.status = status;
  rec.updatedAt = Date.now();
  writeStore(store);
}

/** 删除名片 */
export function deleteCard(code: string): void {
  const store = readStore();
  delete store.records[code];
  store.order = store.order.filter((c) => c !== code);
  writeStore(store);
  writeMine(readMine().filter((c) => c !== code));
}

/** 本机名片列表（最新在前） */
export function listMyRecords(): CardRecord[] {
  const store = readStore();
  return readMine()
    .map((c) => store.records[c])
    .filter((r): r is CardRecord => !!r);
}

/** 短链接 */
export function cardUrlOfCode(code: string): string {
  return `${window.location.origin}/card/${code}`;
}

/* ---------------- 本机名片索引（服务端模式只存短码，数据在服务器） ---------------- */

/** 记录一张本机生成过的名片短码 */
export function rememberCode(code: string): void {
  writeMine([code, ...readMine().filter((c) => c !== code).slice(0, 19)]);
}

/** 从本机索引移除短码 */
export function forgetCode(code: string): void {
  writeMine(readMine().filter((c) => c !== code));
}

/** 本机已生成过的短码列表（最新在前） */
export function myCodes(): string[] {
  return readMine();
}

/** 记录一次生成（用于"今日 N/上限"提示；服务端另有独立限流） */
export function recordGeneration(): void {
  logGen();
}

/* ---------------- 旧数据迁移 ---------------- */

/**
 * 将旧版（zhongju_my_cards 中的无短码名片）迁移到新存储，
 * 使其获得短码链接；已迁移过的跳过。
 */
export function migrateLegacyCards(
  legacy: Array<CardData & { createdAt: number }>
): number {
  const store = readStore();
  const mine = readMine();
  let migrated = 0;
  for (const card of legacy) {
    const exists = Object.values(store.records).some(
      (r) => r.phone === card.phone && r.name === card.name
    );
    if (exists) continue;
    let shortCode = generateShortCode();
    while (store.records[shortCode]) shortCode = generateShortCode();
    const record: CardRecord = {
      ...card,
      id: uuid(),
      shortCode,
      status: 'active',
      createdAt: card.createdAt,
      updatedAt: Date.now(),
    };
    store.records[shortCode] = record;
    store.order.unshift(shortCode);
    mine.unshift(shortCode);
    migrated++;
  }
  if (migrated) {
    writeStore(store);
    writeMine(mine);
  }
  return migrated;
}
