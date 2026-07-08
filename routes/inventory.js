'use strict';

module.exports = function (api) {
  // Danh sách sản phẩm & dịch vụ
  api.get('/api/products', (ctx) => {
    const rows = ctx.db.prepare('SELECT * FROM products WHERE active=1 ORDER BY category, name').all();
    ctx.ok({ products: rows });
  });

  api.post('/api/products', ['owner'], (ctx) => {
    const b = ctx.body;
    if (!b.name) return ctx.fail(400, 'Thiếu tên sản phẩm');
    const track = b.category === 'service' ? 0 : (b.track_stock ? 1 : 0);
    const r = ctx.db.prepare(`INSERT INTO products(sku,name,category,price,cost,stock,track_stock)
      VALUES (?,?,?,?,?,?,?)`).run(b.sku || '', b.name, b.category || 'minibar',
      +b.price || 0, +b.cost || 0, +b.stock || 0, track);
    ctx.logAudit(ctx.user, 'create', 'product', r.lastInsertRowid, `Thêm sản phẩm ${b.name}`);
    ctx.ok({ id: r.lastInsertRowid });
  });

  api.put('/api/products/:id', ['owner'], (ctx) => {
    const id = Number(ctx.params.id);
    const p = ctx.db.prepare('SELECT * FROM products WHERE id=?').get(id);
    if (!p) return ctx.fail(404, 'Không tìm thấy sản phẩm');
    const b = ctx.body;
    ctx.db.prepare('UPDATE products SET sku=?,name=?,category=?,price=?,cost=?,track_stock=?,active=? WHERE id=?')
      .run(b.sku ?? p.sku, b.name ?? p.name, b.category ?? p.category,
        b.price ?? p.price, b.cost ?? p.cost,
        b.track_stock === undefined ? p.track_stock : (b.track_stock ? 1 : 0),
        b.active === undefined ? p.active : (b.active ? 1 : 0), id);
    ctx.logAudit(ctx.user, 'update', 'product', id, `Cập nhật sản phẩm ${p.name}`);
    ctx.ok();
  });

  // Nhập kho / điều chỉnh tồn
  api.post('/api/products/:id/stock', ['owner'], (ctx) => {
    const id = Number(ctx.params.id);
    const p = ctx.db.prepare('SELECT * FROM products WHERE id=?').get(id);
    if (!p) return ctx.fail(404, 'Không tìm thấy sản phẩm');
    const change = Number(ctx.body.change);
    if (!change) return ctx.fail(400, 'Số lượng thay đổi không hợp lệ');
    const reason = ctx.body.reason || (change > 0 ? 'import' : 'adjust');
    ctx.db.prepare('UPDATE products SET stock=stock+? WHERE id=?').run(change, id);
    ctx.db.prepare('INSERT INTO stock_moves(product_id,change,reason,ref,created_by) VALUES (?,?,?,?,?)')
      .run(id, change, reason, ctx.body.note || '', ctx.user.id);
    // Nếu nhập kho có giá vốn -> ghi chi phí
    if (change > 0 && ctx.body.record_expense && p.cost > 0) {
      ctx.db.prepare(`INSERT INTO cashflow(type,category,amount,method,note,ref_type,ref_id,created_by)
        VALUES ('expense','Nhập hàng minibar',?,?,?, 'product', ?, ?)`)
        .run(p.cost * change, 'cash', `Nhập ${p.name} x${change}`, id, ctx.user.id);
    }
    ctx.logAudit(ctx.user, 'stock', 'product', id, `Điều chỉnh tồn ${p.name}: ${change > 0 ? '+' : ''}${change}`);
    ctx.ok({ stock: p.stock + change });
  });

  // Lịch sử xuất nhập kho
  api.get('/api/stock-moves', ['owner'], (ctx) => {
    const rows = ctx.db.prepare(`
      SELECT m.*, p.name AS product_name, u.full_name AS user_name
      FROM stock_moves m JOIN products p ON p.id=m.product_id
      LEFT JOIN users u ON u.id=m.created_by
      ORDER BY m.id DESC LIMIT 200`).all();
    ctx.ok({ moves: rows });
  });

  // Xoá sản phẩm (nếu đã bán thì chuyển sang ngưng dùng)
  api.del('/api/products/:id', ['owner'], (ctx) => {
    const id = Number(ctx.params.id);
    const p = ctx.db.prepare('SELECT * FROM products WHERE id=?').get(id);
    if (!p) return ctx.fail(404, 'Không tìm thấy sản phẩm');
    const used = ctx.db.prepare('SELECT COUNT(*) c FROM booking_items WHERE product_id=?').get(id).c;
    if (used > 0) {
      ctx.db.prepare('UPDATE products SET active=0 WHERE id=?').run(id);
      ctx.logAudit(ctx.user, 'deactivate', 'product', id, `Ngưng dùng sản phẩm ${p.name} (đã có lịch sử bán)`);
      return ctx.ok({ softDeleted: true, message: 'Sản phẩm đã có lịch sử bán nên được chuyển sang ngưng dùng thay vì xoá.' });
    }
    ctx.db.prepare('DELETE FROM stock_moves WHERE product_id=?').run(id);
    ctx.db.prepare('DELETE FROM products WHERE id=?').run(id);
    ctx.logAudit(ctx.user, 'delete', 'product', id, `Xoá sản phẩm ${p.name}`);
    ctx.ok({ softDeleted: false });
  });
};
