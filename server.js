'use strict';
const path = require('node:path');
require('./db'); // khởi tạo schema + seed
const { createApp } = require('./lib/framework');

const PORT = process.env.PORT || 3000;
const publicDir = path.join(__dirname, 'public');

const { api, server } = createApp({ publicDir });

// Đăng ký toàn bộ route
require('./routes/auth')(api);
require('./routes/rooms')(api);
require('./routes/bookings')(api);
require('./routes/customers')(api);
require('./routes/inventory')(api);
require('./routes/housekeeping')(api);
require('./routes/finance')(api);
require('./routes/system')(api);

server.listen(PORT, () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════════════╗');
  console.log('  ║   PHẦN MỀM QUẢN LÝ KHÁCH SẠN (mô phỏng KiotViet) ║');
  console.log('  ╚══════════════════════════════════════════════╝');
  console.log(`  ➜  Mở trình duyệt: http://localhost:${PORT}`);
  console.log('  ➜  Tài khoản demo:');
  console.log('       • admin / 123456     (Chủ)');
  console.log('       • letan / 123456     (Lễ tân)');
  console.log('       • nhanvien / 123456  (Nhân viên)');
  console.log('');
});
