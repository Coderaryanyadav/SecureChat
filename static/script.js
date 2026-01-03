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
        adminPanel: $('#admin-panel'), wipeBtn: $('#wipe-btn'), lockBtn: $('#lock-btn'), panicBtn: $('#panic-btn'),
        copyInfo: $('#copy-info'), emojiBtn: $('#emoji-btn'), emojiPicker: $('#emoji-picker'),
        woosh: $('#woosh-sound'), avOpts: document.querySelectorAll('.av-opt')
    };

    let state = { ws: null, name: '', room: '', key: null, uid: null, isDestruct: false, avatar: '👻', isAdmin: false, isLocked: false };

    const showToast = (msg, color = '#a78bfa') => {
        const t = document.createElement('div'); t.className = 'toast'; t.innerText = msg;
        document.body.appendChild(t); setTimeout(() => t.remove(), 4000);
    };

    elements.genRoom.onclick = () => {
        elements.roomInput.value = 'void-' + Math.random().toString(36).substring(2, 7);
        showToast("Dimension mapped");
    };

    elements.avOpts.forEach(opt => opt.onclick = () => {
        elements.avOpts.forEach(o => o.classList.remove('active'));
        opt.classList.add('active'); state.avatar = opt.dataset.av;
    });

    elements.passInput.oninput = () => {
        const v = elements.passInput.value; let s = 0;
        if (v.length > 6) s += 25; if (/[A-Z]/.test(v)) s += 25; if (/[0-9]/.test(v)) s += 25; if (/[^A-Za-z0-9]/.test(v)) s += 25;
        elements.strengthBar.style.width = s + '%';
        elements.strengthBar.style.backgroundColor = s < 50 ? '#ef4444' : (s < 75 ? '#fbbf24' : '#10b981');
    };

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
        } catch { return null; }
    }

    function addMsg(user, content, destruct, id, type = 'text') {
        const div = document.createElement('div'), isMe = user === state.name;
        div.id = `msg-${id}`;
        if (type === 'system') {
            div.className = 'system-msg';
            div.innerHTML = `<span style="opacity:0.5; font-size:0.7rem;">— ${content} —</span>`;
            div.style.textAlign = 'center';
            div.style.margin = '1rem 0';
        } else {
            div.className = `message ${isMe ? 'my-msg' : 'other-msg'} ${destruct ? 'destructing' : ''}`;
            div.onclick = () => { elements.emojiPicker.classList.remove('hidden'); state.targetMsg = id; };
            let html = isMe ? '' : `<div style="font-size:0.7rem; font-weight:900; color:var(--primary); margin-bottom:5px;">${user}</div>`;
            if (type === 'image') html += `<img src="${content}" style="max-width:100%; border-radius:15px; cursor:pointer;" onclick="window.open('${content}')">`;
            else if (type === 'file') html += `<div style="display:flex; align-items:center; gap:10px; background:rgba(0,0,0,0.2); padding:10px; border-radius:12px;">📎 <a href="${content}" target="_blank" style="color:var(--primary); text-decoration:none; font-weight:700;">Ghost File</a></div>`;
            else html += `<div>${content}</div>`;
            div.innerHTML = html + `<div class="reactions" id="react-${id}"></div>`;
        }
        elements.chatArea.appendChild(div);
        elements.chatArea.scrollTop = elements.chatArea.scrollHeight;
    }

    elements.regBtn.onclick = async () => {
        const u = elements.accUser.value.trim(), p = elements.accPass.value.trim(); if (!u || !p) return;
        const res = await (await fetch('/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) })).json();
        showToast(res.msg || "Spirit manifestation registered");
    };

    elements.loginBtn.onclick = async () => {
        const u = elements.accUser.value.trim(), p = elements.accPass.value.trim(); if (!u || !p) return;
        const res = await (await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) })).json();
        if (res.status === 'ok') {
            state.uid = res.user_id;
            $('#user-screen').classList.add('hidden'); $('#auth-screen').classList.remove('hidden');
            const history = await (await fetch(`/api/history/${state.uid}`)).json();
            elements.roomList.innerHTML = history.map(r => `<span class="room-tag" style="background:rgba(255,255,255,0.05); padding:8px 15px; border-radius:12px; cursor:pointer; font-size:0.8rem; border:1px solid var(--glass-border);">${r}</span>`).join('');
            document.querySelectorAll('.room-tag').forEach(t => t.onclick = () => elements.roomInput.value = t.innerText);
        } else showToast(res.msg);
    };

    elements.joinBtn.onclick = async () => {
        const n = `${state.avatar} ${elements.nameInput.value.trim()}`, r = elements.roomInput.value.trim(), p = elements.passInput.value.trim();
        if (!elements.nameInput.value.trim() || !r || !p) return showToast("Dimensions require keys");
        const res = await (await fetch('/api/verify-room', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ room_id: r, password: p }) })).json();
        if (res.status === 'fail') return showToast(res.msg);

        state.key = await getSecretKey(p, r); state.name = n; state.room = r;
        fetch('/api/save-room', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: state.uid, room_id: r }) });

        const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
        state.ws = new WebSocket(`${proto}//${location.host}/ws/${r}/${encodeURIComponent(n)}?pwd=${encodeURIComponent(p)}`);

        state.ws.onopen = () => {
            $('#auth-screen').classList.add('hidden'); $('#chat-screen').classList.remove('hidden');
            elements.roomLabel.innerText = r; showToast("Portal Open");
        };

        state.ws.onmessage = async (e) => {
            const d = JSON.parse(e.data);
            if (d.type === 'error') { showToast(d.message); state.ws.close(); location.reload(); }
            else if (d.type === 'user_list') {
                state.isAdmin = (d.admin === state.name);
                state.isLocked = d.is_locked;
                elements.adminPanel.classList.toggle('hidden', !state.isAdmin);
                elements.lockBtn.innerText = state.isLocked ? "UNLOCK PORTAL" : "LOCK PORTAL";
                elements.userListDiv.innerHTML = d.users.map(u => `
                    <div class="user-item">
                        <span>${u}</span> ${u === d.admin ? '⭐' : ''}
                        ${state.isAdmin && u !== state.name ? `<button onclick="banish('${u}')" style="margin-left:auto; background:none; border:none; color:var(--danger); cursor:pointer; font-size:0.7rem;">KICK</button>` : ''}
                    </div>`).join('');
            } else if (d.type === 'message' || d.type === 'image' || d.type === 'file') {
                const dec = await decrypt(d.content, d.type === 'message');
                if (dec) {
                    let content = dec;
                    if (d.type !== 'message') content = URL.createObjectURL(new Blob([dec]));
                    addMsg(d.username, content, d.self_destruct, d.id, d.type === 'message' ? 'text' : d.type);
                }
            } else if (d.type === 'reaction') {
                const rArea = $(`react-${d.msgId}`);
                if (rArea) {
                    const tag = document.createElement('span'); tag.className = 'reaction-tag'; tag.innerText = d.emoji;
                    rArea.appendChild(tag);
                }
            } else if (d.type === 'system') addMsg(null, d.content, false, null, 'system');
            else if (d.type === 'wipe_all') elements.chatArea.innerHTML = '';
            else if (d.type === 'kicked' && d.target === state.name) { showToast("Banished!"); location.reload(); }
            else if (d.type === 'typing') elements.typingArea.innerText = d.status ? `${d.username} is whispering...` : '';
            else if (d.type === 'delete_msg') { const el = $(`msg-${d.id}`); if (el) el.remove(); }
        };
    };

    window.banish = (t) => state.ws.send(JSON.stringify({ type: 'kick', target: t }));
    elements.wipeBtn.onclick = () => { if (confirm("Erase all echoes in this dimension?")) state.ws.send(JSON.stringify({ type: 'wipe' })); };
    elements.lockBtn.onclick = () => state.ws.send(JSON.stringify({ type: state.isLocked ? 'unlock' : 'lock' }));

    elements.form.onsubmit = async (e) => {
        e.preventDefault(); const v = elements.input.value.trim(); if (!v) return;
        const enc = await encrypt(v);
        state.ws.send(JSON.stringify({ type: 'message', content: enc, self_destruct: state.isDestruct }));
        elements.input.value = ''; state.ws.send(JSON.stringify({ type: 'typing', status: false }));
    };

    elements.input.oninput = () => {
        state.ws.send(JSON.stringify({ type: 'typing', status: true }));
        clearTimeout(state.typeTimeout);
        state.typeTimeout = setTimeout(() => state.ws.send(JSON.stringify({ type: 'typing', status: false })), 2000);
    };

    elements.imgInput.onchange = (e) => {
        const f = e.target.files[0]; if (!f) return;
        const reader = new FileReader();
        reader.onload = async () => {
            const type = f.type.startsWith('image/') ? 'image' : 'file';
            const enc = await encrypt(new Uint8Array(reader.result), false);
            state.ws.send(JSON.stringify({ type: type, content: enc, self_destruct: state.isDestruct }));
        };
        reader.readAsArrayBuffer(f);
    };

    elements.panicBtn.onclick = () => location.reload();
    elements.copyInfo.onclick = () => { navigator.clipboard.writeText(`Dimension: ${state.room}\nSeal: ${elements.passInput.value}`); showToast("Portal keys copied"); };
    elements.destructToggle.onclick = () => { state.isDestruct = !state.isDestruct; elements.destructToggle.style.color = state.isDestruct ? 'var(--primary)' : 'var(--text-ghost)'; };
    elements.emojiBtn.onclick = () => { elements.emojiPicker.classList.toggle('hidden'); state.targetMsg = null; };
    document.querySelectorAll('.emoji-opt').forEach(opt => opt.onclick = () => {
        if (state.targetMsg) {
            state.ws.send(JSON.stringify({ type: 'reaction', emoji: opt.innerText, msgId: state.targetMsg }));
            state.targetMsg = null;
        } else elements.input.value += opt.innerText;
        elements.emojiPicker.classList.add('hidden');
    });
});
