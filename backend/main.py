from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
import os
import json
from typing import Dict, List, Tuple

# --- Configuration de base ---
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.join(BASE_DIR, '..', 'frontend')
STATIC_DIR = os.path.join(FRONTEND_DIR, 'static')

app = FastAPI()

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
templates = Jinja2Templates(directory=FRONTEND_DIR)

# --- Stockage de l'état des tableaux ---
room_states: Dict[str, List[Dict]] = {}


# --- Gestionnaire de connexions WebSocket ---
class ConnectionManager:
    def __init__(self):
        # Stocke maintenant (WebSocket, username, client_id)
        self.active_connections: Dict[str, List[Tuple[WebSocket, str, str]]] = {}

    async def connect(self, websocket: WebSocket, room_id: str, username: str, client_id: str):
        await websocket.accept()
        if room_id not in self.active_connections:
            self.active_connections[room_id] = []
        self.active_connections[room_id].append((websocket, username, client_id))
        
        if room_id not in room_states: room_states[room_id] = []

    def disconnect(self, websocket: WebSocket, room_id: str) -> Tuple[str, str] | None:
        if room_id in self.active_connections:
            connection_to_remove = next((conn for conn in self.active_connections[room_id] if conn[0] == websocket), None)
            if connection_to_remove:
                self.active_connections[room_id].remove(connection_to_remove)
                return connection_to_remove[1], connection_to_remove[2] # Retourne (username, client_id)
        return None

    async def broadcast(self, message: str, room_id: str, sender: WebSocket):
        if room_id in self.active_connections:
            for connection, _, _ in self.active_connections[room_id]:
                if connection != sender:
                    await connection.send_text(message)
    
    async def broadcast_user_list(self, room_id: str):
        if room_id in self.active_connections:
            user_list = [username for _, username, _ in self.active_connections[room_id]]
            message = json.dumps({"type": "users:update", "data": user_list})
            for connection, _, _ in self.active_connections[room_id]:
                await connection.send_text(message)

manager = ConnectionManager()


# --- Route pour servir robots.txt ---
@app.get("/robots.txt", response_class=FileResponse)
async def get_robots_txt():
    return os.path.join(STATIC_DIR, "robots.txt")

# --- Route HTTP principale ---
@app.get("/", response_class=HTMLResponse)
async def read_root(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

# --- NOUVEAU: Route pour servir sitemap.xml ---
@app.get("/sitemap.xml", response_class=FileResponse)
async def get_sitemap():
    return os.path.join(STATIC_DIR, "sitemap.xml")

# --- Route WebSocket ---
@app.websocket("/ws/{room_id}/{username}")
async def websocket_endpoint(websocket: WebSocket, room_id: str, username: str):
    client_id = str(id(websocket))
    await manager.connect(websocket, room_id, username, client_id)
    await manager.broadcast_user_list(room_id)
    
    await websocket.send_text(json.dumps({"type": "canvas:load", "data": room_states[room_id]}))
    
    try:
        while True:
            data_str = await websocket.receive_text()
            message = json.loads(data_str)
            
            if message["type"] == "cursor:move":
                enriched_message = {
                    "type": "cursor:move",
                    "data": { "x": message["data"]["x"], "y": message["data"]["y"], "username": username, "client_id": client_id }
                }
                await manager.broadcast(json.dumps(enriched_message), room_id, websocket)
                continue

            current_state = room_states.get(room_id, [])
            msg_type = message.get("type")
            msg_data = message.get("data")
            if msg_type == 'path:created': current_state.append(msg_data)
            elif msg_type == 'object:modified':
                current_state[:] = [msg_data if obj.get('id') == msg_data.get('id') else obj for obj in current_state]
            elif msg_type == 'object:removed':
                current_state[:] = [obj for obj in current_state if obj.get('id') != msg_data.get('id')]
            elif msg_type == 'canvas:clear': current_state.clear()
            room_states[room_id] = current_state
            
            await manager.broadcast(data_str, room_id, websocket)

    except WebSocketDisconnect:
        disconnected_info = manager.disconnect(websocket, room_id)
        if disconnected_info:
            _, disconnected_client_id = disconnected_info
            await manager.broadcast_user_list(room_id)
            await manager.broadcast(json.dumps({"type": "cursor:remove", "data": {"client_id": disconnected_client_id}}), room_id, websocket)
        print(f"Client '{username}' ({client_id}) déconnecté de la salle {room_id}")