import json
import os
import sqlite3
import asyncio
import uuid
import bcrypt
import logging
from logging.handlers import RotatingFileHandler
import re
import time
from datetime import datetime
from typing import Dict, List, Optional
import secrets
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, Request, Query, HTTPException, Response
from fastapi.responses import JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

# ===== LOGGING SETUP =====
handlers = [logging.StreamHandler()]
if not os.getenv("VERCEL"):
    try:
        os.makedirs('logs', exist_ok=True)
        handlers.append(RotatingFileHandler('logs/securechat.log', maxBytes=10*1024*1024, backupCount=5))
    except Exception:
        pass

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
    handlers=handlers
)
logger = logging.getLogger("SecureChat")

# Rate limiting
limiter = Limiter(key_func=get_remote_address)

# --- DATABASE SETUP ---
def get_db():
    if os.getenv("VERCEL"):
        db_path = os.getenv("DATABASE_PATH", "/tmp/database.db")
    else:
        db_path = os.getenv("DATABASE_PATH", "database.db")
    db = sqlite3.connect(db_path, check_same_thread=False)
    try:
        db.execute("PRAGMA journal_mode=WAL")
    except Exception:
        pass
    db.row_factory = sqlite3.Row
    return db

def init_db():
    """Initialize database with proper indexes and tables"""
    with get_db() as db:
        db.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE,
                password TEXT,
                recovery_key TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        db.execute("""
            CREATE TABLE IF NOT EXISTS history (
                user_id INTEGER,
                room_id TEXT,
                joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, room_id)
            )
        """)
        db.execute("""
            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                room_id TEXT,
                sender TEXT,
                content TEXT,
                msg_type TEXT,
                timestamp TEXT,
                reply_to TEXT
            )
        """)
        db.execute("""
            CREATE TABLE IF NOT EXISTS room_members (
                room_id TEXT,
                username TEXT,
                last_seen REAL,
                PRIMARY KEY(room_id, username)
            )
        """)
        db.execute("CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)")
        db.execute("CREATE INDEX IF NOT EXISTS idx_history_user_id ON history(user_id)")
        db.execute("CREATE INDEX IF NOT EXISTS idx_messages_room_timestamp ON messages(room_id, timestamp)")
        db.commit()
    logger.info("Database initialized successfully")

# ===== BACKUP SYSTEM =====
async def backup_database():
    """Automated daily database backup with rotation (for persistent servers)"""
    if os.getenv("VERCEL"):
        return
    import shutil
    while True:
        try:
            await asyncio.sleep(86400)
            os.makedirs('backups', exist_ok=True)
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            backup_file = f'backups/database_backup_{timestamp}.db'
            db_path = os.getenv("DATABASE_PATH", "database.db")
            if os.path.exists(db_path):
                shutil.copy2(db_path, backup_file)
                logger.info(f"Database backed up to {backup_file}")
            
            import glob
            backups = sorted(glob.glob('backups/database_backup_*.db'))
            if len(backups) > 7:
                for old_backup in backups[:-7]:
                    try:
                        os.remove(old_backup)
                    except Exception:
                        pass
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"Backup failed: {e}")

# ===== LIFESPAN MANAGEMENT =====
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("SecureChat server starting...")
    init_db()
    backup_task = None
    if not os.getenv("VERCEL"):
        backup_task = asyncio.create_task(backup_database())
    yield
    if backup_task:
        backup_task.cancel()
    logger.info("SecureChat server shutting down...")
    for rid, room in registry.rooms.items():
        try:
            await registry.broadcast(rid, {"type": "system", "content": "Server restarting. Reconnecting..."})
        except Exception:
            pass

app = FastAPI(title="SecureChat Oracle", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS Configuration
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "*").split(",") if os.getenv("ALLOWED_ORIGINS") else ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Security Headers
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response

# --- SECURITY UTILITIES ---
def sanitize_username(username: str) -> str:
    """Validate and sanitize username to prevent injection attacks"""
    if not username or not isinstance(username, str):
        raise ValueError("Invalid username")
    username = username.strip()[:50].lower()
    if not re.match(r'^[a-z0-9_-]+$', username):
        raise ValueError("Username must contain only letters, numbers, hyphens, and underscores")
    if len(username) < 3:
        raise ValueError("Username must be at least 3 characters")
    return username

def sanitize_room_id(room_id: str) -> str:
    """Validate and sanitize room ID to prevent injection attacks"""
    if not room_id or not isinstance(room_id, str):
        raise ValueError("Invalid room ID")
    room_id = room_id.strip()[:100].lower()
    if not re.match(r'^[a-z0-9_-]+$', room_id):
        raise ValueError("Room ID must contain only letters, numbers, hyphens, and underscores")
    return room_id

def validate_password(password: str) -> str:
    """Validate password strength"""
    if not password or not isinstance(password, str):
        raise ValueError("Invalid password")
    if len(password) < 8:
        raise ValueError("Password must be at least 8 characters")
    if len(password) > 128:
        raise ValueError("Password too long")
    return password

def hash_password(p: str) -> str:
    return bcrypt.hashpw(p.encode('utf-8'), bcrypt.gensalt(12)).decode('utf-8')

def verify_password(p: str, h: str) -> bool:
    try:
        return bcrypt.checkpw(p.encode('utf-8'), h.encode('utf-8'))
    except Exception:
        return False

# Ensure DB initialized on module import
init_db()

# ===== MESSAGE TYPE CONSTANTS =====
class MessageTypes:
    MESSAGE = "message"
    IMAGE = "image"
    FILE = "file"
    TYPING = "typing"
    USER_LIST = "user_list"
    DELETE_MSG = "delete_msg"
    EDIT_MSG = "edit_msg"
    WIPE_ALL = "wipe_all"
    KICKED = "kicked"
    ERROR = "error"
    SYSTEM = "system"

# --- DIMENSION ORCHESTRATOR ---
class GhostDimension:
    MAX_MESSAGES_IN_MEMORY = 100
    
    def __init__(self, room_id: str, password: str, admin: str):
        self.room_id = room_id
        self.password = password
        self.admin = admin
        self.locked = False
        self.connections: Dict[WebSocket, str] = {}
        self.message_counts: Dict[WebSocket, List[float]] = {}
        self.recent_messages: List[dict] = []

class DimensionRegistry:
    def __init__(self):
        self.rooms: Dict[str, GhostDimension] = {}
        self.MAX_PARTICIPANTS = 50
        self._tokens: Dict[str, dict] = {}

    def generate_handshake_token(self, uid: int, user: str) -> str:
        token = secrets.token_urlsafe(32)
        expires = time.time() + 60
        self._tokens[token] = {"uid": uid, "user": user, "expires": expires}
        return token

    def verify_handshake_token(self, token: str) -> Optional[dict]:
        data = self._tokens.pop(token, None)
        if data and data['expires'] > time.time():
            return data
        return None

    async def broadcast(self, room_id: str, data: dict, exclude: Optional[WebSocket] = None):
        if room_id in self.rooms:
            room = self.rooms[room_id]
            if data.get("type") in [MessageTypes.MESSAGE, MessageTypes.IMAGE, MessageTypes.FILE]:
                room.recent_messages.append(data)
                if len(room.recent_messages) > GhostDimension.MAX_MESSAGES_IN_MEMORY:
                    room.recent_messages = room.recent_messages[-GhostDimension.MAX_MESSAGES_IN_MEMORY:]
            
            for ws in list(room.connections.keys()):
                if ws == exclude:
                    continue
                try:
                    await ws.send_json(data)
                except Exception:
                    await self.leave(ws, room_id)

    async def join(self, ws: WebSocket, rid: str, user: str, pwd: str) -> bool:
        room = self.rooms.get(rid)
        if room and (room.locked or room.password != pwd):
            msg = "Dimension Sealed" if room.locked else "Incorrect Seal"
            await ws.send_json({"type": "error", "message": msg})
            return False
        if not room:
            room = self.rooms[rid] = GhostDimension(rid, pwd, user)
        
        if len(room.connections) >= self.MAX_PARTICIPANTS:
            await ws.send_json({"type": "error", "message": "Dimension at Maximum Capacity"})
            return False

        room.connections[ws] = user
        await self.broadcast_user_list(rid)
        await self.broadcast(rid, {"type": "system", "content": f"{user} manifest. Guardian: {room.admin}"})
        return True

    async def leave(self, ws: WebSocket, rid: str):
        if rid in self.rooms:
            room = self.rooms[rid]
            if ws in room.connections:
                user = room.connections.pop(ws)
                await self.broadcast(rid, {"type": "typing", "username": user, "status": False}, exclude=ws)
                if not room.connections:
                    self.rooms.pop(rid, None)
                else:
                    if user == room.admin:
                        room.admin = next(iter(room.connections.values()))
                        await self.broadcast(rid, {"type": "system", "content": f"Guardian changed to: {room.admin}"})
                    await self.broadcast_user_list(rid)
                    await self.broadcast(rid, {"type": "system", "content": f"{user} disconnected."})

    async def broadcast_user_list(self, rid: str):
        if rid in self.rooms:
            room = self.rooms[rid]
            await self.broadcast(rid, {"type": "user_list", "users": list(room.connections.values()), "admin": room.admin, "is_locked": room.locked})

    async def check_rate_limit(self, ws: WebSocket, rid: str) -> bool:
        room = self.rooms.get(rid)
        if not room:
            return True
        now = time.time()
        if ws not in room.message_counts:
            room.message_counts[ws] = []
        room.message_counts[ws] = [t for t in room.message_counts[ws] if now - t < 10]
        if len(room.message_counts[ws]) > 30:
            return False
        room.message_counts[ws].append(now)
        return True

registry = DimensionRegistry()

# --- REST APIS ---
@app.post("/api/register")
@limiter.limit("15/hour")
async def register(request: Request, d: dict):
    try:
        u = sanitize_username(d.get("username", ""))
        p = validate_password(d.get("password", ""))
    except ValueError as e:
        return JSONResponse({"status": "fail", "msg": str(e)}, status_code=400)
    
    recovery_key = secrets.token_hex(16)
    with get_db() as db:
        if db.execute("SELECT 1 FROM users WHERE username = ?", (u,)).fetchone():
            return JSONResponse({"status": "fail", "msg": "Username already taken"}, status_code=409)
        db.execute("INSERT INTO users (username, password, recovery_key) VALUES (?, ?, ?)", (u, hash_password(p), recovery_key))
        db.commit()
        logger.info(f"New user registered: {u}")
    return {"status": "ok", "recovery_key": recovery_key}

@app.post("/api/login")
@limiter.limit("30/minute")
async def login(request: Request, d: dict, response: Response):
    try:
        u = sanitize_username(d.get("username", ""))
        p = validate_password(d.get("password", ""))
    except ValueError as e:
        return JSONResponse({"status": "fail", "msg": str(e)}, status_code=400)
    
    with get_db() as db:
        res = db.execute("SELECT * FROM users WHERE username = ?", (u,)).fetchone()
        if res and verify_password(p, res['password']):
            logger.info(f"User logged in: {u}")
            response.set_cookie(key="ghost_session", value=str(res['id']), httponly=True, samesite="lax")
            return {"status": "ok", "user_id": res['id'], "username": u}
    
    return JSONResponse({"status": "fail", "msg": "Invalid credentials"}, status_code=401)

@app.post("/api/logout")
async def logout(response: Response):
    response.delete_cookie(key="ghost_session")
    return {"status": "ok"}

@app.post("/api/delete-account")
async def delete_account(request: Request):
    uid = request.cookies.get("ghost_session")
    if not uid:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    with get_db() as db:
        db.execute("DELETE FROM users WHERE id = ?", (uid,))
        db.execute("DELETE FROM history WHERE user_id = ?", (uid,))
        db.commit()
    
    response = JSONResponse({"status": "ok"})
    response.delete_cookie(key="ghost_session")
    return response

@app.post("/api/recover")
async def recover_account(d: dict):
    u = d.get("username")
    rk = d.get("recovery_key")
    np = d.get("new_password")
    
    try:
        u = sanitize_username(u)
        np = validate_password(np)
    except ValueError as e:
        return JSONResponse({"status": "fail", "msg": str(e)}, status_code=400)
    
    with get_db() as db:
        res = db.execute("SELECT * FROM users WHERE username = ? AND recovery_key = ?", (u, rk)).fetchone()
        if res:
            db.execute("UPDATE users SET password = ? WHERE id = ?", (hash_password(np), res['id']))
            db.commit()
            return {"status": "ok"}
    return JSONResponse({"status": "fail", "msg": "Invalid recovery key or username"}, status_code=401)

@app.post("/api/save-room")
@limiter.limit("60/minute")
async def save_room(request: Request, d: dict):
    try:
        user_id = int(d.get("user_id", 0))
        room_id = sanitize_room_id(d.get("room_id", ""))
        if user_id <= 0:
            raise HTTPException(400, "Invalid user ID")
        
        with get_db() as db:
            db.execute("INSERT OR IGNORE INTO history (user_id, room_id) VALUES (?, ?)", (user_id, room_id))
            db.commit()
        return {"status": "ok"}
    except (ValueError, TypeError) as e:
        raise HTTPException(400, f"Invalid input: {str(e)}")

@app.get("/api/history/{uid}")
async def get_history(uid: int):
    with get_db() as db:
        res = db.execute("SELECT room_id FROM history WHERE user_id = ? ORDER BY joined_at DESC", (uid,)).fetchall()
        return [r['room_id'] for r in res]

@app.api_route("/health", methods=["GET", "HEAD"])
async def health_check():
    try:
        with get_db() as db:
            db.execute("SELECT 1")
        return {"status": "healthy", "timestamp": datetime.now().isoformat(), "version": "3.5.0"}
    except Exception as e:
        logger.error(f"Health check failed: {str(e)}")
        return JSONResponse({"status": "unhealthy", "error": str(e)}, status_code=503)

@app.post("/api/verify-room")
@limiter.limit("30/minute")
async def verify_room(request: Request, d: dict):
    try:
        room_id = sanitize_room_id(d.get("room_id", ""))
        password = validate_password(d.get("password", ""))
    except ValueError as e:
        return JSONResponse({"status": "fail", "msg": str(e)}, status_code=400)
    
    room = registry.rooms.get(room_id)
    if not room or room.password == password:
        return {"status": "ok"}
    return JSONResponse({"status": "fail", "msg": "Incorrect room password"}, status_code=403)

@app.get("/api/ws-token")
async def get_ws_token(request: Request):
    uid = request.cookies.get("ghost_session")
    user = None
    if uid:
        with get_db() as db:
            res = db.execute("SELECT username FROM users WHERE id = ?", (uid,)).fetchone()
            if res:
                user = res['username']
    
    # Allow fallback token generation if username query passed
    if not user:
        u_param = request.query_params.get("user")
        if u_param:
            try:
                user = sanitize_username(u_param)
                uid = 0
            except Exception:
                pass
    
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
        
    token = registry.generate_handshake_token(int(uid or 0), user)
    return {"token": token}

# --- SERVERLESS HTTP REAL-TIME ENDPOINTS ---
@app.get("/api/rooms/{rid}/messages")
async def get_room_messages(request: Request, rid: str, since: Optional[str] = None, user: Optional[str] = None):
    try:
        rid = sanitize_room_id(rid)
    except ValueError as e:
        return JSONResponse({"status": "fail", "msg": str(e)}, status_code=400)
    
    now = time.time()
    with get_db() as db:
        if user:
            try:
                user_clean = sanitize_username(user)
                db.execute("INSERT OR REPLACE INTO room_members (room_id, username, last_seen) VALUES (?, ?, ?)", (rid, user_clean, now))
                db.commit()
            except Exception:
                pass
        
        # Clean up members unseen for 30s
        db.execute("DELETE FROM room_members WHERE last_seen < ?", (now - 30,))
        db.commit()
        
        members_res = db.execute("SELECT username FROM room_members WHERE room_id = ? ORDER BY username ASC", (rid,)).fetchall()
        active_members = [r['username'] for r in members_res]
        
        if rid in registry.rooms:
            ws_users = list(registry.rooms[rid].connections.values())
            active_members = sorted(list(set(active_members + ws_users)))
        
        if since:
            rows = db.execute("SELECT * FROM messages WHERE room_id = ? AND timestamp > ? ORDER BY timestamp ASC LIMIT 50", (rid, since)).fetchall()
        else:
            rows = db.execute("SELECT * FROM messages WHERE room_id = ? ORDER BY timestamp DESC LIMIT 50", (rid,)).fetchall()
            rows = list(reversed(rows))
            
        messages = []
        for r in rows:
            content_val = r['content']
            try:
                if content_val and content_val.startswith('{') and content_val.endswith('}'):
                    content_val = json.loads(content_val)
            except Exception:
                pass
            messages.append({
                "id": r['id'],
                "room": r['room_id'],
                "sender": r['sender'],
                "content": content_val,
                "type": r['msg_type'],
                "timestamp": r['timestamp'],
                "reply_to": r['reply_to']
            })
        
        return {
            "status": "ok",
            "room": rid,
            "messages": messages,
            "members": active_members
        }

@app.post("/api/rooms/{rid}/messages")
@limiter.limit("120/minute")
async def post_room_message(request: Request, rid: str, d: dict):
    try:
        rid = sanitize_room_id(rid)
        sender = sanitize_username(d.get("sender", ""))
    except ValueError as e:
        return JSONResponse({"status": "fail", "msg": str(e)}, status_code=400)
    
    content = d.get("content")
    if not content:
        return JSONResponse({"status": "fail", "msg": "Empty message"}, status_code=400)
    
    mid = d.get("id") or str(uuid.uuid4())
    msg_type = d.get("type", "message")
    reply_to = d.get("reply_to")
    ts = d.get("timestamp") or datetime.now().isoformat()
    
    content_str = json.dumps(content) if isinstance(content, dict) else str(content)
    
    with get_db() as db:
        db.execute(
            "INSERT OR REPLACE INTO messages (id, room_id, sender, content, msg_type, timestamp, reply_to) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (mid, rid, sender, content_str, msg_type, ts, reply_to)
        )
        db.execute("INSERT OR REPLACE INTO room_members (room_id, username, last_seen) VALUES (?, ?, ?)", (rid, sender, time.time()))
        db.commit()
    
    msg_dict = {
        "id": mid,
        "room": rid,
        "sender": sender,
        "content": content,
        "type": msg_type,
        "timestamp": ts,
        "reply_to": reply_to
    }
    await registry.broadcast(rid, msg_dict)
    
    return {"status": "ok", "message": msg_dict}

@app.get("/api/export")
async def export_data(request: Request):
    uid = request.cookies.get("ghost_session")
    if not uid:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    with get_db() as db:
        user_row = db.execute("SELECT id, username, created_at FROM users WHERE id = ?", (uid,)).fetchone()
        if not user_row:
            raise HTTPException(status_code=401, detail="User not found")
        
        history_rows = db.execute("SELECT room_id, joined_at FROM history WHERE user_id = ?", (uid,)).fetchall()
        rooms = [r['room_id'] for r in history_rows]
        
        return {
            "user": {
                "id": user_row['id'],
                "username": user_row['username'],
                "created_at": user_row['created_at']
            },
            "rooms": rooms,
            "export_time": datetime.now().isoformat()
        }

# --- SOCKET (FOR LOCAL DEV & PERSISTENT DEPLOYMENTS) ---
async def destruct(rid, mid):
    await asyncio.sleep(30)
    await registry.broadcast(rid, {"type": "delete_msg", "id": mid})
    with get_db() as db:
        db.execute("DELETE FROM messages WHERE id = ?", (mid,))
        db.commit()

@app.websocket("/ws/{rid}/{user}")
async def websocket_endpoint(ws: WebSocket, rid: str, user: str, pwd: str = Query(""), token: str = Query("")):
    await ws.accept()
    
    token_data = registry.verify_handshake_token(token)
    if not token_data or token_data['user'] != user:
        await ws.send_json({"type": "error", "message": "Portal Token Expired or Invalid"})
        await ws.close()
        return

    if not await registry.join(ws, rid, user, pwd):
        return
    try:
        while True:
            d = await ws.receive_json()
            if not await registry.check_rate_limit(ws, rid):
                await ws.send_json({"type": "error", "message": "Rate limit exceeded. Slow down."})
                continue

            t = d.get("type")
            room = registry.rooms.get(rid)
            is_adm = room and room.admin == user
            
            if t == "typing":
                await registry.broadcast(rid, {"type": "typing", "username": user, "status": d.get("status")}, exclude=ws)
            elif t == "kick" and is_adm:
                await registry.broadcast(rid, {"type": "kicked", "target": d.get("target")})
            elif t == "wipe" and is_adm:
                await registry.broadcast(rid, {"type": "wipe_all"})
                with get_db() as db:
                    db.execute("DELETE FROM messages WHERE room_id = ?", (rid,))
                    db.commit()
            elif t == "lock" and is_adm:
                room.locked = True
                await registry.broadcast_user_list(rid)
            elif t == "unlock" and is_adm:
                room.locked = False
                await registry.broadcast_user_list(rid)
            elif t == "edit_msg":
                mid = d.get("id")
                await registry.broadcast(rid, {"type": "edit_msg", "id": mid, "content": d.get("content")})
            elif t in ["message", "image", "file", "reaction"]:
                mid = str(uuid.uuid4())
                ts = datetime.now().isoformat()
                d.update({
                    "id": mid, 
                    "username": user,
                    "sender": user,
                    "room": rid,
                    "timestamp": ts,
                    "reply_to": d.get("reply_to")
                })
                # Persist to database
                try:
                    c_val = d.get("content")
                    c_str = json.dumps(c_val) if isinstance(c_val, dict) else str(c_val)
                    with get_db() as db:
                        db.execute(
                            "INSERT OR REPLACE INTO messages (id, room_id, sender, content, msg_type, timestamp, reply_to) VALUES (?, ?, ?, ?, ?, ?, ?)",
                            (mid, rid, user, c_str, t, ts, d.get("reply_to"))
                        )
                        db.commit()
                except Exception as ex:
                    logger.error(f"Failed to persist ws message: {ex}")

                await registry.broadcast(rid, d)
                if d.get("self_destruct"):
                    asyncio.create_task(destruct(rid, mid))
    except Exception:
        await registry.leave(ws, rid)

# Serve static files
if os.path.exists("static"):
    app.mount("/static", StaticFiles(directory="static"), name="static")

@app.api_route("/", methods=["GET", "HEAD"])
async def read_root():
    if os.path.exists("static/index.html"):
        return FileResponse("static/index.html")
    return {"message": "SecureChat API is running"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
