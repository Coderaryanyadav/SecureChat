// SecureChat v2.0 - Cleaned up, professional implementation
document.addEventListener('DOMContentLoaded', () => {
    const $ = id => document.getElementById(id);

    // ===== SECURITY: Input Sanitization =====
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

    // ===== PASSWORD VALIDATION (CRITICAL FIX: HIGH-5) =====
    const validatePassword = (password) => {
        const errors = [];
        if (password.length < 12) errors.push("Password must be at least 12 characters");
        if (!/[A-Z]/.test(password)) errors.push("Must contain uppercase letter");
        if (!/[a-z]/.test(password)) errors.push("Must contain lowercase letter");
        if (!/[0-9]/.test(password)) errors.push("Must contain number");
        if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) errors.push("Must contain special character");
        return errors;
    };

    // ===== STATE MANAGEMENT =====
    const state = {
        currentUser: localStorage.getItem('sc_username') || null,
        userId: null,
        rooms: {},
        activeRoom: null,
        theme: localStorage.getItem('sc_theme') || 'light',
        isOnline: navigator.onLine,
        replyingTo: null,
        editingMessage: null
    };

    // ===== DOM ELEMENTS =====
    const elements = {
        // Auth screens
        loginScreen: $('login-screen'),
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

        // Modals
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

        // Chat interface
        chatScreen: $('chat-screen'),
        sidebar: $('sidebar'),
        chatList: $('chat-list'),
        searchInput: $('search-input'),
        newChatBtn: $('new-chat-btn'),
        themeToggle: $('theme-toggle'),
        settingsBtn: $('settings-btn'),

        // Chat area
        chatHeader: $('chat-name'),
        chatStatus: $('chat-status'),
        messagesContainer: $('messages-container'),
        messageInput: $('message-input'),
        sendBtn: $('send-btn'),
        attachBtn: $('attach-btn'),
        fileInput: $('file-input'),
        backBtn: $('back-btn'),

        // Reply
        replyPreview: $('reply-preview'),
        replyPreviewText: $('reply-preview-text'),
        replyToUser: $('reply-to-user'),
        cancelReply: $('cancel-reply'),

        // Typing indicator
        typingIndicator: $('typing-indicator'),
        typingUser: $('typing-user'),

        // New chat modal
        newChatModal: $('new-chat-modal'),
        roomIdInput: $('room-id-input'),
        roomPasswordInput: $('room-password-input'),
        joinRoomBtn: $('join-room-btn'),
        generateRoomId: $('generate-room-id'),
        cancelNewChat: $('cancel-new-chat'),

        // Settings
        settingsModal: $('settings-modal'),
        closeSettings: $('close-settings'),
        logoutBtn: $('logout-btn'),
        exportDataBtn: $('export-data-btn'),
        deleteAccountBtn: $('delete-account-btn'),

        // Status
        offlineIndicator: $('offline-indicator')
    };

    // ===== THEME ENGINE (MED-5 FIX) ===== 
    const applyTheme = () => {
        document.documentElement.setAttribute('data-theme', state.theme);
        localStorage.setItem('sc_theme', state.theme);
    };
    applyTheme();

    // ===== ONLINE/OFFLINE DETECTION (MED-4 FIX) =====
    const updateOnlineStatus = () => {
        state.isOnline = navigator.onLine;
        elements.offlineIndicator.classList.toggle('hidden', state.isOnline);
        if (!state.isOnline) {
            showToast("No internet connection");
        }
    };
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    updateOnlineStatus(); // Set initial state

    // ===== NOTIFICATIONS (MED-9 FIX) =====
    if (Notification.permission === "default") {
        Notification.requestPermission();
    }

    const notify = (title, body) => {
        if (Notification.permission === "granted" && document.hidden) {
            new Notification(title, { body, icon: '/favicon.ico' });
        }
    };

    // ===== TOAST NOTIFICATIONS =====
    const showToast = (message, duration = 3000) => {
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), duration);
    };

    // ===== CRYPTO FUNCTIONS =====
    const getSecretKey = async (password, roomId) => {
        const encoder = new TextEncoder();
        const data = encoder.encode(password + roomId);
        const hash = await crypto.subtle.digest('SHA-256', data);
        return await crypto.subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
    };

    const encrypt = async (text, roomId) => {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const key = state.rooms[roomId].key;
        const encoder = new TextEncoder();
        const encrypted = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            key,
            encoder.encode(text)
        );
        const combined = new Uint8Array(iv.length + encrypted.byteLength);
        combined.set(iv);
        combined.set(new Uint8Array(encrypted), iv.length);
        return btoa(String.fromCharCode(...combined));
    };

    const decrypt = async (encryptedData, roomId) => {
        try {
            const raw = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
            const iv = raw.slice(0, 12);
            const data = raw.slice(12);
            const key = state.rooms[roomId].key;
            const decrypted = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv },
                key,
                data
            );
            const decoder = new TextDecoder();
            return decoder.decode(decrypted);
        } catch (e) {
            console.error('Decryption failed:', e);
            return null;
        }
    };

    // ===== AUTH FUNCTIONS =====
    // ERROR HANDLING FIX (CODE-1)
    const apiCall = async (url, method = 'POST', body = null) => {
        try {
            const options = {
                method,
                headers: { 'Content-Type': 'application/json' }
            };
            if (body) options.body = JSON.stringify(body);

            const response = await fetch(url, options);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return await response.json();
        } catch (err) {
            showToast(`Connection failed: ${err.message}`);
            console.error('API Error:', err);
            throw err;
        }
    };

    // Login
    elements.loginBtn.addEventListener('click', async () => {
        const username = validateInput(elements.loginUsername.value, 50);
        const password = validateInput(elements.loginPassword.value, 128);

        if (!username || !password) {
            showToast("Please enter username and password");
            return;
        }

        elements.loginBtn.disabled = true;
        elements.loginBtn.innerHTML = '<span class="loader"></span>';

        try {
            const result = await apiCall('/api/login', 'POST', { username, password });
            if (result.status === 'ok') {
                state.currentUser = username;
                state.userId = result.user_id;
                localStorage.setItem('sc_username', username);
                elements.loginScreen.classList.add('hidden');
                elements.chatScreen.classList.remove('hidden');
                loadChatHistory();
            } else {
                showToast(result.msg || "Login failed");
            }
        } catch (err) {
            // Error already handled by apiCall
        } finally {
            elements.loginBtn.disabled = false;
            elements.loginBtn.textContent = 'Log In';
        }
    });

    // Register
    elements.registerBtn.addEventListener('click', async () => {
        const username = validateInput(elements.registerUsername.value, 50);
        const password = validateInput(elements.registerPassword.value, 128);

        const passwordErrors = validatePassword(password);
        if (passwordErrors.length > 0) {
            showToast(passwordErrors[0]);
            return;
        }

        if (!username || !password) {
            showToast("Please enter username and password");
            return;
        }

        elements.registerBtn.disabled = true;
        elements.registerBtn.innerHTML = '<span class="loader"></span>';

        try {
            const result = await apiCall('/api/register', 'POST', { username, password });
            if (result.status === 'ok') {
                elements.recoveryKeyText.textContent = result.recovery_key;
                elements.recoveryKeyDisplay.classList.remove('hidden');
                elements.recoveryForm.classList.add('hidden');
                elements.recoveryModal.classList.remove('hidden');
            } else {
                showToast(result.msg || "Registration failed");
            }
        } catch (err) {
            // Error already handled
        } finally {
            elements.registerBtn.disabled = false;
            elements.registerBtn.textContent = 'Create Account';
        }
    });

    // UI toggles
    elements.showRegister.addEventListener('click', (e) => {
        e.preventDefault();
        elements.loginForm.classList.add('hidden');
        elements.registerForm.classList.remove('hidden');
    });

    elements.showLogin.addEventListener('click', (e) => {
        e.preventDefault();
        elements.registerForm.classList.add('hidden');
        elements.loginForm.classList.remove('hidden');
    });

    elements.showRecover.addEventListener('click', (e) => {
        e.preventDefault();
        elements.recoveryKeyDisplay.classList.add('hidden');
        elements.recoveryForm.classList.remove('hidden');
        elements.recoveryModal.classList.remove('hidden');
    });

    elements.closeRecovery.addEventListener('click', () => {
        elements.recoveryModal.classList.add('hidden');
        elements.registerForm.classList.add('hidden');
        elements.loginForm.classList.remove('hidden');
    });

    elements.copyRecoveryKey.addEventListener('click', () => {
        navigator.clipboard.writeText(elements.recoveryKeyText.textContent);
        showToast("Recovery key copied to clipboard");
    });

    elements.recoverBtn.addEventListener('click', async () => {
        const username = elements.recoverUsername.value;
        const recoveryKey = elements.recoverKey.value;
        const newPassword = elements.recoverPassword.value;

        const passwordErrors = validatePassword(newPassword);
        if (passwordErrors.length > 0) {
            showToast(passwordErrors[0]);
            return;
        }

        try {
            const result = await apiCall('/api/recover', 'POST', {
                username,
                recovery_key: recoveryKey,
                new_password: newPassword
            });
            if (result.status === 'ok') {
                showToast("Account recovered! Please log in");
                elements.recoveryModal.classList.add('hidden');
                elements.loginUsername.value = username;
                elements.loginPassword.value = newPassword;
            } else {
                showToast(result.msg || "Recovery failed");
            }
        } catch (err) {
            // Error handled
        }
    });

    elements.cancelRecover.addEventListener('click', () => {
        elements.recoveryModal.classList.add('hidden');
    });

    // ===== WEBSOCKET & ROOMS =====
    const getWSToken = async () => {
        try {
            const result = await apiCall('/api/ws-token', 'GET');
            return result.token;
        } catch {
            return null;
        }
    };

    const joinRoom = async (roomId, roomPassword) => {
        if (roomPassword.length < 8) {
            showToast("Room password must be at least 8 characters");
            return;
        }

        const token = await getWSToken();
        if (!token) {
            showToast("Session expired. Please log in again");
            return;
        }

        try {
            const key = await getSecretKey(roomPassword, roomId);
            const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
            const ws = new WebSocket(`${protocol}//${location.host}/ws/${roomId}/${state.currentUser}?token=${token}&pwd=${encodeURIComponent(roomPassword)}`);

            state.rooms[roomId] = {
                key,
                ws,
                users: [],
                messages: [],
                isAdmin: false
            };

            ws.onopen = () => {
                showToast(`Joined room: ${roomId}`);
                addChatToList(roomId);
                switchToRoom(roomId);
                elements.newChatModal.classList.add('hidden');

                // Save to history
                apiCall('/api/save-room', 'POST', { user_id: state.userId, room_id: roomId });
            };

            ws.onmessage = async (e) => {
                const data = JSON.parse(e.data);
                handleWebSocketMessage(roomId, data);
            };

            ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                showToast("Connection error");
            };

            ws.onclose = () => {
                if (state.rooms[roomId]) {
                    showToast(`Disconnected from ${roomId}`);
                    delete state.rooms[roomId];
                }
            };
        } catch (error) {
            console.error('Join room error:', error);
            showToast("Failed to join room");
        }
    };

    const handleWebSocketMessage = async (roomId, data) => {
        const room = state.rooms[roomId];
        if (!room) return;

        switch (data.type) {
            case 'user_list':
                room.users = data.users;
                room.isAdmin = data.admin === state.currentUser;
                updateChatStatus(roomId);
                break;

            case 'message':
            case 'image':
            case 'file':
                const decrypted = await decrypt(data.content, roomId);
                if (decrypted) {
                    const message = {
                        id: data.id,
                        sender: data.username,
                        content: decrypted,
                        timestamp: new Date(data.timestamp),
                        reply_to: data.reply_to,
                        type: data.type
                    };
                    room.messages.push(message);
                    if (state.activeRoom === roomId) {
                        renderMessage(message);
                        notify(`${data.username}`, decrypted.substring(0, 50));
                    }
                }
                break;

            case 'typing':
                if (state.activeRoom === roomId && data.username !== state.currentUser) {
                    elements.typingUser.textContent = data.username;
                    elements.typingIndicator.classList.toggle('hidden', !data.status);
                }
                break;

            case 'edit_msg':
                updateMessage(roomId, data.id, data.content);
                break;

            case 'delete_msg':
                deleteMessage(data.id);
                break;
        }
    };

    // ===== UI FUNCTIONS =====
    const addChatToList = (roomId) => {
        const chatItem = document.createElement('div');
        chatItem.className = 'chat-item';
        chatItem.id = `chat-${roomId}`;
        chatItem.innerHTML = `
            <div class="avatar">${roomId.charAt(0).toUpperCase()}</div>
            <div class="chat-item-content">
                <div class="chat-item-header">
                    <div class="chat-item-name">${roomId}</div>
                    <div class="chat-item-time">Now</div>
                </div>
                <div class="chat-item-preview">Room ready</div>
            </div>
        `;
        chatItem.addEventListener('click', () => switchToRoom(roomId));
        elements.chatList.appendChild(chatItem);
    };

    const switchToRoom = (roomId) => {
        state.activeRoom = roomId;

        // Update active state in list
        document.querySelectorAll('.chat-item').forEach(item => {
            item.classList.remove('active');
        });
        const chatItem = $(`chat-${roomId}`);
        if (chatItem) chatItem.classList.add('active');

        // Update header
        elements.chatHeader.textContent = roomId;

        // Render messages
        elements.messagesContainer.innerHTML = '';
        const room = state.rooms[roomId];
        if (room) {
            room.messages.forEach(msg => renderMessage(msg));
            updateChatStatus(roomId);
        }
    };

    const updateChatStatus = (roomId) => {
        if (state.activeRoom !== roomId) return;
        const room = state.rooms[roomId];
        if (room) {
            const onlineCount = room.users.length;
            elements.chatStatus.textContent = `${onlineCount} ${onlineCount === 1 ? 'participant' : 'participants'}`;
            elements.chatStatus.classList.add('online');
        }
    };

    const renderMessage = (message) => {
        const msgDiv = document.createElement('div');
        const isOwn = message.sender === state.currentUser;
        msgDiv.className = isOwn ? 'message message-out' : 'message message-in';
        msgDiv.id = `msg-${message.id}`;

        let html = '';

        // Reply Engine - Liquid Tech Styling
        if (message.reply_to) {
            html += `
                <div class="message-reply-preview" style="background: rgba(0,0,0,0.2); border-left: 3px solid var(--accent); padding: 8px 12px; border-radius: 8px; margin-bottom: 10px;">
                    <div style="font-weight: 700; font-size: 10px; color: var(--accent); text-transform: uppercase;">REPLYING TO</div>
                    <div style="font-size: 13px; opacity: 0.8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                        ${sanitizeHTML(message.reply_content || 'Original message')}
                    </div>
                </div>`;
        }

        // Kinetic Sender Label
        if (!isOwn) {
            html += `<div class="message-sender">${sanitizeHTML(message.sender)}</div>`;
        }

        // Logic Content
        html += `<div class="message-content">${sanitizeHTML(message.content)}</div>`;

        // Sensory Meta
        html += `<div class="message-meta">
            <span class="message-time">${formatTime(message.timestamp)}</span>
            ${isOwn ? `<span class="message-status" title="Secured via AES-GCM">SECURED</span>` : ''}
        </div>`;

        msgDiv.innerHTML = html;

        // Contextual Interaction
        msgDiv.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            startReply(message);
        });

        // Double Tap to Recalibrate (Edit)
        if (isOwn) {
            msgDiv.addEventListener('dblclick', () => editMessage(message));
        }

        elements.messagesContainer.appendChild(msgDiv);

        // Ultra-Smooth Kinetic Scroll
        setTimeout(() => {
            elements.messagesContainer.scrollTo({
                top: elements.messagesContainer.scrollHeight,
                behavior: 'smooth'
            });
        }, 10);
    };

    const formatTime = (date) => {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    };

    const startReply = (message) => {
        state.replyingTo = message;
        elements.replyToUser.textContent = message.sender;
        elements.replyPreviewText.textContent = message.content.substring(0, 50);
        elements.replyPreview.classList.remove('hidden');
        elements.messageInput.focus();
    };

    elements.cancelReply.addEventListener('click', () => {
        state.replyingTo = null;
        elements.replyPreview.classList.add('hidden');
    });

    const editMessage = (message) => {
        state.editingMessage = message;
        elements.messageInput.value = message.content;
        elements.messageInput.focus();
        elements.messageInput.style.borderColor = 'var(--primary)';
    };

    const updateMessage = async (roomId, messageId, encryptedContent) => {
        const msgDiv = $(`msg-${messageId}`);
        if (!msgDiv) return;

        const decrypted = await decrypt(encryptedContent, roomId);
        if (decrypted) {
            const contentDiv = msgDiv.querySelector('.message-content');
            contentDiv.textContent = decrypted + ' (edited)';
        }
    };

    const deleteMessage = (messageId) => {
        const msgDiv = $(`msg-${messageId}`);
        if (msgDiv) msgDiv.remove();
    };

    // ===== SENDING MESSAGES =====
    const sendMessage = async () => {
        if (!state.activeRoom) return;

        const text = elements.messageInput.value.trim();
        if (!text) return;

        const room = state.rooms[state.activeRoom];
        if (!room || !room.ws) return;

        try {
            const encrypted = await encrypt(text, state.activeRoom);

            if (state.editingMessage) {
                room.ws.send(JSON.stringify({
                    type: 'edit_msg',
                    id: state.editingMessage.id,
                    content: encrypted
                }));
                state.editingMessage = null;
                elements.messageInput.style.borderColor = '';
            } else {
                room.ws.send(JSON.stringify({
                    type: 'message',
                    content: encrypted,
                    reply_to: state.replyingTo?.id || null
                }));
                state.replyingTo = null;
                elements.replyPreview.classList.add('hidden');
            }

            elements.messageInput.value = '';
            elements.messageInput.style.height = 'auto';
        } catch (error) {
            console.error('Send error:', error);
            showToast("Failed to send message");
        }
    };

    elements.sendBtn.addEventListener('click', sendMessage);
    elements.messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // TYPING INDICATOR (MED-6 FIX)
    let typingTimeout;
    elements.messageInput.addEventListener('input', () => {
        if (!state.activeRoom) return;
        const room = state.rooms[state.activeRoom];
        if (!room || !room.ws) return;

        clearTimeout(typingTimeout);
        room.ws.send(JSON.stringify({ type: 'typing', status: true }));

        typingTimeout = setTimeout(() => {
            room.ws.send(JSON.stringify({ type: 'typing', status: false }));
        }, 1000);

        // Auto-resize textarea
        elements.messageInput.style.height = 'auto';
        elements.messageInput.style.height = elements.messageInput.scrollHeight + 'px';
    });

    // ===== NEW CHAT =====
    elements.newChatBtn.addEventListener('click', () => {
        elements.newChatModal.classList.remove('hidden');
    });

    elements.generateRoomId.addEventListener('click', () => {
        const randomId = 'room-' + Math.random().toString(36).substring(2, 10);
        elements.roomIdInput.value = randomId;
    });

    elements.joinRoomBtn.addEventListener('click', () => {
        const roomId = validateInput(elements.roomIdInput.value, 100);
        const password = validateInput(elements.roomPasswordInput.value, 128);

        if (!roomId || !password) {
            showToast("Please enter room ID and password");
            return;
        }

        joinRoom(roomId, password);
        elements.roomIdInput.value = '';
        elements.roomPasswordInput.value = '';
    });

    elements.cancelNewChat.addEventListener('click', () => {
        elements.newChatModal.classList.add('hidden');
    });

    // ===== SETTINGS =====
    elements.settingsBtn.addEventListener('click', () => {
        elements.settingsModal.classList.remove('hidden');
    });

    elements.closeSettings.addEventListener('click', () => {
        elements.settingsModal.classList.add('hidden');
    });

    elements.themeToggle.addEventListener('click', () => {
        state.theme = state.theme === 'light' ? 'dark' : 'light';
        applyTheme();
    });

    elements.logoutBtn.addEventListener('click', async () => {
        await apiCall('/api/logout', 'POST');
        localStorage.clear();
        location.reload();
    });

    elements.exportDataBtn.addEventListener('click', async () => {
        try {
            const history = await apiCall(`/api/history/${state.userId}`, 'GET');
            const exportData = {
                username: state.currentUser,
                exported_at: new Date().toISOString(),
                rooms: history
            };

            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `securechat-export-${state.currentUser}-${Date.now()}.json`;
            a.click();
            showToast("Data exported successfully");
        } catch (err) {
            showToast("Export failed");
        }
    });

    elements.deleteAccountBtn.addEventListener('click', async () => {
        if (!confirm("Are you sure? This will permanently delete your account and all data. This cannot be undone.")) {
            return;
        }

        try {
            await apiCall('/api/delete-account', 'POST');
            showToast("Account deleted");
            localStorage.clear();
            setTimeout(() => location.reload(), 2000);
        } catch (err) {
            showToast("Delete failed");
        }
    });

    // ===== LOAD CHAT HISTORY =====
    const loadChatHistory = async () => {
        try {
            const rooms = await apiCall(`/api/history/${state.userId}`, 'GET');
            // Just display the room list, don't auto-join
            // User can click to join with password
        } catch (err) {
            console.error('Failed to load history');
        }
    };

    // ===== SEARCH (MED-2 FIX) =====
    elements.searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        document.querySelectorAll('.chat-item').forEach(item => {
            const name = item.querySelector('.chat-item-name').textContent.toLowerCase();
            item.style.display = name.includes(query) ? '' : 'none';
        });
    });

    // ===== MOBILE RESPONSIVENESS =====
    elements.backBtn.addEventListener('click', () => {
        elements.sidebar.classList.remove('active');
    });

    // Check if user is already logged in
    if (state.currentUser) {
        elements.loginScreen.classList.add('hidden');
        elements.chatScreen.classList.remove('hidden');
    }
});
