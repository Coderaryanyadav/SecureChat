document.addEventListener('DOMContentLoaded', () => {
    const authScreen = document.getElementById('auth-screen');
    const chatScreen = document.getElementById('chat-screen');
    const usernameInput = document.getElementById('username');
    const roomIdInput = document.getElementById('room-id');
    const joinBtn = document.getElementById('join-btn');
    const leaveBtn = document.getElementById('leave-btn');
    const messageForm = document.getElementById('message-form');
    const messageInput = document.getElementById('message-input');
    const messageArea = document.getElementById('messages');
    const displayRoom = document.getElementById('display-room');
    const displayUsername = document.getElementById('display-username');

    let socket = null;
    let currentUsername = '';
    let currentRoom = '';
    let cryptoKey = null;

    // Derived key from room ID for simple E2EE demo
    const deriveKey = async (password) => {
        const encoder = new TextEncoder();
        const data = encoder.encode(password);
        const hash = await crypto.subtle.digest('SHA-256', data);
        return await crypto.subtle.importKey(
            'raw',
            hash,
            { name: 'AES-GCM' },
            false,
            ['encrypt', 'decrypt']
        );
    };

    const encryptMessage = async (text) => {
        if (!cryptoKey) return text;
        const encoder = new TextEncoder();
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encrypted = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            cryptoKey,
            encoder.encode(text)
        );

        // Return as base64 combined with IV
        const combined = new Uint8Array(iv.length + encrypted.byteLength);
        combined.set(iv);
        combined.set(new Uint8Array(encrypted), iv.length);
        return btoa(String.fromCharCode(...combined));
    };

    const decryptMessage = async (base64) => {
        if (!cryptoKey) return base64;
        try {
            const combined = new Uint8Array(atob(base64).split("").map(c => c.charCodeAt(0)));
            const iv = combined.slice(0, 12);
            const data = combined.slice(12);
            const decrypted = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv },
                cryptoKey,
                data
            );
            return new TextDecoder().decode(decrypted);
        } catch (e) {
            console.error("Decryption failed", e);
            return "[Encrypted Message - Decryption Failed]";
        }
    };

    const connect = async () => {
        const username = usernameInput.value.trim();
        const roomId = roomIdInput.value.trim() || 'general';
        const roomPassword = document.getElementById('room-password').value.trim();

        if (!username || !roomPassword) {
            alert('Please enter a display name and room password');
            return;
        }

        joinBtn.disabled = true;
        joinBtn.textContent = 'Verifying Room...';

        try {
            // 1. Verify or create room with password
            const verifyResp = await fetch('/api/verify-room', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ room_id: roomId, password: roomPassword })
            });
            const verifyData = await verifyResp.json();

            if (!verifyData.success) {
                alert(verifyData.message);
                joinBtn.disabled = false;
                joinBtn.textContent = 'Verify & Join Channel';
                return;
            }

            // 2. Use password + room ID for E2EE key
            cryptoKey = await deriveKey(roomPassword + roomId);

            currentUsername = username;
            currentRoom = roomId;

            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            // Send password as a query parameter for verification in the WebSocket upgrade
            const wsUrl = `${protocol}//${window.location.host}/ws/${roomId}/${username}?pwd=${encodeURIComponent(roomPassword)}`;

            socket = new WebSocket(wsUrl);

            socket.onopen = () => {
                console.log('Connected to SecureChat server');
                authScreen.classList.add('hidden');
                chatScreen.classList.remove('hidden');
                displayRoom.textContent = roomId;
                displayUsername.textContent = username;

                messageArea.innerHTML = '';
                addSystemMessage('E2EE Verified Tunnel Established');
            };

            socket.onmessage = async (event) => {
                const data = JSON.parse(event.data);
                await handleMessage(data);
            };

            socket.onclose = (event) => {
                console.log('Disconnected from server', event);
                addSystemMessage('Secure tunnel closed');
                joinBtn.disabled = false;
                joinBtn.textContent = 'Verify & Join Channel';

                setTimeout(() => {
                    if (socket && socket.readyState === WebSocket.CLOSED) {
                        authScreen.classList.remove('hidden');
                        chatScreen.classList.add('hidden');
                        socket = null;
                    }
                }, 2000);
            };

            socket.onerror = (error) => {
                console.error('WebSocket Error:', error);
                addSystemMessage('Handshake Failed');
                joinBtn.disabled = false;
                joinBtn.textContent = 'Retry Connection';
            };
        } catch (err) {
            console.error(err);
            alert('Server error during verification');
            joinBtn.disabled = false;
            joinBtn.textContent = 'Verify & Join Channel';
        }
    };

    const handleMessage = async (data) => {
        if (data.type === 'system') {
            addSystemMessage(data.content);
        } else if (data.type === 'message') {
            const isMe = data.username === currentUsername;
            const decryptedContent = await decryptMessage(data.content);
            addChatMessage(data.username, decryptedContent, data.timestamp, isMe);
        } else if (data.type === 'error') {
            addSystemMessage(`SERVER ERROR: ${data.message}`);
        }
    };

    const addSystemMessage = (text) => {
        const div = document.createElement('div');
        div.className = 'system-msg';
        div.textContent = text;
        messageArea.appendChild(div);
        scrollToBottom();
    };

    const addChatMessage = (user, content, timestamp, isMe) => {
        const div = document.createElement('div');
        div.className = `message ${isMe ? 'my-msg' : 'other-msg'}`;

        const time = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        div.innerHTML = `
            ${isMe ? '' : `<div class="msg-header">${user}</div>`}
            <div class="msg-content">${escapeHTML(content)}</div>
            <div class="msg-time">${time}</div>
        `;

        messageArea.appendChild(div);
        scrollToBottom();
    };

    const scrollToBottom = () => {
        messageArea.scrollTop = messageArea.scrollHeight;
    };

    const escapeHTML = (str) => {
        const p = document.createElement('p');
        p.textContent = str;
        return p.innerHTML;
    };

    const sendMessage = async (e) => {
        if (e) e.preventDefault();
        const content = messageInput.value.trim();
        if (content && socket && socket.readyState === WebSocket.OPEN) {
            const encryptedContent = await encryptMessage(content);
            socket.send(JSON.stringify({ content: encryptedContent }));
            messageInput.value = '';
        }
    };

    joinBtn.addEventListener('click', connect);
    messageForm.addEventListener('submit', sendMessage);

    leaveBtn.addEventListener('click', () => {
        if (socket) {
            socket.close();
        }
    });

    // Enter key support for login fields
    [usernameInput, roomIdInput].forEach(input => {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') connect();
        });
    });
});
