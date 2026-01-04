/**
 * SecureChat v3.5 - The Ultra-Replica Engine
 * Replicating Discord at any cost
 */
document.addEventListener('DOMContentLoaded', () => {
    const $ = id => document.getElementById(id);
    const $$ = selector => document.querySelectorAll(selector);

    // --- SECURITY & UTILS ---
    const sanitizeHTML = (str) => {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    };

    // --- STATE ENGINE ---
    const state = {
        currentUser: localStorage.getItem('sc_username') || null,
        rooms: JSON.parse(localStorage.getItem('sc_rooms') || '{}'),
        activeRoom: null,
        isOnline: navigator.onLine,
        ws: null,
        memberListVisible: true
    };

    // --- ELEMENTS ---
    const elements = {
        loginScreen: $('login-screen'),
        appShell: $('chat-screen'),
        loginBtn: $('login-btn'),
        registerBtn: $('register-btn'),
        chatList: $('chat-list'),
        msgContainer: $('messages-container'),
        messageInput: $('message-input'),
        chatName: $('chat-name'),
        userTag: $('current-user-tag'),
        globalAvatar: $('global-user-avatar'),
        systemOverlay: $('system-overlay'),
        newChatModal: $('new-chat-modal'),
        settingsModal: $('settings-modal'),
        activeChat: $('active-chat-container'),
        emptyState: $('empty-state'),
        typingPill: $('typing-indicator'),
        replyOverlay: $('reply-preview'),
        memberSidebar: $('member-sidebar'),
        memberList: $('member-list'),
        memberListToggle: $('member-list-toggle'),
        closeSettings: $('close-settings'),
        settingsUsername: $('settings-username-display')
    };

    // --- MODAL & SETTINGS SYSTEM ---
    const showModal = (id) => {
        elements.systemOverlay.classList.remove('hidden');
        $$('.system-modal, .settings-view').forEach(m => m.classList.add('hidden'));
        $(id).classList.remove('hidden');
    };
    const hideModal = () => elements.systemOverlay.classList.add('hidden');

    $$('.close-modal').forEach(b => b.addEventListener('click', hideModal));
    elements.closeSettings.addEventListener('click', hideModal);

    // Handle ESC key for settings
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') hideModal();
    });

    // --- CRYPTO ENGINE ---
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
        const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(text));
        return { iv: btoa(String.fromCharCode(...iv)), data: btoa(String.fromCharCode(...new Uint8Array(ciphertext))) };
    };

    const decryptMessage = async (enc, password, roomId) => {
        try {
            const key = await deriveKey(password, roomId);
            const iv = new Uint8Array(atob(enc.iv).split("").map(c => c.charCodeAt(0)));
            const data = new Uint8Array(atob(enc.data).split("").map(c => c.charCodeAt(0)));
            const dec = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
            return new TextDecoder().decode(dec);
        } catch (e) { return "[ENCRYPTION ERROR]"; }
    };

    // --- DISCORD STYLE RENDERING ---
    const renderMessage = (msg) => {
        const m = document.createElement('div');
        m.className = 'message';

        const avatarColor = stringToColor(msg.sender);
        const timeStr = msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        m.innerHTML = `
            <div class="msg-avatar" style="background-color: ${avatarColor}">${msg.sender[0].toUpperCase()}</div>
            <div class="msg-header">
                <span class="msg-author">${sanitizeHTML(msg.sender)}</span>
                <span class="msg-time">${timeStr}</span>
            </div>
            <div class="msg-content">${sanitizeHTML(msg.content)}</div>
        `;

        elements.msgContainer.appendChild(m);
        elements.msgContainer.scrollTop = elements.msgContainer.scrollHeight;
    };

    const stringToColor = (str) => {
        let hash = 0;
        for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
        return `hsl(${hash % 360}, 45%, 50%)`;
    };

    const updateSidebar = () => {
        elements.chatList.innerHTML = '';
        Object.keys(state.rooms).forEach(rid => {
            const item = document.createElement('div');
            item.className = `chat-item ${state.activeRoom === rid ? 'active' : ''}`;
            item.innerHTML = `<span class="hash">#</span><span class="channel-name">${sanitizeHTML(rid)}</span>`;
            item.addEventListener('click', () => switchRoom(rid));
            elements.chatList.appendChild(item);
        });
    };

    const switchRoom = (rid) => {
        state.activeRoom = rid;
        elements.emptyState.classList.add('hidden');
        elements.activeChat.classList.remove('hidden');
        elements.chatName.textContent = rid;
        elements.messageInput.placeholder = `Message #${rid}`;
        elements.msgContainer.innerHTML = '';
        state.rooms[rid].messages.forEach(renderMessage);
        updateSidebar();
        updateMemberList();
    };

    const updateMemberList = () => {
        elements.memberList.innerHTML = '';
        // In local state, we only know ourselves for now
        const me = document.createElement('div');
        me.className = 'member-item';
        me.innerHTML = `
            <div class="avatar" style="background-color: ${stringToColor(state.currentUser)}">${state.currentUser[0].toUpperCase()}</div>
            <div class="member-name">${state.currentUser}</div>
        `;
        elements.memberList.appendChild(me);
    };

    // --- WEBSOCKET ---
    const connectWS = () => {
        const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        state.ws = new WebSocket(`${protocol}//${location.host}/ws`);
        state.ws.onmessage = async (e) => {
            const data = JSON.parse(e.data);
            if (data.type === 'message' && state.rooms[data.room]) {
                const dec = await decryptMessage(data.content, state.rooms[data.room].password, data.room);
                const msg = { sender: data.sender, content: dec, timestamp: new Date() };
                state.rooms[data.room].messages.push(msg);
                if (state.activeRoom === data.room) renderMessage(msg);
            }
        };
    };

    // --- AUTH ACTIONS ---
    const showApp = () => {
        elements.loginScreen.classList.add('hidden');
        elements.appShell.classList.remove('hidden');
        elements.userTag.textContent = state.currentUser;
        elements.settingsUsername.textContent = state.currentUser;
        elements.globalAvatar.textContent = state.currentUser[0].toUpperCase();
        elements.globalAvatar.style.backgroundColor = stringToColor(state.currentUser);
        connectWS();
        updateSidebar();
    };

    elements.loginBtn.addEventListener('click', async () => {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: $('login-username').value, password: $('login-password').value })
        });
        const data = await res.json();
        if (data.status === 'ok') {
            state.currentUser = $('login-username').value;
            localStorage.setItem('sc_username', state.currentUser);
            showApp();
        }
    });

    elements.registerBtn.addEventListener('click', async () => {
        const res = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: $('register-username').value, password: $('register-password').value })
        });
        const data = await res.json();
        if (data.status === 'ok') {
            state.currentUser = $('register-username').value;
            localStorage.setItem('sc_username', state.currentUser);
            showApp();
        }
    });

    // --- ROOM ACTIONS ---
    $('join-room-btn').addEventListener('click', () => {
        const rid = $('room-id-input').value;
        const pwd = $('room-password-input').value;
        if (rid && pwd) {
            state.rooms[rid] = { password: pwd, messages: [] };
            localStorage.setItem('sc_rooms', JSON.stringify(state.rooms));
            switchRoom(rid);
            hideModal();
        }
    });

    // Switch between Login/Register
    $('show-register').addEventListener('click', () => {
        $('login-form').classList.add('hidden');
        $('register-form').classList.remove('hidden');
    });
    $('show-login').addEventListener('click', () => {
        $('register-form').classList.add('hidden');
        $('login-form').classList.remove('hidden');
    });

    $('sidebar-new-chat-btn').addEventListener('click', () => showModal('new-chat-modal'));
    $('rai-new-chat-btn').addEventListener('click', () => showModal('new-chat-modal'));
    elements.settingsBtn.addEventListener('click', () => showModal('settings-modal'));

    // Toggle Member List
    elements.memberListToggle.addEventListener('click', () => {
        state.memberListVisible = !state.memberListVisible;
        elements.memberSidebar.classList.toggle('hidden', !state.memberListVisible);
    });

    // --- MESSAGE SENDING ---
    elements.messageInput.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            const text = elements.messageInput.value.trim();
            if (text && state.activeRoom) {
                const enc = await encryptMessage(text, state.rooms[state.activeRoom].password, state.activeRoom);
                state.ws.send(JSON.stringify({ type: 'message', room: state.activeRoom, sender: state.currentUser, content: enc }));
                elements.messageInput.value = '';
            }
        }
    });

    if (state.currentUser) showApp();
});
