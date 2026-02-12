const { app, BrowserWindow, ipcMain, dialog, globalShortcut } = require('electron');
const path = require('path');
const url = require('url');
// require('./updater.js');
require('dotenv').config(); 

const _segA = "Z2hwX2k3WElwOG4xV1oz";
const _segB = "TlM3Ump3aHlueU1";
const _segC = "QYW52ZVZIMzFSUWFNag==";
const REMOTE_SWITCH_URL = "https://gist.githubusercontent.com/Duyanh174/16618cfde1400e2135ce3efb33727a66/raw/license.json";

function _getGatekeeperKey() {
    // Ghép các mảnh lại rồi mới giải mã
    const fullSecret = _segA + _segB + _segC;
    return Buffer.from(fullSecret, 'base64').toString('utf8');
}
// --- CƠ CHẾ DỰ PHÒNG KHI BUILD APP ---
if (!process.env.SUPABASE_KEY) {
    console.log("⚠️ Không tìm thấy file .env, đang nạp Key dự phòng...");
    
    process.env.SUPABASE_URL = "https://pzqwnosbwznoksyervxk.supabase.co";
    process.env.SUPABASE_KEY = "sb_publishable_HyyqMob18yaCwb-GPeakJA__XOO_YU3";
    
    process.env.CLOUDINARY_URL = "https://api.cloudinary.com/v1_1/dpn8hugjc/image/upload";
    process.env.CLOUDINARY_PRESET = "codepen_preset";
}

// Luôn đảm bảo GITHUB_TOKEN tồn tại kể cả khi có .env hay không
if (!process.env.GITHUB_TOKEN) {
    process.env.GITHUB_TOKEN = _getGatekeeperKey();
}

ipcMain.handle('capture-page', async (event, url) => {
    const tempWin = new BrowserWindow({
        width: 1920, // Giữ nguyên chiều rộng thiết kế
        height: 1080, // Chiều cao tạm thời
        show: false,
        webPreferences: { offscreen: true }
    });
    
    try {
        await tempWin.loadURL(url);
        
        // 1. Đợi một chút để page nạp xong CSS/Fonts
        await new Promise(r => setTimeout(r, 2000));

        // 2. PHÉP THUẬT Ở ĐÂY: Lấy chiều cao thực tế của toàn bộ trang web
        const fullHeight = await tempWin.webContents.executeJavaScript(`
            Math.max(
                document.documentElement.scrollHeight,
                document.body.scrollHeight,
                document.documentElement.offsetHeight
            );
        `);

        // 3. Thay đổi kích thước cửa sổ ảo khớp 100% với chiều cao web
        // Chúng ta set height mới, width giữ nguyên 1920
        tempWin.setBounds({ x: 0, y: 0, width: 1920, height: fullHeight });

        // 4. Đợi thêm 500ms để trình duyệt render lại theo kích thước mới
        await new Promise(r => setTimeout(r, 500));
        
        // 5. Chụp ảnh (Bây giờ nó sẽ chụp từ đầu đến chân trang)
        const image = await tempWin.webContents.capturePage();
        
        tempWin.close();
        return image.toDataURL();
    } catch (error) {
        if (!tempWin.isDestroyed()) tempWin.close();
        throw error;
    }
});

async function validateGatekeeper() {
    try {
        console.log("🔍 Đang kiểm tra bản quyền...");

        const tokenResponse = await fetch('https://api.github.com/user', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
                'User-Agent': 'app_Datool_License'
            }
        });

        if (!tokenResponse.ok) {
            console.error("❌ Lớp 1 thất bại: Token không hợp lệ hoặc đã bị xoá.");
            return { valid: false, msg: "Token bảo mật đã bị thu hồi." };
        }

      const switchResponse = await fetch(`${REMOTE_SWITCH_URL}?t=${Date.now()}`);
        
      if (!switchResponse.ok) {
          return { valid: false, msg: "Không thể kết nối máy chủ xác thực." };
      }

      const license = await switchResponse.json();

        if (license.status === "active") {
            console.log("✅ Hệ thống hợp lệ. Chào mừng Duy Anh!");
            return { valid: true };
        } else {
            console.error("❌ Lớp 2 thất bại: Ứng dụng đã bị khoá từ xa.");
            return { valid: false, msg: license.message || "Ứng dụng này đã ngừng hỗ trợ." };
        }

    } catch (error) {
        console.error("🌐 Lỗi mạng:", error.message);
        return { valid: false, msg: "Vui lòng kết nối Internet để khởi động ứng dụng." };
    }
}
// -------------------------------------
// 1. Handler gọi Supabase
ipcMain.handle('supabase-request', async (event, { method, path, body }) => {
    const url = `${process.env.SUPABASE_URL}${path}`;
    const options = {
        method: method,
        headers: {
            'apikey': process.env.SUPABASE_KEY,
            'Authorization': `Bearer ${process.env.SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        }
    };
    if (body) options.body = JSON.stringify(body);
    const response = await fetch(url, options);
    return await response.json();
});

// 2. Handler upload ảnh lên Cloudinary
// 2. Handler upload ảnh lên Cloudinary
ipcMain.handle('cloudinary-upload', async (event, base64Image) => {
    try {
        // Sử dụng FormData thay vì URLSearchParams
        const formData = new FormData();
        formData.append("file", base64Image); // Cloudinary chấp nhận chuỗi base64 có prefix data:image/...
        formData.append("upload_preset", process.env.CLOUDINARY_PRESET);

        const response = await fetch(process.env.CLOUDINARY_URL, {
            method: "POST",
            body: formData // Fetch sẽ tự động set Content-Type là multipart/form-data
        });

        const data = await response.json();

        if (!response.ok) {
            console.error("Cloudinary Error Details:", data);
            return { error: data.error ? data.error.message : "Lỗi upload không xác định" };
        }

        console.log("Upload thành công:", data.secure_url);
        return data.secure_url; // Trả về URL trực tiếp nếu thành công
    } catch (e) {
        console.error("Lỗi kết nối Cloudinary:", e.message);
        return { error: e.message };
    }
});



let mainWindow;
let clipboardWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1100,
        height: 800,
        backgroundColor: '#12141d',
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            backgroundThrottling: false 
        }
    });
    mainWindow.loadFile(path.join(__dirname, '../ui/index.html'));
}

// ========================================================
// LOGIC CLIPBOARD WINDOW (STANDALONE)
// ========================================================

function createClipboardWindow() {
    if (clipboardWindow && !clipboardWindow.isDestroyed()) {
        clipboardWindow.focus();
        return;
    }

    clipboardWindow = new BrowserWindow({
        width: 380,
        height: 600,
        frame: true,         // Thanh điều hướng mặc định
        alwaysOnTop: true,
        title: "Clipboard Manager",
        backgroundColor: '#ffffff',
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            webSecurity: false 
        }
    });

    const startUrl = url.format({
        pathname: path.join(__dirname, '../ui/features/clipboard-standalone.html'),
        protocol: 'file:',
        slashes: true
    });

    clipboardWindow.loadURL(startUrl);

    clipboardWindow.on('closed', () => {
        // FIX LỖI 2: Kiểm tra mainWindow còn sống không trước khi send
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('clipboard-window-status', false);
        }
        clipboardWindow = null;
    });
}

// Lắng nghe sự kiện toggle từ Renderer
ipcMain.on('toggle-clipboard-window', (event, isWindow) => {
    if (isWindow) {
        createClipboardWindow();
    } else {
        if (clipboardWindow && !clipboardWindow.isDestroyed()) {
            clipboardWindow.close();
        }
    }
});

ipcMain.on('close-clipboard-ui', () => {
    if (clipboardWindow && !clipboardWindow.isDestroyed()) {
        clipboardWindow.close();
    }
});

// ========================================================
// IPC HANDLERS & GLOBAL SHORTCUT
// ========================================================

ipcMain.handle('select-folder', async () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    return await dialog.showOpenDialog(mainWindow, { 
        properties: ['openDirectory', 'createDirectory'] 
    });
});

app.whenReady().then(async () => {

    // Chạy kiểm tra 2 lớp
    const check = await validateGatekeeper();

    if (!check.valid) {
        dialog.showErrorBox(
            "Thông báo hệ thống", 
            check.msg // Hiện lỗi cụ thể: sai token, bị khoá, hoặc mất mạng
        );
        app.quit();
        return;
    }

    createWindow();

    // FIX LỖI 1: Phím tắt Control + Command + V
    globalShortcut.register('CommandOrControl+Control+V', () => {
        createClipboardWindow();
        
        // Kiểm tra an toàn trước khi cập nhật Switch ở mainWindow
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('clipboard-window-status', true);
        }
    });
});

app.on('will-quit', () => {
    globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});