'use strict';
/* ================= PHÂN QUYỀN & MENU ================= */
const ALL = ['owner', 'receptionist', 'staff'];
const OR = ['owner', 'receptionist'];
const O = ['owner'];
function can(...roles) { return roles.flat().includes(State.user?.role); }

const NAV = [
  { grp: 'Vận hành' },
  { key: 'dashboard', label: 'Tổng quan', ic: 'dashboard', roles: ALL },
  { key: 'rooms', label: 'Sơ đồ phòng', ic: 'bed', roles: ALL },
  { key: 'bookings', label: 'Phiếu thuê', ic: 'clipboard', roles: OR },
  { key: 'housekeeping', label: 'Dọn phòng', ic: 'sparkles', roles: ALL },
  { grp: 'Khách & Kho' },
  { key: 'customers', label: 'Khách hàng', ic: 'user', roles: OR },
  { key: 'groups', label: 'Khách đoàn', ic: 'users', roles: OR },
  { key: 'inventory', label: 'Minibar & Kho', ic: 'package', roles: ALL },
  { grp: 'Tài chính' },
  { key: 'invoices', label: 'Hóa đơn', ic: 'receipt', roles: OR },
  { key: 'cashflow', label: 'Thu chi', ic: 'wallet', roles: OR },
  { key: 'reports', label: 'Báo cáo', ic: 'chart', roles: OR },
  { grp: 'Quản trị' },
  { key: 'pricing', label: 'Hạng phòng & Giá', ic: 'tag', roles: O },
  { key: 'users', label: 'Người dùng', ic: 'key', roles: O },
  { key: 'audit', label: 'Nhật ký', ic: 'history', roles: O },
  { key: 'backup', label: 'Sao lưu', ic: 'database', roles: O },
  { key: 'settings', label: 'Cấu hình', ic: 'settings', roles: O },
];
const TITLES = Object.fromEntries(NAV.filter((n) => n.key).map((n) => [n.key, n.label]));
const CRUMBS = {}; { let g = ''; for (const n of NAV) { if (n.grp) g = n.grp; else CRUMBS[n.key] = g; } }
const STATUS_LABEL = { available: 'Trống', occupied: 'Đang ở', cleaning: 'Dọn dẹp', maintenance: 'Bảo trì' };
const TYPE_LABEL = { hourly: 'Theo giờ', overnight: 'Qua đêm', daily: 'Theo ngày' };
const BOOKING_STATUS = { active: ['Đang ở', 'blue'], checkedout: ['Đã trả', 'gray'], cancelled: ['Đã hủy', 'red'], reserved: ['Đặt trước', 'amber'] };

/* ================= KHỞI TẠO ================= */
async function init() {
  try {
    const me = await apiGet('/api/me');
    State.user = me.user;
    await enterApp();
  } catch { showLogin(); }
}
function showLogin() { $('#login').classList.remove('hidden'); $('#app').classList.add('hidden'); }

$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('#lg-btn'); btn.disabled = true; btn.textContent = 'Đang đăng nhập...';
  try {
    const r = await apiPost('/api/login', { username: $('#lg-user').value, password: $('#lg-pass').value });
    State.user = r.user;
    await enterApp();
  } catch (err) { toast(err.message, 'err'); }
  btn.disabled = false; btn.textContent = 'Đăng nhập';
});

async function enterApp() {
  $('#login').classList.add('hidden');
  $('#app').classList.remove('hidden');
  const u = State.user;
  $('#u-name').textContent = u.full_name;
  $('#u-role').textContent = u.role_label;
  $('#u-av').textContent = (u.full_name || 'U').charAt(0).toUpperCase();
  try { const s = await apiGet('/api/settings'); State.settings = s.settings; $('#brand-hotel').textContent = s.settings.hotel_name || 'Khách sạn'; } catch {}
  buildNav();
  if (!location.hash || !isAllowed(location.hash.slice(1))) location.hash = 'dashboard';
  route();
}
function isAllowed(key) { const n = NAV.find((x) => x.key === key); return n && can(n.roles); }

function buildNav() {
  const nav = $('#nav'); nav.innerHTML = '';
  for (let i = 0; i < NAV.length; i++) {
    const item = NAV[i];
    if (item.grp) {
      // chỉ hiện tiêu đề nhóm nếu có ít nhất 1 mục con mà vai trò hiện tại được xem
      let hasVisible = false;
      for (let j = i + 1; j < NAV.length && !NAV[j].grp; j++) { if (can(NAV[j].roles)) { hasVisible = true; break; } }
      if (hasVisible) nav.appendChild(h(`<div class="grp">${item.grp}</div>`));
      continue;
    }
    if (!can(item.roles)) continue;
    nav.appendChild(h(`<a href="#${item.key}" data-key="${item.key}" title="${item.label}">${icon(item.ic)}<span>${item.label}</span></a>`));
  }
}

$('#btn-logout').onclick = async () => { await apiPost('/api/logout'); State.user = null; location.hash = ''; showLogin(); };
$('#btn-refresh').onclick = () => route();
window.addEventListener('hashchange', route);

/* ================= ROUTER ================= */
const VIEWS = {};
async function route() {
  const key = location.hash.slice(1) || 'dashboard';
  if (!isAllowed(key)) { toast('Bạn không có quyền truy cập mục này', 'warn'); location.hash = 'dashboard'; return; }
  $$('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.key === key));
  $('#page-title').textContent = TITLES[key] || '';
  const cr = $('#page-crumb'); if (cr) cr.textContent = CRUMBS[key] || '';
  const view = $('#view'); view.innerHTML = '<div class="loading"><span class="spinner"></span> Đang tải…</div>';
  try {
    await (VIEWS[key] || (() => { view.innerHTML = '<div class="empty">Chưa có</div>'; }))(view);
    view.classList.remove('view-enter'); void view.offsetWidth; view.classList.add('view-enter');
  } catch (e) { view.innerHTML = `<div class="empty">Lỗi tải dữ liệu: ${esc(e.message)}</div>`; }
}

/* Thẻ KPI dùng chung */
function kpiCard(ic, color, lbl, val, hint, valCls = '') {
  return `<div class="kpi"><div class="kpi-ic ${color}">${icon(ic)}</div>
    <div class="kpi-body"><div class="lbl">${lbl}</div><div class="val ${valCls}">${val}</div><div class="hint">${hint}</div></div></div>`;
}

/* ============================================================
   DASHBOARD
============================================================ */
VIEWS.dashboard = async (view) => {
  const { dashboard: d } = await apiGet('/api/reports/dashboard');
  const r = d.rooms;
  view.innerHTML = `
    <div class="grid kpis">
      ${kpiCard('bed', 'teal', 'Công suất phòng', r.occupancy_pct + '%', `${r.occupied}/${r.total} phòng đang ở`)}
      ${kpiCard('wallet', 'green', 'Doanh thu hôm nay', money(d.today.income), `Chi: ${money(d.today.expense)} · Ròng: ${money(d.today.net)}`, 'money')}
      ${kpiCard('key', 'blue', 'Khách đang lưu trú', d.in_house, `Nhận: ${d.today.checkins} · Trả: ${d.today.checkouts}`)}
      ${kpiCard('sparkles', 'amber', 'Phòng cần dọn', d.dirty_rooms, `Trống: ${r.available} · Bảo trì: ${r.maintenance}`)}
    </div>
    <div class="grid" style="grid-template-columns:1.5fr 1fr;margin-top:16px" id="dash-cols">
      <div class="card"><div class="hd">Trạng thái phòng <a href="#rooms" class="btn sm">Mở sơ đồ</a></div>
        <div class="bd" id="dash-rooms"></div></div>
      <div class="card"><div class="hd">Sản phẩm sắp hết</div><div class="bd" id="dash-low"></div></div>
    </div>`;
  // mini room grid
  const { rooms } = await apiGet('/api/rooms');
  $('#dash-rooms').innerHTML = `<div style="display:flex;gap:8px;flex-wrap:wrap">` + rooms.map((rm) =>
    `<div title="${STATUS_LABEL[rm.status]}" style="width:64px;height:56px;border-radius:8px;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;font-weight:700;font-size:13px;background:${roomColor(rm.status)}">
      ${esc(rm.name)}<span style="font-size:10px;font-weight:500;opacity:.9">${STATUS_LABEL[rm.status]}</span></div>`).join('') + `</div>`;
  $('#dash-low').innerHTML = d.low_stock.length ?
    d.low_stock.map((p) => `<div class="summary-line"><span>${esc(p.name)}</span><b class="${p.stock <= 2 ? 'money-neg' : ''}">Còn ${p.stock}</b></div>`).join('')
    : '<div class="empty" style="padding:16px">Tồn kho ổn định 👍</div>';
};
function roomColor(s) { return { available: '#16a34a', occupied: '#2563eb', cleaning: '#f59e0b', maintenance: '#64748b' }[s]; }

/* ============================================================
   SƠ ĐỒ PHÒNG
============================================================ */
const RICO = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M2 4v16'/%3E%3Cpath d='M2 8h18a2 2 0 0 1 2 2v10'/%3E%3Cpath d='M2 17h20'/%3E%3Cpath d='M6 8v9'/%3E%3C/svg%3E\")";
VIEWS.rooms = async (view) => {
  const { rooms } = await apiGet('/api/rooms');
  State.rooms = rooms;
  const legend = Object.entries(STATUS_LABEL).map(([k, v]) =>
    `<span class="li"><span class="dot" style="background:${roomColor(k)}"></span>${v}</span>`).join('');
  view.innerHTML = `<div class="legend">${legend}</div><div class="rooms-grid" id="rg"></div>`;
  const rg = $('#rg');
  rooms.forEach((rm) => {
    const b = rm.booking;
    let info = '';
    if (rm.status === 'occupied' && b) {
      info = `<div class="rinfo"><b>${esc(b.customer_name || 'Khách lẻ')}</b><br>${TYPE_LABEL[b.type]} · ${money0(rateOf(rm, b.type))}đ
        <br><span class="rtimer">${icon('clock')} ${elapsed(b.check_in)}</span></div>`;
    } else if (rm.status === 'available') {
      info = `<div class="rinfo">Giá ngày: <b>${money0(rm.daily_rate)}đ</b><br>Giờ đầu: ${money0(rm.hourly_first)}đ</div>`;
    } else if (rm.status === 'cleaning') {
      info = `<div class="rinfo">Đang chờ dọn dẹp…</div>`;
    } else { info = `<div class="rinfo">Đang bảo trì</div>`; }
    const card = h(`<div class="room ${rm.status}" style="--rico:${RICO}">
      <div class="r-top">
        <div><div class="rname">${esc(rm.name)}</div><div class="rtype">${esc(rm.type_name)} · Tầng ${rm.floor}</div></div>
      </div>
      ${info}
      <div class="r-foot"><span class="rstatus"><span class="sd"></span>${STATUS_LABEL[rm.status]}</span></div></div>`);
    card.onclick = () => onRoomClick(rm);
    rg.appendChild(card);
  });
};
function rateOf(rm, type) { return type === 'hourly' ? rm.hourly_first : type === 'overnight' ? rm.overnight_rate : rm.daily_rate; }

function onRoomClick(rm) {
  if (rm.status === 'available') return openCheckin(rm);
  if (rm.status === 'occupied' && rm.booking) return openBookingDetail(rm.booking.id);
  if (rm.status === 'cleaning') return openCleaning(rm);
  if (rm.status === 'maintenance') {
    if (!can(OR)) return toast('Chỉ Chủ/Lễ tân thao tác', 'warn');
    return confirmBox(`Đưa phòng ${rm.name} trở lại sẵn sàng?`, async () => {
      await apiPut(`/api/rooms/${rm.id}/status`, { status: 'available' }); closeModal(); toast('Đã cập nhật'); route();
    }, { okText: 'Đồng ý', okClass: 'primary' });
  }
}

/* ------ NHẬN PHÒNG ------ */
async function openCheckin(rm) {
  if (!can(OR)) return toast('Chỉ Chủ/Lễ tân được nhận phòng', 'warn');
  let groups = []; try { groups = (await apiGet('/api/groups')).groups; } catch {}
  const body = h(`<div>
    <div style="background:var(--brand-50);border:1px solid var(--brand-100);padding:12px 14px;border-radius:12px;margin-bottom:16px;font-size:13px">
      <b>Phòng ${esc(rm.name)}</b> — ${esc(rm.type_name)} (Tầng ${rm.floor})<br>
      Giờ đầu ${money(rm.hourly_first)}, giờ tiếp ${money(rm.hourly_next)} · Qua đêm ${money(rm.overnight_rate)} · Ngày ${money(rm.daily_rate)}
    </div>
    <div class="field"><label>Hình thức thuê</label>
      <div class="pill-tabs" id="ck-type">
        <button type="button" data-v="hourly" class="active">Theo giờ</button>
        <button type="button" data-v="overnight">Qua đêm</button>
        <button type="button" data-v="daily">Theo ngày</button>
      </div></div>
    <div class="row2">
      <div class="field"><label>Tên khách</label><input id="ck-name" placeholder="Khách lẻ"></div>
      <div class="field"><label>Số điện thoại</label><input id="ck-phone" placeholder="09..."></div>
    </div>
    <div class="row2">
      <div class="field"><label>CMND/CCCD</label><input id="ck-cccd"></div>
      <div class="field"><label>Đoàn khách (nếu có)</label><select id="ck-group"><option value="">— Không —</option>
        ${groups.map((g) => `<option value="${g.id}">${esc(g.name)}</option>`).join('')}</select></div>
    </div>
    <div class="row2">
      <div class="field"><label>Giờ nhận phòng</label><input type="datetime-local" id="ck-in" value="${nowInput()}"></div>
      <div class="field"><label>Dự kiến trả</label><input type="datetime-local" id="ck-out"></div>
    </div>
    <div class="row2">
      <div class="field"><label>Tiền cọc</label><input type="number" id="ck-dep" value="0" min="0" step="10000"></div>
      <div class="field"><label>Ghi chú</label><input id="ck-note"></div>
    </div>
  </div>`);
  body.querySelectorAll('#ck-type button').forEach((b) => b.onclick = () => {
    body.querySelectorAll('#ck-type button').forEach((x) => x.classList.remove('active')); b.classList.add('active');
  });
  modal({
    title: `Nhận phòng ${rm.name}`, body, okText: 'Nhận phòng', okClass: 'green',
    onOk: async () => {
      const type = body.querySelector('#ck-type button.active').dataset.v;
      const payload = {
        room_id: rm.id, type,
        customer_name: body.querySelector('#ck-name').value.trim() || 'Khách lẻ',
        customer_phone: body.querySelector('#ck-phone').value.trim(),
        customer_id_card: body.querySelector('#ck-cccd').value.trim(),
        group_id: body.querySelector('#ck-group').value || null,
        check_in: body.querySelector('#ck-in').value || undefined,
        expected_check_out: body.querySelector('#ck-out').value || undefined,
        deposit: Number(body.querySelector('#ck-dep').value) || 0,
        note: body.querySelector('#ck-note').value.trim(),
      };
      const r = await apiPost('/api/bookings', payload);
      closeModal(); toast(`Đã nhận phòng ${rm.name} (${r.code})`); route();
    }
  });
}

/* ------ CHI TIẾT PHÒNG ĐANG Ở ------ */
async function openBookingDetail(id) {
  const data = await apiGet(`/api/bookings/${id}`);
  const b = data.booking, items = data.items, est = data.estimate;
  if (!State.products.length) { try { State.products = (await apiGet('/api/products')).products; } catch {} }
  const roomCharge = est.room.amount, svc = est.service_charge;
  const gross = roomCharge + svc, remaining = gross - (b.deposit || 0);
  const itemRows = items.length ? items.map((it) => `<tr><td>${esc(it.name)}</td><td class="center">${it.qty}</td>
      <td class="right">${money(it.unit_price)}</td><td class="right">${money(it.amount)}</td>
      <td class="center">${can(OR) ? `<button class="btn sm red" data-del="${it.id}">×</button>` : ''}</td></tr>`).join('')
    : `<tr><td colspan="5" class="empty" style="padding:14px">Chưa có dịch vụ</td></tr>`;
  const prodOpts = State.products.map((p) => `<option value="${p.id}">${esc(p.name)} — ${money(p.price)}${p.track_stock ? ` (tồn ${p.stock})` : ''}</option>`).join('');

  const body = h(`<div>
    <div class="row2" style="margin-bottom:12px">
      <div><div class="hint">Khách hàng</div><b>${esc(b.customer_name || 'Khách lẻ')}</b> ${b.customer_phone ? '· ' + esc(b.customer_phone) : ''}
        ${b.group_name ? `<br><span class="badge blue">Đoàn: ${esc(b.group_name)}</span>` : ''}</div>
      <div><div class="hint">Hình thức</div><b>${TYPE_LABEL[b.type]}</b> · Mã ${esc(b.code)}</div>
    </div>
    <div class="row3" style="margin-bottom:12px">
      <div><div class="hint">Nhận phòng</div>${dtFull(b.check_in)}</div>
      <div><div class="hint">Dự kiến trả</div>${b.expected_check_out ? dtFull(b.expected_check_out) : '—'}</div>
      <div><div class="hint">Thời gian ở</div><b>${elapsed(b.check_in)}</b></div>
    </div>
    <div class="section-title">Dịch vụ & Minibar</div>
    <table class="tbl"><thead><tr><th>Tên</th><th class="center">SL</th><th class="right">Đơn giá</th><th class="right">T.Tiền</th><th></th></tr></thead>
      <tbody id="bi-body">${itemRows}</tbody></table>
    <div style="display:flex;gap:8px;margin-top:10px;align-items:end">
      <div class="field" style="flex:1;margin:0"><label>Thêm dịch vụ/minibar</label><select id="bi-prod">${prodOpts}</select></div>
      <div class="field" style="width:80px;margin:0"><label>SL</label><input type="number" id="bi-qty" value="1" min="1"></div>
      <button class="btn primary" id="bi-add">+ Thêm</button>
    </div>
    <div class="card" style="margin-top:16px"><div class="bd">
      <div class="summary-line"><span>Tiền phòng (${TYPE_LABEL[b.type]})</span><b>${money(roomCharge)}</b></div>
      <div class="hint" style="margin:-2px 0 6px">${esc(est.room.detail)}</div>
      <div class="summary-line"><span>Dịch vụ</span><b>${money(svc)}</b></div>
      <div class="summary-line"><span>Tiền cọc đã thu</span><b>-${money(b.deposit || 0)}</b></div>
      <div class="summary-line total"><span>Còn phải thu (tạm tính)</span><span>${money(Math.max(0, remaining))}</span></div>
    </div></div>
  </div>`);

  // gắn sự kiện
  body.querySelector('#bi-add').onclick = async () => {
    try {
      await apiPost(`/api/bookings/${id}/items`, { product_id: Number(body.querySelector('#bi-prod').value), qty: Number(body.querySelector('#bi-qty').value) || 1 });
      State.products = (await apiGet('/api/products')).products;
      toast('Đã thêm dịch vụ'); openBookingDetail(id);
    } catch (e) { toast(e.message, 'err'); }
  };
  body.querySelectorAll('[data-del]').forEach((btn) => btn.onclick = async () => {
    await apiDel(`/api/bookings/${id}/items/${btn.dataset.del}`); toast('Đã xóa'); openBookingDetail(id);
  });

  const footer = h(`<div style="display:flex;gap:8px;width:100%;flex-wrap:wrap">
    ${can(OR) ? `<button class="btn amber" id="d-extend">${icon('clock')} Gia hạn</button>
    <button class="btn blue" id="d-change">${icon('swap')} Đổi phòng</button>
    <button class="btn" id="d-cancel">Hủy phiếu</button>
    <div style="flex:1"></div>
    <button class="btn green" id="d-checkout">${icon('card')} Trả phòng & Thanh toán</button>` : '<div class="hint">Bạn chỉ có quyền thêm dịch vụ.</div>'}
  </div>`);

  modal({ title: `Phòng ${b.room_name} — Đang ở`, body, size: 'lg', hideFooter: true });
  $('.modal .mb').after(h(`<div class="mf" id="d-footer"></div>`));
  $('#d-footer').appendChild(footer);
  if (can(OR)) {
    $('#d-extend').onclick = () => openExtend(b);
    $('#d-change').onclick = () => openChangeRoom(b);
    $('#d-checkout').onclick = () => openCheckout(id);
    $('#d-cancel').onclick = () => confirmBox(`Hủy phiếu thuê phòng ${b.room_name}? (không tính tiền)`, async () => {
      await apiPost(`/api/bookings/${id}/cancel`); closeModal(); toast('Đã hủy phiếu'); route();
    });
  }
}

function openExtend(b) {
  const body = h(`<div><div class="field"><label>Thời gian trả phòng dự kiến mới</label>
    <input type="datetime-local" id="ex-out" value="${b.expected_check_out ? String(b.expected_check_out).replace(' ', 'T').slice(0, 16) : nowInput()}"></div>
    <div class="hint">Tiền phòng sẽ được tính lại theo thời gian thực tế khi trả phòng.</div></div>`);
  modal({ title: 'Gia hạn thời gian ở', size: 'sm', body, okText: 'Lưu', onOk: async () => {
    await apiPost(`/api/bookings/${b.id}/extend`, { expected_check_out: body.querySelector('#ex-out').value });
    toast('Đã gia hạn'); openBookingDetail(b.id);
  } });
}

async function openChangeRoom(b) {
  const { rooms } = await apiGet('/api/rooms');
  const avail = rooms.filter((r) => r.status === 'available');
  if (!avail.length) return toast('Không còn phòng trống để đổi', 'warn');
  const body = h(`<div><div class="field"><label>Chọn phòng mới</label><select id="cr-room">
    ${avail.map((r) => `<option value="${r.id}">${esc(r.name)} — ${esc(r.type_name)} (Ngày ${money0(r.daily_rate)})</option>`).join('')}
    </select></div><div class="hint">Phòng cũ sẽ chuyển sang trạng thái dọn dẹp.</div></div>`);
  modal({ title: `Đổi phòng (đang ở ${b.room_name})`, size: 'sm', body, okText: 'Đổi phòng', okClass: 'blue', onOk: async () => {
    await apiPost(`/api/bookings/${b.id}/change-room`, { room_id: Number(body.querySelector('#cr-room').value) });
    closeModal(); toast('Đã đổi phòng'); route();
  } });
}

/* ------ TRẢ PHÒNG & THANH TOÁN ------ */
async function openCheckout(id) {
  const data = await apiGet(`/api/bookings/${id}`);
  const b = data.booking, est = data.estimate;
  const roomCharge = est.room.amount, svc = est.service_charge;
  const gross = roomCharge + svc;
  const body = h(`<div>
    <div class="card"><div class="bd">
      <div class="summary-line"><span>Tiền phòng</span><b>${money(roomCharge)}</b></div>
      <div class="summary-line"><span>Dịch vụ / minibar</span><b>${money(svc)}</b></div>
      <div class="field" style="margin:8px 0"><label>Giảm giá</label><input type="number" id="co-disc" value="0" min="0" step="10000"></div>
      <div class="summary-line"><span>Tiền cọc đã thu</span><b>-${money(b.deposit || 0)}</b></div>
      <div class="summary-line total"><span>Khách cần trả</span><span id="co-remain">${money(Math.max(0, gross - (b.deposit || 0)))}</span></div>
    </div></div>
    <div class="row2" style="margin-top:12px">
      <div class="field"><label>Khách thanh toán</label><input type="number" id="co-paid" value="${Math.max(0, gross - (b.deposit || 0))}"></div>
      <div class="field"><label>Hình thức</label><select id="co-method">
        <option value="cash">Tiền mặt</option><option value="transfer">Chuyển khoản</option><option value="card">Thẻ</option></select></div>
    </div>
    <label class="field" style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="co-print" checked style="width:auto"> In hóa đơn sau khi thanh toán</label>
    <div class="pill-tabs" id="co-paper"><button type="button" data-v="K80" class="active">Khổ K80</button><button type="button" data-v="K58">Khổ K58</button></div>
  </div>`);
  const recalc = () => {
    const disc = Number(body.querySelector('#co-disc').value) || 0;
    const remain = Math.max(0, gross - disc - (b.deposit || 0));
    body.querySelector('#co-remain').textContent = money(remain);
    body.querySelector('#co-paid').value = remain;
  };
  body.querySelector('#co-disc').oninput = recalc;
  body.querySelectorAll('#co-paper button').forEach((btn) => btn.onclick = () => {
    body.querySelectorAll('#co-paper button').forEach((x) => x.classList.remove('active')); btn.classList.add('active');
  });
  modal({ title: `Thanh toán & trả phòng ${b.room_name}`, body, okText: 'Xác nhận thanh toán', okClass: 'green', onOk: async () => {
    const r = await apiPost(`/api/bookings/${id}/checkout`, {
      discount: Number(body.querySelector('#co-disc').value) || 0,
      paid: Number(body.querySelector('#co-paid').value) || 0,
      method: body.querySelector('#co-method').value,
    });
    const doPrint = body.querySelector('#co-print').checked;
    const paper = body.querySelector('#co-paper button.active').dataset.v;
    closeModal(); toast(`Đã thanh toán ${r.invoice_code}`); route();
    if (doPrint) { const inv = await apiGet(`/api/invoices/${r.invoice_id}`); printReceipt(inv, paper); }
  } });
}

/* ------ DỌN PHÒNG (click phòng cleaning) ------ */
async function openCleaning(rm) {
  const body = h(`<div><p>Phòng <b>${esc(rm.name)}</b> đang chờ dọn dẹp.</p>
    <div class="field" style="margin-top:10px"><label>Ghi chú</label><input id="cl-note" placeholder="Tình trạng phòng..."></div></div>`);
  modal({ title: `Dọn phòng ${rm.name}`, size: 'sm', body, okText: '✓ Hoàn tất dọn phòng', okClass: 'green', onOk: async () => {
    const { tasks } = await apiGet('/api/housekeeping');
    const task = tasks.find((t) => t.room_id === rm.id);
    if (task) await apiPut(`/api/housekeeping/${task.id}`, { status: 'clean', note: body.querySelector('#cl-note').value });
    else if (can(OR)) await apiPut(`/api/rooms/${rm.id}/status`, { status: 'available' });
    closeModal(); toast('Phòng đã sẵn sàng'); route();
  } });
}

/* ============================================================
   PHIẾU THUÊ (lịch sử)
============================================================ */
VIEWS.bookings = async (view) => {
  view.innerHTML = `<div class="toolbar">
      <select id="bk-status" class="btn"><option value="">Tất cả trạng thái</option>
        <option value="active">Đang ở</option><option value="checkedout">Đã trả</option><option value="cancelled">Đã hủy</option></select>
      <input type="date" id="bk-from" class="btn"><span>→</span><input type="date" id="bk-to" class="btn">
      <button class="btn primary" id="bk-go">Lọc</button></div>
    <div class="card"><div class="bd" style="padding:0" id="bk-list"></div></div>`;
  const load = async () => {
    const q = new URLSearchParams();
    if ($('#bk-status').value) q.set('status', $('#bk-status').value);
    if ($('#bk-from').value) q.set('from', $('#bk-from').value);
    if ($('#bk-to').value) q.set('to', $('#bk-to').value);
    const { bookings } = await apiGet('/api/bookings?' + q);
    $('#bk-list').innerHTML = bookings.length ? `<table class="tbl"><thead><tr>
        <th>Mã</th><th>Phòng</th><th>Khách</th><th>Loại</th><th>Nhận</th><th>Trả</th><th class="right">Tiền phòng</th><th>Trạng thái</th></tr></thead>
      <tbody>${bookings.map((b) => `<tr>
        <td><b>${esc(b.code)}</b></td><td>${esc(b.room_name)}</td><td>${esc(b.customer_name || 'Khách lẻ')}</td>
        <td>${TYPE_LABEL[b.type]}</td><td>${dt(b.check_in)}</td><td>${dt(b.check_out)}</td>
        <td class="right">${money(b.room_charge)}</td>
        <td><span class="badge ${BOOKING_STATUS[b.status][1]}">${BOOKING_STATUS[b.status][0]}</span></td></tr>`).join('')}</tbody></table>`
      : '<div class="empty">Không có phiếu thuê</div>';
  };
  $('#bk-go').onclick = load; await load();
};

/* ============================================================
   DỌN PHÒNG
============================================================ */
VIEWS.housekeeping = async (view) => {
  const [{ tasks }, staff] = await Promise.all([apiGet('/api/housekeeping'), loadStaff()]);
  view.innerHTML = `<div class="card"><div class="hd">Công việc dọn phòng</div><div class="bd" style="padding:0">
    ${tasks.length ? `<table class="tbl"><thead><tr><th>Phòng</th><th>Trạng thái</th><th>Nhân viên</th><th>Ghi chú</th><th>Cập nhật</th><th></th></tr></thead>
    <tbody>${tasks.map((t) => `<tr>
      <td><b>${esc(t.room_name)}</b></td>
      <td><span class="badge ${t.status === 'dirty' ? 'red' : 'amber'}">${t.status === 'dirty' ? 'Cần dọn' : 'Đang dọn'}</span></td>
      <td>${esc(t.assignee_name || '—')}</td><td>${esc(t.note || '')}</td><td>${dt(t.updated_at)}</td>
      <td class="right">
        ${t.status === 'dirty' ? `<button class="btn sm amber" data-clean="${t.id}" data-st="cleaning">Bắt đầu dọn</button>` : ''}
        <button class="btn sm green" data-clean="${t.id}" data-st="clean">✓ Xong</button>
      </td></tr>`).join('')}</tbody></table>` : '<div class="empty">Không có phòng cần dọn 🎉</div>'}
  </div></div>`;
  view.querySelectorAll('[data-clean]').forEach((btn) => btn.onclick = async () => {
    await apiPut(`/api/housekeeping/${btn.dataset.clean}`, { status: btn.dataset.st });
    toast(btn.dataset.st === 'clean' ? 'Phòng đã sẵn sàng' : 'Đang dọn'); route();
  });
};
async function loadStaff() { try { return (await apiGet('/api/users')).users; } catch { return []; } }

/* ============================================================
   KHÁCH HÀNG
============================================================ */
VIEWS.customers = async (view) => {
  view.innerHTML = `<div class="toolbar"><input id="cs-q" class="btn" placeholder="🔍 Tìm tên / SĐT / CCCD" style="min-width:260px">
    <div class="sp"></div><button class="btn primary" id="cs-add">${icon('plus')} Thêm khách hàng</button></div>
    <div class="card"><div class="bd" style="padding:0" id="cs-list"></div></div>`;
  const load = async () => {
    const { customers } = await apiGet('/api/customers?q=' + encodeURIComponent($('#cs-q').value));
    $('#cs-list').innerHTML = customers.length ? `<table class="tbl"><thead><tr><th>Tên</th><th>SĐT</th><th>CCCD</th><th>Địa chỉ</th><th class="center">Lượt thuê</th><th></th></tr></thead>
      <tbody>${customers.map((c) => `<tr><td><b>${esc(c.name)}</b></td><td>${esc(c.phone)}</td><td>${esc(c.id_card)}</td>
        <td>${esc(c.address)}</td><td class="center">${c.visits}</td>
        <td class="right"><button class="btn sm" data-edit='${encodeURIComponent(JSON.stringify(c))}'>Sửa</button>
          ${can(O) ? ` <button class="btn sm red" data-del="${c.id}" data-name="${esc(c.name)}">${icon('trash')}</button>` : ''}</td></tr>`).join('')}</tbody></table>`
      : '<div class="empty">Chưa có khách hàng</div>';
    $$('#cs-list [data-edit]').forEach((b) => b.onclick = () => custForm(JSON.parse(decodeURIComponent(b.dataset.edit))));
    $$('#cs-list [data-del]').forEach((b) => b.onclick = () => confirmBox(`Xoá khách hàng "${b.dataset.name}"?`, async () => {
      await apiDel(`/api/customers/${b.dataset.del}`); closeModal(); toast('Đã xoá'); window._reloadCust?.();
    }));
  };
  let tmr; $('#cs-q').oninput = () => { clearTimeout(tmr); tmr = setTimeout(load, 300); };
  $('#cs-add').onclick = () => custForm(null);
  window._reloadCust = load; await load();
};
function custForm(c) {
  const body = h(`<div>
    <div class="field"><label>Tên khách *</label><input id="c-name" value="${esc(c?.name || '')}"></div>
    <div class="row2"><div class="field"><label>SĐT</label><input id="c-phone" value="${esc(c?.phone || '')}"></div>
      <div class="field"><label>CMND/CCCD</label><input id="c-cccd" value="${esc(c?.id_card || '')}"></div></div>
    <div class="field"><label>Địa chỉ</label><input id="c-addr" value="${esc(c?.address || '')}"></div>
    <div class="field"><label>Ghi chú</label><input id="c-note" value="${esc(c?.note || '')}"></div></div>`);
  modal({ title: c ? 'Sửa khách hàng' : 'Thêm khách hàng', body, onOk: async () => {
    const payload = { name: body.querySelector('#c-name').value.trim(), phone: body.querySelector('#c-phone').value.trim(),
      id_card: body.querySelector('#c-cccd').value.trim(), address: body.querySelector('#c-addr').value.trim(), note: body.querySelector('#c-note').value.trim() };
    if (!payload.name) throw new Error('Vui lòng nhập tên khách');
    if (c) await apiPut(`/api/customers/${c.id}`, payload); else await apiPost('/api/customers', payload);
    closeModal(); toast('Đã lưu'); window._reloadCust?.();
  } });
}

/* ============================================================
   KHÁCH ĐOÀN
============================================================ */
VIEWS.groups = async (view) => {
  const { groups } = await apiGet('/api/groups');
  view.innerHTML = `<div class="toolbar"><div class="sp"></div><button class="btn primary" id="g-add">${icon('plus')} Tạo đoàn</button></div>
    <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(260px,1fr))">
    ${groups.length ? groups.map((g) => `<div class="card"><div class="bd">
      <div style="font-weight:700;font-size:15px">👥 ${esc(g.name)}</div>
      <div class="hint" style="margin:4px 0">Trưởng đoàn: ${esc(g.leader_name || '—')}</div>
      <div class="summary-line"><span>Số phòng đã gán</span><b>${g.room_count}</b></div>
      ${g.note ? `<div class="hint">${esc(g.note)}</div>` : ''}
      <button class="btn sm block" style="margin-top:8px" data-view="${g.id}">Xem chi tiết</button></div></div>`).join('')
      : '<div class="empty">Chưa có đoàn khách</div>'}</div>`;
  $('#g-add').onclick = () => groupForm();
  view.querySelectorAll('[data-view]').forEach((b) => b.onclick = () => groupDetail(b.dataset.view));
};
async function groupForm() {
  const { customers } = await apiGet('/api/customers');
  const body = h(`<div><div class="field"><label>Tên đoàn *</label><input id="g-name" placeholder="VD: Đoàn công ty ABC"></div>
    <div class="field"><label>Trưởng đoàn</label><select id="g-leader"><option value="">— Chọn —</option>
      ${customers.map((c) => `<option value="${c.id}">${esc(c.name)} ${c.phone ? '(' + esc(c.phone) + ')' : ''}</option>`).join('')}</select></div>
    <div class="field"><label>Ghi chú</label><input id="g-note"></div></div>`);
  modal({ title: 'Tạo đoàn khách', body, onOk: async () => {
    const name = body.querySelector('#g-name').value.trim(); if (!name) throw new Error('Nhập tên đoàn');
    await apiPost('/api/groups', { name, leader_customer_id: body.querySelector('#g-leader').value || null, note: body.querySelector('#g-note').value.trim() });
    closeModal(); toast('Đã tạo đoàn'); route();
  } });
}
async function groupDetail(id) {
  const { group, bookings } = await apiGet(`/api/groups/${id}`);
  const body = h(`<div><div class="hint">Các phòng thuộc đoàn này:</div>
    ${bookings.length ? `<table class="tbl"><thead><tr><th>Mã</th><th>Phòng</th><th>Loại</th><th>Nhận</th><th>Trạng thái</th></tr></thead>
    <tbody>${bookings.map((b) => `<tr><td>${esc(b.code)}</td><td>${esc(b.room_name)}</td><td>${TYPE_LABEL[b.type]}</td>
      <td>${dt(b.check_in)}</td><td><span class="badge ${BOOKING_STATUS[b.status][1]}">${BOOKING_STATUS[b.status][0]}</span></td></tr>`).join('')}</tbody></table>`
    : '<div class="empty">Chưa có phòng nào gán vào đoàn. Khi nhận phòng, chọn đoàn này để gán.</div>'}</div>`);
  modal({ title: `Đoàn: ${group.name}`, body, size: 'lg', hideFooter: true });
}

/* ============================================================
   MINIBAR & KHO
============================================================ */
VIEWS.inventory = async (view) => {
  const { products } = await apiGet('/api/products');
  State.products = products;
  const render = (cat) => {
    const list = products.filter((p) => p.category === cat);
    return `<table class="tbl"><thead><tr><th>Tên</th><th class="right">Giá bán</th>${cat === 'minibar' ? '<th class="right">Giá vốn</th><th class="center">Tồn kho</th>' : ''}<th></th></tr></thead>
      <tbody>${list.map((p) => `<tr><td><b>${esc(p.name)}</b> ${p.sku ? `<span class="hint">${esc(p.sku)}</span>` : ''}</td>
        <td class="right">${money(p.price)}</td>
        ${cat === 'minibar' ? `<td class="right">${money(p.cost)}</td><td class="center"><span class="badge ${p.stock <= 5 ? 'red' : 'green'}">${p.stock}</span></td>` : ''}
        <td class="right">${can(O) ? `${cat === 'minibar' ? `<button class="btn sm blue" data-stock='${p.id}' data-name="${esc(p.name)}">+ Nhập</button> ` : ''}<button class="btn sm" data-edit='${encodeURIComponent(JSON.stringify(p))}'>Sửa</button> <button class="btn sm red" data-delp="${p.id}" data-pname="${esc(p.name)}">${icon('trash')}</button>` : ''}</td></tr>`).join('')}
      </tbody></table>`;
  };
  view.innerHTML = `<div class="toolbar">
      <div class="pill-tabs" id="inv-tabs" style="margin:0"><button class="active" data-c="minibar">Minibar (có tồn kho)</button><button data-c="service">Dịch vụ</button></div>
      <div class="sp"></div>${can(O) ? `<button class="btn primary" id="inv-add">${icon('plus')} Thêm sản phẩm</button>` : ''}
      ${can(O) ? `<button class="btn" id="inv-moves">${icon('history')} Lịch sử kho</button>` : ''}</div>
    <div class="card"><div class="bd" style="padding:0" id="inv-body">${render('minibar')}</div></div>`;
  const bind = () => {
    view.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => prodForm(JSON.parse(decodeURIComponent(b.dataset.edit))));
    view.querySelectorAll('[data-stock]').forEach((b) => b.onclick = () => stockForm(b.dataset.stock, b.dataset.name));
    view.querySelectorAll('[data-delp]').forEach((b) => b.onclick = () => confirmBox(`Xoá sản phẩm "${b.dataset.pname}"?`, async () => {
      const r = await apiDel(`/api/products/${b.dataset.delp}`); closeModal();
      toast(r.softDeleted ? 'Sản phẩm đã có lịch sử bán → đã chuyển sang ngưng dùng' : 'Đã xoá', r.softDeleted ? 'warn' : 'ok'); route();
    }));
  };
  view.querySelectorAll('#inv-tabs button').forEach((btn) => btn.onclick = () => {
    view.querySelectorAll('#inv-tabs button').forEach((x) => x.classList.remove('active')); btn.classList.add('active');
    $('#inv-body').innerHTML = render(btn.dataset.c); bind();
  });
  if ($('#inv-add')) $('#inv-add').onclick = () => prodForm(null);
  if ($('#inv-moves')) $('#inv-moves').onclick = stockMoves;
  bind();
};
function prodForm(p) {
  const body = h(`<div>
    <div class="row2"><div class="field"><label>Tên *</label><input id="p-name" value="${esc(p?.name || '')}"></div>
      <div class="field"><label>Mã SKU</label><input id="p-sku" value="${esc(p?.sku || '')}"></div></div>
    <div class="field"><label>Loại</label><select id="p-cat"><option value="minibar" ${p?.category === 'minibar' ? 'selected' : ''}>Minibar (có tồn kho)</option>
      <option value="service" ${p?.category === 'service' ? 'selected' : ''}>Dịch vụ (không tồn kho)</option></select></div>
    <div class="row3"><div class="field"><label>Giá bán</label><input type="number" id="p-price" value="${p?.price || 0}" step="1000"></div>
      <div class="field"><label>Giá vốn</label><input type="number" id="p-cost" value="${p?.cost || 0}" step="1000"></div>
      <div class="field"><label>Tồn kho ${p ? '(hiện tại)' : 'ban đầu'}</label><input type="number" id="p-stock" value="${p?.stock || 0}" ${p && !p.track_stock ? 'disabled' : ''}></div></div>
    ${p ? (p.track_stock
      ? '<div class="hint">Sửa trực tiếp số tồn để điều chỉnh — phần chênh lệch sẽ được ghi vào lịch sử kho. Hoặc dùng nút “+ Nhập” để nhập theo lô.</div>'
      : '<div class="hint">Dịch vụ không quản lý tồn kho.</div>') : ''}</div>`);
  modal({ title: p ? 'Sửa sản phẩm' : 'Thêm sản phẩm', body, onOk: async () => {
    const payload = { name: body.querySelector('#p-name').value.trim(), sku: body.querySelector('#p-sku').value.trim(),
      category: body.querySelector('#p-cat').value, price: Number(body.querySelector('#p-price').value) || 0,
      cost: Number(body.querySelector('#p-cost').value) || 0 };
    if (!payload.name) throw new Error('Nhập tên sản phẩm');
    if (p) {
      await apiPut(`/api/products/${p.id}`, payload);
      // Điều chỉnh tồn kho trực tiếp nếu thay đổi (ghi vào lịch sử kho)
      if (p.track_stock) {
        const newStock = Number(body.querySelector('#p-stock').value);
        if (Number.isFinite(newStock) && newStock !== p.stock) {
          await apiPost(`/api/products/${p.id}/stock`, { change: newStock - p.stock, reason: 'adjust', note: 'Điều chỉnh khi sửa sản phẩm' });
        }
      }
    } else { payload.stock = Number(body.querySelector('#p-stock').value) || 0; await apiPost('/api/products', payload); }
    closeModal(); toast('Đã lưu'); route();
  } });
}
function stockForm(id, name) {
  const body = h(`<div><p>Nhập kho: <b>${esc(name)}</b></p>
    <div class="row2" style="margin-top:10px"><div class="field"><label>Số lượng nhập thêm</label><input type="number" id="s-qty" value="10" min="1"></div>
    <div class="field"><label>Ghi chú</label><input id="s-note" placeholder="Nhập hàng..."></div></div>
    <label class="field" style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="s-exp" style="width:auto"> Ghi chi phí nhập hàng vào sổ thu chi</label></div>`);
  modal({ title: 'Nhập kho', size: 'sm', body, okText: 'Nhập kho', okClass: 'blue', onOk: async () => {
    await apiPost(`/api/products/${id}/stock`, { change: Number(body.querySelector('#s-qty').value) || 0, reason: 'import',
      note: body.querySelector('#s-note').value, record_expense: body.querySelector('#s-exp').checked });
    closeModal(); toast('Đã nhập kho'); route();
  } });
}
async function stockMoves() {
  const { moves } = await apiGet('/api/stock-moves');
  const body = h(`<div>${moves.length ? `<table class="tbl"><thead><tr><th>Thời gian</th><th>Sản phẩm</th><th class="center">Thay đổi</th><th>Lý do</th><th>NV</th></tr></thead>
    <tbody>${moves.map((m) => `<tr><td>${dt(m.created_at)}</td><td>${esc(m.product_name)}</td>
      <td class="center ${m.change > 0 ? 'money-pos' : 'money-neg'}">${m.change > 0 ? '+' : ''}${m.change}</td>
      <td>${esc(m.reason)}${m.ref ? ' · ' + esc(m.ref) : ''}</td><td>${esc(m.user_name || '')}</td></tr>`).join('')}</tbody></table>`
    : '<div class="empty">Chưa có giao dịch kho</div>'}</div>`);
  modal({ title: 'Lịch sử xuất/nhập kho', body, size: 'lg', hideFooter: true });
}

/* ============================================================
   HÓA ĐƠN
============================================================ */
VIEWS.invoices = async (view) => {
  view.innerHTML = `<div class="toolbar"><input type="date" id="iv-from" class="btn"><span>→</span><input type="date" id="iv-to" class="btn">
    <button class="btn primary" id="iv-go">Lọc</button></div><div class="card"><div class="bd" style="padding:0" id="iv-list"></div></div>`;
  const load = async () => {
    const q = new URLSearchParams();
    if ($('#iv-from').value) q.set('from', $('#iv-from').value);
    if ($('#iv-to').value) q.set('to', $('#iv-to').value);
    const { invoices } = await apiGet('/api/invoices?' + q);
    $('#iv-list').innerHTML = invoices.length ? `<table class="tbl"><thead><tr><th>Mã HĐ</th><th>Phòng</th><th>Khách</th><th>Thời gian</th>
      <th class="right">Tổng</th><th class="right">Đã trả</th><th>Trạng thái</th><th></th></tr></thead>
      <tbody>${invoices.map((i) => `<tr><td><b>${esc(i.code)}</b></td><td>${esc(i.room_name || '')}</td><td>${esc(i.customer_name || 'Khách lẻ')}</td>
        <td>${dt(i.created_at)}</td><td class="right">${money(i.total)}</td><td class="right">${money(i.paid)}</td>
        <td><span class="badge ${i.status === 'paid' ? 'green' : i.status === 'partial' ? 'amber' : 'red'}">${i.status === 'paid' ? 'Đã trả' : i.status === 'partial' ? 'Một phần' : 'Chưa trả'}</span></td>
        <td class="right"><button class="btn sm" data-inv="${i.id}">Xem / In</button></td></tr>`).join('')}</tbody></table>`
      : '<div class="empty">Chưa có hóa đơn</div>';
    $$('#iv-list [data-inv]').forEach((b) => b.onclick = () => invoiceDetail(b.dataset.inv));
  };
  $('#iv-go').onclick = load; await load();
};
async function invoiceDetail(id) {
  const data = await apiGet(`/api/invoices/${id}`);
  const i = data.invoice, b = data.booking, items = data.items;
  const body = h(`<div>
    <div class="row2"><div><div class="hint">Mã hóa đơn</div><b>${esc(i.code)}</b></div>
      <div><div class="hint">Phòng</div><b>${esc(b?.room_name || '')}</b> (${esc(b?.type_name || '')})</div></div>
    <div class="row2" style="margin:10px 0"><div><div class="hint">Khách</div>${esc(b?.customer_name || 'Khách lẻ')}</div>
      <div><div class="hint">Thu ngân</div>${esc(data.cashier)}</div></div>
    ${items.length ? `<table class="tbl"><thead><tr><th>Dịch vụ</th><th class="center">SL</th><th class="right">T.Tiền</th></tr></thead>
      <tbody>${items.map((it) => `<tr><td>${esc(it.name)}</td><td class="center">${it.qty}</td><td class="right">${money(it.amount)}</td></tr>`).join('')}</tbody></table>` : ''}
    <div class="card" style="margin-top:12px"><div class="bd">
      <div class="summary-line"><span>Tiền phòng</span><b>${money(i.room_charge)}</b></div>
      <div class="summary-line"><span>Dịch vụ</span><b>${money(i.service_charge)}</b></div>
      ${i.discount ? `<div class="summary-line"><span>Giảm giá</span><b>-${money(i.discount)}</b></div>` : ''}
      <div class="summary-line total"><span>Tổng cộng</span><span>${money(i.total)}</span></div>
      ${i.deposit ? `<div class="summary-line"><span>Đã cọc</span><b>-${money(i.deposit)}</b></div>` : ''}
      <div class="summary-line"><span>Khách trả (${i.method})</span><b>${money(i.paid)}</b></div>
    </div></div></div>`);
  modal({ title: 'Chi tiết hóa đơn', body, size: 'lg', hideFooter: true });
  $('.modal .mb').after(h(`<div class="mf"><button class="btn" id="pr58">${icon('printer')} In K58</button><button class="btn primary" id="pr80">${icon('printer')} In K80</button></div>`));
  $('#pr58').onclick = () => printReceipt(data, 'K58');
  $('#pr80').onclick = () => printReceipt(data, 'K80');
}

/* ============================================================
   THU CHI
============================================================ */
VIEWS.cashflow = async (view) => {
  view.innerHTML = `<div class="toolbar">
      <input type="date" id="cf-from" class="btn" value="${todayStr()}"><span>→</span><input type="date" id="cf-to" class="btn" value="${todayStr()}">
      <select id="cf-type" class="btn"><option value="">Thu & Chi</option><option value="income">Chỉ Thu</option><option value="expense">Chỉ Chi</option></select>
      <button class="btn primary" id="cf-go">Lọc</button><div class="sp"></div>
      <button class="btn green" id="cf-in">+ Phiếu thu</button><button class="btn red" id="cf-out">− Phiếu chi</button></div>
    <div class="grid kpis" id="cf-sum"></div>
    <div class="card" style="margin-top:16px"><div class="bd" style="padding:0" id="cf-list"></div></div>`;
  const load = async () => {
    const q = new URLSearchParams({ from: $('#cf-from').value, to: $('#cf-to').value });
    if ($('#cf-type').value) q.set('type', $('#cf-type').value);
    const { entries, summary } = await apiGet('/api/cashflow?' + q);
    $('#cf-sum').innerHTML =
      kpiCard('wallet', 'green', 'Tổng thu', money(summary.income), 'Trong kỳ đã chọn', 'money') +
      kpiCard('receipt', 'amber', 'Tổng chi', money(summary.expense), 'Trong kỳ đã chọn') +
      kpiCard('chart', 'teal', 'Ròng', money(summary.net), 'Thu − Chi');
    $('#cf-list').innerHTML = entries.length ? `<table class="tbl"><thead><tr><th>Thời gian</th><th>Loại</th><th>Danh mục</th><th>Diễn giải</th><th>NV</th><th class="right">Số tiền</th>${can(O) ? '<th></th>' : ''}</tr></thead>
      <tbody>${entries.map((e) => `<tr><td>${dt(e.created_at)}</td>
        <td><span class="badge ${e.type === 'income' ? 'green' : 'red'}">${e.type === 'income' ? 'Thu' : 'Chi'}</span></td>
        <td>${esc(e.category)}</td><td>${esc(e.note)}</td><td>${esc(e.user_name || '')}</td>
        <td class="right ${e.type === 'income' ? 'money-pos' : 'money-neg'}">${e.type === 'income' ? '+' : '−'}${money(e.amount)}</td>
        ${can(O) ? `<td class="right"><button class="btn sm" data-cfedit='${encodeURIComponent(JSON.stringify(e))}'>Sửa</button> <button class="btn sm red" data-cfdel="${e.id}">${icon('trash')}</button></td>` : ''}</tr>`).join('')}</tbody></table>`
      : '<div class="empty">Không có giao dịch</div>';
    $$('#cf-list [data-cfedit]').forEach((b) => b.onclick = () => cashForm(null, JSON.parse(decodeURIComponent(b.dataset.cfedit))));
    $$('#cf-list [data-cfdel]').forEach((b) => b.onclick = () => confirmBox('Xoá phiếu thu/chi này?', async () => {
      await apiDel(`/api/cashflow/${b.dataset.cfdel}`); closeModal(); toast('Đã xoá'); window._reloadCf?.();
    }));
  };
  $('#cf-go').onclick = load;
  $('#cf-in').onclick = () => cashForm('income');
  $('#cf-out').onclick = () => cashForm('expense');
  window._reloadCf = load; await load();
};
function cashForm(type, entry) {
  if (entry) type = entry.type;
  const cats = type === 'income' ? ['Thu khác', 'Đặt cọc', 'Hoàn tiền', 'Tiền cọc', 'Doanh thu phòng'] : ['Chi khác', 'Điện nước', 'Lương NV', 'Sửa chữa', 'Nhập hàng minibar', 'Vật tư'];
  if (entry && entry.category && !cats.includes(entry.category)) cats.unshift(entry.category);
  const sel = (v) => (entry && entry.method === v ? 'selected' : '');
  const body = h(`<div>
    <div class="field"><label>Số tiền *</label><input type="number" id="cf-amt" min="0" step="10000" value="${entry ? entry.amount : ''}" placeholder="0"></div>
    <div class="field"><label>Danh mục</label><select id="cf-cat">${cats.map((c) => `<option ${entry && entry.category === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
    <div class="field"><label>Hình thức</label><select id="cf-method"><option value="cash" ${sel('cash')}>Tiền mặt</option><option value="transfer" ${sel('transfer')}>Chuyển khoản</option><option value="card" ${sel('card')}>Thẻ</option></select></div>
    <div class="field"><label>Diễn giải</label><input id="cf-note" value="${entry ? esc(entry.note) : ''}"></div></div>`);
  const title = entry ? (type === 'income' ? 'Sửa phiếu thu' : 'Sửa phiếu chi') : (type === 'income' ? 'Lập phiếu thu' : 'Lập phiếu chi');
  modal({ title, body, okText: 'Lưu', okClass: type === 'income' ? 'green' : 'red', onOk: async () => {
    const amt = Number(body.querySelector('#cf-amt').value);
    if (!amt || amt <= 0) throw new Error('Nhập số tiền hợp lệ');
    const payload = { type, amount: amt, category: body.querySelector('#cf-cat').value, method: body.querySelector('#cf-method').value, note: body.querySelector('#cf-note').value };
    if (entry) await apiPut(`/api/cashflow/${entry.id}`, payload); else await apiPost('/api/cashflow', payload);
    closeModal(); toast('Đã lưu phiếu'); window._reloadCf?.();
  } });
}

/* ============================================================
   BÁO CÁO
============================================================ */
VIEWS.reports = async (view) => {
  view.innerHTML = `<div class="toolbar"><input type="date" id="rp-from" class="btn" value="${todayStr()}"><span>→</span>
    <input type="date" id="rp-to" class="btn" value="${todayStr()}"><button class="btn primary" id="rp-go">Xem báo cáo</button></div>
    <div id="rp-body"></div>`;
  const load = async () => {
    const from = $('#rp-from').value, to = $('#rp-to').value;
    const [rev, occ] = await Promise.all([
      apiGet(`/api/reports/revenue?from=${from}&to=${to}`),
      apiGet(`/api/reports/occupancy?from=${from}&to=${to}`)]);
    $('#rp-body').innerHTML = `
      <div class="grid kpis">
        ${kpiCard('wallet', 'green', 'Tổng thu', money(rev.summary.income), 'Toàn bộ khoản thu', 'money')}
        ${kpiCard('receipt', 'amber', 'Tổng chi', money(rev.summary.expense), 'Toàn bộ khoản chi')}
        ${kpiCard('chart', 'teal', 'Lợi nhuận ròng', money(rev.summary.net), 'Thu − Chi')}
        ${kpiCard('bed', 'blue', 'Công suất trung bình', occ.avg_pct + '%', `${occ.total_rooms} phòng`)}
      </div>
      <div class="grid" style="grid-template-columns:1fr 1fr;margin-top:16px">
        <div class="card"><div class="hd">Doanh thu theo ngày</div><div class="bd" style="padding:0">
          ${rev.by_day.length ? `<table class="tbl"><thead><tr><th>Ngày</th><th class="right">Thu</th><th class="right">Chi</th><th class="right">Ròng</th></tr></thead>
            <tbody>${rev.by_day.map((d) => `<tr><td>${d.d}</td><td class="right money-pos">${money(d.income)}</td>
              <td class="right money-neg">${money(d.expense)}</td><td class="right"><b>${money(d.income - d.expense)}</b></td></tr>`).join('')}</tbody></table>` : '<div class="empty">Không có dữ liệu</div>'}
        </div></div>
        <div class="card"><div class="hd">Công suất phòng theo ngày</div><div class="bd">
          ${occ.days.map((d) => `<div style="margin-bottom:9px"><div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px">
            <span>${d.date}</span><b>${d.pct}% (${d.occupied}/${d.total})</b></div>
            <div class="bar"><span style="width:${d.pct}%"></span></div></div>`).join('')}
        </div></div>
      </div>
      <div class="card" style="margin-top:16px"><div class="hd">Cơ cấu thu chi theo danh mục</div><div class="bd" style="padding:0">
        <table class="tbl"><thead><tr><th>Loại</th><th>Danh mục</th><th class="center">Số phiếu</th><th class="right">Tổng tiền</th></tr></thead>
        <tbody>${rev.by_category.map((c) => `<tr><td><span class="badge ${c.type === 'income' ? 'green' : 'red'}">${c.type === 'income' ? 'Thu' : 'Chi'}</span></td>
          <td>${esc(c.category)}</td><td class="center">${c.cnt}</td><td class="right">${money(c.amount)}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">—</td></tr>'}</tbody></table>
      </div></div>
      <div class="card" style="margin-top:16px"><div class="bd">
        <div class="summary-line"><span>Tiền phòng (từ hóa đơn)</span><b>${money(rev.room_revenue.room)}</b></div>
        <div class="summary-line"><span>Doanh thu dịch vụ</span><b>${money(rev.room_revenue.service)}</b></div>
        <div class="summary-line"><span>Số hóa đơn</span><b>${rev.room_revenue.invoices}</b></div>
        <div class="summary-line total"><span>Tổng doanh thu hóa đơn</span><span>${money(rev.room_revenue.total)}</span></div>
      </div></div>`;
  };
  $('#rp-go').onclick = load; await load();
};

/* ============================================================
   HẠNG PHÒNG & GIÁ + NGÀY LỄ
============================================================ */
VIEWS.pricing = async (view) => {
  const [{ room_types }, { holidays }, { rooms }] = await Promise.all([apiGet('/api/room-types'), apiGet('/api/holidays'), apiGet('/api/rooms')]);
  view.innerHTML = `
    <div class="card"><div class="hd">Danh sách phòng <button class="btn sm primary" id="rm-add">${icon('plus')} Thêm phòng</button></div>
      <div class="bd" style="padding:0"><table class="tbl"><thead><tr><th>Phòng</th><th>Tầng</th><th>Hạng phòng</th><th>Trạng thái</th><th></th></tr></thead>
      <tbody>${rooms.map((r) => `<tr><td><b>${esc(r.name)}</b></td><td>${r.floor}</td><td>${esc(r.type_name)}</td>
        <td><span class="badge ${r.status === 'available' ? 'green' : r.status === 'occupied' ? 'blue' : r.status === 'cleaning' ? 'amber' : 'gray'}">${STATUS_LABEL[r.status]}</span></td>
        <td class="right"><button class="btn sm" data-rmedit='${encodeURIComponent(JSON.stringify({ id: r.id, name: r.name, floor: r.floor, room_type_id: r.room_type_id, note: r.note }))}'>Sửa</button>
          <button class="btn sm red" data-rmdel="${r.id}" data-rmname="${esc(r.name)}">${icon('trash')}</button></td></tr>`).join('')}</tbody></table></div></div>

    <div class="card" style="margin-top:16px"><div class="hd">Bảng giá theo hạng phòng <button class="btn sm primary" id="rt-add">${icon('plus')} Thêm hạng</button></div>
      <div class="bd" style="padding:0"><table class="tbl"><thead><tr><th>Hạng phòng</th><th class="right">Giờ đầu</th><th class="right">Giờ tiếp</th>
        <th class="right">Qua đêm</th><th class="right">Ngày thường</th><th class="right">Cuối tuần</th><th class="right">Ngày lễ</th><th></th></tr></thead>
      <tbody>${room_types.map((t) => `<tr><td><b>${esc(t.name)}</b></td><td class="right">${money0(t.hourly_first)}</td><td class="right">${money0(t.hourly_next)}</td>
        <td class="right">${money0(t.overnight_rate)}</td><td class="right">${money0(t.daily_rate)}</td><td class="right">${money0(t.weekend_rate)}</td>
        <td class="right">${money0(t.holiday_rate)}</td><td class="right"><button class="btn sm" data-rt='${encodeURIComponent(JSON.stringify(t))}'>Sửa giá</button>
          <button class="btn sm red" data-rtdel="${t.id}" data-rtname="${esc(t.name)}">${icon('trash')}</button></td></tr>`).join('')}</tbody></table></div></div>

    <div class="card" style="margin-top:16px"><div class="hd">Ngày lễ (áp dụng giá ngày lễ) <button class="btn sm primary" id="hol-add">${icon('plus')} Thêm ngày lễ</button></div>
      <div class="bd"><div style="display:flex;flex-wrap:wrap;gap:10px">
        ${holidays.map((hd) => `<span class="badge amber plain" style="padding:7px 7px 7px 12px;gap:8px">${hd.date} — ${esc(hd.name)}
          <button class="btn sm" style="padding:3px 6px" data-holedit='${encodeURIComponent(JSON.stringify(hd))}'>${icon('edit')}</button>
          <button class="btn sm red" style="padding:3px 6px" data-hol="${hd.id}">${icon('trash')}</button></span>`).join('') || '<span class="hint">Chưa có ngày lễ</span>'}
      </div></div></div>`;
  // Phòng
  $('#rm-add').onclick = () => roomForm(null, room_types);
  view.querySelectorAll('[data-rmedit]').forEach((b) => b.onclick = () => roomForm(JSON.parse(decodeURIComponent(b.dataset.rmedit)), room_types));
  view.querySelectorAll('[data-rmdel]').forEach((b) => b.onclick = () => confirmBox(`Xoá phòng "${b.dataset.rmname}"?`, async () => {
    await apiDel(`/api/rooms/${b.dataset.rmdel}`); closeModal(); toast('Đã xoá phòng'); route();
  }));
  // Hạng phòng
  view.querySelectorAll('[data-rt]').forEach((b) => b.onclick = () => rtForm(JSON.parse(decodeURIComponent(b.dataset.rt))));
  $('#rt-add').onclick = () => rtForm(null);
  view.querySelectorAll('[data-rtdel]').forEach((b) => b.onclick = () => confirmBox(`Xoá hạng phòng "${b.dataset.rtname}"?`, async () => {
    await apiDel(`/api/room-types/${b.dataset.rtdel}`); closeModal(); toast('Đã xoá'); route();
  }));
  // Ngày lễ
  view.querySelectorAll('[data-hol]').forEach((b) => b.onclick = () => confirmBox('Xoá ngày lễ này?', async () => { await apiDel(`/api/holidays/${b.dataset.hol}`); closeModal(); toast('Đã xoá'); route(); }));
  view.querySelectorAll('[data-holedit]').forEach((b) => b.onclick = () => holForm(JSON.parse(decodeURIComponent(b.dataset.holedit))));
  $('#hol-add').onclick = () => holForm(null);
};

function roomForm(room, roomTypes) {
  const body = h(`<div>
    <div class="row2"><div class="field"><label>Tên/Số phòng *</label><input id="rm-name" value="${esc(room?.name || '')}"></div>
      <div class="field"><label>Tầng</label><input type="number" id="rm-floor" value="${room?.floor || 1}" min="1"></div></div>
    <div class="field"><label>Hạng phòng</label><select id="rm-type">${roomTypes.map((t) => `<option value="${t.id}" ${room && room.room_type_id === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></div>
    <div class="field"><label>Ghi chú</label><input id="rm-note" value="${esc(room?.note || '')}"></div></div>`);
  modal({ title: room ? `Sửa phòng ${room.name}` : 'Thêm phòng', body, onOk: async () => {
    const payload = { name: body.querySelector('#rm-name').value.trim(), floor: Number(body.querySelector('#rm-floor').value) || 1, room_type_id: Number(body.querySelector('#rm-type').value) };
    if (!payload.name) throw new Error('Nhập tên/số phòng');
    if (room) await apiPut(`/api/rooms/${room.id}`, { ...payload, note: body.querySelector('#rm-note').value.trim() });
    else await apiPost('/api/rooms', payload);
    closeModal(); toast('Đã lưu phòng'); route();
  } });
}

function holForm(hd) {
  const body = h(`<div class="row2"><div class="field"><label>Ngày</label><input type="date" id="h-date" value="${hd ? hd.date : ''}"></div>
    <div class="field"><label>Tên ngày lễ</label><input id="h-name" value="${hd ? esc(hd.name) : ''}" placeholder="VD: Lễ 2/9"></div></div>`);
  modal({ title: hd ? 'Sửa ngày lễ' : 'Thêm ngày lễ', size: 'sm', body, onOk: async () => {
    const payload = { date: body.querySelector('#h-date').value, name: body.querySelector('#h-name').value };
    if (!payload.date) throw new Error('Chọn ngày');
    if (hd) await apiPut(`/api/holidays/${hd.id}`, payload); else await apiPost('/api/holidays', payload);
    closeModal(); toast('Đã lưu'); route();
  } });
}
function rtForm(t) {
  const f = (k, l) => `<div class="field"><label>${l}</label><input type="number" id="rt-${k}" value="${t?.[k] || 0}" step="10000"></div>`;
  const body = h(`<div><div class="field"><label>Tên hạng phòng *</label><input id="rt-name" value="${esc(t?.name || '')}"></div>
    <div class="row2">${f('hourly_first', 'Giá giờ đầu')}${f('hourly_next', 'Giá giờ tiếp theo')}</div>
    <div class="field">${f('overnight_rate', 'Giá qua đêm').replace('<div class="field">', '').replace(/<\/div>$/, '')}</div>
    <div class="row3">${f('daily_rate', 'Ngày thường')}${f('weekend_rate', 'Cuối tuần (T7,CN)')}${f('holiday_rate', 'Ngày lễ')}</div></div>`);
  modal({ title: t ? `Sửa giá: ${t.name}` : 'Thêm hạng phòng', body, onOk: async () => {
    const payload = { name: body.querySelector('#rt-name').value.trim() };
    ['hourly_first', 'hourly_next', 'overnight_rate', 'daily_rate', 'weekend_rate', 'holiday_rate'].forEach((k) => payload[k] = Number(body.querySelector('#rt-' + k).value) || 0);
    if (!payload.name) throw new Error('Nhập tên hạng phòng');
    if (t) await apiPut(`/api/room-types/${t.id}`, payload); else await apiPost('/api/room-types', payload);
    closeModal(); toast('Đã lưu bảng giá'); route();
  } });
}

/* ============================================================
   NGƯỜI DÙNG
============================================================ */
VIEWS.users = async (view) => {
  const { users } = await apiGet('/api/users');
  view.innerHTML = `<div class="toolbar"><div class="sp"></div><button class="btn primary" id="u-add">${icon('plus')} Thêm người dùng</button></div>
    <div class="card"><div class="bd" style="padding:0"><table class="tbl"><thead><tr><th>Tài khoản</th><th>Họ tên</th><th>Vai trò</th><th>Trạng thái</th><th></th></tr></thead>
    <tbody>${users.map((u) => `<tr><td><b>${esc(u.username)}</b></td><td>${esc(u.full_name)}</td>
      <td><span class="badge ${u.role === 'owner' ? 'blue' : u.role === 'receptionist' ? 'green' : 'gray'}">${u.role_label}</span></td>
      <td>${u.active ? '<span class="badge green">Hoạt động</span>' : '<span class="badge red">Khóa</span>'}</td>
      <td class="right"><button class="btn sm" data-u='${encodeURIComponent(JSON.stringify(u))}'>Sửa</button>
        ${u.id !== State.user.id ? ` <button class="btn sm red" data-delu="${u.id}" data-uname="${esc(u.username)}">${icon('trash')}</button>` : ''}</td></tr>`).join('')}</tbody></table></div></div>`;
  $('#u-add').onclick = () => userForm(null);
  view.querySelectorAll('[data-u]').forEach((b) => b.onclick = () => userForm(JSON.parse(decodeURIComponent(b.dataset.u))));
  view.querySelectorAll('[data-delu]').forEach((b) => b.onclick = () => confirmBox(`Xoá tài khoản "${b.dataset.uname}"?`, async () => {
    await apiDel(`/api/users/${b.dataset.delu}`); closeModal(); toast('Đã xoá'); route();
  }));
};
function userForm(u) {
  const body = h(`<div>
    <div class="row2"><div class="field"><label>Tài khoản *</label><input id="u-user" value="${esc(u?.username || '')}" ${u ? 'disabled' : ''}></div>
      <div class="field"><label>Họ tên *</label><input id="u-fn" value="${esc(u?.full_name || '')}"></div></div>
    <div class="row2"><div class="field"><label>Vai trò</label><select id="u-role">
      <option value="owner" ${u?.role === 'owner' ? 'selected' : ''}>Chủ (toàn quyền)</option>
      <option value="receptionist" ${u?.role === 'receptionist' ? 'selected' : ''}>Lễ tân</option>
      <option value="staff" ${u?.role === 'staff' ? 'selected' : ''}>Nhân viên</option></select></div>
      <div class="field"><label>${u ? 'Mật khẩu mới (bỏ trống nếu giữ)' : 'Mật khẩu *'}</label><input type="text" id="u-pass" placeholder="••••"></div></div>
    ${u ? `<label class="field" style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="u-active" ${u.active ? 'checked' : ''} style="width:auto"> Cho phép đăng nhập</label>` : ''}</div>`);
  modal({ title: u ? 'Sửa người dùng' : 'Thêm người dùng', body, onOk: async () => {
    if (u) {
      await apiPut(`/api/users/${u.id}`, { full_name: body.querySelector('#u-fn').value.trim(), role: body.querySelector('#u-role').value,
        active: body.querySelector('#u-active').checked, password: body.querySelector('#u-pass').value || undefined });
    } else {
      const p = { username: body.querySelector('#u-user').value.trim(), full_name: body.querySelector('#u-fn').value.trim(),
        role: body.querySelector('#u-role').value, password: body.querySelector('#u-pass').value };
      if (!p.username || !p.full_name || !p.password) throw new Error('Nhập đủ tài khoản, họ tên, mật khẩu');
      await apiPost('/api/users', p);
    }
    closeModal(); toast('Đã lưu'); route();
  } });
}

/* ============================================================
   NHẬT KÝ GIAO DỊCH
============================================================ */
VIEWS.audit = async (view) => {
  view.innerHTML = `<div class="toolbar"><input id="au-q" class="btn" placeholder="🔍 Tìm theo nội dung / người dùng" style="min-width:240px">
    <input type="date" id="au-from" class="btn"><span>→</span><input type="date" id="au-to" class="btn"><button class="btn primary" id="au-go">Lọc</button></div>
    <div class="card"><div class="bd" style="padding:0" id="au-list"></div></div>`;
  const load = async () => {
    const q = new URLSearchParams();
    if ($('#au-q').value) q.set('q', $('#au-q').value);
    if ($('#au-from').value) q.set('from', $('#au-from').value);
    if ($('#au-to').value) q.set('to', $('#au-to').value);
    const { logs } = await apiGet('/api/audit?' + q);
    $('#au-list').innerHTML = logs.length ? `<table class="tbl"><thead><tr><th>Thời gian</th><th>Người dùng</th><th>Hành động</th><th>Đối tượng</th><th>Chi tiết</th></tr></thead>
      <tbody>${logs.map((l) => `<tr><td>${dtFull(l.created_at)}</td><td><b>${esc(l.username)}</b></td>
        <td><span class="badge gray">${esc(l.action)}</span></td><td>${esc(l.entity)}${l.entity_id ? '#' + l.entity_id : ''}</td>
        <td>${esc(l.details)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">Không có nhật ký</div>';
  };
  $('#au-go').onclick = load; await load();
};

/* ============================================================
   SAO LƯU
============================================================ */
VIEWS.backup = async (view) => {
  const { counts, db_size } = await apiGet('/api/backup/info');
  view.innerHTML = `<div class="card"><div class="hd">Sao lưu & phục hồi dữ liệu</div><div class="bd">
    <p class="hint" style="margin-bottom:14px">Tải xuống bản sao toàn bộ dữ liệu khách sạn để lưu trữ an toàn. Kích thước CSDL hiện tại: <b>${(db_size / 1024).toFixed(1)} KB</b>.</p>
    <div style="display:flex;gap:12px;flex-wrap:wrap">
      <a class="btn primary" href="/api/backup.json?d=${todayStr()}" download>${icon('download')} Tải sao lưu (JSON)</a>
      <a class="btn" href="/api/backup/db" download>${icon('download')} Tải file cơ sở dữ liệu (.db)</a>
    </div>
    <div class="hint" style="margin-top:12px">Để phục hồi: thay file <code>data/hotel.db</code> bằng file .db đã tải, hoặc dùng bản JSON để nhập lại.</div>
  </div></div>
  <div class="card" style="margin-top:16px"><div class="hd">Thống kê dữ liệu</div><div class="bd" style="padding:0">
    <table class="tbl"><thead><tr><th>Bảng dữ liệu</th><th class="right">Số bản ghi</th></tr></thead>
    <tbody>${Object.entries(counts).map(([k, v]) => `<tr><td>${k}</td><td class="right"><b>${v}</b></td></tr>`).join('')}</tbody></table>
  </div></div>`;
};

/* ============================================================
   CẤU HÌNH
============================================================ */
VIEWS.settings = async (view) => {
  const { settings } = await apiGet('/api/settings');
  const f = (k, l, ph = '') => `<div class="field"><label>${l}</label><input id="st-${k}" value="${esc(settings[k] || '')}" placeholder="${ph}"></div>`;
  view.innerHTML = `<div class="card" style="max-width:640px"><div class="hd">Thông tin khách sạn (hiển thị trên hóa đơn)</div><div class="bd">
    ${f('hotel_name', 'Tên khách sạn')}${f('address', 'Địa chỉ')}
    <div class="row2">${f('phone', 'Điện thoại')}${f('tax_code', 'Mã số thuế')}</div>
    <div class="row2">${f('checkin_time', 'Giờ nhận phòng chuẩn', '14:00')}${f('checkout_time', 'Giờ trả phòng chuẩn', '12:00')}</div>
    ${f('footer_note', 'Lời cảm ơn cuối hóa đơn')}
    <button class="btn primary" id="st-save" style="margin-top:8px">${icon('database')} Lưu cấu hình</button>
  </div></div>`;
  $('#st-save').onclick = async () => {
    const keys = ['hotel_name', 'address', 'phone', 'tax_code', 'checkin_time', 'checkout_time', 'footer_note'];
    const payload = {}; keys.forEach((k) => payload[k] = $('#st-' + k).value);
    await apiPut('/api/settings', payload); State.settings = payload;
    $('#brand-hotel').textContent = payload.hotel_name || 'Khách sạn';
    toast('Đã lưu cấu hình');
  };
};

/* ================= START ================= */
init();
