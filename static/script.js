document.addEventListener('DOMContentLoaded', () => {
    const userScreen = document.getElementById('user-screen'), authScreen = document.getElementById('auth-screen'), chatScreen = document.getElementById('chat-screen');
    const accUser = document.getElementById('acc-user'), accPass = document.getElementById('acc-pass'), loginBtn = document.getElementById('login-btn'), regBtn = document.getElementById('reg-btn');
    const nameInput = document.getElementById('username'), roomInput = document.getElementById('room-id'), passInput = document.getElementById('room-password'), joinBtn = document.getElementById('join-btn');
    const roomList = document.getElementById('room-list'), logoutBtn = document.getElementById('logout-btn'), leaveBtn = document.getElementById('leave-btn');
    const form = document.getElementById('message-form'), input = document.getElementById('message-input'), chatArea = document.getElementById('messages'), typingArea = document.getElementById('typing-area');
    const roomLabel = document.getElementById('display-room'), userLabel = document.getElementById('display-username'), userListDiv = document.getElementById('user-list');
    const sidebar = document.getElementById('sidebar'), toggleSidebar = document.getElementById('toggle-sidebar');
    const qrModal = document.getElementById('qr-modal'), showQr = document.getElementById('show-qr'), closeQr = document.getElementById('close-qr'), qrcodeDiv = document.getElementById('qrcode');
    const imgInput = document.getElementById('img-input'), destructToggle = document.getElementById('destruct-toggle');

    let ws = null, myName = '', myRoom = '', myKey = null, currentUserId = null, isDestruct = false, typingTimeout = null, lastTypingSent = 0;

    if (Notification.permission !== "granted") Notification.requestPermission();
    function notify(title, body) { if (Notification.permission === "granted" && document.hidden) new Notification(title, { body }); }

    function arrayBufferToBase64(buffer) {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
        return btoa(binary);
    }

    function base64ToArrayBuffer(base64) {
        const binary_string = atob(base64);
        const len = binary_string.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) bytes[i] = binary_string.charCodeAt(i);
        return bytes.buffer;
    }

    async function makeKey(pwd) {
        const encoder = new TextEncoder(), data = encoder.encode(pwd);
        const hash = await crypto.subtle.digest('SHA-256', data);
        return await crypto.subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
    }

    async function encryptData(data) {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, myKey, data);
        const combined = new Uint8Array(iv.length + encrypted.byteLength);
        combined.set(iv); combined.set(new Uint8Array(encrypted), iv.length);
        return arrayBufferToBase64(combined.buffer);
    }

    async function decryptData(b64) {
        try {
            const combined = new Uint8Array(base64ToArrayBuffer(b64));
            const iv = combined.slice(0, 12), data = combined.slice(12);
            return await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, myKey, data);
        } catch (e) { return null; }
    }

    loginBtn.onclick = async () => {
        const u = accUser.value.trim(), p = accPass.value.trim();
        if (!u || !p) return;
        const res = await (await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) })).json();
        if (res.status === 'ok') { currentUserId = res.user_id; userScreen.classList.add('hidden'); authScreen.classList.remove('hidden'); loadHistory(); } else alert(res.msg);
    };

    regBtn.onclick = async () => {
        const u = accUser.value.trim(), p = accPass.value.trim();
        if (!u || !p) return;
        const res = await (await fetch('/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) })).json();
        alert(res.msg || "Registered!");
    };

    async function loadHistory() {
        if (!currentUserId) return;
        const list = await (await fetch(`/api/history/${currentUserId}`)).json();
        roomList.innerHTML = '';
        list.forEach(rid => {
            const span = document.createElement('span'); span.className = 'room-tag'; span.innerText = rid;
            span.onclick = () => { roomInput.value = rid; }; roomList.appendChild(span);
        });
    }

    joinBtn.onclick = async () => {
        const name = nameInput.value.trim(), room = roomInput.value.trim(), pass = passInput.value.trim();
        if (!name || !room || !pass) return;
        const res = await (await fetch('/api/verify-room', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ room_id: room, password: pass }) })).json();
        if (res.status === "fail") return alert(res.msg);

        fetch('/api/save-room', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: currentUserId, room_id: room }) });
        myKey = await makeKey(pass + room); myName = name; myRoom = room;

        const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        ws = new WebSocket(`${protocol}//${location.host}/ws/${room}/${name}?pwd=${encodeURIComponent(pass)}`);
        ws.onopen = () => { authScreen.classList.add('hidden'); chatScreen.classList.remove('hidden'); roomLabel.innerText = room; userLabel.innerText = name; };
        ws.onmessage = async (e) => {
            const data = JSON.parse(e.data);
            if (data.type === 'user_list') {
                userListDiv.innerHTML = data.users.map(u => `<div class="user-item">${u}</div>`).join('');
                document.querySelectorAll('.message').forEach(m => {
                    const author = m.getAttribute('data-author');
                    if (author && author !== myName && !data.users.includes(author)) m.remove();
                });
            } else if (data.type === 'typing') {
                typingArea.innerHTML = data.status ? `${data.username} is typing<span class="typing-dots"><span class="dot"></span><span class="dot"></span><span class="dot"></span></span>` : '';
            } else if (data.type === 'system') {
                addMsg(null, data.content, 'system');
            } else if (data.type === 'delete_msg') {
                const el = document.getElementById(`msg-${data.id}`);
                if (el) el.remove();
            } else if (data.type === 'message' || data.type === 'image') {
                const dec = await decryptData(data.content);
                if (dec) {
                    if (data.type === 'image') {
                        const blob = new Blob([dec]), url = URL.createObjectURL(blob);
                        addImage(data.username, url, data.self_destruct, data.id);
                    } else {
                        addMsg(data.username, new TextDecoder().decode(dec), 'message', data.self_destruct, data.id);
                    }
                    notify(`Secure Transmission`, `${data.username} sent a file/message`);
                }
            } else if (data.type === 'delete_all') {
                document.querySelectorAll(`.author-${data.username}`).forEach(el => el.remove());
                addMsg(null, data.content, 'system');
            }
        };
        ws.onclose = () => location.reload();
    };

    function addMsg(user, txt, type, destruct, id) {
        const d = document.createElement('div'), isMe = user === myName;
        if (type === 'system') { d.className = 'system-msg'; d.innerText = txt; }
        else {
            d.id = `msg-${id}`; d.setAttribute('data-author', user);
            d.className = `message ${isMe ? 'my-msg' : 'other-msg'} author-${user} ${destruct ? 'destructing' : ''}`;
            d.innerHTML = `${isMe ? '' : `<div class='msg-header'>${user}</div>`}<div class='msg-content'>${txt}</div>${destruct ? '<div class="self-destruct-timer">⏲️ Purging in 30s...</div>' : ''}`;
        }
        chatArea.appendChild(d); chatArea.scrollTop = chatArea.scrollHeight;
    }

    function addImage(user, url, destruct, id) {
        const d = document.createElement('div'), isMe = user === myName;
        d.id = `msg-${id}`; d.setAttribute('data-author', user);
        d.className = `message ${isMe ? 'my-msg' : 'other-msg'} author-${user} ${destruct ? 'destructing' : ''}`;
        d.innerHTML = `${isMe ? '' : `<div class='msg-header'>${user}</div>`}<img src="${url}" class="img-msg" onclick="window.open('${url}')">${destruct ? '<div class="self-destruct-timer">⏲️ Purging in 30s...</div>' : ''}`;
        chatArea.appendChild(d); chatArea.scrollTop = chatArea.scrollHeight;
    }

    form.onsubmit = async (e) => {
        e.preventDefault();
        const msg = input.value.trim();
        if (msg && ws?.readyState === WebSocket.OPEN) {
            const s = await encryptData(new TextEncoder().encode(msg));
            ws.send(JSON.stringify({ type: 'message', content: s, self_destruct: isDestruct }));
            input.value = ''; ws.send(JSON.stringify({ type: 'typing', status: false }));
        }
    };

    input.oninput = () => {
        if (ws?.readyState === WebSocket.OPEN) {
            const now = Date.now();
            if (now - lastTypingSent > 1000) {
                ws.send(JSON.stringify({ type: 'typing', status: true }));
                lastTypingSent = now;
            }
            clearTimeout(typingTimeout);
            typingTimeout = setTimeout(() => {
                ws.send(JSON.stringify({ type: 'typing', status: false }));
                lastTypingSent = 0;
            }, 2000);
        }
    };

    imgInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (file && ws?.readyState === WebSocket.OPEN) {
            const reader = new FileReader();
            reader.onload = async () => {
                const s = await encryptData(new Uint8Array(reader.result));
                ws.send(JSON.stringify({ type: 'image', content: s, self_destruct: isDestruct }));
            };
            reader.readAsArrayBuffer(file);
        }
    };

    destructToggle.onclick = () => { isDestruct = !isDestruct; destructToggle.classList.toggle('active-destruct'); };
    toggleSidebar.onclick = () => sidebar.classList.toggle('hidden');
    showQr.onclick = () => {
        qrcodeDiv.innerHTML = '';
        new QRCode(qrcodeDiv, { text: `${location.origin}/?room=${myRoom}`, width: 150, height: 150 });
        qrModal.classList.remove('hidden');
    };
    closeQr.onclick = () => qrModal.classList.add('hidden');
    leaveBtn.onclick = () => ws?.close();
    logoutBtn.onclick = () => location.reload();
});
