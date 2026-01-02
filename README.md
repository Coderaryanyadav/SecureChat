# SecureChat - Final Year Project 🎓

This is a real-time messaging app that uses End-to-End Encryption (E2EE) to keep chats private. Built by **Aryan Yadav** and **Jeet Shah** for our Diploma project.

## How it works?
1. **Frontend**: HTML, CSS, and Vanilla JavaScript.
2. **Backend**: Python (FastAPI).
3. **Encryption**: AES-256-GCM.
4. **Real-time**: WebSockets.

## Setup Instructions
1. Install requirements:
   ```bash
   pip install -r requirements.txt
   ```
2. Run the server:
   ```bash
   python server/main.py
   ```
3. Open `http://localhost:8000` in your browser.

## Project Features
- Private Rooms with Passwords.
- Messages are encrypted in the browser (Server cannot read them).
- Completely Ephemeral (No messages saved on disk).
- Modern Glassmorphism UI.

## Authors
- Aryan Yadav
- Jeet Shah
