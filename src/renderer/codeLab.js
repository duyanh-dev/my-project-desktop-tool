window.initCodeLab = () => {
    const target = document.getElementById('cl-target');
    const handleLayer = document.getElementById('cl-handle-layer');
    const wrapper = document.getElementById('cl-clippy-wrapper');
    const shadowContainer = document.getElementById('cl-shadow-container');
    const gradList = document.getElementById('cl-gradient-list');
    const container = document.getElementById('tab-codelab');

    if (!container || !target || !wrapper || !shadowContainer) return;

    let currentMode = 'css';
    let points = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
    let gradientStops = ['#6366f1', '#a855f7']; 
    let draggingIdx = null;

    // --- HELPER FUNCTIONS ---
    const hexToRgba = (hex, opacity) => {
        let r = 0, g = 0, b = 0;
        if (hex.length == 4) { r = "0x" + hex[1] + hex[1]; g = "0x" + hex[2] + hex[2]; b = "0x" + hex[3] + hex[3]; }
        else if (hex.length == 7) { r = "0x" + hex[1] + hex[2]; g = "0x" + hex[3] + hex[4]; b = "0x" + hex[5] + hex[6]; }
        return `rgba(${+r}, ${+g}, ${+b}, ${opacity})`;
    };

    // Hàm tạo hình Wavy/Curve dựa trên lượng giác
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
                // Shape lạ: Cánh hoa
                r += Math.abs(Math.sin(angle * numWaves / 2)) * depth;
            }
            else if (type === 'burst') {
                // Shape lạ: Starburst
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

    // --- MAIN UPDATE ---
    function updateAll() {
        const getVal = (id) => document.getElementById(id)?.value;
        const getInt = (id) => parseInt(document.getElementById(id)?.value || 0);

        const w = getVal('cl-width') || 320, h = getVal('cl-height') || 320;
        const canvasBg = getVal('cl-bg-picker') || '#ffffff';
        const blur = getVal('glass-blur') || 10, gOp = getVal('glass-opacity') || 0.2;
        const shadX = getVal('shadow-x') || 0, shadY = getVal('shadow-y') || 20;
        const shadBlur = getVal('shadow-blur') || 30, shadOp = getVal('shadow-opacity') || 0.4;
        const angle = getVal('grad-angle') || 45;

        // Engine Params
        const engineMode = getVal('cl-engine-mode') || 'manual';
        const numPoints = getInt('cl-shape-points');
        const depth = getInt('cl-shape-depth');
        const roundness = getInt('cl-shape-round');
        const rotate = getInt('cl-shape-rotate');
        const isInverted = document.getElementById('cl-invert-shape')?.checked;

        // BƯỚC 1: LẤY ĐIỂM GỐC (Base Points)
        let pts = (engineMode === 'manual') ? [...points] : generateProceduralPoints(engineMode, numPoints, depth, roundness);

        // BƯỚC 2: XOAY TỌA ĐỘ
        const rad = (rotate * Math.PI) / 180;
        const rotatedPoints = pts.map(p => ({
            x: ((p.x - 50) * Math.cos(rad) - (p.y - 50) * Math.sin(rad) + 50).toFixed(2),
            y: ((p.x - 50) * Math.sin(rad) + (p.y - 50) * Math.cos(rad) + 50).toFixed(2)
        }));

        // BƯỚC 3: TÍNH TOÁN CHUỖI POLYGON (Có Invert)
        let finalClipPath = "";
        if (isInverted) {
            const innerPath = rotatedPoints.map(p => `${p.x}% ${p.y}%`).join(', ');
            finalClipPath = `polygon(0% 0%, 0% 100%, 100% 100%, 100% 0%, 0% 0%, ${innerPath}, ${rotatedPoints[0].x}% ${rotatedPoints[0].y}%)`;
        } else {
            finalClipPath = `polygon(${rotatedPoints.map(p => `${p.x}% ${p.y}%`).join(', ')})`;
        }

        // BƯỚC 4: UI CONTROLS VISIBILITY
        if (engineMode === 'manual') {
            handleLayer.style.display = 'block';
            document.getElementById('cl-manual-controls').style.display = 'block';
            document.getElementById('cl-procedural-controls').style.display = 'none';
        } else {
            handleLayer.style.display = 'none';
            document.getElementById('cl-manual-controls').style.display = 'none';
            document.getElementById('cl-procedural-controls').style.display = 'block';
            if(document.getElementById('val-shape-points')) document.getElementById('val-shape-points').innerText = numPoints;
            if(document.getElementById('val-shape-depth')) document.getElementById('val-shape-depth').innerText = depth;
            if(document.getElementById('val-shape-round')) document.getElementById('val-shape-round').innerText = roundness;
        }

        // BƯỚC 5: APPLY STYLES
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

        // Labels
        document.getElementById('val-shape-rotate').innerText = rotate;
        const setLabel = (id, val) => { if(document.getElementById(id)) document.getElementById(id).innerText = val; };
        setLabel('val-blur', blur);
        setLabel('val-opacity', gOp);
        setLabel('val-grad-angle', angle);

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
    window.renderHandles = () => {
        handleLayer.innerHTML = '';
        points.forEach((pt, idx) => {
            const dot = document.createElement('div');
            dot.className = 'cl-dot';
            dot.style.left = `${pt.x}%`; dot.style.top = `${pt.y}%`;
            dot.oncontextmenu = (e) => { e.preventDefault(); if (points.length > 3) { points.splice(idx, 1); renderHandles(); } };
            dot.onmousedown = (e) => { e.preventDefault(); draggingIdx = idx; window.addEventListener('mousemove', handleMouseMove); window.addEventListener('mouseup', handleMouseUp); };
            handleLayer.appendChild(dot);
        });
        updateAll();
    };

    function handleMouseMove(e) {
        if (draggingIdx === null) return;
        const rect = wrapper.getBoundingClientRect();
        let x = Math.round(((e.clientX - rect.left) / rect.width) * 100);
        let y = Math.round(((e.clientY - rect.top) / rect.height) * 100);
        points[draggingIdx] = { x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) };
        renderHandles();
    }

    function handleMouseUp() { draggingIdx = null; window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); }

    handleLayer.ondblclick = (e) => {
        const rect = wrapper.getBoundingClientRect();
        points.push({ x: Math.round(((e.clientX - rect.left) / rect.width) * 100), y: Math.round(((e.clientY - rect.top) / rect.height) * 100) });
        renderHandles();
    };

    // --- EVENTS ---
    document.getElementById('clip-shape').onchange = function() {
        const matches = this.value.match(/(\d+\.?\d*)%/g);
        if (matches) { points = []; for (let i = 0; i < matches.length; i += 2) points.push({ x: parseFloat(matches[i]), y: parseFloat(matches[i+1]) }); }
        renderHandles();
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
        
        // 1. Reset các thông số chung (Xoay và Nghịch đảo)
        document.getElementById('cl-shape-rotate').value = 0;
        document.getElementById('cl-invert-shape').checked = false;
    
        // 2. Reset theo từng chế độ cụ thể
        if (engineMode === 'manual') {
            // Reset về hình vuông 4 điểm
            points = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
            renderHandles(); // Hàm này sẽ tự gọi updateAll()
        } else {
            // Cấu hình mặc định cho từng Shape Procedural
            const defaults = {
                wavy: { points: 8, depth: 10, round: 50 },
                rounded: { points: 6, depth: 15, round: 50 },
                flower: { points: 5, depth: 20, round: 50 },
                burst: { points: 12, depth: 15, round: 50 }
            };
    
            const config = defaults[engineMode] || { points: 8, depth: 10, round: 50 };
    
            // Nạp lại giá trị cho các Slider
            document.getElementById('cl-shape-points').value = config.points;
            document.getElementById('cl-shape-depth').value = config.depth;
            document.getElementById('cl-shape-round').value = config.round;
            
            updateAll(); // Cập nhật giao diện
        }
    };

    container.querySelectorAll('input, select').forEach(i => i.addEventListener('input', updateAll));
    renderColorStops();
    renderHandles();
};