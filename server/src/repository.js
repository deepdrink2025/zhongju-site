import crypto from 'node:crypto';

export function createRepository(pool) {
  const getCard = async (code) => {
    const [rows] = await pool.query('SELECT * FROM cards WHERE short_code = ? LIMIT 1', [code]);
    return rows[0] || null;
  };
  return {
    getCard,
    async createSession(s) {
      await pool.query(
        'INSERT INTO card_sessions (id, role, owner_key, expires_at) VALUES (?, ?, ?, ?)',
        [s.id, s.role, s.owner, s.exp]
      );
    },
    async sessionActive(id, now) {
      const [rows] = await pool.query(
        'SELECT id FROM card_sessions WHERE id = ? AND revoked_at IS NULL AND expires_at > ? LIMIT 1',
        [id, now]
      );
      return rows.length > 0;
    },
    async revokeSession(id, now) {
      await pool.query('UPDATE card_sessions SET revoked_at = ? WHERE id = ?', [now, id]);
    },
    async cleanupSessions(now) {
      await pool.query('DELETE FROM card_sessions WHERE expires_at <= ?', [now]);
      await pool.query('DELETE FROM card_daily_usage WHERE day_key < ?', [
        new Date(now - 32 * 86400000).toISOString().slice(0, 10),
      ]);
    },
    async quota(owner, day) {
      const [rows] = await pool.query(
        'SELECT used FROM card_daily_usage WHERE owner_key = ? AND day_key = ?',
        [owner, day]
      );
      return Number(rows[0]?.used || 0);
    },
    async createCard(record, { owner, day, limit, generateCode }) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        await connection.query(
          'INSERT INTO card_daily_usage (owner_key, day_key, used) VALUES (?, ?, 0) ON DUPLICATE KEY UPDATE used = used',
          [owner, day]
        );
        const [usage] = await connection.query(
          'SELECT used FROM card_daily_usage WHERE owner_key = ? AND day_key = ? FOR UPDATE',
          [owner, day]
        );
        if (Number(usage[0].used) >= limit)
          throw Object.assign(new Error('今日生成次数已达上限'), { status: 429 });
        let saved = false;
        for (let attempt = 0; attempt < 5; attempt++) {
          record.short_code = generateCode();
          record.id = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
          try {
            await connection.query(
              'INSERT INTO cards (id, short_code, name, title, department, phone, wechat, bio, avatar, status, created_at, updated_at, owner_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
              [
                record.id,
                record.short_code,
                record.name,
                record.title,
                record.department,
                record.phone,
                record.wechat,
                record.bio,
                record.avatar,
                record.status,
                record.created_at,
                record.updated_at,
                owner,
              ]
            );
            saved = true;
            break;
          } catch (error) {
            if (error.code !== 'ER_DUP_ENTRY') throw error;
          }
        }
        if (!saved) throw new Error('Could not allocate a unique card code');
        await connection.query(
          'UPDATE card_daily_usage SET used = used + 1 WHERE owner_key = ? AND day_key = ?',
          [owner, day]
        );
        await connection.commit();
        return { ...record, owner_key: owner };
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    },
    async updateCard(code, data) {
      await pool.query(
        'UPDATE cards SET name = ?, title = ?, department = ?, phone = ?, wechat = ?, bio = ?, avatar = ?, updated_at = ? WHERE short_code = ?',
        [
          data.name,
          data.title,
          data.department,
          data.phone,
          data.wechat,
          data.bio,
          data.avatar,
          Date.now(),
          code,
        ]
      );
      return getCard(code);
    },
    async setStatus(code, status) {
      const [result] = await pool.query(
        'UPDATE cards SET status = ?, updated_at = ? WHERE short_code = ?',
        [status, Date.now(), code]
      );
      return result.affectedRows > 0;
    },
    async deleteCard(code) {
      const [result] = await pool.query('DELETE FROM cards WHERE short_code = ?', [code]);
      return result.affectedRows > 0;
    },
    async setOwner(code, owner) {
      const [result] = await pool.query(
        'UPDATE cards SET owner_key = ?, updated_at = ? WHERE short_code = ?',
        [owner, Date.now(), code]
      );
      return result.affectedRows > 0;
    },
    async listCards({
      owner,
      keyword = '',
      status = 'all',
      limit = 50,
      offset = 0,
      includeAvatar = false,
    }) {
      const where = [],
        params = [];
      if (owner) {
        where.push('owner_key = ?');
        params.push(owner);
      }
      if (keyword) {
        const match = '%' + keyword.replace(/[=%_]/g, '=$&') + '%';
        where.push(
          "(name LIKE ? ESCAPE '=' OR phone LIKE ? ESCAPE '=' OR short_code LIKE ? ESCAPE '=' OR title LIKE ? ESCAPE '=' OR department LIKE ? ESCAPE '=')"
        );
        params.push(match, match, match, match, match);
      }
      const clause = where.length ? ' WHERE ' + where.join(' AND ') : '';
      const [totals] = await pool.query(
        "SELECT COUNT(*) AS total, COALESCE(SUM(status = 'active'), 0) AS active, COALESCE(SUM(status = 'disabled'), 0) AS disabled FROM cards" +
          clause,
        params
      );
      const counts = Object.fromEntries(
        Object.entries(totals[0]).map(([key, value]) => [key, Number(value)])
      );
      if (status !== 'all') {
        where.push('status = ?');
        params.push(status);
      }
      const filtered = where.length ? ' WHERE ' + where.join(' AND ') : '';
      const fields =
        'id, short_code, name, title, department, phone, wechat, bio, status, created_at, updated_at, owner_key' +
        (includeAvatar ? ', avatar' : '');
      const [rows] = await pool.query(
        `SELECT ${fields} FROM cards${filtered} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      );
      return { rows, counts, total: status === 'all' ? counts.total : counts[status] };
    },
  };
}
