/**
 * SecureChat v2.5 - The Void Engine
 * Pure Minimalist, High-Security Messaging
 */
document.addEventListener('DOMContentLoaded', () => {
    const $ = id => document.getElementById(id);
    const $$ = selector => document.querySelectorAll(selector);

    // --- SECURITY: Core Cryptography & Sanitization ---
    const sanitizeHTML = (str) => {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    };

    const validateInput = (v, max = 1000) => {
        if (!v || typeof v !== 'string') return '';
        return v.trim().substring(0, max);
    };

    const validatePassword = (password) => {
        const errors = [];
        if (password.length < 12) errors.push("Password must be at least 12 characters");
        if (!/[A-Z]/.test(password)) errors.push("Must contain uppercase letter");
        if (!/[a-z]/.test(password)) errors.push("Must contain lowercase letter");
        if (!/[0-9]/.test(password)) errors.push("Must contain number");
        if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) errors.push("Must contain special character");
        return errors;
    };

    // --- STATE ENGINE ---
    const state = {
        currentUser: localStorage.getItem('sc_username') || null,
        userId: null,
        rooms: {},
        activeRoom: null,
        theme: localStorage.getItem('sc_theme') || 'dark', // Default to Dark/The Void
        isOnline: navigator.onLine,
        replyingTo: null,
        editingMessage: null,
        ws: null,
        pingInterval: null
    };

    // --- UI HUB: Mapping Selectors to New Void Shell ---
    const elements = {
        // Entry Components
        loginViewport: $('login-screen'),
        loginForm: $('login-form'),
        registerForm: $('register-form'),
        loginUsername: $('login-username'),
        loginPassword: $('login-password'),
        loginBtn: $('login-btn'),
        registerUsername: $('register-username'),
        registerPassword: $('register-password'),
        registerBtn: $('register-btn'),
        showRegister: $('show-register'),
        showLogin: $('show-login'),
        showRecover: $('show-recover'),

        // Shell Components
        appShell: $('chat-screen'),
        chatList: $('chat-list'),
        searchInput: $('search-input'),
        newChatBtn: $('new-chat-btn'),
        newChatBtnEmpty: $('new-chat-btn-empty'),
        themeToggle: $('theme-toggle'),
        settingsBtn: $('settings-btn'),
        globalAvatar: $('global-user-avatar'),

        // Canvas Components
        emptyState: $('empty-state'),
        activeChatContainer: $('active-chat-container'),
        messagesContainer: $('messages-container'),
        messageInput: $('message-input'),
        sendBtn: $('send-btn'),
        attachBtn: $('attach-btn'),
        fileInput: $('file-input'),
        backBtn: $('back-btn'),
        chatName: $('chat-name'),
        chatStatus: $('chat-status'),
        chatAvatar: $('chat-avatar'),

        // Overlay System
        systemOverlay: $('system-overlay'),
        newChatModal: $('new-chat-modal'),
        settingsModal: $('settings-modal'),
        recoveryModal: $('recovery-modal'),
        recoveryKeyDisplay: $('recovery-key-display'),
        recoveryKeyText: $('recovery-key-text'),
        copyRecoveryKey: $('copy-recovery-key'),
        closeRecovery: $('close-recovery'),
        recoveryForm: $('recovery-form'),
        recoverUsername: $('recover-username'),
        recoverKey: $('recover-key'),
        recoverPassword: $('recover-password'),
        recoverBtn: $('recover-btn'),
        cancelRecover: $('cancel-recover'),

        // HUD Extras
        replyOverlay: $('reply-preview'),
        replyPreviewText: $('reply-preview-text'),
        replyToUser: $('reply-to-user'),
        cancelReply: $('cancel-reply'),
        typingPill: $('typing-indicator'),
        typingUser: $('typing-user'),
        roomIdInput: $('room-id-input'),
        roomPasswordInput: $('room-password-input'),
        joinRoomBtn: $('join-room-btn'),
        generateRoomId: $('generate-room-id'),
        offlineIndicator: $('offline-indicator'),
        logoutBtn: $('logout-btn'),
        exportDataBtn: $('export-data-btn'),
        deleteAccountBtn: $('delete-account-btn'),
        modalThemeToggle: $('modal-theme-toggle')
    };

    // --- MODAL CONTROLLER ---
    const showOverlay = (modalId) => {
        elements.systemOverlay.classList.remove('hidden');
        [elements.newChatModal, elements.settingsModal, elements.recoveryModal].forEach(m => m.classList.add('hidden'));
        $(modalId).classList.remove('hidden');
    };

    const hideOverlay = () => {
        elements.systemOverlay.classList.add('hidden');
    };

    $$('.close-modal').forEach(btn => btn.addEventListener('click', hideOverlay));

    // --- UTILITIES ---
    const showToast = (msg) => {
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = msg;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
    };

    const applyTheme = () => {
        document.documentElement.setAttribute('data-theme', state.theme);
        localStorage.setItem('sc_theme', state.theme);
    };
    applyTheme();

    const updateOnlineStatus = () => {
        state.isOnline = navigator.onLine;
        elements.offlineIndicator.classList.toggle('hidden', state.isOnline);
    };
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    updateOnlineStatus();

    // --- CRYPTO ENGINE: AES-GCM ---
    const deriveKey = async (password, salt) => {
        const encoder = new TextEncoder();
        const baseKey = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveKey"]);
        return await crypto.subtle.deriveKey(
            { name: "PBKDF2", salt: encoder.encode(salt), iterations: 100000, hash: "SHA-256" },
            baseKey, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
        );
    };

    const encryptMessage = async (text, password, roomId) => {
        const key = await deriveKey(password, roomId);
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encodedText = new TextEncoder().encode(text);
        const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encodedText);
        return {
            iv: btoa(String.fromCharCode(...iv)),
            data: btoa(String.fromCharCode(...new Uint8Array(ciphertext)))
        };
    };

    const decryptMessage = async (encrypted, password, roomId) => {
        try {
            const key = await deriveKey(password, roomId);
            const iv = new Uint8Array(atob(encrypted.iv).split("").map(c => c.charCodeAt(0)));
            const data = new Uint8Array(atob(encrypted.data).split("").map(c => c.charCodeAt(0)));
            const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
            return new TextDecoder().decode(decrypted);
        } catch (e) {
            return "[ENCRYPTION ERROR: SEAL MISMATCH]";
        }
    };

    // --- AUTHENTICATION FLOW ---
    const handleAuthResponse = (data) => {
        if (data.status === 'ok') {
            state.currentUser = elements.loginUsername.value || elements.registerUsername.value;
            localStorage.setItem('sc_username', state.currentUser);
            showApp();
        } else {
            showToast(data.msg || "Authentication failed");
        }
    };

    elements.loginBtn.addEventListener('click', async () => {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: elements.loginUsername.value, password: elements.loginPassword.value })
        });
        handleAuthResponse(await res.json());
    });

    elements.registerBtn.addEventListener('click', async () => {
        const p = elements.registerPassword.value;
        const errors = validatePassword(p);
        if (errors.length > 0) return showToast(errors[0]);

        const res = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: elements.registerUsername.value, password: p })
        });
        const data = await res.json();
        if (data.status === 'ok') {
            elements.recoveryKeyText.textContent = data.recovery_key;
            showOverlay('recovery-modal');
            elements.recoveryKeyDisplay.classList.remove('hidden');
            elements.recoveryForm.classList.add('hidden');
        } else {
            showToast(data.msg);
        }
    });

    // --- NAVIGATION LOGIC ---
    const showApp = () => {
        elements.loginViewport.classList.add('hidden');
        elements.appShell.classList.remove('hidden');
        elements.globalAvatar.textContent = state.currentUser ? state.currentUser[0].toUpperCase() : '?';
        connectWS();
    };

    const disconnect = () => {
        localStorage.removeItem('sc_username');
        location.reload();
    };

    elements.logoutBtn.addEventListener('click', disconnect);
    elements.showRegister.addEventListener('click', () => {
        elements.loginForm.classList.add('hidden');
        elements.registerForm.classList.remove('hidden');
    });
    elements.showLogin.addEventListener('click', () => {
        elements.registerForm.classList.add('hidden');
        elements.loginForm.classList.remove('hidden');
    });

    // --- MODAL ACTIONS ---
    elements.newChatBtn.addEventListener('click', () => showOverlay('new-chat-modal'));
    elements.newChatBtnEmpty.addEventListener('click', () => showOverlay('new-chat-modal'));
    elements.settingsBtn.addEventListener('click', () => showOverlay('settings-modal'));
    elements.generateRoomId.addEventListener('click', () => {
        elements.roomIdInput.value = 'room-' + Math.random().toString(36).substring(2, 9);
    });

    elements.joinRoomBtn.addEventListener('click', () => {
        const rid = elements.roomIdInput.value;
        const pwd = elements.roomPasswordInput.value;
        if (rid && pwd) {
            state.rooms[rid] = { password: pwd, messages: [], users: [] };
            hideOverlay();
            switchRoom(rid);
            updateSidebar();
        } else {
            showToast("Room ID and Password required");
        }
    });

    // --- WEBSOCKET & MESSAGING ---
    const connectWS = () => {
        const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        state.ws = new WebSocket(`${protocol}//${location.host}/ws`);

        state.ws.onmessage = async (e) => {
            const data = JSON.parse(e.data);
            if (data.type === 'message') {
                const room = state.rooms[data.room];
                if (room) {
                    const decrypted = await decryptMessage(data.content, room.password, data.room);
                    const msg = { sender: data.sender, content: decrypted, timestamp: new Date(), id: data.id };
                    room.messages.push(msg);
                    if (state.activeRoom === data.room) renderMessage(msg);
                }
            }
        };

        state.pingInterval = setInterval(() => {
            if (state.ws.readyState === WebSocket.OPEN) state.ws.send(JSON.stringify({ type: 'ping' }));
        }, 30000);
    };

    const switchRoom = (rid) => {
        state.activeRoom = rid;
        elements.emptyState.classList.add('hidden');
        elements.activeChatContainer.classList.remove('hidden');
        elements.chatName.textContent = rid;
        elements.chatAvatar.textContent = rid[0].toUpperCase();
        elements.messagesContainer.innerHTML = '';
        state.rooms[rid].messages.forEach(renderMessage);

        // Mobile behavior
        if (window.innerWidth < 600) {
            document.querySelector('.app-sidebar').classList.add('hidden');
        }
    };

    const renderMessage = (msg) => {
        const div = document.createElement('div');
        const isOwn = msg.sender === state.currentUser;
        div.className = `message ${isOwn ? 'message-out' : 'message-in'}`;

        // Sensory Finish: Only animate new entries
        div.style.animation = 'luxuriousRollIn 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards';

        let html = '';
        if (!isOwn) html += `<div class="message-sender" style="color:var(--p-accent); font-weight:700; font-size:11px; margin-bottom:4px; letter-spacing:1px; text-transform:uppercase;">${sanitizeHTML(msg.sender)}</div>`;
        html += `<div class="message-content">${sanitizeHTML(msg.content)}</div>`;
        html += `<div class="message-meta" style="margin-top:6px; opacity:0.3; font-size:10px; font-weight:600; display:flex; justify-content:flex-end; gap:8px;">
            <span class="message-time">${msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
            ${isOwn ? '<span style="font-family:var(--font-mono); letter-spacing:1px;">SECURED</span>' : ''}
        </div>`;

        div.innerHTML = html;
        elements.messagesContainer.appendChild(div);

        // Cinematic Scroll
        setTimeout(() => {
            elements.messagesContainer.scrollTo({
                top: elements.messagesContainer.scrollHeight,
                behavior: 'smooth'
            });
        }, 50);
    };

    const updateSidebar = () => {
        elements.chatList.innerHTML = '';
        Object.keys(state.rooms).forEach(rid => {
            const item = document.createElement('div');
            item.className = `chat-item ${state.activeRoom === rid ? 'active' : ''}`;
            const room = state.rooms[rid];
            const lastMsg = room.messages.length > 0 ? room.messages[room.messages.length - 1].content : 'No messages yet';

            item.innerHTML = `
                <div class="avatar">${rid[0].toUpperCase()}</div>
                <div class="chat-item-info">
                    <div class="chat-item-header">
                        <span class="chat-item-name">${sanitizeHTML(rid)}</span>
                        <span class="chat-item-time">Now</span>
                    </div>
                    <div class="chat-item-preview">${sanitizeHTML(lastMsg)}</div>
                </div>
            `;
            item.addEventListener('click', () => switchRoom(rid));
            elements.chatList.appendChild(item);
        });
    };

    elements.sendBtn.addEventListener('click', async () => {
        const text = elements.messageInput.value;
        if (!text || !state.activeRoom) return;

        const room = state.rooms[state.activeRoom];
        const encrypted = await encryptMessage(text, room.password, state.activeRoom);

        state.ws.send(JSON.stringify({
            type: 'message',
            room: state.activeRoom,
            sender: state.currentUser,
            content: encrypted
        }));

        elements.messageInput.value = '';
    });

    elements.messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            elements.sendBtn.click();
        }
    });

    // Theme Toggle
    elements.themeToggle.addEventListener('click', () => {
        state.theme = state.theme === 'dark' ? 'light' : 'dark';
        applyTheme();
    });

    // Back button for mobile
    elements.backBtn.addEventListener('click', () => {
        document.querySelector('.app-sidebar').classList.remove('hidden');
    });

    // Start in proper viewport
    if (state.currentUser) showApp();
});
