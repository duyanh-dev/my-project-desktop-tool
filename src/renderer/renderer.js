const { ipcRenderer } = require('electron');
const sass = require('sass');
const chokidar = require('chokidar');
const path = require('path');
const fs = require('fs');
const WebSocket = require('ws');
const postcss = require('postcss');
const autoprefixer = require('autoprefixer');
const { exec } = require('child_process');

const MAX_LOGS = 50;

const App = {
    projects: [],
    activeProjectId: null,
    watchers: new Map(),
    wss: null,
    config: { native: true, web: true, autoprefixer: true },

    init() {
        const savedCfg = localStorage.getItem('dev_suite_cfg');
        if (savedCfg) this.config = JSON.parse(savedCfg);
        this.syncUIConfig();

        const savedProjects = localStorage.getItem('dev_projects');
        if (savedProjects) {
            this.projects = JSON.parse(savedProjects);
            this.projects.forEach(p => {
                if (p.inputDir && fs.existsSync(p.inputDir)) {
                    Watcher.start(p.id);
                }
            });
        }

        this.startSocket();
        UI.renderProjectList();

        if (this.projects.length > 0) {
            this.switchProject(this.projects[0].id);
        }
        UI.logSystem("Hệ thống Dev-QC Pro đã sẵn sàng.");
    },

    save() {
        localStorage.setItem('dev_projects', JSON.stringify(this.projects));
    },

    syncUIConfig() {
        const nativeCb = document.getElementById('cfg-native');
        const webCb = document.getElementById('cfg-web');
        const autoPrefixCb = document.getElementById('cfg-autoprefixer');
        if(nativeCb) nativeCb.checked = this.config.native;
        if(webCb) webCb.checked = this.config.web;
        if(autoPrefixCb) autoPrefixCb.checked = this.config.autoprefixer;
    },

    startSocket() {
        try {
            this.wss = new WebSocket.Server({ port: 3000 });
        } catch (e) { console.error("WS Port 3000 occupied."); }
    },

    createNewProject(name) {
        const newId = 'pj_' + Date.now();
        const finalName = name.trim() || `Project ${this.projects.length + 1}`;
        const newProject = {
            id: newId,
            name: finalName,
            inputDir: null,
            outputDir: null,
            mode: 'same',
            logs: []
        };
        this.projects.push(newProject);
        this.save();
        UI.renderProjectList();
        this.switchProject(newId);
        UI.log(newId, `Dự án "${finalName}" đã sẵn sàng.`, 'warn');
    },

    deleteProject(id, event) {
        event.stopPropagation();
        const project = this.projects.find(p => p.id === id);
        if (!project) return;
        if (confirm(`Bạn có chắc chắn muốn xóa dự án "${project.name}"?`)) {
            Watcher.stop(id);
            this.projects = this.projects.filter(p => p.id !== id);
            this.save();
            if (this.activeProjectId === id) {
                if (this.projects.length > 0) this.switchProject(this.projects[0].id);
                else this.resetWorkspace();
            }
            UI.renderProjectList();
        }
    },

    resetWorkspace() {
        this.activeProjectId = null;
        document.getElementById('active-project-name').innerText = "Select a Project";
        document.getElementById('active-project-path').innerText = "No directory selected";
        document.getElementById('txtIn').innerText = "Waiting for input...";
        UI.renderLogs([]);
        UI.updateStatus('stopped');
    },

    switchProject(id) {
        this.activeProjectId = id;
        const project = this.projects.find(p => p.id === id);
        if (!project) return;
        document.getElementById('active-project-name').innerText = project.name;
        document.getElementById('active-project-path').innerText = project.inputDir || "No directory selected";
        document.getElementById('txtIn').innerText = project.inputDir || "Waiting for input...";
        document.getElementById('txtOut').innerText = project.outputDir || "Same as source";
        window.setMode(project.mode);
        UI.renderLogs(project.logs);
        const isWatching = this.watchers.has(id);
        UI.updateStatus(isWatching ? 'watching' : 'stopped');
        UI.toggleBtn(isWatching ? 'stop' : 'resume');
        UI.renderProjectList();
    },

    getActiveProject() {
        return this.projects.find(p => p.id === this.activeProjectId);
    }
};

const Compiler = {
    // Hàm thực hiện biên dịch thực tế
    async compileAction(file, projectId) {
        const project = App.projects.find(p => p.id === projectId);
        if (!project) return;

        try {
            const target = this.getOutPath(file, project);
            const result = await sass.compileAsync(file, { 
                style: 'expanded', 
                sourceMap: true,
                loadPaths: [project.inputDir, path.dirname(file)] // Thêm path hiện tại để @use chính xác hơn
            });

            let finalCss = result.css;
            if (App.config.autoprefixer) {
                const processed = await postcss([autoprefixer]).process(finalCss, { from: undefined });
                finalCss = processed.css;
            }
            fs.writeFileSync(target, finalCss);
            
            this.markErrorAsFixed(project, file);
            UI.log(projectId, `Cập nhật thành công: ${path.basename(target)}`, 'success');

            if (App.config.web) {
                this.broadcast({ type: 'reload' }); 
            }
        } catch (e) {
            this.handleError(projectId, file, e);
        }
    },

    // Hàm điều hướng khi có sự thay đổi file
    async run(file, projectId) {
        const project = App.projects.find(p => p.id === projectId);
        if (!project || !project.inputDir) return;

        // Nếu là file partial (ví dụ: _variables.scss)
        if (path.basename(file).startsWith('_')) {
            UI.log(projectId, `Phát hiện thay đổi tại file con: ${path.basename(file)}`, 'warn');
            // Gọi hàm quét và biên dịch lại các file chính
            await this.recompileMainFiles(project.inputDir, projectId);
        } else if (file.endsWith('.scss')) {
            // Nếu là file chính, biên dịch trực tiếp
            await this.compileAction(file, projectId);
        }
    },

    // Quét đệ quy để tìm tất cả file .scss chính (không có _) và biên dịch chúng
    async recompileMainFiles(dir, projectId) {
        const items = fs.readdirSync(dir);
        
        for (const item of items) {
            const fullPath = path.join(dir, item);
            const stat = fs.statSync(fullPath);

            if (stat.isDirectory()) {
                if (item !== 'node_modules' && !item.startsWith('.')) {
                    await this.recompileMainFiles(fullPath, projectId);
                }
            } else {
                // Chỉ biên dịch những file .scss KHÔNG bắt đầu bằng dấu _
                if (item.endsWith('.scss') && !item.startsWith('_')) {
                    // Gọi compileAction trực tiếp để tránh vòng lặp kiểm tra _
                    await this.compileAction(fullPath, projectId);
                }
            }
        }
    },

    // --- Các hàm phụ trợ giữ nguyên ---
    markErrorAsFixed(project, file) {
        let hasChanges = false;
        project.logs.forEach(log => {
            if (log.type === 'error' && log.fullPath === file && !log.isFixed) {
                log.isFixed = true;
                hasChanges = true;
            }
        });
        if (hasChanges && App.activeProjectId === project.id) {
            UI.renderLogs(project.logs);
        }
    },

    getOutPath(file, project) {
        if (project.mode === 'custom' && project.outputDir) {
            const rel = path.relative(project.inputDir, file);
            const target = path.join(project.outputDir, rel.replace(/\.scss$/i, '.css'));
            if (!fs.existsSync(path.dirname(target))) fs.mkdirSync(path.dirname(target), { recursive: true });
            return target;
        }
        return file.replace(/\.scss$/i, '.css');
    },

    broadcast(data) {
        if (App.wss) {
            App.wss.clients.forEach(c => {
                if (c.readyState === WebSocket.OPEN) c.send(JSON.stringify(data));
            });
        }
    },

    handleError(projectId, file, e) {
        const line = e.span ? e.span.start.line + 1 : 1;
        let rawMsg = e.message.replace(/\x1B\[[0-9;]*[mK]/g, '');
        const cleanMsg = rawMsg.split('╷')[0].trim(); 
        const msg = `${path.basename(file)} (Dòng ${line}): ${cleanMsg}`;
        
        UI.log(projectId, msg, 'error', file, line);
        if (App.config.web) this.broadcast({ type: 'error', message: msg });
        if (App.config.native) new Notification("Sass Compile Error", { body: msg });
    }
};

const Watcher = {
    start(projectId) {
        const project = App.projects.find(p => p.id === projectId);
        if (!project || !project.inputDir) return;
        if (App.watchers.has(projectId)) App.watchers.get(projectId).close();
        const w = chokidar.watch(project.inputDir, {
            ignored: [/(^|[\/\\])\../, '**/node_modules/**', '**/.git/**'],
            persistent: true, ignoreInitial: true,
            awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 }
        });
        w.on('add', f => Compiler.run(f, projectId))
         .on('change', f => Compiler.run(f, projectId))
         .on('unlink', f => {
            const t = Compiler.getOutPath(f, project);
            if(fs.existsSync(t)) {
                fs.unlinkSync(t);
                UI.log(projectId, `Đã gỡ bỏ: ${path.basename(t)}`, 'warn');
            }
         });
        App.watchers.set(projectId, w);
        if (App.activeProjectId === projectId) {
            UI.updateStatus('watching');
            UI.toggleBtn('stop');
        }
    },
    stop(projectId) {
        if (App.watchers.has(projectId)) {
            App.watchers.get(projectId).close();
            App.watchers.delete(projectId);
            if (App.activeProjectId === projectId) {
                UI.updateStatus('stopped'); UI.toggleBtn('resume');
                UI.log(projectId, "Đã tạm dừng Engine.", "warn");
            }
        }
    }
};

const UI = {
    log: (projectId, m, type = '', fullPath = '', line = 1) => {
        const project = App.projects.find(p => p.id === projectId);
        if (!project) return;
        const logEntry = {
            time: new Date().toLocaleTimeString([], { hour12: false }),
            msg: m, type: type, fullPath: fullPath, line: line, isFixed: false
        };
        project.logs.push(logEntry);
        if (project.logs.length > MAX_LOGS) project.logs.shift();
        if (App.activeProjectId === projectId) UI.appendLogToDOM(logEntry);
        App.save();
    },

    logSystem: (m) => { if (App.activeProjectId) UI.log(App.activeProjectId, m, 'warn'); },

    appendLogToDOM: (entry) => {
        const container = document.getElementById('logs');
        if (!container) return;
        
        const typeClass = entry.type === 'success' ? 'log-success' : (entry.type === 'error' ? 'log-error' : 'log-warn');
        const fixedClass = entry.isFixed ? 'is-fixed' : '';
        const div = document.createElement('div');
        div.className = `log-entry ${typeClass} ${fixedClass}`;
        
        // Phần nội dung log chính
        let html = `
            <div class="log-main-row">
                <span class="log-time">${entry.time}</span>
                <span class="log-msg">
                    ${entry.msg} 
                    ${entry.isFixed ? '<span class="fixed-label">ĐÃ FIX</span>' : ''}
                </span>
            </div>
        `;
    
        // Phần đường dẫn VS Code: Cấu trúc lại để dễ căn lề
        if (entry.fullPath && entry.type === 'error') {
            html += `
                <div class="error-actions">
                    <span class="clickable-path" onclick="UI.openInEditor('${entry.fullPath.replace(/\\/g, '/')}', ${entry.line})">
                        ➜ Mở trong VS Code (Dòng ${entry.line})
                    </span>
                    <span class="path-help-trigger" onclick="UI.showPathGuide(event)">?</span>
                </div>
            `;
        }
        
        div.innerHTML = html;
        container.appendChild(div);
        container.scrollTop = container.scrollHeight;
    },

    showPathGuide: (e) => {
        e.stopPropagation();
        alert("Để mở file nhanh:\n1. Mở VS Code\n2. Nhấn Cmd/Ctrl + Shift + P\n3. Gõ: 'install code command in PATH'\n4. Chọn dòng đó và nhấn Enter.");
    },

    openInEditor: (filePath, line) => {
        if (!filePath) return;
        const command = `code -g "${filePath}:${line}"`;
        exec(command, (err) => {
            if (err) {
                alert("Không thể mở VS Code. Hãy kiểm tra cài đặt PATH (nhấn dấu ? để xem hướng dẫn).");
            }
        });
    },

    renderLogs: (logs) => {
        const container = document.getElementById('logs');
        container.innerHTML = '';
        logs.forEach(log => UI.appendLogToDOM(log));
    },

    renderProjectList: () => {
        const container = document.getElementById('project-list');
        if(!container) return;
        container.innerHTML = '';
        App.projects.forEach(p => {
            const item = document.createElement('div');
            item.className = `project-item ${App.activeProjectId === p.id ? 'active' : ''}`;
            item.innerHTML = `
                <div class="project-item-wrap">
                    <div class="avatar">${p.name.substring(0, 2).toUpperCase()}</div>
                    <div class="name-box">
                        <div class="name">${p.name}</div>
                        <div class="dir-hint">${p.inputDir ? path.basename(p.inputDir) : 'No folder'}</div>
                    </div>
                </div>
                <div class="delete-btn" onclick="App.deleteProject('${p.id}', event)">×</div>
            `;
            item.onclick = () => App.switchProject(p.id);
            container.appendChild(item);
        });
    },

    updateStatus: (s) => {
        const text = document.getElementById('status');
        const dot = document.getElementById('status-dot');
        if (text) text.innerText = s.toUpperCase();
        if (dot) dot.style.background = (s === 'watching') ? '#10b981' : '#ef4444';
    },

    toggleBtn: (m) => {
        const s = document.getElementById('btnStop');
        const r = document.getElementById('btnResume');
        if (s) s.style.display = (m === 'stop') ? 'block' : 'none';
        if (r) r.style.display = (m === 'resume') ? 'block' : 'none';
    },

    initialScan: (dir, projectId) => {
        let count = 0; // Biến đếm file
        try {
            const files = fs.readdirSync(dir);
            files.forEach(f => {
                const fp = path.join(dir, f);
                const stat = fs.statSync(fp);
                if (stat.isDirectory()) {
                    if (f !== 'node_modules' && !f.startsWith('.')) {
                        // Cộng dồn kết quả từ thư mục con
                        count += UI.initialScan(fp, projectId);
                    }
                } else if (f.endsWith('.scss')) {
                    Compiler.run(fp, projectId);
                    count++; // Tìm thấy 1 file
                }
            });
        } catch(e) {}
        return count; // Trả về tổng số file tìm thấy
    },

    showProjectModal: () => {
        const modal = document.getElementById('project-modal');
        const input = document.getElementById('new-project-name');
        const warning = document.getElementById('ram-warning');
        modal.style.display = 'flex';
        if (App.projects.length >= 4) warning.style.display = 'block';
        else warning.style.display = 'none';
        input.value = `Project ${App.projects.length + 1}`;
        input.focus(); input.select();
    },

    hideProjectModal: () => { document.getElementById('project-modal').style.display = 'none'; }
};

// --- EVENTS ---
window.setMode = async (m) => {
    const project = App.getActiveProject();
    if (!project) return;

    const oldMode = project.mode;
    project.mode = m;
    App.save();

    // Cập nhật giao diện
    document.getElementById('modeSame').classList.toggle('active', m === 'same');
    document.getElementById('modeCustom').classList.toggle('active', m === 'custom');
    document.getElementById('outputCard').style.visibility = (m === 'custom') ? 'visible' : 'hidden';

    // Xử lý biên dịch hàng loạt để đồng bộ hóa
    if (oldMode !== m && project.inputDir) {
        if (m === 'custom' && !project.outputDir) {
            UI.log(project.id, "Lưu ý: Bạn cần chọn TARGET CSS để hoàn tất cấu trúc Custom.", "warn");
            return;
        }

        UI.log(project.id, `Đang đồng bộ hóa toàn bộ sang chế độ: ${m.toUpperCase()}...`, 'warn');
        
        // BIÊN DỊCH HÀNG LOẠT NGAY TẠI ĐÂY
        await Compiler.recompileMainFiles(project.inputDir, project.id);
        
        UI.log(project.id, `Đã đồng bộ hóa xong tất cả các file.`, 'success');
    }
};

window.showTab = (id) => {
    document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
    document.getElementById(`tab-${id}`).style.display = 'flex';
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    document.getElementById(`nav-${id}`).classList.add('active');
    if (id === 'visual-diff') {
        const wrapper = document.getElementById('visual-diff-wrapper');
        
        if (wrapper && wrapper.innerHTML.trim() === "") {
            try {
                const htmlPath = path.join(__dirname, '../ui/features/visual-diff.html');
                const htmlContent = fs.readFileSync(htmlPath, 'utf8');
                wrapper.innerHTML = htmlContent;
                setTimeout(() => {
                    if (typeof window.initVisualDiff === 'function') {
                        window.initVisualDiff();
                    }
                }, 50);
            } catch (err) {
                console.error("Lỗi nạp file visual-diff.html:", err);
            }
        }
    }
    if (id === 'codelab') {
        const wrapper = document.getElementById('codelab-container'); // Container trong index.html
        
        if (wrapper && wrapper.innerHTML.trim() === "") {
            try {
                // Đường dẫn tới file codeLab.html
                const htmlPath = path.join(__dirname, '../ui/features/codeLab.html');
                const htmlContent = fs.readFileSync(htmlPath, 'utf8');
                wrapper.innerHTML = htmlContent;

                // Sau khi nạp HTML, gọi hàm init từ file codeLab.js
                setTimeout(() => {
                    if (typeof window.initCodeLab === 'function') {
                        window.initCodeLab();
                    }
                }, 50);
            } catch (err) {
                console.error("Lỗi nạp file codeLab.html:", err);
            }
        }
    }
};

window.showModuleSettings = (id, event) => {
    document.querySelectorAll('.mod-settings-panel').forEach(p => p.style.display = 'none');
    document.getElementById(`mod-settings-${id}`).style.display = 'block';
    document.querySelectorAll('.mod-btn').forEach(b => b.classList.remove('active'));
    event.currentTarget.classList.add('active');
};

document.getElementById('btnIn').addEventListener('click', async () => {
    if (App.projects.length === 0) { UI.showProjectModal(); return; }
    const project = App.getActiveProject();
    if (!project) return;
    const res = await ipcRenderer.invoke('select-folder');
    if (!res.canceled) {
        project.inputDir = res.filePaths[0];
        document.getElementById('txtIn').innerText = project.inputDir;
        document.getElementById('active-project-path').innerText = project.inputDir;
        App.save(); UI.renderProjectList();
        
        UI.log(project.id, "Bắt đầu quét thư mục...", 'warn');
        
        // Thực hiện quét và lấy số lượng file
        const foundFiles = UI.initialScan(project.inputDir, project.id);
        
        if (foundFiles === 0) {
            // Log ra lỗi nếu không tìm thấy file .scss
            UI.log(project.id, "Lỗi: Thư mục này không chứa bất kỳ file .scss nào!", 'error');
            if (App.config.native) new Notification("Dev-QC Pro", { body: "Không tìm thấy file .scss trong thư mục đã chọn." });
        } else {
            UI.log(project.id, `Đã tìm thấy và xử lý ${foundFiles} file .scss.`, 'success');
        }

        Watcher.start(project.id);
    }
});

document.getElementById('btnOut').addEventListener('click', async () => {
    const project = App.getActiveProject(); 
    if (!project) return;

    const res = await ipcRenderer.invoke('select-folder');
    if (!res.canceled) {
        project.outputDir = res.filePaths[0];
        document.getElementById('txtOut').innerText = project.outputDir;
        App.save(); 
        
        UI.log(project.id, `Mục tiêu mới đã được xác định. Đang khởi tạo file CSS...`, 'warn');
        
        // CHẠY BIÊN DỊCH HÀNG LOẠT
        await Compiler.recompileMainFiles(project.inputDir, project.id);
        
        UI.log(project.id, `Đã xuất toàn bộ CSS sang thư mục mới thành công.`, 'success');
    }
});

document.getElementById('confirm-project-btn').addEventListener('click', () => {
    const name = document.getElementById('new-project-name').value;
    UI.hideProjectModal(); App.createNewProject(name);
});

document.getElementById('btnStop').addEventListener('click', () => Watcher.stop(App.activeProjectId));
document.getElementById('btnResume').addEventListener('click', () => {
    Watcher.start(App.activeProjectId);
    UI.log(App.activeProjectId, "Engine đã hoạt động trở lại.", "success");
});window.clearLogs = () => {
    const project = App.getActiveProject();
    if (project) { project.logs = []; App.save(); UI.renderLogs([]); }
};
window.saveCfg = () => {
    App.config.native = document.getElementById('cfg-native').checked;
    App.config.web = document.getElementById('cfg-web').checked;
    App.config.autoprefixer = document.getElementById('cfg-autoprefixer').checked;
    localStorage.setItem('dev_suite_cfg', JSON.stringify(App.config));
};

App.init();