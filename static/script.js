/**
 * SecureChat v4.0 - High-Fidelity Zero-Knowledge Platform
 * Features: Dual Real-Time Engine, Web Crypto AES-256-GCM, Web Audio Synthesizer,
 * Markdown & Code Formatting, Drag & Drop, Clipboard Paste, Floating Actions, Themes & Mobile Drawer.
 */
document.addEventListener('DOMContentLoaded', () => {
    const $ = id => document.getElementById(id);
    const $$ = selector => document.querySelectorAll(selector);

    // --- SECURITY & MARKDOWN FORMATTER ---
    const sanitizeHTML = (str) => {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = String(str);
        return div.innerHTML;
    };

    const formatMarkdown = (text) => {
        if (!text) return '';
        let escaped = sanitizeHTML(text);

        // Code blocks: ```code```
        escaped = escaped.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');

        // Inline code: `code`
        escaped = escaped.replace(/`([^`]+)`/g, '<code>$1</code>');

        // Bold: **text**
        escaped = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

        // Italic: *text*
        escaped = escaped.replace(/\*([^*]+)\*/g, '<em>$1</em>');

        // Clickable Links: https://... or http://...
        escaped = escaped.replace(
            /(https?:\/\/[^\s<]+)/g,
            '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
        );

        return escaped;
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
        }, 3200);
    };

    // --- WEB AUDIO SYNTHESIZER ---
    let audioCtx = null;
    const initAudio = () => {
        if (!audioCtx) {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (AudioContextClass) audioCtx = new AudioContextClass();
        }
        if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
    };

    const playSound = (type = 'send') => {
        if (localStorage.getItem('sc_sound_muted') === 'true') return;
        try {
            initAudio();
            if (!audioCtx) return;

            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);

            const now = audioCtx.currentTime;
            if (type === 'send') {
                osc.type = 'sine';
                osc.frequency.setValueAtTime(440, now);
                osc.frequency.exponentialRampToValueAtTime(880, now + 0.1);
                gain.gain.setValueAtTime(0.12, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
                osc.start(now);
                osc.stop(now + 0.1);
            } else if (type === 'receive') {
                osc.type = 'sine';
                osc.frequency.setValueAtTime(523.25, now); // C5
                osc.frequency.setValueAtTime(659.25, now + 0.08); // E5
                gain.gain.setValueAtTime(0.15, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
                osc.start(now);
                osc.stop(now + 0.22);
            }
        } catch (e) {}
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
        connMode: 'sync',
        theme: localStorage.getItem('sc_theme') || 'dark',
        reactions: JSON.parse(localStorage.getItem('sc_reactions') || '{}') // msgId -> { emoji: count }
    };

    // Apply saved theme
    if (state.theme && state.theme !== 'dark') {
        document.documentElement.setAttribute('data-theme', state.theme);
    }

    // --- ELEMENTS ---
    const elements = {
        loginScreen: $('login-screen'),
        appShell: $('chat-screen'),
        appSidebar: $('app-sidebar'),
        sidebarBackdrop: $('sidebar-backdrop'),
        mobileBackToChannels: $('mobile-back-to-channels'),
        mobileToggleEmpty: $('mobile-toggle-btn-empty'),
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
        copyRoomPill: $('copy-room-pill'),
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
        soundToggleBtn: $('sound-toggle-btn'),
        logoutBtn: $('logout-btn'),
        deleteAccountBtn: $('delete-account-btn'),
        exportDataBtn: $('export-data-btn'),
        attachBtn: $('attach-btn'),
        fileInput: $('file-input'),
        dropzoneOverlay: $('dropzone-overlay'),
        emojiPickerBtn: $('emoji-picker-btn'),
        emojiPopover: $('emoji-popover'),

        roomIdInput: $('room-id-input'),
        roomPasswordInput: $('room-password-input'),
        generateRoomId: $('generate-room-id'),
        joinRoomBtn: $('join-room-btn'),
        raiNewChatBtn: $('rai-new-chat-btn'),
        sidebarNewChatBtn: $('sidebar-new-chat-btn'),
        emptyStateNewChatBtn: $('new-chat-btn-empty')
    };

    // Update sound toggle button label
    const updateSoundBtn = () => {
        if (!elements.soundToggleBtn) return;
        const isMuted = localStorage.getItem('sc_sound_muted') === 'true';
        elements.soundToggleBtn.textContent = isMuted ? '🔇' : '🔊';
        elements.soundToggleBtn.title = isMuted ? 'Sound Muted (Click to Unmute)' : 'Sound Active (Click to Mute)';
    };
    updateSoundBtn();

    if (elements.soundToggleBtn) {
        elements.soundToggleBtn.addEventListener('click', () => {
            const isMuted = localStorage.getItem('sc_sound_muted') === 'true';
            localStorage.setItem('sc_sound_muted', String(!isMuted));
            updateSoundBtn();
            if (isMuted) playSound('send');
        });
    }

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
        if (elements.emojiPopover) elements.emojiPopover.classList.add('hidden');
    };

    $$('.close-modal').forEach(b => b.addEventListener('click', hideModal));
    if (elements.closeSettings) elements.closeSettings.addEventListener('click', hideModal);

    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') hideModal();
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            if (elements.channelSearch) elements.channelSearch.focus();
        }
    });

    // --- MOBILE DRAWER HANDLERS ---
    const openSidebarDrawer = () => {
        if (elements.appSidebar) elements.appSidebar.classList.add('drawer-open');
        if (elements.sidebarBackdrop) elements.sidebarBackdrop.classList.remove('hidden');
    };

    const closeSidebarDrawer = () => {
        if (elements.appSidebar) elements.appSidebar.classList.remove('drawer-open');
        if (elements.sidebarBackdrop) elements.sidebarBackdrop.classList.add('hidden');
    };

    if (elements.mobileBackToChannels) elements.mobileBackToChannels.addEventListener('click', openSidebarDrawer);
    if (elements.mobileToggleEmpty) elements.mobileToggleEmpty.addEventListener('click', openSidebarDrawer);
    if (elements.sidebarBackdrop) elements.sidebarBackdrop.addEventListener('click', closeSidebarDrawer);

    // --- THEME SELECTOR ---
    $$('.theme-choice-btn').forEach(btn => {
        const themeName = btn.getAttribute('data-theme');
        if (themeName === state.theme) btn.classList.add('active');
        btn.addEventListener('click', () => {
            $$('.theme-choice-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.theme = themeName;
            localStorage.setItem('sc_theme', themeName);
            if (themeName === 'dark') {
                document.documentElement.removeAttribute('data-theme');
            } else {
                document.documentElement.setAttribute('data-theme', themeName);
            }
            showToast(`Theme updated to ${btn.textContent}`, "info");
        });
    });

    // --- CRYPTO ENGINE (PBKDF2 + AES-GCM 256) ---
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
            return "[Decryption Error: Key Mismatch]";
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
    const renderWelcomeBanner = (rid) => {
        if (!elements.msgContainer) return;
        const banner = document.createElement('div');
        banner.className = 'channel-welcome-banner';
        banner.id = 'welcome-banner';
        banner.innerHTML = `
            <div class="channel-welcome-icon">#</div>
            <h2>Welcome to #${sanitizeHTML(rid)}!</h2>
            <p>This is the start of the <strong>#${sanitizeHTML(rid)}</strong> channel. All messages, images, and files transmitted here are client-side encrypted using <strong>AES-256-GCM</strong> with 100,000 rounds of PBKDF2. Only peers holding your room encryption password can read transmissions.</p>
        `;
        elements.msgContainer.appendChild(banner);
    };

    const renderMessage = (msg) => {
        if (!elements.msgContainer) return;
        const existing = $(`msg-${msg.id}`);
        if (existing) return;

        // Remove welcome banner if present and message is first
        const banner = $('welcome-banner');
        if (banner) banner.remove();

        const m = document.createElement('div');
        m.className = 'message';
        m.id = `msg-${msg.id}`;

        const sender = msg.sender || msg.username || 'Anonymous';
        const isSelf = sender.toLowerCase() === (state.currentUser || '').toLowerCase();
        const avatarColor = stringToColor(sender);
        const timeObj = msg.timestamp ? new Date(msg.timestamp) : new Date();
        const timeStr = timeObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        let contentHTML = '';
        if (msg.type === 'image' && msg.content && String(msg.content).startsWith('data:image')) {
            contentHTML = `<img src="${msg.content}" style="max-width:340px; max-height:260px; border-radius:8px; margin-top:6px; box-shadow:0 4px 12px rgba(0,0,0,0.3);" alt="Encrypted Attachment">`;
        } else {
            contentHTML = `<div class="msg-content">${formatMarkdown(msg.content)}</div>`;
        }

        let replyHTML = '';
        if (msg.reply_to) {
            replyHTML = `
                <div class="reply-badge" style="font-size:11px; color:var(--text-muted); margin-bottom:4px; display:flex; align-items:center; gap:6px;">
                    <span>↩️ Replying to <strong>${sanitizeHTML(msg.reply_to.sender || 'someone')}</strong>:</span>
                    <span style="font-style:italic;">${sanitizeHTML(msg.reply_to.text || '')}</span>
                </div>
            `;
        }

        m.innerHTML = `
            <div class="msg-avatar" style="background-color: ${avatarColor}">${sender[0].toUpperCase()}</div>
            <div class="msg-body">
                ${replyHTML}
                <div class="msg-header">
                    <span class="msg-author" style="${isSelf ? 'color:var(--discord-blurple); font-weight:700;' : ''}">${sanitizeHTML(sender)}</span>
                    <span class="msg-time">${timeStr}</span>
                </div>
                ${contentHTML}
                <div class="reactions-tray" id="reactions-${msg.id}"></div>
            </div>
            <div class="msg-actions">
                <button class="action-icon-btn react-quick-btn" data-emoji="❤️" title="React with Heart">❤️</button>
                <button class="action-icon-btn react-quick-btn" data-emoji="👍" title="React with Thumbs Up">👍</button>
                <button class="action-icon-btn react-quick-btn" data-emoji="🔥" title="React with Fire">🔥</button>
                <button class="action-icon-btn reply-btn" title="Reply to message">↩️</button>
                <button class="action-icon-btn copy-btn" title="Copy text">📋</button>
            </div>
        `;

        // Action Buttons Listeners
        const replyBtn = m.querySelector('.reply-btn');
        if (replyBtn) {
            replyBtn.addEventListener('click', () => setupReply(sender, msg.content));
        }

        const copyBtn = m.querySelector('.copy-btn');
        if (copyBtn) {
            copyBtn.addEventListener('click', async () => {
                try {
                    await navigator.clipboard.writeText(msg.content);
                    showToast("Message copied to clipboard", "info");
                } catch (e) {}
            });
        }

        m.querySelectorAll('.react-quick-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const emoji = btn.getAttribute('data-emoji');
                addReaction(msg.id, emoji);
            });
        });

        elements.msgContainer.appendChild(m);
        elements.msgContainer.scrollTop = elements.msgContainer.scrollHeight;
    };

    const addReaction = (msgId, emoji) => {
        if (!state.reactions[msgId]) state.reactions[msgId] = {};
        state.reactions[msgId][emoji] = (state.reactions[msgId][emoji] || 0) + 1;
        try {
            localStorage.setItem('sc_reactions', JSON.stringify(state.reactions));
        } catch (e) {}
        renderReactions(msgId);
    };

    const renderReactions = (msgId) => {
        const tray = $(`reactions-${msgId}`);
        if (!tray || !state.reactions[msgId]) return;
        tray.innerHTML = '';
        Object.entries(state.reactions[msgId]).forEach(([emoji, count]) => {
            const pill = document.createElement('span');
            pill.className = 'reaction-pill';
            pill.innerHTML = `<span>${emoji}</span> <span>${count}</span>`;
            pill.addEventListener('click', () => addReaction(msgId, emoji));
            tray.appendChild(pill);
        });
    };

    const setupReply = (sender, text) => {
        state.replyingTo = { sender, text: String(text).substring(0, 60) };
        elements.replyToUser.textContent = sender;
        elements.replyPreviewText.textContent = String(text).substring(0, 60);
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
            elements.chatList.innerHTML = `<div style="padding:16px 12px; font-size:13px; color:var(--text-muted); text-align:center;">No channels yet.<br>Click <strong>+</strong> to start!</div>`;
            return;
        }

        const filter = (elements.channelSearch ? elements.channelSearch.value : '').toLowerCase().trim();

        roomIds.forEach(rid => {
            if (filter && !rid.toLowerCase().includes(filter)) return;
            const item = document.createElement('div');
            item.className = `chat-item ${state.activeRoom === rid ? 'active' : ''}`;
            item.innerHTML = `<span class="hash">#</span><span class="channel-name" style="flex:1; overflow:hidden; text-overflow:ellipsis;">${sanitizeHTML(rid)}</span>`;
            item.addEventListener('click', () => {
                switchRoom(rid);
                closeSidebarDrawer();
            });
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

    // --- REALTIME ENGINE ---
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
        try {
            const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
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
                                    await handleIncomingMessage(rid, data, true);
                                } else if (data.type === 'user_list') {
                                    updateMemberList(data.users || []);
                                }
                            } catch (err) {}
                        };

                        socket.onerror = () => startServerlessPolling(rid);
                        socket.onclose = () => {
                            if (state.activeRoom === rid) startServerlessPolling(rid);
                        };
                    } else {
                        startServerlessPolling(rid);
                    }
                })
                .catch(() => startServerlessPolling(rid));
        } catch (e) {
            startServerlessPolling(rid);
        }

        // Run immediate fetch
        fetchRoomMessages(rid);
    };

    const startServerlessPolling = (rid) => {
        if (state.pollTimer) return;
        state.connMode = 'sync';
        if (elements.connBadge) {
            elements.connBadge.textContent = 'LIVE SYNC';
            elements.connBadge.className = 'network-badge poll';
        }
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
                        await handleIncomingMessage(rid, m, false);
                    }
                }
            }
        } catch (e) {}
    };

    const handleIncomingMessage = async (rid, rawMsg, isLive = false) => {
        if (!state.rooms[rid]) return;
        
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

        if (rawMsg.timestamp && (!state.lastMessageTime || rawMsg.timestamp > state.lastMessageTime)) {
            state.lastMessageTime = rawMsg.timestamp;
        }

        const exists = state.rooms[rid].messages.some(m => m.id === msgObj.id);
        if (!exists) {
            state.rooms[rid].messages.push(msgObj);
            try {
                localStorage.setItem('sc_rooms', JSON.stringify(state.rooms));
            } catch (e) {}
            // Play chime sound on message from another user
            if (msgObj.sender !== state.currentUser) {
                playSound('receive');
            }
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

        if (state.rooms[rid] && state.rooms[rid].messages && state.rooms[rid].messages.length > 0) {
            state.rooms[rid].messages.forEach(renderMessage);
        } else {
            renderWelcomeBanner(rid);
        }

        updateSidebar();
        startRealtime(rid);
        elements.messageInput.focus();
    };

    // --- COPY ROOM ID ---
    if (elements.copyRoomPill) {
        elements.copyRoomPill.addEventListener('click', async () => {
            if (!state.activeRoom) return;
            try {
                await navigator.clipboard.writeText(state.activeRoom);
                showToast(`Copied room name "#${state.activeRoom}" to clipboard!`, "success");
            } catch (e) {
                showToast(`Room: ${state.activeRoom}`, "info");
            }
        });
    }

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
        elements.messageInput.style.height = 'auto';
        state.replyingTo = null;
        if (elements.replyOverlay) elements.replyOverlay.classList.add('hidden');

        playSound('send');

        try {
            const encrypted = await encryptMessage(text, pwd, rid);
            
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
            }).catch(() => {});

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

    // Auto-grow textarea
    elements.messageInput.addEventListener('input', () => {
        elements.messageInput.style.height = 'auto';
        elements.messageInput.style.height = Math.min(elements.messageInput.scrollHeight, 160) + 'px';
    });

    elements.messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    if (elements.sendMsgBtn) {
        elements.sendMsgBtn.addEventListener('click', sendMessage);
    }

    // --- EMOJI POPOVER ---
    if (elements.emojiPickerBtn && elements.emojiPopover) {
        elements.emojiPickerBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            elements.emojiPopover.classList.toggle('hidden');
        });

        elements.emojiPopover.querySelectorAll('.emoji-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                elements.messageInput.value += btn.textContent;
                elements.messageInput.focus();
                elements.emojiPopover.classList.add('hidden');
            });
        });

        document.addEventListener('click', (e) => {
            if (!elements.emojiPopover.contains(e.target) && e.target !== elements.emojiPickerBtn) {
                elements.emojiPopover.classList.add('hidden');
            }
        });
    }

    // --- FILE & ATTACHMENT HANDLING ---
    const transmitFile = (file) => {
        if (!file || !state.activeRoom) return;

        if (file.size > 2.5 * 1024 * 1024) {
            showToast("File exceeds 2.5MB limit for encrypted transit", "error");
            return;
        }

        const reader = new FileReader();
        reader.onload = async () => {
            const base64Data = reader.result;
            const rid = state.activeRoom;
            const pwd = state.rooms[rid].password;
            const msgId = `file-${Date.now()}`;
            const ts = new Date().toISOString();
            const isImage = file.type.startsWith('image/');

            playSound('send');

            try {
                const encrypted = await encryptMessage(base64Data, pwd, rid);
                const localMsg = {
                    id: msgId,
                    sender: state.currentUser,
                    content: base64Data,
                    type: isImage ? 'image' : 'file',
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
                        type: isImage ? 'image' : 'file',
                        timestamp: ts
                    })
                });
                showToast(`Encrypted ${file.name} sent!`, "success");
            } catch (err) {
                showToast("Failed to encrypt attachment", "error");
            }
        };
        reader.readAsDataURL(file);
    };

    if (elements.attachBtn && elements.fileInput) {
        elements.attachBtn.addEventListener('click', () => elements.fileInput.click());
        elements.fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) transmitFile(file);
            elements.fileInput.value = '';
        });
    }

    // --- DRAG & DROP SUPPORT ---
    const appCanvas = $('app-canvas');
    if (appCanvas && elements.dropzoneOverlay) {
        ['dragenter', 'dragover'].forEach(eventName => {
            appCanvas.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (state.activeRoom) elements.dropzoneOverlay.classList.remove('hidden');
            });
        });

        ['dragleave', 'drop'].forEach(eventName => {
            elements.dropzoneOverlay.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                elements.dropzoneOverlay.classList.add('hidden');
                if (eventName === 'drop' && e.dataTransfer && e.dataTransfer.files.length > 0) {
                    transmitFile(e.dataTransfer.files[0]);
                }
            });
        });
    }

    // --- CLIPBOARD PASTE IMAGE SUPPORT ---
    document.addEventListener('paste', (e) => {
        if (!state.activeRoom) return;
        const items = (e.clipboardData || e.originalEvent.clipboardData).items;
        for (const item of items) {
            if (item.type.indexOf('image') !== -1) {
                const file = item.getAsFile();
                if (file) {
                    e.preventDefault();
                    transmitFile(file);
                    showToast("Pasted screenshot attached and encrypting...", "info");
                }
            }
        }
    });

    // --- ROOM CREATION & JOINING ---
    if (elements.generateRoomId) {
        elements.generateRoomId.addEventListener('click', () => {
            const adjectives = ['shadow', 'crypto', 'silent', 'phantom', 'cosmic', 'nebula', 'quantum', 'aurora', 'hyper', 'nexus'];
            const nouns = ['citadel', 'sanctum', 'matrix', 'dimension', 'portal', 'hub', 'vault', 'haven', 'station', 'node'];
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

        if (state.userId) {
            fetch('/api/save-room', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: state.userId, room_id: rid })
            }).catch(() => {});
        }

        hideModal();
        switchRoom(rid);
        closeSidebarDrawer();
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
                elements.recoveryKeyDisplay.textContent = data.recovery_key;
                showModal('recovery-key-modal');

                $('login-username').value = username;
                $('login-password').value = password;

                elements.copyRecoveryKeyBtn.onclick = async () => {
                    try {
                        await navigator.clipboard.writeText(data.recovery_key);
                        showToast("Recovery key copied to clipboard!", "success");
                    } catch (e) {}
                    hideModal();
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

    // Form Switchers
    elements.showRegister.addEventListener('click', () => {
        setAuthError('');
        elements.loginForm.classList.add('hidden');
        elements.recoverForm.classList.add('hidden');
        elements.registerForm.classList.remove('hidden');
        elements.authTitle.textContent = "Create an account";
        elements.authSubtitle.textContent = "Begin your zero-knowledge encrypted journey";
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

    // Settings
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
                setTimeout(() => location.reload(), 800);
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
