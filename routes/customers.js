'use strict';

module.exports = function (api) {
  // Danh sách + tìm kiếm khách hàng
  api.get('/api/customers', (ctx) => {
    const { q } = ctx.query;
    let sql = `SELECT c.*, (SELECT COUNT(*) FROM bookings b WHERE b.customer_id=c.id) AS visits
               FROM customers c`;
    const p = [];
    if (q) { sql += ' WHERE c.name LIKE ? OR c.phone LIKE ? OR c.id_card LIKE ?'; p.push(`%${q}%`, `%${q}%`, `%${q}%`); }
    sql += ' ORDER BY c.id DESC LIMIT 500';
    ctx.ok({ customers: ctx.db.prepare(sql).all(...p) });
  });

  api.post('/api/customers', ['owner', 'receptionist'], (ctx) => {
    const { name, phone, id_card, address, note } = ctx.body;
    if (!name) return ctx.fail(400, 'Thiếu tên khách hàng');
    const r = ctx.db.prepare('INSERT INTO customers(name,phone,id_card,address,note) VALUES (?,?,?,?,?)')
      .run(name.trim(), phone || '', id_card || '', address || '', note || '');
    ctx.logAudit(ctx.user, 'create', 'customer', r.lastInsertRowid, `Thêm khách hàng ${name}`);
    ctx.ok({ id: r.lastInsertRowid });
  });

  api.put('/api/customers/:id', ['owner', 'receptionist'], (ctx) => {
    const id = Number(ctx.params.id);
    const c = ctx.db.prepare('SELECT * FROM customers WHERE id=?').get(id);
    if (!c) return ctx.fail(404, 'Không tìm thấy khách hàng');
    const b = ctx.body;
    ctx.db.prepare('UPDATE customers SET name=?,phone=?,id_card=?,address=?,note=? WHERE id=?')
      .run(b.name ?? c.name, b.phone ?? c.phone, b.id_card ?? c.id_card, b.address ?? c.address, b.note ?? c.note, id);
    ctx.logAudit(ctx.user, 'update', 'customer', id, `Cập nhật khách hàng ${c.name}`);
    ctx.ok();
  });

  api.del('/api/customers/:id', ['owner'], (ctx) => {
    const id = Number(ctx.params.id);
    const used = ctx.db.prepare('SELECT COUNT(*) c FROM bookings WHERE customer_id=?').get(id).c;
    if (used > 0) return ctx.fail(400, 'Khách đã có lịch sử thuê, không thể xóa');
    ctx.db.prepare('DELETE FROM customers WHERE id=?').run(id);
    ctx.logAudit(ctx.user, 'delete', 'customer', id, 'Xóa khách hàng');
    ctx.ok();
  });

  /* ===== Khách đoàn ===== */
  api.get('/api/groups', (ctx) => {
    const rows = ctx.db.prepare(`
      SELECT g.*, c.name AS leader_name,
             (SELECT COUNT(*) FROM bookings b WHERE b.group_id=g.id) AS room_count
      FROM groups g LEFT JOIN customers c ON c.id=g.leader_customer_id
      ORDER BY g.id DESC`).all();
    ctx.ok({ groups: rows });
  });

  api.post('/api/groups', ['owner', 'receptionist'], (ctx) => {
    const { name, leader_customer_id, note } = ctx.body;
    if (!name) return ctx.fail(400, 'Thiếu tên đoàn');
    const r = ctx.db.prepare('INSERT INTO groups(name,leader_customer_id,note) VALUES (?,?,?)')
      .run(name.trim(), leader_customer_id ? Number(leader_customer_id) : null, note || '');
    ctx.logAudit(ctx.user, 'create', 'group', r.lastInsertRowid, `Tạo đoàn khách ${name}`);
    ctx.ok({ id: r.lastInsertRowid });
  });

  // Chi tiết đoàn: các phòng thuộc đoàn
  api.get('/api/groups/:id', (ctx) => {
    const id = Number(ctx.params.id);
    const group = ctx.db.prepare('SELECT * FROM groups WHERE id=?').get(id);
    if (!group) return ctx.fail(404, 'Không tìm thấy đoàn');
    const bookings = ctx.db.prepare(`
      SELECT b.*, r.name AS room_name FROM bookings b JOIN rooms r ON r.id=b.room_id
      WHERE b.group_id=? ORDER BY b.id DESC`).all(id);
    ctx.ok({ group, bookings });
  });

  // Sửa đoàn
  api.put('/api/groups/:id', ['owner', 'receptionist'], (ctx) => {
    const id = Number(ctx.params.id);
    const g = ctx.db.prepare('SELECT * FROM groups WHERE id=?').get(id);
    if (!g) return ctx.fail(404, 'Không tìm thấy đoàn');
    const { name, leader_customer_id, note } = ctx.body;
    ctx.db.prepare('UPDATE groups SET name=?, leader_customer_id=?, note=? WHERE id=?')
      .run(name ?? g.name, leader_customer_id ? Number(leader_customer_id) : g.leader_customer_id, note ?? g.note, id);
    ctx.logAudit(ctx.user, 'update', 'group', id, `Sửa đoàn ${g.name}`);
    ctx.ok();
  });

  // Xoá đoàn (chặn khi đã có phòng gắn vào)
  api.del('/api/groups/:id', ['owner', 'receptionist'], (ctx) => {
    const id = Number(ctx.params.id);
    const g = ctx.db.prepare('SELECT * FROM groups WHERE id=?').get(id);
    if (!g) return ctx.fail(404, 'Không tìm thấy đoàn');
    const used = ctx.db.prepare('SELECT COUNT(*) c FROM bookings WHERE group_id=?').get(id).c;
    if (used > 0) return ctx.fail(400, 'Đoàn đã có phòng gắn vào nên không thể xoá');
    ctx.db.prepare('DELETE FROM groups WHERE id=?').run(id);
    ctx.logAudit(ctx.user, 'delete', 'group', id, `Xoá đoàn ${g.name}`);
    ctx.ok();
  });
};
