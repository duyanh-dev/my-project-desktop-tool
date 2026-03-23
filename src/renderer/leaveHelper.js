// --- 1. BIẾN TOÀN CỤC & HÀM BỔ TRỢ ---
window.currentLeaveMode = 'early';

const timeToMins = (t) => {
    if (!t) return 0;
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
};

const formatTime = (mins) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
};

// --- 2. HÀM CHUYỂN CHẾ ĐỘ ---
window.switchLeaveMode = (mode) => {
    window.currentLeaveMode = mode;
    document.getElementById('btn-mode-early').classList.toggle('active', mode === 'early');
    document.getElementById('btn-mode-late').classList.toggle('active', mode === 'late');
    document.getElementById('group-early').style.display = mode === 'early' ? 'block' : 'none';
    document.getElementById('group-late').style.display = mode === 'late' ? 'block' : 'none';
    document.getElementById('lh-result-panel').style.display = 'none';
};

// --- 3. HÀM VẼ GIAO DIỆN KẾT QUẢ ---
function renderLateResult(type, rawIn, end, mins, title = "HƯỚNG DẪN TẠO ĐƠN ĐI MUỘN") {
    return `
        <div class="lh-result-card">
            <div class="lh-result-header" style="background: #f59e0b;"><span>💡 ${title}</span></div>
            <div class="lh-result-body">
                <div class="lh-info-row"><label>Mốc Modal xác nhận</label> <span style="color: #fbbf24;">${rawIn}</span></div>
                <div class="lh-info-row"><label>Giờ bắt đầu đơn</label> <span>09:30</span></div>
                <div class="lh-info-row"><label>Giờ kết thúc đơn</label> <span>${end}</span></div>
                <div class="lh-info-row"><label>Tổng thời gian nghỉ</label> <span>${mins} phút (~${(mins/60).toFixed(2)} giờ)</span></div>
                
                <div class="lh-summary-text">
                    <div style="margin-bottom: 8px; color: #fbbf24; border-bottom: 1px solid rgba(251, 191, 36, 0.2); padding-bottom: 5px;">PHÂN TÍCH LOGIC ĐI MUỘN:</div>
                    • <b>Bước 1 - Ghi nhận:</b> Bạn vào làm lúc ${rawIn}. Hệ thống tính công chính xác từ phút này.<br>
                    • <b>Bước 2 - Tính hụt:</b> Khoảng thời gian từ 09:30 đến lúc bạn vào là <b>${timeToMins(rawIn) - 570} phút</b>.<br>
                    • <b>Bước 3 - Quy tắc Block:</b> Theo quy định, đơn phép phải tròn 15 phút. Do đó, con số <b>${mins} phút</b> được chọn để bao phủ toàn bộ thời gian bạn vắng mặt.<br>
                    • <b>Bước 4 - Giờ trưa:</b> Đơn kết thúc lúc ${end} để đảm bảo không bị chồng lấn vào khung nghỉ trưa 12:00-13:00 vô nghĩa.
                </div>
            </div>
        </div>`;
}

function renderEarlyResult(type, rawIn, rawOut, start, end, mins, wait, title) {
    const inMins = timeToMins(rawIn);
    // Tính các mốc 15, 30, 45 phút dựa trên giờ ra chuẩn (end)
    const endMins = timeToMins(end);
    const mốc15 = formatTime(endMins - 15);
    const mốc30 = formatTime(endMins - 30);
    const mốc45 = formatTime(endMins - 45);

    const stayMore = Math.ceil(wait);
    const minsMinus15 = mins - 15;
    const missingMins = Math.ceil(mins - 15 + wait);
    const optimizationTip = stayMore > 0 
        ? `<div style="margin-top:12px; padding:12px; background:rgba(99,102,241,0.1); border-radius:8px; border-left:4px solid #6366f1; color: #a5b4fc; font-size: 12px;">
        <i class="fa-solid fa-wand-magic-sparkles"></i> <b>MẸO TIẾT KIỆM PHÉP:</b><br>
        Hiện tại bạn đang thiếu <b>${missingMins} phút (~${(missingMins / 60).toFixed(2)} giờ)</b> nên phải xin đơn <b>${mins} phút (~${(mins / 60).toFixed(2)} giờ)</b>. 
        Nếu bạn ráng ở lại thêm <b>${stayMore} phút</b> (đến <b>${formatTime(timeToMins(rawOut) + stayMore)}</b>), 
        khoảng hụt sẽ giảm xuống còn <b>${minsMinus15} phút (~${(minsMinus15 / 60).toFixed(2)} giờ)</b>.
    </div>`
    : '';

    return `
        <div class="lh-result-card">
            <div class="lh-result-header"><span>💡 ${title}</span></div>
            <div class="lh-result-body">
                <div class="lh-info-row"><label>Mốc Modal xác nhận</label> <span style="color: #818cf8;">${rawIn}</span></div>
                <div class="lh-info-row"><label>Giờ bắt đầu nghỉ</label> <span>${start}</span></div>
                <div class="lh-info-row"><label>Giờ kết thúc nghỉ</label> <span>${end}</span></div>
                <div class="lh-info-row"><label>Tổng thời gian nghỉ</label> <span>${mins} phút (~${(mins/60).toFixed(2)} giờ)</span></div>
                
                <div class="lh-summary-text">
                    <div style="margin-bottom: 8px; color: #818cf8; border-bottom: 1px solid rgba(129, 140, 248, 0.2); padding-bottom: 5px;">PHÂN TÍCH LOGIC VỀ SỚM:</div>
                    • <b>Nguyên tắc 8h:</b> Với giờ vào <b>${rawIn}</b>, bạn cần làm đến <b>${end}</b> để đủ định mức.<br>
                    • <b>Thực tế:</b> Bạn rời đi lúc ${rawOut}, thiếu <b>${missingMins} phút (~${(missingMins / 60).toFixed(2)} giờ)</b>.<br>
                    • <b>Quy tắc 15p:</b> Để bù hoàn toàn số phút thiếu, đơn của bạn phải là <b>${mins} phút (~${(mins / 60).toFixed(2)} giờ)</b>.

                    <div style="margin: 12px 0; padding: 10px; background: rgba(0,0,0,0.2); border-radius: 8px; font-size: 12px;">
                        <b style="color: #cbd5e1; display: block; margin-bottom: 5px;">BẢNG ĐỐI CHIẾU MỐC GIỜ & PHÉP:</b>
                        • Muốn về sớm 15 phút $\rightarrow$ Về lúc <b>${mốc15}</b><br>
                        • Muốn về sớm 30 phút $\rightarrow$ Về lúc <b>${mốc30}</b><br>
                        • Muốn về sớm 45 phút $\rightarrow$ Về lúc <b>${mốc45}</b><br>
                        <span style="color: #94a3b8; font-style: italic;">(Dựa trên giờ ra chuẩn của bạn là ${end})</span>
                    </div>

                    • <b>Cách điền đơn:</b> Xin nghỉ từ <b>${start}</b> đến <b>${end}</b>.
                    ${optimizationTip}
                </div>
            </div>
        </div>`;
}

// --- 4. HÀM TÍNH TOÁN CHÍNH ---
window.calculateLeaveSuggestion = () => {
    const flexMax = timeToMins("09:30");
    const lunchStart = timeToMins("12:00");
    const lunchEnd = timeToMins("13:00");
    const limitEnd = timeToMins("18:30");
    const panel = document.getElementById('lh-result-panel');
    const leaveType = document.getElementById('lh-leave-type').value;
    panel.style.display = 'block';

    if (window.currentLeaveMode === 'late') {
        const lateIn = document.getElementById('lh-late-in').value;
        const inMins = timeToMins(lateIn);
        
        if (inMins <= flexMax) {
            panel.innerHTML = `<div style="color:#10b981; padding:20px; text-align:center;">🎉 Bạn vào lúc <b>${lateIn}</b> (vẫn trong khung Flex). Không cần tạo đơn!</div>`;
            return;
        }

        let gapLate = inMins - flexMax;
        if (inMins > lunchEnd) gapLate -= 60;
        else if (inMins > lunchStart) gapLate = lunchStart - flexMax;

        let leaveMins = Math.ceil(gapLate / 15) * 15;
        let endLeaveMins = flexMax + leaveMins;
        if (endLeaveMins > lunchStart) endLeaveMins += 60; 

        panel.innerHTML = renderLateResult(leaveType, lateIn, formatTime(endLeaveMins), leaveMins);
    } 
    else {
        const earlyIn = document.getElementById('lh-early-in').value;
        const earlyOut = document.getElementById('lh-early-out').value;
        const inMins = timeToMins(earlyIn);
        const outMins = timeToMins(earlyOut);

        let trueReqOut = inMins + 540; 
        if (trueReqOut > limitEnd) trueReqOut = limitEnd;

        let gap = trueReqOut - outMins;

        if (gap <= 0) {
            panel.innerHTML = `<div style="color:#10b981; padding:20px; text-align:center;">🎉 Đã đủ công! Giờ ra chuẩn: <b>${formatTime(trueReqOut)}</b>.</div>`;
        } else {
            let leaveNeeded = Math.ceil(gap / 15) * 15;
            let leaveStart = trueReqOut - leaveNeeded;
            if (leaveStart < lunchEnd && leaveStart > lunchStart) leaveStart = lunchStart;

            let nextLowerBlock = Math.floor(gap / 15) * 15;
            let waitMins = gap - nextLowerBlock;

            if (inMins > flexMax) {
                let lateGap = inMins - flexMax;
                if (inMins > lunchEnd) lateGap -= 60;
                let leaveLate = Math.ceil(lateGap / 15) * 15;
                let endLate = flexMax + leaveLate;
                if (endLate > lunchStart) endLate += 60;

                panel.innerHTML = `
                    <div style="margin-bottom:15px; background:rgba(245,158,11,0.1); padding:10px; border-radius:8px; border:1px solid #f59e0b; color:#fbbf24; font-size:13px;">
                        ⚠️ <b>CASE KÉP:</b> Bạn cần tạo 2 đơn riêng biệt để bù đắp thời gian vào trễ và về sớm.
                    </div>
                    ${renderLateResult(leaveType, earlyIn, formatTime(endLate), leaveLate, "ĐƠN 1: ĐI MUỘN")}
                    <div style="margin-top:20px"></div>
                    ${renderEarlyResult(leaveType, earlyIn, earlyOut, formatTime(leaveStart), formatTime(trueReqOut), leaveNeeded, waitMins, "ĐƠN 2: VỀ SỚM")}
                `;
            } else {
                panel.innerHTML = renderEarlyResult(leaveType, earlyIn, earlyOut, formatTime(leaveStart), formatTime(trueReqOut), leaveNeeded, waitMins, "HƯỚNG DẪN TẠO ĐƠN VỀ SỚM");
            }
        }
    }
};