document.addEventListener('DOMContentLoaded', () => {
    const $ = id => document.getElementById(id.replace('#', ''));
    const elements = {
        accUser: $('#acc-user'), accPass: $('#acc-pass'), loginBtn: $('#login-btn'), regBtn: $('#reg-btn'),
        nameInput: $('#username'), roomInput: $('#room-id'), passInput: $('#room-password'), joinBtn: $('#join-btn'),
        roomList: $('#room-list'), logoutBtn: $('#logout-btn'), genRoom: $('#gen-room'),
        form: $('#message-form'), input: $('#message-input'), chatArea: $('#messages'), typingArea: $('#typing-area'),
        roomLabel: $('#display-room'), userListDiv: $('#user-list'), sidebar: $('#sidebar'),
        qrModal: $('#qr-modal'), qrcodeDiv: $('#qrcode'), imgInput: $('#img-input'),
        destructToggle: $('#destruct-toggle'), strengthBar: $('#strength-bar'),
        adminPanel: $('#admin-panel'), wipeBtn: $('#wipe-btn'), panicBtn: $('#panic-btn'),
        copyInfo: $('#copy-info'), emojiBtn: $('#emoji-btn'), emojiPicker: $('#emoji-picker'),
        woosh: $('#woosh-sound'), avOpts: document.querySelectorAll('.av-opt')
    };

    let state = { ws: null, name: '', room: '', key: null, uid: null, isDestruct: false, avatar: '👻', isAdmin: false, typingSent: 0 };

    const showToast = (msg, color = '#a78bfa') => {
        const t = document.createElement('div'); t.className = 'toast'; t.innerText = msg; t.style.borderLeftColor = color;
        $('#toast-container').appendChild(t); setTimeout(() => t.remove(), 4000);
    };

    elements.genRoom.onclick = () => {
        const id = 'void-' + Math.random().toString(36).substring(2, 8);
        elements.roomInput.value = id; showToast("New dimension mapped");
    };

    elements.avOpts.forEach(opt => opt.onclick = () => {
        elements.avOpts.forEach(o => o.classList.remove('active'));
        opt.classList.add('active'); state.avatar = opt.dataset.av;
    });

    elements.passInput.oninput = () => {
        const v = elements.passInput.value; let s = 0;
        if (v.length > 6) s += 25; if (/[A-Z]/.test(v)) s += 25; if (/[0-9]/.test(v)) s += 25; if (/[^A-Za-z0-9]/.test(v)) s += 25;
        elements.strengthBar.style.width = s + '%';
        elements.strengthBar.style.backgroundColor = s < 50 ? '#ef4444' : (s < 75 ? '#fbbf24' : '#22c55e');
    };

    // --- CRYPTO CORE ---
    async function getSecretKey(pwd, room) {
        const enc = new TextEncoder(), data = enc.encode(pwd + room);
        const hash = await crypto.subtle.digest('SHA-256', data);
        return await crypto.subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
    }

    async function encrypt(data, isText = true) {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const payload = isText ? new TextEncoder().encode(data) : data;
        const enc = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, state.key, payload);
        const blob = new Uint8Array(iv.length + enc.byteLength);
        blob.set(iv); blob.set(new Uint8Array(enc), iv.length);
        return btoa(String.fromCharCode(...blob));
    }

    async function decrypt(b64, isText = true) {
        try {
            const blob = new Uint8Array(atob(b64).split('').map(c => c.charCodeAt(0)));
            const iv = blob.slice(0, 12), data = blob.slice(12);
            const dec = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, state.key, data);
            return isText ? new TextDecoder().decode(dec) : dec;
        } catch (e) { return null; }
    }

    // --- MESSAGING ---
    function addMsg(user, content, destruct, id, type = 'text') {
        const div = document.createElement('div'), isMe = user === state.name;
        div.id = `msg-${id}`;
        if (type === 'system') {
            div.className = 'system-msg'; div.innerText = `— ${content} —`;
        } else {
            div.className = `message ${isMe ? 'my-msg' : 'other-msg'} ${destruct ? 'destructing' : ''}`;
            div.onclick = () => { elements.emojiPicker.classList.remove('hidden'); state.lastMsgId = id; };
            let inner = isMe ? '' : `<div class='msg-header'>${user}</div>`;
            if (type === 'image') inner += `<img src="${content}" class="img-msg" onclick="window.open('${content}')">`;
            else if (type === 'file') inner += `<div class="file-msg">📎 <a href="${content}" target="_blank">Encrypted Ghost File</a></div>`;
            else inner += `<div>${content}</div>`;
            div.innerHTML = inner + `<div class='msg-status'>Sent ✓</div><div class="reactions" id="react-${id}"></div>`;
        }
        elements.chatArea.appendChild(div); elements.chatArea.scrollTop = elements.chatArea.scrollHeight;
    }

    // --- HANDLERS ---
    elements.regBtn.onclick = async () => {
        const u = elements.accUser.value.trim(), p = elements.accPass.value.trim(); if (!u || !p) return;
        const res = await (await fetch('/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) })).json();
        showToast(res.msg || "Spirit registered");
    };

    elements.loginBtn.onclick = async () => {
        const u = elements.accUser.value.trim(), p = elements.accPass.value.trim(); if (!u || !p) return;
        const res = await (await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) })).json();
        if (res.status === 'ok') {
            state.uid = res.user_id;
            $('#user-screen').classList.add('hidden'); $('#auth-screen').classList.remove('hidden');
            const history = await (await fetch(`/api/history/${state.uid}`)).json();
            elements.roomList.innerHTML = history.map(r => `<span class="room-tag">${r}</span>`).join('');
            document.querySelectorAll('.room-tag').forEach(t => t.onclick = () => { elements.roomInput.value = t.innerText; showToast(`Echo: ${t.innerText}`); });
        } else showToast(res.msg, "#ff4d4d");
    };

    elements.joinBtn.onclick = async () => {
        const n = `${state.avatar} ${elements.nameInput.value.trim()}`, r = elements.roomInput.value.trim(), p = elements.passInput.value.trim();
        if (!elements.nameInput.value.trim() || !r || !p) return showToast("Keys missing", "#ff4d4d");
        const res = await (await fetch('/api/verify-room', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ room_id: r, password: p }) })).json();
        if (res.status === 'fail') return showToast(res.msg, "#ff4d4d");

        fetch('/api/save-room', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: state.uid, room_id: r }) });
        state.key = await getSecretKey(p, r); state.name = n; state.room = r;

        const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
        state.ws = new WebSocket(`${proto}//${location.host}/ws/${r}/${encodeURIComponent(n)}?pwd=${encodeURIComponent(p)}`);

        state.ws.onopen = () => { $('#auth-screen').classList.add('hidden'); $('#chat-screen').classList.remove('hidden'); elements.roomLabel.innerText = r; showToast("Portal Open"); };
        state.ws.onmessage = async (e) => {
            const d = JSON.parse(e.data);
            if (d.type === 'user_list') {
                state.isAdmin = (d.admin === state.name); elements.adminPanel.classList.toggle('hidden', !state.isAdmin);
                elements.userListDiv.innerHTML = d.users.map(u => `<div class="user-item">${u}${u === d.admin ? ' ⭐' : ''}${state.isAdmin && u !== state.name ? ` <button class="kick-btn" onclick="banish('${u}')">KICK</button>` : ''}</div>`).join('');
            } else if (d.type === 'message' || d.type === 'image' || d.type === 'file') {
                const dec = await decrypt(d.content, d.type === 'message');
                if (dec) {
                    let content = dec;
                    if (d.type !== 'message') {
                        const blob = new Blob([dec]); content = URL.createObjectURL(blob);
                    }
                    addMsg(d.username, content, d.self_destruct, d.id, d.type === 'message' ? 'text' : d.type);
                    if (document.hidden) { elements.woosh.play(); }
                }
            } else if (d.type === 'reaction') {
                const area = $(`react-${d.msgId}`);
                if (area) {
                    const r = document.createElement('span'); r.className = 'reaction-tag'; r.innerText = `${d.emoji} ${d.username.split(' ')[0]}`;
                    area.appendChild(r);
                }
            } else if (d.type === 'system') addMsg(null, d.content, false, null, 'system');
            else if (d.type === 'wipe_all') { elements.chatArea.innerHTML = ''; addMsg(null, "Dimension Cleansed", false, null, 'system'); }
            else if (d.type === 'kicked' && d.target === state.name) { showToast("Banished!"); location.reload(); }
            else if (d.type === 'typing') elements.typingArea.innerText = d.status ? `${d.username} is whispering...` : '';
            else if (d.type === 'delete_msg') { const el = $(`msg-${d.id}`); if (el) { el.classList.add('vanished'); setTimeout(() => el.remove(), 500); } }
        };
    };

    window.banish = (target) => state.ws.send(JSON.stringify({ type: 'kick', target: target }));
    elements.wipeBtn.onclick = () => state.ws.send(JSON.stringify({ type: 'wipe' }));

    elements.form.onsubmit = async (e) => {
        e.preventDefault(); const v = elements.input.value.trim(); if (!v) return;
        const enc = await encrypt(v);
        state.ws.send(JSON.stringify({ type: 'message', content: enc, self_destruct: state.isDestruct }));
        elements.input.value = ''; state.ws.send(JSON.stringify({ type: 'typing', status: false }));
    };

    elements.input.oninput = () => {
        if (Date.now() - state.typingSent > 1500) { state.ws.send(JSON.stringify({ type: 'typing', status: true })); state.typingSent = Date.now(); }
        clearTimeout(state.typingTimeout); state.typingTimeout = setTimeout(() => { state.ws.send(JSON.stringify({ type: 'typing', status: false })); state.typingSent = 0; }, 2000);
    };

    elements.imgInput.onchange = async (e) => {
        const file = e.target.files[0]; if (!file) return;
        const reader = new FileReader(); reader.onload = async () => {
            const type = file.type.startsWith('image/') ? 'image' : 'file';
            const enc = await encrypt(new Uint8Array(reader.result), false);
            state.ws.send(JSON.stringify({ type: type, content: enc, self_destruct: state.isDestruct }));
        }; reader.readAsArrayBuffer(file);
    };

    elements.panicBtn.onclick = () => location.reload();
    elements.copyInfo.onclick = () => { navigator.clipboard.writeText(`Bridge: ${state.room}\nSeal: ${elements.passInput.value}`); showToast("Portal keys copied"); };
    elements.destructToggle.onclick = () => { state.isDestruct = !state.isDestruct; elements.destructToggle.style.color = state.isDestruct ? 'var(--primary)' : 'var(--text-ghost)'; showToast(state.isDestruct ? "Vanish Active" : "Vanish Disabled"); };
    $('#show-about').onclick = () => $('#about-modal').classList.remove('hidden');
    $('#close-about').onclick = () => $('#about-modal').classList.add('hidden');
    $('#toggle-sidebar').onclick = () => elements.sidebar.classList.toggle('hidden');
    $('#panic-btn').onclick = () => location.reload();
    $('#show-qr').onclick = () => {
        elements.qrcodeDiv.innerHTML = '';
        new QRCode(elements.qrcodeDiv, { text: `${location.origin}/?room=${state.room}`, width: 160, height: 160 });
        $('#qr-modal').classList.remove('hidden');
    };
    $('#close-qr').onclick = () => $('#qr-modal').classList.add('hidden');
    $('#emoji-btn').onclick = () => { elements.emojiPicker.classList.toggle('hidden'); state.lastMsgId = null; };
    document.querySelectorAll('.emoji-opt').forEach(opt => opt.onclick = () => {
        const em = opt.innerText;
        if (state.lastMsgId) {
            state.ws.send(JSON.stringify({ type: 'reaction', emoji: em, msgId: state.lastMsgId, username: state.name }));
            state.lastMsgId = null;
        } else {
            elements.input.value += em; elements.input.focus();
        }
        elements.emojiPicker.classList.add('hidden');
    });
});
