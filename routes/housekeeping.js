'use strict';

module.exports = function (api) {
  // Danh sách công việc dọn phòng (mới nhất theo từng phòng cần xử lý)
  api.get('/api/housekeeping', (ctx) => {
    const rows = ctx.db.prepare(`
      SELECT h.*, r.name AS room_name, r.status AS room_status, u.full_name AS assignee_name
      FROM housekeeping h
      JOIN rooms r ON r.id=h.room_id
      LEFT JOIN users u ON u.id=h.assigned_to
      WHERE h.status IN ('dirty','cleaning')
      ORDER BY h.updated_at DESC`).all();
    // Kèm danh sách phòng đang ở trạng thái cleaning nhưng chưa có phiếu mở
    ctx.ok({ tasks: rows });
  });

  // Cập nhật trạng thái dọn: dirty -> cleaning -> clean
  api.put('/api/housekeeping/:id', ['owner', 'receptionist', 'staff'], (ctx) => {
    const id = Number(ctx.params.id);
    const hk = ctx.db.prepare('SELECT * FROM housekeeping WHERE id=?').get(id);
    if (!hk) return ctx.fail(404, 'Không tìm thấy công việc');
    const { status, assigned_to, note } = ctx.body;
    if (status && !['dirty', 'cleaning', 'clean'].includes(status)) return ctx.fail(400, 'Trạng thái không hợp lệ');
    ctx.db.prepare("UPDATE housekeeping SET status=?, assigned_to=?, note=?, updated_at=datetime('now','localtime') WHERE id=?")
      .run(status || hk.status, assigned_to ? Number(assigned_to) : hk.assigned_to, note ?? hk.note, id);

    // Khi dọn xong -> phòng sẵn sàng
    if (status === 'clean') {
      const room = ctx.db.prepare('SELECT * FROM rooms WHERE id=?').get(hk.room_id);
      if (room && room.status === 'cleaning') {
        ctx.db.prepare("UPDATE rooms SET status='available' WHERE id=?").run(hk.room_id);
      }
    }
    ctx.logAudit(ctx.user, 'housekeeping', 'room', hk.room_id, `Dọn phòng -> ${status || hk.status}`);
    ctx.ok();
  });

  // Tạo yêu cầu dọn phòng thủ công
  api.post('/api/housekeeping', ['owner', 'receptionist'], (ctx) => {
    const roomId = Number(ctx.body.room_id);
    const room = ctx.db.prepare('SELECT * FROM rooms WHERE id=?').get(roomId);
    if (!room) return ctx.fail(404, 'Không tìm thấy phòng');
    const r = ctx.db.prepare('INSERT INTO housekeeping(room_id,status,note,created_by) VALUES (?,?,?,?)')
      .run(roomId, 'dirty', ctx.body.note || 'Yêu cầu dọn phòng', ctx.user.id);
    if (room.status === 'available') ctx.db.prepare("UPDATE rooms SET status='cleaning' WHERE id=?").run(roomId);
    ctx.logAudit(ctx.user, 'create', 'housekeeping', r.lastInsertRowid, `Tạo yêu cầu dọn phòng ${room.name}`);
    ctx.ok({ id: r.lastInsertRowid });
  });
};
