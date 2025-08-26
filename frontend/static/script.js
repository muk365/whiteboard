window.addEventListener('DOMContentLoaded', () => {

    const urlParams = new URLSearchParams(window.location.search);
    let room_id = urlParams.get('room');
    if (!room_id) { room_id = `Room_${Math.random().toString(36).substr(2, 9)}`; window.location.search = `?room=${room_id}`; return; }
    let username = localStorage.getItem('whiteboard_username') || `User_${Math.random().toString(36).substr(2, 5)}`;
    
    const menuToggleBtn = document.getElementById('menu-toggle-btn');
    const sideMenu = document.getElementById('side-menu');
    const menuBackdrop = document.getElementById('menu-backdrop');
    const usernameInput = document.getElementById('username-input');
    const currentRoomIdDisplay = document.getElementById('current-room-id');
    const joinRoomInput = document.getElementById('join-room-input');
    const joinRoomBtn = document.getElementById('join-room-btn');
    const userList = document.getElementById('user-list');
    
    currentRoomIdDisplay.textContent = room_id;
    usernameInput.value = username;
    
    const toggleMenu = () => { sideMenu.classList.toggle('-translate-x-full'); menuBackdrop.classList.toggle('hidden'); };
    menuToggleBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleMenu(); });
    menuBackdrop.addEventListener('click', toggleMenu);
    usernameInput.addEventListener('change', () => { const newUsername = usernameInput.value.trim(); if (newUsername) { localStorage.setItem('whiteboard_username', newUsername); window.location.reload(); } });
    joinRoomBtn.addEventListener('click', () => { const newRoomId = joinRoomInput.value.trim(); if (newRoomId) window.location.search = `?room=${newRoomId}`; });

    const infoToggleBtn = document.getElementById('info-toggle-btn');
    const infoPanel = document.getElementById('info-panel');
    const infoCloseBtn = document.getElementById('info-close-btn');
    const toggleInfoPanel = () => { infoPanel.classList.toggle('translate-y-full'); };
    infoToggleBtn.addEventListener('click', toggleInfoPanel);
    infoCloseBtn.addEventListener('click', toggleInfoPanel);

    const ws_protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${ws_protocol}://${window.location.host}/ws/${room_id}/${encodeURIComponent(username)}`);

    const cursorsContainer = document.getElementById('cursors-container');
    const cursorTemplate = document.getElementById('cursor-template');
    const remoteCursors = {};
    const userColors = ['#F97316', '#22C55E', '#3B82F6', '#EC4899', '#EAB308', '#8B5CF6'];
    const getUserColor = (clientId) => { const hash = clientId.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0); return userColors[hash % userColors.length]; };
    
    let currentTool = 'pencil';
    let brushColor = '#FFFFFF';
    let brushSize = 4;
    const pencilCursor = "url('data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"white\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z\"></path></svg>') 0 24, auto";
    const eraserCursor = "url('data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"white\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><circle cx=\"12\" cy=\"12\" r=\"10\" stroke=\"white\" stroke-width=\"2\" fill=\"rgba(255,255,255,0.3)\" /></svg>') 12 12, auto";
    const canvas = new fabric.Canvas('whiteboard-canvas', { isDrawingMode: false, backgroundColor: '#1f2937' });
    const resizeCanvas = () => { canvas.setWidth(window.innerWidth); canvas.setHeight(window.innerHeight); canvas.renderAll(); };
    window.addEventListener('resize', resizeCanvas); resizeCanvas();
    
    const toolbar = document.getElementById('toolbar');
    const colorPalette = document.getElementById('color-palette');
    const brushSizePanel = document.getElementById('brush-size-panel');
    const setActiveTool = (tool) => { currentTool = tool; canvas.isDrawingMode = (tool === 'pencil'); toolbar.querySelectorAll('.tool-btn').forEach(btn => { btn.classList.toggle('bg-blue-600', btn.dataset.tool === tool); btn.classList.toggle('text-white', btn.dataset.tool === tool); }); if (tool === 'pencil') canvas.freeDrawingCursor = pencilCursor; else if (tool === 'eraser') canvas.defaultCursor = eraserCursor; else canvas.defaultCursor = 'default'; colorPalette.classList.add('hidden'); brushSizePanel.classList.add('hidden'); };
    const updateBrush = () => { canvas.freeDrawingBrush.color = brushColor; canvas.freeDrawingBrush.width = brushSize; document.getElementById('color-indicator').style.backgroundColor = brushColor; document.getElementById('brush-size-label').textContent = brushSize; document.getElementById('brush-size-slider').value = brushSize; };
    toolbar.addEventListener('click', (e) => { const button = e.target.closest('button'); if (!button) return; const tool = button.dataset.tool; if (tool) setActiveTool(tool); if (button.id === 'color-picker-btn') { brushSizePanel.classList.add('hidden'); colorPalette.classList.toggle('hidden'); } if (button.id === 'brush-size-btn') { colorPalette.classList.add('hidden'); brushSizePanel.classList.toggle('hidden'); } if (button.id === 'clear-all-btn') { if (confirm('Voulez-vous vraiment tout effacer ?')) { canvas.clear(); canvas.setBackgroundColor('#1f2937'); sendMessage({ type: 'canvas:clear' }); } } });
    const colors = ['#FFFFFF', '#EF4444', '#F97316', '#EAB308', '#22C55E', '#3B82F6', '#8B5CF6', '#EC4899'];
    colors.forEach(color => { const swatch = document.createElement('button'); swatch.className = 'w-8 h-8 rounded-full border-2 border-gray-600 hover:border-white transition-all'; swatch.style.backgroundColor = color; swatch.addEventListener('click', () => { brushColor = color; updateBrush(); colorPalette.classList.add('hidden'); }); colorPalette.appendChild(swatch); });
    const brushSizeSlider = document.getElementById('brush-size-slider');
    brushSizeSlider.addEventListener('input', (e) => { brushSize = parseInt(e.target.value, 10); updateBrush(); });
    
    const sendMessage = (message) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message)); };
    const assignId = (obj) => { if (!obj.id) obj.id = new Date().getTime() + Math.random().toString(36).substr(2, 9); };
    canvas.on('object:added', (e) => assignId(e.target));
    canvas.on('path:created', (e) => { assignId(e.path); sendMessage({ type: 'path:created', data: e.path.toObject(['id']) }); });
    canvas.on('object:modified', (e) => { assignId(e.target); sendMessage({ type: 'object:modified', data: e.target.toObject(['id']) }); });
    canvas.on('mouse:down', (opt) => { if (currentTool === 'eraser' && opt.target) { sendMessage({ type: 'object:removed', data: { id: opt.target.id } }); canvas.remove(opt.target); } });
    window.addEventListener('mousemove', (e) => { sendMessage({ type: 'cursor:move', data: { x: e.clientX, y: e.clientY } }); }, { passive: true });

    ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        const { type, data } = message;
        switch (type) {
            case 'cursor:move':
                if (!remoteCursors[data.client_id]) {
                    const newCursor = cursorTemplate.cloneNode(true);
                    newCursor.id = `cursor-${data.client_id}`;
                    newCursor.classList.remove('hidden');
                    const nameTag = newCursor.querySelector('span');
                    nameTag.textContent = data.username;
                    const color = getUserColor(data.client_id);
                    newCursor.style.color = color;
                    nameTag.style.backgroundColor = color;
                    cursorsContainer.appendChild(newCursor);
                    remoteCursors[data.client_id] = newCursor;
                }
                remoteCursors[data.client_id].style.transform = `translate(${data.x}px, ${data.y}px)`;
                break;
            case 'cursor:remove':
                if (remoteCursors[data.client_id]) { remoteCursors[data.client_id].remove(); delete remoteCursors[data.client_id]; }
                break;
            case 'canvas:load': canvas.loadFromJSON({ objects: data, backgroundColor: '#1f2937' }, () => { canvas.renderAll(); canvas.getObjects().forEach(obj => { obj.set({ selectable: true, evented: true }); }); }); break;
            case 'path:created': fabric.util.enlivenObjects([data], ([path]) => { path.set({ selectable: true, evented: true }); canvas.add(path); canvas.renderAll(); }); break;
            case 'object:modified': let obj = canvas.getObjects().find(o => o.id === data.id); if (obj) { obj.set(data); obj.setCoords(); canvas.renderAll(); } break;
            case 'object:removed': let objToRemove = canvas.getObjects().find(o => o.id === data.id); if (objToRemove) { canvas.remove(objToRemove); canvas.renderAll(); } break;
            case 'canvas:clear': canvas.clear(); canvas.setBackgroundColor('#1f2937'); break;
            case 'users:update': userList.innerHTML = ''; data.forEach(name => { const li = document.createElement('li'); li.className = 'text-gray-300 bg-gray-800 rounded-md px-3 py-2 text-sm'; li.textContent = name; userList.appendChild(li); }); break;
        }
    };
    
    updateBrush();
    setActiveTool('pencil');
});