window.initCodeLab = () => {
    const target = document.getElementById('cl-target');
    const handleLayer = document.getElementById('cl-handle-layer');
    const wrapper = document.getElementById('cl-clippy-wrapper');
    const shadowContainer = document.getElementById('cl-shadow-container');
    const gradList = document.getElementById('cl-gradient-list');
    const container = document.getElementById('tab-codelab');

    if (!container || !target || !wrapper || !shadowContainer) return;

    let currentMode = 'css';
    let points = [
        { x: 0, y: 0, r: 0, t: 0 }, 
        { x: 100, y: 0, r: 0, t: 0 }, 
        { x: 100, y: 100, r: 0, t: 0 }, 
        { x: 0, y: 100, r: 0, t: 0 }
    ];
    let gradientStops = ['#6366f1', '#a855f7'];
    let draggingIdx = null;

    // --- HELPER FUNCTIONS ---
    const hexToRgba = (hex, opacity) => {
        let r = 0, g = 0, b = 0;
        if (hex.length == 4) { r = "0x" + hex[1] + hex[1]; g = "0x" + hex[2] + hex[2]; b = "0x" + hex[3] + hex[3]; }
        else if (hex.length == 7) { r = "0x" + hex[1] + hex[2]; g = "0x" + hex[3] + hex[4]; b = "0x" + hex[5] + hex[6]; }
        return `rgba(${+r}, ${+g}, ${+b}, ${opacity})`;
    };

    const generateProceduralPoints = (type, numWaves, depth, roundness) => {
        let newPoints = [];
        const totalVertices = 200; 
    
        for (let i = 0; i < totalVertices; i++) {
            const angle = (i / totalVertices) * Math.PI * 2;
            let r = 35; 
    
            if (type === 'wavy') {
                let wave = Math.cos(angle * numWaves);
                const p = (100 - roundness) / 50; 
                r += Math.sign(wave) * Math.pow(Math.abs(wave), p) * (depth / 2);
            } 
            else if (type === 'flower') {
                r += Math.abs(Math.sin(angle * numWaves / 2)) * depth;
            }
            else if (type === 'burst') {
                r += (i % 2 === 0 ? depth : -depth);
            }
            else if (type === 'rounded') {
                let star = Math.abs(((angle * numWaves) / (2 * Math.PI)) % 1 - 0.5);
                r += (star > 0.25 ? depth : -depth) * (roundness / 100);
            }
    
            const x = 50 + r * Math.cos(angle);
            const y = 50 + r * Math.sin(angle);
            newPoints.push({ x, y });
        }
        return newPoints;
    };

    // Hàm tính toán đường cong tại một đỉnh
    const computeCorner = (p1, p2, p3, radius, type) => {
        if (radius <= 0 || type === 0) return [p2];

        const v1 = { x: p1.x - p2.x, y: p1.y - p2.y };
        const v2 = { x: p3.x - p2.x, y: p3.y - p2.y };
        const d1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
        const d2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);
        
        // Giới hạn bán kính không vượt quá nửa cạnh ngắn nhất
        const r = Math.min(radius / 2, d1 / 2, d2 / 2);

        const start = { x: p2.x + v1.x / d1 * r, y: p2.y + v1.y / d1 * r };
        const end = { x: p2.x + v2.x / d2 * r, y: p2.y + v2.y / d2 * r };

        let arcPoints = [];
        const steps = 10;
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            let cx, cy;
            
            if (type === 1) { // Bo ngoài (Convex) - Quadratic Bezier
                cx = (1 - t) * (1 - t) * start.x + 2 * (1 - t) * t * p2.x + t * t * end.x;
                cy = (1 - t) * (1 - t) * start.y + 2 * (1 - t) * t * p2.y + t * t * end.y;
            } else { // Bo trong (Concave/Inverted)
                // Lấy trung điểm của dây cung để làm tâm đảo ngược
                const midX = (start.x + end.x) / 2;
                const midY = (start.y + end.y) / 2;
                const invX = p2.x + (midX - p2.x) * 2;
                const invY = p2.y + (midY - p2.y) * 2;
                cx = (1 - t) * (1 - t) * start.x + 2 * (1 - t) * t * invX + t * t * end.x;
                cy = (1 - t) * (1 - t) * start.y + 2 * (1 - t) * t * invY + t * t * end.y;
            }
            arcPoints.push({ x: cx, y: cy });
        }
        return arcPoints;
    };

    // --- GRADIENT SYSTEM ---
    window.renderColorStops = () => {
        if (!gradList) return;
        gradList.innerHTML = '';
        gradientStops.forEach((color, idx) => {
            const row = document.createElement('div');
            row.className = 'cl-grad-stop';
            row.innerHTML = `
                <input type="color" value="${color}" oninput="updateColorStop(${idx}, this.value)">
                <span style="font-size: 10px; font-family: monospace; color: #adbac7;">Stop ${idx + 1}</span>
                ${gradientStops.length > 2 ? `<button class="cl-remove-stop" onclick="removeColorStop(${idx})"><i class="fa-solid fa-trash-can"></i></button>` : ''}
            `;
            gradList.appendChild(row);
        });
        updateAll();
    };

    window.addColorStop = () => {
        if (gradientStops.length < 5) { gradientStops.push('#ffffff'); renderColorStops(); }
    };

    window.updateColorStop = (idx, val) => { gradientStops[idx] = val; updateAll(); };
    window.removeColorStop = (idx) => { gradientStops.splice(idx, 1); renderColorStops(); };

    let editingIdx = null;

    // --- MAIN UPDATE ---
    function updateAll() {
        const getVal = (id) => document.getElementById(id)?.value;
        const getInt = (id) => parseInt(document.getElementById(id)?.value || 0);
    
        // 1. Lấy thông số từ UI
        const w = getVal('cl-width') || 320;
        const h = getVal('cl-height') || 320;
        const canvasBg = getVal('cl-bg-picker') || '#ffffff';
        const blur = getVal('glass-blur') || 10;
        const gOp = getVal('glass-opacity') || 0.2;
        const shadX = getVal('shadow-x') || 0;
        const shadY = getVal('shadow-y') || 20;
        const shadBlur = getVal('shadow-blur') || 30;
        const shadOp = getVal('shadow-opacity') || 0.4;
        const angle = getVal('grad-angle') || 45;
    
        // Engine Params
        const engineMode = getVal('cl-engine-mode') || 'manual';
        const numPoints = getInt('cl-shape-points');
        const depth = getInt('cl-shape-depth');
        const roundness = getInt('cl-shape-round');
        const rotate = getInt('cl-shape-rotate');
        const isInverted = document.getElementById('cl-invert-shape')?.checked;
    
        // BƯỚC 1: TÍNH TOÁN TẬP ĐIỂM CHI TIẾT (Xử lý bo góc nếu là manual)
        let basePts = [];
        if (engineMode === 'manual') {
            for (let i = 0; i < points.length; i++) {
                const prev = points[(i - 1 + points.length) % points.length];
                const curr = points[i];
                const next = points[(i + 1) % points.length];
                
                // Lấy các điểm tạo thành góc bo
                const cornerPoints = computeCorner(prev, curr, next, curr.r || 0, curr.t || 0);
                basePts.push(...cornerPoints);
            }
        } else {
            // Chế độ tự động (Wavy, Flower...)
            basePts = generateProceduralPoints(engineMode, numPoints, depth, roundness);
        }
    
        // BƯỚC 2: XOAY TỌA ĐỘ TRÊN TẬP ĐIỂM ĐÃ TÍNH TOÁN
        const rad = (rotate * Math.PI) / 180;
        const finalPoints = basePts.map(p => ({
            x: ((p.x - 50) * Math.cos(rad) - (p.y - 50) * Math.sin(rad) + 50).toFixed(2),
            y: ((p.x - 50) * Math.sin(rad) + (p.y - 50) * Math.cos(rad) + 50).toFixed(2)
        }));
    
        // BƯỚC 3: TẠO CHUỖI POLYGON (Xử lý cả trường hợp Invert)
        let finalClipPath = "";
        const pathString = finalPoints.map(p => `${p.x}% ${p.y}%`).join(', ');
    
        if (isInverted) {
            // Vẽ khung bao ngoài rồi vẽ ngược vào trong để tạo lỗ hổng
            finalClipPath = `polygon(0% 0%, 0% 100%, 100% 100%, 100% 0%, 0% 0%, ${pathString}, ${finalPoints[0].x}% ${finalPoints[0].y}%)`;
        } else {
            finalClipPath = `polygon(${pathString})`;
        }
    
        // BƯỚC 4: CẬP NHẬT GIAO DIỆN ĐIỀU KHIỂN (Visibility)
        if (engineMode === 'manual') {
            handleLayer.style.display = 'block';
            document.getElementById('cl-manual-controls').style.display = 'block';
            document.getElementById('cl-procedural-controls').style.display = 'none';
        } else {
            handleLayer.style.display = 'none';
            document.getElementById('cl-manual-controls').style.display = 'none';
            document.getElementById('cl-procedural-controls').style.display = 'block';
            
            // Cập nhật nhãn số liệu cho Procedural
            const updateLabel = (id, val) => { if(document.getElementById(id)) document.getElementById(id).innerText = val; };
            updateLabel('val-shape-points', numPoints);
            updateLabel('val-shape-depth', depth);
            updateLabel('val-shape-round', roundness);
        }
    
        // BƯỚC 5: APPLY STYLE VÀO PHẦN TỬ HIỂN THỊ
        const canvas = document.querySelector('.cl-canvas');
        if (canvas) canvas.style.backgroundColor = canvasBg;
    
        const decor = document.querySelector('.cl-canvas-decor');
        if (decor) decor.style.display = document.getElementById('cl-show-decor')?.checked ? 'block' : 'none';
    
        wrapper.style.width = `${w}px`;
        wrapper.style.height = `${h}px`;
        
        // Áp dụng Drop Shadow lên Container
        shadowContainer.style.filter = `drop-shadow(${shadX}px ${shadY}px ${shadBlur}px rgba(0, 0, 0, ${shadOp}))`;
    
        // Áp dụng Glassmorphism lên Target
        const rgbaStops = gradientStops.map(color => hexToRgba(color, gOp)).join(', ');
        target.style.background = `linear-gradient(${angle}deg, ${rgbaStops})`;
        target.style.backdropFilter = `blur(${blur}px)`;
        target.style.webkitBackdropFilter = `blur(${blur}px)`;
        target.style.clipPath = finalClipPath;
        target.style.webkitClipPath = finalClipPath;
        target.style.border = `1px solid rgba(255, 255, 255, ${gOp})`;
    
        // Cập nhật nhãn thông số chung
        document.getElementById('val-shape-rotate').innerText = rotate;
        document.getElementById('val-blur').innerText = blur;
        document.getElementById('val-opacity').innerText = gOp;
        document.getElementById('val-grad-angle').innerText = angle;
    
        // Xuất mã code ra panel
        renderCodeOutput(w, h, angle, blur, gOp, shadX, shadY, shadBlur, shadOp, finalClipPath, engineMode, numPoints, depth);
    }

    function renderCodeOutput(w, h, ang, bl, go, sx, sy, sb, so, clip, mode, n, d) {
        const rgbaStops = gradientStops.map(c => hexToRgba(c, go)).join(', ');
        
        let comment = mode !== 'manual' ? `/* Procedural Engine: ${mode} (n:${n}, d:${d}) */\n` : '';

        const cssCode = `${comment}.glass-container {
    filter: drop-shadow(${sx}px ${sy}px ${sb}px rgba(0, 0, 0, ${so}));
}

.glass-card {
    width: ${w}px; height: ${h}px;
    background: linear-gradient(${ang}deg, ${rgbaStops});
    backdrop-filter: blur(${bl}px);
    -webkit-backdrop-filter: blur(${bl}px);
    clip-path: ${clip};
    border: 1px solid rgba(255, 255, 255, ${go});
}`;
        const display = document.getElementById('cl-code-output');
        if (display) display.innerText = (currentMode === 'css') ? cssCode : `<div class="glass-container">\n  <div class="glass-card"></div>\n</div>`;
    }

    // --- HANDLE SYSTEM ---
    let menuTimer = null; 

    window.renderHandles = () => {
        handleLayer.innerHTML = '';
        const menu = document.getElementById('cl-node-menu');

        points.forEach((pt, idx) => {
            const dot = document.createElement('div');
            dot.className = `cl-dot ${editingIdx === idx ? 'active' : ''}`;
            dot.style.left = `${pt.x}%`;
            dot.style.top = `${pt.y}%`;

            dot.onmouseenter = () => {
                clearTimeout(menuTimer); 
                const rect = dot.getBoundingClientRect();
                menu.style.display = 'flex';
                menu.style.left = `${rect.left + window.scrollX - 40}px`; 
                menu.style.top = `${rect.top + window.scrollY - 50}px`;
                editingIdx = idx;
            };

            dot.onmouseleave = () => {
                menuTimer = setTimeout(() => {
                    menu.style.display = 'none';
                }, 300);
            };

            dot.onmousedown = (e) => {
                e.preventDefault();
                draggingIdx = idx;
                openCornerEdit(idx);
                window.addEventListener('mousemove', handleMouseMove);
                window.addEventListener('mouseup', handleMouseUp);
            };

            handleLayer.appendChild(dot);
        });

        menu.onmouseenter = () => {
            clearTimeout(menuTimer);
        };

        menu.onmouseleave = () => {
            menu.style.display = 'none'; 
        };

        updateAll();
    };
    
    // Các hàm điều khiển Node
    window.setNodeType = (type) => {
        if (editingIdx !== null) {
            points[editingIdx].t = type;
            if (type > 0 && !points[editingIdx].r) points[editingIdx].r = 20; // Default radius
            updateAll();
            openCornerEdit(editingIdx);
        }
    };
    
    window.openCornerEdit = (idx) => {
        const card = document.getElementById('cl-corner-card');
        const node = points[idx];
        if (node.t > 0) {
            card.style.display = 'block';
            document.getElementById('cl-active-node-idx').innerText = idx;
            document.getElementById('cl-node-r').value = node.r;
            document.getElementById('val-node-r').innerText = node.r;
        } else {
            card.style.display = 'none';
        }
    };
    
    // Lắng nghe sự kiện slider bán kính riêng của từng node
    document.getElementById('cl-node-r').oninput = function() {
        if (editingIdx !== null) {
            points[editingIdx].r = this.value;
            document.getElementById('val-node-r').innerText = this.value;
            updateAll();
        }
    };

    function handleMouseMove(e) {
        if (draggingIdx === null) return;
        const rect = wrapper.getBoundingClientRect();
        
        points[draggingIdx].x = Math.max(0, Math.min(100, Math.round(((e.clientX - rect.left) / rect.width) * 100)));
        points[draggingIdx].y = Math.max(0, Math.min(100, Math.round(((e.clientY - rect.top) / rect.height) * 100)));
        
        renderHandles();
    }

    function handleMouseUp() { draggingIdx = null; window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); }

    handleLayer.ondblclick = (e) => {
        const rect = wrapper.getBoundingClientRect();
        points.push({ 
            x: Math.round(((e.clientX - rect.left) / rect.width) * 100), 
            y: Math.round(((e.clientY - rect.top) / rect.height) * 100),
            r: 0,
            t: 0
        });
        renderHandles();
    };

    // --- EVENTS ---
    document.getElementById('clip-shape').onchange = function() {
        const matches = this.value.match(/(\d+\.?\d*)%/g);
        if (matches) { points = []; for (let i = 0; i < matches.length; i += 2) points.push({ x: parseFloat(matches[i]), y: parseFloat(matches[i+1]) }); }
        renderHandles();
    };

    window.deleteCurrentNode = () => {
        if (editingIdx !== null && points.length > 3) {
            points.splice(editingIdx, 1);
            document.getElementById('cl-node-menu').style.display = 'none';
            document.getElementById('cl-corner-card').style.display = 'none';
            editingIdx = null;
            renderHandles(); 
        }
    };
    
    window.closeCornerEdit = () => {
        document.getElementById('cl-corner-card').style.display = 'none';
    };

    window.switchCode = (mode) => {
        currentMode = mode;
        document.querySelectorAll('.cl-code-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
        updateAll();
    };

    window.copyCode = () => {
        navigator.clipboard.writeText(document.getElementById('cl-code-output').innerText);
        const btn = document.querySelector('.cl-copy-btn');
        btn.innerText = "✅ Done"; setTimeout(() => btn.innerHTML = '<i class="fa-regular fa-copy"></i> Copy', 1500);
    };

    window.resetShape = () => {
        const engineMode = document.getElementById('cl-engine-mode')?.value || 'manual';
        
        document.getElementById('cl-shape-rotate').value = 0;
        document.getElementById('cl-invert-shape').checked = false;
    
        if (engineMode === 'manual') {
            points = [
                { x: 0, y: 0, r: 0, t: 0 }, { x: 100, y: 0, r: 0, t: 0 }, 
                { x: 100, y: 100, r: 0, t: 0 }, { x: 0, y: 100, r: 0, t: 0 }
            ];
            renderHandles(); 
        } else {
            const defaults = {
                wavy: { points: 8, depth: 10, round: 50 },
                rounded: { points: 6, depth: 15, round: 50 },
                flower: { points: 5, depth: 20, round: 50 },
                burst: { points: 12, depth: 15, round: 50 }
            };
    
            const config = defaults[engineMode] || { points: 8, depth: 10, round: 50 };
    
            document.getElementById('cl-shape-points').value = config.points;
            document.getElementById('cl-shape-depth').value = config.depth;
            document.getElementById('cl-shape-round').value = config.round;
            
            updateAll();
        }
    };

    container.querySelectorAll('input, select').forEach(i => i.addEventListener('input', updateAll));
    renderColorStops();
    renderHandles();
};