# ==========================================================
# SecureChat - Final Year Diploma Project
# Created by: Aryan Yadav and Jeet Shah
# ==========================================================

import json
import os
from datetime import datetime
from typing import Dict, List

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

app = FastAPI(title="SecureChat Student Project")

# Enable CORS so the frontend can talk to the backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# This class manages all the active connections
class ChatManager:
    def __init__(self):
        # We store active connections in a dictionary
        # Format: { "room_id": { websocket_object: "username" } }
        self.rooms: Dict[str, Dict[WebSocket, str]] = {}
        
        # We store room passwords here
        # Format: { "room_id": "password" }
        self.passwords: Dict[str, str] = {}

    # Method to check if password is correct or create a new room
    def verify_room(self, room_id: str, password: str):
        if room_id not in self.passwords:
            # First person to join sets the password
            self.passwords[room_id] = password
            return True
        return self.passwords[room_id] == password

    # Method to add a new user to a room
    async def add_user(self, websocket: WebSocket, room_id: str, username: str, password: str):
        # Check password first
        if not self.verify_room(room_id, password):
            await websocket.accept()
            await websocket.send_json({"type": "error", "message": "Wrong password for this room!"})
            await websocket.close()
            return False

        await websocket.accept()
        
        # Initialize room if it doesn't exist in the active rooms list
        if room_id not in self.rooms:
            self.rooms[room_id] = {}
            
        # Check if name is taken
        if any(u == username for u in self.rooms[room_id].values()):
            await websocket.send_json({"type": "error", "message": "Name already taken!"})
            await websocket.close()
            return False

        # Save the connection
        self.rooms[room_id][websocket] = username
        
        # Tell everyone that someone joined
        await self.broadcast(room_id, {
            "type": "system",
            "content": f"User '{username}' connected to the secure tunnel.",
            "timestamp": datetime.now().isoformat()
        })
        return True

    # Method to remove a user when they leave
    def remove_user(self, websocket: WebSocket, room_id: str):
        name = "Someone"
        if room_id in self.rooms:
            if websocket in self.rooms[room_id]:
                name = self.rooms[room_id].pop(websocket)
            # If room is empty, we keep the password but the room is inactive
        return name

    # Method to send a message to everyone in the room
    async def broadcast(self, room_id: str, payload: dict):
        if room_id in self.rooms:
            # We loop through all users in that room
            for client in list(self.rooms[room_id].keys()):
                try:
                    await client.send_json(payload)
                except:
                    # If sending fails, the client probably disconnected
                    self.remove_user(client, room_id)

manager = ChatManager()

# API for the frontend to check password before connecting WS
@app.post("/api/verify-room")
async def check_room(request_data: dict):
    rid = request_data.get("room_id")
    pwd = request_data.get("password")
    
    if manager.verify_room(rid, pwd):
        return {"success": True}
    else:
        return {"success": False, "message": "Invalid password for this room."}

# The main WebSocket endpoint
@app.websocket("/ws/{room_id}/{user_name}")
async def chat_socket(websocket: WebSocket, room_id: str, user_name: str, pwd: str = ""):
    # Try to connect the user
    if await manager.add_user(websocket, room_id, user_name, pwd):
        try:
            while True:
                # Wait for a message from the client
                msg_text = await websocket.receive_text()
                
                # Check if it's JSON
                try:
                    msg_data = json.loads(msg_text)
                    content = msg_data.get("content", "").strip()
                except:
                    content = msg_text.strip()

                if content:
                    # Broadcast the message to the room
                    await manager.broadcast(room_id, {
                        "type": "message",
                        "username": user_name,
                        "content": content,
                        "timestamp": datetime.now().isoformat()
                    })

        except WebSocketDisconnect:
            # Handle user leaving
            user = manager.remove_user(websocket, room_id)
            await manager.broadcast(room_id, {
                "type": "system",
                "content": f"{user} has left the chat.",
                "timestamp": datetime.now().isoformat()
            })
        except Exception:
            manager.remove_user(websocket, room_id)

# Simple health check
@app.get("/api/status")
async def get_status():
    return {"status": "running", "active_rooms": len(manager.rooms)}

# Serve the HTML files
static_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "static")
app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    # Railway and other hosts provide a PORT environment variable
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
