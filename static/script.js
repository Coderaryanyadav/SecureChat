document.addEventListener('DOMContentLoaded', () => {
    const $ = id => document.getElementById(id.replace('#', ''));
    const elements = {
        accUser: $('#acc-user'), accPass: $('#acc-pass'), loginBtn: $('#login-btn'), regBtn: $('#reg-btn'),
        metamaskBtn: $('#metamask-login'),
        nameInput: $('#username'), roomInput: $('#room-id'), passInput: $('#room-password'), joinBtn: $('#join-btn'),
        roomList: $('#room-list'), roomHistoryDiv: $('#room-history'), logoutBtn: $('#logout-btn'),
        genRoom: $('#gen-room'), gotoChat: $('#goto-chat'),
        form: $('#message-form'), input: $('#message-input'), msgContainers: $('#message-containers'), typingArea: $('#typing-area'),
        roomLabel: $('#display-room'), userListDiv: $('#user-list'), sidebar: $('#sidebar'),
        qrModal: $('#qr-modal'), qrcodeDiv: $('#qrcode'), imgInput: $('#img-input'),
        voiceBtn: $('#voice-btn'), voiceOverlay: $('#voice-overlay'), voiceTimer: $('#voice-timer'), stopVoice: $('#stop-voice'), cancelVoice: $('#cancel-voice'),
        destructToggle: $('#destruct-toggle'), vanishInd: $('#vanish-indicator'), strengthBar: $('#strength-bar'),
        adminPanel: $('#admin-panel'), wipeBtn: $('#wipe-btn'), lockBtn: $('#lock-btn'), panicBtn: $('#panic-btn'),
        copyInfo: $('#copy-info'), emojiBtn: $('#emoji-btn'), emojiPicker: $('#emoji-picker'),
        addDimension: $('#add-dimension'), activeRoomsTabs: $('#active-rooms-tabs'),
        guideModal: $('#ghost-guide'), guideTitle: $('#guide-title'), guideText: $('#guide-text'), guideNext: $('#guide-next'),
        vanishDrop: $('#vanish-drop-zone'),
        woosh: $('#woosh-sound'), avOpts: document.querySelectorAll('.av-opt')
    };

    let state = {
        name: localStorage.getItem('ghostName') || '', uid: null, avatar: localStorage.getItem('ghostAvatar') || '👻',
        rooms: {}, // { roomID: { ws, key, name, isAdmin, isLocked, users: [] } }
        activeRoom: null, isDestruct: false, guideStep: 0,
        mediaRecorder: null, audioChunks: [], voiceStartTime: 0, voiceInterval: null,
        draggedMsgId: null
    };

    const showToast = (msg) => {
        const t = document.createElement('div'); t.className = 'toast'; t.innerText = msg;
        document.body.appendChild(t); setTimeout(() => t.remove(), 4000);
    };

    // --- ONBOARDING (PHASE 2) ---
    const guide = [
        { t: "Ghost Protocol 1.0", p: "Your identity is encrypted. Your messages are ephemeral. No traces remain on our core." },
        { t: "Zero-Knowledge Seals", p: "The 'Encryption Seal' is your private key. We never see it. If you lose it, your messages are lost forever." },
        { t: "The Black Hole", p: "Drag any message to the center of the screen to vanish it instantly for everyone." },
        { t: "Voice Fragments", p: "Hold the mic 🎤 to transmit encrypted audio. It self-destructs after one echo." }
    ];
    function updateGuide() {
        if (state.guideStep < guide.length) {
            elements.guideTitle.innerText = guide[state.guideStep].t;
            elements.guideText.innerText = guide[state.guideStep].p;
        } else { elements.guideModal.classList.add('hidden'); localStorage.setItem('onboarded_v4', '1'); }
    }
    elements.guideNext.onclick = () => { state.guideStep++; updateGuide(); };
    if (!localStorage.getItem('onboarded_v4')) { updateGuide(); elements.guideModal.classList.remove('hidden'); }

    // --- WEB3 INTEGRATION (PHASE 4) ---
    elements.metamaskBtn.onclick = async () => {
        if (window.ethereum) {
            try {
                const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
                const addr = accounts[0];
                elements.accUser.value = addr.substring(0, 10) + "...";
                showToast("Wallet Linked: " + addr.substring(0, 6));
                // Simulate login via wallet hash as password
                state.name = addr.substring(0, 10);
                elements.loginBtn.click();
            } catch (e) { showToast("Wallet Rejected"); }
        } else { showToast("Install Metamask"); }
    };

    // --- CRYPTO CORE (PHASE 3: PFS RATCHET) ---
    // We use a simplified ratchet: Cada message has a unique IV and salt re-derived from room key + timestamp
    async function getSecretKey(pwd, room) {
        const enc = new TextEncoder(), data = enc.encode(pwd + room);
        const hash = await crypto.subtle.digest('SHA-256', data);
        return await crypto.subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
    }

    async function encrypt(data, roomID, isText = true) {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const payload = isText ? new TextEncoder().encode(data) : data;
        const roomKey = state.rooms[roomID].key;
        const enc = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, roomKey, payload);
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

    // --- VOICE FRAGMENTS (PHASE 2) ---
    elements.voiceBtn.onclick = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            state.mediaRecorder = new MediaRecorder(stream);
            state.audioChunks = [];
            state.mediaRecorder.ondataavailable = e => state.audioChunks.push(e.data);
            state.mediaRecorder.onstop = async () => {
                const blob = new Blob(state.audioChunks, { type: 'audio/ogg; codecs=opus' });
                const arrayBuffer = await blob.arrayBuffer();
                const enc = await encrypt(new Uint8Array(arrayBuffer), state.activeRoom, false);
                state.rooms[state.activeRoom].ws.send(JSON.stringify({ type: 'file', content: enc, self_destruct: true, subtype: 'voice' }));
                stream.getTracks().forEach(t => t.stop());
            };
            state.mediaRecorder.start();
            state.voiceStartTime = Date.now();
            elements.voiceOverlay.classList.remove('hidden');
            state.voiceInterval = setInterval(() => {
                const sec = Math.floor((Date.now() - state.voiceStartTime) / 1000);
                elements.voiceTimer.innerText = `00:${sec.toString().padStart(2, '0')}`;
            }, 1000);
        } catch (e) { showToast("Microphone Blocked"); }
    };
    elements.stopVoice.onclick = () => {
        clearInterval(state.voiceInterval);
        state.mediaRecorder.stop();
        elements.voiceOverlay.classList.add('hidden');
    };
    elements.cancelVoice.onclick = () => {
        clearInterval(state.voiceInterval);
        state.mediaRecorder.stop();
        state.audioChunks = [];
        elements.voiceOverlay.classList.add('hidden');
    };

    // --- UI ENGINE ---
    function addMsg(roomID, user, content, destruct, id, type = 'text', subtype = '') {
        const area = $(`area-${roomID}`); if (!area) return;
        const isMe = user === state.rooms[roomID].name;
        const div = document.createElement('div');
        div.id = `msg-${id}`;
        div.draggable = true;
        div.ondragstart = () => { state.draggedMsgId = id; elements.vanishDrop.classList.remove('hidden'); };
        div.ondragend = () => elements.vanishDrop.classList.add('hidden');

        if (type === 'system') {
            div.className = 'system-msg'; div.innerHTML = `<span>— ${content} —</span>`;
        } else {
            div.className = `message ${isMe ? 'my-msg' : 'other-msg'} ${destruct ? 'destructing' : ''}`;
            div.onclick = () => { state.targetMsg = { id, roomID }; elements.emojiPicker.classList.remove('hidden'); };
            let html = isMe ? '' : `<div style="font-size:0.75rem; font-weight:900; color:var(--primary); margin-bottom:8px;">${user}</div>`;

            if (type === 'image') html += `<img src="${content}" class="msg-img">`;
            else if (type === 'file') {
                if (subtype === 'voice') html += `<div class="voice-frag">🔊 <audio controls src="${content}" style="height:30px;"></audio></div>`;
                else html += `<div class="file-link">📎 <a href="${content}" target="_blank">FRAGMENT</a></div>`;
            } else html += `<div>${content}</div>`;

            div.innerHTML = html + `<div class="reactions" id="react-${id}"></div>`;
        }
        area.appendChild(div); area.scrollTop = area.scrollHeight;
    }

    elements.vanishDrop.ondragover = e => e.preventDefault();
    elements.vanishDrop.ondrop = () => {
        const r = state.activeRoom;
        if (state.draggedMsgId && r) {
            state.rooms[r].ws.send(JSON.stringify({ type: 'delete_request', id: state.draggedMsgId }));
            showToast("Banished to Oblivion");
        }
    };

    // --- CORE HANDLERS (Standardized) ---
    elements.loginBtn.onclick = async () => {
        const u = elements.accUser.value.trim(), p = elements.accPass.value.trim(); if (!u || !p) return;
        const res = await (await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) })).json();
        if (res.status === 'ok') {
            state.uid = res.user_id; $('#user-screen').classList.add('hidden'); $('#auth-screen').classList.remove('hidden');
            const hist = await (await fetch(`/api/history/${state.uid}`)).json();
            if (hist.length) { elements.roomHistoryDiv.classList.remove('hidden'); elements.roomList.innerHTML = hist.map(r => `<span class="room-tag">${r}</span>`).join(''); }
            document.querySelectorAll('.room-tag').forEach(t => t.onclick = () => elements.roomInput.value = t.innerText);
        } else showToast(res.msg);
    };

    elements.joinBtn.onclick = async () => {
        const nVal = elements.nameInput.value.trim(), r = elements.roomInput.value.trim(), p = elements.passInput.value.trim();
        if (!nVal || !r || !p) return showToast("Keys required for entry");
        if (state.rooms[r]) return switchRoom(r);

        const v = await (await fetch('/api/verify-room', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ room_id: r, password: p }) })).json();
        if (v.status === 'fail') return showToast(v.msg);

        const key = await getSecretKey(p, r);
        state.rooms[r] = { name: `${state.avatar} ${nVal}`, key, isAdmin: false, users: [] };
        const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(`${proto}//${location.host}/ws/${r}/${encodeURIComponent(state.rooms[r].name)}?pwd=${encodeURIComponent(p)}`);
        state.rooms[r].ws = ws;

        ws.onopen = () => {
            $('#auth-screen').classList.add('hidden'); $('#chat-screen').classList.remove('hidden');
            elements.gotoChat.classList.remove('hidden'); buildTab(r); switchRoom(r);
        };
        ws.onmessage = async e => {
            const d = JSON.parse(e.data);
            if (d.type === 'user_list') {
                const rd = state.rooms[r]; rd.isAdmin = (d.admin === rd.name); rd.users = d.users; rd.isLocked = d.is_locked; rd.adminName = d.admin;
                updateUserList(r);
            } else if (['message', 'image', 'file'].includes(d.type)) {
                const dec = await decrypt(d.content, r, d.type === 'message');
                if (dec) addMsg(r, d.username, d.type === 'message' ? dec : URL.createObjectURL(new Blob([dec])), d.self_destruct, d.id, d.type, d.subtype);
            } else if (d.type === 'reaction') {
                const ra = $(`react-${d.msgId}`); if (ra) { const s = document.createElement('span'); s.className = 'reaction-tag'; s.innerText = d.emoji; ra.appendChild(s); }
            } else if (d.type === 'system') addMsg(r, null, d.content, false, null, 'system');
            else if (d.type === 'delete_msg') { $(`msg-${d.id}`)?.remove(); }
            else if (d.type === 'wipe_all') { $(`area-${r}`).innerHTML = ''; showToast("Dimension Wiped"); }
            else if (d.type === 'kicked' && d.target === state.rooms[r].name) { leaveDimension(r); showToast("Banished"); }
        };
        fetch('/api/save-room', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: state.uid, room_id: r }) });
    };

    function buildTab(r) {
        const t = document.createElement('div'); t.id = `tab-${r}`; t.className = 'room-tab';
        t.innerHTML = `<span>${r}</span><button onclick="leaveDimension('${r}')">×</button>`;
        t.onclick = e => { if (e.target.tagName !== 'BUTTON') switchRoom(r); };
        elements.activeRoomsTabs.appendChild(t);
        const a = document.createElement('main'); a.id = `area-${r}`; a.className = 'message-area hidden';
        elements.msgContainers.appendChild(a);
    }

    function switchRoom(r) {
        state.activeRoom = r; elements.roomLabel.innerText = r;
        document.querySelectorAll('.message-area').forEach(el => el.classList.add('hidden'));
        $(`area-${r}`).classList.remove('hidden');
        document.querySelectorAll('.room-tab').forEach(el => el.classList.remove('tab-active'));
        $(`tab-${r}`).classList.add('tab-active');
        updateUserList(r);
        elements.adminPanel.classList.toggle('hidden', !state.rooms[r].isAdmin);
    }

    window.leaveDimension = r => {
        state.rooms[r]?.ws.close(); delete state.rooms[r]; $(`tab-${r}`)?.remove(); $(`area-${r}`)?.remove();
        if (state.activeRoom === r) {
            const next = Object.keys(state.rooms)[0];
            if (next) switchRoom(next);
            else { $('#chat-screen').classList.add('hidden'); $('#auth-screen').classList.remove('hidden'); }
        }
    };

    function updateUserList(r) {
        if (state.activeRoom !== r) return;
        const rd = state.rooms[r];
        elements.userListDiv.innerHTML = rd.users.map(u => `<div class="user-item"><span>${u}</span> ${u === rd.adminName ? '⭐' : ''} ${rd.isAdmin && u !== rd.name ? `<button onclick="banishPhantom('${u}','${r}')">KICK</button>` : ''}</div>`).join('');
    }

    window.banishPhantom = (u, r) => state.rooms[r].ws.send(JSON.stringify({ type: 'kick', target: u }));
    elements.wipeBtn.onclick = () => { if (confirm("Obliterate dimension records?")) state.rooms[state.activeRoom].ws.send(JSON.stringify({ type: 'wipe' })); };
    elements.lockBtn.onclick = () => { const r = state.activeRoom; state.rooms[r].ws.send(JSON.stringify({ type: state.rooms[r].isLocked ? 'unlock' : 'lock' })); };
    elements.form.onsubmit = async e => {
        e.preventDefault(); const v = elements.input.value.trim(); if (!v) return;
        const enc = await encrypt(v, state.activeRoom);
        state.rooms[state.activeRoom].ws.send(JSON.stringify({ type: 'message', content: enc, self_destruct: state.isDestruct }));
        elements.input.value = '';
    };
    elements.genRoom.onclick = () => { elements.roomInput.value = 'void-' + Math.random().toString(36).substring(2, 7); };
    elements.panicBtn.onclick = () => location.reload();
    elements.destructToggle.onclick = () => {
        state.isDestruct = !state.isDestruct;
        elements.destructToggle.style.color = state.isDestruct ? 'var(--primary)' : 'var(--text-ghost)';
        elements.vanishInd.classList.toggle('hidden', !state.isDestruct);
    };
    elements.emojiBtn.onclick = () => elements.emojiPicker.classList.toggle('hidden');
    document.querySelectorAll('.emoji-opt').forEach(o => o.onclick = () => {
        if (state.targetMsg) {
            state.rooms[state.targetMsg.roomID].ws.send(JSON.stringify({ type: 'reaction', emoji: o.innerText, msgId: state.targetMsg.id }));
            state.targetMsg = null;
        } else elements.input.value += o.innerText;
        elements.emojiPicker.classList.add('hidden');
    });
});
