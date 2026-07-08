'use strict';
/* ============ State ============ */
const State = { user: null, rooms: [], products: [], roomTypes: [], settings: {} };

/* ============ DOM helpers ============ */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
function h(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

/* ============ Icon SVG (kiểu Lucide) ============ */
const ICONS = {
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
  bed: '<path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/>',
  clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 12h6"/><path d="M9 16h6"/>',
  sparkles: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 14l.7 1.9L21.6 17l-1.9.7L19 19.6l-.7-1.9L16.4 17l1.9-.7z"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  package: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.3 7 12 12l8.7-5"/><path d="M12 22V12"/>',
  receipt: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M8 7h8"/><path d="M8 11h8"/><path d="M8 15h5"/>',
  wallet: '<path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-3a2 2 0 0 1 0-4h4"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
  chart: '<path d="M3 3v18h18"/><rect x="7" y="10" width="3" height="7" rx="1"/><rect x="12" y="6" width="3" height="11" rx="1"/><rect x="17" y="13" width="3" height="4" rx="1"/>',
  tag: '<path d="M12.6 2.6A2 2 0 0 0 11.2 2H4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 .6 1.4l8.7 8.7a2.4 2.4 0 0 0 3.4 0l6.6-6.6a2.4 2.4 0 0 0 0-3.4z"/><circle cx="7.5" cy="7.5" r="1.2"/>',
  key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 8.3-8.3"/><path d="m16 5 3 3"/><path d="m14 7 3 3"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
  database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  printer: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8" rx="1"/>',
  clock: '<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 16 14"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  alert: '<path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  filter: '<polygon points="22 3 2 3 10 12.5 10 19 14 21 14 12.5"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
  edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4Z"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/>',
  swap: '<path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/>',
  logo: '<path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/><path d="M9 9v.01"/><path d="M9 12v.01"/><path d="M9 15v.01"/><path d="M9 18v.01"/>',
};
function icon(name, cls = '') { return `<svg class="ic-svg ${cls}" viewBox="0 0 24 24">${ICONS[name] || ''}</svg>`; }

/* ============ Format ============ */
function money(n) { return (Number(n) || 0).toLocaleString('vi-VN') + 'đ'; }
function money0(n) { return (Number(n) || 0).toLocaleString('vi-VN'); }
function dt(s) {
  if (!s) return '—';
  const d = new Date(s.includes('T') ? s : s.replace(' ', 'T'));
  if (isNaN(d)) return s;
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function dtFull(s) {
  if (!s) return '—';
  const d = new Date(s.includes('T') ? s : s.replace(' ', 'T'));
  if (isNaN(d)) return s;
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function nowInput() {
  const d = new Date(); const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function todayStr() { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; }
function elapsed(from) {
  if (!from) return '';
  const ms = Date.now() - new Date(from.includes('T') ? from : from.replace(' ', 'T')).getTime();
  if (ms < 0) return '';
  const hrs = Math.floor(ms / 3600000), mins = Math.floor((ms % 3600000) / 60000);
  return hrs > 0 ? `${hrs}h${String(mins).padStart(2, '0')}` : `${mins} phút`;
}

/* ============ API ============ */
async function api(method, path, body) {
  const opt = { method, headers: {} };
  if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
  const res = await fetch(path, opt);
  let data = {};
  try { data = await res.json(); } catch {}
  if (!res.ok) { const e = new Error(data.error || `Lỗi ${res.status}`); e.status = res.status; throw e; }
  return data;
}
const apiGet = (p) => api('GET', p);
const apiPost = (p, b) => api('POST', p, b || {});
const apiPut = (p, b) => api('PUT', p, b || {});
const apiDel = (p) => api('DELETE', p);

/* ============ Toast ============ */
function toast(msg, type = 'ok') {
  const ic = type === 'ok' ? 'check' : 'alert';
  const t = h(`<div class="toast ${type}"><span class="ti">${icon(ic)}</span><span>${esc(msg)}</span></div>`);
  $('#toasts').appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = '.3s'; setTimeout(() => t.remove(), 300); }, 2600);
}

/* ============ Modal ============ */
let _modalOnOk = null;
function modal({ title, body, okText = 'Lưu', onOk = null, size = '', hideFooter = false, okClass = 'primary' }) {
  _modalOnOk = onOk;
  const root = $('#modal-root');
  root.innerHTML = '';
  const footer = hideFooter ? '' : `<div class="mf">
      <button class="btn" id="m-cancel">Đóng</button>
      ${onOk ? `<button class="btn ${okClass}" id="m-ok">${esc(okText)}</button>` : ''}
    </div>`;
  const ov = h(`<div class="overlay"><div class="modal ${size}">
      <div class="mh"><h3>${esc(title)}</h3><button class="x" id="m-x">&times;</button></div>
      <div class="mb" id="m-body"></div>${footer}</div></div>`);
  ov.querySelector('#m-body').append(typeof body === 'string' ? h(`<div>${body}</div>`) : body);
  root.appendChild(ov);
  ov.addEventListener('mousedown', (e) => { if (e.target === ov) closeModal(); });
  $('#m-x').onclick = closeModal;
  if ($('#m-cancel')) $('#m-cancel').onclick = closeModal;
  if ($('#m-ok')) $('#m-ok').onclick = async () => {
    const btn = $('#m-ok'); btn.disabled = true;
    try { await _modalOnOk?.(); } catch (e) { toast(e.message, 'err'); btn.disabled = false; }
  };
  return ov;
}
function closeModal() { $('#modal-root').innerHTML = ''; _modalOnOk = null; }

function confirmBox(msg, onYes, { okText = 'Xác nhận', okClass = 'red' } = {}) {
  modal({ title: 'Xác nhận', size: 'sm', body: `<p>${esc(msg)}</p>`, okText, okClass, onOk: async () => { await onYes(); } });
}

/* ============ In hóa đơn nhiệt K58 / K80 ============ */
function printReceipt(data, paper = 'K80') {
  const { invoice, booking, items, settings, cashier } = data;
  const width = paper === 'K58' ? '58mm' : '80mm';
  const fs = paper === 'K58' ? '11px' : '12px';
  const line = () => '<div style="border-top:1px dashed #000;margin:5px 0"></div>';
  const rows = (items || []).map((it) =>
    `<tr><td>${esc(it.name)}<br><span style="color:#333">${it.qty} x ${money0(it.unit_price)}</span></td>
     <td style="text-align:right;vertical-align:top">${money0(it.amount)}</td></tr>`).join('');
  const typeLabel = { hourly: 'Theo giờ', overnight: 'Qua đêm', daily: 'Theo ngày' }[booking?.type] || '';
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(invoice.code)}</title>
  <style>
    @page{size:${width} auto;margin:2mm}
    *{font-family:'Courier New',monospace;font-size:${fs};color:#000}
    body{width:${width};margin:0 auto;padding:3px}
    h2{text-align:center;font-size:${paper === 'K58' ? '13px' : '15px'};margin:2px 0}
    .c{text-align:center} .r{text-align:right} .b{font-weight:bold}
    table{width:100%;border-collapse:collapse} td{padding:1px 0;vertical-align:top}
    .tot{font-size:${paper === 'K58' ? '13px' : '15px'};font-weight:bold}
  </style></head><body>
    <h2>${esc(settings.hotel_name || 'KHÁCH SẠN')}</h2>
    <div class="c">${esc(settings.address || '')}</div>
    <div class="c">ĐT: ${esc(settings.phone || '')}</div>
    ${line()}
    <div class="c b">HÓA ĐƠN THANH TOÁN</div>
    <div class="c">Số: ${esc(invoice.code)}</div>
    ${line()}
    <div>Phòng: <b>${esc(booking?.room_name || '')}</b> (${esc(booking?.type_name || '')})</div>
    <div>Hình thức: ${typeLabel}</div>
    <div>Khách: ${esc(booking?.customer_name || 'Khách lẻ')}</div>
    <div>Nhận: ${dtFull(booking?.check_in)}</div>
    <div>Trả: ${dtFull(booking?.check_out)}</div>
    <div>Thu ngân: ${esc(cashier || '')}</div>
    ${line()}
    <table>
      <tr class="b"><td>Tiền phòng</td><td class="r">${money0(invoice.room_charge)}</td></tr>
      ${rows ? `<tr><td colspan="2" class="b">Dịch vụ / Minibar:</td></tr>${rows}` : ''}
    </table>
    ${line()}
    <table>
      <tr><td>Tiền phòng:</td><td class="r">${money0(invoice.room_charge)}</td></tr>
      <tr><td>Dịch vụ:</td><td class="r">${money0(invoice.service_charge)}</td></tr>
      ${invoice.discount ? `<tr><td>Giảm giá:</td><td class="r">-${money0(invoice.discount)}</td></tr>` : ''}
      <tr class="tot"><td>TỔNG CỘNG:</td><td class="r">${money0(invoice.total)}</td></tr>
      ${invoice.deposit ? `<tr><td>Đã cọc:</td><td class="r">-${money0(invoice.deposit)}</td></tr>` : ''}
      <tr class="b"><td>Khách trả:</td><td class="r">${money0(invoice.paid)}</td></tr>
    </table>
    ${line()}
    <div class="c">${esc(settings.footer_note || 'Cảm ơn quý khách!')}</div>
    <div class="c" style="margin-top:4px">${new Date().toLocaleString('vi-VN')}</div>
    <script>window.onload=function(){window.print();setTimeout(function(){window.close()},400)}<\/script>
  </body></html>`;
  const w = window.open('', '_blank', 'width=380,height=640');
  if (!w) { toast('Trình duyệt chặn cửa sổ in. Hãy cho phép popup.', 'warn'); return; }
  w.document.write(html); w.document.close();
}
