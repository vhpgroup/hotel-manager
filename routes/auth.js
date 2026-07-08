'use strict';
const { hashPassword, verifyPassword } = require('../lib/util');
const { ROLE_LABEL } = require('../lib/framework');

module.exports = function (api) {
  // Đăng nhập
  api.post('/api/login', 'public', (ctx) => {
    const { username, password } = ctx.body;
    if (!username || !password) return ctx.fail(400, 'Vui lòng nhập tài khoản và mật khẩu');
    const u = ctx.db.prepare('SELECT * FROM users WHERE username=?').get(String(username).trim());
    if (!u || !u.active || !verifyPassword(password, u.password_hash)) {
      return ctx.fail(401, 'Sai tài khoản hoặc mật khẩu');
    }
    const token = ctx.createSession(u.id);
    ctx.setCookie('sid', token, { maxAge: 7 * 24 * 3600 });
    ctx.logAudit(u, 'login', 'user', u.id, 'Đăng nhập');
    ctx.ok({ user: { id: u.id, username: u.username, full_name: u.full_name, role: u.role, role_label: ROLE_LABEL[u.role] } });
  });

  // Đăng xuất
  api.post('/api/logout', (ctx) => {
    ctx.destroySession(ctx.cookies.sid);
    ctx.setCookie('sid', '', { expire: true });
    ctx.logAudit(ctx.user, 'logout', 'user', ctx.user.id, 'Đăng xuất');
    ctx.ok();
  });

  // Thông tin phiên hiện tại
  api.get('/api/me', (ctx) => {
    const u = ctx.user;
    ctx.ok({ user: { id: u.id, username: u.username, full_name: u.full_name, role: u.role, role_label: ROLE_LABEL[u.role] } });
  });

  // Đổi mật khẩu chính mình
  api.post('/api/me/password', (ctx) => {
    const { old_password, new_password } = ctx.body;
    const u = ctx.db.prepare('SELECT * FROM users WHERE id=?').get(ctx.user.id);
    if (!verifyPassword(old_password, u.password_hash)) return ctx.fail(400, 'Mật khẩu cũ không đúng');
    if (!new_password || new_password.length < 4) return ctx.fail(400, 'Mật khẩu mới tối thiểu 4 ký tự');
    ctx.db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hashPassword(new_password), u.id);
    ctx.logAudit(ctx.user, 'change_password', 'user', u.id, 'Đổi mật khẩu');
    ctx.ok();
  });

  /* ===== Quản lý người dùng (chỉ Chủ) ===== */
  api.get('/api/users', ['owner'], (ctx) => {
    const rows = ctx.db.prepare('SELECT id,username,full_name,role,active,created_at FROM users ORDER BY id').all();
    ctx.ok({ users: rows.map((r) => ({ ...r, role_label: ROLE_LABEL[r.role] })) });
  });

  api.post('/api/users', ['owner'], (ctx) => {
    const { username, password, full_name, role } = ctx.body;
    if (!username || !password || !full_name) return ctx.fail(400, 'Thiếu thông tin');
    if (!['owner', 'receptionist', 'staff'].includes(role)) return ctx.fail(400, 'Vai trò không hợp lệ');
    const exists = ctx.db.prepare('SELECT id FROM users WHERE username=?').get(username.trim());
    if (exists) return ctx.fail(400, 'Tài khoản đã tồn tại');
    const r = ctx.db.prepare('INSERT INTO users(username,password_hash,full_name,role) VALUES (?,?,?,?)')
      .run(username.trim(), hashPassword(password), full_name.trim(), role);
    ctx.logAudit(ctx.user, 'create', 'user', r.lastInsertRowid, `Tạo tài khoản ${username} (${ROLE_LABEL[role]})`);
    ctx.ok({ id: r.lastInsertRowid });
  });

  api.put('/api/users/:id', ['owner'], (ctx) => {
    const id = Number(ctx.params.id);
    const u = ctx.db.prepare('SELECT * FROM users WHERE id=?').get(id);
    if (!u) return ctx.fail(404, 'Không tìm thấy người dùng');
    const { full_name, role, active, password } = ctx.body;
    ctx.db.prepare('UPDATE users SET full_name=?, role=?, active=? WHERE id=?')
      .run(full_name ?? u.full_name, role ?? u.role, active === undefined ? u.active : (active ? 1 : 0), id);
    if (password) ctx.db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hashPassword(password), id);
    ctx.logAudit(ctx.user, 'update', 'user', id, `Cập nhật tài khoản ${u.username}`);
    ctx.ok();
  });

  // Xoá người dùng
  api.del('/api/users/:id', ['owner'], (ctx) => {
    const id = Number(ctx.params.id);
    if (id === ctx.user.id) return ctx.fail(400, 'Không thể xoá tài khoản bạn đang đăng nhập');
    const u = ctx.db.prepare('SELECT * FROM users WHERE id=?').get(id);
    if (!u) return ctx.fail(404, 'Không tìm thấy người dùng');
    if (u.role === 'owner') {
      const owners = ctx.db.prepare("SELECT COUNT(*) c FROM users WHERE role='owner' AND active=1").get().c;
      if (owners <= 1) return ctx.fail(400, 'Không thể xoá chủ khách sạn cuối cùng');
    }
    ctx.db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);
    ctx.db.prepare('DELETE FROM users WHERE id=?').run(id);
    ctx.logAudit(ctx.user, 'delete', 'user', id, `Xoá tài khoản ${u.username}`);
    ctx.ok();
  });
};
