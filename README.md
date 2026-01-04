# � SecureChat - End-to-End Encrypted Messaging

A modern, secure, end-to-end encrypted chat application with a clean Telegram/WhatsApp-inspired interface.

## ✨ Features

- � **End-to-End Encryption** - AES-GCM encryption for all messages
- 🎨 **Modern UI** - Clean, professional Telegram/WhatsApp/Signal aesthetic
- 🌙 **Dark/Light Mode** - Toggle between themes
- 💬 **Real-time Messaging** - WebSocket-based instant messaging
- 📱 **Responsive Design** - Works on desktop and mobile
- 🔔 **Push Notifications** - Get notified when messages arrive
- ↩️ **Message Threading** - Reply to specific messages
- ✏️ **Edit Messages** - Double-click your messages to edit them
- ⌨️ **Typing Indicators** - See when others are typing
- 🔍 **Search** - Find chats quickly
- 💾 **Data Export** - Export your data anytime
- 🔑 **Account Recovery** - Recovery key system for lost passwords

## 🚀 Quick Start

### Prerequisites

- Python 3.8 or higher
- Modern web browser (Chrome, Firefox, Safari, Edge)

### Installation

1. **Install Dependencies**
   ```bash
   pip install fastapi uvicorn python-multipart websockets passlib[bcrypt] slowapi
   ```

2. **Start the Server**
   ```bash
   ./start.sh
   ```
   
   Or manually:
   ```bash
   export DEV_MODE=1
   python3 server/main.py
   ```

3. **Open Your Browser**
   Navigate to: `http://localhost:8000`

## 📖 How to Use

### Creating an Account

1. Open the app in your browser
2. Click **"Sign up"**
3. Choose a username (3+ characters, letters/numbers/-/_)
4. Create a strong password:
   - Minimum 12 characters
   - Must include: uppercase, lowercase, number, special character
5. **IMPORTANT**: Save your recovery key! This is the ONLY way to recover your account

### Joining a Chat Room

1. Click **"New Chat"** button
2. Enter a room ID (or click "Generate Random ID")
3. Create a room password (min 8 characters)
4. Click **"Join Room"**

**Important**: The room password is used for encryption. Everyone joining the room must use the SAME password to decrypt messages.

### Sending Messages

- Type your message in the input box at the bottom
- Press **Enter** or click the send button
- Messages are automatically encrypted before sending

### Advanced Features

- **Reply to Message**: Right-click any message to reply
- **Edit Message**: Double-click your own messages to edit
- **Search Chats**: Use the search bar at the top of the sidebar
- **Change Theme**: Click the 🌓 icon in the header
- **Export Data**: Settings → Export My Data
- **Delete Account**: Settings → Delete Account (permanent!)

## 🔒 Security Features

### What's Protected

✅ **End-to-End Encryption** - Messages encrypted with AES-GCM  
✅ **Secure Sessions** - HttpOnly cookies with SameSite protection  
✅ **Rate Limiting** - Protection against spam and brute force  
✅ **Input Sanitization** - All inputs validated and sanitized  
✅ **Password Hashing** - Bcrypt with salt (12 rounds)  
✅ **Daily Backups** - Automated database backups (7-day retention)  
✅ **Comprehensive Logging** - All operations logged for security audit  

### What's NOT Protected (Current Limitations)

⚠️ **Database Encryption at Rest** - SQLite database is not encrypted on disk  
⚠️ **Email Verification** - No email verification (use strong passwords!)  
⚠️ **Scalability** - SQLite limits to ~100-200 concurrent users  

**Recommendation**: Use this for private/beta testing. For production, see the deployment guide.

## 🏗️ Architecture

```
SecureChat/
├── server/
│   └── main.py          # FastAPI backend with WebSocket support
├── static/
│   ├── index.html       # Frontend UI
│   ├── style.css        # Telegram-inspired styling
│   └── script.js        # Client-side logic & encryption
├── docs/
│   ├── BRUTAL_AUDIT_V2.md      # Security audit
│   └── COMPLETION_REPORT.md    # Implementation status
├── logs/
│   └── securechat.log   # Server logs (auto-created)
├── backups/
│   └── database_backup_*.db    # Daily backups (auto-created)
├── database.db          # SQLite database
└── start.sh             # Quick start script
```

## �️ Configuration

### Environment Variables

- `DEV_MODE=1` - Enable development mode (disable HTTPS redirect)
- `PORT=8000` - Server port (default: 8000)
- `ALLOWED_ORIGINS=https://example.com` - CORS allowed origins (production)

### Production Deployment

#### Railway Deployment (Recommended)

SecureChat is ready to be deployed on [Railway](https://railway.app/).

1. **Connect your GitHub repo** to Railway.
2. **Environment Variables**: Add the following in Railway's variables tab:
   - `DATABASE_PATH`: `/app/data/database.db`
   - `ALLOWED_ORIGINS`: `https://your-railway-url.up.railway.app`
3. **Mount a Volume**:
   - Go to your service settings in Railway.
   - Add a **Volume**.
   - Set the mount path to `/app/data`.
   - This ensures your `database.db` persists across deployments.
4. Railway will automatically detect the `Procfile` and use it to start the service.

#### Manual Production Deployment

For production use, you **must**:

1. **Enable HTTPS**:
   - Remove `DEV_MODE` environment variable
   - Configure SSL certificates with uvicorn
   - Set up reverse proxy (nginx/Apache)

2. **Secure the Database**:
   - Migrate to PostgreSQL for scale
   - Or use SQLCipher for encrypted SQLite
   - Or encrypt the filesystem/volume

3. **Set Allowed Origins**:
   ```bash
   export ALLOWED_ORIGINS=https://yourdomain.com
   ```

4. **Monitoring**:
   - Check `logs/securechat.log` regularly
   - Set up error tracking (Sentry)
   - Monitor server resources

## 📊 Performance

### Current Capabilities

- **Max Concurrent Users**: ~100-200 (SQLite limitation)
- **Message Throughput**: ~1000 messages/second
- **WebSocket Connections**: 50 per room (configurable)
- **Message Buffer**: 100 messages per room (prevents memory leaks)
- **Database Size**: Works well up to ~10GB

### Optimization Tips

1. **Use PostgreSQL** for >500 concurrent users
2. **Enable Redis** for session management at scale
3. **Set up CDN** for static assets
4. **Use connection pooling** for database
5. **Implement load balancing** for high availability

## 🧪 Testing

### Manual Testing

1. Open two browser windows (or incognito mode)
2. Create two accounts
3. Join the same room with same password
4. Send messages back and forth
5. Test reply, edit, and other features

### Key Test Scenarios

- ✅ Account registration with weak passwords (should fail)
- ✅ Login with wrong password (should fail)
- ✅ Joining room with wrong password (messages appear as [SEAL MISMATCH])
- ✅ Offline mode (disconnect network, should show offline banner)
- ✅ Message encryption (open dev tools, check WebSocket - should see encrypted text)
- ✅ Recovery key flow

## 📝 Changelog

### v2.0 (January 2026)
- ✅ Complete UI redesign (Telegram/WhatsApp aesthetic)
- ✅ Added password strength requirements (12+ chars)
- ✅ Implemented automated daily backups
- ✅ Added comprehensive logging system
- ✅ Fixed WebSocket memory leaks
- ✅ Implemented message threading/replies
- ✅ Added typing indicators
- ✅ Added push notifications
- ✅ Added dark/light theme toggle
- ✅ Improved error handling throughout
- ✅ Tightened rate limiting (3 registrations/hour)
- ✅ Added search functionality

## 🤝 Contributing

This is a personal project, but suggestions and bug reports are welcome!

### Found a Bug?

1. Check `logs/securechat.log` for errors
2. Try to reproduce in a clean environment
3. Report with steps to reproduce

### Security Issue?

If you find a security vulnerability, please report it privately via email rather than creating a public issue.

## 📄 License

This project is for educational and personal use.

## 🙏 Acknowledgments

- UI inspiration: Telegram, WhatsApp, Signal
- Icons: Unicode emoji
- Fonts: Inter (Google Fonts)
- Architecture: FastAPI, WebSockets, Web Crypto API

## 📞 Support

For questions or issues:
1. Check the `docs/BRUTAL_AUDIT_V2.md` for known issues
2. Review the `logs/securechat.log` file
3. Make sure you're running in DEV_MODE for local testing

---

**Built with ❤️ for privacy and security**

Last Updated: January 4, 2026
