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

    const hexToRgba = (hex, opacity) => {
        let r = 0, g = 0, b = 0;
        if (hex.length == 4) { r = "0x" + hex[1] + hex[1]; g = "0x" + hex[2] + hex[2]; b = "0x" + hex[3] + hex[3]; }
        else if (hex.length == 7) { r = "0x" + hex[1] + hex[2]; g = "0x" + hex[3] + hex[4]; b = "0x" + hex[5] + hex[6]; }
        return `rgba(${+r}, ${+g}, ${+b}, ${opacity})`;
    };

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
        if (gradientStops.length < 5) {
            gradientStops.push('#ffffff');
            renderColorStops();
        }
    };

    window.updateColorStop = (idx, val) => {
        gradientStops[idx] = val;
        updateAll();
    };

    window.removeColorStop = (idx) => {
        gradientStops.splice(idx, 1);
        renderColorStops();
    };

    function updateAll() {
        const getVal = (id) => document.getElementById(id)?.value;

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

        // 1. Cập nhật trang trí Canvas (Bật/Tắt Blobs)
        const canvas = document.querySelector('.cl-canvas');
        if (canvas) canvas.style.backgroundColor = canvasBg;

        const decor = document.querySelector('.cl-canvas-decor');
        const isShowDecor = document.getElementById('cl-show-decor')?.checked;
        if (decor) decor.style.display = isShowDecor ? 'block' : 'none';

        // 2. Kích thước Wrapper
        wrapper.style.width = `${w}px`;
        wrapper.style.height = `${h}px`;
        wrapper.style.filter = 'none'; 

        // 3. Shadow Container
        shadowContainer.style.filter = `drop-shadow(${shadX}px ${shadY}px ${shadBlur}px rgba(0, 0, 0, ${shadOp}))`;

        // 4. Target (Glass & Shape)
        const rgbaStops = gradientStops.map(color => hexToRgba(color, gOp)).join(', ');
        const clipPathStr = `polygon(${points.map(p => `${p.x}% ${p.y}%`).join(', ')})`;

        target.style.background = `linear-gradient(${angle}deg, ${rgbaStops})`;
        target.style.backdropFilter = `blur(${blur}px)`;
        target.style.webkitBackdropFilter = `blur(${blur}px)`;
        target.style.clipPath = clipPathStr;
        target.style.webkitClipPath = clipPathStr;
        target.style.border = `1px solid rgba(255, 255, 255, ${gOp})`;

        // 5. Cập nhật Labels (Bổ sung Angle)
        const setLabel = (id, val) => { if(document.getElementById(id)) document.getElementById(id).innerText = val; };
        setLabel('val-blur', blur);
        setLabel('val-opacity', gOp);
        setLabel('val-grad-angle', angle);

        renderCodeOutput(w, h, angle, blur, gOp, shadX, shadY, shadBlur, shadOp, clipPathStr);
    }

    function renderCodeOutput(w, h, ang, bl, go, sx, sy, sb, so, clip) {
        const rgbaStops = gradientStops.map(c => hexToRgba(c, go)).join(', ');
        const cssCode = `/* Container: Shadow support for Clip-path */
.glass-container {
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
            dot.style.left = `${pt.x}%`;
            dot.style.top = `${pt.y}%`;
            
            dot.oncontextmenu = (e) => {
                e.preventDefault();
                if (points.length > 3) { points.splice(idx, 1); renderHandles(); }
            };

            dot.onmousedown = (e) => {
                e.preventDefault(); draggingIdx = idx;
                window.addEventListener('mousemove', handleMouseMove);
                window.addEventListener('mouseup', handleMouseUp);
            };
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
        let x = Math.round(((e.clientX - rect.left) / rect.width) * 100);
        let y = Math.round(((e.clientY - rect.top) / rect.height) * 100);
        points.push({ x, y });
        renderHandles();
    };

    // --- UI EVENTS ---
    document.getElementById('clip-shape').onchange = function() {
        const val = this.value;
        const matches = val.match(/(\d+\.?\d*)%/g);
        if (matches) {
            points = [];
            for (let i = 0; i < matches.length; i += 2) points.push({ x: parseFloat(matches[i]), y: parseFloat(matches[i+1]) });
        }
        renderHandles();
    };

    window.switchCode = (mode) => {
        currentMode = mode;
        document.querySelectorAll('.cl-code-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
        updateAll();
    };

    window.copyCode = () => {
        const text = document.getElementById('cl-code-output').innerText;
        navigator.clipboard.writeText(text);
        const btn = document.querySelector('.cl-copy-btn');
        btn.innerText = "✅ Done";
        setTimeout(() => btn.innerHTML = '<i class="fa-regular fa-copy"></i> Copy', 1500);
    };

    // Lắng nghe tất cả sự kiện bao gồm cả Checkbox mới
    container.querySelectorAll('input, select').forEach(i => i.addEventListener('input', updateAll));
    
    renderColorStops();
    renderHandles();
};