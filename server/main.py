import json
import os
import sqlite3
import asyncio
import uuid
import bcrypt
from datetime import datetime
from typing import Dict, List
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

limiter = Limiter(key_func=get_remote_address)
app = FastAPI()
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))
    except:
        return False

def get_db():
    db = sqlite3.connect("database.db")
    db.row_factory = sqlite3.Row
    return db

def init_db():
    db = get_db()
    db.execute("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, username TEXT UNIQUE, password TEXT)")
    db.execute("CREATE TABLE IF NOT EXISTS history (user_id INTEGER, room_id TEXT, UNIQUE(user_id, room_id))")
    db.commit()

init_db()

class ChatHandler:
    def __init__(self):
        self.active_rooms = {}
        self.room_passwords = {}
        self.room_admins = {}

    def check_room(self, room_id, password):
        if room_id not in self.room_passwords:
            self.room_passwords[room_id] = password
            return True
        return self.room_passwords[room_id] == password

    async def join_room(self, websocket, room_id, username, password):
        if not self.check_room(room_id, password):
            await websocket.accept()
            await websocket.send_json({"type": "error", "message": "Incorrect Password!"})
            await websocket.close()
            return False

        await websocket.accept()
        
        if room_id not in self.active_rooms:
            self.active_rooms[room_id] = {}
            self.room_admins[room_id] = username
        
        if any(name == username for name in self.active_rooms[room_id].values()):
            await websocket.send_json({"type": "error", "message": "This name is already used!"})
            await websocket.close()
            return False

        self.active_rooms[room_id][websocket] = username
        
        await self.broadcast_user_list(room_id)
        await self.send_to_all(room_id, {
            "type": "system",
            "content": f"{username} joined. Admin is {self.room_admins[room_id]}",
            "timestamp": datetime.now().isoformat()
        })
        return True

    async def broadcast_user_list(self, room_id):
        if room_id in self.active_rooms:
            users = list(self.active_rooms[room_id].values())
            await self.send_to_all(room_id, {"type": "user_list", "users": users, "admin": self.room_admins.get(room_id)})

    def leave_room(self, websocket, room_id):
        name = None
        if room_id in self.active_rooms:
            if websocket in self.active_rooms[room_id]:
                name = self.active_rooms[room_id].pop(websocket)
                if not self.active_rooms[room_id]:
                    self.active_rooms.pop(room_id)
                    self.room_passwords.pop(room_id)
                    self.room_admins.pop(room_id)
        return name

    async def send_to_all(self, room_id, data):
        if room_id in self.active_rooms:
            for socket in list(self.active_rooms[room_id].keys()):
                try:
                    await socket.send_json(data)
                except:
                    self.leave_room(socket, room_id)

chat_manager = ChatHandler()

@app.post("/api/register")
@limiter.limit("5/minute")
async def register(request: Request, data: dict):
    user = data.get("username")
    pwd = data.get("password")
    if not user or not pwd: return {"status": "fail", "msg": "Missing data"}
    db = get_db()
    try:
        existing = db.execute("SELECT * FROM users WHERE username = ?", (user,)).fetchone()
        if existing:
            return {"status": "fail", "msg": "User already exists"}
        hashed = hash_password(pwd)
        db.execute("INSERT INTO users (username, password) VALUES (?, ?)", (user, hashed))
        db.commit()
        return {"status": "ok"}
    except Exception as e:
        print(f"REG ERROR: {e}")
        return {"status": "fail", "msg": "Spectral registration failed"}

@app.post("/api/login")
@limiter.limit("10/minute")
async def login(request: Request, data: dict):
    user = data.get("username")
    pwd = data.get("password")
    db = get_db()
    try:
        res = db.execute("SELECT * FROM users WHERE username = ?", (user,)).fetchone()
        if res and verify_password(pwd, res['password']):
            return {"status": "ok", "user_id": res['id']}
        return {"status": "fail", "msg": "Invalid credentials"}
    except Exception as e:
        print(f"LOGIN ERROR: {e}")
        return {"status": "fail", "msg": "Manifestation failed"}

@app.post("/api/save-room")
async def save_room(data: dict):
    uid, rid = data.get("user_id"), data.get("room_id")
    db = get_db()
    db.execute("INSERT OR IGNORE INTO history (user_id, room_id) VALUES (?, ?)", (uid, rid))
    db.commit()
    return {"status": "ok"}

@app.get("/api/history/{user_id}")
async def get_history(user_id: int):
    db = get_db()
    res = db.execute("SELECT room_id FROM history WHERE user_id = ?", (user_id,)).fetchall()
    return [r['room_id'] for r in res]

@app.post("/api/verify-room")
async def verify(data: dict):
    rid, pwd = data.get("room_id"), data.get("password")
    if chat_manager.check_room(rid, pwd): return {"status": "ok"}
    return {"status": "fail", "msg": "Portal key incorrect"}

async def schedule_destruct(room_id, msg_id):
    await asyncio.sleep(30)
    await chat_manager.send_to_all(room_id, {"type": "delete_msg", "id": msg_id})

@app.websocket("/ws/{room_id}/{username}")
async def socket_endpoint(websocket: WebSocket, room_id: str, username: str, pwd: str = ""):
    if await chat_manager.join_room(websocket, room_id, username, pwd):
        try:
            while True:
                data = await websocket.receive_json()
                m_type = data.get("type", "message")
                
                if m_type == "typing":
                    await chat_manager.send_to_all(room_id, {"type": "typing", "username": username, "status": data.get("status")})
                elif m_type == "kick":
                    if username == chat_manager.room_admins.get(room_id):
                        target = data.get("target")
                        await chat_manager.send_to_all(room_id, {"type": "kicked", "target": target})
                elif m_type == "wipe":
                    if username == chat_manager.room_admins.get(room_id):
                        await chat_manager.send_to_all(room_id, {"type": "wipe_all"})
                else:
                    msg_id = str(uuid.uuid4())
                    msg_obj = {
                        "type": m_type, "id": msg_id, "username": username,
                        "content": data.get("content", ""), "timestamp": datetime.now().isoformat(),
                        "self_destruct": data.get("self_destruct", False)
                    }
                    await chat_manager.send_to_all(room_id, msg_obj)
                    if data.get("self_destruct"): asyncio.create_task(schedule_destruct(room_id, msg_id))
        except WebSocketDisconnect:
            user = chat_manager.leave_room(websocket, room_id)
            if user:
                await chat_manager.broadcast_user_list(room_id)
                await chat_manager.send_to_all(room_id, {"type": "delete_all", "username": user, "content": f"{user} vanished", "timestamp": datetime.now().isoformat()})
        except:
            chat_manager.leave_room(websocket, room_id)

static_folder = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "static")
app.mount("/", StaticFiles(directory=static_folder, html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
