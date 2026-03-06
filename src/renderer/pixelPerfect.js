{
    const { ipcRenderer, clipboard } = require('electron');

    window.PixelPerfect = {
        state: { 
            opacity: 0.5, scale: 1, isLocked: false, src: '', mode: 'normal',
            lastClipboardImage: null, previewZoom: 1,
            imgW: 0, imgH: 0, 
            crop: { x: 0, y: 0, w: 300, h: 200 },
            isPickingFile: false
        },

        init() {
            const dropZone = document.getElementById('pp-drop-zone');
            const btnRemove = document.getElementById('pp-btn-remove');
            const btnLoadUrl = document.getElementById('pp-load-url');
            const urlInp = document.getElementById('pp-url-input');
            const cropBox = document.getElementById('pp-crop-box');
            const btnResetEditor = document.getElementById('pp-editor-reset-all');
            const scaleInp = document.getElementById('pp-range-scale');
            
            if (scaleInp) {
                scaleInp.oninput = (e) => {
                    const val = e.target.value;
                    document.getElementById('val-scale').innerText = val + '%';
                    // state.scale sẽ là hệ số từ 0.1 đến 2.0
                    this.state.scale = val / 100; 
                    
                    // Quan trọng: Khi scale, ta chỉ cần đồng bộ lệnh sang Overlay
                    this.sendControl();
                };
            }

            // --- 1. CLIPBOARD & PASTE ---
            window.onfocus = () => {
                if (this.state.isPickingFile) return; 
                const tab = document.getElementById('tab-pixel-perfect');
                if (tab && tab.style.display === 'flex') this.checkClipboardAndLoad();
            };

            window.addEventListener('paste', () => {
                const tab = document.getElementById('tab-pixel-perfect');
                if (tab && tab.style.display === 'flex') this.checkClipboardAndLoad();
            });

            // --- 2. NẠP / XOÁ ẢNH ---
            if (btnLoadUrl) {
                btnLoadUrl.onclick = () => {
                    const val = urlInp.value.trim();
                    if (val) {
                        this.state.src = val.startsWith('http') ? val : `local-media://${val}`;
                        this.updateUIStatus(true);
                        this.openOverlay();
                    }
                };
            }            

            if (dropZone) {
                dropZone.onclick = (e) => {
                    if (e.target.closest('.pp-remove-btn')) return;
                    this.triggerUpload();
                };
            }

            if (btnRemove) {
                btnRemove.onclick = (e) => {
                    e.stopPropagation();
                    this.clearMockup();
                };
            }

            // --- 3. ĐIỀU CHỈNH VISUAL ---
            document.getElementById('pp-range-opacity').oninput = (e) => {
                const val = e.target.value;
                document.getElementById('val-opacity').innerText = val + '%';
                this.state.opacity = val / 100;
                this.sendControl();
            };

            document.getElementById('pp-range-scale').oninput = (e) => {
                const val = e.target.value;
                document.getElementById('val-scale').innerText = val + '%';
                this.state.scale = val / 100;
                this.sendControl();
            };

            // --- 4. MODE & LOCK ---
            document.getElementById('pp-btn-lock').onclick = (e) => {
                this.state.isLocked = !this.state.isLocked;
                const btn = e.currentTarget;
                btn.classList.toggle('btn-success', this.state.isLocked);
                btn.querySelector('span').innerText = this.state.isLocked ? 'Locked' : 'Lock & Pass-through';
                btn.querySelector('i').className = this.state.isLocked ? 'fa-solid fa-lock' : 'fa-solid fa-unlock';
                ipcRenderer.send('set-ignore-mouse', this.state.isLocked);
                this.sendControl();
            };

            document.getElementById('pp-mode-normal').onclick = () => {
                this.state.mode = 'normal';
                this.toggleModeUI('pp-mode-normal');
                this.sendControl();
            };

            document.getElementById('pp-mode-diff').onclick = () => {
                this.state.mode = 'diff';
                this.toggleModeUI('pp-mode-diff');
                this.sendControl();
            };

            // --- 5. EDITOR: STRETCH & ZOOM ---
            document.getElementById('pp-edit-w').oninput = (e) => {
                const newW = parseInt(e.target.value) || 0;
                if (this.state.imgW > 0) {
                    const ratio = newW / this.state.imgW;
                    this.state.crop.w *= ratio;
                    this.state.crop.x *= ratio;
                }
                this.state.imgW = newW;
                this.applyTransform();
            };

            document.getElementById('pp-edit-h').oninput = (e) => {
                const newH = parseInt(e.target.value) || 0;
                if (this.state.imgH > 0) {
                    const ratio = newH / this.state.imgH;
                    this.state.crop.h *= ratio;
                    this.state.crop.y *= ratio;
                }
                this.state.imgH = newH;
                this.applyTransform();
            };

            document.getElementById('pp-preview-scale').oninput = (e) => {
                const zoom = e.target.value / 100;
                this.state.previewZoom = zoom;
                document.getElementById('val-preview-zoom').innerText = e.target.value + '%';
                document.getElementById('pp-editor-wrapper').style.transform = `scale(${zoom})`;
            };

            // --- 6. EDITOR: KÉO THẢ TỰ DO (BOX & HANDLES) ---
            let isDragging = false;
            let currentHandle = null;
            let startMouseX, startMouseY, startCrop;

            window.addEventListener('mousedown', (e) => {
                const handle = e.target.closest('.crop-handle');
                const isBox = e.target.closest('#pp-crop-box') && !handle;

                if (handle || isBox) {
                    isDragging = true;
                    currentHandle = handle ? handle.dataset.handle : 'move';
                    startMouseX = e.clientX;
                    startMouseY = e.clientY;
                    startCrop = { ...this.state.crop };
                    e.preventDefault();
                }
            });

            window.addEventListener('mousemove', (e) => {
                if (!isDragging) return;
            
                // Tính toán độ di chuyển chuột, có bù trừ tỉ lệ zoom preview
                const dx = (e.clientX - startMouseX) / this.state.previewZoom;
                const dy = (e.clientY - startMouseY) / this.state.previewZoom;
            
                // Lấy kích thước ảnh giới hạn
                const { imgW, imgH } = this.state;
                let { x, y, w, h } = startCrop;
                const minSize = 20; // Kích thước tối thiểu của khung crop
            
                // --- LOGIC MỚI: Ràng buộc chặt chẽ từng hành động ---
            
                if (currentHandle === 'move') {
                    // 1. Di chuyển cả khung
                    let newX = x + dx;
                    let newY = y + dy;
                    // Ràng buộc không cho chạy ra ngoài biên ảnh
                    x = Math.max(0, Math.min(newX, imgW - w));
                    y = Math.max(0, Math.min(newY, imgH - h));
            
                } else {
                    // 2. Thay đổi kích thước (Kéo các điểm neo)
            
                    // Xử lý cạnh TRÁI (West)
                    if (currentHandle.includes('w')) {
                        let newX = x + dx;
                        // Chặn không cho < 0
                        if (newX < 0) newX = 0; 
                        // Chặn không cho chiều rộng < minSize
                        if (startCrop.x + startCrop.w - newX < minSize) newX = startCrop.x + startCrop.w - minSize;
                        
                        w = startCrop.x + startCrop.w - newX;
                        x = newX;
                    }
                    // Xử lý cạnh PHẢI (East)
                    else if (currentHandle.includes('e')) {
                        let newW = w + dx;
                        // Chặn không cho vượt quá chiều rộng ảnh
                        if (x + newW > imgW) newW = imgW - x;
                        // Chặn minSize
                        w = Math.max(minSize, newW);
                    }
            
                    // Xử lý cạnh TRÊN (North)
                    if (currentHandle.includes('n')) {
                        let newY = y + dy;
                        // Chặn không cho < 0
                        if (newY < 0) newY = 0;
                        // Chặn chiều cao < minSize
                        if (startCrop.y + startCrop.h - newY < minSize) newY = startCrop.y + startCrop.h - minSize;
            
                        h = startCrop.y + startCrop.h - newY;
                        y = newY;
                    }
                    // Xử lý cạnh DƯỚI (South)
                    else if (currentHandle.includes('s')) {
                        let newH = h + dy;
                        // Chặn không cho vượt quá chiều cao ảnh
                        if (y + newH > imgH) newH = imgH - y;
                        // Chặn minSize
                        h = Math.max(minSize, newH);
                    }
                }
            
                // Cập nhật state và đồng bộ
                this.state.crop = { x, y, w, h };
                this.updateCropUI();
                this.syncToOverlay();
            });

            window.addEventListener('mouseup', () => isDragging = false);

            document.getElementById('pp-crop-w').oninput = (e) => {
                this.state.crop.w = parseInt(e.target.value) || 20;
                this.updateCropUI();
                this.syncToOverlay();
            };
            document.getElementById('pp-crop-h').oninput = (e) => {
                this.state.crop.h = parseInt(e.target.value) || 20;
                this.updateCropUI();
                this.syncToOverlay();
            };

            if (btnResetEditor) btnResetEditor.onclick = () => this.resetToOriginal();

            // --- 7. HỆ THỐNG & ĐỒNG BỘ ---
            document.getElementById('pp-reset').onclick = () => this.clearMockup();

            window.addEventListener('keydown', (e) => {
                const tab = document.getElementById('tab-pixel-perfect');
                if (tab && tab.style.display === 'flex') {
                    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                        this.nudge(e.key.replace('Arrow', '').toLowerCase());
                    }
                }
            });

            ipcRenderer.on('overlay-closed-sync', () => this.clearUIOnly());
        },

        // --- CORE FUNCTIONS ---
        applyTransform() {
            const previewImg = document.getElementById('pp-preview-img');
            const wrapper = document.getElementById('pp-editor-wrapper');
            
            previewImg.style.width = this.state.imgW + 'px';
            previewImg.style.height = this.state.imgH + 'px';
            wrapper.style.width = this.state.imgW + 'px';
            wrapper.style.height = this.state.imgH + 'px';

            this.updateCropUI();
            this.syncToOverlay();
        },

        autoFitPreview() {
            const container = document.getElementById('pp-canvas-viewport');
            const { imgW, imgH } = this.state;
            if (!imgW || !imgH || !container) return;
        
            const padding = 40;
            const fitZoom = Math.min((container.offsetWidth - padding) / imgW, (container.offsetHeight - padding) / imgH, 1);
            
            this.state.previewZoom = fitZoom;
            const zoomPercent = Math.round(fitZoom * 100);
            document.getElementById('pp-preview-scale').value = zoomPercent;
            document.getElementById('val-preview-zoom').innerText = zoomPercent + '%';
            document.getElementById('pp-editor-wrapper').style.transform = `scale(${fitZoom})`;
        },

        updateCropUI() {
            const cropBox = document.getElementById('pp-crop-box');
            if (cropBox) {
                cropBox.style.left = this.state.crop.x + 'px';
                cropBox.style.top = this.state.crop.y + 'px';
                cropBox.style.width = this.state.crop.w + 'px';
                cropBox.style.height = this.state.crop.h + 'px';
                document.getElementById('crop-w-badge').innerText = Math.round(this.state.crop.w);
                document.getElementById('crop-h-badge').innerText = Math.round(this.state.crop.h);
                document.getElementById('pp-crop-w').value = Math.round(this.state.crop.w);
                document.getElementById('pp-crop-h').value = Math.round(this.state.crop.h);
            }
        },

        syncToOverlay() {
            const inset = {
                top: this.state.crop.y,
                left: this.state.crop.x,
                bottom: Math.max(0, this.state.imgH - (this.state.crop.y + this.state.crop.h)),
                right: Math.max(0, this.state.imgW - (this.state.crop.x + this.state.crop.w))
            };
            
            ipcRenderer.send('control-overlay', {
                ...this.state,
                width: this.state.imgW,       // Chiều rộng ảnh gốc sau khi stretch
                height: this.state.imgH,      // Chiều cao ảnh gốc sau khi stretch
                cropInset: inset,             // Vùng cắt trên ảnh gốc
                scale: this.state.scale,      // Hệ số thu phóng (Zoom)
                cropSize: { 
                    w: this.state.crop.w, 
                    h: this.state.crop.h 
                }
            });
        },

        updateUIStatus(hasImage) {
            const idle = document.querySelector('.pp-upload-idle');
            const active = document.querySelector('.pp-upload-active');
            const preview = document.getElementById('pp-preview-img');

            if (hasImage) {
                idle.style.display = 'none';
                active.style.display = 'flex';
                document.getElementById('pp-thumbnail').src = this.state.src;
                preview.src = this.state.src;

                preview.onload = () => {
                    this.state.imgW = preview.naturalWidth;
                    this.state.imgH = preview.naturalHeight;
                    this.state.crop = { x: 0, y: 0, w: this.state.imgW, h: this.state.imgH };

                    document.getElementById('pp-edit-w').value = this.state.imgW;
                    document.getElementById('pp-edit-h').value = this.state.imgH;
                    
                    this.autoFitPreview();
                    this.applyTransform();
                };
            } else {
                idle.style.display = 'flex';
                active.style.display = 'none';
                preview.src = '';
            }
        },

        resetToOriginal() {
            const preview = document.getElementById('pp-preview-img');
            if (preview && preview.src) this.updateUIStatus(true);
        },

        checkClipboardAndLoad() {
            const image = clipboard.readImage();
            if (image.isEmpty()) return;
            const dataUrl = image.toDataURL();
            if (dataUrl !== this.state.lastClipboardImage) {
                this.state.src = dataUrl;
                this.state.lastClipboardImage = dataUrl;
                this.updateUIStatus(true);
                this.openOverlay();
            }
        },

        async triggerUpload() {
            this.state.isPickingFile = true; // Bật flag chặn clipboard
            const filePath = await ipcRenderer.invoke('select-file');
            
            if (filePath) {
                this.state.lastClipboardImage = null; // Xóa bộ nhớ ảnh clipboard cũ
                this.state.src = `local-media://${filePath}`;
                this.updateUIStatus(true);
                this.openOverlay();
            }
            
            // Để một khoảng nghỉ ngắn trước khi cho phép clipboard nhận diện lại
            setTimeout(() => { this.state.isPickingFile = false; }, 500);
        },

        clearUIOnly() {
            this.state.src = '';
            this.state.lastClipboardImage = null;
            this.updateUIStatus(false);
        },

        clearMockup() {
            this.clearUIOnly();
            ipcRenderer.send('close-overlay');
        },

        toggleModeUI(id) {
            document.querySelectorAll('.pp-mode-btn').forEach(b => b.classList.remove('active'));
            const btn = document.getElementById(id);
            if (btn) btn.classList.add('active');
        },

        async openOverlay() {
            await ipcRenderer.invoke('open-overlay', this.state.src);
        },

        sendControl() { this.syncToOverlay(); },
        reCenter() { ipcRenderer.send('center-overlay'); },
        nudge(dir) { ipcRenderer.send('nudge-overlay', dir); }
    };
}