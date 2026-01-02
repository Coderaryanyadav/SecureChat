# Future Enhancements & Strategic Roadmap

This document outlines high-level technical and functional improvements that can be implemented to transition SecureChat from a student project into a production-grade secure communication platform.

## 1. Cryptographic Advancements
*   **Perfect Forward Secrecy (PFS)**: Implement the **Double Ratchet Algorithm** (Signal Protocol). Currently, we use a static key per room; PFS would ensure that even if a key is compromised, previous and future messages remain unreadable.
*   **Zero-Knowledge Proofs (ZKP)**: Transition the login system to **SRP (Secure Remote Password)** protocol. This allows the user to authenticate without the server ever seeing even a hashed version of the password.
*   **Post-Quantum Cryptography**: Upgrade AES-GCM to 256-bit and explore lattice-based encryption to protect against future quantum computing threats.

## 2. Infrastructure & Scalability
*   **Decentralization (WebRTC)**: Transition from a WebSocket relay model to a **Peer-to-Peer (P2P)** mesh. This removes the "Man-in-the-Middle" (the server) for message delivery entirely.
*   **Redis Integration**: Use Redis for real-time presence heartbeats and pub/sub scaling, allowing the app to handle thousands of concurrent rooms across multiple server instances.
*   **PostgreSQL Migration**: Move from SQLite to PostgreSQL for better concurrency and data integrity for user account management.

## 3. Multimedia & Rich Features
*   **Voice/Video Tunneling**: Integrate **WebRTC** to allow encrypted voice and video calls within any room.
*   **Universal File Encryption**: Extend the current image-only encryption to support PDFs, Documents, and Archives, using **Streaming Encryption** for large files to prevent browser memory crashes.
*   **Encrypted Local Storage**: Optionally allow users to store a local "Persistent Vault" on their device using IndexedDB, encrypted with their account password.

## 4. User Experience (UX)
*   **Progressive Web App (PWA)**: Add a Web Manifest and Service Workers so the app can be installed on mobile devices and work offline.
*   **Message Reactions & Threading**: Add emoji reactions and the ability to reply to specific messages in a thread.
*   **Admin Controls**: Grant 'Room Ownership' to the creator, allowing them to kick/ban users or lock the room.

## 5. Security Auditing
*   **CSP (Content Security Policy)**: Implement strict CSP headers to prevent XSS attacks and unauthorized data exfiltration.
*   **Rate Limiting**: Add per-IP rate limiting to the API and WebSocket connections to mitigate automated brute-force attempts.

## 6. Blockchain & Web3 (Decentralized Identity)
*   **Web3 Login**: Replace traditional username/password with crypto-wallet signatures (Ethers.js/Metamask).
*   **Token Gating**: Use NFTs or Smart Contracts to control access to specific high-security rooms.
*   **On-Chain Audit Logs**: Hash message contents and store the digital fingerprints on the blockchain to guarantee data integrity.
*   **P2P libp2p Relay**: Transition from a central server to a Gossip-based peer-to-peer network.
