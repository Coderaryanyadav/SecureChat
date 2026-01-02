# SecureChat: E2EE Private Messaging

A premium, state-of-the-art secure chat application built with **FastAPI (Python)** and **Vanilla JS**.

## 🛡️ Security Features
- **Project-Level E2EE**: AES-256-GCM encryption performed entirely in the browser.
- **Room Verification**: Every room is protected by a unique password. If a room doesn't exist, it's created with the password provided by the first user.
- **Blind Relay**: The server never sees plaintext messages; it only handles encrypted blobs.
- **Ephemeral Logic**: Messages are not stored on the server disk or database.

## ✨ Premium UI
- **Glassmorphic Design**: Modern acrylic effects and blur.
- **Responsive Animations**: Smooth transitions and hover effects.
- **Brutal Audit Approved**: Hardened against XSS and spoofing.

## 🚀 Quick Start
1. Install dependencies: `pip install -r requirements.txt`
2. Run the application: `./run.sh`
3. Access: `http://localhost:8000`

## 🛠 Tech Stack
- **Backend**: Python 3.10+, FastAPI, Uvicorn (standard).
- **Frontend**: HTML5, CSS3 (Vanilla), JS (Web Crypto API).
