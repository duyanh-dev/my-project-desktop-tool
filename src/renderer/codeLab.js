window.initCodeLab = () => {
    const target = document.getElementById('cl-target');
    const handleLayer = document.getElementById('cl-handle-layer');
    const wrapper = document.getElementById('cl-clippy-wrapper');
    const shadowContainer = document.getElementById('cl-shadow-container');
    const gradList = document.getElementById('cl-gradient-list');
    const container = document.getElementById('tab-codelab');

    let startMouseDist = 0;
    let startRadius = 0;

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

    // --- RESIZE SYSTEM ---
let draggingResize = null;
let startSize = { w: 0, h: 0 };
let startMouse = { x: 0, y: 0 };

const initResizers = () => {
    const resizers = document.querySelectorAll('.cl-resizer');
    const widthInput = document.getElementById('cl-width');
    const heightInput = document.getElementById('cl-height');

    resizers.forEach(resizer => {
        resizer.onmousedown = (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            draggingResize = resizer.dataset.type;
            startSize = {
                w: parseInt(widthInput.value),
                h: parseInt(heightInput.value)
            };
            startMouse = { x: e.clientX, y: e.clientY };

            document.body.style.cursor = resizer.style.cursor;
            window.addEventListener('mousemove', handleResizeMove);
            window.addEventListener('mouseup', handleResizeUp);
        };
    });
};

function handleResizeMove(e) {
    if (!draggingResize) return;

    const widthInput = document.getElementById('cl-width');
    const heightInput = document.getElementById('cl-height');
    
    const deltaX = e.clientX - startMouse.x;
    const deltaY = e.clientY - startMouse.y;

    if (draggingResize === 'width' || draggingResize === 'both') {
        const newW = Math.max(50, Math.min(800, startSize.w + deltaX));
        widthInput.value = newW;
    }
    
    if (draggingResize === 'height' || draggingResize === 'both') {
        const newH = Math.max(50, Math.min(800, startSize.h + deltaY));
        heightInput.value = newH;
    }

    // Cập nhật giao diện ngay lập tức
    updateAll();
}

function handleResizeUp() {
    draggingResize = null;
    document.body.style.cursor = 'default';
    window.removeEventListener('mousemove', handleResizeMove);
    window.removeEventListener('mouseup', handleResizeUp);
}

// Đừng quên gọi initResizers() ở cuối hàm initCodeLab
initResizers();

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
        
        const r = Math.min(radius / 2, d1 / 2, d2 / 2);

        const start = { x: p2.x + v1.x / d1 * r, y: p2.y + v1.y / d1 * r };
        const end = { x: p2.x + v2.x / d2 * r, y: p2.y + v2.y / d2 * r };

        let arcPoints = [];
        const steps = 10;
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            let cx, cy;
            
            if (type === 1) { 
                cx = (1 - t) * (1 - t) * start.x + 2 * (1 - t) * t * p2.x + t * t * end.x;
                cy = (1 - t) * (1 - t) * start.y + 2 * (1 - t) * t * p2.y + t * t * end.y;
            } else { 
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

    let draggingRadiusIdx = null;

    // Hàm tính toán đường dẫn SVG (d path) cho góc bo
    const getArcPath = (p1, p2, p3, radius, type) => {
        const v1 = { x: p1.x - p2.x, y: p1.y - p2.y };
        const v2 = { x: p3.x - p2.x, y: p3.y - p2.y };
        const d1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y) || 1;
        const d2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y) || 1;
        
        const r = Math.min(radius / 2, d1 / 1.2, d2 / 1.2);
    
        const bisectX = (v1.x / d1 + v2.x / d2);
        const bisectY = (v1.y / d1 + v2.y / d2);
        const bisectLen = Math.sqrt(bisectX * bisectX + bisectY * bisectY) || 1;
        
        const gap = 1.5; 
        const offsetX = (bisectX / bisectLen) * gap;
        const offsetY = (bisectY / bisectLen) * gap;
    
        const start = { x: p2.x + v1.x / d1 * r + offsetX, y: p2.y + v1.y / d1 * r + offsetY };
        const end = { x: p2.x + v2.x / d2 * r + offsetX, y: p2.y + v2.y / d2 * r + offsetY };
        let cp = { x: p2.x + offsetX, y: p2.y + offsetY };
    
        if (type === 2) {
            const midX = (start.x + end.x) / 2;
            const midY = (start.y + end.y) / 2;
            cp.x = cp.x + (midX - cp.x) * 2;
            cp.y = cp.y + (midY - cp.y) * 2;
        }
    
        return `M ${start.x},${start.y} Q ${cp.x},${cp.y} ${end.x},${end.y}`;
    };

    function handleRadiusMove(e) {
        if (draggingRadiusIdx === null) return;
        
        const rect = wrapper.getBoundingClientRect();
        const pt = points[draggingRadiusIdx];
        
        const mouseX = ((e.clientX - rect.left) / rect.width) * 100;
        const mouseY = ((e.clientY - rect.top) / rect.height) * 100;
        
        // 1. Tính khoảng cách tuyệt đối (Giữ nguyên logic cũ của bạn)
        let currentDist = Math.sqrt(Math.pow(mouseX - pt.x, 2) + Math.pow(mouseY - pt.y, 2));
    
        // 2. KIỂM TRA HƯỚNG (Để tránh lỗi gương phản chiếu)
        const prev = points[(draggingRadiusIdx - 1 + points.length) % points.length];
        const next = points[(draggingRadiusIdx + 1) % points.length];
        
        // Vector phân giác (Bisector)
        const v1 = { x: prev.x - pt.x, y: prev.y - pt.y };
        const v2 = { x: next.x - pt.x, y: next.y - pt.y };
        const d1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y) || 1;
        const d2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y) || 1;
        const bUnit = { x: (v1.x / d1 + v2.x / d2), y: (v1.y / d1 + v2.y / d2) };
        
        // Vector từ Dot đến chuột
        const mouseVec = { x: mouseX - pt.x, y: mouseY - pt.y };
        
        // Nếu tích vô hướng âm => Chuột đã vượt qua Dot ra phía ngoài
        // Ta đảo dấu currentDist để delta càng âm hơn => r về 0 và đứng yên ở đó
        const dotProduct = (mouseVec.x * bUnit.x + mouseVec.y * bUnit.y);
        if (dotProduct < 0) {
            currentDist = -currentDist;
        }
    
        // 3. Tính Delta và Radius (Giữ nguyên logic mượt mà của bạn)
        const delta = currentDist - startMouseDist;
        const sensitivity = (pt.t === 1) ? 3.8 : 2.0;
        
        let newR = startRadius + (delta * sensitivity);
    
        // Chặn giá trị
        newR = Math.min(100, Math.max(0, newR));
    
        if (Math.abs(pt.r - newR) > 0.01) {
            points[draggingRadiusIdx].r = newR;
    
            const slider = document.getElementById('cl-node-r');
            if (slider) slider.value = newR;
            const label = document.getElementById('val-node-r');
            if (label) label.innerText = Math.round(newR);
    
            const activeGroup = document.querySelector('.cl-corner-handle-group.active-drag');
            if (activeGroup) {
                const arc = activeGroup.querySelector('.cl-corner-arc');
                const hit = activeGroup.querySelector('.cl-corner-hit-area');
                const d = getArcPath(prev, pt, next, newR, pt.t);
                arc.setAttribute('d', d);
                hit.setAttribute('d', d);
            }
    
            updateAll();
        }
    }
    
    function handleRadiusUp() {
        const lastDraggedIdx = draggingRadiusIdx;
        
        draggingRadiusIdx = null;
        
        window.removeEventListener('mousemove', handleRadiusMove);
        window.removeEventListener('mouseup', handleRadiusUp);
 
        renderHandles();
    }

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
    
        let basePts = [];
        if (engineMode === 'manual') {
            for (let i = 0; i < points.length; i++) {
                const prev = points[(i - 1 + points.length) % points.length];
                const curr = points[i];
                const next = points[(i + 1) % points.length];
                
                const cornerPoints = computeCorner(prev, curr, next, curr.r || 0, curr.t || 0);
                basePts.push(...cornerPoints);
            }
        } else {
            basePts = generateProceduralPoints(engineMode, numPoints, depth, roundness);
        }
    
        const rad = (rotate * Math.PI) / 180;
        const finalPoints = basePts.map(p => ({
            x: ((p.x - 50) * Math.cos(rad) - (p.y - 50) * Math.sin(rad) + 50).toFixed(2),
            y: ((p.x - 50) * Math.sin(rad) + (p.y - 50) * Math.cos(rad) + 50).toFixed(2)
        }));
    
        let finalClipPath = "";
        const pathString = finalPoints.map(p => `${p.x}% ${p.y}%`).join(', ');
    
        if (isInverted) {
            finalClipPath = `polygon(0% 0%, 0% 100%, 100% 100%, 100% 0%, 0% 0%, ${pathString}, ${finalPoints[0].x}% ${finalPoints[0].y}%)`;
        } else {
            finalClipPath = `polygon(${pathString})`;
        }
    
        if (engineMode === 'manual') {
            handleLayer.style.display = 'block';
            document.getElementById('cl-manual-controls').style.display = 'block';
            document.getElementById('cl-procedural-controls').style.display = 'none';
        } else {
            handleLayer.style.display = 'none';
            document.getElementById('cl-manual-controls').style.display = 'none';
            document.getElementById('cl-procedural-controls').style.display = 'block';
            
            const updateLabel = (id, val) => { if(document.getElementById(id)) document.getElementById(id).innerText = val; };
            updateLabel('val-shape-points', numPoints);
            updateLabel('val-shape-depth', depth);
            updateLabel('val-shape-round', roundness);
        }
    
        const canvas = document.querySelector('.cl-canvas');
        if (canvas) canvas.style.backgroundColor = canvasBg;
    
        const decor = document.querySelector('.cl-canvas-decor');
        if (decor) decor.style.display = document.getElementById('cl-show-decor')?.checked ? 'block' : 'none';
    
        wrapper.style.width = `${w}px`;
        wrapper.style.height = `${h}px`;
        
        shadowContainer.style.filter = `drop-shadow(${shadX}px ${shadY}px ${shadBlur}px rgba(0, 0, 0, ${shadOp}))`;
    
        const rgbaStops = gradientStops.map(color => hexToRgba(color, gOp)).join(', ');
        target.style.background = `linear-gradient(${angle}deg, ${rgbaStops})`;
        target.style.backdropFilter = `blur(${blur}px)`;
        target.style.webkitBackdropFilter = `blur(${blur}px)`;
        target.style.clipPath = finalClipPath;
        target.style.webkitClipPath = finalClipPath;
        target.style.border = `1px solid rgba(255, 255, 255, ${gOp})`;
    
        document.getElementById('val-shape-rotate').innerText = rotate;
        document.getElementById('val-blur').innerText = blur;
        document.getElementById('val-opacity').innerText = gOp;
        document.getElementById('val-grad-angle').innerText = angle;
    
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
        const svgLayer = document.getElementById('cl-svg-handles');
        if (svgLayer) svgLayer.innerHTML = ''; 
    
        const menu = document.getElementById('cl-node-menu');

        points.forEach((pt, idx) => {

            if (pt.t > 0 && svgLayer) {
                const prev = points[(idx - 1 + points.length) % points.length];
                const next = points[(idx + 1) % points.length];
                const pathData = getArcPath(prev, pt, next, pt.r || 0, pt.t);
    
                const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
                g.setAttribute("class", "cl-corner-handle-group");
                
                if (draggingRadiusIdx === idx) {
                    g.classList.add('active-drag');
                }
    
                const arc = document.createElementNS("http://www.w3.org/2000/svg", "path");
                arc.setAttribute("d", pathData);
                arc.setAttribute("class", "cl-corner-arc");
                
                const hitArea = document.createElementNS("http://www.w3.org/2000/svg", "path");
                hitArea.setAttribute("d", pathData);
                hitArea.setAttribute("class", "cl-corner-hit-area");
    
                hitArea.onmousedown = (e) => {
                    e.preventDefault(); e.stopPropagation();
                    draggingRadiusIdx = idx;
                    
                    const rect = wrapper.getBoundingClientRect();
                    const pt = points[idx];
                    const mouseX = ((e.clientX - rect.left) / rect.width) * 100;
                    const mouseY = ((e.clientY - rect.top) / rect.height) * 100;
                    
                    startMouseDist = Math.sqrt(Math.pow(mouseX - pt.x, 2) + Math.pow(mouseY - pt.y, 2));
                    startRadius = pt.r || 0; 
                
                    renderHandles(); 
                    window.addEventListener('mousemove', handleRadiusMove);
                    window.addEventListener('mouseup', handleRadiusUp);
                };
    
                g.appendChild(arc);
                g.appendChild(hitArea);
                svgLayer.appendChild(g);
            }

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
    
    window.setNodeType = (type) => {
        if (editingIdx !== null) {
            points[editingIdx].t = type;
            if (type > 0) {
                points[editingIdx].r = points[editingIdx].r || 20; 
            } else {
                points[editingIdx].r = 0;
            }
            
            renderHandles(); 
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
    
    document.getElementById('cl-node-r').oninput = function() {
        if (editingIdx !== null) {
            points[editingIdx].r = parseFloat(this.value);
            
            const label = document.getElementById('val-node-r');
            if (label) label.innerText = this.value;
            
            renderHandles(); 
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

    // 1. Tính khoảng cách từ điểm click (p) đến một đoạn thẳng (v-w)
    const distToSegment = (p, v, w) => {
        const l2 = Math.pow(v.x - w.x, 2) + Math.pow(v.y - w.y, 2);
        if (l2 == 0) return Math.pow(p.x - v.x, 2) + Math.pow(p.y - v.y, 2);
        let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
        t = Math.max(0, Math.min(1, t));
        return Math.pow(p.x - (v.x + t * (w.x - v.x)), 2) + Math.pow(p.y - (v.y + t * (w.y - v.y)), 2);
    };

    // 2. Tìm vị trí chính xác để chèn điểm vào giữa 2 điểm cũ
    const getInsertIndex = (newPt, pts) => {
        let minSqDist = Infinity;
        let indexToInsert = pts.length;

        for (let i = 0; i < pts.length; i++) {
            const p1 = pts[i];
            const p2 = pts[(i + 1) % pts.length]; // Điểm kế tiếp (vòng lặp cuối nối về đầu)
            const dist = distToSegment(newPt, p1, p2);

            if (dist < minSqDist) {
                minSqDist = dist;
                indexToInsert = i + 1;
            }
        }
        return indexToInsert;
    };

    handleLayer.ondblclick = (e) => {
        const rect = wrapper.getBoundingClientRect();
        const newPoint = { 
            x: Math.round(((e.clientX - rect.left) / rect.width) * 100), 
            y: Math.round(((e.clientY - rect.top) / rect.height) * 100),
            r: 0, // Mặc định góc nhọn
            t: 0  // Loại nhọn
        };
    
        // TÌM VỊ TRÍ CHÈN THÔNG MINH
        // Thay vì push vào cuối, ta dùng splice để chèn vào giữa cạnh gần nhất
        const insertIdx = getInsertIndex(newPoint, points);
        points.splice(insertIdx, 0, newPoint);
    
        renderHandles(); // Vẽ lại mọi thứ
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

    container.querySelectorAll('input, select').forEach(i => {
        i.addEventListener('input', () => {
            if (i.id === 'cl-node-r') return;
            
            if (i.id === 'cl-engine-mode' || i.id === 'grad-angle' || i.type === 'color') {
                renderHandles();
            } else {
                updateAll();
            }
        });
    });
    renderColorStops();
    renderHandles();
};