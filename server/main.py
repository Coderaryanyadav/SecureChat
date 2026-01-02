import json
import os
import sqlite3
from datetime import datetime
from typing import Dict, List
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from passlib.context import CryptContext

app = FastAPI()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
        self.room_messages = {}

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
            self.room_messages[room_id] = []
        
        if any(name == username for name in self.active_rooms[room_id].values()):
            await websocket.send_json({"type": "error", "message": "This name is already used!"})
            await websocket.close()
            return False

        self.active_rooms[room_id][websocket] = username
        
        await self.send_to_all(room_id, {
            "type": "system",
            "content": f"{username} joined the room.",
            "timestamp": datetime.now().isoformat()
        })
        return True

    def leave_room(self, websocket, room_id):
        name = None
        if room_id in self.active_rooms:
            if websocket in self.active_rooms[room_id]:
                name = self.active_rooms[room_id].pop(websocket)
                if room_id in self.room_messages:
                    self.room_messages[room_id] = [m for m in self.room_messages[room_id] if m['username'] != name]
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
async def register(data: dict):
    user = data.get("username")
    pwd = data.get("password")
    if not user or not pwd: return {"status": "fail", "msg": "Missing data"}
    
    db = get_db()
    try:
        hashed = pwd_context.hash(pwd)
        db.execute("INSERT INTO users (username, password) VALUES (?, ?)", (user, hashed))
        db.commit()
        return {"status": "ok"}
    except:
        return {"status": "fail", "msg": "User already exists"}

@app.post("/api/login")
async def login(data: dict):
    user = data.get("username")
    pwd = data.get("password")
    db = get_db()
    res = db.execute("SELECT * FROM users WHERE username = ?", (user,)).fetchone()
    if res and pwd_context.verify(pwd, res['password']):
        return {"status": "ok", "user_id": res['id']}
    return {"status": "fail", "msg": "Wrong username or password"}

@app.post("/api/save-room")
async def save_room(data: dict):
    uid = data.get("user_id")
    rid = data.get("room_id")
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
    rid = data.get("room_id")
    pwd = data.get("password")
    if chat_manager.check_room(rid, pwd):
        return {"status": "ok"}
    return {"status": "fail", "msg": "Incorrect password for this room."}

@app.websocket("/ws/{room_id}/{username}")
async def socket_endpoint(websocket: WebSocket, room_id: str, username: str, pwd: str = ""):
    if await chat_manager.join_room(websocket, room_id, username, pwd):
        try:
            while True:
                raw_data = await websocket.receive_text()
                try:
                    parsed = json.loads(raw_data)
                    msg_content = parsed.get("content", "").strip()
                except:
                    msg_content = raw_data.strip()

                if msg_content:
                    msg_obj = {
                        "type": "message",
                        "username": username,
                        "content": msg_content,
                        "timestamp": datetime.now().isoformat()
                    }
                    chat_manager.room_messages[room_id].append(msg_obj)
                    await chat_manager.send_to_all(room_id, msg_obj)
        except WebSocketDisconnect:
            user = chat_manager.leave_room(websocket, room_id)
            if user:
                await chat_manager.send_to_all(room_id, {
                    "type": "delete_all",
                    "username": user,
                    "content": f"{user} has left. Their history is purged.",
                    "timestamp": datetime.now().isoformat()
                })
        except Exception:
            chat_manager.leave_room(websocket, room_id)

@app.get("/api/status")
async def status():
    return {"active_rooms": len(chat_manager.active_rooms)}

static_folder = os.path.join(os.path.dirname(os.path.dirname(__file__)), "static")
app.mount("/", StaticFiles(directory=static_folder, html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    p = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=p)
