# 👻 GhostChat Prime

**Zero-Knowledge E2E Encrypted Ephemeral Messenger**

A privacy-first, military-grade encrypted chat application with Perfect Forward Secrecy, self-destructing messages, and a beautiful glassmorphism UI. Built for those who demand absolute privacy.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Python](https://img.shields.io/badge/python-3.10+-blue.svg)
![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-green.svg)

---

## ✨ Features

### 🔐 Security & Encryption
- **Zero-Knowledge Architecture**: Server never sees your encryption keys
- **AES-256-GCM Encryption**: Military-grade client-side encryption
- **Perfect Forward Secrecy**: Unique IV/salt for every message
- **Self-Destructing Messages**: Vanish Timer for ephemeral communications
- **Bcrypt Authentication**: Secure password hashing with salt

### 💬 Communication
- **Real-Time Messaging**: WebSocket-based instant delivery
- **Multi-Room Support**: Concurrent dimensions with tab management
- **Voice Fragments**: E2E encrypted audio messages that self-destruct
- **File Sharing**: Send encrypted images and documents
- **Typing Indicators**: Know when someone is crafting a message
- **Emoji Reactions**: Express yourself without words

### 🎨 User Experience
- **Glassmorphism UI**: Premium 45px blur aesthetic
- **Spectral Identities**: Choose your avatar (👻, 💀, 🧿, 🔮)
- **Drag-to-Delete**: "Black Hole" vanish mechanic
- **Session Persistence**: Stay logged in across page refreshes
- **QR Bridge Codes**: Easy room sharing
- **Password Strength Meter**: Visual feedback for encryption seals

### 👑 Admin Controls
- **Room Locking**: Prevent new users from joining
- **Participant Kicking**: Remove disruptive spirits
- **Wipe All Messages**: Nuclear option for the entire dimension
- **Admin Succession**: Automatic role transfer (planned)

---

## 🚀 Quick Start

### Prerequisites
- Python 3.10 or higher
- Modern web browser (Chrome, Firefox, Safari, Edge)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/ghostchat-prime.git
   cd ghostchat-prime
   ```

2. **Create a virtual environment**
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate  # On Windows: .venv\Scripts\activate
   ```

3. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

4. **Run the server**
   ```bash
   python3 server/main.py
   ```

5. **Open your browser**
   ```
   Navigate to: http://localhost:8000
   ```

---

## 📖 How to Use

### First Time Setup

1. **Register an Identity**
   - Enter a unique username (your "Phantom ID")
   - Choose a strong master seal (password)
   - Click "Register" → Then "Manifest" to log in

2. **Choose Your Avatar**
   - Select from 4 spectral identities
   - Your choice persists across sessions

3. **Join or Create a Dimension**
   - Enter a Dimension ID (e.g., `void-secret`)
   - Set an Encryption Seal (this is your room password)
   - Click "Phase In"

### Messaging

- **Send Text**: Type in the input field and press Enter or click ✦
- **Vanish Timer**: Click ⌛ to enable self-destruct mode
- **Voice Fragment**: Hold 🎤 to record, then ✓ to send
- **Share Files**: Click 📎 to upload encrypted media
- **React to Messages**: Click a message, then choose an emoji

### Admin Powers

If you create a room, you become the **Guardian**:
- **Lock Portal**: Prevent new users from joining
- **Wipe All Echoes**: Delete all messages in the room
- **Kick Users**: Click "KICK" next to a user's name

---

## 🏗️ Architecture

```
┌─────────────────┐         WebSocket          ┌──────────────────┐
│                 │◄───────────────────────────►│                  │
│  Browser Client │                             │  FastAPI Server  │
│  (JS/HTML/CSS)  │         HTTP/REST           │   (Python)       │
│                 │◄───────────────────────────►│                  │
└─────────────────┘                             └──────────────────┘
         │                                               │
         │ Encrypts with AES-GCM                         │
         │ (Key never leaves browser)                    │
         │                                               │
         └─── LocalStorage ───┐                          │
                               │                         │
                        ┌──────▼──────┐          ┌───────▼────────┐
                        │   Avatar    │          │   database.db  │
                        │   UID/Name  │          │  (Users, Rooms)│
                        └─────────────┘          └────────────────┘
```

### Tech Stack

**Frontend:**
- Pure JavaScript (ES6+)
- HTML5 + CSS3
- Web Crypto API (for AES-GCM)
- WebSocket API
- QRCode.js

**Backend:**
- FastAPI (ASGI framework)
- Uvicorn (ASGI server)
- SQLite3 (database)
- Passlib + Bcrypt (password hashing)
- SlowAPI (rate limiting)
- Python Cryptography (server-side utils)

---

## 🔒 Security Model

### Zero-Knowledge Proof
- Server **never** receives your encryption key
- Room passwords are hashed with SHA-256 + room ID before key derivation
- All encryption/decryption happens in your browser's memory
- Keys are never stored on disk

### Perfect Forward Secrecy
- Every message gets a unique 12-byte IV (Initialization Vector)
- Messages cannot be decrypted even if the master key is compromised later
- Past communications remain secure

### Authentication Flow
```
User Password → Bcrypt(password) → Stored Hash
                        ↓
                  (Never sent to server)
                        ↓
Room Password + Room ID → SHA-256 → AES Key (browser only)
```

---

## 📁 Project Structure

```
SecureChat/
├── server/
│   └── main.py              # FastAPI backend + WebSocket server
├── static/
│   ├── index.html           # Main UI template
│   ├── script.js            # Client-side logic & crypto
│   ├── style.css            # Glassmorphism design system
│   └── manifest.json        # PWA manifest
├── requirements.txt          # Python dependencies
├── FUTURE_ENHANCEMENTS.md   # Roadmap for Phase 5+
├── PROJECT_AUDIT.md         # Current status & action items
├── README.md                # This file
└── .gitignore
```

---

## 🛣️ Roadmap

### ✅ Completed (v1.0 - v4.0)
- Zero-Knowledge authentication
- Client-side E2E encryption
- Multi-room support
- Voice fragments
- Self-destructing messages
- Admin controls
- Glassmorphism UI

### 🔮 Phase 5 (In Progress)
- **Lattice-Guard Visual Crypto**: Enhanced handshake animations ✅
- **Ghost Communities**: Sidebar section for group discovery ✅
- **Ephemeral Persistence**: "Glitch Mode" where messages vanish on blur
- **Spectral Handshake**: Anti-brute-force protection

### 🛰️ Future (Moonshot Goals)
- **Ghost Mesh**: P2P WebRTC for serverless messaging
- **Proximity Portal**: Bluetooth/mDNS local discovery
- **Post-Quantum Crypto**: Transition to Kyber/Dilithium
- **Self-Sovereign Identity**: DID integration

See [`FUTURE_ENHANCEMENTS.md`](FUTURE_ENHANCEMENTS.md) for full details.

---

## 🐛 Known Issues

1. **Modal Display**: "Acknowledge" button on first load may appear as a top bar on some browsers (CSS specificity issue)
2. **Admin Succession**: When admin leaves, no new admin is auto-assigned
3. **File Size Limits**: No client-side validation for max upload size
4. **Voice Duration**: No cap on recording length

See [`PROJECT_AUDIT.md`](PROJECT_AUDIT.md) for full bug tracker.

---

## 🤝 Contributing

Contributions are welcome! Please follow these guidelines:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines
- Follow PEP 8 for Python code
- Use meaningful variable names (avoid single letters except in loops)
- Add comments for complex crypto operations
- Test in at least 2 browsers before submitting PR

---

## 📜 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

---

## ⚠️ Disclaimer

**For Educational Purposes**: This project is a demonstration of end-to-end encryption principles. While it implements strong cryptography, a full security audit is recommended before use in production environments.

**No Warranty**: This software is provided "as is" without warranty of any kind. Use at your own risk.

---

## 🙏 Acknowledgments

- FastAPI team for the excellent async framework
- Web Crypto API specifications (W3C)
- The open-source community for inspiration

---

## 📧 Contact

**Project Maintainer**: [Your Name]  
**Email**: your.email@example.com  
**GitHub**: [@yourusername](https://github.com/yourusername)

---

<div align="center">

**Made with 💜 for Privacy**

*"Your identity is encrypted. Your messages are ephemeral. No traces remain on our core."*

</div>
