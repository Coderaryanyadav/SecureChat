// SecureChat - Script
// Managed by Aryan and Jeet

document.addEventListener('DOMContentLoaded', () => {
    // Get all UI elements
    const loginDiv = document.getElementById('auth-screen');
    const chatDiv = document.getElementById('chat-screen');
    const nameInput = document.getElementById('username');
    const roomInput = document.getElementById('room-id');
    const passInput = document.getElementById('room-password');
    const joinBtn = document.getElementById('join-btn');
    const leaveBtn = document.getElementById('leave-btn');
    const form = document.getElementById('message-form');
    const input = document.getElementById('message-input');
    const chatArea = document.getElementById('messages');
    const roomLabel = document.getElementById('display-room');
    const userLabel = document.getElementById('display-username');

    let ws = null;
    let myName = '';
    let myRoom = '';
    let myKey = null;

    // --- ENCRYPTION FUNCTIONS ---

    // Generate key from password
    async function makeKey(pwd) {
        const encoder = new TextEncoder();
        const data = encoder.encode(pwd);
        const hash = await crypto.subtle.digest('SHA-256', data);
        return await crypto.subtle.importKey(
            'raw', hash, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']
        );
    }

    // Encrypt the message
    async function encryptMsg(text) {
        if (!myKey) return text;
        const encoder = new TextEncoder();
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encrypted = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv }, myKey, encoder.encode(text)
        );
        const combined = new Uint8Array(iv.length + encrypted.byteLength);
        combined.set(iv);
        combined.set(new Uint8Array(encrypted), iv.length);
        return btoa(String.fromCharCode(...combined));
    }

    // Decrypt the message
    async function decryptMsg(b64) {
        if (!myKey) return b64;
        try {
            const combined = new Uint8Array(atob(b64).split("").map(c => c.charCodeAt(0)));
            const iv = combined.slice(0, 12);
            const data = combined.slice(12);
            const dec = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, myKey, data);
            return new TextDecoder().decode(dec);
        } catch (err) {
            console.log("Error decrypting:", err);
            return "[This message is encrypted and you don't have the key]";
        }
    }

    // --- CHAT LOGIC ---

    async function startChat() {
        const name = nameInput.value.trim();
        const room = roomInput.value.trim() || 'home';
        const pass = passInput.value.trim();

        if (name === "" || pass === "") {
            alert("Please fill your name and room password!");
            return;
        }

        joinBtn.disabled = true;
        joinBtn.innerText = "Connecting...";

        try {
            // Check room status first
            const resp = await fetch('/api/verify-room', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ room_id: room, password: pass })
            });
            const result = await resp.json();

            if (result.status === "fail") {
                alert(result.msg);
                joinBtn.disabled = false;
                joinBtn.innerText = "Verify & Join Channel";
                return;
            }

            // Prepare encryption
            myKey = await makeKey(pass + room);
            myName = name;
            myRoom = room;

            // Connect WebSocket
            const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
            const url = `${protocol}//${location.host}/ws/${room}/${name}?pwd=${encodeURIComponent(pass)}`;

            ws = new WebSocket(url);

            ws.onopen = () => {
                loginDiv.classList.add('hidden');
                chatDiv.classList.remove('hidden');
                roomLabel.innerText = room;
                userLabel.innerText = name;
                chatArea.innerHTML = '';
                addSystemMsg("Safe Tunnel Created!");
            };

            ws.onmessage = async (e) => {
                const data = JSON.parse(e.data);
                if (data.type === 'system') {
                    addSystemMsg(data.content);
                } else if (data.type === 'message') {
                    const isMe = data.username === myName;
                    const text = await decryptMsg(data.content);
                    addBubble(data.username, text, data.timestamp, isMe);
                } else if (data.type === 'error') {
                    alert("ERROR: " + data.message);
                }
            };

            ws.onclose = () => {
                addSystemMsg("Disconnected.");
                setTimeout(() => {
                    location.reload(); // Go back to login
                }, 1500);
            };

        } catch (e) {
            console.log(e);
            alert("Connection Failed!");
            joinBtn.disabled = false;
        }
    }

    function addSystemMsg(txt) {
        const d = document.createElement('div');
        d.className = 'system-msg';
        d.innerText = txt;
        chatArea.appendChild(d);
        chatArea.scrollTop = chatArea.scrollHeight;
    }

    function addBubble(user, msg, time, isMe) {
        const d = document.createElement('div');
        d.className = `message ${isMe ? 'my-msg' : 'other-msg'}`;

        const showTime = new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        d.innerHTML = `
            ${isMe ? '' : `<div class="msg-header">${user}</div>`}
            <div class="msg-content">${escape(msg)}</div>
            <div class="msg-time">${showTime}</div>
        `;
        chatArea.appendChild(d);
        chatArea.scrollTop = chatArea.scrollHeight;
    }

    function escape(str) {
        const p = document.createElement('p');
        p.innerText = str;
        return p.innerHTML;
    }

    // Event Listeners
    joinBtn.onclick = startChat;

    form.onsubmit = async (e) => {
        e.preventDefault();
        const msg = input.value.trim();
        if (msg && ws && ws.readyState === WebSocket.OPEN) {
            const secret = await encryptMsg(msg);
            ws.send(JSON.stringify({ content: secret }));
            input.value = '';
        }
    };

    leaveBtn.onclick = () => {
        if (ws) ws.close();
    };

    // Quick enter key support
    [nameInput, roomInput, passInput].forEach(el => {
        el.onkeypress = (e) => { if (e.key === 'Enter') startChat(); };
    });
});
