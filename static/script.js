document.addEventListener('DOMContentLoaded', () => {
    const $ = id => document.getElementById(id.replace('#', ''));
    const elements = {
        accUser: $('#acc-user'), accPass: $('#acc-pass'), loginBtn: $('#login-btn'), regBtn: $('#reg-btn'),
        nameInput: $('#username'), roomInput: $('#room-id'), passInput: $('#room-password'), joinBtn: $('#join-btn'),
        roomList: $('#room-list'), logoutBtn: $('#logout-btn'), genRoom: $('#gen-room'), gotoChat: $('#goto-chat'),
        form: $('#message-form'), input: $('#message-input'), msgContainers: $('#message-containers'), typingArea: $('#typing-area'),
        roomLabel: $('#display-room'), userListDiv: $('#user-list'), sidebar: $('#sidebar'),
        qrModal: $('#qr-modal'), qrcodeDiv: $('#qrcode'), imgInput: $('#img-input'),
        destructToggle: $('#destruct-toggle'), strengthBar: $('#strength-bar'),
        adminPanel: $('#admin-panel'), wipeBtn: $('#wipe-btn'), lockBtn: $('#lock-btn'), panicBtn: $('#panic-btn'),
        copyInfo: $('#copy-info'), emojiBtn: $('#emoji-btn'), emojiPicker: $('#emoji-picker'),
        addDimension: $('#add-dimension'), activeRoomsTabs: $('#active-rooms-tabs'),
        woosh: $('#woosh-sound'), avOpts: document.querySelectorAll('.av-opt')
    };

    let state = {
        name: '', uid: null, avatar: '👻',
        rooms: {}, // { roomID: { ws, key, name, isAdmin, isLocked, messages: [] } }
        activeRoom: null,
        isDestruct: false
    };

    const showToast = (msg, color = '#a78bfa') => {
        const t = document.createElement('div'); t.className = 'toast'; t.innerText = msg;
        document.body.appendChild(t); setTimeout(() => t.remove(), 4000);
    };

    // --- UTILS ---
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

    async function encrypt(data, roomID, isText = true) {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const payload = isText ? new TextEncoder().encode(data) : data;
        const enc = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, state.rooms[roomID].key, payload);
        const blob = new Uint8Array(iv.length + enc.byteLength);
        blob.set(iv); blob.set(new Uint8Array(enc), iv.length);
        return btoa(String.fromCharCode(...blob));
    }

    async function decrypt(b64, roomID, isText = true) {
        try {
            const blob = new Uint8Array(atob(b64).split('').map(c => c.charCodeAt(0)));
            const iv = blob.slice(0, 12), data = blob.slice(12);
            const dec = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, state.rooms[roomID].key, data);
            return isText ? new TextDecoder().decode(dec) : dec;
        } catch { return null; }
    }

    // --- UI HELPERS ---
    function switchRoom(roomID) {
        state.activeRoom = roomID;
        elements.roomLabel.innerText = roomID;

        // Toggle messaging areas
        document.querySelectorAll('.message-area').forEach(el => el.classList.add('hidden'));
        $(`area-${roomID}`).classList.remove('hidden');

        // Update Tabs
        document.querySelectorAll('.room-tab').forEach(el => el.classList.remove('tab-active'));
        $(`tab-${roomID}`).classList.add('tab-active');

        // Update Admin Panel
        const roomData = state.rooms[roomID];
        elements.adminPanel.classList.toggle('hidden', !roomData.isAdmin);
        elements.lockBtn.innerText = roomData.isLocked ? "UNLOCK PORTAL" : "LOCK PORTAL";

        updateUserList(roomID);
        showToast(`Entering dimension: ${roomID}`);
    }

    function updateUserList(roomID) {
        if (state.activeRoom !== roomID) return;
        const roomData = state.rooms[roomID];
        elements.userListDiv.innerHTML = (roomData.users || []).map(u => `
            <div class="user-item">
                <span>${u}</span> ${u === roomData.adminName ? '⭐' : ''}
                ${roomData.isAdmin && u !== roomData.name ? `<button onclick="banishPhantom('${u}', '${roomID}')" class="kick-btn">KICK</button>` : ''}
            </div>`).join('');
    }

    function addMsg(roomID, user, content, destruct, id, type = 'text') {
        const area = $(`area-${roomID}`);
        if (!area) return;

        const div = document.createElement('div'), isMe = user === state.rooms[roomID].name;
        div.id = `msg-${id}`;

        if (type === 'system') {
            div.className = 'system-msg';
            div.innerHTML = `<span style="opacity:0.5; font-size:0.7rem;">— ${content} —</span>`;
            div.style.textAlign = 'center';
            div.style.margin = '1rem 0';
        } else {
            div.className = `message ${isMe ? 'my-msg' : 'other-msg'} ${destruct ? 'destructing' : ''}`;
            div.onclick = () => { elements.emojiPicker.classList.remove('hidden'); state.targetMsg = { id, roomID }; };
            let html = isMe ? '' : `<div style="font-size:0.7rem; font-weight:900; color:var(--primary); margin-bottom:5px;">${user}</div>`;
            if (type === 'image') html += `<img src="${content}" class="msg-img" onclick="window.open('${content}')">`;
            else if (type === 'file') html += `<div class="file-link">📎 <a href="${content}" target="_blank">Spectral Fragment</a></div>`;
            else html += `<div>${content}</div>`;
            div.innerHTML = html + `<div class="reactions" id="react-${id}"></div>`;
        }
        area.appendChild(div);
        area.scrollTop = area.scrollHeight;
    }

    // --- ACTIONS ---
    elements.loginBtn.onclick = async () => {
        const u = elements.accUser.value.trim(), p = elements.accPass.value.trim(); if (!u || !p) return;
        const res = await (await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) })).json();
        if (res.status === 'ok') {
            state.uid = res.user_id;
            $('#user-screen').classList.add('hidden'); $('#auth-screen').classList.remove('hidden');
            const history = await (await fetch(`/api/history/${state.uid}`)).json();
            elements.roomList.innerHTML = history.map(r => `<span class="room-tag">${r}</span>`).join('');
            document.querySelectorAll('.room-tag').forEach(t => t.onclick = () => elements.roomInput.value = t.innerText);
        } else showToast(res.msg);
    };

    elements.joinBtn.onclick = async () => {
        const n = `${state.avatar} ${elements.nameInput.value.trim()}`, r = elements.roomInput.value.trim(), p = elements.passInput.value.trim();
        if (!elements.nameInput.value.trim() || !r || !p) return showToast("Keys required");
        if (state.rooms[r]) return showToast("Already in this dimension");

        const res = await (await fetch('/api/verify-room', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ room_id: r, password: p }) })).json();
        if (res.status === 'fail') return showToast(res.msg);

        fetch('/api/save-room', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: state.uid, room_id: r }) });

        const key = await getSecretKey(p, r);
        state.rooms[r] = { name: n, key, isAdmin: false, isLocked: false, users: [] };

        const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(`${proto}//${location.host}/ws/${r}/${encodeURIComponent(n)}?pwd=${encodeURIComponent(p)}`);
        state.rooms[r].ws = ws;

        // Create UI for room
        const tab = document.createElement('div');
        tab.id = `tab-${r}`;
        tab.className = 'room-tab';
        tab.innerHTML = `<span>${r}</span> <button onclick="leaveDimension('${r}')">×</button>`;
        tab.onclick = (e) => { if (e.target.tagName !== 'BUTTON') switchRoom(r); };
        elements.activeRoomsTabs.appendChild(tab);

        const area = document.createElement('main');
        area.id = `area-${r}`;
        area.className = 'message-area hidden';
        elements.msgContainers.appendChild(area);

        ws.onopen = () => {
            $('#auth-screen').classList.add('hidden'); $('#chat-screen').classList.remove('hidden');
            switchRoom(r); showToast(`Portal to ${r} established`);
        };

        ws.onmessage = async (e) => {
            const d = JSON.parse(e.data);
            if (d.type === 'error') { showToast(d.message); leaveDimension(r); }
            else if (d.type === 'user_list') {
                const roomData = state.rooms[r];
                roomData.isAdmin = (d.admin === roomData.name);
                roomData.isLocked = d.is_locked;
                roomData.adminName = d.admin;
                roomData.users = d.users;
                updateUserList(r);
                if (state.activeRoom === r) {
                    elements.adminPanel.classList.toggle('hidden', !roomData.isAdmin);
                    elements.lockBtn.innerText = roomData.isLocked ? "UNLOCK PORTAL" : "LOCK PORTAL";
                }
            } else if (d.type === 'message' || d.type === 'image' || d.type === 'file') {
                const dec = await decrypt(d.content, r, d.type === 'message');
                if (dec) {
                    let content = dec;
                    if (d.type !== 'message') content = URL.createObjectURL(new Blob([dec]));
                    addMsg(r, d.username, content, d.self_destruct, d.id, d.type === 'message' ? 'text' : d.type);
                }
            } else if (d.type === 'reaction') {
                const rArea = $(`react-${d.msgId}`);
                if (rArea) {
                    const tag = document.createElement('span'); tag.className = 'reaction-tag'; tag.innerText = d.emoji;
                    rArea.appendChild(tag);
                }
            } else if (d.type === 'system') addMsg(r, null, d.content, false, null, 'system');
            else if (d.type === 'wipe_all') { area.innerHTML = ''; }
            else if (d.type === 'kicked' && d.target === state.rooms[r].name) { showToast(`Banished from ${r}`); leaveDimension(r); }
            else if (d.type === 'typing' && state.activeRoom === r) {
                elements.typingArea.innerText = d.status ? `${d.username} is whispering...` : '';
            }
            else if (d.type === 'delete_msg') { const el = $(`msg-${d.id}`); if (el) el.remove(); }
        };

        ws.onclose = () => { leaveDimension(r); };
    };

    window.leaveDimension = (r) => {
        if (state.rooms[r]?.ws) state.rooms[r].ws.close();
        delete state.rooms[r];
        $(`tab-${r}`)?.remove();
        $(`area-${r}`)?.remove();
        if (state.activeRoom === r) {
            const next = Object.keys(state.rooms)[0];
            if (next) switchRoom(next);
            else { $('#chat-screen').classList.add('hidden'); $('#auth-screen').classList.remove('hidden'); state.activeRoom = null; }
        }
    };

    window.banishPhantom = (t, r) => state.rooms[r].ws.send(JSON.stringify({ type: 'kick', target: t }));
    elements.wipeBtn.onclick = () => { const r = state.activeRoom; if (confirm("Wipe this dimension?")) state.rooms[r].ws.send(JSON.stringify({ type: 'wipe' })); };
    elements.lockBtn.onclick = () => {
        const r = state.activeRoom;
        state.rooms[r].ws.send(JSON.stringify({ type: state.rooms[r].isLocked ? 'unlock' : 'lock' }));
    };

    elements.form.onsubmit = async (e) => {
        e.preventDefault(); const v = elements.input.value.trim(), r = state.activeRoom; if (!v || !r) return;
        const enc = await encrypt(v, r);
        state.rooms[r].ws.send(JSON.stringify({ type: 'message', content: enc, self_destruct: state.isDestruct }));
        elements.input.value = '';
    };

    elements.input.oninput = () => {
        const r = state.activeRoom; if (!r) return;
        state.rooms[r].ws.send(JSON.stringify({ type: 'typing', status: true }));
        clearTimeout(state.typeTimeout);
        state.typeTimeout = setTimeout(() => state.rooms[r]?.ws.send(JSON.stringify({ type: 'typing', status: false })), 2000);
    };

    elements.imgInput.onchange = (e) => {
        const f = e.target.files[0], r = state.activeRoom; if (!f || !r) return;
        const reader = new FileReader();
        reader.onload = async () => {
            const type = f.type.startsWith('image/') ? 'image' : 'file';
            const enc = await encrypt(new Uint8Array(reader.result), r, false);
            state.rooms[r].ws.send(JSON.stringify({ type: type, content: enc, self_destruct: state.isDestruct }));
        };
        reader.readAsArrayBuffer(f);
    };

    elements.addDimension.onclick = () => { $('#chat-screen').classList.add('hidden'); $('#auth-screen').classList.remove('hidden'); };
    elements.gotoChat.onclick = () => { if (Object.keys(state.rooms).length) { $('#auth-screen').classList.add('hidden'); $('#chat-screen').classList.remove('hidden'); } };
    elements.logoutBtn.onclick = () => { Object.keys(state.rooms).forEach(leaveDimension); location.reload(); };
    elements.panicBtn.onclick = () => location.reload();
    elements.copyInfo.onclick = () => {
        const r = state.activeRoom;
        navigator.clipboard.writeText(`Bridge: ${r}`); showToast("Dimension link copied");
    };
    elements.destructToggle.onclick = () => { state.isDestruct = !state.isDestruct; elements.destructToggle.style.color = state.isDestruct ? 'var(--primary)' : 'var(--text-ghost)'; };

    // Emoji & Reaction logic fix
    elements.emojiBtn.onclick = () => { elements.emojiPicker.classList.toggle('hidden'); state.targetMsg = null; };
    document.querySelectorAll('.emoji-opt').forEach(opt => opt.onclick = () => {
        const em = opt.innerText;
        if (state.targetMsg) {
            state.rooms[state.targetMsg.roomID].ws.send(JSON.stringify({ type: 'reaction', emoji: em, msgId: state.targetMsg.id }));
            state.targetMsg = null;
        } else elements.input.value += em;
        elements.emojiPicker.classList.add('hidden');
    });
});
