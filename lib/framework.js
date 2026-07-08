'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { db } = require('../db');
const { newToken } = require('./util');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const ROLE_LABEL = { owner: 'Chủ', receptionist: 'Lễ tân', staff: 'Nhân viên' };

/* ---------- Nhật ký giao dịch ---------- */
function logAudit(user, action, entity, entityId, details) {
  try {
    db.prepare(`INSERT INTO audit_log(user_id,username,action,entity,entity_id,details)
      VALUES (?,?,?,?,?,?)`).run(
      user ? user.id : null,
      user ? user.username : 'system',
      action, entity || '', entityId || null,
      typeof details === 'string' ? details : JSON.stringify(details || {})
    );
  } catch (e) { /* không chặn luồng chính vì lỗi log */ }
}

/* ---------- Session ---------- */
function createSession(userId) {
  const token = newToken();
  const expires = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
  db.prepare('INSERT INTO sessions(token,user_id,expires_at) VALUES (?,?,?)').run(token, userId, expires);
  return token;
}
function getUserByToken(token) {
  if (!token) return null;
  const s = db.prepare('SELECT * FROM sessions WHERE token=?').get(token);
  if (!s) return null;
  if (new Date(s.expires_at) < new Date()) {
    db.prepare('DELETE FROM sessions WHERE token=?').run(token);
    return null;
  }
  const u = db.prepare('SELECT id,username,full_name,role,active FROM users WHERE id=?').get(s.user_id);
  if (!u || !u.active) return null;
  return u;
}
function destroySession(token) {
  if (token) db.prepare('DELETE FROM sessions WHERE token=?').run(token);
}

/* ---------- Tiện ích cookie ---------- */
function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie;
  if (!raw) return out;
  raw.split(';').forEach((c) => {
    const i = c.indexOf('=');
    if (i > -1) out[c.slice(0, i).trim()] = decodeURIComponent(c.slice(i + 1).trim());
  });
  return out;
}

/* ---------- Ứng dụng / Router ---------- */
function createApp({ publicDir }) {
  const routes = []; // { method, regex, keys, handler, roles }

  function add(method, pattern, roles, handler) {
    if (typeof roles === 'function') { handler = roles; roles = null; }
    const keys = [];
    const regex = new RegExp('^' + pattern.replace(/:([A-Za-z0-9_]+)/g, (_, k) => {
      keys.push(k); return '([^/]+)';
    }) + '$');
    routes.push({ method, regex, keys, handler, roles });
  }

  const api = {
    get: (p, r, h) => add('GET', p, r, h),
    post: (p, r, h) => add('POST', p, r, h),
    put: (p, r, h) => add('PUT', p, r, h),
    del: (p, r, h) => add('DELETE', p, r, h),
  };

  function sendJSON(res, code, obj) {
    const body = JSON.stringify(obj);
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(body);
  }

  function serveStatic(req, res, pathname) {
    let rel = pathname === '/' ? '/index.html' : pathname;
    const filePath = path.join(publicDir, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
    if (!filePath.startsWith(publicDir)) { res.writeHead(403); return res.end('Forbidden'); }
    fs.readFile(filePath, (err, data) => {
      if (err) {
        // SPA fallback -> index.html cho các đường dẫn không phải /api
        if (!pathname.startsWith('/api')) {
          return fs.readFile(path.join(publicDir, 'index.html'), (e2, d2) => {
            if (e2) { res.writeHead(404); return res.end('Not found'); }
            res.writeHead(200, { 'Content-Type': MIME['.html'] });
            res.end(d2);
          });
        }
        res.writeHead(404); return res.end('Not found');
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      res.end(data);
    });
  }

  function readBody(req) {
    return new Promise((resolve) => {
      let data = '';
      req.on('data', (c) => { data += c; if (data.length > 5e6) req.destroy(); });
      req.on('end', () => {
        if (!data) return resolve({});
        try { resolve(JSON.parse(data)); } catch { resolve({}); }
      });
      req.on('error', () => resolve({}));
    });
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const pathname = url.pathname;

      if (!pathname.startsWith('/api')) return serveStatic(req, res, pathname);

      // Match route
      let match = null, route = null;
      for (const r of routes) {
        if (r.method !== req.method) continue;
        const m = r.regex.exec(pathname);
        if (m) { match = m; route = r; break; }
      }
      if (!route) return sendJSON(res, 404, { error: 'Không tìm thấy API' });

      // Auth
      const cookies = parseCookies(req);
      const user = getUserByToken(cookies.sid);
      const isPublic = route.roles === 'public';
      if (!isPublic && !user) return sendJSON(res, 401, { error: 'Chưa đăng nhập' });
      if (Array.isArray(route.roles) && (!user || !route.roles.includes(user.role))) {
        return sendJSON(res, 403, { error: 'Bạn không có quyền thực hiện thao tác này' });
      }

      const params = {};
      route.keys.forEach((k, i) => { params[k] = decodeURIComponent(match[i + 1]); });
      const query = Object.fromEntries(url.searchParams.entries());
      const body = (req.method === 'POST' || req.method === 'PUT') ? await readBody(req) : {};

      const ctx = {
        req, res, params, query, body, user, cookies,
        db, logAudit,
        json: (code, obj) => sendJSON(res, code, obj),
        ok: (obj) => sendJSON(res, 200, obj ?? { ok: true }),
        fail: (code, msg) => sendJSON(res, code, { error: msg }),
        setCookie: (name, val, opts = {}) => {
          const parts = [`${name}=${encodeURIComponent(val)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
          if (opts.maxAge) parts.push(`Max-Age=${opts.maxAge}`);
          if (opts.expire) parts.push('Max-Age=0');
          res.setHeader('Set-Cookie', parts.join('; '));
        },
        createSession, destroySession,
      };

      await route.handler(ctx);
    } catch (err) {
      console.error('Lỗi máy chủ:', err);
      if (!res.headersSent) sendJSON(res, 500, { error: 'Lỗi máy chủ: ' + err.message });
    }
  });

  return { api, server, sendJSON };
}

module.exports = { createApp, logAudit, ROLE_LABEL, createSession, destroySession, getUserByToken };
