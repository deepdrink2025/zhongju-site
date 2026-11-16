import crypto from 'node:crypto';

export function fakeRepository() {
  const rows = [],
    usage = new Map();
  return {
    rows,
    usage,
    async getCard(code) {
      return rows.find((row) => row.short_code === code) || null;
    },
    async quota(userId, day) {
      return usage.get(userId + day) || 0;
    },
    async createCard(data, { userId, day, limit, generateCode }) {
      const key = userId + day,
        used = usage.get(key) || 0;
      if (used >= limit) throw Object.assign(new Error('今日生成次数已达上限'), { status: 429 });
      const record = {
        ...data,
        id: crypto.randomBytes(8).toString('hex'),
        short_code: generateCode(),
        owner_user_id: userId,
      };
      rows.push(record);
      usage.set(key, used + 1);
      return record;
    },
    async updateCard(code, data) {
      const row = rows.find((item) => item.short_code === code);
      if (!row) return null;
      Object.assign(row, data, { updated_at: Date.now() });
      return row;
    },
    async setStatus(code, status) {
      const row = rows.find((item) => item.short_code === code);
      if (!row) return false;
      row.status = status;
      row.updated_at = Date.now();
      return true;
    },
    async deleteCard(code) {
      const index = rows.findIndex((row) => row.short_code === code);
      if (index < 0) return false;
      rows.splice(index, 1);
      return true;
    },
    async setOwner(code, userId) {
      const row = rows.find((item) => item.short_code === code);
      if (!row) return false;
      row.owner_user_id = userId;
      row.updated_at = Date.now();
      return true;
    },
    async listCards({
      userId,
      keyword = '',
      status = 'all',
      limit = 50,
      offset = 0,
      includeAvatar = false,
    }) {
      const all = rows.filter(
        (row) =>
          (!userId || row.owner_user_id === userId) &&
          [row.name, row.phone, row.short_code, row.title, row.department].some((value) =>
            String(value || '')
              .toLowerCase()
              .includes(keyword.toLowerCase())
          )
      );
      const counts = {
        total: all.length,
        active: all.filter((row) => row.status === 'active').length,
        disabled: all.filter((row) => row.status === 'disabled').length,
      };
      const filtered = all
        .filter((row) => status === 'all' || row.status === status)
        .sort((a, b) => b.created_at - a.created_at || b.id.localeCompare(a.id));
      return {
        rows: filtered
          .slice(offset, offset + limit)
          .map((row) => ({ ...row, avatar: includeAvatar ? row.avatar : undefined })),
        counts,
        total: filtered.length,
      };
    },
  };
}
