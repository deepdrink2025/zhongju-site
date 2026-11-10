import sharp from 'sharp';

export class WindowLimiter {
  constructor(limit, windowMs, maxKeys = 10000) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.maxKeys = maxKeys;
    this.entries = new Map();
    this.sweptAt = 0;
  }
  available(key, now = Date.now()) {
    if (now - this.sweptAt >= 60000 || this.entries.size >= this.maxKeys) {
      for (const [item, entry] of this.entries) if (entry.expires <= now) this.entries.delete(item);
      this.sweptAt = now;
    }
    const entry = this.entries.get(key);
    if (!entry || entry.expires <= now)
      return this.entries.has(key) || this.entries.size < this.maxKeys;
    return entry.count < this.limit;
  }
  consume(key, now = Date.now()) {
    if (!this.available(key, now)) return false;
    const entry = this.entries.get(key);
    if (!entry || entry.expires <= now)
      this.entries.set(key, { count: 1, expires: now + this.windowMs });
    else entry.count++;
    return true;
  }
}

export function trustProxyConfig(value) {
  if (value === false || !value || value === 'false' || value === '0') return false;
  if (value === true || value === 'true')
    throw new Error('TRUST_PROXY must name trusted proxies, not true');
  return String(value)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

export function validateProductionSecrets({ staffToken, adminToken, tokenSecret }) {
  for (const [name, value, min] of [
    ['STAFF_TOKEN', staffToken, 16],
    ['ADMIN_TOKEN', adminToken, 16],
    ['TOKEN_SECRET', tokenSecret, 32],
  ]) {
    if (
      typeof value !== 'string' ||
      value.length < min ||
      /请|改成|change.?me|example|placeholder/i.test(value)
    )
      throw new Error(`${name} must be a strong non-placeholder value (minimum ${min} characters)`);
  }
  if (staffToken === adminToken) throw new Error('Staff and administrator passcodes must differ');
}

export function quotaClock(timeZone) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const day = (time) => {
    const parts = Object.fromEntries(
      formatter.formatToParts(time).map((part) => [part.type, part.value])
    );
    return `${parts.year}-${parts.month}-${parts.day}`;
  };
  return (now = Date.now()) => {
    const key = day(now);
    let low = now,
      high = now + 27 * 3600000;
    while (high - low > 1000) {
      const mid = Math.floor((low + high) / 2);
      if (day(mid) === key) low = mid;
      else high = mid;
    }
    return { day: key, resetAt: Math.ceil(high / 1000) * 1000, timeZone };
  };
}

export async function normalizeCard(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data))
    throw Object.assign(new Error('名片数据格式不正确'), { status: 400 });
  const result = {};
  for (const [field, limit] of [
    ['name', 12],
    ['title', 20],
    ['department', 20],
    ['phone', 11],
    ['wechat', 30],
    ['bio', 60],
  ]) {
    if (data[field] != null && typeof data[field] !== 'string')
      throw Object.assign(new Error('名片字段必须为文字'), { status: 400 });
    result[field] = (data[field] || '').trim();
    if (result[field].length > limit)
      throw Object.assign(new Error(`${field} 超过长度限制`), { status: 400 });
  }
  if (!result.name) throw Object.assign(new Error('请填写姓名'), { status: 400 });
  if (!/^1\d{10}$/.test(result.phone))
    throw Object.assign(new Error('请填写正确的 11 位手机号'), { status: 400 });
  result.avatar = '';
  if (data.avatar) {
    if (typeof data.avatar !== 'string' || data.avatar.length > 350000)
      throw Object.assign(new Error('头像过大，请上传较小的照片'), { status: 400 });
    const match = /^data:image\/(jpeg|png);base64,([A-Za-z0-9+/]+={0,2})$/.exec(data.avatar);
    if (!match) throw Object.assign(new Error('头像仅支持上传 JPEG 或 PNG 图片'), { status: 400 });
    try {
      const bytes = Buffer.from(match[2], 'base64');
      if (bytes.length > 256 * 1024 || bytes.toString('base64') !== match[2])
        throw new Error('Invalid image encoding');
      const image = sharp(bytes, {
        limitInputPixels: 1024 * 1024,
        animated: false,
        failOn: 'warning',
      });
      const meta = await image.metadata();
      if (
        !['jpeg', 'png'].includes(meta.format) ||
        !meta.width ||
        !meta.height ||
        (meta.pages || 1) > 1
      )
        throw new Error('Invalid image type');
      const output = await image
        .rotate()
        .resize(180, 180, { fit: 'cover' })
        .jpeg({ quality: 75 })
        .toBuffer();
      result.avatar = 'data:image/jpeg;base64,' + output.toString('base64');
    } catch {
      throw Object.assign(new Error('头像无效或尺寸过大，请重新上传'), { status: 400 });
    }
  }
  return result;
}
