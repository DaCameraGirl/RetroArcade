(function(){
  'use strict';

  const STORAGE_KEY = 'retroArcadePokerRoomStateV1';
  const ROOMS = [
    { id: 'main', name: 'Main Lounge', limit: 'Social tables', tone: 'Open seating and casual chat' },
    { id: 'beginner', name: 'Beginner Room', limit: '10 / 20', tone: 'Slower pace and smaller pots' },
    { id: 'club', name: 'Night Club', limit: '25 / 50', tone: 'Full tables and faster action' },
  ];
  const TABLE_NAMES = ['Atlantic', 'Boardwalk', 'Monarch', 'Starlight', 'Riviera', 'Crescent'];
  const CHAT_NAMES = ['Mack', 'Rosa', 'Chip', 'Dee'];

  let mounted = null;
  let audioContext = null;
  let ambience = null;

  function getAudioContext(){
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if(!AudioCtor) return null;
    if(!audioContext) audioContext = new AudioCtor();
    if(audioContext.state === 'suspended') audioContext.resume().catch(function(){});
    return audioContext;
  }

  function tone(freq, duration, type, gain, delay){
    const ctx = getAudioContext();
    if(!ctx) return;
    const start = ctx.currentTime + (delay || 0);
    const osc = ctx.createOscillator();
    const vol = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, start);
    vol.gain.setValueAtTime(0.0001, start);
    vol.gain.exponentialRampToValueAtTime(Math.max(gain || 0.02, 0.0001), start + 0.012);
    vol.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(vol);
    vol.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + duration + 0.04);
  }

  function startAmbience(){
    const ctx = getAudioContext();
    if(!ctx || ambience) return;
    const master = ctx.createGain();
    const low = ctx.createOscillator();
    const high = ctx.createOscillator();
    low.type = 'sine';
    high.type = 'triangle';
    low.frequency.value = 82;
    high.frequency.value = 124;
    master.gain.setValueAtTime(0.0001, ctx.currentTime);
    master.gain.exponentialRampToValueAtTime(0.0045, ctx.currentTime + 0.35);
    low.connect(master);
    high.connect(master);
    master.connect(ctx.destination);
    low.start();
    high.start();
    ambience = { master: master, nodes: [low, high] };
  }

  function stopAmbience(){
    if(!ambience || !audioContext) return;
    const ctx = audioContext;
    ambience.master.gain.cancelScheduledValues(ctx.currentTime);
    ambience.master.gain.setValueAtTime(Math.max(ambience.master.gain.value, 0.0001), ctx.currentTime);
    ambience.master.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.2);
    ambience.nodes.forEach(function(node){
      try{ node.stop(ctx.currentTime + 0.24); }catch(err){}
    });
    ambience = null;
  }

  function playRoomSound(name){
    if(name === 'enter'){
      tone(392, 0.08, 'triangle', 0.018, 0);
      tone(523, 0.1, 'triangle', 0.018, 0.07);
      tone(659, 0.12, 'triangle', 0.014, 0.14);
    }else if(name === 'seat'){
      tone(780, 0.035, 'square', 0.018, 0);
      tone(410, 0.05, 'triangle', 0.012, 0.035);
    }else if(name === 'chat'){
      tone(640, 0.045, 'sine', 0.012, 0);
      tone(840, 0.035, 'sine', 0.009, 0.045);
    }else{
      tone(260, 0.05, 'triangle', 0.012, 0);
    }
  }

  function loadState(){
    try{
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return {
        roomId: saved.roomId || 'main',
        tableId: saved.tableId || null,
        seat: Number.isFinite(saved.seat) ? saved.seat : 0,
        playerName: saved.playerName || 'Angela',
      };
    }catch(err){
      return { roomId: 'main', tableId: null, seat: 0, playerName: 'Angela' };
    }
  }

  function saveState(){
    if(!mounted) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      roomId: mounted.roomId,
      tableId: mounted.tableId,
      seat: mounted.seat,
      playerName: mounted.playerName,
    }));
  }

  function escapeHtml(value){
    return String(value).replace(/[&<>"]/g, function(ch){
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch];
    });
  }

  function currentRoom(){
    return ROOMS.find(function(room){ return room.id === mounted.roomId; }) || ROOMS[0];
  }

  function selectedEngine(){
    if(!mounted || !mounted.selected) return null;
    if(mounted.selected.engine === 'draw') return window.RetroArcadeDrawPoker;
    return window.RetroArcadePoker;
  }

  function tableList(roomId){
    const selected = mounted.selected || { id: 'poker', name: 'Poker' };
    return TABLE_NAMES.map(function(name, index){
      const players = 2 + ((index + roomId.length + selected.id.length) % 4);
      return {
        id: roomId + '-' + selected.id + '-' + index,
        name: name,
        stakes: index < 2 ? '10 / 20' : index < 4 ? '25 / 50' : '50 / 100',
        seats: 6,
        players: players,
        pace: index % 2 ? 'Fast' : 'Normal',
      };
    });
  }

  function currentTable(){
    const tables = tableList(mounted.roomId);
    return tables.find(function(table){ return table.id === mounted.tableId; }) || tables[0];
  }

  function seedChat(roomId){
    return [
      { name: 'Host', text: 'Welcome to ' + (ROOMS.find(function(room){ return room.id === roomId; }) || ROOMS[0]).name + '.' },
      { name: CHAT_NAMES[roomId.length % CHAT_NAMES.length], text: 'Table list is open.' },
      { name: 'Dealer', text: 'Choose a table, take a seat, and cards will start.' },
    ];
  }

  function ensureChat(roomId, tableId){
    const key = roomId + ':' + (tableId || 'lobby');
    if(!mounted.chat[key]) mounted.chat[key] = seedChat(roomId);
    return mounted.chat[key];
  }

  function seatsHtml(){
    const table = currentTable();
    const names = ['YOU', 'Mack', 'Rosa', 'Open', 'Dee', 'Open'];
    return Array.from({ length: table.seats }, function(_, index){
      const open = names[index] === 'Open';
      const mine = mounted.seat === index;
      const className = 'poker-room-seat' + (open ? ' open' : '') + (mine ? ' mine' : '');
      const label = mine ? mounted.playerName : names[index];
      return '<button type="button" class="' + className + '" data-seat="' + index + '"><span>' + (index + 1) + '</span><strong>' + escapeHtml(label) + '</strong></button>';
    }).join('');
  }

  function roomTabsHtml(){
    return ROOMS.map(function(room){
      const active = room.id === mounted.roomId ? ' active' : '';
      return '<button type="button" class="poker-room-tab' + active + '" data-room="' + room.id + '"><strong>' + escapeHtml(room.name) + '</strong><span>' + escapeHtml(room.limit) + '</span></button>';
    }).join('');
  }

  function tableCardsHtml(){
    return tableList(mounted.roomId).map(function(table){
      const meter = Math.round((table.players / table.seats) * 100);
      return '<button type="button" class="poker-room-table-card" data-table="' + table.id + '">' +
        '<div><strong>' + escapeHtml(table.name) + '</strong><span>' + escapeHtml(table.stakes) + '</span></div>' +
        '<div class="poker-room-table-meter"><i style="width:' + meter + '%"></i></div>' +
        '<footer><span>' + table.players + '/' + table.seats + ' seated</span><span>' + table.pace + '</span></footer>' +
      '</button>';
    }).join('');
  }

  function chatHtml(){
    const messages = ensureChat(mounted.roomId, mounted.tableId);
    return messages.slice(-24).map(function(message){
      return '<p><strong>' + escapeHtml(message.name) + '</strong><span>' + escapeHtml(message.text) + '</span></p>';
    }).join('');
  }

  function renderChat(){
    if(!mounted) return;
    const log = mounted.parent.querySelector('.poker-chat-log');
    if(log) log.innerHTML = chatHtml();
    const chat = mounted.parent.querySelector('.poker-chat-log');
    if(chat) chat.scrollTop = chat.scrollHeight;
  }

  function renderLobby(){
    const room = currentRoom();
    mounted.parent.innerHTML = '<section class="poker-room-shell poker-room-lobby" aria-label="Poker room lobby">' +
      '<div class="poker-room-head"><div><span>Poker Room</span><strong>' + escapeHtml(mounted.selected.name) + '</strong></div><em>Rooms and tables</em></div>' +
      '<div class="poker-room-tabs">' + roomTabsHtml() + '</div>' +
      '<div class="poker-room-lobby-grid">' +
        '<main class="poker-table-browser"><div class="poker-browser-title"><strong>' + escapeHtml(room.name) + '</strong><span>' + escapeHtml(room.tone) + '</span></div><div class="poker-room-table-grid">' + tableCardsHtml() + '</div></main>' +
        '<aside class="poker-room-chat"><div class="poker-chat-title"><strong>Room chat</strong><span>' + escapeHtml(room.name) + '</span></div><div class="poker-chat-log">' + chatHtml() + '</div><form class="poker-chat-form"><input maxlength="90" aria-label="Message" placeholder="Say something"><button type="submit">Send</button></form></aside>' +
      '</div>' +
    '</section>';
    wireLobby();
    renderChat();
  }

  function renderTable(){
    const table = currentTable();
    mounted.parent.innerHTML = '<section class="poker-room-shell poker-table-room" aria-label="Poker table room">' +
      '<div class="poker-room-head"><div><span>' + escapeHtml(currentRoom().name) + '</span><strong>' + escapeHtml(table.name) + ' Table</strong></div><button type="button" class="poker-room-back" id="pokerRoomBack">Tables</button></div>' +
      '<div class="poker-table-layout">' +
        '<main class="poker-engine-panel"><div id="pokerEngineMount"></div></main>' +
        '<aside class="poker-room-side"><section class="poker-seat-panel"><div class="poker-side-title"><strong>Seats</strong><span>' + table.players + '/' + table.seats + '</span></div><div class="poker-seat-grid">' + seatsHtml() + '</div></section><section class="poker-room-chat"><div class="poker-chat-title"><strong>Table chat</strong><span>' + escapeHtml(table.name) + '</span></div><div class="poker-chat-log">' + chatHtml() + '</div><form class="poker-chat-form"><input maxlength="90" aria-label="Message" placeholder="Table message"><button type="submit">Send</button></form></section></aside>' +
      '</div>' +
    '</section>';
    wireTable();
    mountEngine();
    renderChat();
  }

  function destroyEngine(){
    if(mounted && mounted.engineInstance && typeof mounted.engineInstance.destroy === 'function') mounted.engineInstance.destroy();
    if(mounted) mounted.engineInstance = null;
  }

  function mountEngine(){
    destroyEngine();
    const engine = selectedEngine();
    const target = mounted.parent.querySelector('#pokerEngineMount');
    if(!engine || !target){
      if(target) target.innerHTML = '<section class="mini-game coming-soon-game"><h2>' + escapeHtml(mounted.selected.name) + '</h2><p class="mini-status">Poker table engine did not load. Refresh and try again.</p></section>';
      return;
    }
    mounted.engineInstance = engine.mount({
      parent: target,
      selected: mounted.selected,
      onHandComplete: function(details){
        const result = details && details.message ? details.message : 'Hand complete.';
        ensureChat(mounted.roomId, mounted.tableId).push({ name: 'Dealer', text: result });
        if(typeof mounted.onHandComplete === 'function') mounted.onHandComplete(details);
        renderChat();
      },
    });
  }

  function submitChat(event){
    event.preventDefault();
    const input = event.currentTarget.querySelector('input');
    const text = input.value.trim();
    if(!text) return;
    ensureChat(mounted.roomId, mounted.tableId).push({ name: mounted.playerName, text: text });
    input.value = '';
    renderChat();
    playRoomSound('chat');
  }

  function wireLobby(){
    mounted.parent.querySelectorAll('[data-room]').forEach(function(button){
      button.addEventListener('click', function(){
        playRoomSound('room');
        stopAmbience();
        mounted.roomId = button.dataset.room;
        mounted.tableId = null;
        saveState();
        renderLobby();
      });
    });
    mounted.parent.querySelectorAll('[data-table]').forEach(function(button){
      button.addEventListener('click', function(){
        playRoomSound('enter');
        startAmbience();
        mounted.tableId = button.dataset.table;
        saveState();
        renderTable();
      });
    });
    const form = mounted.parent.querySelector('.poker-chat-form');
    if(form) form.addEventListener('submit', submitChat);
  }

  function wireTable(){
    const back = mounted.parent.querySelector('#pokerRoomBack');
    if(back) back.addEventListener('click', function(){
      playRoomSound('room');
      stopAmbience();
      destroyEngine();
      mounted.tableId = null;
      saveState();
      renderLobby();
    });
    mounted.parent.querySelectorAll('[data-seat]').forEach(function(button){
      button.addEventListener('click', function(){
        playRoomSound('seat');
        mounted.seat = parseInt(button.dataset.seat, 10);
        ensureChat(mounted.roomId, mounted.tableId).push({ name: 'Host', text: mounted.playerName + ' moved to seat ' + (mounted.seat + 1) + '.' });
        saveState();
        renderTable();
      });
    });
    const form = mounted.parent.querySelector('.poker-chat-form');
    if(form) form.addEventListener('submit', submitChat);
  }

  function mount(options){
    options = options || {};
    destroy();
    const parent = typeof options.parent === 'string' ? document.getElementById(options.parent) : options.parent;
    if(!parent) return null;
    const saved = loadState();
    mounted = {
      parent: parent,
      selected: options.selected || { name: 'Poker' },
      onHandComplete: options.onHandComplete,
      roomId: saved.roomId,
      tableId: saved.tableId,
      seat: saved.seat,
      playerName: saved.playerName,
      chat: {},
      engineInstance: null,
    };
    if(mounted.tableId) renderTable();
    else renderLobby();
    return { destroy: destroy };
  }

  function destroy(){
    stopAmbience();
    destroyEngine();
    mounted = null;
  }

  window.RetroArcadePokerRoom = { mount: mount, destroy: destroy };
})();
