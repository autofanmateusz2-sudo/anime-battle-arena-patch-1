// =============================================================================
// ANIME BATTLE ARENA 3D - CLIENT
// Three.js renderer + Socket.io networking + procedural character models
// =============================================================================

'use strict';

// =============================================================================
// GLOBAL STATE
// =============================================================================
const G = {
    socket: null,
    connected: false,
    serverData: null,
    selfId: null,
    selectedCharacter: 'goku',
    playerName: '',
    currentRoom: null,
    currentScreen: 'loading-screen',
    state: null,
    prevState: null,
    interpAlpha: 0,
    lastStateMs: 0,
    stateInterval: 33,
    inputSeq: 0,
    keys: {},
    mouseButtons: { left: false, right: false },
    mouseDelta: { x: 0, y: 0 },
    pointerLocked: false,
    cameraYaw: 0,
    cameraPitch: -0.2,
    sensitivity: 0.0025,
    chatActive: false,
    paused: false,
    pingMs: 0,
    fps: 0,
    fpsCounter: 0,
    fpsTimer: 0,
    lastFrameMs: performance.now(),
    scene: null,
    camera: null,
    renderer: null,
    clock: null,
    arenaGroup: null,
    playersGroup: null,
    projectilesGroup: null,
    effectsGroup: null,
    playerMeshes: new Map(),
    projectileMeshes: new Map(),
    activeEffects: [],
    statusEffectDefs: {},
    characterDefs: {},
    mapDefs: {},
    modeDefs: {},
    audioCtx: null,
    sfxEnabled: true,
    pendingDamagePopups: [],
    cameraTarget: new THREE.Vector3(),
    cameraDistance: 8,
    cameraOffset: new THREE.Vector3(0, 2.5, 0),
    cameraShake: 0,
    cameraShakeTime: 0,
    crosshairPos: { x: 0, y: 0 },
    lockOnWorldPos: null
};

// =============================================================================
// SCREEN MANAGEMENT
// =============================================================================
function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
    G.currentScreen = id;
}

function setLoadingProgress(pct, text) {
    const bar = document.getElementById('loading-bar');
    if (bar) bar.style.width = pct + '%';
    const t = document.getElementById('loading-text');
    if (t && text) t.textContent = text;
}

// =============================================================================
// NETWORKING
// =============================================================================
function initNetwork() {
    setLoadingProgress(20, 'Connecting to server...');
    G.socket = io({ transports: ['websocket', 'polling'] });

    G.socket.on('connect', () => {
        G.connected = true;
        G.selfId = G.socket.id;
        setLoadingProgress(40, 'Handshake...');
        const cs = document.getElementById('connection-status');
        if (cs) { cs.textContent = '● Connected'; cs.className = 'conn-good'; }
    });

    G.socket.on('disconnect', () => {
        G.connected = false;
        const cs = document.getElementById('connection-status');
        if (cs) { cs.textContent = '● Disconnected'; cs.className = 'conn-bad'; }
    });

    G.socket.on('hello', (data) => {
        G.serverData = data;
        G.characterDefs = data.characters;
        G.mapDefs = data.maps;
        G.modeDefs = data.modes;
        G.statusEffectDefs = data.statusEffects;
        setLoadingProgress(70, 'Building UI...');
        buildCharacterGrid();
        setLoadingProgress(90, 'Almost ready...');
        setTimeout(() => {
            setLoadingProgress(100, 'Ready!');
            setTimeout(() => showScreen('main-menu'), 400);
        }, 200);
    });

    G.socket.on('joinedRoom', (data) => {
        G.currentRoom = data.room;
        G.selfId = data.youAre;
        showScreen('lobby');
        renderLobby();
    });

    G.socket.on('roomUpdate', (room) => {
        if (G.currentRoom && G.currentRoom.id === room.id) {
            G.currentRoom = room;
            renderLobby();
        }
    });

    G.socket.on('roomList', (list) => renderRoomList(list));

    G.socket.on('matchStart', (data) => {
        G.currentRoom.mapId = data.mapId;
        G.currentRoom.mode = data.mode;
        startMatch();
    });

    G.socket.on('state', (s) => {
        G.prevState = G.state;
        G.state = s;
        G.lastStateMs = performance.now();
        if (G.prevState) G.stateInterval = G.state.t - G.prevState.t;
    });

    G.socket.on('effect', (e) => spawnEffect(e.type, e.data));

    G.socket.on('killfeed', (k) => addKillfeedEntry(k));

    G.socket.on('chat', (c) => addChatMessage(c));

    G.socket.on('matchEnd', (data) => showMatchEnd(data));

    G.socket.on('returnToLobby', () => {
        document.getElementById('match-end').classList.add('hidden');
        showScreen('lobby');
        if (G.pointerLocked) document.exitPointerLock();
    });

    G.socket.on('error', (e) => alert('Error: ' + e.msg));

    setInterval(() => {
        if (!G.connected) return;
        const t = performance.now();
        G.socket.emit('ping', () => { G.pingMs = Math.round(performance.now() - t); });
    }, 2000);
}

// =============================================================================
// CHARACTER SELECT GRID
// =============================================================================
function buildCharacterGrid() {
    const grid = document.getElementById('char-grid');
    if (!grid) return;
    grid.innerHTML = '';
    const ids = Object.keys(G.characterDefs);
    for (const id of ids) {
        const c = G.characterDefs[id];
        const card = document.createElement('div');
        card.className = 'char-card';
        card.dataset.id = id;
        const colorHex = '#' + c.color.toString(16).padStart(6, '0');
        const bgHex = '#' + c.secondaryColor.toString(16).padStart(6, '0');
        card.style.setProperty('--card-color', colorHex);
        card.style.setProperty('--card-bg', bgHex);
        card.innerHTML = `
            <div class="card-portrait"><div class="face"></div></div>
            <div class="card-name">${c.name}</div>
        `;
        card.addEventListener('click', () => selectCharacter(id));
        grid.appendChild(card);
    }
    selectCharacter(ids[0]);
}

function selectCharacter(id) {
    G.selectedCharacter = id;
    document.querySelectorAll('.char-card').forEach(el => {
        el.classList.toggle('selected', el.dataset.id === id);
    });
    const c = G.characterDefs[id];
    if (!c) return;
    const colorHex = '#' + c.color.toString(16).padStart(6, '0');
    const portrait = document.getElementById('char-portrait');
    portrait.style.setProperty('--portrait-color', colorHex);
    document.getElementById('char-name').textContent = c.name;
    document.getElementById('char-name').style.color = colorHex;
    document.getElementById('char-title').textContent = c.title;
    document.getElementById('char-anime').textContent = c.anime + ' · ' + c.role;
    const figIcons = {
        rengoku: '⚔️', hitsugaya: '❄️', minato: '⚡', goku: '👊',
        ichigo: '🗡️', naruto: '🌀', nezuko: '🌸', killua: '⚡',
        allmight: '💪', megumin: '💥', alucard: '🦇', mitsuri: '💕'
    };
    document.getElementById('char-portrait-fig').textContent = figIcons[id] || '⚔️';
    const s = c.stats;
    document.getElementById('stat-hp').style.width = ((s.maxHp - 60) / (150 - 60) * 100) + '%';
    document.getElementById('stat-mp').style.width = ((s.maxMp - 70) / (150 - 70) * 100) + '%';
    document.getElementById('stat-speed').style.width = ((s.moveSpeed - 8) / (12 - 8) * 100) + '%';
    document.getElementById('stat-dmg').style.width = ((s.damage - 0.85) / (1.2 - 0.85) * 100) + '%';
    document.getElementById('stat-def').style.width = ((s.defense - 0.8) / (1.2 - 0.8) * 100) + '%';
    document.getElementById('char-passive-name').textContent = c.passive.name;
    document.getElementById('char-passive-desc').textContent = c.passive.description;
    const abWrap = document.getElementById('char-abilities');
    abWrap.innerHTML = '';
    const slots = [['Q', 'q'], ['E', 'e'], ['R', 'r'], ['LMB', 'light'], ['RMB', 'heavy'], ['F', 'f']];
    for (const [key, slot] of slots) {
        const ab = c.abilities[slot];
        if (!ab) continue;
        const card = document.createElement('div');
        card.className = 'ability-card' + (slot === 'f' ? ' ult-card' : '');
        card.innerHTML = `<span class="ab-key-mini">${key}</span><span class="ab-name-mini">${ab.name}</span>`;
        abWrap.appendChild(card);
    }
}

// =============================================================================
// LOBBY UI
// =============================================================================
function renderLobby() {
    if (!G.currentRoom) return;
    const r = G.currentRoom;
    const mode = G.modeDefs[r.mode];
    const map = G.mapDefs[r.mapId];
    document.getElementById('lobby-title').textContent = `Lobby: ${mode ? mode.name : r.mode}`;
    document.getElementById('lobby-count').textContent = r.playerCount;
    document.getElementById('lobby-max').textContent = r.maxPlayers;
    document.getElementById('lobby-mode').textContent = mode ? mode.name : r.mode;
    document.getElementById('lobby-map').textContent = map ? map.name : r.mapId;
    document.getElementById('lobby-score').textContent = mode ? mode.scoreLimit : '?';
    const t = mode ? mode.timeLimit : 0;
    document.getElementById('lobby-time').textContent = `${Math.floor(t/60)}:${(t%60).toString().padStart(2,'0')}`;
    const list = document.getElementById('lobby-players');
    list.innerHTML = '';
    for (const p of r.players) {
        const row = document.createElement('div');
        row.className = 'lobby-player-row';
        if (p.team) row.classList.add('team-' + p.team);
        if (p.id === r.hostId) row.classList.add('host');
        const cdef = G.characterDefs[p.character];
        row.innerHTML = `
            <span class="lobby-player-name">${p.name}</span>
            <span class="lobby-player-char">${cdef ? cdef.name : '?'}</span>
            ${p.id === r.hostId ? '<span class="lobby-host-tag">★ HOST</span>' : ''}
        `;
        list.appendChild(row);
    }
    const isHost = r.hostId === G.selfId;
    document.getElementById('lobby-start').disabled = !isHost;
    document.getElementById('lobby-host-only').style.display = isHost ? 'none' : 'block';
}

function renderRoomList(list) {
    const wrap = document.getElementById('rooms-list');
    wrap.innerHTML = '';
    if (list.length === 0) {
        wrap.innerHTML = '<div class="room-empty">No rooms found. Create one!</div>';
        return;
    }
    for (const r of list) {
        const mode = G.modeDefs[r.mode];
        const map = G.mapDefs[r.mapId];
        const row = document.createElement('div');
        row.className = 'room-row';
        row.innerHTML = `
            <div class="room-mode">${mode ? mode.name : r.mode}</div>
            <div class="room-map">${map ? map.name : r.mapId}</div>
            <div class="room-state">${r.state}</div>
            <div class="room-count">${r.playerCount}/${r.maxPlayers}</div>
            <button class="btn-small">JOIN</button>
        `;
        row.querySelector('button').addEventListener('click', () => joinRoom(r.id));
        wrap.appendChild(row);
    }
}

function joinRoom(id) {
    if (!G.playerName) G.playerName = document.getElementById('player-name').value || 'Player' + Math.floor(Math.random() * 999);
    G.socket.emit('joinRoom', { roomId: id, name: G.playerName, character: G.selectedCharacter });
}

// =============================================================================
// MENU BUTTON HANDLERS
// =============================================================================
function setupMenuHandlers() {
    document.getElementById('btn-quickplay').addEventListener('click', () => {
        G.playerName = document.getElementById('player-name').value || 'Player' + Math.floor(Math.random() * 999);
        showScreen('character-select');
        document.getElementById('char-confirm').onclick = () => {
            G.socket.emit('joinRoom', { mode: 'ffa', name: G.playerName, character: G.selectedCharacter });
        };
    });
    document.getElementById('btn-create').addEventListener('click', () => {
        G.playerName = document.getElementById('player-name').value || 'Player' + Math.floor(Math.random() * 999);
        showScreen('character-select');
        document.getElementById('char-confirm').onclick = () => showScreen('create-room');
    });
    document.getElementById('btn-browse').addEventListener('click', () => {
        G.socket.emit('listRooms');
        showScreen('room-browser');
    });
    document.getElementById('btn-tutorial').addEventListener('click', () => showScreen('tutorial'));
    document.getElementById('char-back').addEventListener('click', () => showScreen('main-menu'));
    document.getElementById('rooms-back').addEventListener('click', () => showScreen('main-menu'));
    document.getElementById('rooms-refresh').addEventListener('click', () => G.socket.emit('listRooms'));
    document.getElementById('create-back').addEventListener('click', () => showScreen('character-select'));
    document.getElementById('tutorial-back').addEventListener('click', () => showScreen('main-menu'));
    document.getElementById('create-confirm').addEventListener('click', () => {
        const mode = document.getElementById('create-mode').value;
        const mapId = document.getElementById('create-map').value;
        G.socket.emit('createRoom', { mode, mapId, name: G.playerName, character: G.selectedCharacter });
    });
    document.getElementById('lobby-leave').addEventListener('click', () => {
        G.socket.emit('leaveRoom');
        G.currentRoom = null;
        showScreen('main-menu');
    });
    document.getElementById('lobby-start').addEventListener('click', () => G.socket.emit('startMatch'));
    document.getElementById('lobby-change-char').addEventListener('click', () => {
        showScreen('character-select');
        document.getElementById('char-confirm').onclick = () => {
            G.socket.emit('changeCharacter', { character: G.selectedCharacter });
            showScreen('lobby');
        };
    });
    const chatInput = document.getElementById('lobby-chat-input');
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && chatInput.value.trim()) {
            G.socket.emit('chat', { msg: chatInput.value });
            chatInput.value = '';
        }
    });
    document.getElementById('match-continue').addEventListener('click', () => {
        document.getElementById('match-end').classList.add('hidden');
        showScreen('lobby');
        if (G.pointerLocked) document.exitPointerLock();
    });
    document.getElementById('pause-resume').addEventListener('click', () => {
        G.paused = false;
        document.getElementById('pause-menu').classList.add('hidden');
        document.getElementById('game-canvas').requestPointerLock();
    });
    document.getElementById('pause-leave').addEventListener('click', () => {
        G.paused = false;
        G.socket.emit('leaveRoom');
        G.currentRoom = null;
        document.getElementById('pause-menu').classList.add('hidden');
        showScreen('main-menu');
    });
}

function addChatMessage(c) {
    const log = document.getElementById('lobby-chat-log');
    const ig = document.getElementById('ingame-chat-log');
    const html = `<div class="chat-msg ${c.team ? 'team-' + c.team : ''}"><span class="chat-name">${escapeHtml(c.name)}:</span> ${escapeHtml(c.msg)}</div>`;
    if (log) { log.insertAdjacentHTML('beforeend', html); log.scrollTop = log.scrollHeight; }
    if (ig) {
        ig.insertAdjacentHTML('beforeend', html);
        ig.scrollTop = ig.scrollHeight;
        while (ig.children.length > 8) ig.removeChild(ig.firstChild);
    }
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// =============================================================================
// THREE.JS SETUP
// =============================================================================
function initThree() {
    const canvas = document.getElementById('game-canvas');
    G.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    G.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    G.renderer.setSize(window.innerWidth, window.innerHeight);
    G.renderer.shadowMap.enabled = true;
    G.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    G.renderer.outputEncoding = THREE.sRGBEncoding;
    G.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    G.renderer.toneMappingExposure = 1.1;
    G.scene = new THREE.Scene();
    G.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 500);
    G.clock = new THREE.Clock();
    G.arenaGroup = new THREE.Group(); G.scene.add(G.arenaGroup);
    G.playersGroup = new THREE.Group(); G.scene.add(G.playersGroup);
    G.projectilesGroup = new THREE.Group(); G.scene.add(G.projectilesGroup);
    G.effectsGroup = new THREE.Group(); G.scene.add(G.effectsGroup);
    window.addEventListener('resize', () => {
        G.camera.aspect = window.innerWidth / window.innerHeight;
        G.camera.updateProjectionMatrix();
        G.renderer.setSize(window.innerWidth, window.innerHeight);
    });
}

function buildArena(mapId) {
    while (G.arenaGroup.children.length) {
        const c = G.arenaGroup.children[0];
        G.arenaGroup.remove(c);
        if (c.geometry) c.geometry.dispose();
        if (c.material) c.material.dispose();
    }
    const map = G.mapDefs[mapId];
    if (!map) return;
    G.scene.fog = new THREE.FogExp2(map.fogColor, map.fogDensity);
    G.scene.background = new THREE.Color(map.fogColor);
    const ambient = new THREE.AmbientLight(map.ambientLight, 0.6);
    G.arenaGroup.add(ambient);
    const dir = new THREE.DirectionalLight(map.directionalLight, 1.2);
    dir.position.set(30, 50, 20);
    dir.castShadow = true;
    dir.shadow.mapSize.set(2048, 2048);
    dir.shadow.camera.left = -50; dir.shadow.camera.right = 50;
    dir.shadow.camera.top = 50; dir.shadow.camera.bottom = -50;
    dir.shadow.camera.near = 1; dir.shadow.camera.far = 100;
    G.arenaGroup.add(dir);
    const fill = new THREE.HemisphereLight(map.directionalLight, 0x222244, 0.4);
    G.arenaGroup.add(fill);
    const groundGeo = new THREE.BoxGeometry(map.size, 1, map.size);
    let groundColor = 0x222233, groundEmissive = 0x000000;
    if (mapId === 'tokyo_night') { groundColor = 0x111122; groundEmissive = 0x110022; }
    else if (mapId === 'temple') { groundColor = 0x554433; groundEmissive = 0x110800; }
    else if (mapId === 'space_dojo') { groundColor = 0x111133; groundEmissive = 0x000044; }
    const groundMat = new THREE.MeshStandardMaterial({
        color: groundColor, emissive: groundEmissive, roughness: 0.7, metalness: 0.3
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.position.y = 0.5;
    ground.receiveShadow = true;
    G.arenaGroup.add(ground);
    const gridHelper = new THREE.GridHelper(map.size, 40, 0x444466, 0x222233);
    gridHelper.position.y = 1.01;
    G.arenaGroup.add(gridHelper);
    for (const plat of map.platforms) {
        const geo = new THREE.BoxGeometry(plat.w, plat.h, plat.d);
        const mat = new THREE.MeshStandardMaterial({
            color: groundColor, emissive: groundEmissive, roughness: 0.6, metalness: 0.4
        });
        const m = new THREE.Mesh(geo, mat);
        m.position.set(plat.x, plat.y, plat.z);
        m.castShadow = true;
        m.receiveShadow = true;
        G.arenaGroup.add(m);
        const edgeGeo = new THREE.EdgesGeometry(geo);
        const edgeMat = new THREE.LineBasicMaterial({ color: 0xff44aa, linewidth: 2 });
        const edges = new THREE.LineSegments(edgeGeo, edgeMat);
        edges.position.set(plat.x, plat.y, plat.z);
        G.arenaGroup.add(edges);
    }
    const half = map.size / 2;
    const wallGeo = new THREE.BoxGeometry(map.size, 30, 0.5);
    const wallMat = new THREE.MeshStandardMaterial({
        color: 0x000000, transparent: true, opacity: 0.15,
        emissive: 0xff44aa, emissiveIntensity: 0.3
    });
    for (let i = 0; i < 4; i++) {
        const w = new THREE.Mesh(wallGeo, wallMat);
        if (i === 0) { w.position.set(0, 15, -half); }
        else if (i === 1) { w.position.set(0, 15, half); }
        else if (i === 2) { w.rotation.y = Math.PI / 2; w.position.set(-half, 15, 0); }
        else { w.rotation.y = Math.PI / 2; w.position.set(half, 15, 0); }
        G.arenaGroup.add(w);
    }
    if (mapId === 'tokyo_night') buildTokyoDecor(half);
    else if (mapId === 'temple') buildTempleDecor(half);
    else if (mapId === 'space_dojo') buildSpaceDecor(half);
}

function buildTokyoDecor(half) {
    for (let i = 0; i < 30; i++) {
        const angle = (i / 30) * Math.PI * 2;
        const r = half + 15 + Math.random() * 30;
        const x = Math.cos(angle) * r;
        const z = Math.sin(angle) * r;
        const h = 15 + Math.random() * 40;
        const geo = new THREE.BoxGeometry(4 + Math.random() * 4, h, 4 + Math.random() * 4);
        const mat = new THREE.MeshStandardMaterial({
            color: 0x080820, emissive: Math.random() < 0.5 ? 0xff44aa : 0x44ddff,
            emissiveIntensity: 0.5, roughness: 0.4
        });
        const b = new THREE.Mesh(geo, mat);
        b.position.set(x, h / 2, z);
        G.arenaGroup.add(b);
    }
    for (let i = 0; i < 80; i++) {
        const geo = new THREE.SphereGeometry(0.3, 6, 6);
        const colorChoice = Math.random();
        const mat = new THREE.MeshBasicMaterial({
            color: colorChoice < 0.33 ? 0xff44aa : (colorChoice < 0.66 ? 0x44ddff : 0xffdd44)
        });
        const m = new THREE.Mesh(geo, mat);
        m.position.set((Math.random() - 0.5) * 200, 5 + Math.random() * 30, (Math.random() - 0.5) * 200);
        G.arenaGroup.add(m);
    }
}

function buildTempleDecor(half) {
    for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        const x = Math.cos(angle) * (half - 4);
        const z = Math.sin(angle) * (half - 4);
        const geo = new THREE.CylinderGeometry(1, 1, 14, 12);
        const mat = new THREE.MeshStandardMaterial({ color: 0x886655, roughness: 0.8 });
        const p = new THREE.Mesh(geo, mat);
        p.position.set(x, 7, z);
        p.castShadow = true;
        G.arenaGroup.add(p);
    }
    for (let i = 0; i < 4; i++) {
        const geo = new THREE.TorusGeometry(2, 0.3, 8, 24);
        const mat = new THREE.MeshStandardMaterial({ color: 0xcc4422, emissive: 0x661100, emissiveIntensity: 0.5 });
        const t = new THREE.Mesh(geo, mat);
        const angle = (i / 4) * Math.PI * 2;
        t.position.set(Math.cos(angle) * 12, 14, Math.sin(angle) * 12);
        t.rotation.x = Math.PI / 2;
        G.arenaGroup.add(t);
    }
}

function buildSpaceDecor(half) {
    for (let i = 0; i < 200; i++) {
        const geo = new THREE.SphereGeometry(0.2 + Math.random() * 0.4, 6, 6);
        const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const s = new THREE.Mesh(geo, mat);
        const r = 80 + Math.random() * 100;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        s.position.set(r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
        G.arenaGroup.add(s);
    }
    for (let i = 0; i < 5; i++) {
        const geo = new THREE.IcosahedronGeometry(2 + Math.random() * 3, 0);
        const mat = new THREE.MeshStandardMaterial({
            color: 0x4422aa, emissive: 0x2211aa, emissiveIntensity: 0.6, roughness: 0.3, metalness: 0.7
        });
        const r = new THREE.Mesh(geo, mat);
        r.position.set((Math.random() - 0.5) * 80, 20 + Math.random() * 30, (Math.random() - 0.5) * 80);
        r.userData.spin = { x: Math.random() * 0.5, y: Math.random() * 0.5 };
        G.arenaGroup.add(r);
    }
}

// =============================================================================
// PROCEDURAL CHARACTER MODEL BUILDER
// =============================================================================
function buildCharacterModel(charId) {
    const def = G.characterDefs[charId];
    if (!def) return new THREE.Group();
    const group = new THREE.Group();
    group.userData.charId = charId;
    const mainColor = def.color;
    const secondColor = def.secondaryColor;
    const auraColor = def.auraColor;
    const skinColor = 0xffd9b3;
    const matSkin = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.7 });
    const matMain = new THREE.MeshStandardMaterial({ color: mainColor, roughness: 0.5, metalness: 0.2 });
    const matSecond = new THREE.MeshStandardMaterial({ color: secondColor, roughness: 0.5, metalness: 0.3 });
    const matHair = new THREE.MeshStandardMaterial({ color: getHairColor(charId), roughness: 0.6 });
    const matEye = new THREE.MeshBasicMaterial({ color: getEyeColor(charId) });

    // Torso
    const torsoGeo = new THREE.BoxGeometry(0.7, 0.85, 0.4);
    const torso = new THREE.Mesh(torsoGeo, matMain);
    torso.position.y = 1.0;
    torso.castShadow = true;
    group.add(torso);
    // Belt/middle
    const beltGeo = new THREE.BoxGeometry(0.72, 0.12, 0.42);
    const belt = new THREE.Mesh(beltGeo, matSecond);
    belt.position.y = 0.6;
    group.add(belt);
    // Hips
    const hipsGeo = new THREE.BoxGeometry(0.65, 0.3, 0.4);
    const hips = new THREE.Mesh(hipsGeo, matSecond);
    hips.position.y = 0.45;
    hips.castShadow = true;
    group.add(hips);
    // Head
    const headGroup = new THREE.Group();
    headGroup.position.y = 1.65;
    const headGeo = new THREE.SphereGeometry(0.28, 16, 16);
    const head = new THREE.Mesh(headGeo, matSkin);
    head.castShadow = true;
    headGroup.add(head);
    // Eyes
    const eyeGeo = new THREE.SphereGeometry(0.05, 8, 8);
    const eyeL = new THREE.Mesh(eyeGeo, matEye);
    eyeL.position.set(-0.09, 0.03, 0.24);
    headGroup.add(eyeL);
    const eyeR = new THREE.Mesh(eyeGeo, matEye);
    eyeR.position.set(0.09, 0.03, 0.24);
    headGroup.add(eyeR);
    // Hair
    addHair(headGroup, charId, matHair);
    group.add(headGroup);
    group.userData.head = headGroup;
    // Arms
    const armGeo = new THREE.BoxGeometry(0.18, 0.7, 0.18);
    const armL = new THREE.Mesh(armGeo, matMain);
    armL.position.set(-0.45, 1.05, 0);
    armL.castShadow = true;
    group.add(armL);
    group.userData.armL = armL;
    const armR = new THREE.Mesh(armGeo, matMain);
    armR.position.set(0.45, 1.05, 0);
    armR.castShadow = true;
    group.add(armR);
    group.userData.armR = armR;
    // Hands
    const handGeo = new THREE.SphereGeometry(0.11, 8, 8);
    const handL = new THREE.Mesh(handGeo, matSkin);
    handL.position.set(-0.45, 0.65, 0);
    group.add(handL);
    group.userData.handL = handL;
    const handR = new THREE.Mesh(handGeo, matSkin);
    handR.position.set(0.45, 0.65, 0);
    group.add(handR);
    group.userData.handR = handR;
    // Legs
    const legGeo = new THREE.BoxGeometry(0.22, 0.7, 0.22);
    const legL = new THREE.Mesh(legGeo, matSecond);
    legL.position.set(-0.18, 0.0, 0);
    legL.castShadow = true;
    group.add(legL);
    group.userData.legL = legL;
    const legR = new THREE.Mesh(legGeo, matSecond);
    legR.position.set(0.18, 0.0, 0);
    legR.castShadow = true;
    group.add(legR);
    group.userData.legR = legR;
    // Feet
    const footGeo = new THREE.BoxGeometry(0.25, 0.12, 0.35);
    const matFoot = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });
    const footL = new THREE.Mesh(footGeo, matFoot);
    footL.position.set(-0.18, -0.4, 0.05);
    group.add(footL);
    const footR = new THREE.Mesh(footGeo, matFoot);
    footR.position.set(0.18, -0.4, 0.05);
    group.add(footR);

    // Weapon
    addWeapon(group, def, charId);

    // Aura (transparent shell)
    const auraGeo = new THREE.SphereGeometry(1.2, 12, 12);
    const auraMat = new THREE.MeshBasicMaterial({
        color: auraColor, transparent: true, opacity: 0.0,
        side: THREE.BackSide, blending: THREE.AdditiveBlending
    });
    const aura = new THREE.Mesh(auraGeo, auraMat);
    aura.position.y = 1.0;
    group.add(aura);
    group.userData.aura = aura;

    // Name label sprite
    const nameTex = makeNameTexture('Player', mainColor);
    const nameMat = new THREE.SpriteMaterial({ map: nameTex, depthTest: false, transparent: true });
    const nameSprite = new THREE.Sprite(nameMat);
    nameSprite.position.y = 2.4;
    nameSprite.scale.set(2, 0.5, 1);
    group.add(nameSprite);
    group.userData.nameSprite = nameSprite;

    // HP bar sprite
    const hpCanvas = document.createElement('canvas');
    hpCanvas.width = 128; hpCanvas.height = 16;
    const hpTex = new THREE.CanvasTexture(hpCanvas);
    const hpMat = new THREE.SpriteMaterial({ map: hpTex, depthTest: false, transparent: true });
    const hpSprite = new THREE.Sprite(hpMat);
    hpSprite.position.y = 2.1;
    hpSprite.scale.set(1.6, 0.2, 1);
    group.add(hpSprite);
    group.userData.hpSprite = hpSprite;
    group.userData.hpCanvas = hpCanvas;
    group.userData.hpTex = hpTex;

    return group;
}

function getHairColor(charId) {
    const map = {
        rengoku: 0xff4400, hitsugaya: 0xeeeeff, minato: 0xffdd44, goku: 0x111111,
        ichigo: 0xff8800, naruto: 0xffdd44, nezuko: 0x111111, killua: 0xeeeeff,
        allmight: 0xffdd44, megumin: 0x111111, alucard: 0x111111, mitsuri: 0xff66aa
    };
    return map[charId] || 0x222222;
}

function getEyeColor(charId) {
    const map = {
        rengoku: 0xffaa00, hitsugaya: 0x44ccff, minato: 0x4488ff, goku: 0x222222,
        ichigo: 0x442200, naruto: 0x4488ff, nezuko: 0xff66aa, killua: 0x4488ff,
        allmight: 0x4488ff, megumin: 0xff0000, alucard: 0xff0000, mitsuri: 0x44dd44
    };
    return map[charId] || 0x000000;
}

function addHair(headGroup, charId, mat) {
    if (charId === 'goku' || charId === 'naruto' || charId === 'allmight') {
        // Spiky hair
        for (let i = 0; i < 7; i++) {
            const spikeGeo = new THREE.ConeGeometry(0.08, 0.25, 4);
            const spike = new THREE.Mesh(spikeGeo, mat);
            const ang = (i / 7) * Math.PI * 2;
            spike.position.set(Math.cos(ang) * 0.2, 0.22, Math.sin(ang) * 0.2);
            spike.rotation.x = (Math.random() - 0.5) * 0.4;
            spike.rotation.z = (Math.random() - 0.5) * 0.4;
            headGroup.add(spike);
        }
        const top = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat);
        top.position.y = 0.05;
        headGroup.add(top);
    } else if (charId === 'rengoku' || charId === 'mitsuri') {
        // Long flowing
        const back = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.5, 0.2), mat);
        back.position.set(0, -0.05, -0.18);
        headGroup.add(back);
        const top = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat);
        top.position.y = 0.05;
        headGroup.add(top);
    } else if (charId === 'hitsugaya' || charId === 'killua') {
        // Spiky white
        for (let i = 0; i < 5; i++) {
            const spike = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.2, 4), mat);
            spike.position.set((Math.random() - 0.5) * 0.3, 0.22, (Math.random() - 0.5) * 0.3);
            spike.rotation.z = (Math.random() - 0.5) * 0.5;
            headGroup.add(spike);
        }
        const top = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat);
        top.position.y = 0.04;
        headGroup.add(top);
    } else if (charId === 'minato') {
        // Bangs
        const top = new THREE.Mesh(new THREE.SphereGeometry(0.29, 12, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat);
        top.position.y = 0.04;
        headGroup.add(top);
        const bang = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.15, 0.1), mat);
        bang.position.set(0, 0.12, 0.22);
        headGroup.add(bang);
    } else if (charId === 'ichigo') {
        // Messy spiky orange
        const top = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat);
        top.position.y = 0.04;
        headGroup.add(top);
        for (let i = 0; i < 6; i++) {
            const spike = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.18, 4), mat);
            spike.position.set((Math.random() - 0.5) * 0.4, 0.18 + Math.random() * 0.1, (Math.random() - 0.5) * 0.3);
            spike.rotation.z = (Math.random() - 0.5) * 0.6;
            headGroup.add(spike);
        }
    } else if (charId === 'nezuko' || charId === 'megumin') {
        // Long dark
        const back = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.2), mat);
        back.position.set(0, -0.15, -0.15);
        headGroup.add(back);
        const top = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat);
        top.position.y = 0.05;
        headGroup.add(top);
        if (charId === 'megumin') {
            const hat = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.5, 8), new THREE.MeshStandardMaterial({ color: 0x000000 }));
            hat.position.y = 0.4;
            headGroup.add(hat);
        }
    } else if (charId === 'alucard') {
        // Long black flowing
        const back = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.9, 0.2), mat);
        back.position.set(0, -0.25, -0.1);
        headGroup.add(back);
        const top = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat);
        top.position.y = 0.05;
        headGroup.add(top);
        const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.4, 0.4, 12), new THREE.MeshStandardMaterial({ color: 0xaa0000 }));
        hat.position.y = 0.35;
        headGroup.add(hat);
        const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.05, 12), new THREE.MeshStandardMaterial({ color: 0xaa0000 }));
        brim.position.y = 0.16;
        headGroup.add(brim);
    } else {
        const top = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat);
        top.position.y = 0.03;
        headGroup.add(top);
    }
}

function addWeapon(group, def, charId) {
    const weapon = def.weapon;
    let weaponMesh = null;
    if (weapon === 'katana') {
        const wg = new THREE.Group();
        const blade = new THREE.Mesh(
            new THREE.BoxGeometry(0.06, 1.4, 0.12),
            new THREE.MeshStandardMaterial({
                color: 0xeeeeff, metalness: 0.9, roughness: 0.1,
                emissive: def.color, emissiveIntensity: 0.3
            })
        );
        blade.position.y = 0.7;
        wg.add(blade);
        const guard = new THREE.Mesh(
            new THREE.BoxGeometry(0.18, 0.06, 0.18),
            new THREE.MeshStandardMaterial({ color: 0x442200 })
        );
        wg.add(guard);
        const grip = new THREE.Mesh(
            new THREE.CylinderGeometry(0.04, 0.04, 0.3, 8),
            new THREE.MeshStandardMaterial({ color: 0x111111 })
        );
        grip.position.y = -0.15;
        wg.add(grip);
        weaponMesh = wg;
    } else if (weapon === 'greatsword') {
        const wg = new THREE.Group();
        const blade = new THREE.Mesh(
            new THREE.BoxGeometry(0.18, 2.0, 0.05),
            new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.95, roughness: 0.2 })
        );
        blade.position.y = 1.0;
        wg.add(blade);
        const grip = new THREE.Mesh(
            new THREE.CylinderGeometry(0.05, 0.05, 0.4, 8),
            new THREE.MeshStandardMaterial({ color: 0xaa0000 })
        );
        grip.position.y = -0.2;
        wg.add(grip);
        weaponMesh = wg;
    } else if (weapon === 'kunai') {
        const wg = new THREE.Group();
        const blade = new THREE.Mesh(
            new THREE.ConeGeometry(0.08, 0.3, 4),
            new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.9, roughness: 0.2 })
        );
        blade.position.y = 0.15;
        blade.rotation.x = Math.PI;
        wg.add(blade);
        const grip = new THREE.Mesh(
            new THREE.BoxGeometry(0.05, 0.15, 0.05),
            new THREE.MeshStandardMaterial({ color: 0x222222 })
        );
        grip.position.y = -0.07;
        wg.add(grip);
        weaponMesh = wg;
    } else if (weapon === 'staff') {
        const wg = new THREE.Group();
        const shaft = new THREE.Mesh(
            new THREE.CylinderGeometry(0.04, 0.04, 1.6, 8),
            new THREE.MeshStandardMaterial({ color: 0x442200 })
        );
        wg.add(shaft);
        const orb = new THREE.Mesh(
            new THREE.SphereGeometry(0.12, 12, 12),
            new THREE.MeshStandardMaterial({
                color: def.color, emissive: def.color, emissiveIntensity: 0.8
            })
        );
        orb.position.y = 0.85;
        wg.add(orb);
        weaponMesh = wg;
    } else if (weapon === 'whip_sword') {
        const wg = new THREE.Group();
        const grip = new THREE.Mesh(
            new THREE.CylinderGeometry(0.04, 0.04, 0.3, 8),
            new THREE.MeshStandardMaterial({ color: 0x222222 })
        );
        wg.add(grip);
        for (let i = 0; i < 6; i++) {
            const seg = new THREE.Mesh(
                new THREE.BoxGeometry(0.05, 0.2, 0.02),
                new THREE.MeshStandardMaterial({ color: 0xeeeeee, metalness: 0.8 })
            );
            seg.position.y = 0.2 + i * 0.15;
            seg.rotation.z = Math.sin(i) * 0.2;
            wg.add(seg);
        }
        weaponMesh = wg;
    } else if (weapon === 'pistols') {
        const wg = new THREE.Group();
        const body = new THREE.Mesh(
            new THREE.BoxGeometry(0.08, 0.18, 0.3),
            new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.9 })
        );
        wg.add(body);
        const barrel = new THREE.Mesh(
            new THREE.CylinderGeometry(0.025, 0.025, 0.2, 8),
            new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.95 })
        );
        barrel.rotation.z = Math.PI / 2;
        barrel.position.set(0, 0.05, 0.25);
        wg.add(barrel);
        weaponMesh = wg;
    } else if (weapon === 'claws') {
        const wg = new THREE.Group();
        for (let i = 0; i < 3; i++) {
            const claw = new THREE.Mesh(
                new THREE.ConeGeometry(0.025, 0.18, 4),
                new THREE.MeshStandardMaterial({ color: 0xeeeeee, metalness: 0.9 })
            );
            claw.position.set((i - 1) * 0.06, 0.1, 0.05);
            claw.rotation.x = -0.3;
            wg.add(claw);
        }
        weaponMesh = wg;
    }
    if (weaponMesh) {
        weaponMesh.position.set(0.45, 0.65, 0);
        if (weapon !== 'kunai' && weapon !== 'staff' && weapon !== 'pistols' && weapon !== 'claws') {
            weaponMesh.rotation.z = -0.1;
        }
        group.add(weaponMesh);
        group.userData.weapon = weaponMesh;
    }
}

function makeNameTexture(name, color) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 64;
    const ctx = c.getContext('2d');
    ctx.font = 'bold 32px Segoe UI';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'black';
    ctx.strokeText(name, 128, 32);
    ctx.fillStyle = '#' + color.toString(16).padStart(6, '0');
    ctx.fillText(name, 128, 32);
    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
}

function updateHpBar(group, hp, maxHp) {
    const c = group.userData.hpCanvas;
    if (!c) return;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 128, 16);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, 128, 16);
    const pct = Math.max(0, hp / maxHp);
    let col = '#33ff44';
    if (pct < 0.6) col = '#ffdd44';
    if (pct < 0.3) col = '#ff3344';
    ctx.fillStyle = col;
    ctx.fillRect(2, 2, 124 * pct, 12);
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, 128, 16);
    group.userData.hpTex.needsUpdate = true;
}

console.log('[CLIENT] Part 4 loaded - core systems and models');
// =============================================================================
// INPUT HANDLING
// =============================================================================
function setupInput() {
    window.addEventListener('keydown', (e) => {
        if (G.chatActive) {
            if (e.key === 'Enter') {
                const input = document.getElementById('ingame-chat-input');
                if (input.value.trim()) G.socket.emit('chat', { msg: input.value });
                input.value = '';
                input.classList.remove('active');
                input.blur();
                G.chatActive = false;
            } else if (e.key === 'Escape') {
                document.getElementById('ingame-chat-input').classList.remove('active');
                document.getElementById('ingame-chat-input').blur();
                G.chatActive = false;
            }
            return;
        }
        G.keys[e.code] = true;
        if (e.code === 'KeyT' && G.currentScreen === 'game-screen') {
            e.preventDefault();
            const input = document.getElementById('ingame-chat-input');
            input.classList.add('active');
            input.focus();
            G.chatActive = true;
        }
        if (e.code === 'Escape' && G.currentScreen === 'game-screen') {
            G.paused = !G.paused;
            document.getElementById('pause-menu').classList.toggle('hidden', !G.paused);
            if (G.paused && G.pointerLocked) document.exitPointerLock();
        }
        if (e.code === 'Tab' && G.currentScreen === 'game-screen') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => { G.keys[e.code] = false; });
    const canvas = document.getElementById('game-canvas');
    canvas.addEventListener('mousedown', (e) => {
        if (G.currentScreen !== 'game-screen' || G.paused || G.chatActive) return;
        if (!G.pointerLocked) { canvas.requestPointerLock(); return; }
        if (e.button === 0) G.mouseButtons.left = true;
        if (e.button === 2) G.mouseButtons.right = true;
    });
    window.addEventListener('mouseup', (e) => {
        if (e.button === 0) G.mouseButtons.left = false;
        if (e.button === 2) G.mouseButtons.right = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
        if (G.pointerLocked) {
            G.mouseDelta.x += e.movementX;
            G.mouseDelta.y += e.movementY;
        }
    });
    document.addEventListener('pointerlockchange', () => {
        G.pointerLocked = document.pointerLockElement === canvas;
    });
}

function gatherInput() {
    if (G.chatActive || G.paused) return null;
    G.cameraYaw -= G.mouseDelta.x * G.sensitivity;
    G.cameraPitch -= G.mouseDelta.y * G.sensitivity;
    G.cameraPitch = Math.max(-1.4, Math.min(1.4, G.cameraPitch));
    G.mouseDelta.x = 0; G.mouseDelta.y = 0;
    return {
        seq: ++G.inputSeq,
        forward: !!G.keys['KeyW'],
        backward: !!G.keys['KeyS'],
        left: !!G.keys['KeyA'],
        right: !!G.keys['KeyD'],
        jump: !!G.keys['Space'],
        dash: !!G.keys['ShiftLeft'] || !!G.keys['ShiftRight'],
        block: !!G.keys['KeyC'],
        parry: !!G.keys['KeyV'],
        lockOn: !!G.keys['Tab'],
        light: G.mouseButtons.left,
        heavy: G.mouseButtons.right,
        q: !!G.keys['KeyQ'],
        e: !!G.keys['KeyE'],
        r: !!G.keys['KeyR'],
        f: !!G.keys['KeyF'],
        cameraYaw: G.cameraYaw,
        cameraPitch: G.cameraPitch
    };
}

// =============================================================================
// STATE INTERPOLATION & PLAYER MESH SYNC
// =============================================================================
function lerp(a, b, t) { return a + (b - a) * t; }
function lerpAngle(a, b, t) {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
}

function getInterpolatedPlayer(id) {
    if (!G.state) return null;
    const cur = G.state.players.find(p => p.id === id);
    if (!cur) return null;
    if (!G.prevState) return cur;
    const prev = G.prevState.players.find(p => p.id === id);
    if (!prev) return cur;
    const t = Math.min(1, (performance.now() - G.lastStateMs) / G.stateInterval);
    return {
        ...cur,
        position: {
            x: lerp(prev.position.x, cur.position.x, t),
            y: lerp(prev.position.y, cur.position.y, t),
            z: lerp(prev.position.z, cur.position.z, t)
        },
        rotation: lerpAngle(prev.rotation, cur.rotation, t)
    };
}

function syncPlayers() {
    if (!G.state) return;
    const seenIds = new Set();
    for (const p of G.state.players) {
        seenIds.add(p.id);
        let mesh = G.playerMeshes.get(p.id);
        if (!mesh) {
            mesh = buildCharacterModel(p.characterId);
            mesh.userData.charId = p.characterId;
            const nameTex = makeNameTexture(p.name, G.characterDefs[p.characterId].color);
            mesh.userData.nameSprite.material.map = nameTex;
            mesh.userData.nameSprite.material.needsUpdate = true;
            G.playersGroup.add(mesh);
            G.playerMeshes.set(p.id, mesh);
        }
        if (mesh.userData.charId !== p.characterId) {
            G.playersGroup.remove(mesh);
            mesh = buildCharacterModel(p.characterId);
            mesh.userData.charId = p.characterId;
            const nameTex = makeNameTexture(p.name, G.characterDefs[p.characterId].color);
            mesh.userData.nameSprite.material.map = nameTex;
            G.playersGroup.add(mesh);
            G.playerMeshes.set(p.id, mesh);
        }
        const ip = getInterpolatedPlayer(p.id);
        mesh.position.set(ip.position.x, ip.position.y - 1.0 + 0.4, ip.position.z);
        mesh.rotation.y = ip.rotation;
        mesh.visible = !p.dead;
        updateHpBar(mesh, p.hp, p.maxHp);
        const aura = mesh.userData.aura;
        if (aura) {
            let auraOpacity = 0;
            if (p.transformedSuper) auraOpacity = 0.4;
            else if (p.maskActive) auraOpacity = 0.3;
            else if (p.statusEffects.includes('BUFF_ATK') || p.statusEffects.includes('BUFF_SPEED')) auraOpacity = 0.25;
            else if (p.invulnerable) auraOpacity = 0.5;
            aura.material.opacity = lerp(aura.material.opacity, auraOpacity, 0.15);
            aura.scale.setScalar(1 + Math.sin(performance.now() * 0.005) * 0.05);
        }
        animateLimbs(mesh, p, ip);
    }
    for (const [id, mesh] of G.playerMeshes) {
        if (!seenIds.has(id)) {
            G.playersGroup.remove(mesh);
            G.playerMeshes.delete(id);
        }
    }
}

function animateLimbs(mesh, p, ip) {
    const moving = Math.abs(p.velocity.x) > 0.5 || Math.abs(p.velocity.z) > 0.5;
    const t = performance.now() * 0.01;
    const speed = moving ? Math.min(1.2, Math.sqrt(p.velocity.x ** 2 + p.velocity.z ** 2) * 0.1) : 0;
    if (mesh.userData.legL && mesh.userData.legR) {
        mesh.userData.legL.rotation.x = Math.sin(t * speed * 8) * 0.6 * speed;
        mesh.userData.legR.rotation.x = -Math.sin(t * speed * 8) * 0.6 * speed;
    }
    if (mesh.userData.armL && mesh.userData.armR) {
        mesh.userData.armL.rotation.x = -Math.sin(t * speed * 8) * 0.5 * speed;
        mesh.userData.armR.rotation.x = Math.sin(t * speed * 8) * 0.5 * speed;
    }
    if (!moving) {
        const idle = Math.sin(t * 0.4) * 0.05;
        if (mesh.userData.head) mesh.userData.head.position.y = 1.65 + idle;
    }
}

function syncProjectiles() {
    if (!G.state) return;
    const seen = new Set();
    for (const proj of G.state.projectiles) {
        seen.add(proj.id);
        let mesh = G.projectileMeshes.get(proj.id);
        if (!mesh) {
            mesh = buildProjectileMesh(proj);
            G.projectilesGroup.add(mesh);
            G.projectileMeshes.set(proj.id, mesh);
        }
        mesh.position.set(proj.position.x, proj.position.y, proj.position.z);
        if (proj.velocity.x !== 0 || proj.velocity.z !== 0) {
            mesh.lookAt(mesh.position.x + proj.velocity.x, mesh.position.y + proj.velocity.y, mesh.position.z + proj.velocity.z);
        }
        if (mesh.userData.spin) {
            mesh.rotation.x += 0.2;
            mesh.rotation.z += 0.15;
        }
    }
    for (const [id, mesh] of G.projectileMeshes) {
        if (!seen.has(id)) {
            G.projectilesGroup.remove(mesh);
            G.projectileMeshes.delete(id);
        }
    }
}

function buildProjectileMesh(proj) {
    const g = new THREE.Group();
    const color = proj.color || 0xffffff;
    if (proj.beam) {
        const len = 30;
        const geo = new THREE.CylinderGeometry(proj.beamWidth || 1.5, proj.beamWidth || 1.5, len, 12);
        const mat = new THREE.MeshBasicMaterial({
            color: color, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending
        });
        const beam = new THREE.Mesh(geo, mat);
        beam.rotation.x = Math.PI / 2;
        beam.position.z = len / 2;
        g.add(beam);
        const inner = new THREE.Mesh(
            new THREE.CylinderGeometry((proj.beamWidth || 1.5) * 0.4, (proj.beamWidth || 1.5) * 0.4, len, 8),
            new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 })
        );
        inner.rotation.x = Math.PI / 2;
        inner.position.z = len / 2;
        g.add(inner);
        const light = new THREE.PointLight(color, 2, 20);
        g.add(light);
    } else {
        const geo = new THREE.SphereGeometry(proj.radius || 0.4, 12, 12);
        const mat = new THREE.MeshBasicMaterial({
            color: color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending
        });
        const core = new THREE.Mesh(geo, mat);
        g.add(core);
        const glow = new THREE.Mesh(
            new THREE.SphereGeometry((proj.radius || 0.4) * 1.8, 12, 12),
            new THREE.MeshBasicMaterial({
                color: color, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending
            })
        );
        g.add(glow);
        const light = new THREE.PointLight(color, 1.2, 8);
        g.add(light);
        if (proj.visualType === 'crescent_wave') {
            const wave = new THREE.Mesh(
                new THREE.TorusGeometry(1.2, 0.3, 8, 16, Math.PI),
                new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.7, side: THREE.DoubleSide })
            );
            wave.rotation.x = Math.PI / 2;
            g.add(wave);
        }
        if (proj.visualType === 'rasengan') {
            const rg = new THREE.Mesh(
                new THREE.SphereGeometry(0.7, 16, 16),
                new THREE.MeshBasicMaterial({ color: 0x44ddff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending })
            );
            g.add(rg);
            g.userData.spin = true;
        }
    }
    return g;
}

// =============================================================================
// CAMERA (Third-person follow)
// =============================================================================
function updateCamera(dt) {
    const me = G.state ? G.state.players.find(p => p.id === G.selfId) : null;
    if (!me) return;
    const ip = getInterpolatedPlayer(G.selfId) || me;
    const target = new THREE.Vector3(ip.position.x, ip.position.y + 1.5, ip.position.z);
    G.cameraTarget.lerp(target, 0.25);
    const yaw = G.cameraYaw;
    const pitch = G.cameraPitch;
    const dist = G.cameraDistance;
    const cx = G.cameraTarget.x - Math.sin(yaw) * Math.cos(pitch) * dist;
    const cy = G.cameraTarget.y - Math.sin(pitch) * dist + 1.5;
    const cz = G.cameraTarget.z - Math.cos(yaw) * Math.cos(pitch) * dist;
    G.camera.position.set(cx, cy, cz);
    G.camera.lookAt(G.cameraTarget);
    if (G.cameraShakeTime > 0) {
        G.cameraShakeTime -= dt;
        const s = G.cameraShake * (G.cameraShakeTime / 0.3);
        G.camera.position.x += (Math.random() - 0.5) * s;
        G.camera.position.y += (Math.random() - 0.5) * s;
        G.camera.position.z += (Math.random() - 0.5) * s;
    }
    if (me.lockOnTarget) {
        const lt = G.state.players.find(pl => pl.id === me.lockOnTarget);
        if (lt && !lt.dead) {
            const screenPos = new THREE.Vector3(lt.position.x, lt.position.y + 1.5, lt.position.z);
            screenPos.project(G.camera);
            const sx = (screenPos.x * 0.5 + 0.5) * window.innerWidth;
            const sy = (-screenPos.y * 0.5 + 0.5) * window.innerHeight;
            const ind = document.getElementById('lockon-indicator');
            ind.classList.remove('hidden');
            ind.style.left = sx + 'px';
            ind.style.top = sy + 'px';
        } else {
            document.getElementById('lockon-indicator').classList.add('hidden');
        }
    } else {
        document.getElementById('lockon-indicator').classList.add('hidden');
    }
}

function shakeCamera(intensity) {
    G.cameraShake = Math.max(G.cameraShake, intensity);
    G.cameraShakeTime = 0.3;
}

// =============================================================================
// EFFECTS / PARTICLES
// =============================================================================
function spawnEffect(type, data) {
    if (type === 'hit') spawnHitEffect(data);
    else if (type === 'death') spawnDeathEffect(data);
    else if (type === 'explosion') spawnExplosion(data);
    else if (type === 'aoe_burst') spawnExplosion(data);
    else if (type === 'beam_charge') spawnBeamCharge(data);
    else if (type === 'cast') spawnCastEffect(data);
    else if (type === 'dash') spawnDashTrail(data);
    else if (type === 'blink' || type === 'teleport_flash') spawnTeleportFlash(data);
    else if (type === 'parry') spawnParryEffect(data);
    else if (type === 'block') spawnBlockEffect(data);
    else if (type === 'buff') spawnBuffEffect(data);
    else if (type === 'transform') spawnTransformEffect(data);
    else if (type === 'double_jump') spawnDoubleJumpEffect(data);
    else if (type === 'chain_lightning') spawnChainLightning(data);
    else if (type === 'ice_pillar') spawnIcePillar(data);
    else if (type === 'respawn') spawnRespawnEffect(data);
    else if (type === 'clone_summon') spawnTeleportFlash(data);
}

function makeParticle(opts) {
    const geo = new THREE.SphereGeometry(opts.size || 0.15, 6, 6);
    const mat = new THREE.MeshBasicMaterial({
        color: opts.color || 0xffffff,
        transparent: true,
        opacity: opts.opacity || 1,
        blending: THREE.AdditiveBlending
    });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(opts.x, opts.y, opts.z);
    m.userData = {
        vx: opts.vx || 0, vy: opts.vy || 0, vz: opts.vz || 0,
        life: opts.life || 0.8, maxLife: opts.life || 0.8,
        gravity: opts.gravity !== undefined ? opts.gravity : -8,
        scale: opts.scale || 1
    };
    G.effectsGroup.add(m);
    G.activeEffects.push(m);
    return m;
}

function spawnHitEffect(data) {
    const p = data.position;
    if (data.damage) showDamagePopup(p, data.damage, data.critical);
    const color = data.critical ? 0xffdd44 : 0xff4422;
    for (let i = 0; i < 12; i++) {
        const ang = Math.random() * Math.PI * 2;
        const elev = Math.random() * Math.PI - Math.PI / 2;
        const sp = 4 + Math.random() * 6;
        makeParticle({
            x: p.x, y: p.y + 1, z: p.z,
            vx: Math.cos(ang) * Math.cos(elev) * sp,
            vy: Math.sin(elev) * sp + 2,
            vz: Math.sin(ang) * Math.cos(elev) * sp,
            color, size: 0.1 + Math.random() * 0.1, life: 0.5
        });
    }
    const flash = new THREE.PointLight(color, 4, 6);
    flash.position.set(p.x, p.y + 1, p.z);
    G.effectsGroup.add(flash);
    G.activeEffects.push(Object.assign(flash, { userData: { life: 0.15, maxLife: 0.15, isLight: true } }));
    if (data.critical) shakeCamera(0.4);
    else shakeCamera(0.15);
}

function spawnDeathEffect(data) {
    const p = data.position;
    for (let i = 0; i < 30; i++) {
        const ang = Math.random() * Math.PI * 2;
        const sp = 5 + Math.random() * 8;
        makeParticle({
            x: p.x, y: p.y + 1, z: p.z,
            vx: Math.cos(ang) * sp,
            vy: 3 + Math.random() * 6,
            vz: Math.sin(ang) * sp,
            color: 0xff2244, size: 0.2, life: 1.2
        });
    }
    shakeCamera(0.5);
}

function spawnExplosion(data) {
    const p = data.position;
    const r = data.radius || 4;
    const color = data.color || 0xff8800;
    const ringGeo = new THREE.RingGeometry(0.5, 1, 24);
    const ringMat = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 1, side: THREE.DoubleSide, blending: THREE.AdditiveBlending
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(p.x, p.y + 0.2, p.z);
    ring.rotation.x = -Math.PI / 2;
    ring.userData = { isRing: true, life: 0.6, maxLife: 0.6, targetScale: r };
    G.effectsGroup.add(ring);
    G.activeEffects.push(ring);
    for (let i = 0; i < 25; i++) {
        const ang = Math.random() * Math.PI * 2;
        const sp = 4 + Math.random() * 8;
        makeParticle({
            x: p.x, y: p.y + 0.5, z: p.z,
            vx: Math.cos(ang) * sp,
            vy: 2 + Math.random() * 5,
            vz: Math.sin(ang) * sp,
            color, size: 0.2 + Math.random() * 0.2, life: 0.8
        });
    }
    const light = new THREE.PointLight(color, 6, r * 2);
    light.position.set(p.x, p.y + 1, p.z);
    G.effectsGroup.add(light);
    G.activeEffects.push(Object.assign(light, { userData: { life: 0.4, maxLife: 0.4, isLight: true } }));
    shakeCamera(0.6);
}

function spawnBeamCharge(data) {
    const p = data.position;
    for (let i = 0; i < 20; i++) {
        const ang = Math.random() * Math.PI * 2;
        const r = 1 + Math.random() * 2;
        makeParticle({
            x: p.x + Math.cos(ang) * r, y: p.y + 1 + (Math.random() - 0.5) * 1.5, z: p.z + Math.sin(ang) * r,
            vx: -Math.cos(ang) * 4, vy: 0, vz: -Math.sin(ang) * 4,
            color: data.color || 0xffffff, size: 0.15, life: 0.4, gravity: 0
        });
    }
    shakeCamera(0.3);
}

function spawnCastEffect(data) {
    const p = data.position;
    for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2;
        makeParticle({
            x: p.x + Math.cos(ang) * 0.8, y: p.y + 0.5, z: p.z + Math.sin(ang) * 0.8,
            vx: Math.cos(ang) * 2, vy: 3, vz: Math.sin(ang) * 2,
            color: data.color || 0xffffff, size: 0.1, life: 0.5
        });
    }
}

function spawnDashTrail(data) {
    const p = data.position;
    for (let i = 0; i < 8; i++) {
        makeParticle({
            x: p.x + (Math.random() - 0.5) * 0.5, y: p.y + Math.random() * 1.5, z: p.z + (Math.random() - 0.5) * 0.5,
            vx: -(data.dir.x || 0) * 4 + (Math.random() - 0.5),
            vy: 0,
            vz: -(data.dir.z || 0) * 4 + (Math.random() - 0.5),
            color: data.color || 0x44ddff, size: 0.15, life: 0.3, gravity: 0
        });
    }
}

function spawnTeleportFlash(data) {
    const p = data.position;
    const ringGeo = new THREE.RingGeometry(0.2, 0.4, 16);
    const ringMat = new THREE.MeshBasicMaterial({
        color: data.color || 0xffdd44, transparent: true, opacity: 1, side: THREE.DoubleSide, blending: THREE.AdditiveBlending
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(p.x, p.y + 1, p.z);
    ring.rotation.x = -Math.PI / 2;
    ring.userData = { isRing: true, life: 0.4, maxLife: 0.4, targetScale: 3 };
    G.effectsGroup.add(ring);
    G.activeEffects.push(ring);
    for (let i = 0; i < 15; i++) {
        const ang = Math.random() * Math.PI * 2;
        makeParticle({
            x: p.x, y: p.y + 1, z: p.z,
            vx: Math.cos(ang) * 5, vy: Math.random() * 4, vz: Math.sin(ang) * 5,
            color: data.color || 0xffdd44, size: 0.12, life: 0.4, gravity: 0
        });
    }
}

function spawnParryEffect(data) {
    const p = data.position;
    for (let i = 0; i < 20; i++) {
        const ang = Math.random() * Math.PI * 2;
        makeParticle({
            x: p.x, y: p.y + 1, z: p.z,
            vx: Math.cos(ang) * 8, vy: Math.random() * 4, vz: Math.sin(ang) * 8,
            color: 0xffffff, size: 0.15, life: 0.4, gravity: 0
        });
    }
    shakeCamera(0.4);
}

function spawnBlockEffect(data) {
    const p = data.position;
    for (let i = 0; i < 6; i++) {
        const ang = Math.random() * Math.PI * 2;
        makeParticle({
            x: p.x, y: p.y + 1, z: p.z,
            vx: Math.cos(ang) * 3, vy: 1, vz: Math.sin(ang) * 3,
            color: 0x88aaff, size: 0.1, life: 0.3
        });
    }
}

function spawnBuffEffect(data) {
    const p = data.position;
    for (let i = 0; i < 12; i++) {
        const ang = (i / 12) * Math.PI * 2;
        makeParticle({
            x: p.x + Math.cos(ang) * 0.8, y: p.y, z: p.z + Math.sin(ang) * 0.8,
            vx: 0, vy: 4 + Math.random() * 2, vz: 0,
            color: data.color || 0xffdd44, size: 0.15, life: 0.8, gravity: 0
        });
    }
}

function spawnTransformEffect(data) {
    const p = data.position;
    const color = data.type === 'super_saiyan' ? 0xffdd44 : 0x000000;
    for (let i = 0; i < 40; i++) {
        const ang = Math.random() * Math.PI * 2;
        const r = Math.random() * 1.5;
        makeParticle({
            x: p.x + Math.cos(ang) * r, y: p.y + Math.random() * 2, z: p.z + Math.sin(ang) * r,
            vx: 0, vy: 8 + Math.random() * 4, vz: 0,
            color, size: 0.2, life: 1.2, gravity: 0
        });
    }
    const light = new THREE.PointLight(color === 0x000000 ? 0xff0000 : color, 8, 12);
    light.position.set(p.x, p.y + 1, p.z);
    G.effectsGroup.add(light);
    G.activeEffects.push(Object.assign(light, { userData: { life: 0.8, maxLife: 0.8, isLight: true } }));
    shakeCamera(0.7);
}

function spawnDoubleJumpEffect(data) {
    const p = data.position;
    const ringGeo = new THREE.RingGeometry(0.3, 0.5, 16);
    const ringMat = new THREE.MeshBasicMaterial({
        color: 0x88ddff, transparent: true, opacity: 0.9, side: THREE.DoubleSide, blending: THREE.AdditiveBlending
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(p.x, p.y, p.z);
    ring.rotation.x = -Math.PI / 2;
    ring.userData = { isRing: true, life: 0.4, maxLife: 0.4, targetScale: 2 };
    G.effectsGroup.add(ring);
    G.activeEffects.push(ring);
}

function spawnChainLightning(data) {
    const start = data.from, end = data.to;
    const segments = 8;
    const points = [];
    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        points.push(new THREE.Vector3(
            lerp(start.x, end.x, t) + (Math.random() - 0.5) * 0.6,
            lerp(start.y + 1, end.y + 1, t) + (Math.random() - 0.5) * 0.6,
            lerp(start.z, end.z, t) + (Math.random() - 0.5) * 0.6
        ));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({ color: data.color || 0xffff44, transparent: true, opacity: 1 });
    const line = new THREE.Line(geo, mat);
    line.userData = { isLine: true, life: 0.25, maxLife: 0.25 };
    G.effectsGroup.add(line);
    G.activeEffects.push(line);
}

function spawnIcePillar(data) {
    const p = data.position;
    const r = data.radius || 3;
    const geo = new THREE.CylinderGeometry(r * 0.6, r, 8, 8);
    const mat = new THREE.MeshBasicMaterial({
        color: 0x88ddff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending
    });
    const pillar = new THREE.Mesh(geo, mat);
    pillar.position.set(p.x, p.y + 4, p.z);
    pillar.userData = { isMesh: true, life: 0.8, maxLife: 0.8 };
    G.effectsGroup.add(pillar);
    G.activeEffects.push(pillar);
}

function spawnRespawnEffect(data) {
    const p = data.position;
    for (let i = 0; i < 20; i++) {
        const ang = Math.random() * Math.PI * 2;
        makeParticle({
            x: p.x + Math.cos(ang) * 2, y: p.y, z: p.z + Math.sin(ang) * 2,
            vx: 0, vy: 4, vz: 0,
            color: 0x44ff88, size: 0.15, life: 0.8, gravity: -2
        });
    }
}

function updateEffects(dt) {
    for (let i = G.activeEffects.length - 1; i >= 0; i--) {
        const e = G.activeEffects[i];
        e.userData.life -= dt;
        if (e.userData.life <= 0) {
            G.effectsGroup.remove(e);
            if (e.geometry) e.geometry.dispose();
            if (e.material) e.material.dispose();
            G.activeEffects.splice(i, 1);
            continue;
        }
        const t = e.userData.life / e.userData.maxLife;
        if (e.userData.isLight) {
            e.intensity = e.intensity * 0.85;
        } else if (e.userData.isRing) {
            const s = lerp(0.5, e.userData.targetScale, 1 - t);
            e.scale.set(s, s, s);
            e.material.opacity = t;
        } else if (e.userData.isLine) {
            e.material.opacity = t;
        } else if (e.userData.isMesh) {
            e.material.opacity = t * 0.6;
        } else {
            e.position.x += e.userData.vx * dt;
            e.position.y += e.userData.vy * dt;
            e.position.z += e.userData.vz * dt;
            e.userData.vy += e.userData.gravity * dt;
            e.material.opacity = t;
            const sc = e.userData.scale * (0.5 + t * 0.5);
            e.scale.set(sc, sc, sc);
        }
    }
}

// =============================================================================
// HUD UPDATES
// =============================================================================
function updateHUD() {
    if (!G.state) return;
    const me = G.state.players.find(p => p.id === G.selfId);
    if (!me) return;
    const m = Math.floor(Math.max(0, G.state.timer) / 60);
    const s = Math.floor(Math.max(0, G.state.timer) % 60);
    document.getElementById('hud-timer').textContent = `${m}:${s.toString().padStart(2, '0')}`;
    const scoresEl = document.getElementById('hud-scores');
    if (G.currentRoom && G.modeDefs[G.currentRoom.mode] && G.modeDefs[G.currentRoom.mode].teamBased) {
        scoresEl.innerHTML = `<span class="team-score-1">RED: ${G.state.teamScores[1] || 0}</span> <span class="team-score-2">BLUE: ${G.state.teamScores[2] || 0}</span>`;
    } else {
        const top = [...G.state.players].sort((a, b) => b.score - a.score).slice(0, 3);
        scoresEl.innerHTML = top.map(p => `<span>${escapeHtml(p.name)}: ${p.score}</span>`).join(' ');
    }
    document.getElementById('hud-name').textContent = me.name;
    document.getElementById('hud-character').textContent = G.characterDefs[me.characterId].name;
    const hpPct = Math.max(0, me.hp / me.maxHp) * 100;
    document.getElementById('bar-hp').style.width = hpPct + '%';
    document.getElementById('hp-text').textContent = `${Math.ceil(me.hp)}/${me.maxHp}`;
    const mpPct = Math.max(0, me.mp / me.maxMp) * 100;
    document.getElementById('bar-mp').style.width = mpPct + '%';
    document.getElementById('mp-text').textContent = `${Math.ceil(me.mp)}/${me.maxMp}`;
    const ultPct = Math.min(100, me.ultGauge);
    document.getElementById('bar-ult').style.width = ultPct + '%';
    document.getElementById('ult-text').textContent = Math.floor(ultPct) + '%';
    const ultSlot = document.querySelector('.ult-slot');
    ultSlot.classList.toggle('ult-ready', ultPct >= 100);
    const cdef = G.characterDefs[me.characterId];
    const slots = ['light', 'heavy', 'q', 'e', 'r', 'f'];
    for (const slot of slots) {
        const ab = cdef.abilities[slot];
        if (ab) document.getElementById('ab-' + slot).textContent = ab.name.length > 14 ? ab.name.substring(0, 12) + '..' : ab.name;
        const cd = me.cooldowns[slot] || 0;
        const cdEl = document.getElementById('cd-' + slot);
        if (cd > 0.05) {
            cdEl.classList.add('active');
            cdEl.textContent = cd.toFixed(1);
        } else {
            cdEl.classList.remove('active');
        }
    }
    for (let i = 1; i <= 3; i++) {
        document.getElementById('dash-' + i).classList.toggle('full', me.dashCharges >= i);
    }
    const comboEl = document.getElementById('hud-combo');
    if (me.comboCount >= 2) {
        comboEl.classList.remove('hidden');
        document.getElementById('combo-num').textContent = me.comboCount;
    } else {
        comboEl.classList.add('hidden');
    }
    const statusWrap = document.getElementById('status-icons');
    statusWrap.innerHTML = '';
    for (const sid of me.statusEffects) {
        const def = G.statusEffectDefs[sid];
        if (!def) continue;
        const el = document.createElement('div');
        el.className = 'status-icon';
        el.textContent = def.name;
        el.style.background = '#' + (def.color || 0xffffff).toString(16).padStart(6, '0');
        el.style.color = 'black';
        statusWrap.appendChild(el);
    }
    const deathOv = document.getElementById('death-overlay');
    if (me.dead) {
        deathOv.classList.remove('hidden');
        document.getElementById('respawn-timer').textContent = Math.ceil(me.respawnTimer);
    } else {
        deathOv.classList.add('hidden');
    }
    document.getElementById('fps').textContent = 'FPS: ' + G.fps;
    document.getElementById('ping-ingame').textContent = 'Ping: ' + G.pingMs + 'ms';
    const pingEl = document.getElementById('ping-display');
    if (pingEl) pingEl.textContent = 'Ping: ' + G.pingMs + 'ms';
}

function showDamagePopup(worldPos, dmg, crit) {
    const v = new THREE.Vector3(worldPos.x, worldPos.y + 2, worldPos.z);
    v.project(G.camera);
    if (v.z > 1) return;
    const sx = (v.x * 0.5 + 0.5) * window.innerWidth;
    const sy = (-v.y * 0.5 + 0.5) * window.innerHeight;
    const el = document.createElement('div');
    el.className = 'dmg-popup' + (crit ? ' crit' : '');
    el.textContent = (crit ? '!' : '') + Math.round(dmg);
    el.style.left = (sx + (Math.random() - 0.5) * 40) + 'px';
    el.style.top = sy + 'px';
    document.getElementById('damage-popups').appendChild(el);
    setTimeout(() => el.remove(), 1000);
}

function addKillfeedEntry(k) {
    const wrap = document.getElementById('killfeed');
    const el = document.createElement('div');
    el.className = 'kill-entry';
    const killerName = k.killer ? `<span class="kill-killer">${escapeHtml(k.killer.name)}</span>` : '<span>WORLD</span>';
    el.innerHTML = `${killerName} → <span class="kill-victim">${escapeHtml(k.victim.name)}</span>`;
    wrap.appendChild(el);
    setTimeout(() => el.remove(), 5000);
    while (wrap.children.length > 6) wrap.removeChild(wrap.firstChild);
}

function showMatchEnd(data) {
    const screen = document.getElementById('match-end');
    screen.classList.remove('hidden');
    document.getElementById('match-end-winner').textContent = (data.winner || 'Match Over') + ' WINS!';
    const stWrap = document.getElementById('match-standings');
    stWrap.innerHTML = '<div class="standing-row" style="font-weight:bold;color:#ffdd44"><div>#</div><div>Player</div><div>Character</div><div>K</div><div>D</div><div>DMG</div></div>';
    let i = 0;
    for (const s of data.standings) {
        i++;
        const row = document.createElement('div');
        row.className = 'standing-row' + (i === 1 ? ' gold' : (i === 2 ? ' silver' : (i === 3 ? ' bronze' : '')));
        const cdef = G.characterDefs[s.character];
        const dmg = (s.damageDealt !== undefined) ? s.damageDealt : 0;
        row.innerHTML = `<div>${i}</div><div>${escapeHtml(s.name)}</div><div>${cdef ? cdef.name : '?'}</div><div>${s.kills}</div><div>${s.deaths}</div><div>${dmg}</div>`;
        stWrap.appendChild(row);
    }
}

// =============================================================================
// MATCH START / MAIN LOOP
// =============================================================================
function startMatch() {
    showScreen('game-screen');
    if (!G.scene) initThree();
    buildArena(G.currentRoom.mapId);
    for (const [id, m] of G.playerMeshes) G.playersGroup.remove(m);
    G.playerMeshes.clear();
    for (const [id, m] of G.projectileMeshes) G.projectilesGroup.remove(m);
    G.projectileMeshes.clear();
    setTimeout(() => {
        document.getElementById('game-canvas').requestPointerLock();
    }, 200);
}

function mainLoop() {
    requestAnimationFrame(mainLoop);
    const now = performance.now();
    const dt = Math.min(0.1, (now - G.lastFrameMs) / 1000);
    G.lastFrameMs = now;
    G.fpsCounter++;
    G.fpsTimer += dt;
    if (G.fpsTimer >= 1) {
        G.fps = G.fpsCounter;
        G.fpsCounter = 0;
        G.fpsTimer = 0;
    }
    if (G.currentScreen === 'game-screen' && !G.paused) {
        const input = gatherInput();
        if (input && G.connected) G.socket.emit('input', input);
        syncPlayers();
        syncProjectiles();
        updateCamera(dt);
        updateEffects(dt);
        updateHUD();
        for (const child of G.arenaGroup.children) {
            if (child.userData && child.userData.spin) {
                child.rotation.x += child.userData.spin.x * dt;
                child.rotation.y += child.userData.spin.y * dt;
            }
        }
        if (G.scene && G.camera && G.renderer) G.renderer.render(G.scene, G.camera);
    }
}

// =============================================================================
// BOOTSTRAP
// =============================================================================
window.addEventListener('load', () => {
    setLoadingProgress(10, 'Initializing...');
    setupMenuHandlers();
    setupInput();
    initNetwork();
    initThree();
    G.lastFrameMs = performance.now();
    requestAnimationFrame(mainLoop);
});

console.log('[CLIENT] Anime Battle Arena 3D - All systems ready');
