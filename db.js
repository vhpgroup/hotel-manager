'use strict';
const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const { hashPassword } = require('./lib/util');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = path.join(DATA_DIR, 'hotel.db');

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

function createSchema() {
  db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'staff',           -- owner | receptionist | staff
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    expires_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS room_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    hourly_first INTEGER NOT NULL DEFAULT 0,
    hourly_next INTEGER NOT NULL DEFAULT 0,
    overnight_rate INTEGER NOT NULL DEFAULT 0,
    daily_rate INTEGER NOT NULL DEFAULT 0,
    weekend_rate INTEGER NOT NULL DEFAULT 0,
    holiday_rate INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS rooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    floor INTEGER NOT NULL DEFAULT 1,
    room_type_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'available',      -- available | occupied | cleaning | maintenance
    note TEXT DEFAULT '',
    FOREIGN KEY(room_type_id) REFERENCES room_types(id)
  );

  CREATE TABLE IF NOT EXISTS holidays (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT UNIQUE NOT NULL,                      -- YYYY-MM-DD
    name TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT DEFAULT '',
    id_card TEXT DEFAULT '',
    address TEXT DEFAULT '',
    note TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    leader_customer_id INTEGER,
    note TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    FOREIGN KEY(leader_customer_id) REFERENCES customers(id)
  );

  CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    room_id INTEGER NOT NULL,
    customer_id INTEGER,
    group_id INTEGER,
    type TEXT NOT NULL DEFAULT 'daily',             -- hourly | overnight | daily
    status TEXT NOT NULL DEFAULT 'active',          -- reserved | active | checkedout | cancelled
    check_in TEXT,
    expected_check_out TEXT,
    check_out TEXT,
    deposit INTEGER NOT NULL DEFAULT 0,
    room_charge INTEGER NOT NULL DEFAULT 0,
    discount INTEGER NOT NULL DEFAULT 0,
    note TEXT DEFAULT '',
    created_by INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    FOREIGN KEY(room_id) REFERENCES rooms(id),
    FOREIGN KEY(customer_id) REFERENCES customers(id),
    FOREIGN KEY(group_id) REFERENCES groups(id)
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sku TEXT DEFAULT '',
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'minibar',       -- minibar | service
    price INTEGER NOT NULL DEFAULT 0,
    cost INTEGER NOT NULL DEFAULT 0,
    stock INTEGER NOT NULL DEFAULT 0,
    track_stock INTEGER NOT NULL DEFAULT 1,
    active INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS booking_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_id INTEGER NOT NULL,
    product_id INTEGER,
    name TEXT NOT NULL,
    qty INTEGER NOT NULL DEFAULT 1,
    unit_price INTEGER NOT NULL DEFAULT 0,
    amount INTEGER NOT NULL DEFAULT 0,
    created_by INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    FOREIGN KEY(booking_id) REFERENCES bookings(id)
  );

  CREATE TABLE IF NOT EXISTS stock_moves (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    change INTEGER NOT NULL,
    reason TEXT NOT NULL,                            -- sale | import | adjust
    ref TEXT DEFAULT '',
    created_by INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    FOREIGN KEY(product_id) REFERENCES products(id)
  );

  CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    booking_id INTEGER,
    customer_id INTEGER,
    room_charge INTEGER NOT NULL DEFAULT 0,
    service_charge INTEGER NOT NULL DEFAULT 0,
    discount INTEGER NOT NULL DEFAULT 0,
    deposit INTEGER NOT NULL DEFAULT 0,
    total INTEGER NOT NULL DEFAULT 0,
    paid INTEGER NOT NULL DEFAULT 0,
    method TEXT DEFAULT 'cash',                      -- cash | transfer | card
    status TEXT NOT NULL DEFAULT 'paid',            -- paid | unpaid | partial
    note TEXT DEFAULT '',
    created_by INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    FOREIGN KEY(booking_id) REFERENCES bookings(id)
  );

  CREATE TABLE IF NOT EXISTS cashflow (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,                              -- income | expense
    category TEXT DEFAULT '',
    amount INTEGER NOT NULL DEFAULT 0,
    method TEXT DEFAULT 'cash',
    note TEXT DEFAULT '',
    ref_type TEXT DEFAULT '',
    ref_id INTEGER,
    created_by INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS housekeeping (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'dirty',           -- dirty | cleaning | clean
    assigned_to INTEGER,
    note TEXT DEFAULT '',
    created_by INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    FOREIGN KEY(room_id) REFERENCES rooms(id)
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    username TEXT DEFAULT '',
    action TEXT NOT NULL,
    entity TEXT DEFAULT '',
    entity_id INTEGER,
    details TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
  `);
}

function count(table) {
  return db.prepare(`SELECT COUNT(*) c FROM ${table}`).get().c;
}

function seed() {
  if (count('users') > 0) return; // đã có dữ liệu

  // Người dùng demo
  const insUser = db.prepare('INSERT INTO users(username,password_hash,full_name,role) VALUES (?,?,?,?)');
  insUser.run('admin', hashPassword('123456'), 'Chủ khách sạn', 'owner');
  insUser.run('letan', hashPassword('123456'), 'Nguyễn Thị Lễ Tân', 'receptionist');
  insUser.run('nhanvien', hashPassword('123456'), 'Trần Văn Nhân Viên', 'staff');

  // Hạng phòng + giá
  const insType = db.prepare(`INSERT INTO room_types(name,hourly_first,hourly_next,overnight_rate,daily_rate,weekend_rate,holiday_rate)
    VALUES (?,?,?,?,?,?,?)`);
  const tSingle = insType.run('Phòng Đơn', 80000, 40000, 250000, 350000, 400000, 500000).lastInsertRowid;
  const tDouble = insType.run('Phòng Đôi', 100000, 50000, 350000, 500000, 600000, 750000).lastInsertRowid;
  const tVip = insType.run('Phòng VIP', 150000, 70000, 500000, 800000, 950000, 1200000).lastInsertRowid;

  // 8 phòng
  const insRoom = db.prepare('INSERT INTO rooms(name,floor,room_type_id,status) VALUES (?,?,?,?)');
  insRoom.run('101', 1, tSingle, 'available');
  insRoom.run('102', 1, tSingle, 'available');
  insRoom.run('103', 1, tDouble, 'available');
  insRoom.run('104', 1, tDouble, 'available');
  insRoom.run('201', 2, tDouble, 'available');
  insRoom.run('202', 2, tVip, 'available');
  insRoom.run('203', 2, tVip, 'available');
  insRoom.run('204', 2, tSingle, 'available');

  // Sản phẩm minibar + dịch vụ
  const insProd = db.prepare('INSERT INTO products(sku,name,category,price,cost,stock,track_stock) VALUES (?,?,?,?,?,?,?)');
  insProd.run('NUOC', 'Nước suối', 'minibar', 10000, 4000, 100, 1);
  insProd.run('COCA', 'Coca Cola', 'minibar', 15000, 8000, 80, 1);
  insProd.run('BIA', 'Bia Tiger', 'minibar', 20000, 12000, 60, 1);
  insProd.run('MI', 'Mì ly', 'minibar', 15000, 7000, 50, 1);
  insProd.run('SNACK', 'Bánh snack', 'minibar', 12000, 6000, 40, 1);
  insProd.run('GIAT', 'Giặt ủi', 'service', 50000, 0, 0, 0);
  insProd.run('ANSANG', 'Ăn sáng', 'service', 40000, 0, 0, 0);
  insProd.run('XEMAY', 'Thuê xe máy', 'service', 120000, 0, 0, 0);

  // Ngày lễ (mẫu 2026)
  const insHol = db.prepare('INSERT INTO holidays(date,name) VALUES (?,?)');
  [
    ['2026-01-01', 'Tết Dương lịch'],
    ['2026-02-17', 'Tết Nguyên đán'],
    ['2026-04-30', 'Giải phóng miền Nam'],
    ['2026-05-01', 'Quốc tế Lao động'],
    ['2026-09-02', 'Quốc khánh'],
  ].forEach(([d, n]) => insHol.run(d, n));

  // Khách hàng mẫu
  const insCus = db.prepare('INSERT INTO customers(name,phone,id_card,address) VALUES (?,?,?,?)');
  insCus.run('Khách vãng lai', '', '', '');
  insCus.run('Lê Văn A', '0901234567', '079123456789', 'TP.HCM');
  insCus.run('Phạm Thị B', '0912345678', '079987654321', 'Hà Nội');

  // Cấu hình khách sạn
  const insSet = db.prepare('INSERT INTO settings(key,value) VALUES (?,?)');
  const settings = {
    hotel_name: 'KHÁCH SẠN DEMO',
    address: '123 Đường ABC, Quận 1, TP.HCM',
    phone: '028.1234.5678',
    checkin_time: '14:00',
    checkout_time: '12:00',
    tax_code: '',
    footer_note: 'Cảm ơn quý khách - Hẹn gặp lại!'
  };
  for (const [k, v] of Object.entries(settings)) insSet.run(k, v);

  console.log('✔ Đã tạo dữ liệu mẫu: 3 tài khoản, 3 hạng phòng, 8 phòng, 8 sản phẩm, 5 ngày lễ.');
}

function reseed() {
  const tables = ['audit_log', 'cashflow', 'invoices', 'stock_moves', 'booking_items', 'bookings',
    'housekeeping', 'groups', 'customers', 'products', 'rooms', 'room_types', 'holidays',
    'sessions', 'settings', 'users'];
  for (const t of tables) db.exec(`DROP TABLE IF EXISTS ${t}`);
  createSchema();
  seed();
  console.log('✔ Đã tạo lại toàn bộ dữ liệu.');
}

createSchema();
seed();

if (require.main === module && process.argv.includes('--reseed')) {
  reseed();
}

module.exports = { db, DB_PATH, DATA_DIR, reseed, count };
