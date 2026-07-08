// Tạo dữ liệu hoạt động mẫu qua API để test & chụp màn hình
const B = 'http://localhost:3000';
let cookie = '';
async function call(method, path, body) {
  const opt = { method, headers: {} };
  if (body) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
  if (cookie) opt.headers['Cookie'] = cookie;
  const res = await fetch(B + path, opt);
  const sc = res.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${j.error || ''}`);
  return j;
}
(async () => {
  await call('POST', '/api/login', { username: 'admin', password: '123456' });
  const { rooms } = await call('GET', '/api/rooms');
  const id = (n) => rooms.find((r) => r.name === n).id;
  // Chỉ tạo nếu phòng còn trống (tránh trùng khi chạy lại)
  const mk = async (name, type, deposit, cname, phone) => {
    const rm = rooms.find((r) => r.name === name);
    if (rm.status !== 'available') return null;
    return call('POST', '/api/bookings', { room_id: rm.id, type, deposit, customer_name: cname, customer_phone: phone || '' });
  };
  await mk('101', 'hourly', 100000, 'Lê Văn A', '0901234567');
  await mk('103', 'daily', 300000, 'Phạm Thị B', '0912345678');
  const b202 = await mk('202', 'overnight', 200000, 'Nguyễn Văn C');
  if (b202) {
    await call('POST', `/api/bookings/${b202.id}/items`, { product_id: 3, qty: 2 }); // 2 bia
    await call('POST', `/api/bookings/${b202.id}/items`, { product_id: 1, qty: 3 }); // 3 nước
  }
  // 1 khách đã trả phòng 201 để có doanh thu + hóa đơn
  const b201 = await mk('201', 'hourly', 0, 'Khách lẻ');
  if (b201) {
    await call('POST', `/api/bookings/${b201.id}/items`, { product_id: 6, qty: 1 });
    await call('POST', `/api/bookings/${b201.id}/checkout`, {});
  }
  await call('POST', '/api/cashflow', { type: 'expense', amount: 150000, category: 'Điện nước', note: 'Tiền điện tháng 7' }).catch(() => {});
  const dash = await call('GET', '/api/reports/dashboard');
  const rr = await call('GET', '/api/rooms');
  console.log('TRẠNG THÁI PHÒNG:');
  rr.rooms.forEach((r) => console.log(' ', r.name, r.status, r.booking ? '- ' + r.booking.customer_name : ''));
  console.log('DASHBOARD:', JSON.stringify(dash.dashboard.today), '| công suất', dash.dashboard.rooms.occupancy_pct + '%');
})().catch((e) => { console.error('LỖI:', e.message); process.exit(1); });
