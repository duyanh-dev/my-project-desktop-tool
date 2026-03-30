const { app, BrowserWindow, ipcMain, dialog, globalShortcut, protocol } = require('electron');
const path = require('path');
const url = require('url');
// require('./updater.js');
require('dotenv').config(); 

protocol.registerSchemesAsPrivileged([
    { scheme: 'local-media', privileges: { standard: true, secure: true, supportFetchAPI: true } }
  ]);

const _segA = "Z2hwX2k3WElwOG4xV1oz";
const _segB = "TlM3Ump3aHlueU1";
const _segC = "QYW52ZVZIMzFSUWFNag==";
const REMOTE_SWITCH_URL = "https://gist.githubusercontent.com/duyanh-dev/16618cfde1400e2135ce3efb33727a66/raw/license.json";

function _getGatekeeperKey() {
    const fullSecret = _segA + _segB + _segC;
    return Buffer.from(fullSecret, 'base64').toString('utf8');
}
if (!process.env.SUPABASE_KEY) {
    console.log("⚠️ Không tìm thấy file .env, đang nạp Key dự phòng...");
    
    process.env.SUPABASE_URL = "https://pzqwnosbwznoksyervxk.supabase.co";
    process.env.SUPABASE_KEY = "sb_publishable_HyyqMob18yaCwb-GPeakJA__XOO_YU3";
    
    process.env.CLOUDINARY_URL = "https://api.cloudinary.com/v1_1/dpn8hugjc/image/upload";
    process.env.CLOUDINARY_PRESET = "codepen_preset";
}

if (!process.env.GITHUB_TOKEN) {
    process.env.GITHUB_TOKEN = _getGatekeeperKey();
}

ipcMain.handle('capture-page', async (event, url) => {
    const tempWin = new BrowserWindow({
        width: 1920, 
        height: 1080, 
        show: false,
        webPreferences: { offscreen: true }
    });
    
    try {
        await tempWin.loadURL(url);
        
        await new Promise(r => setTimeout(r, 2000));

        const fullHeight = await tempWin.webContents.executeJavaScript(`
            Math.max(
                document.documentElement.scrollHeight,
                document.body.scrollHeight,
                document.documentElement.offsetHeight
            );
        `);

        tempWin.setBounds({ x: 0, y: 0, width: 1920, height: fullHeight });

        await new Promise(r => setTimeout(r, 500));
        
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
ipcMain.handle('cloudinary-upload', async (event, base64Image) => {
    try {
        const formData = new FormData();
        formData.append("file", base64Image); 
        formData.append("upload_preset", process.env.CLOUDINARY_PRESET);

        const response = await fetch(process.env.CLOUDINARY_URL, {
            method: "POST",
            body: formData 
        });

        const data = await response.json();

        if (!response.ok) {
            console.error("Cloudinary Error Details:", data);
            return { error: data.error ? data.error.message : "Lỗi upload không xác định" };
        }

        console.log("Upload thành công:", data.secure_url);
        return data.secure_url; 
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
        alwaysOnTop: false,
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
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('clipboard-window-status', false);
        }
        clipboardWindow = null;
    });
}

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

    protocol.registerFileProtocol('local-media', (request, callback) => {
        const url = request.url.replace('local-media://', '');
        const decodedPath = decodeURIComponent(url);
        
        try {
            return callback({ path: path.normalize(decodedPath) });
        } catch (error) {
            console.error('Protocol Error:', error);
        }
    });

    const check = await validateGatekeeper();

    if (!check.valid) {
        dialog.showErrorBox(
            "Thông báo hệ thống", 
            check.msg 
        );
        app.quit();
        return;
    }

    createWindow();

    globalShortcut.register('CommandOrControl+Control+V', () => {
        createClipboardWindow();
        
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('clipboard-window-status', true);
        }
    });
});

// layer ảnh 
let overlayWindow = null;
let originalSize = { width: 0, height: 0 }; 

ipcMain.handle('select-file', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [{ name: 'Images', extensions: ['jpg', 'png', 'gif', 'jpeg', 'webp'] }]
    });
    if (canceled) return null;
    return filePaths[0]; 
});


ipcMain.handle('open-overlay', async (event, imageSrc) => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.webContents.send('update-overlay', { src: imageSrc });
        return true;
    }

    overlayWindow = new BrowserWindow({
        width: 800, 
        height: 600,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        resizable: true, 
        skipTaskbar: true, 
        focusable: false,
        hasShadow: false,
        enableLargerThanScreen: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            webSecurity: false
        }
    });
    overlayWindow.setAlwaysOnTop(true, 'screen-saver');
    if (process.platform === 'darwin') {
        overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    }

    overlayWindow.loadFile(path.join(__dirname, '../ui/features/overlay-window.html'));

    overlayWindow.webContents.on('did-finish-load', () => {
        overlayWindow.webContents.send('update-overlay', { src: imageSrc });
    });

    overlayWindow.on('closed', () => { overlayWindow = null; });
    return true;
});

ipcMain.on('close-overlay', () => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.close(); 
        overlayWindow = null;
    }
});

ipcMain.on('resize-overlay-window', (event, { width, height, scale }) => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
        if (width && height) originalSize = { width, height };
        
        const newWidth = Math.round(originalSize.width * scale);
        const newHeight = Math.round(originalSize.height * scale);
        
        overlayWindow.setSize(newWidth, newHeight);
    }
});

ipcMain.on('center-overlay', () => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.center(); // Đưa về giữa màn hình chính
        // Hoặc có thể set tọa độ tuyệt đối để thoát khỏi vùng kẹt:
        // overlayWindow.setPosition(pos[0], 50); 
    }
});

ipcMain.on('nudge-overlay', (event, direction) => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
        const pos = overlayWindow.getPosition();
        const step = 1;
        if (direction === 'up') overlayWindow.setPosition(pos[0], pos[1] - step);
        if (direction === 'down') overlayWindow.setPosition(pos[0], pos[1] + step);
        if (direction === 'left') overlayWindow.setPosition(pos[0] - step, pos[1]);
        if (direction === 'right') overlayWindow.setPosition(pos[0] + step, pos[1]);
    }
});

ipcMain.on('control-overlay', (event, data) => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.webContents.send('update-overlay', data);
    }
});

ipcMain.on('set-ignore-mouse', (event, ignore) => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.setIgnoreMouseEvents(ignore, { forward: true });
    }
});

ipcMain.on('close-overlay', () => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.close();
        overlayWindow = null;
    }
    
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('overlay-closed-sync');
    }
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