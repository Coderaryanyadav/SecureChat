import json
import os
from datetime import datetime
from typing import Dict, List
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChatHandler:
    def __init__(self):
        self.active_rooms = {}
        self.room_passwords = {}

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
        name = "User"
        if room_id in self.active_rooms:
            if websocket in self.active_rooms[room_id]:
                name = self.active_rooms[room_id].pop(websocket)
        return name

    async def send_to_all(self, room_id, data):
        if room_id in self.active_rooms:
            for socket in list(self.active_rooms[room_id].keys()):
                try:
                    await socket.send_json(data)
                except:
                    self.leave_room(socket, room_id)

chat_manager = ChatHandler()

@app.post("/api/verify-room")
async def verify(data: dict):
    rid = data.get("room_id")
    pwd = data.get("password")
    
    if chat_manager.check_room(rid, pwd):
        return {"status": "ok"}
    else:
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
                    await chat_manager.send_to_all(room_id, {
                        "type": "message",
                        "username": username,
                        "content": msg_content,
                        "timestamp": datetime.now().isoformat()
                    })
        except WebSocketDisconnect:
            user = chat_manager.leave_room(websocket, room_id)
            await chat_manager.send_to_all(room_id, {
                "type": "system",
                "content": f"{user} left.",
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
