# Study Guide - How the Project Works?

This guide is for us to prepare for the viva or presentation.

### 1. WebSockets (The Connection)
In normal websites, you request and the server responds. But for a chat, we need a "Live" connection. WebSockets keep the line open between the browser and server so messages can go back and forth instantly.

### 2. E2EE (Privacy)
"End-to-End Encryption" means the message is locked at my side and only unlocked at your side. 
- We use the **Web Crypto API** in JavaScript.
- We derive a **256-bit key** from the room password.
- We use **AES-GCM** to scramble the text.
- The server only sees random code (binary/base64).

### 3. FastAPI (The Backend)
We chose FastAPI because it is very fast and handles WebSockets easily. It broadcasts messages to everyone in the room.

### 4. Security Highlights:
- **No Database**: We don't save any chat history. Once you close the tab, the chat is gone forever (highly secure).
- **Password Rooms**: Each room has its own password. Access is only for those who know it.
- **Sanitization**: We escape HTML to prevent XSS (Cross Site Scripting) attacks.

### Important Keywords to Remember:
1. **AES-256-GCM**: Advanced Encryption Standard.
2. **SHA-256**: Secure Hash Algorithm (used to make the key).
3. **WSS**: WebSocket Secure (Encrypted tunnel).
4. **FastAPI**: Modern Python web framework.
