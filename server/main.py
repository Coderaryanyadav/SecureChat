import json
import os
import sqlite3
import asyncio
import uuid
import bcrypt
import logging
from datetime import datetime
from typing import Dict, List, Optional, Set
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
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
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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

registry = DimensionRegistry()

# --- API ---
@app.post("/api/register")
@limiter.limit("5/minute")
async def register(request: Request, d: dict):
    u, p = d.get("username"), d.get("password")
    if not u or not p: return {"status": "fail", "msg": "Incomplete data"}
    with get_db() as db:
        if db.execute("SELECT 1 FROM users WHERE username = ?", (u,)).fetchone(): return {"status": "fail", "msg": "ID taken"}
        db.execute("INSERT INTO users (username, password) VALUES (?, ?)", (u, hash_password(p)))
        db.commit()
    return {"status": "ok"}

@app.post("/api/login")
@limiter.limit("10/minute")
async def login(request: Request, d: dict):
    u, p = d.get("username"), d.get("password")
    with get_db() as db:
        res = db.execute("SELECT * FROM users WHERE username = ?", (u,)).fetchone()
        if res and verify_password(p, res['password']): return {"status": "ok", "user_id": res['id']}
    return {"status": "fail", "msg": "Auth failure"}

@app.post("/api/save-room")
async def save_room(d: dict):
    with get_db() as db:
        db.execute("INSERT OR IGNORE INTO history (user_id, room_id) VALUES (?, ?)", (d.get("user_id"), d.get("room_id")))
        db.commit()
    return {"status": "ok"}

@app.get("/api/history/{uid}")
async def get_history(uid: int):
    with get_db() as db:
        res = db.execute("SELECT room_id FROM history WHERE user_id = ?", (uid,)).fetchall()
        return [r['room_id'] for r in res]

@app.post("/api/verify-room")
async def verify_room(d: dict):
    room = registry.rooms.get(d.get("room_id"))
    if not room or room.password == d.get("password"): return {"status": "ok"}
    return {"status": "fail", "msg": "Incorrect seal"}

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

app.mount("/", StaticFiles(directory=os.path.join(os.path.dirname(__file__), "..", "static"), html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
