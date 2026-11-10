import crypto from 'node:crypto';

export function fakeRepository() {
  const rows = [],
    sessions = new Map(),
    usage = new Map();
  return {
    rows,
    sessions,
    usage,
    async getCard(code) {
      return rows.find((row) => row.short_code === code) || null;
    },
    async createSession(session) {
      sessions.set(session.id, { ...session });
    },
    async sessionActive(id, now) {
      const session = sessions.get(id);
      return !!session && !session.revoked && session.exp > now;
    },
    async revokeSession(id) {
      const session = sessions.get(id);
      if (session) session.revoked = true;
    },
    async cleanupSessions(now) {
      for (const [id, s] of sessions) if (s.exp <= now) sessions.delete(id);
    },
    async quota(owner, day) {
      return usage.get(owner + day) || 0;
    },
    async createCard(data, { owner, day, limit, generateCode }) {
      const key = owner + day,
        used = usage.get(key) || 0;
      if (used >= limit) throw Object.assign(new Error('今日生成次数已达上限'), { status: 429 });
      const record = {
        ...data,
        id: crypto.randomBytes(8).toString('hex'),
        short_code: generateCode(),
        owner_key: owner,
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
    async setOwner(code, owner) {
      const row = rows.find((item) => item.short_code === code);
      if (!row) return false;
      row.owner_key = owner;
      row.updated_at = Date.now();
      return true;
    },
    async listCards({
      owner,
      keyword = '',
      status = 'all',
      limit = 50,
      offset = 0,
      includeAvatar = false,
    }) {
      const all = rows.filter(
        (row) =>
          (!owner || row.owner_key === owner) &&
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
