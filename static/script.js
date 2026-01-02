document.addEventListener('DOMContentLoaded', () => {
    const userScreen = document.getElementById('user-screen');
    const authScreen = document.getElementById('auth-screen');
    const chatScreen = document.getElementById('chat-screen');
    const accUser = document.getElementById('acc-user');
    const accPass = document.getElementById('acc-pass');
    const loginBtn = document.getElementById('login-btn');
    const regBtn = document.getElementById('reg-btn');
    const nameInput = document.getElementById('username');
    const roomInput = document.getElementById('room-id');
    const passInput = document.getElementById('room-password');
    const joinBtn = document.getElementById('join-btn');
    const roomList = document.getElementById('room-list');
    const logoutBtn = document.getElementById('logout-btn');
    const leaveBtn = document.getElementById('leave-btn');
    const form = document.getElementById('message-form');
    const input = document.getElementById('message-input');
    const chatArea = document.getElementById('messages');
    const roomLabel = document.getElementById('display-room');
    const userLabel = document.getElementById('display-username');

    let ws = null;
    let myName = '';
    let myRoom = '';
    let myKey = null;
    let currentUserId = null;

    if (Notification.permission !== "granted") {
        Notification.requestPermission();
    }

    function notify(title, body) {
        if (Notification.permission === "granted" && document.hidden) {
            new Notification(title, { body });
        }
    }

    async function makeKey(pwd) {
        const encoder = new TextEncoder();
        const data = encoder.encode(pwd);
        const hash = await crypto.subtle.digest('SHA-256', data);
        return await crypto.subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
    }

    async function encryptMsg(text) {
        if (!myKey) return text;
        const encoder = new TextEncoder();
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, myKey, encoder.encode(text));
        const combined = new Uint8Array(iv.length + encrypted.byteLength);
        combined.set(iv);
        combined.set(new Uint8Array(encrypted), iv.length);
        return btoa(String.fromCharCode(...combined));
    }

    async function decryptMsg(b64) {
        if (!myKey) return b64;
        try {
            const combined = new Uint8Array(atob(b64).split("").map(c => c.charCodeAt(0)));
            const iv = combined.slice(0, 12);
            const data = combined.slice(12);
            const dec = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, myKey, data);
            return new TextDecoder().decode(dec);
        } catch (err) {
            return "[Encrypted]";
        }
    }

    loginBtn.onclick = async () => {
        const u = accUser.value.trim();
        const p = accPass.value.trim();
        if (!u || !p) return;
        const r = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: u, password: p })
        });
        const res = await r.json();
        if (res.status === 'ok') {
            currentUserId = res.user_id;
            userScreen.classList.add('hidden');
            authScreen.classList.remove('hidden');
            loadHistory();
        } else {
            alert(res.msg);
        }
    };

    regBtn.onclick = async () => {
        const u = accUser.value.trim();
        const p = accPass.value.trim();
        if (!u || !p) return;
        const r = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: u, password: p })
        });
        const res = await r.json();
        alert(res.msg || "Register success! Now login.");
    };

    async function loadHistory() {
        if (!currentUserId) return;
        const r = await fetch(`/api/history/${currentUserId}`);
        const list = await r.json();
        roomList.innerHTML = '';
        list.forEach(rid => {
            const span = document.createElement('span');
            span.className = 'room-tag';
            span.innerText = rid;
            span.onclick = () => { roomInput.value = rid; };
            roomList.appendChild(span);
        });
    }

    async function startChat() {
        const name = nameInput.value.trim();
        const room = roomInput.value.trim();
        const pass = passInput.value.trim();
        if (!name || !room || !pass) return;

        joinBtn.disabled = true;
        const resp = await fetch('/api/verify-room', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ room_id: room, password: pass })
        });
        const res = await resp.json();
        if (res.status === "fail") {
            alert(res.msg);
            joinBtn.disabled = false;
            return;
        }

        await fetch('/api/save-room', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: currentUserId, room_id: room })
        });

        myKey = await makeKey(pass + room);
        myName = name;
        myRoom = room;

        const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        ws = new WebSocket(`${protocol}//${location.host}/ws/${room}/${name}?pwd=${encodeURIComponent(pass)}`);

        ws.onopen = () => {
            authScreen.classList.add('hidden');
            chatScreen.classList.remove('hidden');
            roomLabel.innerText = room;
            userLabel.innerText = name;
            chatArea.innerHTML = '';
        };

        ws.onmessage = async (e) => {
            const data = JSON.parse(e.data);
            if (data.type === 'system') {
                addMsg(null, data.content, true);
            } else if (data.type === 'message') {
                const text = await decryptMsg(data.content);
                addMsg(data.username, text, false);
                notify(`New message in ${myRoom}`, `${data.username}: ${text}`);
            } else if (data.type === 'delete_all') {
                document.querySelectorAll(`.msg-${data.username}`).forEach(el => el.remove());
                addMsg(null, data.content, true);
            }
        };
        ws.onclose = () => { location.reload(); };
    }

    function addMsg(user, txt, isSys) {
        const d = document.createElement('div');
        if (isSys) {
            d.className = 'system-msg';
            d.innerText = txt;
        } else {
            const isMe = user === myName;
            d.className = `message ${isMe ? 'my-msg' : 'other-msg'} msg-${user}`;
            d.innerHTML = `${isMe ? '' : `<div class='msg-header'>${user}</div>`}<div class='msg-content'>${txt}</div>`;
        }
        chatArea.appendChild(d);
        chatArea.scrollTop = chatArea.scrollHeight;
    }

    joinBtn.onclick = startChat;
    logoutBtn.onclick = () => location.reload();
    leaveBtn.onclick = () => { if (ws) ws.close(); };
    form.onsubmit = async (e) => {
        e.preventDefault();
        const msg = input.value.trim();
        if (msg && ws && ws.readyState === WebSocket.OPEN) {
            const s = await encryptMsg(msg);
            ws.send(JSON.stringify({ content: s }));
            input.value = '';
        }
    };
});
