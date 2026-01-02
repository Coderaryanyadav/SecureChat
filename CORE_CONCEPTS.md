# Project Core Concepts: How it Works? 🚀

This guide explains the "Magic" behind SecureChat so you can explain it to anyone (or your external examiner).

## 1. Real-Time Communication (WebSockets)
**Concept:** Normally, the web works like this: you ask for a page, the server gives it to you, and the connection closes (HTTP).
**In this project:** We use **WebSockets (WS)**. It's like a phone call that stays open.
- The browser and server stay connected.
- When you type a message, it’s sent *instantly* through the "open pipe."
- No need to refresh the page to see new messages.

## 2. End-to-End Encryption (E2EE)
**Concept:** This is the most important part. "End-to-End" means only the people at the ends of the conversation (you and your friend) can read it.
**How we did it:**
- When you join a room, your browser takes the **Room Password** and turns it into a secret "Encryption Key" using an algorithm called **SHA-256**.
- **The Encryption:** Every message you send is scrambled using **AES-256-GCM** (the same standard the government uses).
- **The Scrambled Text:** The server only sees random gibberish like `vGk2/9...`. 
- **The Decryption:** Your friend’s browser has the same password, so it can unscramble the gibberish back into a normal message.

## 3. The "Blind" Server
**Concept:** We designed the server to be "blind."
- The server (FastAPI) acts like a postman who is forbidden from opening the letters.
- It doesn't save messages to a database.
- It doesn't know the room password (it only uses it to verify if you can join, but never for decryption).
- If the server is hacked, the hacker finds **zero** chat history.

## 4. Room Creation & Verification
- **Creation:** The first person to enter a room ID (e.g., `jeet-secret`) sets the password for that room.
- **Verification:** The server saves that password in its memory. Anyone else trying to join `jeet-secret` must provide that exact password.
- **Privacy:** This makes sure only people who know the "secret handshake" (password) can enter the room.

## 5. Security Terms to Remember:
1. **AES-GCM:** The "lock" we use for messages.
2. **WebSocket:** The "tunnel" the messages travel through.
3. **FastAPI:** The "engine" running the server.
4. **SubtleCrypto:** The "security expert" built into your browser that does the heavy math.
