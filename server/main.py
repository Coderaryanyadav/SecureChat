import json
import os
import sqlite3
import asyncio
import uuid
import bcrypt
import logging
import re
import time
from datetime import datetime
from typing import Dict, List, Optional, Set
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

# NASA-Grade Logging Configuration
logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger("GhostOracle")

limiter = Limiter(key_func=get_remote_address)
app = FastAPI(title="GhostChat Oracle Prime")

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # TODO: Restrict in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# SECURITY: Add security headers
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:;"
    return response

# --- SECURITY UTILITIES ---
def sanitize_username(username: str) -> str:
    """Validate and sanitize username to prevent injection attacks"""
    if not username or not isinstance(username, str):
        raise ValueError("Invalid username")
    username = username.strip()[:50]  # Max 50 chars
    if not re.match(r'^[a-zA-Z0-9_-]+$', username):
        raise ValueError("Username must contain only letters, numbers, hyphens, and underscores")
    if len(username) < 3:
        raise ValueError("Username must be at least 3 characters")
    return username

def sanitize_room_id(room_id: str) -> str:
    """Validate and sanitize room ID to prevent injection attacks"""
    if not room_id or not isinstance(room_id, str):
        raise ValueError("Invalid room ID")
    room_id = room_id.strip()[:100]  # Max 100 chars
    if not re.match(r'^[a-zA-Z0-9_-]+$', room_id):
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

# --- FINTECH-GRADE SECURITY ---
def hash_password(p: str) -> str:
    return bcrypt.hashpw(p.encode('utf-8'), bcrypt.gensalt(12)).decode('utf-8')

def verify_password(p: str, h: str) -> bool:
    try: return bcrypt.checkpw(p.encode('utf-8'), h.encode('utf-8'))
    except: return False

def get_db():
    db = sqlite3.connect("database.db", check_same_thread=False)
    db.execute("PRAGMA journal_mode=WAL")
    db.row_factory = sqlite3.Row
    return db

def init_db():
    with get_db() as db:
        db.execute("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)")
        db.execute("CREATE TABLE IF NOT EXISTS history (user_id INTEGER, room_id TEXT, joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, room_id))")
        # SECURITY & PERFORMANCE: Add indexes
        db.execute("CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)")
        db.execute("CREATE INDEX IF NOT EXISTS idx_history_user_id ON history(user_id)")
        db.commit()

init_db()

# --- DIMENSION ORCHESTRATOR ---
class GhostDimension:
    def __init__(self, room_id: str, password: str, admin: str):
        self.room_id = room_id
        self.password = password
        self.admin = admin
        self.locked = False
        self.connections: Dict[WebSocket, str] = {}
        self.message_counts: Dict[WebSocket, List[float]] = {}  # For rate limiting

class DimensionRegistry:
    def __init__(self):
        self.rooms: Dict[str, GhostDimension] = {}
        self.MAX_PARTICIPANTS = 50  # Limit per dimension

    async def broadcast(self, room_id: str, data: dict, exclude: Optional[WebSocket] = None):
        if room_id in self.rooms:
            room = self.rooms[room_id]
            for ws in list(room.connections.keys()):
                if ws == exclude: continue
                try: await ws.send_json(data)
                except: await self.leave(ws, room_id)

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

        if any(u == user for u in room.connections.values()):
            await ws.send_json({"type": "error", "message": "Handle already manifest"})
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
                # Clear typing status for this user
                await self.broadcast(rid, {"type": "typing", "username": user, "status": False}, exclude=ws)
                
                if not room.connections: self.rooms.pop(rid)
                else:
                    if user == room.admin:
                        room.admin = next(iter(room.connections.values()))
                        await self.broadcast(rid, {"type": "system", "content": f"Guardian vanished. New Guardian: {room.admin}"})
                    await self.broadcast_user_list(rid)
                    await self.broadcast(rid, {"type": "system", "content": f"{user} vanished."})

    async def broadcast_user_list(self, rid: str):
        if rid in self.rooms:
            room = self.rooms[rid]
            await self.broadcast(rid, {"type": "user_list", "users": list(room.connections.values()), "admin": room.admin, "is_locked": room.locked})

    async def check_rate_limit(self, ws: WebSocket, rid: str) -> bool:
        """Prevent spamming phantoms from crashing the dimension"""
        room = self.rooms.get(rid)
        if not room: return True
        
        now = time.time()
        if ws not in room.message_counts:
            room.message_counts[ws] = []
        
        # Keep only timestamps from the last 10 seconds
        room.message_counts[ws] = [t for t in room.message_counts[ws] if now - t < 10]
        
        if len(room.message_counts[ws]) > 30:  # Max 30 messages per 10 seconds
            return False
            
        room.message_counts[ws].append(now)
        return True

registry = DimensionRegistry()

# --- API ---
@app.post("/api/register")
@limiter.limit("5/minute")
async def register(request: Request, d: dict):
    try:
        # SECURITY: Input validation
        u = sanitize_username(d.get("username", ""))
        p = validate_password(d.get("password", ""))
    except ValueError as e:
        return JSONResponse({"status": "fail", "msg": str(e)}, status_code=400)
    
    with get_db() as db:
        if db.execute("SELECT 1 FROM users WHERE username = ?", (u,)).fetchone():
            return {"status": "fail", "msg": "ID taken"}
        db.execute("INSERT INTO users (username, password) VALUES (?, ?)", (u, hash_password(p)))
        db.commit()
        logger.info(f"New user registered: {u}")
    return {"status": "ok"}

@app.post("/api/login")
@limiter.limit("10/minute")
async def login(request: Request, d: dict):
    try:
        # SECURITY: Input validation
        u = sanitize_username(d.get("username", ""))
        p = validate_password(d.get("password", ""))
    except ValueError as e:
        return JSONResponse({"status": "fail", "msg": str(e)}, status_code=400)
    
    with get_db() as db:
        res = db.execute("SELECT * FROM users WHERE username = ?", (u,)).fetchone()
        if res and verify_password(p, res['password']):
            logger.info(f"User logged in: {u}")
            return {"status": "ok", "user_id": res['id']}
    
    logger.warning(f"Failed login attempt for: {u}")
    return JSONResponse({"status": "fail", "msg": "Invalid credentials"}, status_code=401)

@app.post("/api/save-room")
@limiter.limit("30/minute")
async def save_room(request: Request, d: dict):
    try:
        # SECURITY: Validate inputs to prevent SQL injection
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
        res = db.execute("SELECT room_id FROM history WHERE user_id = ?", (uid,)).fetchall()
        return [r['room_id'] for r in res]

@app.get("/health")
async def health_check():
    """NASA-Grade Health Check"""
    try:
        with get_db() as db:
            db.execute("SELECT 1")
        return {"status": "healthy", "timestamp": datetime.now().isoformat(), "version": "1.1.0"}
    except Exception as e:
        logger.error(f"Health check failed: {str(e)}")
        return JSONResponse({"status": "unhealthy", "error": str(e)}, status_code=503)

@app.post("/api/verify-room")
@limiter.limit("20/minute")
async def verify_room(request: Request, d: dict):
    try:
        room_id = sanitize_room_id(d.get("room_id", ""))
        password = validate_password(d.get("password", ""))
    except ValueError as e:
        return JSONResponse({"status": "fail", "msg": str(e)}, status_code=400)
    
    room = registry.rooms.get(room_id)
    if not room or room.password == password:
        return {"status": "ok"}
    return JSONResponse({"status": "fail", "msg": "Incorrect seal"}, status_code=403)

# --- SOCKET ---
async def destruct(rid, mid):
    await asyncio.sleep(30)
    await registry.broadcast(rid, {"type": "delete_msg", "id": mid})

@app.websocket("/ws/{rid}/{user}")
async def websocket_endpoint(ws: WebSocket, rid: str, user: str, pwd: str = Query("")):
    await ws.accept()
    if not await registry.join(ws, rid, user, pwd): return
    try:
        while True:
            d = await ws.receive_json()
            
            # SECURITY: Rate Limiting
            if not await registry.check_rate_limit(ws, rid):
                await ws.send_json({"type": "error", "message": "Oracle Rate Limit Exceeded. Slow down, phantom."})
                continue

            t = d.get("type")
            room = registry.rooms.get(rid)
            is_adm = room and room.admin == user
            
            if t == "typing": await registry.broadcast(rid, {"type": "typing", "username": user, "status": d.get("status")}, exclude=ws)
            elif t == "kick" and is_adm: await registry.broadcast(rid, {"type": "kicked", "target": d.get("target")})
            elif t == "wipe" and is_adm: await registry.broadcast(rid, {"type": "wipe_all"})
            elif t == "lock" and is_adm: room.locked = True; await registry.broadcast_user_list(rid)
            elif t == "unlock" and is_adm: room.locked = False; await registry.broadcast_user_list(rid)
            elif t == "delete_request": # PHASE 2: Black Hole request
                 await registry.broadcast(rid, {"type": "delete_msg", "id": d.get("id")})
            elif t in ["message", "image", "file", "reaction"]:
                mid = str(uuid.uuid4())
                d.update({"id": mid, "username": user, "timestamp": datetime.now().isoformat()})
                await registry.broadcast(rid, d)
                if d.get("self_destruct"): asyncio.create_task(destruct(rid, mid))
    except: await registry.leave(ws, rid)

@app.on_event("shutdown")
async def shutdown_event():
    """Graceful Shutdown: Notify all active phantoms before the void closes"""
    logger.info("Oracle shutting down. Dismissing all phantoms...")
    for rid, room in registry.rooms.items():
        await registry.broadcast(rid, {"type": "system", "content": "The void is collapsing for maintenance. Reconnect shortly."})
    await asyncio.sleep(1) # Small window for broadcast

app.mount("/", StaticFiles(directory=os.path.join(os.path.dirname(__file__), "..", "static"), html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
