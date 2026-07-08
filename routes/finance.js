'use strict';
const { ymd } = require('../lib/util');

function settingsObj(db) {
  const rows = db.prepare('SELECT key,value FROM settings').all();
  const o = {}; rows.forEach((r) => { o[r.key] = r.value; }); return o;
}

module.exports = function (api) {
  /* ===== Hóa đơn ===== */
  api.get('/api/invoices', (ctx) => {
    const { from, to } = ctx.query;
    let sql = `SELECT i.*, b.code AS booking_code, r.name AS room_name, c.name AS customer_name
               FROM invoices i
               LEFT JOIN bookings b ON b.id=i.booking_id
               LEFT JOIN rooms r ON r.id=b.room_id
               LEFT JOIN customers c ON c.id=i.customer_id WHERE 1=1`;
    const p = [];
    if (from) { sql += ' AND date(i.created_at)>=date(?)'; p.push(from); }
    if (to) { sql += ' AND date(i.created_at)<=date(?)'; p.push(to); }
    sql += ' ORDER BY i.id DESC LIMIT 300';
    ctx.ok({ invoices: ctx.db.prepare(sql).all(...p) });
  });

  // Chi tiết hóa đơn để in (K58/K80)
  api.get('/api/invoices/:id', (ctx) => {
    const inv = ctx.db.prepare('SELECT * FROM invoices WHERE id=?').get(Number(ctx.params.id));
    if (!inv) return ctx.fail(404, 'Không tìm thấy hóa đơn');
    const booking = inv.booking_id ? ctx.db.prepare(`
      SELECT b.*, r.name AS room_name, t.name AS type_name, c.name AS customer_name, c.phone AS customer_phone
      FROM bookings b JOIN rooms r ON r.id=b.room_id JOIN room_types t ON t.id=r.room_type_id
      LEFT JOIN customers c ON c.id=b.customer_id WHERE b.id=?`).get(inv.booking_id) : null;
    const items = inv.booking_id ? ctx.db.prepare('SELECT * FROM booking_items WHERE booking_id=? ORDER BY id').all(inv.booking_id) : [];
    const cashier = ctx.db.prepare('SELECT full_name FROM users WHERE id=?').get(inv.created_by);
    ctx.ok({ invoice: inv, booking, items, settings: settingsObj(ctx.db), cashier: cashier ? cashier.full_name : '' });
  });

  /* ===== Sổ thu chi ===== */
  api.get('/api/cashflow', (ctx) => {
    const { from, to, type } = ctx.query;
    let sql = `SELECT cf.*, u.full_name AS user_name FROM cashflow cf LEFT JOIN users u ON u.id=cf.created_by WHERE 1=1`;
    const p = [];
    if (from) { sql += ' AND date(cf.created_at)>=date(?)'; p.push(from); }
    if (to) { sql += ' AND date(cf.created_at)<=date(?)'; p.push(to); }
    if (type) { sql += ' AND cf.type=?'; p.push(type); }
    sql += ' ORDER BY cf.id DESC LIMIT 500';
    const rows = ctx.db.prepare(sql).all(...p);
    const income = rows.filter((r) => r.type === 'income').reduce((s, r) => s + r.amount, 0);
    const expense = rows.filter((r) => r.type === 'expense').reduce((s, r) => s + r.amount, 0);
    ctx.ok({ entries: rows, summary: { income, expense, net: income - expense } });
  });

  // Ghi phiếu thu / chi thủ công
  api.post('/api/cashflow', ['owner', 'receptionist'], (ctx) => {
    const b = ctx.body;
    if (!['income', 'expense'].includes(b.type)) return ctx.fail(400, 'Loại phiếu không hợp lệ');
    const amount = Number(b.amount);
    if (!amount || amount <= 0) return ctx.fail(400, 'Số tiền không hợp lệ');
    // Nhân viên lễ tân không được ghi chi phí lớn tùy ý? -> cho phép, có log
    const r = ctx.db.prepare(`INSERT INTO cashflow(type,category,amount,method,note,ref_type,created_by)
      VALUES (?,?,?,?,?, 'manual', ?)`).run(b.type, b.category || (b.type === 'income' ? 'Thu khác' : 'Chi khác'),
      amount, b.method || 'cash', b.note || '', ctx.user.id);
    ctx.logAudit(ctx.user, b.type, 'cashflow', r.lastInsertRowid, `${b.type === 'income' ? 'Thu' : 'Chi'} ${amount} - ${b.note || ''}`);
    ctx.ok({ id: r.lastInsertRowid });
  });

  // Sửa phiếu thu / chi (Chủ)
  api.put('/api/cashflow/:id', ['owner'], (ctx) => {
    const id = Number(ctx.params.id);
    const e = ctx.db.prepare('SELECT * FROM cashflow WHERE id=?').get(id);
    if (!e) return ctx.fail(404, 'Không tìm thấy phiếu');
    const b = ctx.body;
    const amount = b.amount !== undefined ? Number(b.amount) : e.amount;
    if (!amount || amount <= 0) return ctx.fail(400, 'Số tiền không hợp lệ');
    ctx.db.prepare('UPDATE cashflow SET category=?, amount=?, method=?, note=? WHERE id=?')
      .run(b.category ?? e.category, amount, b.method ?? e.method, b.note ?? e.note, id);
    ctx.logAudit(ctx.user, 'update', 'cashflow', id, `Sửa phiếu ${e.type} -> ${amount}`);
    ctx.ok();
  });

  // Xoá phiếu thu / chi (Chủ)
  api.del('/api/cashflow/:id', ['owner'], (ctx) => {
    const id = Number(ctx.params.id);
    const e = ctx.db.prepare('SELECT * FROM cashflow WHERE id=?').get(id);
    if (!e) return ctx.fail(404, 'Không tìm thấy phiếu');
    ctx.db.prepare('DELETE FROM cashflow WHERE id=?').run(id);
    ctx.logAudit(ctx.user, 'delete', 'cashflow', id, `Xoá phiếu ${e.type} ${e.amount} - ${e.note || ''}`);
    ctx.ok();
  });

  /* ===== Dashboard tổng quan ===== */
  api.get('/api/reports/dashboard', (ctx) => {
    const db = ctx.db;
    const today = ymd(new Date());
    const roomStats = db.prepare(`SELECT status, COUNT(*) c FROM rooms GROUP BY status`).all();
    const stat = { available: 0, occupied: 0, cleaning: 0, maintenance: 0 };
    roomStats.forEach((r) => { stat[r.status] = r.c; });
    const total = db.prepare('SELECT COUNT(*) c FROM rooms').get().c;

    const todayIncome = db.prepare(`SELECT COALESCE(SUM(amount),0) s FROM cashflow WHERE type='income' AND date(created_at)=date(?)`).get(today).s;
    const todayExpense = db.prepare(`SELECT COALESCE(SUM(amount),0) s FROM cashflow WHERE type='expense' AND date(created_at)=date(?)`).get(today).s;
    const checkinsToday = db.prepare(`SELECT COUNT(*) c FROM bookings WHERE date(check_in)=date(?)`).get(today).c;
    const checkoutsToday = db.prepare(`SELECT COUNT(*) c FROM bookings WHERE date(check_out)=date(?)`).get(today).c;
    const inHouse = db.prepare(`SELECT COUNT(*) c FROM bookings WHERE status='active'`).get().c;
    const lowStock = db.prepare(`SELECT id,name,stock FROM products WHERE track_stock=1 AND stock<=5 AND active=1 ORDER BY stock`).all();
    const dirtyRooms = db.prepare(`SELECT COUNT(DISTINCT room_id) c FROM housekeeping WHERE status IN ('dirty','cleaning')`).get().c;

    ctx.ok({
      dashboard: {
        rooms: { total, ...stat, occupancy_pct: total ? Math.round((stat.occupied / total) * 100) : 0 },
        today: { income: todayIncome, expense: todayExpense, net: todayIncome - todayExpense, checkins: checkinsToday, checkouts: checkoutsToday },
        in_house: inHouse, low_stock: lowStock, dirty_rooms: dirtyRooms, date: today
      }
    });
  });

  /* ===== Báo cáo doanh thu ===== */
  api.get('/api/reports/revenue', ['owner', 'receptionist'], (ctx) => {
    const from = ctx.query.from || ymd(new Date());
    const to = ctx.query.to || ymd(new Date());
    const byDay = ctx.db.prepare(`
      SELECT date(created_at) d,
             SUM(CASE WHEN type='income' THEN amount ELSE 0 END) income,
             SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) expense
      FROM cashflow WHERE date(created_at) BETWEEN date(?) AND date(?)
      GROUP BY date(created_at) ORDER BY d`).all(from, to);
    const byCategory = ctx.db.prepare(`
      SELECT type, category, SUM(amount) amount, COUNT(*) cnt
      FROM cashflow WHERE date(created_at) BETWEEN date(?) AND date(?)
      GROUP BY type, category ORDER BY amount DESC`).all(from, to);
    const roomRevenue = ctx.db.prepare(`
      SELECT COALESCE(SUM(room_charge),0) room, COALESCE(SUM(service_charge),0) service, COALESCE(SUM(total),0) total, COUNT(*) invoices
      FROM invoices WHERE date(created_at) BETWEEN date(?) AND date(?)`).get(from, to);
    const totalIncome = byDay.reduce((s, r) => s + r.income, 0);
    const totalExpense = byDay.reduce((s, r) => s + r.expense, 0);
    ctx.ok({ from, to, by_day: byDay, by_category: byCategory, room_revenue: roomRevenue,
      summary: { income: totalIncome, expense: totalExpense, net: totalIncome - totalExpense } });
  });

  /* ===== Báo cáo công suất phòng ===== */
  api.get('/api/reports/occupancy', ['owner', 'receptionist'], (ctx) => {
    const from = ctx.query.from || ymd(new Date());
    const to = ctx.query.to || ymd(new Date());
    const totalRooms = ctx.db.prepare('SELECT COUNT(*) c FROM rooms').get().c;
    // Lấy các phiếu có giao với khoảng thời gian
    const bookings = ctx.db.prepare(`
      SELECT room_id, check_in, COALESCE(check_out, datetime('now','localtime')) co
      FROM bookings WHERE status IN ('active','checkedout')`).all();
    const days = [];
    const d1 = new Date(from + 'T00:00:00');
    const d2 = new Date(to + 'T00:00:00');
    for (let d = new Date(d1); d <= d2; d.setDate(d.getDate() + 1)) {
      const key = ymd(d);
      const occupiedRooms = new Set();
      for (const b of bookings) {
        const ci = ymd(b.check_in);
        const co = ymd(b.co);
        if (ci <= key && key <= co) occupiedRooms.add(b.room_id);
      }
      days.push({ date: key, occupied: occupiedRooms.size, total: totalRooms,
        pct: totalRooms ? Math.round((occupiedRooms.size / totalRooms) * 100) : 0 });
    }
    const avg = days.length ? Math.round(days.reduce((s, r) => s + r.pct, 0) / days.length) : 0;
    ctx.ok({ from, to, total_rooms: totalRooms, days, avg_pct: avg });
  });
};
