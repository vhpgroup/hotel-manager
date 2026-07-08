'use strict';

function roomWithBooking(db, room) {
  const booking = db.prepare(`
    SELECT b.*, c.name AS customer_name, c.phone AS customer_phone
    FROM bookings b LEFT JOIN customers c ON c.id=b.customer_id
    WHERE b.room_id=? AND b.status='active' ORDER BY b.id DESC LIMIT 1`).get(room.id);
  return { ...room, booking: booking || null };
}

module.exports = function (api) {
  // Danh sách phòng + hạng + trạng thái + booking hiện tại (sơ đồ phòng)
  api.get('/api/rooms', (ctx) => {
    const rooms = ctx.db.prepare(`
      SELECT r.*, t.name AS type_name, t.hourly_first, t.hourly_next, t.overnight_rate,
             t.daily_rate, t.weekend_rate, t.holiday_rate
      FROM rooms r JOIN room_types t ON t.id=r.room_type_id
      ORDER BY r.floor, r.name`).all();
    ctx.ok({ rooms: rooms.map((r) => roomWithBooking(ctx.db, r)) });
  });

  // Cập nhật trạng thái phòng thủ công (vd: bảo trì)
  api.put('/api/rooms/:id/status', ['owner', 'receptionist'], (ctx) => {
    const id = Number(ctx.params.id);
    const { status } = ctx.body;
    if (!['available', 'occupied', 'cleaning', 'maintenance'].includes(status)) return ctx.fail(400, 'Trạng thái không hợp lệ');
    const room = ctx.db.prepare('SELECT * FROM rooms WHERE id=?').get(id);
    if (!room) return ctx.fail(404, 'Không tìm thấy phòng');
    ctx.db.prepare('UPDATE rooms SET status=? WHERE id=?').run(status, id);
    ctx.logAudit(ctx.user, 'update', 'room', id, `Đổi trạng thái phòng ${room.name} -> ${status}`);
    ctx.ok();
  });

  // Thêm / sửa phòng (Chủ)
  api.post('/api/rooms', ['owner'], (ctx) => {
    const { name, floor, room_type_id } = ctx.body;
    if (!name || !room_type_id) return ctx.fail(400, 'Thiếu thông tin phòng');
    const r = ctx.db.prepare('INSERT INTO rooms(name,floor,room_type_id) VALUES (?,?,?)')
      .run(String(name), Number(floor) || 1, Number(room_type_id));
    ctx.logAudit(ctx.user, 'create', 'room', r.lastInsertRowid, `Thêm phòng ${name}`);
    ctx.ok({ id: r.lastInsertRowid });
  });

  api.put('/api/rooms/:id', ['owner'], (ctx) => {
    const id = Number(ctx.params.id);
    const room = ctx.db.prepare('SELECT * FROM rooms WHERE id=?').get(id);
    if (!room) return ctx.fail(404, 'Không tìm thấy phòng');
    const { name, floor, room_type_id, note } = ctx.body;
    ctx.db.prepare('UPDATE rooms SET name=?, floor=?, room_type_id=?, note=? WHERE id=?')
      .run(name ?? room.name, floor ?? room.floor, room_type_id ?? room.room_type_id, note ?? room.note, id);
    ctx.logAudit(ctx.user, 'update', 'room', id, `Sửa phòng ${room.name}`);
    ctx.ok();
  });

  // Xoá phòng
  api.del('/api/rooms/:id', ['owner'], (ctx) => {
    const id = Number(ctx.params.id);
    const room = ctx.db.prepare('SELECT * FROM rooms WHERE id=?').get(id);
    if (!room) return ctx.fail(404, 'Không tìm thấy phòng');
    if (room.status === 'occupied') return ctx.fail(400, 'Phòng đang có khách, không thể xoá');
    const used = ctx.db.prepare('SELECT COUNT(*) c FROM bookings WHERE room_id=?').get(id).c;
    if (used > 0) return ctx.fail(400, 'Phòng đã có lịch sử thuê nên không thể xoá. Hãy chuyển trạng thái Bảo trì nếu muốn ngưng dùng.');
    ctx.db.prepare('DELETE FROM housekeeping WHERE room_id=?').run(id);
    ctx.db.prepare('DELETE FROM rooms WHERE id=?').run(id);
    ctx.logAudit(ctx.user, 'delete', 'room', id, `Xoá phòng ${room.name}`);
    ctx.ok();
  });

  /* ===== Hạng phòng & bảng giá ===== */
  api.get('/api/room-types', (ctx) => {
    ctx.ok({ room_types: ctx.db.prepare('SELECT * FROM room_types ORDER BY id').all() });
  });

  api.post('/api/room-types', ['owner'], (ctx) => {
    const b = ctx.body;
    if (!b.name) return ctx.fail(400, 'Thiếu tên hạng phòng');
    const r = ctx.db.prepare(`INSERT INTO room_types(name,hourly_first,hourly_next,overnight_rate,daily_rate,weekend_rate,holiday_rate)
      VALUES (?,?,?,?,?,?,?)`).run(b.name, +b.hourly_first || 0, +b.hourly_next || 0, +b.overnight_rate || 0,
      +b.daily_rate || 0, +b.weekend_rate || 0, +b.holiday_rate || 0);
    ctx.logAudit(ctx.user, 'create', 'room_type', r.lastInsertRowid, `Thêm hạng phòng ${b.name}`);
    ctx.ok({ id: r.lastInsertRowid });
  });

  api.put('/api/room-types/:id', ['owner'], (ctx) => {
    const id = Number(ctx.params.id);
    const t = ctx.db.prepare('SELECT * FROM room_types WHERE id=?').get(id);
    if (!t) return ctx.fail(404, 'Không tìm thấy hạng phòng');
    const b = ctx.body;
    ctx.db.prepare(`UPDATE room_types SET name=?,hourly_first=?,hourly_next=?,overnight_rate=?,daily_rate=?,weekend_rate=?,holiday_rate=? WHERE id=?`)
      .run(b.name ?? t.name, num(b.hourly_first, t.hourly_first), num(b.hourly_next, t.hourly_next),
        num(b.overnight_rate, t.overnight_rate), num(b.daily_rate, t.daily_rate),
        num(b.weekend_rate, t.weekend_rate), num(b.holiday_rate, t.holiday_rate), id);
    ctx.logAudit(ctx.user, 'update', 'room_type', id, `Cập nhật bảng giá hạng ${t.name}`);
    ctx.ok();
  });

  // Xoá hạng phòng (chặn khi còn phòng dùng)
  api.del('/api/room-types/:id', ['owner'], (ctx) => {
    const id = Number(ctx.params.id);
    const t = ctx.db.prepare('SELECT * FROM room_types WHERE id=?').get(id);
    if (!t) return ctx.fail(404, 'Không tìm thấy hạng phòng');
    const cnt = ctx.db.prepare('SELECT COUNT(*) c FROM rooms WHERE room_type_id=?').get(id).c;
    if (cnt > 0) return ctx.fail(400, `Còn ${cnt} phòng thuộc hạng này nên không thể xoá`);
    ctx.db.prepare('DELETE FROM room_types WHERE id=?').run(id);
    ctx.logAudit(ctx.user, 'delete', 'room_type', id, `Xoá hạng phòng ${t.name}`);
    ctx.ok();
  });

  /* ===== Ngày lễ ===== */
  api.get('/api/holidays', (ctx) => {
    ctx.ok({ holidays: ctx.db.prepare('SELECT * FROM holidays ORDER BY date').all() });
  });
  api.post('/api/holidays', ['owner'], (ctx) => {
    const { date, name } = ctx.body;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return ctx.fail(400, 'Ngày không hợp lệ (YYYY-MM-DD)');
    try {
      const r = ctx.db.prepare('INSERT INTO holidays(date,name) VALUES (?,?)').run(date, name || 'Ngày lễ');
      ctx.logAudit(ctx.user, 'create', 'holiday', r.lastInsertRowid, `Thêm ngày lễ ${date}`);
      ctx.ok({ id: r.lastInsertRowid });
    } catch { ctx.fail(400, 'Ngày lễ đã tồn tại'); }
  });
  api.put('/api/holidays/:id', ['owner'], (ctx) => {
    const id = Number(ctx.params.id);
    const hd = ctx.db.prepare('SELECT * FROM holidays WHERE id=?').get(id);
    if (!hd) return ctx.fail(404, 'Không tìm thấy ngày lễ');
    const { date, name } = ctx.body;
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return ctx.fail(400, 'Ngày không hợp lệ (YYYY-MM-DD)');
    try {
      ctx.db.prepare('UPDATE holidays SET date=?, name=? WHERE id=?').run(date || hd.date, name ?? hd.name, id);
    } catch { return ctx.fail(400, 'Ngày lễ đã tồn tại'); }
    ctx.logAudit(ctx.user, 'update', 'holiday', id, `Sửa ngày lễ ${date || hd.date}`);
    ctx.ok();
  });
  api.del('/api/holidays/:id', ['owner'], (ctx) => {
    const hd = ctx.db.prepare('SELECT * FROM holidays WHERE id=?').get(Number(ctx.params.id));
    ctx.db.prepare('DELETE FROM holidays WHERE id=?').run(Number(ctx.params.id));
    ctx.logAudit(ctx.user, 'delete', 'holiday', Number(ctx.params.id), `Xoá ngày lễ ${hd ? hd.date : ''}`);
    ctx.ok();
  });

  /* ===== Cấu hình khách sạn ===== */
  api.get('/api/settings', (ctx) => {
    const rows = ctx.db.prepare('SELECT key,value FROM settings').all();
    const obj = {}; rows.forEach((r) => { obj[r.key] = r.value; });
    ctx.ok({ settings: obj });
  });
  api.put('/api/settings', ['owner'], (ctx) => {
    const up = ctx.db.prepare('INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
    for (const [k, v] of Object.entries(ctx.body || {})) up.run(k, String(v));
    ctx.logAudit(ctx.user, 'update', 'settings', null, 'Cập nhật cấu hình khách sạn');
    ctx.ok();
  });
};

function num(v, def) { return (v === undefined || v === null || v === '') ? def : Number(v); }
