'use strict';
const { app, BrowserWindow, Menu, shell, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

// Chỉ cho phép 1 phiên bản chạy cùng lúc
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); process.exit(0); }

// Lưu cơ sở dữ liệu SQLite vào thư mục dữ liệu người dùng (ghi được, không mất khi cập nhật app)
const DATA_DIR = path.join(app.getPath('userData'), 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
process.env.HOTEL_DATA_DIR = DATA_DIR;

let mainWindow = null;
let serverPort = 0;

async function bootServer() {
  const { start } = require(path.join(__dirname, '..', 'server'));
  const res = await start(0); // 0 = hệ điều hành tự chọn cổng trống
  serverPort = res.port;
}

function createWindow() {
  const iconPng = path.join(__dirname, '..', 'build', 'icon.png');
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1024,
    minHeight: 680,
    title: 'StayPro — Quản lý khách sạn',
    backgroundColor: '#0b1424',
    icon: fs.existsSync(iconPng) ? iconPng : undefined,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  mainWindow.loadURL(`http://localhost:${serverPort}`);
  mainWindow.once('ready-to-show', () => mainWindow.show());
  // Mở link ngoài bằng trình duyệt hệ thống
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://localhost')) return { action: 'allow' };
    shell.openExternal(url); return { action: 'deny' };
  });
}

function buildMenu() {
  const template = [
    {
      label: 'Ứng dụng',
      submenu: [
        { label: 'Tải lại', accelerator: 'CmdOrCtrl+R', click: () => mainWindow && mainWindow.reload() },
        {
          label: 'Mở thư mục dữ liệu (sao lưu)',
          click: () => shell.openPath(DATA_DIR),
        },
        { type: 'separator' },
        { label: 'Thoát', accelerator: 'CmdOrCtrl+Q', role: 'quit' },
      ],
    },
    {
      label: 'Hiển thị',
      submenu: [
        { label: 'Phóng to', role: 'zoomIn' },
        { label: 'Thu nhỏ', role: 'zoomOut' },
        { label: 'Cỡ mặc định', role: 'resetZoom' },
        { type: 'separator' },
        { label: 'Toàn màn hình', role: 'togglefullscreen' },
        { label: 'Công cụ nhà phát triển', accelerator: 'F12', click: () => mainWindow && mainWindow.webContents.toggleDevTools() },
      ],
    },
    {
      label: 'Trợ giúp',
      submenu: [
        {
          label: 'Giới thiệu',
          click: () => dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: 'Giới thiệu',
            message: 'StayPro — Phần mềm quản lý khách sạn',
            detail: 'Phiên bản 1.0.0\nDữ liệu lưu tại:\n' + DATA_DIR,
            buttons: ['Đóng'],
          }),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(async () => {
  try {
    await bootServer();
  } catch (err) {
    dialog.showErrorBox('Lỗi khởi động', 'Không thể khởi động máy chủ nội bộ:\n' + (err && err.stack || err));
    app.quit();
    return;
  }
  buildMenu();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('second-instance', () => {
  if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); }
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
