// RetroArcade Solitaire Collection
// Klondike, Tri-Peaks, FreeCell

const SUITS = [['♠','black'],['♥','red'],['♦','red'],['♣','black']];
const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const RVAL = Object.fromEntries(RANKS.map((r,i)=>[r,i+1]));

let game = 'klondike';
let difficulty = 'medium';
let moves = 0;
let undoStack = [];
let state = {};
let timerInt, seconds = 0;

const $ = s => document.querySelector(s);
const board = $('#board');

function buildDeck(){
  const d = [];
  let id = 0;
  for(const [suit,color] of SUITS){
    for(let r=0; r<RANKS.length; r++){
      d.push({ suit, color, rank: RANKS[r], val: r+1, id: id++ });
    }
  }
  // Fisher-Yates
  for(let i=d.length-1; i>0; i--){
    const j = Math.floor(Math.random() * (i+1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

function cardHtml(c, faceDown=false){
  if(faceDown || !c) return `<div class="card back" data-id="${c?.id ?? ''}"></div>`;
  return `<div class="card ${c.color==='red'?'red':''}" data-id="${c.id}">${c.rank}<div class="small">${c.suit}</div></div>`;
}

/* ==================== KLONDIKE ==================== */

let kSel = null; // {ci, idx}  or  {waste:true}

function newKlondike(){
  const d = buildDeck();
  state.tableau = Array.from({length:7}, (_,i) => {
    const col = d.splice(0, i+1);
    col.forEach((card, j) => card.faceUp = (j === i));
    return col;
  });
  state.stock = d;
  state.waste = [];
  state.foundations = [[],[],[],[]];
  renderKlondike();
}

function renderKlondike(){
  board.innerHTML =
    `<div class="piles">`+
      `<div id="stock-pile">${state.stock.length ? cardHtml({},true) : '<div class="pile-slot"></div>'}</div>`+
      `<div id="waste-pile">${state.waste.at(-1) ? cardHtml(state.waste.at(-1)) : '<div class="pile-slot"></div>'}</div>`+
      `<div style="flex:1"></div>`+
      state.foundations.map((f,i)=>
        `<div class="pile-slot foundation" data-found="${i}">${f.at(-1) ? cardHtml(f.at(-1)) : ''}</div>`
      ).join('')+
    `</div>`+
    `<div class="tableau">`+
      state.tableau.map((col,ci)=>{
        let html = `<div class="tableau-col" data-col="${ci}">`;
        if(col.length === 0){
          html += `<div class="pile-slot empty-col"></div>`;
        }else{
          col.forEach(c => html += c.faceUp ? cardHtml(c) : cardHtml(c,true));
        }
        return html + `</div>`;
      }).join('')+
    `</div>`;

  // highlight selection
  if(kSel){
    if(kSel.waste){
      const w = board.querySelector('#waste-pile .card[data-id]');
      if(w) w.classList.add('selected');
    } else {
      const colEl = board.querySelector(`.tableau-col[data-col="${kSel.ci}"]`);
      if(colEl){
        const cards = [...colEl.querySelectorAll('.card[data-id]')];
        const colData = state.tableau[kSel.ci];
        for(let i=kSel.idx; i<colData.length; i++){
          const card = colData[i];
          const el = cards.find(e => parseInt(e.dataset.id,10) === card.id);
          if(el) el.classList.add('selected');
        }
      }
    }
  }

  // wire up clicks
  board.querySelectorAll('.tableau .card:not(.back)').forEach(el=>{
    el.addEventListener('click', e => { e.stopPropagation(); klondikeTableauClick(e); });
  });
  board.querySelectorAll('.tableau-col').forEach(el=>{
    el.addEventListener('click', e=>{
      if(e.target.closest('.card')) return;
      klondikeEmptyColClick(parseInt(el.dataset.col,10));
    });
  });

  // stock
  $('#stock-pile').addEventListener('click', ()=>{
    pushUndo();
    if(state.stock.length){
      const n = difficulty === 'hard' ? 3 : 1;
      for(let i=0; i<n && state.stock.length; i++){
        state.waste.push(state.stock.pop());
      }
    }else{
      // recycle waste back to stock (reverse order)
      state.stock = state.waste.reverse();
      state.waste = [];
      state.stock.forEach(c => c.faceUp = false);
    }
    kSel = null;
    moves++; updateHUD(); renderKlondike();
  });

  // waste card
  const wasteCard = board.querySelector('#waste-pile .card[data-id]');
  if(wasteCard){
    wasteCard.addEventListener('click', (e)=>{
      e.stopPropagation();
      klondikeWasteClick();
    });
  }

  // foundation piles – click to place selected card
  board.querySelectorAll('.foundation').forEach((el,i)=>{
    el.addEventListener('click', e=>{
      e.stopPropagation();
      if(kSel && kSel.waste){
        const card = state.waste.at(-1);
        if(card) tryKFoundation(card, true);
        kSel = null;
        renderKlondike();
      }
    });
  });
}

function klondikeWasteClick(){
  const card = state.waste.at(-1);
  if(!card) return;
  // try foundation immediately
  if(tryKFoundation(card, true)){
    kSel = null;
    return;
  }
  // if already selected, deselect
  if(kSel && kSel.waste){
    kSel = null;
    renderKlondike();
    return;
  }
  // select waste card for tableau play
  kSel = {waste:true};
  renderKlondike();
}

function klondikeTableauClick(e){
  const id = parseInt(e.currentTarget.dataset.id,10);
  // find card in tableau
  for(let ci=0; ci<state.tableau.length; ci++){
    const col = state.tableau[ci];
    const idx = col.findIndex(c => c.id === id && c.faceUp);
    if(idx < 0) continue;

    // clicking the selected stack head -> try send to foundation
    if(kSel && kSel.ci === ci && kSel.idx === idx){
      const card = col[idx];
      if(tryKFoundation(card, false)){
        kSel = null;
      }
      return;
    }

    // already have a selection -> try to move it here
    if(kSel){
      if(kSel.waste){
        // waste -> tableau
        if(tryKWasteToTableau(ci)){
          kSel = null;
          return;
        }
        // illegal: fall through to select clicked tableau card
      } else {
        const srcCi = kSel.ci, srcIdx = kSel.idx;
        if(srcCi !== ci || srcIdx !== idx){
          if(tryKMove(srcCi, srcIdx, ci)){
            kSel = null;
            return;
          }
          // illegal move: select the clicked card instead
        }
      }
      // fall through to select
    }

    // no selection, or illegal move: select this card/stack
    kSel = {ci, idx};
    renderKlondike();
    return;
  }
}

function klondikeEmptyColClick(ci){
  if(!kSel) return;
  if(kSel.waste){
    if(tryKWasteToTableau(ci)) kSel = null;
    return;
  }
  if(tryKMove(kSel.ci, kSel.idx, ci)){
    kSel = null;
  }
}

function tryKMove(fromCi, fromIdx, toCi){
  if(fromCi === toCi) return false;
  const srcCol = state.tableau[fromCi];
  const stack = srcCol.slice(fromIdx);
  const first = stack[0];
  const destCol = state.tableau[toCi];
  const target = destCol.at(-1);

  const canPlace = (!target && first.val === 13) ||
    (target && target.color !== first.color && target.val === first.val + 1);

  if(!canPlace) return false;

  pushUndo();
  destCol.push(...stack);
  srcCol.length = fromIdx;
  const newTop = srcCol.at(-1);
  if(newTop) newTop.faceUp = true;
  moves++; updateHUD(); renderKlondike(); checkKWin();
  return true;
}

function tryKWasteToTableau(toCi){
  const card = state.waste.at(-1);
  if(!card) return false;
  const destCol = state.tableau[toCi];
  const target = destCol.at(-1);
  const canPlace = (!target && card.val === 13) ||
    (target && target.color !== card.color && target.val === card.val + 1);
  if(!canPlace) return false;
  pushUndo();
  state.waste.pop();
  card.faceUp = true;
  destCol.push(card);
  moves++; updateHUD(); renderKlondike(); checkKWin();
  return true;
}

function tryKFoundation(card, fromWaste){
  for(const f of state.foundations){
    const top = f.at(-1);
    const canPlace = (!top && card.val === 1) ||
      (top && top.suit === card.suit && top.val + 1 === card.val);
    if(!canPlace) continue;

    pushUndo();
    if(fromWaste){
      state.waste.pop();
    }else{
      for(const col of state.tableau){
        const i = col.findIndex(x => x.id === card.id);
        if(i >= 0){
          col.splice(i,1);
          const t = col.at(-1);
          if(t) t.faceUp = true;
          break;
        }
      }
    }
    f.push(card);
    moves++; updateHUD(); renderKlondike(); checkKWin();
    return true;
  }
  return false;
}

function checkKWin(){
  if(state.foundations.reduce((a,f)=>a+f.length,0) === 52) showWin();
}

/* ==================== TRI-PEAKS ==================== */

function newTriPeaks(){
  const d = buildDeck();
  state.peaks = [];
  for(let p=0; p<3; p++){
    const pk = [];
    for(let r=0; r<4; r++){
      for(let c=0; c<=r; c++){
        const card = d.pop();
        card.peak = p; card.row = r; card.col = c; card.removed = false;
        pk.push(card);
      }
    }
    state.peaks.push(pk);
  }
  // difficulty: remove cards from stock for harder modes
  const removeCount = difficulty === 'easy' ? 0 : difficulty === 'hard' ? 4 : 2;
  state.stock = d;
  for(let i=0; i<removeCount && state.stock.length; i++) state.stock.pop();
  state.waste = [state.stock.pop()];
  renderTriPeaks();
}

function peakAt(p,r,c){
  return state.peaks[p].find(x => x.row === r && x.col === c);
}

function isFreeTP(c){
  if(c.removed) return false;
  if(c.row === 3) return true; // bottom row is always free
  const left  = peakAt(c.peak, c.row+1, c.col);
  const right = peakAt(c.peak, c.row+1, c.col+1);
  return (left?.removed ?? true) && (right?.removed ?? true);
}

function renderTriPeaks(){
  let html = '<div class="peaks">';
  // render each peak separately, side by side per row
  for(let r=0; r<4; r++){
    html += '<div class="peak-row">';
    for(let p=0; p<3; p++){
      html += '<div style="display:flex;gap:6px">';
      for(let c=0; c<=r; c++){
        const card = peakAt(p,r,c);
        if(!card || card.removed){
          html += '<div style="width:68px;height:20px"></div>';
          continue;
        }
        const free = isFreeTP(card);
        html += `<div class="card ${card.color==='red'?'red':''}${free?'':' back'}" data-tpid="${card.id}" style="opacity:${free?1:0.45}">`+
          (free ? card.rank + '<div class="small">'+card.suit+'</div>' : '') +
          `</div>`;
      }
      html += '</div>';
      if(p < 2) html += '<div style="width:24px"></div>'; // gap between peaks
    }
    html += '</div>';
  }
  html += '</div>';

  const w = state.waste.at(-1);
  html += `<div class="waste-row"><div id="tp-stock">`+
    (state.stock.length ? '<div class="card back"></div>' : '<div class="pile-slot"></div>')+
    `</div><div>${w ? cardHtml(w) : '<div class="pile-slot"></div>'}</div>`+
    `<span style="color:#888">Rank ±1 (A↔K)</span></div>`;

  board.innerHTML = html;

  board.querySelectorAll('[data-tpid]').forEach(el=>{
    el.addEventListener('click', ()=>{
      const id = parseInt(el.dataset.tpid,10);
      const card = state.peaks.flat().find(x => x.id === id);
      if(!card || !isFreeTP(card)) return;
      const top = state.waste.at(-1);
      const diff = Math.abs(card.val - top.val);
      if(diff === 1 || diff === 12){
        pushUndo();
        card.removed = true;
        state.waste.push(card);
        moves++; updateHUD(); renderTriPeaks();
        if(state.peaks.flat().every(x => x.removed)) showWin();
      }
    });
  });

  $('#tp-stock').addEventListener('click', ()=>{
    if(state.stock.length){
      pushUndo();
      state.waste.push(state.stock.pop());
      moves++; updateHUD(); renderTriPeaks();
    }
  });
}

/* ==================== FREECELL ==================== */

let fcSel = null; // selected card object

function newFreeCell(){
  let d = buildDeck();
  // difficulty = shuffle bias
  if(difficulty === 'easy'){
    d.sort((a,b)=>a.val - b.val + (Math.random()-0.5)*0.6);
  }else if(difficulty === 'hard'){
    // fully random (default)
  }
  state.fc_free = [null,null,null,null];
  state.fc_found = [[],[],[],[]];
  state.fc_tableau = Array.from({length:8}, ()=>[]);
  let ci = 0;
  while(d.length){
    state.fc_tableau[ci % 8].push(d.pop());
    ci++;
  }
  renderFreeCell();
}

function renderFreeCell(){
  let html = '<div class="fc-top">';
  state.fc_free.forEach((c,i)=>{
    html += `<div><div class="fc-label">Free</div>`+
      `<div class="pile-slot fc-free" data-free="${i}">${c ? cardHtml(c) : ''}</div></div>`;
  });
  html += '<div style="width:30px"></div>';
  state.fc_found.forEach((f,i)=>{
    html += `<div><div class="fc-label">Home</div>`+
      `<div class=\"pile-slot fc-found\" data-found=\"${f.id ?? i}\">${f.at(-1) ? cardHtml(f.at(-1)) : ''}</div></div>`;
  });
  html += '</div>';

  html += '<div class="tableau">';
  state.fc_tableau.forEach((col,ci)=>{
    html += `<div class="tableau-col" data-fccol="${ci}">`;
    col.forEach(c => html += cardHtml(c));
    if(col.length === 0) html += '<div class="pile-slot empty-col"></div>';
    html += `</div>`;
  });
  html += '</div>';

  board.innerHTML = html;

  // highlight selection
  if(fcSel){
    const el = board.querySelector(`.card[data-id="${fcSel.id}"]`);
    if(el) el.classList.add('selected');
  }

  // card clicks
  board.querySelectorAll('.card[data-id]').forEach(el=>{
    el.addEventListener('click', e => { e.stopPropagation(); fcCardClick(e); });
  });

  // free cell clicks
  board.querySelectorAll('.fc-free').forEach(el=>{
    el.addEventListener('click', e => {
      const idx = parseInt(el.dataset.free,10);
      fcFreeSlotClick(idx);
    });
  });

  // tableau column clicks (empty or drop target)
  board.querySelectorAll('.tableau-col').forEach(el=>{
    el.addEventListener('click', e=>{
      if(e.target.closest('.card[data-id]')) return;
      const ci = parseInt(el.dataset.fccol,10);
      fcColClick(ci);
    });
  });
}

function fcFindCard(id){
  for(let ci=0; ci<state.fc_tableau.length; ci++){
    const col = state.fc_tableau[ci];
    const idx = col.findIndex(c => c.id === id);
    if(idx >= 0) return { card: col[idx], where: 'tableau', ci, idx, isTop: idx === col.length-1 };
  }
  for(let fi=0; fi<state.fc_free.length; fi++){
    const c = state.fc_free[fi];
    if(c && c.id === id) return { card: c, where: 'free', fi };
  }
  return null;
}

function fcCardClick(e){
  const id = parseInt(e.currentTarget.dataset.id,10);
  const found = fcFindCard(id);
  if(!found) return;
  const card = found.card;

  // click selected card again -> try auto-foundation
  if(fcSel && fcSel.id === id){
    if(tryFCFoundation(card)){
      fcSel = null;
      return;
    }
    fcSel = null;
    renderFreeCell();
    return;
  }

  // only top tableau cards / free-cell cards are selectable
  if(found.where === 'tableau' && !found.isTop){
    return;
  }

  // have a selection, clicking a different card: if it's a valid tableau drop, move there
  if(fcSel && found.where === 'tableau' && found.isTop){
    const targetColIdx = found.ci;
    const targetCard = card;
    if(targetCard.color !== fcSel.color && targetCard.val === fcSel.val + 1){
      if(fcMoveToTableau(fcSel, targetColIdx)){
        fcSel = null;
        return;
      }
    }
  }

  // select this card
  fcSel = card;
  renderFreeCell();
}

function fcFreeSlotClick(freeIdx){
  if(!fcSel) return;
  if(state.fc_free[freeIdx]) return; // occupied
  const loc = fcFindCard(fcSel.id);
  if(!loc) return;
  pushUndo();
  fcRemoveAt(loc);
  state.fc_free[freeIdx] = fcSel;
  fcSel = null;
  moves++; updateHUD(); renderFreeCell();
}

function fcColClick(colIdx){
  if(!fcSel) return;
  const destCol = state.fc_tableau[colIdx];
  const top = destCol.at(-1);
  const canPlace = (!top && fcSel.val === 13) ||
    (top && top.color !== fcSel.color && top.val === fcSel.val + 1);
  if(!canPlace) return;
  fcMoveToTableau(fcSel, colIdx);
}

function fcMoveToTableau(card, colIdx){
  const destCol = state.fc_tableau[colIdx];
  const top = destCol.at(-1);
  const canPlace = (!top && card.val === 13) ||
    (top && top.color !== card.color && top.val === card.val + 1);
  if(!canPlace) return false;
  const loc = fcFindCard(card.id);
  if(!loc) return false;
  if(loc.where === 'tableau' && !loc.isTop) return false;
  pushUndo();
  fcRemoveAt(loc);
  destCol.push(card);
  fcSel = null;
  moves++; updateHUD(); renderFreeCell();
  tryFCAutoFoundations();
  return true;
}

function fcRemoveAt(loc){
  if(loc.where === 'tableau'){
    state.fc_tableau[loc.ci].splice(loc.idx,1);
  }else if(loc.where === 'free'){
    state.fc_free[loc.fi] = null;
  }
}

function tryFCFoundation(card){
  const loc = fcFindCard(card.id);
  if(!loc) return false;
  if(loc.where === 'tableau' && !loc.isTop) return false;
  for(const f of state.fc_found){
    const top = f.at(-1);
    const canPlace = (!top && card.val === 1) ||
      (top && top.suit === card.suit && top.val + 1 === card.val);
    if(!canPlace) continue;
    pushUndo();
    fcRemoveAt(loc);
    f.push(card);
    fcSel = null;
    moves++; updateHUD(); renderFreeCell(); checkFCWin();
    return true;
  }
  return false;
}

function tryFCAutoFoundations(){
  let movedTotal = false;
  let moved;
  do{
    moved = false;
    const candidates = [];
    state.fc_tableau.forEach((col,ci) => { if(col.length) candidates.push({card:col.at(-1), loc:{where:'tableau', ci, idx:col.length-1}}); });
    state.fc_free.forEach((c,fi) => { if(c) candidates.push({card:c, loc:{where:'free', fi}}); });

    for(const {card, loc} of candidates){
      for(const f of state.fc_found){
        const top = f.at(-1);
        const canPlace = (!top && card.val === 1) ||
          (top && top.suit === card.suit && top.val + 1 === card.val);
        if(!canPlace) continue;
        fcRemoveAt(loc);
        f.push(card);
        moved = true;
        movedTotal = true;
        break;
      }
      if(moved) break;
    }
  }while(moved);
  if(movedTotal) { updateHUD(); renderFreeCell(); checkFCWin(); }
}

function checkFCWin(){
  if(state.fc_found.reduce((a,f)=>a+f.length,0) === 52){
    showWin();
  }
}

/* ==================== SHARED ==================== */

function pushUndo(){
  try{
    undoStack.push(JSON.stringify({game, state, moves, fcSelId: fcSel?.id ?? null, kSel}));
    if(undoStack.length > 40) undoStack.shift();
  }catch(e){}
}

function doUndo(){
  const s = undoStack.pop();
  if(!s) return;
  const o = JSON.parse(s);
  state = o.state;
  moves = o.moves;
  fcSel = null;
  kSel = o.kSel ?? null;
  renderCurrent();
  updateHUD();
}

function updateHUD(){
  $('#moves').textContent = 'Moves: ' + moves;
}

function showWin(){
  $('#win-stats').textContent = `${game} — ${difficulty} — ${moves} moves — ${$('#timer').textContent}`;
  $('#win').classList.remove('hidden');
  clearInterval(timerInt);
}

function startTimer(){
  clearInterval(timerInt);
  seconds = 0;
  $('#timer').textContent = '00:00';
  timerInt = setInterval(()=>{
    seconds++;
    $('#timer').textContent =
      String(Math.floor(seconds/60)).padStart(2,'0') + ':' +
      String(seconds%60).padStart(2,'0');
  }, 1000);
}

function applyDeck(){
  const d = (document.querySelector('#deck') && document.querySelector('#deck').value) || 'neon';
  document.body.className = document.body.className.replace(/\bdeck-\w+\b/g, '').trim();
  document.body.classList.add('deck-' + d);
}
function renderCurrent(){
  applyDeck();
  if(game === 'klondike') renderKlondike();
  else if(game === 'tripeaks') renderTriPeaks();
  else renderFreeCell();
}

function newGame(){
  moves = 0;
  undoStack = [];
  fcSel = null;
  kSel = null;
  difficulty = $('#difficulty').value;
  startTimer();
  updateHUD();
  $('#win').classList.add('hidden');
  if(game === 'klondike') newKlondike();
  else if(game === 'tripeaks') newTriPeaks();
  else newFreeCell();
}

document.querySelectorAll('.game-btn').forEach(b=>{
  b.addEventListener('click', ()=>{
    document.querySelectorAll('.game-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    game = b.dataset.game;
    newGame();
  });
});

$('#newGame').addEventListener('click', newGame);
var deckSel = document.querySelector('#deck'); if(deckSel) deckSel.addEventListener('change', function(){ applyDeck(); renderCurrent(); });
$('#undo').addEventListener('click', doUndo);
$('#playAgain').addEventListener('click', ()=>{
  $('#win').classList.add('hidden');
  newGame();
});

newGame();
