document.addEventListener('DOMContentLoaded', () => {
    const $ = id => document.getElementById(id.replace('#', ''));
    const elements = {
        accUser: $('#acc-user'), accPass: $('#acc-pass'), loginBtn: $('#login-btn'), regBtn: $('#reg-btn'),
        roomInput: $('#room-id'), passInput: $('#room-password'), joinBtn: $('#join-btn'),
        roomList: $('#room-list'), roomHistoryDiv: $('#room-history'), logoutBtn: $('#logout-btn'),
        genRoom: $('#gen-room'), gotoChat: $('#goto-chat'),
        form: $('#message-form'), input: $('#message-input'), msgContainers: $('#message-containers'), typingArea: $('#typing-area'),
        roomLabel: $('#display-room'), userListDiv: $('#user-list'), sidebar: $('#sidebar'),
        qrModal: $('#qr-modal'), qrcodeDiv: $('#qrcode'), imgInput: $('#img-input'), closeQr: $('#close-qr'),
        voiceBtn: $('#voice-btn'), voiceOverlay: $('#voice-overlay'), voiceTimer: $('#voice-timer'), stopVoice: $('#stop-voice'), cancelVoice: $('#cancel-voice'),
        destructToggle: $('#destruct-toggle'), vanishInd: $('#vanish-indicator'), strengthBar: $('#strength-bar'),
        adminPanel: $('#admin-panel'), wipeBtn: $('#wipe-btn'), lockBtn: $('#lock-btn'), panicBtn: $('#panic-btn'),
        copyInfo: $('#copy-info'), emojiBtn: $('#emoji-btn'), emojiPicker: $('#emoji-picker'),
        addDimension: $('#add-dimension'), activeRoomsTabs: $('#active-rooms-tabs'),
        guideModal: $('#ghost-guide'), guideTitle: $('#guide-title'), guideText: $('#guide-text'), guideNext: $('#guide-next'),
        vanishDrop: $('#vanish-drop-zone'), toggleSidebar: $('#toggle-sidebar'),
        woosh: $('#woosh-sound'), avOpts: document.querySelectorAll('.av-opt')
    };

    // CONSTANTS
    const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB
    const MAX_VOICE_DURATION = 60; // seconds
    const MIN_PASSWORD_LENGTH = 8;

    let state = {
        name: localStorage.getItem('ghostName') || '', uid: localStorage.getItem('ghostUid') || null,
        avatar: localStorage.getItem('ghostAvatar') || '👻',
        rooms: {}, // { roomID: { ws, key, name, isAdmin, isLocked, users: [] } }
        activeRoom: null, isDestruct: false, guideStep: 0,
        mediaRecorder: null, audioChunks: [], voiceStartTime: 0, voiceInterval: null,
        draggedMsgId: null, targetMsg: null
    };

    const showToast = (msg) => {
        const t = document.createElement('div'); t.className = 'toast'; t.innerText = msg;
        document.body.appendChild(t); setTimeout(() => t.remove(), 4000);
    };

    // --- ONBOARDING ---
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

    // --- AVATAR SELECTION ---
    elements.avOpts.forEach(opt => {
        opt.onclick = () => {
            elements.avOpts.forEach(o => o.classList.remove('active'));
            opt.classList.add('active');
            state.avatar = opt.dataset.av;
            localStorage.setItem('ghostAvatar', state.avatar);
        };
    });

    // --- CRYPTO CORE ---
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
            if (!state.rooms[roomID]) return null;
            const dec = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, state.rooms[roomID].key, data);
            return isText ? new TextDecoder().decode(dec) : dec;
        } catch { return null; }
    }

    // --- VOICE FRAGMENTS ---
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
                // AUTO-STOP at 60 seconds
                if (sec >= MAX_VOICE_DURATION) {
                    showToast("Max duration reached");
                    elements.stopVoice.click();
                }
            }, 1000);
        } catch (e) { showToast("Microphone Blocked"); }
    };
    elements.stopVoice.onclick = () => { clearInterval(state.voiceInterval); state.mediaRecorder.stop(); elements.voiceOverlay.classList.add('hidden'); };
    elements.cancelVoice.onclick = () => { clearInterval(state.voiceInterval); state.mediaRecorder.stop(); state.audioChunks = []; elements.voiceOverlay.classList.add('hidden'); };

    // --- FILE UPLOAD ---
    elements.imgInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file || !state.activeRoom) return;

        // FILE SIZE VALIDATION
        if (file.size > MAX_FILE_SIZE) {
            showToast(`File too large. Max ${MAX_FILE_SIZE / 1024 / 1024}MB`);
            elements.imgInput.value = '';
            return;
        }

        const reader = new FileReader();
        reader.onload = async () => {
            const enc = await encrypt(new Uint8Array(reader.result), state.activeRoom, false);
            state.rooms[state.activeRoom].ws.send(JSON.stringify({
                type: file.type.startsWith('image/') ? 'image' : 'file',
                content: enc,
                self_destruct: state.isDestruct
            }));
            elements.imgInput.value = '';
            showToast("Fragment encrypted & sent");
        };
        reader.readAsArrayBuffer(file);
    };

    // --- UI ENGINE ---
    async function addMsg(roomID, user, content, destruct, id, type = 'text', subtype = '') {
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

            if (type === 'image' || type === 'file') {
                const dec = await decrypt(content, roomID, false);
                if (dec) {
                    const blob = new Blob([dec]);
                    const url = URL.createObjectURL(blob);
                    if (type === 'image') html += `<img src="${url}" class="msg-img" style="max-width:100%; border-radius:12px;">`;
                    else if (subtype === 'voice') html += `<div class="voice-frag">🔊 <audio controls src="${url}" style="height:30px;"></audio></div>`;
                    else html += `<div class="file-link">📎 <a href="${url}" download="ghost-file" style="color:var(--primary); text-decoration:none; font-weight:800;">FRAGMENT</a></div>`;
                } else html += `<div style="color:var(--danger); font-size:0.75rem; line-height:1.5;">
                    <div style="font-weight:800; margin-bottom:4px;">⚠️ DECRYPTION FAILED</div>
                    <div style="opacity:0.7;">Wrong encryption seal or corrupted data. Verify you're using the correct room password.</div>
                </div>`;
            } else {
                const dec = await decrypt(content, roomID, true);
                if (!dec) {
                    html += `<div style="color:var(--danger); font-size:0.75rem; font-style:italic;">⚠️ Message corrupted or wrong seal</div>`;
                } else {
                    html += `<div>${dec}</div>`;
                }
            }

            div.innerHTML = html + `<div class="reactions" id="react-${id}"></div>`;
        }
        area.appendChild(div); area.scrollTop = area.scrollHeight;
        if (destruct) elements.woosh.play().catch(() => { });
    }

    elements.vanishDrop.ondragover = e => e.preventDefault();
    elements.vanishDrop.ondrop = () => {
        const r = state.activeRoom;
        if (state.draggedMsgId && r) {
            state.rooms[r].ws.send(JSON.stringify({ type: 'delete_request', id: state.draggedMsgId }));
            showToast("Banished to Oblivion");
        }
    };

    // --- AUTH ---
    elements.loginBtn.onclick = async () => {
        const u = elements.accUser.value.trim(), p = elements.accPass.value.trim(); if (!u || !p) return;
        try {
            const res = await (await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) })).json();
            if (res.status === 'ok') {
                state.uid = res.user_id; state.name = u;
                localStorage.setItem('ghostUid', state.uid); localStorage.setItem('ghostName', u);
                $('#user-screen').classList.add('hidden'); $('#auth-screen').classList.remove('hidden');
                loadHistory();
            } else showToast(res.msg);
        } catch (e) { showToast("Oracle Offline"); }
    };

    elements.regBtn.onclick = async () => {
        const u = elements.accUser.value.trim(), p = elements.accPass.value.trim(); if (!u || !p) return;
        try {
            const res = await (await fetch('/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) })).json();
            if (res.status === 'ok') showToast("ID Manifested. Now Login.");
            else showToast(res.msg);
        } catch (e) { showToast("Oracle Offline"); }
    };

    async function loadHistory() {
        const hist = await (await fetch(`/api/history/${state.uid}`)).json();
        if (hist.length) {
            elements.roomHistoryDiv.classList.remove('hidden');
            elements.roomList.innerHTML = hist.map(r => `<span class="room-tag">${r}</span>`).join('');
            document.querySelectorAll('.room-tag').forEach(t => t.onclick = () => elements.roomInput.value = t.innerText);
        }
    }

    elements.logoutBtn.onclick = () => {
        localStorage.clear();
        Object.values(state.rooms).forEach(r => r.ws.close());
        location.reload();
    };

    // --- LATTICE OVERLAY ---
    const lattice = document.createElement('div');
    lattice.className = 'lattice-overlay';
    document.body.appendChild(lattice);

    const triggerLattice = (active) => {
        lattice.classList.toggle('lattice-active', active);
    };

    // --- ROOM MANAGEMENT ---
    elements.joinBtn.onclick = async () => {
        const r = elements.roomInput.value.trim(), p = elements.passInput.value.trim();
        if (!r || !p) return showToast("Keys required for entry");

        // PASSWORD VALIDATION
        if (p.length < MIN_PASSWORD_LENGTH) {
            return showToast(`Seal must be at least ${MIN_PASSWORD_LENGTH} characters`);
        }

        if (state.rooms[r]) return switchRoom(r);

        // LATTICE HANDSHAKE FLOW
        triggerLattice(true);
        elements.joinBtn.innerText = "CRYPTO-HANDSHAKING...";
        elements.joinBtn.disabled = true;

        try {
            const v = await (await fetch('/api/verify-room', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ room_id: r, password: p }) })).json();
            if (v.status === 'fail') {
                triggerLattice(false);
                elements.joinBtn.innerText = "Phase In";
                elements.joinBtn.disabled = false;
                return showToast(v.msg);
            }

            // SIMULATE QUANTUM HANDSHAKE Visual delay
            await new Promise(res => setTimeout(res, 800));

            const key = await getSecretKey(p, r);
            const displayName = `${state.avatar} ${state.name}`;
            state.rooms[r] = { name: displayName, key, isAdmin: false, users: [], adminName: '', reconnectAttempts: 0 };

            const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
            const ws = new WebSocket(`${proto}//${location.host}/ws/${r}/${encodeURIComponent(displayName)}?pwd=${encodeURIComponent(p)}`);
            state.rooms[r].ws = ws;

            ws.onerror = (err) => {
                console.error('WebSocket error:', err);
                showToast("Connection unstable");
            };

            ws.onopen = () => {
                triggerLattice(false);
                showToast("Dimension Sequenced");
                $('#auth-screen').classList.add('hidden'); $('#chat-screen').classList.remove('hidden');
                elements.gotoChat.classList.remove('hidden'); buildTab(r); switchRoom(r);
                elements.joinBtn.innerText = "Phase In";
                elements.joinBtn.disabled = false;
                updateCommunities(r);
                state.rooms[r].reconnectAttempts = 0; // Reset on successful connection
            };

            ws.onmessage = async e => {
                const d = JSON.parse(e.data);
                if (d.type === 'user_list') {
                    const rd = state.rooms[r];
                    if (!rd) return;
                    rd.isAdmin = (d.admin === rd.name); rd.users = d.users; rd.isLocked = d.is_locked; rd.adminName = d.admin;
                    updateUserList(r);
                } else if (['message', 'image', 'file'].includes(d.type)) {
                    addMsg(r, d.username, d.content, d.self_destruct, d.id, d.type, d.subtype);
                } else if (d.type === 'reaction') {
                    const ra = $(`react-${d.msgId}`); if (ra) { const s = document.createElement('span'); s.className = 'reaction-tag'; s.innerText = d.emoji; ra.appendChild(s); }
                } else if (d.type === 'system') addMsg(r, null, d.content, false, null, 'system');
                else if (d.type === 'delete_msg') { $(`msg-${d.id}`)?.remove(); }
                else if (d.type === 'wipe_all') { const area = $(`area-${r}`); if (area) area.innerHTML = ''; showToast("Dimension Wiped"); }
                else if (d.type === 'kicked' && d.target === state.rooms[r].name) { leaveDimension(r); showToast("Banished"); }
                else if (d.type === 'typing') {
                    if (state.activeRoom === r) {
                        elements.typingArea.innerText = d.status ? `${d.username} is oscillating...` : '';
                    }
                }
            };

            ws.onclose = (event) => {
                if (state.rooms[r]) {
                    // RECONNECTION LOGIC
                    if (state.rooms[r].reconnectAttempts < 3 && !event.wasClean) {
                        state.rooms[r].reconnectAttempts++;
                        showToast(`Reconnecting... (${state.rooms[r].reconnectAttempts}/3)`);
                        setTimeout(() => {
                            if (state.rooms[r]) elements.joinBtn.click(); // Retry connection
                        }, 2000 * state.rooms[r].reconnectAttempts);
                    } else {
                        leaveDimension(r);
                        if (!event.wasClean) showToast("Connection lost");
                    }
                }
            };

            fetch('/api/save-room', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: state.uid, room_id: r }) });
        } catch (e) {
            triggerLattice(false);
            showToast("Handshake Failed: " + e.message);
            elements.joinBtn.innerText = "Phase In";
            elements.joinBtn.disabled = false;
        }
    };

    async function updateCommunities(r) {
        const commList = $('#community-list');
        if (!commList) return;
        // Seed some demo communities based on room ID
        const demoComms = [`${r}-council`, `${r}-shadows`, `global-spectres`];
        commList.innerHTML = demoComms.map(c => `<div class="community-item" style="padding:10px; border-radius:12px; font-size:0.8rem; background:rgba(255,255,255,0.02); transition:0.3s;">🌀 ${c}</div>`).join('');
    }


    function buildTab(r) {
        if ($(`tab-${r}`)) return;
        const t = document.createElement('div'); t.id = `tab-${r}`; t.className = 'room-tab';
        t.innerHTML = `<span>${r}</span><button class="close-tab">×</button>`;
        t.querySelector('.close-tab').onclick = (e) => { e.stopPropagation(); leaveDimension(r); };
        t.onclick = () => switchRoom(r);
        elements.activeRoomsTabs.appendChild(t);
        const a = document.createElement('main'); a.id = `area-${r}`; a.className = 'message-area hidden';
        elements.msgContainers.appendChild(a);
    }

    function switchRoom(r) {
        state.activeRoom = r; elements.roomLabel.innerText = r;
        document.querySelectorAll('.message-area').forEach(el => el.classList.add('hidden'));
        const activeArea = $(`area-${r}`);
        if (activeArea) activeArea.classList.remove('hidden');
        document.querySelectorAll('.room-tab').forEach(el => el.classList.remove('tab-active'));
        const activeTab = $(`tab-${r}`);
        if (activeTab) activeTab.classList.add('tab-active');
        updateUserList(r);
        elements.adminPanel.classList.toggle('hidden', !state.rooms[r].isAdmin);
        elements.vanishInd.classList.toggle('hidden', !state.isDestruct);
    }

    window.leaveDimension = r => {
        if (state.rooms[r]) {
            state.rooms[r].ws.close();
            delete state.rooms[r];
        }
        $(`tab-${r}`)?.remove(); $(`area-${r}`)?.remove();
        if (state.activeRoom === r) {
            const next = Object.keys(state.rooms)[0];
            if (next) switchRoom(next);
            else { $('#chat-screen').classList.add('hidden'); $('#auth-screen').classList.remove('hidden'); elements.gotoChat.classList.add('hidden'); }
        }
    };

    function updateUserList(r) {
        if (state.activeRoom !== r || !state.rooms[r]) return;
        const rd = state.rooms[r];
        elements.userListDiv.innerHTML = rd.users.map(u => `
            <div class="user-item" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; font-size:0.9rem;">
                <span>${u} ${u === rd.adminName ? '⭐' : ''}</span>
                ${rd.isAdmin && u !== rd.name ? `<button onclick="banishPhantom('${u}','${r}')" style="background:none; border:none; color:var(--danger); cursor:pointer; font-weight:800; font-size:0.7rem;">KICK</button>` : ''}
            </div>
        `).join('');
    }

    window.banishPhantom = (u, r) => state.rooms[r].ws.send(JSON.stringify({ type: 'kick', target: u }));
    elements.wipeBtn.onclick = () => { if (confirm("Obliterate dimension records?")) state.rooms[state.activeRoom].ws.send(JSON.stringify({ type: 'wipe' })); };
    elements.lockBtn.onclick = () => { const r = state.activeRoom; state.rooms[r].ws.send(JSON.stringify({ type: state.rooms[r].isLocked ? 'unlock' : 'lock' })); };
    elements.addDimension.onclick = () => { $('#chat-screen').classList.add('hidden'); $('#auth-screen').classList.remove('hidden'); };
    elements.gotoChat.onclick = () => { $('#auth-screen').classList.add('hidden'); $('#chat-screen').classList.remove('hidden'); };
    elements.toggleSidebar.onclick = () => elements.sidebar.classList.toggle('hidden');
    elements.panicBtn.onclick = () => location.reload();

    // --- FORM ---
    elements.form.onsubmit = async e => {
        e.preventDefault(); const v = elements.input.value.trim(); if (!v || !state.activeRoom) return;
        const enc = await encrypt(v, state.activeRoom);
        state.rooms[state.activeRoom].ws.send(JSON.stringify({ type: 'message', content: enc, self_destruct: state.isDestruct }));
        elements.input.value = '';
    };

    elements.input.oninput = () => {
        if (state.activeRoom) state.rooms[state.activeRoom].ws.send(JSON.stringify({ type: 'typing', status: elements.input.value.length > 0 }));
    };

    // --- UTILS ---
    elements.genRoom.onclick = () => { elements.roomInput.value = 'void-' + Math.random().toString(36).substring(2, 7); };
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

    elements.copyInfo.onclick = () => {
        const info = `Dimension: ${state.activeRoom}\nSeal: [HIDDEN]`;
        navigator.clipboard.writeText(info); showToast("Bridge Meta Copied");
    };

    elements.showQR.onclick = () => {
        elements.qrcodeDiv.innerHTML = '';
        new QRCode(elements.qrcodeDiv, { text: `ghostchat://join?room=${state.activeRoom}`, width: 200, height: 200 });
        elements.qrModal.classList.remove('hidden');
    };
    elements.closeQr.onclick = () => elements.qrModal.classList.add('hidden');

    elements.passInput.oninput = () => {
        const v = elements.passInput.value;
        let score = 0; if (v.length > 6) score++; if (/[A-Z]/.test(v)) score++; if (/[0-9]/.test(v)) score++; if (/[^A-Za-z0-9]/.test(v)) score++;
        const colors = ['#ff4757', '#ffa502', '#2ed573', '#00d2ff'];
        elements.strengthBar.style.width = (score * 25) + '%';
        elements.strengthBar.style.background = colors[score - 1] || '#ff4757';
    };

    // Auto-login if session exists
    if (state.uid && state.name) {
        $('#user-screen').classList.add('hidden');
        $('#auth-screen').classList.remove('hidden');
        loadHistory();
    }
});

