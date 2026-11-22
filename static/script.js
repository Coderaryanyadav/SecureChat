/**
 * SecureChat v3.5 - The Definitive End-to-End Encrypted Platform
 * Featuring Dual Real-Time Engine (WebSockets + Serverless Sync)
 */
document.addEventListener('DOMContentLoaded', () => {
    const $ = id => document.getElementById(id);
    const $$ = selector => document.querySelectorAll(selector);

    // --- SECURITY & UTILS ---
    const sanitizeHTML = (str) => {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = String(str);
        return div.innerHTML;
    };

    // --- TOAST NOTIFICATIONS ---
    const showToast = (message, type = 'info') => {
        const container = $('toast-container');
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        const icons = { info: 'ℹ️', success: '✅', error: '⚠️' };
        toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${sanitizeHTML(message)}</span>`;
        container.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(-10px)';
            toast.style.transition = 'all 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    };

    // --- STATE ENGINE ---
    const state = {
        currentUser: localStorage.getItem('sc_username') || null,
        userId: localStorage.getItem('sc_uid') || null,
        rooms: JSON.parse(localStorage.getItem('sc_rooms') || '{}'),
        activeRoom: null,
        ws: null,
        pollTimer: null,
        lastMessageTime: null,
        activeMembers: [],
        memberListVisible: true,
        replyingTo: null,
        connMode: 'sync' // 'ws' or 'sync'
    };

    // --- ELEMENTS ---
    const elements = {
        loginScreen: $('login-screen'),
        appShell: $('chat-screen'),
        authError: $('auth-error'),
        authTitle: $('auth-title'),
        authSubtitle: $('auth-subtitle'),
        loginForm: $('login-form'),
        registerForm: $('register-form'),
        recoverForm: $('recover-form'),
        loginBtn: $('login-btn'),
        registerBtn: $('register-btn'),
        recoverBtn: $('recover-btn'),
        showRegister: $('show-register'),
        showLogin: $('show-login'),
        showRecover: $('show-recover'),
        showLoginFromRecover: $('show-login-from-recover'),

        chatList: $('chat-list'),
        channelSearch: $('channel-search-input'),
        msgContainer: $('messages-container'),
        messageInput: $('message-input'),
        sendMsgBtn: $('send-msg-btn'),
        chatName: $('chat-name'),
        connBadge: $('conn-mode-badge'),
        userTag: $('current-user-tag'),
        globalAvatar: $('global-user-avatar'),
        systemOverlay: $('system-overlay'),
        newChatModal: $('new-chat-modal'),
        recoveryKeyModal: $('recovery-key-modal'),
        recoveryKeyDisplay: $('recovery-key-display'),
        copyRecoveryKeyBtn: $('copy-recovery-key-btn'),
        settingsModal: $('settings-modal'),
        activeChat: $('active-chat-container'),
        emptyState: $('empty-state'),
        typingPill: $('typing-indicator'),
        replyOverlay: $('reply-preview'),
        replyToUser: $('reply-to-user'),
        replyPreviewText: $('reply-preview-text'),
        cancelReply: $('cancel-reply'),
        memberSidebar: $('member-sidebar'),
        memberList: $('member-list'),
        memberCountLabel: $('member-count-label'),
        memberListToggle: $('member-list-toggle'),
        closeSettings: $('close-settings'),
        settingsUsername: $('settings-username-display'),
        settingsAvatar: $('settings-avatar-display'),
        settingsBtn: $('settings-btn'),
        logoutBtn: $('logout-btn'),
        deleteAccountBtn: $('delete-account-btn'),
        exportDataBtn: $('export-data-btn'),
        attachBtn: $('attach-btn'),
        fileInput: $('file-input'),

        roomIdInput: $('room-id-input'),
        roomPasswordInput: $('room-password-input'),
        generateRoomId: $('generate-room-id'),
        joinRoomBtn: $('join-room-btn'),
        raiNewChatBtn: $('rai-new-chat-btn'),
        sidebarNewChatBtn: $('sidebar-new-chat-btn'),
        emptyStateNewChatBtn: $('new-chat-btn-empty')
    };

    // --- MODAL CONTROLLER ---
    const showModal = (id) => {
        elements.systemOverlay.classList.remove('hidden');
        $$('.system-modal, .settings-view').forEach(m => m.classList.add('hidden'));
        const target = $(id);
        if (target) target.classList.remove('hidden');
    };

    const hideModal = () => {
        elements.systemOverlay.classList.add('hidden');
        $$('.system-modal, .settings-view').forEach(m => m.classList.add('hidden'));
    };

    $$('.close-modal').forEach(b => b.addEventListener('click', hideModal));
    if (elements.closeSettings) elements.closeSettings.addEventListener('click', hideModal);

    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') hideModal();
    });

    // --- CRYPTO ENGINE (Web Cryptography API: AES-GCM 256 + PBKDF2) ---
    const deriveKey = async (password, salt) => {
        const encoder = new TextEncoder();
        const baseKey = await crypto.subtle.importKey(
            "raw",
            encoder.encode(password),
            "PBKDF2",
            false,
            ["deriveKey"]
        );
        return await crypto.subtle.deriveKey(
            {
                name: "PBKDF2",
                salt: encoder.encode(salt),
                iterations: 100000,
                hash: "SHA-256"
            },
            baseKey,
            { name: "AES-GCM", length: 256 },
            false,
            ["encrypt", "decrypt"]
        );
    };

    const encryptMessage = async (text, password, roomId) => {
        try {
            const key = await deriveKey(password, roomId);
            const iv = crypto.getRandomValues(new Uint8Array(12));
            const ciphertext = await crypto.subtle.encrypt(
                { name: "AES-GCM", iv },
                key,
                new TextEncoder().encode(text)
            );
            return {
                iv: btoa(String.fromCharCode(...iv)),
                data: btoa(String.fromCharCode(...new Uint8Array(ciphertext)))
            };
        } catch (e) {
            console.error("Encryption error:", e);
            throw e;
        }
    };

    const decryptMessage = async (enc, password, roomId) => {
        try {
            if (!enc || typeof enc !== 'object' || !enc.iv || !enc.data) {
                return typeof enc === 'string' ? enc : "[Invalid Message]";
            }
            const key = await deriveKey(password, roomId);
            const iv = new Uint8Array(atob(enc.iv).split("").map(c => c.charCodeAt(0)));
            const data = new Uint8Array(atob(enc.data).split("").map(c => c.charCodeAt(0)));
            const dec = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
            return new TextDecoder().decode(dec);
        } catch (e) {
            return "[Decryption Failed - Check Room Password]";
        }
    };

    // --- AVATAR COLOR GENERATOR ---
    const stringToColor = (str) => {
        if (!str) return 'hsl(220, 45%, 50%)';
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        return `hsl(${Math.abs(hash) % 360}, 55%, 45%)`;
    };

    // --- UI RENDERING ---
    const renderMessage = (msg) => {
        if (!elements.msgContainer) return;
        const existing = $(`msg-${msg.id}`);
        if (existing) return; // Prevent duplicate render

        const m = document.createElement('div');
        m.className = 'message';
        m.id = `msg-${msg.id}`;

        const sender = msg.sender || msg.username || 'Anonymous';
        const isSelf = sender.toLowerCase() === (state.currentUser || '').toLowerCase();
        const avatarColor = stringToColor(sender);
        const timeObj = msg.timestamp ? new Date(msg.timestamp) : new Date();
        const timeStr = timeObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        let contentHTML = '';
        if (msg.type === 'image' && msg.content && msg.content.startsWith('data:image')) {
            contentHTML = `<img src="${msg.content}" style="max-width:320px; max-height:240px; border-radius:6px; margin-top:4px;" alt="Encrypted Attachment">`;
        } else {
            contentHTML = `<div class="msg-content">${sanitizeHTML(msg.content)}</div>`;
        }

        let replyHTML = '';
        if (msg.reply_to) {
            replyHTML = `
                <div class="reply-badge" style="font-size:11px; color:var(--text-muted); margin-bottom:4px; display:flex; align-items:center; gap:4px;">
                    <span>↩️ Replying to <strong>${sanitizeHTML(msg.reply_to.sender || 'someone')}</strong>:</span>
                    <span style="font-style:italic;">${sanitizeHTML(msg.reply_to.text || '')}</span>
                </div>
            `;
        }

        m.innerHTML = `
            <div class="msg-avatar" style="background-color: ${avatarColor}">${sender[0].toUpperCase()}</div>
            <div class="msg-body" style="flex:1;">
                ${replyHTML}
                <div class="msg-header">
                    <span class="msg-author" style="${isSelf ? 'color:var(--discord-blurple); font-weight:700;' : ''}">${sanitizeHTML(sender)}</span>
                    <span class="msg-time">${timeStr}</span>
                </div>
                ${contentHTML}
            </div>
        `;

        // Context menu / click to reply
        m.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            setupReply(sender, msg.content);
        });

        elements.msgContainer.appendChild(m);
        elements.msgContainer.scrollTop = elements.msgContainer.scrollHeight;
    };

    const setupReply = (sender, text) => {
        state.replyingTo = { sender, text: text.substring(0, 60) };
        elements.replyToUser.textContent = sender;
        elements.replyPreviewText.textContent = text.substring(0, 60);
        elements.replyOverlay.classList.remove('hidden');
        elements.messageInput.focus();
    };

    if (elements.cancelReply) {
        elements.cancelReply.addEventListener('click', () => {
            state.replyingTo = null;
            elements.replyOverlay.classList.add('hidden');
        });
    }

    const updateSidebar = () => {
        if (!elements.chatList) return;
        elements.chatList.innerHTML = '';
        const roomIds = Object.keys(state.rooms);
        if (roomIds.length === 0) {
            elements.chatList.innerHTML = `<div style="padding:12px; font-size:12px; color:var(--text-muted);">No rooms yet. Click + to join one!</div>`;
            return;
        }

        const filter = (elements.channelSearch ? elements.channelSearch.value : '').toLowerCase().trim();

        roomIds.forEach(rid => {
            if (filter && !rid.toLowerCase().includes(filter)) return;
            const item = document.createElement('div');
            item.className = `chat-item ${state.activeRoom === rid ? 'active' : ''}`;
            item.innerHTML = `<span class="hash">#</span><span class="channel-name">${sanitizeHTML(rid)}</span>`;
            item.addEventListener('click', () => switchRoom(rid));
            elements.chatList.appendChild(item);
        });
    };

    if (elements.channelSearch) {
        elements.channelSearch.addEventListener('input', updateSidebar);
    }

    const updateMemberList = (members = []) => {
        if (!elements.memberList) return;
        elements.memberList.innerHTML = '';
        const unique = Array.from(new Set([state.currentUser, ...members].filter(Boolean)));
        if (elements.memberCountLabel) {
            elements.memberCountLabel.textContent = `ONLINE — ${unique.length}`;
        }

        unique.forEach(u => {
            const item = document.createElement('div');
            item.className = 'member-item';
            item.innerHTML = `
                <div class="avatar" style="background-color: ${stringToColor(u)}">${u[0].toUpperCase()}</div>
                <div class="member-name">${sanitizeHTML(u)}</div>
            `;
            elements.memberList.appendChild(item);
        });
    };

    // --- REALTIME ENGINE: DUAL MODE (WEBSOCKET + SERVERLESS SYNC) ---
    const stopRealtime = () => {
        if (state.pollTimer) {
            clearInterval(state.pollTimer);
            state.pollTimer = null;
        }
        if (state.ws) {
            try { state.ws.close(); } catch (e) {}
            state.ws = null;
        }
    };

    const startRealtime = (rid) => {
        stopRealtime();
        state.lastMessageTime = null;

        // Mode 1: Attempt WebSocket connection
        let wsSupported = false;
        try {
            const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
            // First fetch handshake token
            fetch(`/api/ws-token?user=${encodeURIComponent(state.currentUser)}`)
                .then(r => r.ok ? r.json() : null)
                .then(tokenData => {
                    if (tokenData && tokenData.token) {
                        const wsUrl = `${protocol}//${location.host}/ws/${encodeURIComponent(rid)}/${encodeURIComponent(state.currentUser)}?pwd=${encodeURIComponent(state.rooms[rid].password)}&token=${encodeURIComponent(tokenData.token)}`;
                        const socket = new WebSocket(wsUrl);
                        
                        socket.onopen = () => {
                            state.ws = socket;
                            state.connMode = 'ws';
                            if (elements.connBadge) {
                                elements.connBadge.textContent = 'WEBSOCKET';
                                elements.connBadge.className = 'network-badge';
                            }
                        };

                        socket.onmessage = async (e) => {
                            try {
                                const data = JSON.parse(e.data);
                                if (data.type === 'message' || data.type === 'image' || data.type === 'file') {
                                    await handleIncomingMessage(rid, data);
                                } else if (data.type === 'user_list') {
                                    updateMemberList(data.users || []);
                                }
                            } catch (err) {
                                console.error("WS parse error:", err);
                            }
                        };

                        socket.onerror = () => {
                            // Fall back to serverless sync
                            startServerlessPolling(rid);
                        };

                        socket.onclose = () => {
                            if (state.activeRoom === rid) {
                                startServerlessPolling(rid);
                            }
                        };
                    } else {
                        startServerlessPolling(rid);
                    }
                })
                .catch(() => startServerlessPolling(rid));
        } catch (e) {
            startServerlessPolling(rid);
        }

        // Always run immediate HTTP fetch to hydrate room history
        fetchRoomMessages(rid);
    };

    const startServerlessPolling = (rid) => {
        if (state.pollTimer) return;
        state.connMode = 'sync';
        if (elements.connBadge) {
            elements.connBadge.textContent = 'LIVE SYNC';
            elements.connBadge.className = 'network-badge poll';
        }
        // Poll every 1.5 seconds for fresh messages and active members
        state.pollTimer = setInterval(() => {
            if (state.activeRoom === rid) {
                fetchRoomMessages(rid);
            }
        }, 1500);
    };

    const fetchRoomMessages = async (rid) => {
        try {
            const sinceParam = state.lastMessageTime ? `&since=${encodeURIComponent(state.lastMessageTime)}` : '';
            const res = await fetch(`/api/rooms/${encodeURIComponent(rid)}/messages?user=${encodeURIComponent(state.currentUser)}${sinceParam}`);
            if (!res.ok) return;
            const data = await res.json();
            if (data.status === 'ok') {
                if (data.members) updateMemberList(data.members);
                if (data.messages && data.messages.length > 0) {
                    for (const m of data.messages) {
                        await handleIncomingMessage(rid, m);
                    }
                }
            }
        } catch (e) {
            // Offline or network error
        }
    };

    const handleIncomingMessage = async (rid, rawMsg) => {
        if (!state.rooms[rid]) return;
        
        // Decrypt if encrypted object
        let textContent = rawMsg.content;
        if (rawMsg.content && typeof rawMsg.content === 'object' && rawMsg.content.iv) {
            textContent = await decryptMessage(rawMsg.content, state.rooms[rid].password, rid);
        }

        const msgObj = {
            id: rawMsg.id || `msg-${Date.now()}-${Math.random()}`,
            sender: rawMsg.sender || rawMsg.username || 'Anonymous',
            content: textContent,
            type: rawMsg.type || 'message',
            timestamp: rawMsg.timestamp ? new Date(rawMsg.timestamp) : new Date(),
            reply_to: rawMsg.reply_to || null
        };

        // Update latest message timestamp
        if (rawMsg.timestamp) {
            if (!state.lastMessageTime || rawMsg.timestamp > state.lastMessageTime) {
                state.lastMessageTime = rawMsg.timestamp;
            }
        }

        // Avoid duplicate in room state
        const exists = state.rooms[rid].messages.some(m => m.id === msgObj.id);
        if (!exists) {
            state.rooms[rid].messages.push(msgObj);
            try {
                localStorage.setItem('sc_rooms', JSON.stringify(state.rooms));
            } catch (e) {}
        }

        if (state.activeRoom === rid) {
            renderMessage(msgObj);
        }
    };

    // --- SWITCH ROOM ---
    const switchRoom = (rid) => {
        state.activeRoom = rid;
        elements.emptyState.classList.add('hidden');
        elements.activeChat.classList.remove('hidden');
        elements.chatName.textContent = rid;
        elements.messageInput.placeholder = `Message #${rid}`;
        elements.msgContainer.innerHTML = '';

        // Render cached messages
        if (state.rooms[rid] && state.rooms[rid].messages) {
            state.rooms[rid].messages.forEach(renderMessage);
        }

        updateSidebar();
        startRealtime(rid);
    };

    // --- SEND MESSAGE ---
    const sendMessage = async () => {
        const text = elements.messageInput.value.trim();
        if (!text || !state.activeRoom) return;

        const rid = state.activeRoom;
        const pwd = state.rooms[rid].password;
        const sender = state.currentUser;
        const msgId = `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        const ts = new Date().toISOString();
        const reply = state.replyingTo;

        elements.messageInput.value = '';
        state.replyingTo = null;
        if (elements.replyOverlay) elements.replyOverlay.classList.add('hidden');

        try {
            const encrypted = await encryptMessage(text, pwd, rid);
            
            // Render locally immediately
            const localMsg = {
                id: msgId,
                sender: sender,
                content: text,
                type: 'message',
                timestamp: new Date(ts),
                reply_to: reply
            };
            state.rooms[rid].messages.push(localMsg);
            renderMessage(localMsg);

            // Send via HTTP Sync
            fetch(`/api/rooms/${encodeURIComponent(rid)}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: msgId,
                    sender: sender,
                    content: encrypted,
                    type: 'message',
                    timestamp: ts,
                    reply_to: reply
                })
            }).catch(e => console.error("HTTP send error:", e));

            // Also broadcast over WebSocket if open
            if (state.ws && state.ws.readyState === WebSocket.OPEN) {
                state.ws.send(JSON.stringify({
                    id: msgId,
                    type: 'message',
                    room: rid,
                    sender: sender,
                    content: encrypted,
                    timestamp: ts,
                    reply_to: reply
                }));
            }
        } catch (err) {
            showToast("Failed to encrypt message", "error");
        }
    };

    elements.messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    if (elements.sendMsgBtn) {
        elements.sendMsgBtn.addEventListener('click', sendMessage);
    }

    // --- ATTACHMENTS (Images / Files) ---
    if (elements.attachBtn && elements.fileInput) {
        elements.attachBtn.addEventListener('click', () => elements.fileInput.click());
        elements.fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file || !state.activeRoom) return;

            if (file.size > 2 * 1024 * 1024) {
                showToast("File exceeds 2MB limit for encrypted transit", "error");
                return;
            }

            const reader = new FileReader();
            reader.onload = async () => {
                const base64Data = reader.result;
                const rid = state.activeRoom;
                const pwd = state.rooms[rid].password;
                const msgId = `file-${Date.now()}`;
                const ts = new Date().toISOString();

                try {
                    const encrypted = await encryptMessage(base64Data, pwd, rid);
                    const localMsg = {
                        id: msgId,
                        sender: state.currentUser,
                        content: base64Data,
                        type: 'image',
                        timestamp: new Date(ts)
                    };
                    state.rooms[rid].messages.push(localMsg);
                    renderMessage(localMsg);

                    await fetch(`/api/rooms/${encodeURIComponent(rid)}/messages`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            id: msgId,
                            sender: state.currentUser,
                            content: encrypted,
                            type: 'image',
                            timestamp: ts
                        })
                    });
                    showToast("Encrypted image transmitted", "success");
                } catch (err) {
                    showToast("Failed to encrypt attachment", "error");
                }
            };
            reader.readAsDataURL(file);
            elements.fileInput.value = '';
        });
    }

    // --- ROOM CREATION & JOINING ---
    if (elements.generateRoomId) {
        elements.generateRoomId.addEventListener('click', () => {
            const adjectives = ['shadow', 'crypto', 'silent', 'phantom', 'cosmic', 'nebula', 'quantum', 'aurora'];
            const nouns = ['citadel', 'sanctum', 'matrix', 'dimension', 'portal', 'hub', 'vault', 'haven'];
            const num = Math.floor(10 + Math.random() * 90);
            const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
            const noun = nouns[Math.floor(Math.random() * nouns.length)];
            elements.roomIdInput.value = `${adj}-${noun}-${num}`;
        });
    }

    const openRoomModal = () => {
        elements.roomIdInput.value = '';
        elements.roomPasswordInput.value = '';
        showModal('new-chat-modal');
    };

    if (elements.sidebarNewChatBtn) elements.sidebarNewChatBtn.addEventListener('click', openRoomModal);
    if (elements.raiNewChatBtn) elements.raiNewChatBtn.addEventListener('click', openRoomModal);
    if (elements.emptyStateNewChatBtn) elements.emptyStateNewChatBtn.addEventListener('click', openRoomModal);

    elements.joinRoomBtn.addEventListener('click', async () => {
        const rid = (elements.roomIdInput.value || '').trim().toLowerCase();
        const pwd = (elements.roomPasswordInput.value || '').trim();

        if (!rid || !pwd) {
            showToast("Room name and encryption password are required", "error");
            return;
        }

        if (pwd.length < 8) {
            showToast("Password must be at least 8 characters", "error");
            return;
        }

        if (!state.rooms[rid]) {
            state.rooms[rid] = { password: pwd, messages: [] };
        } else {
            state.rooms[rid].password = pwd;
        }

        try {
            localStorage.setItem('sc_rooms', JSON.stringify(state.rooms));
        } catch (e) {}

        // Persist room to account history on server
        if (state.userId) {
            fetch('/api/save-room', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: state.userId, room_id: rid })
            }).catch(() => {});
        }

        hideModal();
        switchRoom(rid);
        showToast(`Connected to #${rid}`, "success");
    });

    // --- AUTHENTICATION ---
    const showApp = async () => {
        elements.loginScreen.classList.add('hidden');
        elements.appShell.classList.remove('hidden');
        elements.userTag.textContent = state.currentUser;
        if (elements.settingsUsername) elements.settingsUsername.textContent = state.currentUser;
        if (elements.globalAvatar) {
            elements.globalAvatar.textContent = state.currentUser[0].toUpperCase();
            elements.globalAvatar.style.backgroundColor = stringToColor(state.currentUser);
        }
        if (elements.settingsAvatar) {
            elements.settingsAvatar.textContent = state.currentUser[0].toUpperCase();
            elements.settingsAvatar.style.backgroundColor = stringToColor(state.currentUser);
        }

        // Load room history from server
        if (state.userId) {
            try {
                const res = await fetch(`/api/history/${state.userId}`);
                if (res.ok) {
                    const serverRooms = await res.json();
                    serverRooms.forEach(r => {
                        if (!state.rooms[r]) {
                            state.rooms[r] = { password: '', messages: [] };
                        }
                    });
                }
            } catch (e) {}
        }

        updateSidebar();
        const roomIds = Object.keys(state.rooms);
        if (roomIds.length > 0 && !state.activeRoom) {
            switchRoom(roomIds[0]);
        }
    };

    const setAuthError = (msg) => {
        if (!elements.authError) return;
        if (!msg) {
            elements.authError.classList.add('hidden');
            elements.authError.textContent = '';
        } else {
            elements.authError.classList.remove('hidden');
            elements.authError.textContent = msg;
        }
    };

    // Login Form Submit
    elements.loginBtn.addEventListener('click', async () => {
        setAuthError('');
        const username = ($('login-username').value || '').trim();
        const password = $('login-password').value || '';

        if (!username || !password) {
            setAuthError("Please enter your username and password");
            return;
        }

        try {
            elements.loginBtn.disabled = true;
            elements.loginBtn.textContent = 'Verifying...';

            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();

            if (res.ok && data.status === 'ok') {
                state.currentUser = data.username;
                state.userId = data.user_id;
                localStorage.setItem('sc_username', state.currentUser);
                localStorage.setItem('sc_uid', String(state.userId));
                showToast(`Welcome back, ${state.currentUser}!`, "success");
                showApp();
            } else {
                setAuthError(data.msg || "Invalid credentials");
                showToast(data.msg || "Login failed", "error");
            }
        } catch (err) {
            setAuthError("Network error. Please try again.");
        } finally {
            elements.loginBtn.disabled = false;
            elements.loginBtn.textContent = 'Log In';
        }
    });

    // Register Form Submit
    elements.registerBtn.addEventListener('click', async () => {
        setAuthError('');
        const username = ($('register-username').value || '').trim();
        const password = $('register-password').value || '';

        if (!username || !password) {
            setAuthError("Username and password are required");
            return;
        }

        if (password.length < 8) {
            setAuthError("Password must be at least 8 characters long");
            return;
        }

        try {
            elements.registerBtn.disabled = true;
            elements.registerBtn.textContent = 'Creating Account...';

            const res = await fetch('/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();

            if (res.ok && data.status === 'ok') {
                // Show Recovery Key Modal
                elements.recoveryKeyDisplay.textContent = data.recovery_key;
                showModal('recovery-key-modal');

                // Pre-fill login credentials for seamless continuation
                $('login-username').value = username;
                $('login-password').value = password;

                elements.copyRecoveryKeyBtn.onclick = async () => {
                    try {
                        await navigator.clipboard.writeText(data.recovery_key);
                        showToast("Recovery key copied to clipboard!", "success");
                    } catch (e) {}
                    hideModal();
                    // Automatically log in
                    elements.loginBtn.click();
                };
            } else {
                setAuthError(data.msg || "Registration failed");
                showToast(data.msg || "Registration failed", "error");
            }
        } catch (err) {
            setAuthError("Network error. Please try again.");
        } finally {
            elements.registerBtn.disabled = false;
            elements.registerBtn.textContent = 'Create Account';
        }
    });

    // Account Recovery Submit
    elements.recoverBtn.addEventListener('click', async () => {
        setAuthError('');
        const username = ($('recover-username').value || '').trim();
        const recovery_key = ($('recover-key').value || '').trim();
        const new_password = $('recover-new-password').value || '';

        if (!username || !recovery_key || !new_password) {
            setAuthError("All recovery fields are required");
            return;
        }

        try {
            elements.recoverBtn.disabled = true;
            elements.recoverBtn.textContent = 'Resetting...';

            const res = await fetch('/api/recover', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, recovery_key, new_password })
            });
            const data = await res.json();

            if (res.ok && data.status === 'ok') {
                showToast("Password reset successful! Please log in.", "success");
                elements.recoverForm.classList.add('hidden');
                elements.loginForm.classList.remove('hidden');
                $('login-username').value = username;
            } else {
                setAuthError(data.msg || "Recovery failed");
            }
        } catch (err) {
            setAuthError("Network error. Please try again.");
        } finally {
            elements.recoverBtn.disabled = false;
            elements.recoverBtn.textContent = 'Reset Password';
        }
    });

    // Switch between forms
    elements.showRegister.addEventListener('click', () => {
        setAuthError('');
        elements.loginForm.classList.add('hidden');
        elements.recoverForm.classList.add('hidden');
        elements.registerForm.classList.remove('hidden');
        elements.authTitle.textContent = "Create an account";
        elements.authSubtitle.textContent = "Begin your secure, encrypted journey";
    });

    elements.showLogin.addEventListener('click', () => {
        setAuthError('');
        elements.registerForm.classList.add('hidden');
        elements.recoverForm.classList.add('hidden');
        elements.loginForm.classList.remove('hidden');
        elements.authTitle.textContent = "Welcome back!";
        elements.authSubtitle.textContent = "We're so excited to see you again!";
    });

    elements.showRecover.addEventListener('click', (e) => {
        e.preventDefault();
        setAuthError('');
        elements.loginForm.classList.add('hidden');
        elements.registerForm.classList.add('hidden');
        elements.recoverForm.classList.remove('hidden');
        elements.authTitle.textContent = "Account Recovery";
        elements.authSubtitle.textContent = "Restore access with your 32-character recovery key";
    });

    elements.showLoginFromRecover.addEventListener('click', () => {
        setAuthError('');
        elements.recoverForm.classList.add('hidden');
        elements.loginForm.classList.remove('hidden');
        elements.authTitle.textContent = "Welcome back!";
        elements.authSubtitle.textContent = "We're so excited to see you again!";
    });

    // Settings actions
    elements.settingsBtn.addEventListener('click', () => showModal('settings-modal'));

    elements.logoutBtn.addEventListener('click', async () => {
        try { await fetch('/api/logout', { method: 'POST' }); } catch (e) {}
        localStorage.removeItem('sc_username');
        localStorage.removeItem('sc_uid');
        location.reload();
    });

    elements.deleteAccountBtn.addEventListener('click', async () => {
        if (!confirm("Are you ABSOLUTELY sure you want to permanently delete your account? This action cannot be undone.")) return;
        try {
            const res = await fetch('/api/delete-account', { method: 'POST' });
            if (res.ok) {
                localStorage.clear();
                showToast("Account deleted successfully", "info");
                setTimeout(() => location.reload(), 1000);
            }
        } catch (e) {
            showToast("Failed to delete account", "error");
        }
    });

    elements.exportDataBtn.addEventListener('click', async () => {
        try {
            const res = await fetch('/api/export');
            if (res.ok) {
                const data = await res.json();
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `securechat-export-${state.currentUser}-${Date.now()}.json`;
                a.click();
                URL.revokeObjectURL(url);
                showToast("Data exported successfully", "success");
            }
        } catch (e) {
            showToast("Failed to export data", "error");
        }
    });

    // Member list toggle
    elements.memberListToggle.addEventListener('click', () => {
        state.memberListVisible = !state.memberListVisible;
        elements.memberSidebar.classList.toggle('hidden', !state.memberListVisible);
    });

    // Auto-login if session exists
    if (state.currentUser) {
        showApp();
    }
});
