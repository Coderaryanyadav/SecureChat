# Blockchain Integration Strategy for SecureChat

Integrating blockchain technology can transform SecureChat from a "Secure Relay" into a "Decentralized Autonomous Protocol." Here is the architectural roadmap.

## 1. Decentralized Authentication (Web3 Login)
*   **Implementation**: Replace the SQLite `users` table with a **Web3 Provider** (e.g., Ethers.js or Wagmi).
*   **Process**: Instead of a login form, the user clicks "Connect Wallet." They sign a cryptographic challenge to verify ownership of their public address.
*   **Security Benefit**: Users no longer trust our database with passwords. The private key remains on their hardware device.

## 2. Smart Contract Access Control (Token Gating)
*   **Implementation**: A Solidity contract on a Layer 2 (like Polygon or Arbitrum) stores "Room Permissions."
*   **Process**: When a user joins `viva-room`, the backend checks the blockchain (via Infura/Alchemy) to see if the user's wallet address holds a specific **ERC-1155 Token** or NFT. 
*   **Security Benefit**: Ownership is transparent and cannot be forged by a server administrator.

## 3. Immutable Transparency Logs (Message Hashing)
*   **Implementation**: We do NOT store messages on the blockchain (too expensive/slow). Instead, we store a **SHA-256 Hash** of the message content on-chain.
*   **Process**: 
    1. User sends an encrypted message.
    2. The message hash is sent to a Smart Contract.
    3. The contract emits an `Event` with the hash and a block-timestamp.
*   **Security Benefit**: This creates an immutable "Proof of Existence." If someone tries to edit a message later, their hash won't match the one on the blockchain.

## 4. Decentralized Relay (libp2p)
*   **Implementation**: Currently, we use a central FastAPI server. We can use the **libp2p** stack (the networking layer of IPFS and Ethereum) to allow clients to find each other and "gossip" messages directly.
*   **Security Benefit**: No single server point of failure. The government or a hacker cannot "shut down" the chat by hitting one IP address.

## 5. Incentive Layer (Chat-to-Earn)
*   **Implementation**: Deploy a native ERC-20 utility token (e.g., $SECURE).
*   **Process**: Users who host "Relay Nodes" or contribute to the network encryption receive small token rewards for every byte they process.
