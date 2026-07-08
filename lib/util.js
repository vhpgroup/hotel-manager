'use strict';
const crypto = require('node:crypto');

/* ============ Bảo mật mật khẩu (scrypt) ============ */
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 32).toString('hex');
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const test = crypto.scryptSync(String(password), salt, 32).toString('hex');
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(test, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* ============ Token / mã ============ */
function newToken() {
  return crypto.randomBytes(32).toString('hex');
}
function genCode(prefix) {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
  const rand = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `${prefix}${stamp}-${rand}`;
}

/* ============ Ngày giờ ============ */
const MS_HOUR = 3600 * 1000;
const MS_DAY = 24 * MS_HOUR;

function toDate(v) {
  return v instanceof Date ? v : new Date(v);
}
// Thời gian địa phương dạng 'YYYY-MM-DD HH:MM:SS' (khớp datetime('now','localtime') của SQLite)
function nowLocal() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
function isWeekend(d) {
  const day = toDate(d).getDay(); // 0=CN, 6=Thứ 7
  return day === 0 || day === 6;
}
function ymd(d) {
  const t = toDate(d);
  const p = (n) => String(n).padStart(2, '0');
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`;
}
function hoursBetween(a, b) {
  return (toDate(b).getTime() - toDate(a).getTime()) / MS_HOUR;
}
// Số đêm (số lần qua nửa đêm), tối thiểu 1
function nightsBetween(a, b) {
  const d1 = new Date(ymd(a) + 'T00:00:00');
  const d2 = new Date(ymd(b) + 'T00:00:00');
  const n = Math.round((d2 - d1) / MS_DAY);
  return Math.max(1, n);
}

/* ============ Tính tiền phòng ============
 * type: 'hourly' | 'overnight' | 'daily'
 * priceCfg: { hourly_first, hourly_next, overnight_rate, daily_rate, weekend_rate, holiday_rate }
 * holidaysSet: Set các chuỗi 'YYYY-MM-DD'
 * Trả về { amount, unit, quantity, detail }
 */
function calcRoomCharge(type, checkIn, checkOut, priceCfg, holidaysSet = new Set()) {
  const start = toDate(checkIn);
  const end = toDate(checkOut || new Date());
  if (type === 'hourly') {
    let hrs = hoursBetween(start, end);
    if (hrs <= 0) hrs = 0;
    const firstHour = hrs > 0 ? 1 : 0;
    const extra = Math.max(0, Math.ceil(hrs - 1));
    const amount = (priceCfg.hourly_first || 0) * firstHour + (priceCfg.hourly_next || 0) * extra;
    return {
      amount,
      unit: 'giờ',
      quantity: Math.max(0, Math.ceil(hrs)),
      detail: `Giờ đầu ${fmt(priceCfg.hourly_first)} + ${extra} giờ tiếp × ${fmt(priceCfg.hourly_next)} (tổng ~${(hrs).toFixed(1)} giờ)`
    };
  }
  if (type === 'overnight') {
    return {
      amount: priceCfg.overnight_rate || 0,
      unit: 'đêm',
      quantity: 1,
      detail: `Giá qua đêm trọn gói ${fmt(priceCfg.overnight_rate)}`
    };
  }
  // daily: tính theo từng đêm, áp dụng giá ngày lễ / cuối tuần / thường
  const nights = nightsBetween(start, end);
  let amount = 0;
  const lines = [];
  const cur = new Date(ymd(start) + 'T00:00:00');
  for (let i = 0; i < nights; i++) {
    const key = ymd(cur);
    let rate = priceCfg.daily_rate || 0;
    let label = 'ngày thường';
    if (holidaysSet.has(key) && priceCfg.holiday_rate) {
      rate = priceCfg.holiday_rate;
      label = 'ngày lễ';
    } else if (isWeekend(cur) && priceCfg.weekend_rate) {
      rate = priceCfg.weekend_rate;
      label = 'cuối tuần';
    }
    amount += rate;
    lines.push(`${key} (${label}): ${fmt(rate)}`);
    cur.setDate(cur.getDate() + 1);
  }
  return {
    amount,
    unit: 'đêm',
    quantity: nights,
    detail: lines.join(' | ')
  };
}

/* ============ Định dạng tiền VND ============ */
function fmt(n) {
  return (Number(n) || 0).toLocaleString('vi-VN') + 'đ';
}

module.exports = {
  hashPassword, verifyPassword, newToken, genCode, nowLocal,
  isWeekend, ymd, hoursBetween, nightsBetween, calcRoomCharge, fmt,
  MS_HOUR, MS_DAY
};
