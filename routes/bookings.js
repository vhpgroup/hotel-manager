'use strict';
const { genCode, calcRoomCharge, nowLocal } = require('../lib/util');

function holidaysSet(db) {
  return new Set(db.prepare('SELECT date FROM holidays').all().map((r) => r.date));
}
function priceCfgOfRoom(db, roomId) {
  return db.prepare(`SELECT t.hourly_first,t.hourly_next,t.overnight_rate,t.daily_rate,t.weekend_rate,t.holiday_rate
    FROM rooms r JOIN room_types t ON t.id=r.room_type_id WHERE r.id=?`).get(roomId);
}
function serviceTotal(db, bookingId) {
  return db.prepare('SELECT COALESCE(SUM(amount),0) s FROM booking_items WHERE booking_id=?').get(bookingId).s;
}

// Tính tiền phòng tại thời điểm hiện tại (hoặc thời điểm trả)
function computeCharge(db, booking, until) {
  const cfg = priceCfgOfRoom(db, booking.room_id);
  const end = until || booking.check_out || nowLocal();
  const rc = calcRoomCharge(booking.type, booking.check_in, end, cfg, holidaysSet(db));
  const svc = serviceTotal(db, booking.id);
  return { room: rc, service_charge: svc };
}

function loadBooking(db, id) {
  return db.prepare(`
    SELECT b.*, r.name AS room_name, r.status AS room_status, t.name AS type_name,
           c.name AS customer_name, c.phone AS customer_phone,
           g.name AS group_name
    FROM bookings b
    JOIN rooms r ON r.id=b.room_id
    JOIN room_types t ON t.id=r.room_type_id
    LEFT JOIN customers c ON c.id=b.customer_id
    LEFT JOIN groups g ON g.id=b.group_id
    WHERE b.id=?`).get(id);
}

module.exports = function (api) {
  // NHẬN PHÒNG (check-in) / đặt phòng
  api.post('/api/bookings', ['owner', 'receptionist'], (ctx) => {
    const b = ctx.body;
    const room = ctx.db.prepare('SELECT * FROM rooms WHERE id=?').get(Number(b.room_id));
    if (!room) return ctx.fail(404, 'Không tìm thấy phòng');
    if (room.status === 'occupied') return ctx.fail(400, 'Phòng đang có khách');
    if (!['hourly', 'overnight', 'daily'].includes(b.type)) return ctx.fail(400, 'Loại thuê không hợp lệ');

    // Khách hàng: dùng id có sẵn hoặc tạo nhanh
    let customerId = b.customer_id ? Number(b.customer_id) : null;
    if (!customerId && b.customer_name) {
      const r = ctx.db.prepare('INSERT INTO customers(name,phone,id_card,address) VALUES (?,?,?,?)')
        .run(b.customer_name, b.customer_phone || '', b.customer_id_card || '', b.customer_address || '');
      customerId = r.lastInsertRowid;
    }

    const checkIn = b.check_in || nowLocal();
    const code = genCode('DP');
    const deposit = Number(b.deposit) || 0;
    const res = ctx.db.prepare(`INSERT INTO bookings
      (code,room_id,customer_id,group_id,type,status,check_in,expected_check_out,deposit,note,created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
      code, room.id, customerId, b.group_id ? Number(b.group_id) : null, b.type, 'active',
      checkIn, b.expected_check_out || null, deposit, b.note || '', ctx.user.id);
    const bookingId = res.lastInsertRowid;

    ctx.db.prepare("UPDATE rooms SET status='occupied' WHERE id=?").run(room.id);

    if (deposit > 0) {
      ctx.db.prepare(`INSERT INTO cashflow(type,category,amount,method,note,ref_type,ref_id,created_by)
        VALUES ('income','Tiền cọc',?,?,?, 'booking', ?, ?)`)
        .run(deposit, b.method || 'cash', `Cọc phòng ${room.name} (${code})`, bookingId, ctx.user.id);
    }
    ctx.logAudit(ctx.user, 'checkin', 'booking', bookingId, `Nhận phòng ${room.name}, loại ${b.type}, cọc ${deposit}`);
    ctx.ok({ id: bookingId, code });
  });

  // Chi tiết booking + tạm tính
  api.get('/api/bookings/:id', (ctx) => {
    const bk = loadBooking(ctx.db, Number(ctx.params.id));
    if (!bk) return ctx.fail(404, 'Không tìm thấy phiếu thuê');
    const items = ctx.db.prepare('SELECT * FROM booking_items WHERE booking_id=? ORDER BY id').all(bk.id);
    const charge = computeCharge(ctx.db, bk);
    ctx.ok({ booking: bk, items, estimate: charge });
  });

  // Danh sách phiếu thuê (lịch sử) — lọc theo trạng thái / ngày
  api.get('/api/bookings', (ctx) => {
    const { status, from, to } = ctx.query;
    let sql = `SELECT b.*, r.name AS room_name, c.name AS customer_name
               FROM bookings b JOIN rooms r ON r.id=b.room_id
               LEFT JOIN customers c ON c.id=b.customer_id WHERE 1=1`;
    const p = [];
    if (status) { sql += ' AND b.status=?'; p.push(status); }
    if (from) { sql += ' AND date(b.check_in)>=date(?)'; p.push(from); }
    if (to) { sql += ' AND date(b.check_in)<=date(?)'; p.push(to); }
    sql += ' ORDER BY b.id DESC LIMIT 300';
    ctx.ok({ bookings: ctx.db.prepare(sql).all(...p) });
  });

  // Thêm dịch vụ / minibar vào phòng
  api.post('/api/bookings/:id/items', ['owner', 'receptionist', 'staff'], (ctx) => {
    const bk = ctx.db.prepare('SELECT * FROM bookings WHERE id=?').get(Number(ctx.params.id));
    if (!bk || bk.status !== 'active') return ctx.fail(400, 'Phiếu thuê không hợp lệ');
    const { product_id, qty } = ctx.body;
    const q = Math.max(1, Number(qty) || 1);
    const prod = ctx.db.prepare('SELECT * FROM products WHERE id=?').get(Number(product_id));
    if (!prod) return ctx.fail(404, 'Không tìm thấy sản phẩm/dịch vụ');
    if (prod.track_stock && prod.stock < q) return ctx.fail(400, `Không đủ tồn kho (còn ${prod.stock})`);

    const amount = prod.price * q;
    const r = ctx.db.prepare(`INSERT INTO booking_items(booking_id,product_id,name,qty,unit_price,amount,created_by)
      VALUES (?,?,?,?,?,?,?)`).run(bk.id, prod.id, prod.name, q, prod.price, amount, ctx.user.id);

    if (prod.track_stock) {
      ctx.db.prepare('UPDATE products SET stock=stock-? WHERE id=?').run(q, prod.id);
      ctx.db.prepare(`INSERT INTO stock_moves(product_id,change,reason,ref,created_by) VALUES (?,?,?,?,?)`)
        .run(prod.id, -q, 'sale', `booking:${bk.id}`, ctx.user.id);
    }
    ctx.logAudit(ctx.user, 'add_item', 'booking', bk.id, `Thêm ${prod.name} x${q} vào ${bk.code}`);
    ctx.ok({ id: r.lastInsertRowid });
  });

  // Xóa 1 dòng dịch vụ (hoàn tồn kho)
  api.del('/api/bookings/:id/items/:itemId', ['owner', 'receptionist'], (ctx) => {
    const item = ctx.db.prepare('SELECT * FROM booking_items WHERE id=? AND booking_id=?')
      .get(Number(ctx.params.itemId), Number(ctx.params.id));
    if (!item) return ctx.fail(404, 'Không tìm thấy dòng dịch vụ');
    ctx.db.prepare('DELETE FROM booking_items WHERE id=?').run(item.id);
    if (item.product_id) {
      const prod = ctx.db.prepare('SELECT * FROM products WHERE id=?').get(item.product_id);
      if (prod && prod.track_stock) {
        ctx.db.prepare('UPDATE products SET stock=stock+? WHERE id=?').run(item.qty, prod.id);
        ctx.db.prepare(`INSERT INTO stock_moves(product_id,change,reason,ref,created_by) VALUES (?,?,?,?,?)`)
          .run(prod.id, item.qty, 'adjust', `hoàn dịch vụ booking:${item.booking_id}`, ctx.user.id);
      }
    }
    ctx.logAudit(ctx.user, 'remove_item', 'booking', item.booking_id, `Xóa dịch vụ ${item.name}`);
    ctx.ok();
  });

  // GIA HẠN thời gian ở
  api.post('/api/bookings/:id/extend', ['owner', 'receptionist'], (ctx) => {
    const bk = ctx.db.prepare('SELECT * FROM bookings WHERE id=?').get(Number(ctx.params.id));
    if (!bk || bk.status !== 'active') return ctx.fail(400, 'Phiếu thuê không hợp lệ');
    const { expected_check_out } = ctx.body;
    if (!expected_check_out) return ctx.fail(400, 'Thiếu thời gian trả phòng dự kiến mới');
    ctx.db.prepare('UPDATE bookings SET expected_check_out=? WHERE id=?').run(expected_check_out, bk.id);
    ctx.logAudit(ctx.user, 'extend', 'booking', bk.id, `Gia hạn ${bk.code} đến ${expected_check_out}`);
    ctx.ok();
  });

  // ĐỔI PHÒNG
  api.post('/api/bookings/:id/change-room', ['owner', 'receptionist'], (ctx) => {
    const bk = ctx.db.prepare('SELECT * FROM bookings WHERE id=?').get(Number(ctx.params.id));
    if (!bk || bk.status !== 'active') return ctx.fail(400, 'Phiếu thuê không hợp lệ');
    const newRoom = ctx.db.prepare('SELECT * FROM rooms WHERE id=?').get(Number(ctx.body.room_id));
    if (!newRoom) return ctx.fail(404, 'Không tìm thấy phòng mới');
    if (newRoom.id === bk.room_id) return ctx.fail(400, 'Trùng phòng hiện tại');
    if (newRoom.status === 'occupied') return ctx.fail(400, 'Phòng mới đang có khách');
    const oldRoom = ctx.db.prepare('SELECT * FROM rooms WHERE id=?').get(bk.room_id);

    ctx.db.prepare('UPDATE bookings SET room_id=? WHERE id=?').run(newRoom.id, bk.id);
    ctx.db.prepare("UPDATE rooms SET status='cleaning' WHERE id=?").run(oldRoom.id);
    ctx.db.prepare("UPDATE rooms SET status='occupied' WHERE id=?").run(newRoom.id);
    ctx.db.prepare(`INSERT INTO housekeeping(room_id,status,note,created_by) VALUES (?,?,?,?)`)
      .run(oldRoom.id, 'dirty', `Khách chuyển sang phòng ${newRoom.name}`, ctx.user.id);
    ctx.logAudit(ctx.user, 'change_room', 'booking', bk.id, `Đổi phòng ${oldRoom.name} -> ${newRoom.name}`);
    ctx.ok();
  });

  // TRẢ PHÒNG (check-out) + xuất hóa đơn
  api.post('/api/bookings/:id/checkout', ['owner', 'receptionist'], (ctx) => {
    const bk = ctx.db.prepare('SELECT * FROM bookings WHERE id=?').get(Number(ctx.params.id));
    if (!bk || bk.status !== 'active') return ctx.fail(400, 'Phiếu thuê không hợp lệ');
    const room = ctx.db.prepare('SELECT * FROM rooms WHERE id=?').get(bk.room_id);

    const checkOut = ctx.body.check_out || nowLocal();
    const charge = computeCharge(ctx.db, bk, checkOut);
    const roomCharge = charge.room.amount;
    const serviceCharge = charge.service_charge;
    const discount = Number(ctx.body.discount) || 0;
    const deposit = bk.deposit || 0;
    const gross = Math.max(0, roomCharge + serviceCharge - discount);
    const remaining = gross - deposit; // số còn phải thu (có thể âm nếu cọc dư)
    const paid = ctx.body.paid !== undefined ? Number(ctx.body.paid) : Math.max(0, remaining);
    const method = ctx.body.method || 'cash';

    // Cập nhật phiếu thuê
    ctx.db.prepare('UPDATE bookings SET status=?, check_out=?, room_charge=?, discount=? WHERE id=?')
      .run('checkedout', checkOut, roomCharge, discount, bk.id);

    // Hóa đơn
    const code = genCode('HD');
    const status = paid >= remaining ? 'paid' : (paid > 0 ? 'partial' : 'unpaid');
    const inv = ctx.db.prepare(`INSERT INTO invoices
      (code,booking_id,customer_id,room_charge,service_charge,discount,deposit,total,paid,method,status,created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      code, bk.id, bk.customer_id, roomCharge, serviceCharge, discount, deposit, gross, paid, method, status, ctx.user.id);

    // Ghi thu tiền (phần thu thêm khi trả phòng)
    if (paid > 0) {
      ctx.db.prepare(`INSERT INTO cashflow(type,category,amount,method,note,ref_type,ref_id,created_by)
        VALUES ('income','Doanh thu phòng',?,?,?, 'invoice', ?, ?)`)
        .run(paid, method, `Thu tiền hóa đơn ${code} - phòng ${room.name}`, inv.lastInsertRowid, ctx.user.id);
    }

    // Giải phóng phòng -> dọn dẹp
    ctx.db.prepare("UPDATE rooms SET status='cleaning' WHERE id=?").run(room.id);
    ctx.db.prepare(`INSERT INTO housekeeping(room_id,status,note,created_by) VALUES (?,?,?,?)`)
      .run(room.id, 'dirty', `Khách trả phòng ${bk.code}`, ctx.user.id);

    ctx.logAudit(ctx.user, 'checkout', 'booking', bk.id, `Trả phòng ${room.name}, tổng ${gross}, thu ${paid}`);
    ctx.ok({ invoice_id: inv.lastInsertRowid, invoice_code: code, room_charge: roomCharge, service_charge: serviceCharge, gross, deposit, remaining, paid });
  });

  // HỦY phiếu thuê
  api.post('/api/bookings/:id/cancel', ['owner', 'receptionist'], (ctx) => {
    const bk = ctx.db.prepare('SELECT * FROM bookings WHERE id=?').get(Number(ctx.params.id));
    if (!bk || bk.status !== 'active') return ctx.fail(400, 'Phiếu thuê không hợp lệ');
    ctx.db.prepare("UPDATE bookings SET status='cancelled', check_out=? WHERE id=?").run(nowLocal(), bk.id);
    ctx.db.prepare("UPDATE rooms SET status='available' WHERE id=?").run(bk.room_id);
    ctx.logAudit(ctx.user, 'cancel', 'booking', bk.id, `Hủy phiếu ${bk.code}`);
    ctx.ok();
  });
};
