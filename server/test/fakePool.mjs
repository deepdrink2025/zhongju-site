/**
 * 内存假库：模拟本项目用到的 SQL（供冒烟测试与本地联调使用，不连 MySQL）
 */
export function fakePool() {
  const rows = [];
  return {
    rows,
    async query(sql, params = []) {
      const s = sql.replace(/\s+/g, ' ').trim();
      if (s.startsWith('SELECT 1 FROM cards WHERE short_code')) {
        return [rows.filter((r) => r.short_code === params[0]).slice(0, 1)];
      }
      if (s.startsWith('INSERT INTO cards')) {
        const [
          id,
          short_code,
          name,
          title,
          department,
          phone,
          wechat,
          bio,
          avatar,
          status,
          created_at,
          updated_at,
        ] = params;
        rows.push({
          id,
          short_code,
          name,
          title,
          department,
          phone,
          wechat,
          bio,
          avatar,
          status,
          created_at,
          updated_at,
        });
        return [{ affectedRows: 1 }];
      }
      if (s.startsWith('SELECT * FROM cards WHERE short_code')) {
        return [rows.filter((r) => r.short_code === params[0])];
      }
      if (s.startsWith('UPDATE cards SET status')) {
        const [status, updated_at, code] = params;
        let n = 0;
        for (const r of rows) {
          if (r.short_code === code) {
            r.status = status;
            r.updated_at = updated_at;
            n++;
          }
        }
        return [{ affectedRows: n }];
      }
      if (s.startsWith('DELETE FROM cards WHERE short_code')) {
        const i = rows.findIndex((r) => r.short_code === params[0]);
        if (i >= 0) {
          rows.splice(i, 1);
          return [{ affectedRows: 1 }];
        }
        return [{ affectedRows: 0 }];
      }
      if (s.startsWith('SELECT id, short_code')) {
        const limit = Number(params[0] || 100);
        return [[...rows].sort((a, b) => b.created_at - a.created_at).slice(0, limit)];
      }
      return [[]];
    },
  };
}
