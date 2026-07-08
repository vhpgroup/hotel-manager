'use strict';
const fs = require('node:fs');
const { DB_PATH } = require('../db');

const BACKUP_TABLES = ['users', 'room_types', 'rooms', 'holidays', 'customers', 'groups',
  'bookings', 'products', 'booking_items', 'stock_moves', 'invoices', 'cashflow',
  'housekeeping', 'audit_log', 'settings'];

module.exports = function (api) {
  /* ===== Nhật ký giao dịch ===== */
  api.get('/api/audit', ['owner'], (ctx) => {
    const { from, to, action, q } = ctx.query;
    let sql = 'SELECT * FROM audit_log WHERE 1=1';
    const p = [];
    if (from) { sql += ' AND date(created_at)>=date(?)'; p.push(from); }
    if (to) { sql += ' AND date(created_at)<=date(?)'; p.push(to); }
    if (action) { sql += ' AND action=?'; p.push(action); }
    if (q) { sql += ' AND (details LIKE ? OR username LIKE ?)'; p.push(`%${q}%`, `%${q}%`); }
    sql += ' ORDER BY id DESC LIMIT 500';
    ctx.ok({ logs: ctx.db.prepare(sql).all(...p) });
  });

  /* ===== Sao lưu dữ liệu dạng JSON ===== */
  api.get('/api/backup.json', ['owner'], (ctx) => {
    const dump = { exported_at: new Date().toISOString(), version: 1, tables: {} };
    for (const t of BACKUP_TABLES) {
      if (t === 'users') {
        // Không xuất mật khẩu ra file sao lưu tải về
        dump.tables[t] = ctx.db.prepare('SELECT id,username,full_name,role,active,created_at FROM users').all();
      } else {
        dump.tables[t] = ctx.db.prepare(`SELECT * FROM ${t}`).all();
      }
    }
    const body = JSON.stringify(dump, null, 2);
    ctx.res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="backup-${ctx.query.d || Date.now()}.json"`
    });
    ctx.res.end(body);
    ctx.logAudit(ctx.user, 'backup', 'system', null, 'Tải sao lưu JSON');
  });

  /* ===== Tải nguyên file cơ sở dữ liệu SQLite ===== */
  api.get('/api/backup/db', ['owner'], (ctx) => {
    try {
      ctx.db.exec('PRAGMA wal_checkpoint(TRUNCATE);'); // gộp WAL vào file chính
    } catch (e) { /* bỏ qua */ }
    const data = fs.readFileSync(DB_PATH);
    ctx.res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="hotel-backup.db"`
    });
    ctx.res.end(data);
    ctx.logAudit(ctx.user, 'backup', 'system', null, 'Tải file DB');
  });

  /* ===== Thống kê nhanh cho footer sao lưu ===== */
  api.get('/api/backup/info', ['owner'], (ctx) => {
    const counts = {};
    for (const t of BACKUP_TABLES) counts[t] = ctx.db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c;
    let size = 0;
    try { size = fs.statSync(DB_PATH).size; } catch {}
    ctx.ok({ counts, db_size: size });
  });
};
