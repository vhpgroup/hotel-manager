// ============ BỘ KIỂM THỬ TỰ ĐỘNG ============
// Chạy: node test.js  (server phải đang chạy ở PORT 3000)
const B = 'http://127.0.0.1:3000';
const jars = {}; // cookie theo vai trò
let pass = 0, fail = 0; const fails = [];

async function call(role, method, path, body) {
  const opt = { method, headers: {} };
  if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
  if (jars[role]) opt.headers['Cookie'] = jars[role];
  const res = await fetch(B + path, opt);
  const sc = res.headers.get('set-cookie'); if (sc && role) jars[role] = sc.split(';')[0];
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('json') ? await res.json().catch(() => ({})) : await res.text();
  return { status: res.status, data, ct, len: (res.headers.get('content-length') || '') };
}
function ok(name, cond, extra = '') { if (cond) { pass++; } else { fail++; fails.push(`✗ ${name} ${extra}`); console.log(`  ✗ FAIL: ${name} ${extra}`); } }
function localStr(d) { const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; }
function nextSaturday() { const d = new Date(); d.setHours(14, 0, 0, 0); while (d.getDay() !== 6) d.setDate(d.getDate() + 1); return d; }

(async () => {
  console.log('▶ Bắt đầu kiểm thử...\n');

  // ---------- AUTH ----------
  let r = await call('admin', 'POST', '/api/login', { username: 'admin', password: '123456' });
  ok('Đăng nhập admin', r.status === 200 && r.data.user.role === 'owner');
  r = await call(null, 'POST', '/api/login', { username: 'admin', password: 'sai' });
  ok('Sai mật khẩu bị chặn', r.status === 401);
  await call('letan', 'POST', '/api/login', { username: 'letan', password: '123456' });
  await call('nhanvien', 'POST', '/api/login', { username: 'nhanvien', password: '123456' });
  r = await call('admin', 'GET', '/api/me');
  ok('GET /api/me', r.status === 200 && r.data.user.username === 'admin');

  // ---------- PHÂN QUYỀN ----------
  r = await call('letan', 'GET', '/api/users');
  ok('Lễ tân KHÔNG xem được người dùng (403)', r.status === 403);
  r = await call('letan', 'GET', '/api/audit');
  ok('Lễ tân KHÔNG xem được nhật ký (403)', r.status === 403);
  r = await call('nhanvien', 'POST', '/api/room-types', { name: 'x' });
  ok('Nhân viên KHÔNG sửa giá (403)', r.status === 403);

  // ---------- PHÒNG ----------
  r = await call('admin', 'GET', '/api/rooms');
  const rooms = r.data.rooms; const R = (n) => rooms.find((x) => x.name === n).id;
  ok('Có đúng 8 phòng', rooms.length === 8);
  ok('Tất cả phòng ban đầu trống', rooms.every((x) => x.status === 'available'));

  // ---------- GIÁ THEO GIỜ (2.5 giờ) ----------
  const ci = new Date(Date.now() - 150 * 60000); // 2.5h trước
  r = await call('admin', 'POST', '/api/bookings', { room_id: R('101'), type: 'hourly', check_in: localStr(ci), customer_name: 'Test Giờ' });
  const bkHourly = r.data.id;
  r = await call('admin', 'GET', `/api/bookings/${bkHourly}`);
  ok('Giá theo giờ 2.5h = 160.000 (80k + 40k×2)', r.data.estimate.room.amount === 160000, `-> ${r.data.estimate.room.amount}`);
  await call('admin', 'POST', `/api/bookings/${bkHourly}/cancel`);
  r = await call('admin', 'GET', '/api/rooms');
  ok('Hủy phiếu -> phòng 101 trống lại', r.data.rooms.find((x) => x.name === '101').status === 'available');

  // ---------- GIÁ QUA ĐÊM ----------
  r = await call('admin', 'POST', '/api/bookings', { room_id: R('104'), type: 'overnight', customer_name: 'Test Đêm' });
  const bkON = r.data.id;
  r = await call('admin', 'GET', `/api/bookings/${bkON}`);
  ok('Giá qua đêm Phòng Đôi = 350.000', r.data.estimate.room.amount === 350000, `-> ${r.data.estimate.room.amount}`);
  await call('admin', 'POST', `/api/bookings/${bkON}/cancel`);

  // ---------- GIÁ THEO NGÀY: NGÀY LỄ ----------
  r = await call('admin', 'POST', '/api/bookings', { room_id: R('102'), type: 'daily', check_in: '2026-09-02 14:00:00', customer_name: 'Test Lễ' });
  const bkHol = r.data.id;
  r = await call('admin', 'POST', `/api/bookings/${bkHol}/checkout`, { check_out: '2026-09-03 12:00:00' });
  ok('Ngày lễ (2/9) Phòng Đơn = 500.000', r.data.room_charge === 500000, `-> ${r.data.room_charge}`);

  // ---------- GIÁ THEO NGÀY: CUỐI TUẦN ----------
  const sat = nextSaturday(); const sun = new Date(sat); sun.setDate(sat.getDate() + 1); sun.setHours(12, 0, 0, 0);
  r = await call('admin', 'POST', '/api/bookings', { room_id: R('103'), type: 'daily', check_in: localStr(sat), customer_name: 'Test T7' });
  const bkWe = r.data.id;
  r = await call('admin', 'GET', `/api/bookings/${bkWe}`);
  const weDetail = r.data.estimate.room.detail;
  await call('admin', 'POST', `/api/bookings/${bkWe}/checkout`, { check_out: localStr(sun) });
  ok('Cuối tuần áp dụng giá cuối tuần', /cuối tuần/.test(weDetail), `detail: ${weDetail.slice(0, 60)}`);

  // ---------- DỊCH VỤ + TỒN KHO ----------
  r = await call('admin', 'POST', '/api/bookings', { room_id: R('201'), type: 'daily', customer_name: 'Test DV' });
  const bkSvc = r.data.id;
  let prods = (await call('admin', 'GET', '/api/products')).data.products;
  const bia = prods.find((p) => p.name === 'Bia Tiger');
  const biaStock0 = bia.stock;
  await call('admin', 'POST', `/api/bookings/${bkSvc}/items`, { product_id: bia.id, qty: 2 });
  prods = (await call('admin', 'GET', '/api/products')).data.products;
  ok('Bán 2 Bia -> tồn kho giảm 2', prods.find((p) => p.id === bia.id).stock === biaStock0 - 2, `-> ${prods.find((p) => p.id === bia.id).stock}`);
  const giat = (await call('admin', 'GET', '/api/products')).data.products.find((p) => p.name === 'Giặt ủi');
  r = await call('admin', 'POST', `/api/bookings/${bkSvc}/items`, { product_id: giat.id, qty: 1 });
  r = await call('admin', 'GET', `/api/bookings/${bkSvc}`);
  ok('Tổng dịch vụ = 2×20k + 50k = 90k', r.data.estimate.service_charge === 90000, `-> ${r.data.estimate.service_charge}`);
  const itemBia = r.data.items.find((i) => i.product_id === bia.id);
  await call('admin', 'DELETE', `/api/bookings/${bkSvc}/items/${itemBia.id}`);
  prods = (await call('admin', 'GET', '/api/products')).data.products;
  ok('Xóa dòng Bia -> hoàn lại tồn kho', prods.find((p) => p.id === bia.id).stock === biaStock0, `-> ${prods.find((p) => p.id === bia.id).stock}`);
  // Nhân viên được thêm dịch vụ (staff)
  r = await call('nhanvien', 'POST', `/api/bookings/${bkSvc}/items`, { product_id: (prods.find((p) => p.name === 'Nước suối')).id, qty: 1 });
  ok('Nhân viên ĐƯỢC thêm dịch vụ', r.status === 200);
  await call('admin', 'POST', `/api/bookings/${bkSvc}/checkout`, {});

  // ---------- TIỀN CỌC + THANH TOÁN ----------
  r = await call('admin', 'POST', '/api/bookings', { room_id: R('202'), type: 'overnight', deposit: 200000, customer_name: 'Test Cọc' });
  const bkDep = r.data.id;
  let cf = (await call('admin', 'GET', `/api/cashflow?from=2020-01-01&to=2030-01-01`)).data;
  ok('Thu tiền cọc 200k được ghi sổ', cf.entries.some((e) => e.category === 'Tiền cọc' && e.amount === 200000));
  r = await call('admin', 'POST', `/api/bookings/${bkDep}/checkout`, {});
  ok('VIP qua đêm 500k − cọc 200k = còn thu 300k', r.data.gross === 500000 && r.data.remaining === 300000, `gross ${r.data.gross}, remaining ${r.data.remaining}`);
  ok('Hóa đơn lưu tiền cọc 200k', r.data.deposit === 200000);
  r2 = await call('admin', 'GET', '/api/rooms');
  ok('Sau trả phòng -> phòng 202 chuyển Dọn dẹp', r2.data.rooms.find((x) => x.name === '202').status === 'cleaning');

  // ---------- GIA HẠN + ĐỔI PHÒNG ----------
  r = await call('admin', 'POST', '/api/bookings', { room_id: R('203'), type: 'daily', customer_name: 'Test Đổi' });
  const bkMove = r.data.id;
  r = await call('admin', 'POST', `/api/bookings/${bkMove}/extend`, { expected_check_out: '2026-12-31 12:00:00' });
  ok('Gia hạn thành công', r.status === 200);
  r = await call('admin', 'POST', `/api/bookings/${bkMove}/change-room`, { room_id: R('204') });
  ok('Đổi phòng thành công', r.status === 200);
  r = await call('admin', 'GET', `/api/bookings/${bkMove}`);
  ok('Phiếu đã chuyển sang phòng 204', r.data.booking.room_name === '204');
  r = await call('admin', 'GET', '/api/rooms');
  ok('Phòng cũ 203 -> Dọn dẹp', r.data.rooms.find((x) => x.name === '203').status === 'cleaning');
  ok('Phòng mới 204 -> Đang ở', r.data.rooms.find((x) => x.name === '204').status === 'occupied');

  // ---------- CHECK-IN BỊ CHẶN KHI PHÒNG CÓ KHÁCH ----------
  r = await call('admin', 'POST', '/api/bookings', { room_id: R('204'), type: 'hourly' });
  ok('Không cho nhận phòng đang có khách', r.status === 400);
  r = await call('nhanvien', 'POST', '/api/bookings', { room_id: R('101'), type: 'hourly' });
  ok('Nhân viên KHÔNG được nhận phòng (403)', r.status === 403);

  // ---------- DỌN PHÒNG ----------
  r = await call('admin', 'GET', '/api/housekeeping');
  ok('Có công việc dọn phòng sau các lượt trả', r.data.tasks.length > 0, `-> ${r.data.tasks.length} việc`);
  const task = r.data.tasks[0];
  await call('nhanvien', 'PUT', `/api/housekeeping/${task.id}`, { status: 'clean' });
  r = await call('admin', 'GET', '/api/rooms');
  ok('Dọn xong -> phòng trở lại Trống', r.data.rooms.find((x) => x.id === task.room_id).status === 'available');

  // ---------- KHÁCH HÀNG + ĐOÀN ----------
  r = await call('admin', 'POST', '/api/customers', { name: 'Nguyễn Test', phone: '0909', id_card: '123' });
  ok('Tạo khách hàng', r.status === 200);
  r = await call('admin', 'GET', '/api/customers?q=Test');
  ok('Tìm kiếm khách hàng', r.data.customers.some((c) => c.name === 'Nguyễn Test'));
  r = await call('admin', 'POST', '/api/groups', { name: 'Đoàn ABC' });
  ok('Tạo khách đoàn', r.status === 200);

  // ---------- KHO ----------
  r = await call('admin', 'POST', '/api/products', { name: 'Khăn lạnh', category: 'minibar', price: 5000, cost: 2000, stock: 3 });
  const newP = r.data.id;
  await call('admin', 'POST', `/api/products/${newP}/stock`, { change: 50, reason: 'import' });
  prods = (await call('admin', 'GET', '/api/products')).data.products;
  ok('Nhập kho +50 -> tồn 53', prods.find((p) => p.id === newP).stock === 53, `-> ${prods.find((p) => p.id === newP).stock}`);
  r = await call('admin', 'GET', '/api/stock-moves');
  ok('Có lịch sử xuất/nhập kho', r.data.moves.length > 0);

  // ---------- THU CHI ----------
  await call('admin', 'POST', '/api/cashflow', { type: 'expense', amount: 150000, category: 'Điện nước', note: 'test' });
  r = await call('admin', 'GET', '/api/cashflow?from=2020-01-01&to=2030-01-01');
  ok('Sổ thu chi có phần tổng hợp', typeof r.data.summary.income === 'number' && typeof r.data.summary.net === 'number');
  ok('Ghi nhận phiếu chi điện nước', r.data.entries.some((e) => e.category === 'Điện nước' && e.amount === 150000));

  // ---------- HÓA ĐƠN ----------
  r = await call('admin', 'GET', '/api/invoices');
  ok('Có danh sách hóa đơn', r.data.invoices.length >= 3, `-> ${r.data.invoices.length} hóa đơn`);
  const invId = r.data.invoices[0].id;
  r = await call('admin', 'GET', `/api/invoices/${invId}`);
  ok('Chi tiết hóa đơn có đủ thông tin in', !!r.data.invoice && 'settings' in r.data && 'cashier' in r.data);

  // ---------- BÁO CÁO ----------
  r = await call('admin', 'GET', '/api/reports/dashboard');
  ok('Dashboard trả số liệu', r.data.dashboard.rooms.total === 8 && typeof r.data.dashboard.today.income === 'number');
  r = await call('admin', 'GET', '/api/reports/revenue?from=2020-01-01&to=2030-12-31');
  ok('Báo cáo doanh thu', Array.isArray(r.data.by_day) && typeof r.data.summary.net === 'number');
  r = await call('admin', 'GET', '/api/reports/occupancy?from=2026-07-01&to=2026-07-05');
  ok('Báo cáo công suất phòng', typeof r.data.avg_pct === 'number' && Array.isArray(r.data.days));

  // ---------- NHẬT KÝ ----------
  r = await call('admin', 'GET', '/api/audit');
  ok('Nhật ký giao dịch có ghi log', r.data.logs.length > 0, `-> ${r.data.logs.length} dòng`);
  ok('Nhật ký ghi hành động checkout', r.data.logs.some((l) => l.action === 'checkout'));

  // ---------- SAO LƯU ----------
  r = await call('admin', 'GET', '/api/backup/info');
  ok('Thông tin sao lưu', r.data.counts && r.data.counts.rooms === 8);
  r = await call('admin', 'GET', '/api/backup.json');
  ok('Tải sao lưu JSON', r.ct.includes('json') && typeof r.data === 'object' && r.data.tables);
  r = await call('admin', 'GET', '/api/backup/db');
  ok('Tải file .db', r.ct.includes('octet-stream'));
  r = await call('letan', 'GET', '/api/backup.json');
  ok('Lễ tân KHÔNG tải được sao lưu (403)', r.status === 403);

  // ---------- CRUD ĐẦY ĐỦ: THÊM / SỬA / XOÁ ----------
  // Người dùng
  r = await call('admin', 'POST', '/api/users', { username: 'tmpuser', password: '123456', full_name: 'Tạm', role: 'staff' });
  ok('Thêm người dùng', r.status === 200); const tmpU = r.data.id;
  r = await call('admin', 'DELETE', `/api/users/${tmpU}`); ok('Xoá người dùng', r.status === 200);
  r = await call('admin', 'DELETE', '/api/users/1'); ok('Chặn tự xoá tài khoản đang đăng nhập', r.status === 400);

  // Phòng
  const rtId = (await call('admin', 'GET', '/api/room-types')).data.room_types[0].id;
  r = await call('admin', 'POST', '/api/rooms', { name: 'TEST9', floor: 3, room_type_id: rtId });
  ok('Thêm phòng', r.status === 200); const tmpRoom = r.data.id;
  r = await call('admin', 'PUT', `/api/rooms/${tmpRoom}`, { name: 'TEST9', floor: 5, room_type_id: rtId });
  ok('Sửa phòng', r.status === 200);
  r = await call('admin', 'DELETE', `/api/rooms/${tmpRoom}`); ok('Xoá phòng chưa có booking', r.status === 200);
  const r102 = (await call('admin', 'GET', '/api/rooms')).data.rooms.find((x) => x.name === '102');
  r = await call('admin', 'DELETE', `/api/rooms/${r102.id}`); ok('Chặn xoá phòng đã có lịch sử thuê', r.status === 400);

  // Hạng phòng
  r = await call('admin', 'POST', '/api/room-types', { name: 'Hạng Test', daily_rate: 100000 });
  ok('Thêm hạng phòng', r.status === 200); const tmpType = r.data.id;
  r = await call('admin', 'DELETE', `/api/room-types/${tmpType}`); ok('Xoá hạng phòng chưa dùng', r.status === 200);
  r = await call('admin', 'DELETE', `/api/room-types/${rtId}`); ok('Chặn xoá hạng phòng còn phòng dùng', r.status === 400);

  // Ngày lễ
  r = await call('admin', 'POST', '/api/holidays', { date: '2026-12-25', name: 'Noel' });
  ok('Thêm ngày lễ', r.status === 200); const tmpHol = r.data.id;
  r = await call('admin', 'PUT', `/api/holidays/${tmpHol}`, { date: '2026-12-25', name: 'Giáng sinh' });
  ok('Sửa ngày lễ', r.status === 200);
  r = await call('admin', 'DELETE', `/api/holidays/${tmpHol}`); ok('Xoá ngày lễ', r.status === 200);

  // Khách đoàn
  r = await call('admin', 'POST', '/api/groups', { name: 'Đoàn Test' });
  ok('Thêm đoàn', r.status === 200); const tmpG = r.data.id;
  r = await call('admin', 'PUT', `/api/groups/${tmpG}`, { name: 'Đoàn Test 2' }); ok('Sửa đoàn', r.status === 200);
  r = await call('admin', 'DELETE', `/api/groups/${tmpG}`); ok('Xoá đoàn', r.status === 200);

  // Khách hàng
  r = await call('admin', 'POST', '/api/customers', { name: 'Khách Xoá' }); const tmpC = r.data.id;
  r = await call('admin', 'DELETE', `/api/customers/${tmpC}`); ok('Xoá khách hàng chưa thuê', r.status === 200);

  // Sản phẩm: xoá cứng (chưa bán) & ngưng dùng (đã bán)
  r = await call('admin', 'POST', '/api/products', { name: 'SP Test', category: 'minibar', price: 5000, stock: 10 });
  const tmpP = r.data.id;
  r = await call('admin', 'DELETE', `/api/products/${tmpP}`); ok('Xoá sản phẩm chưa bán = xoá cứng', r.status === 200 && r.data.softDeleted === false);
  const nuoc = (await call('admin', 'GET', '/api/products')).data.products.find((p) => p.name === 'Nước suối');
  r = await call('admin', 'DELETE', `/api/products/${nuoc.id}`); ok('Xoá sản phẩm đã bán = ngưng dùng', r.status === 200 && r.data.softDeleted === true);

  // Thu chi
  r = await call('admin', 'POST', '/api/cashflow', { type: 'expense', amount: 50000, category: 'Vật tư', note: 'x' });
  const tmpCf = r.data.id;
  r = await call('admin', 'PUT', `/api/cashflow/${tmpCf}`, { amount: 60000, category: 'Vật tư', note: 'sửa' }); ok('Sửa phiếu thu chi', r.status === 200);
  r = await call('admin', 'DELETE', `/api/cashflow/${tmpCf}`); ok('Xoá phiếu thu chi', r.status === 200);
  r = await call('letan', 'DELETE', '/api/cashflow/1'); ok('Lễ tân KHÔNG được xoá thu chi (403)', r.status === 403);

  // ---------- ĐĂNG XUẤT ----------
  r = await call('admin', 'POST', '/api/logout');
  ok('Đăng xuất', r.status === 200);
  r = await call('admin', 'GET', '/api/me');
  ok('Sau đăng xuất -> 401', r.status === 401);

  // ---------- KẾT QUẢ ----------
  console.log('\n' + '═'.repeat(48));
  console.log(`  KẾT QUẢ: ${pass} PASS / ${fail} FAIL  (tổng ${pass + fail})`);
  console.log('═'.repeat(48));
  if (fail) { console.log('\nCHI TIẾT LỖI:'); fails.forEach((f) => console.log('  ' + f)); process.exit(1); }
  else console.log('  ✅ TẤT CẢ ĐỀU ĐẠT!');
  process.exit(0);
})().catch((e) => { console.error('LỖI KIỂM THỬ:', e); process.exit(1); });
