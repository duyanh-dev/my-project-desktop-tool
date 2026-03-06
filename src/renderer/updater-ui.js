// async function checkAppUpdate() {
//     const result = await ipcRenderer.invoke('check-for-update');
//     if (result.hasUpdate) {
//         document.getElementById('update-section').style.display = 'block';
//         document.getElementById('update-version-text').innerText = `Version ${result.version} is available`;
//         document.getElementById('update-msg-text').innerText = result.msg;
        
//         // Lưu URL vào thuộc tính của nút để dùng sau
//         document.getElementById('btn-do-update').dataset.url = result.url;
//     }
// }

// async function handleUpdate() {
//     const btn = document.getElementById('btn-do-update');
//     const url = btn.dataset.url;
    
//     btn.disabled = true;
//     btn.innerText = "Updating... Please wait";
    
//     const res = await ipcRenderer.invoke('start-update', url);
    
//     if (res.success) {
//         alert(res.msg);
//         location.reload(); 
//     } else {
//         alert("Lỗi: " + res.msg);
//         btn.disabled = false;
//         btn.innerText = "Try Again";
//     }
// }



// window.addEventListener('DOMContentLoaded', checkAppUpdate);