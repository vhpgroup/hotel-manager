# 🏨 Phần Mềm Quản Lý Khách Sạn (8 phòng) — mô phỏng KiotViet

Ứng dụng web **full-stack** quản lý khách sạn/nhà nghỉ, giao diện tiếng Việt, xây dựng bằng **Node.js thuần + SQLite** — **không phụ thuộc bất kỳ thư viện ngoài nào** (không cần `npm install`). Chạy được ngay trên mọi máy có Node.js ≥ 22.5.

---

## ✨ Tính năng

| Nhóm | Chi tiết |
|------|----------|
| 📊 **Dashboard** | Công suất phòng, doanh thu/chi hôm nay, khách đang lưu trú, phòng cần dọn, cảnh báo hết hàng |
| 🛏️ **Sơ đồ phòng** | 8 phòng, màu theo trạng thái: Trống / Đang ở / Dọn dẹp / Bảo trì; hiển thị khách, giá, đồng hồ thời gian ở |
| 📋 **Đặt / Nhận / Trả phòng** | Nhận phòng theo **giờ / qua đêm / theo ngày**; tính tiền tự động khi trả phòng |
| 💰 **Giá linh hoạt** | Giá **giờ đầu + giờ tiếp**, **qua đêm**, **theo ngày** với **giá ngày thường / cuối tuần / ngày lễ** riêng |
| 🧾 **Hóa đơn & In K58/K80** | Xuất hóa đơn, in mẫu máy in nhiệt khổ **K58** và **K80** |
| 💵 **Tiền cọc** | Thu cọc khi nhận phòng, tự trừ vào hóa đơn khi trả |
| ⏱️ **Gia hạn / Đổi phòng** | Gia hạn thời gian ở, chuyển khách sang phòng khác |
| 🥤 **Minibar & Kho** | Bán nước/bia/snack có **trừ tồn kho**, nhập kho, lịch sử xuất/nhập |
| 🛎️ **Dịch vụ** | Giặt ủi, ăn sáng, thuê xe... (không quản tồn kho) |
| 👤 **Khách hàng & 👥 Khách đoàn** | Lưu thông tin khách, gom nhiều phòng thành đoàn |
| 🧹 **Dọn phòng** | Quy trình Cần dọn → Đang dọn → Sẵn sàng, gán nhân viên |
| 📥 **Thu chi** | Sổ quỹ thu/chi, ghi chi phí điện nước, lương, sửa chữa... |
| 📈 **Báo cáo** | Doanh thu theo ngày, cơ cấu thu chi, **công suất phòng (% lấp đầy)** |
| 🔑 **Phân quyền** | 3 vai trò: **Chủ** / **Lễ tân** / **Nhân viên** |
| 📜 **Nhật ký giao dịch** | Ghi lại ai thao tác gì, khi nào |
| 💾 **Sao lưu** | Tải bản sao lưu JSON hoặc file cơ sở dữ liệu .db |
| ⚙️ **Cấu hình** | Thông tin khách sạn hiển thị trên hóa đơn |

---

## 🚀 Cài đặt & chạy

Yêu cầu: **Node.js phiên bản 22.5 trở lên** (kiểm tra bằng `node --version`).

```bash
# 1. Giải nén và vào thư mục
cd hotel-management

# 2. Chạy (không cần cài gì thêm!)
npm start
# hoặc: node --disable-warning=ExperimentalWarning server.js

# 3. Mở trình duyệt
#    http://localhost:3000
```

Muốn đổi cổng: `PORT=8080 npm start`

### 👤 Tài khoản demo

| Tài khoản | Mật khẩu | Vai trò |
|-----------|----------|---------|
| `admin` | `123456` | Chủ (toàn quyền) |
| `letan` | `123456` | Lễ tân |
| `nhanvien` | `123456` | Nhân viên |

> 💡 Tạo dữ liệu hoạt động mẫu (vài phòng đang ở, doanh thu): mở app rồi chạy `node demo-seed.js` trong terminal khác.

---

## 🧭 Hướng dẫn nhanh

1. **Nhận phòng**: Vào **Sơ đồ phòng** → bấm phòng màu xanh lá (Trống) → chọn hình thức thuê, nhập khách, tiền cọc → **Nhận phòng**.
2. **Thêm dịch vụ**: Bấm phòng màu xanh dương (Đang ở) → chọn sản phẩm minibar/dịch vụ → **+ Thêm**.
3. **Trả phòng**: Bấm phòng đang ở → **Trả phòng & Thanh toán** → xem tiền phòng + dịch vụ − cọc → chọn khổ in K58/K80 → **Xác nhận**.
4. **Dọn phòng**: Sau khi trả, phòng chuyển sang **Dọn dẹp** (màu cam) → vào **Dọn phòng** hoặc bấm phòng → **Hoàn tất dọn**.
5. **Đổi giá**: **Hạng phòng & Giá** (chỉ Chủ) — chỉnh giá giờ/đêm/ngày/cuối tuần/lễ và thêm ngày lễ.

### Cách tính tiền phòng
- **Theo giờ**: `giá giờ đầu + giá giờ tiếp × số giờ tiếp theo` (làm tròn lên).
- **Qua đêm**: giá trọn gói qua đêm.
- **Theo ngày**: cộng giá **từng đêm**; đêm rơi vào **ngày lễ** dùng giá lễ, **T7/CN** dùng giá cuối tuần, còn lại dùng giá ngày thường.

---

## 🖨️ In hóa đơn K58 / K80
Khi thanh toán, tích chọn "In hóa đơn" và chọn khổ giấy. Cửa sổ in bung ra với khổ **58mm** hoặc **80mm** đúng chuẩn máy in nhiệt. Có thể in lại bất cứ lúc nào ở mục **Hóa đơn**.

> Trình duyệt cần cho phép cửa sổ pop-up để in.

---

## 💾 Sao lưu & phục hồi
- Vào **Sao lưu** (Chủ) → tải **JSON** (đọc được) hoặc **file .db** (đầy đủ).
- Phục hồi: dừng server, thay file `data/hotel.db` bằng bản sao lưu, chạy lại.
- Làm mới toàn bộ dữ liệu: `npm run seed` (⚠️ xóa sạch và tạo lại dữ liệu mẫu).

---

## 📁 Cấu trúc dự án

```
hotel-management/
├── server.js            # Máy chủ HTTP, nạp route
├── db.js                # Khởi tạo SQLite + schema + dữ liệu mẫu
├── lib/
│   ├── framework.js     # Router, session, phân quyền, phục vụ file tĩnh
│   └── util.js          # Mã hóa mật khẩu, tính tiền, xử lý ngày giờ
├── routes/              # Các API: auth, rooms, bookings, customers,
│   │                    #          inventory, housekeeping, finance, system
├── public/              # Giao diện (HTML/CSS/JS thuần)
│   ├── index.html
│   ├── css/style.css
│   └── js/core.js, app.js
├── data/                # (tự tạo) chứa file hotel.db
├── demo-seed.js         # Script tạo dữ liệu hoạt động mẫu (tùy chọn)
└── README.md
```

## ✅ Kiểm thử
Dự án kèm bộ kiểm thử tự động **50 test-case** bao phủ toàn bộ chức năng (đăng nhập, phân quyền, tính giá giờ/đêm/ngày/cuối tuần/lễ, tồn kho, tiền cọc, gia hạn, đổi phòng, dọn phòng, hóa đơn, thu chi, báo cáo, nhật ký, sao lưu):

```bash
npm start          # cửa sổ 1: chạy server
node test.js       # cửa sổ 2: chạy kiểm thử  ->  50 PASS / 0 FAIL
```

## 🛠️ Công nghệ
- **Backend**: Node.js (`node:http`), không framework ngoài.
- **CSDL**: SQLite qua module tích hợp `node:sqlite`.
- **Bảo mật**: mật khẩu băm scrypt (`node:crypto`), phiên đăng nhập bằng cookie.
- **Frontend**: HTML + CSS + JavaScript thuần (SPA), không build, không CDN bắt buộc.

## ⚠️ Ghi chú
- `node:sqlite` là tính năng thử nghiệm của Node — ổn định để dùng nội bộ; cờ `--disable-warning=ExperimentalWarning` chỉ để ẩn cảnh báo.
- Đây là ứng dụng chạy nội bộ (localhost/LAN). Khi triển khai ra Internet nên đặt sau HTTPS và đổi mật khẩu mặc định.

---
*Phần mềm mẫu phục vụ quản lý khách sạn 8 phòng theo mô hình KiotViet.*
