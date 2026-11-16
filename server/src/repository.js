import crypto from 'node:crypto';

export function createRepository(pool) {
  const getCard = async (code) => {
    const [rows] = await pool.query('SELECT * FROM cards WHERE short_code = ? LIMIT 1', [code]);
    return rows[0] || null;
  };
  return {
    getCard,
    async quota(userId, day) {
      const [rows] = await pool.query(
        'SELECT used FROM card_daily_usage WHERE user_id = ? AND day_key = ?',
        [userId, day]
      );
      return Number(rows[0]?.used || 0);
    },
    async createCard(record, { userId, day, limit, generateCode }) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        await connection.query(
          'INSERT INTO card_daily_usage (user_id, day_key, used) VALUES (?, ?, 0) ON DUPLICATE KEY UPDATE used = used',
          [userId, day]
        );
        const [usage] = await connection.query(
          'SELECT used FROM card_daily_usage WHERE user_id = ? AND day_key = ? FOR UPDATE',
          [userId, day]
        );
        if (Number(usage[0].used) >= limit)
          throw Object.assign(new Error('今日生成次数已达上限'), { status: 429 });
        let saved = false;
        for (let attempt = 0; attempt < 5; attempt++) {
          record.short_code = generateCode();
          record.id = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
          try {
            await connection.query(
              'INSERT INTO cards (id, short_code, name, title, department, phone, wechat, bio, avatar, status, created_at, updated_at, owner_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
                userId,
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
          'UPDATE card_daily_usage SET used = used + 1 WHERE user_id = ? AND day_key = ?',
          [userId, day]
        );
        await connection.commit();
        return { ...record, owner_user_id: userId };
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
    async setOwner(code, userId) {
      const [result] = await pool.query(
        'UPDATE cards SET owner_user_id = ?, updated_at = ? WHERE short_code = ?',
        [userId, Date.now(), code]
      );
      return result.affectedRows > 0;
    },
    async listCards({
      userId,
      keyword = '',
      status = 'all',
      limit = 50,
      offset = 0,
      includeAvatar = false,
    }) {
      const where = [],
        params = [];
      if (userId) {
        where.push('c.owner_user_id = ?');
        params.push(userId);
      }
      if (keyword) {
        const match = '%' + keyword.replace(/[=%_]/g, '=$&') + '%';
        where.push(
          "(c.name LIKE ? ESCAPE '=' OR c.phone LIKE ? ESCAPE '=' OR c.short_code LIKE ? ESCAPE '=' OR c.title LIKE ? ESCAPE '=' OR c.department LIKE ? ESCAPE '=')"
        );
        params.push(match, match, match, match, match);
      }
      const clause = where.length ? ' WHERE ' + where.join(' AND ') : '';
      const [totals] = await pool.query(
        "SELECT COUNT(*) AS total, COALESCE(SUM(c.status = 'active'), 0) AS active, COALESCE(SUM(c.status = 'disabled'), 0) AS disabled FROM cards c" +
          clause,
        params
      );
      const counts = Object.fromEntries(
        Object.entries(totals[0]).map(([key, value]) => [key, Number(value)])
      );
      if (status !== 'all') {
        where.push('c.status = ?');
        params.push(status);
      }
      const filtered = where.length ? ' WHERE ' + where.join(' AND ') : '';
      const fields =
        'c.id, c.short_code, c.name, c.title, c.department, c.phone, c.wechat, c.bio, c.status, c.created_at, c.updated_at, c.owner_user_id, u.name AS owner_name' +
        (includeAvatar ? ', c.avatar' : '');
      const [rows] = await pool.query(
        `SELECT ${fields} FROM cards c LEFT JOIN users u ON u.id = c.owner_user_id${filtered} ORDER BY c.created_at DESC, c.id DESC LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      );
      return { rows, counts, total: status === 'all' ? counts.total : counts[status] };
    },
  };
}
