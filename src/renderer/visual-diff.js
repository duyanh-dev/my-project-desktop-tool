{
    const pm = require('pixelmatch');
    const pixelmatch = pm.default || pm;
    const path = require('path');
    const { webUtils, ipcRenderer } = require('electron');

    let pathDesign = null;
    let pathActual = null;
    let scale = 1;
    let isPanning = false;
    let startX, startY, scrollLeft, scrollTop;

    window.initVisualDiff = function() {
        console.log("🚀 Visual Diff System Initializing...");
        const container = document.querySelector('.display-container');

        // 1. Slider Wipe Logic
        const slider = document.getElementById('slider-range');
        if (slider) {
            slider.oninput = (e) => {
                const val = e.target.value;
                const designLayer = document.querySelector('.img-layer.design');
                if (designLayer) designLayer.style.width = `${(1920 * val) / 100}px`;
            };
            slider.onmousedown = (e) => e.stopPropagation(); 
        }

        // 2. Zoom thông minh
        container.onwheel = (e) => {
            if (e.altKey || e.ctrlKey) {
                e.preventDefault();
                const delta = e.deltaY > 0 ? -0.1 : 0.1;
                const minScale = container.clientWidth / 1920; 
                scale = Math.min(Math.max(minScale, scale + delta), 4);
                applyTransform();
            }
        };

        // 3. Panning
        container.onmousedown = (e) => {
            if (e.target.id === 'slider-range' || e.button !== 0) return;
            isPanning = true;
            container.style.cursor = 'grabbing';
            startX = e.pageX - container.offsetLeft;
            startY = e.pageY - container.offsetTop;
            scrollLeft = container.scrollLeft;
            scrollTop = container.scrollTop;
        };

        window.onmouseup = () => {
            isPanning = false; 
            if(container) container.style.cursor = 'default';
        };

        container.onmousemove = (e) => {
            if (!isPanning) return;
            container.scrollLeft = scrollLeft - (e.pageX - container.offsetLeft - startX);
            container.scrollTop = scrollTop - (e.pageY - container.offsetTop - startY);
        };

        setupDropZone('design');
        setupDropZone('actual');
    };

    function applyTransform() {
        const targets = ['.slider-wrapper', '#diff-canvas', '.ghost-container'];
        targets.forEach(sel => {
            const el = document.querySelector(sel);
            if (el) {
                el.style.transform = `scale(${scale})`;
                el.style.transformOrigin = '0 0';
            }
        });
    }

    // --- HÀM PHÂN TÍCH CHÍNH ---
    async function runComparison() {
        const threshold = parseFloat(document.getElementById('diff-threshold').value);
        const btn = document.getElementById('btn-run-compare');
        btn.innerText = "ĐANG TÍNH...";

        const imgD = await loadImage(pathDesign);
        const imgA = await loadImage(pathActual);

        const width = Math.max(imgD.width, imgA.width);
        const height = Math.max(imgD.height, imgA.height);

        // Chuẩn hóa kích thước khung chứa
        ['.slider-wrapper', '.ghost-container', '#diff-canvas'].forEach(sel => {
            const el = document.querySelector(sel);
            if (el) { el.style.width = `${width}px`; el.style.height = `${height}px`; }
        });

        const canvasD = createNormalizedCanvas(imgD, width, height);
        const canvasA = createNormalizedCanvas(imgA, width, height);
        
        const diffCanvas = document.getElementById('diff-canvas');
        diffCanvas.width = width;
        diffCanvas.height = height;
        const diffCtx = diffCanvas.getContext('2d');
        const diffData = diffCtx.createImageData(width, height);

        // 1. THỰC HIỆN SO SÁNH PIXEL
        const numDiffPixels = pixelmatch(
            canvasD.getContext('2d').getImageData(0,0,width,height).data,
            canvasA.getContext('2d').getImageData(0,0,width,height).data,
            diffData.data, width, height, { threshold }
        );

        // 2. TÌM VÙNG LỖI (Bounding Boxes)
        const regions = findMismatchRegions(diffData, width, height);

        // 3. VẼ KẾT QUẢ HIGHLIGHT (Thứ tự lớp: Nền -> Vùng Đỏ -> Ô Vàng)
        diffCtx.clearRect(0, 0, width, height);
        
        // Lớp 1: Nền Actual Trắng Đen
        diffCtx.filter = 'grayscale(100%) opacity(30%)'; 
        diffCtx.drawImage(canvasA, 0, 0); 
        diffCtx.filter = 'none';

        // Lớp 2: Vùng đỏ (Dùng canvas tạm để không bị đè mất nền)
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = width; tempCanvas.height = height;
        tempCanvas.getContext('2d').putImageData(diffData, 0, 0);
        diffCtx.drawImage(tempCanvas, 0, 0);

        // Lớp 3: Vẽ khung và nhãn Pixel
        diffCtx.strokeStyle = '#ffff00';
        diffCtx.lineWidth = 2;
        diffCtx.font = 'bold 14px Arial';

        regions.forEach(reg => {
            diffCtx.strokeRect(reg.x - 2, reg.y - 2, reg.w + 4, reg.h + 4);
            
            const label = `${reg.w}px × ${reg.h}px`;
            const labelWidth = diffCtx.measureText(label).width;
            
            diffCtx.fillStyle = 'rgba(0,0,0,0.8)';
            diffCtx.fillRect(reg.x - 2, reg.y - 25, labelWidth + 10, 20);
            
            diffCtx.fillStyle = '#ffff00';
            diffCtx.fillText(label, reg.x + 2, reg.y - 10);
        });

        // 4. CẬP NHẬT GIAO DIỆN
        const urlD = `url('file://${pathDesign.replace(/\\/g, '/')}')`;
        const urlA = `url('file://${pathActual.replace(/\\/g, '/')}')`;
        document.querySelectorAll('.img-layer.design').forEach(el => el.style.backgroundImage = urlD);
        document.querySelectorAll('.img-layer.actual').forEach(el => el.style.backgroundImage = urlA);
        
        document.getElementById('result-area').style.display = 'block';
        document.getElementById('diff-percent').innerText = ((numDiffPixels / (width * height)) * 100).toFixed(2) + "%";
        document.getElementById('diff-pixels').innerText = numDiffPixels.toLocaleString();
        btn.innerHTML = '<i class="fa-solid fa-bolt"></i><br>PHÂN TÍCH XONG';
        document.getElementById('result-area').scrollIntoView({ behavior: 'smooth' });
    }

    // --- CÁC TÍNH NĂNG PHỤ TRỢ ---

    function findMismatchRegions(diffData, width, height) {
        const regions = [];
        const visited = new Uint8Array(width * height);
        const thresholdSize = 10; 

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = y * width + x;
                // Nếu là pixel đỏ (255, 0, 0)
                if (diffData.data[idx * 4] === 255 && diffData.data[idx * 4 + 1] === 0 && !visited[idx]) {
                    let minX = x, maxX = x, minY = y, maxY = y;
                    const stack = [[x, y]];
                    
                    while (stack.length > 0) {
                        const [cx, cy] = stack.pop();
                        const cidx = cy * width + cx;
                        if (cx < 0 || cx >= width || cy < 0 || cy >= height || visited[cidx] || diffData.data[cidx * 4] !== 255) continue;
                        
                        visited[cidx] = 1;
                        minX = Math.min(minX, cx); maxX = Math.max(maxX, cx);
                        minY = Math.min(minY, cy); maxY = Math.max(maxY, cy);
                        
                        stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
                    }

                    if ((maxX - minX) > thresholdSize || (maxY - minY) > thresholdSize) {
                        regions.push({ x: minX, y: minY, w: maxX - minX, h: maxY - minY });
                    }
                }
            }
        }
        return regions;
    }

    async function autoCaptureWeb() {
        const url = document.getElementById('web-url').value;
        if (!url) return alert("Vui lòng nhập URL!");
        const btn = event.currentTarget;
        btn.innerText = "ĐANG CHỤP...";
        btn.disabled = true;

        try {
            const base64Data = await ipcRenderer.invoke('capture-page', url);
            document.getElementById('preview-actual').src = base64Data;
            document.getElementById('preview-actual').style.display = 'block';
            
            const fs = require('fs');
            const tempPath = path.join(process.cwd(), `temp_actual_${Date.now()}.png`);
            fs.writeFileSync(tempPath, Buffer.from(base64Data.split(',')[1], 'base64'));
            
            pathActual = tempPath;
            document.getElementById('status-actual').innerText = "Đã chụp từ URL";
            checkReady();
            btn.innerHTML = '<i class="fa-solid fa-camera-retro"></i> CHỤP XONG';
        } catch (e) {
            alert("Lỗi: " + e.message);
        } finally { btn.disabled = false; }
    }

    window.exportAuditReport = function() {
        const diffCanvas = document.getElementById('diff-canvas');
        if (!diffCanvas) return alert("Phân tích trước!");

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const w = diffCanvas.width;
        const h = diffCanvas.height;
        
        canvas.width = w * 3; canvas.height = h + 150;
        ctx.fillStyle = "#12141d"; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#ffffff"; ctx.font = "bold 40px Segoe UI"; ctx.fillText("UI AUDIT REPORT", 50, 70);

        const imgD = new Image(); imgD.src = `file://${pathDesign}`;
        const imgA = new Image(); imgA.src = `file://${pathActual}`;

        Promise.all([new Promise(r => imgD.onload = r), new Promise(r => imgA.onload = r)]).then(() => {
            ctx.drawImage(imgD, 0, 150, w, h);
            ctx.drawImage(imgA, w, 150, w, h);
            ctx.drawImage(diffCanvas, w * 2, 150, w, h);
            const link = document.createElement('a');
            link.download = `report-${Date.now()}.png`;
            link.href = canvas.toDataURL();
            link.click();
        });
    };

    function createNormalizedCanvas(img, w, h) {
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = "#12141d"; ctx.fillRect(0,0,w,h);
        ctx.drawImage(img, 0, 0);
        return canvas;
    }

    function setupDropZone(type) {
        const zone = document.getElementById(`drop-${type}`);
        if(!zone) return;
        zone.ondrop = (e) => {
            e.preventDefault();
            const file = e.dataTransfer.files[0];
            if (file) {
                const filePath = webUtils.getPathForFile(file);
                if (type === 'design') pathDesign = filePath;
                else pathActual = filePath;
                document.getElementById(`status-${type}`).innerText = path.basename(filePath);
                document.getElementById(`preview-${type}`).src = `file://${filePath}`;
                document.getElementById(`preview-${type}`).style.display = 'block';
                checkReady();
            }
            return false;
        };
        zone.ondragover = () => false;
    }

    function checkReady() {
        if (pathDesign && pathActual) {
            const btn = document.getElementById('btn-run-compare');
            btn.disabled = false; btn.classList.add('ready');
        }
    }

    function loadImage(src) {
        return new Promise(res => { 
            const img = new Image(); 
            img.onload = () => res(img); 
            img.src = src.startsWith('data:') ? src : `file://${src}`; 
        });
    }

    window.autoCaptureWeb = autoCaptureWeb;
    window.runComparison = runComparison;
    window.switchDiffView = (view) => {
        document.querySelectorAll('.mode-view').forEach(v => v.style.display = 'none');
        const target = document.getElementById(`view-${view}`);
        if(target) target.style.display = 'block';
        document.querySelectorAll('.v-tab').forEach(b => b.classList.remove('active'));
        const btn = document.querySelector(`button[onclick*="'${view}'"]`);
        if(btn) btn.classList.add('active');
    };
}