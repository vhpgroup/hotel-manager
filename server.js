'use strict';
const path = require('node:path');

/**
 * Khởi động máy chủ HTTP. Trả về { server, port }.
 * - port === undefined  -> dùng PORT môi trường hoặc 3000 (chế độ web)
 * - port === 0          -> hệ điều hành tự chọn cổng trống (dùng cho Electron)
 * Mọi require được nạp trong hàm để biến môi trường HOTEL_DATA_DIR
 * (do Electron đặt) chắc chắn đã sẵn sàng trước khi db.js chạy.
 */
function start(port) {
  if (port === undefined) port = Number(process.env.PORT) || 3000;
  require('./db'); // khởi tạo schema + dữ liệu mẫu (đọc HOTEL_DATA_DIR nếu có)
  const { createApp } = require('./lib/framework');
  const publicDir = path.join(__dirname, 'public');
  const { api, server } = createApp({ publicDir });

  require('./routes/auth')(api);
  require('./routes/rooms')(api);
  require('./routes/bookings')(api);
  require('./routes/customers')(api);
  require('./routes/inventory')(api);
  require('./routes/housekeeping')(api);
  require('./routes/finance')(api);
  require('./routes/system')(api);

  return new Promise((resolve) => {
    server.listen(port, () => resolve({ server, port: server.address().port }));
  });
}

// Chạy trực tiếp (chế độ web): node server.js
if (require.main === module) {
  start().then(({ port }) => {
    console.log('');
    console.log('  ╔══════════════════════════════════════════════╗');
    console.log('  ║   PHẦN MỀM QUẢN LÝ KHÁCH SẠN (StayPro)          ║');
    console.log('  ╚══════════════════════════════════════════════╝');
    console.log(`  ➜  Mở trình duyệt: http://localhost:${port}`);
    console.log('  ➜  Tài khoản demo: admin / letan / nhanvien  (mật khẩu 123456)');
    console.log('');
  });
}

module.exports = { start };
