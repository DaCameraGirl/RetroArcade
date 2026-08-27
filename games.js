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
let isPaused = false;
let snakeInt = null;
let snakeGame = null;
let slotGame = null;
let blackjackGame = null;
let sicBoGame = null;
let pokerGame = null;
let frogInt = null;

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


/* ==================== PYRAMID ==================== */

let pyramidSel = null; // {card, source}

function newPyramid(){
  const d = buildDeck();
  state.pyramid = [];
  for(let row=0; row<7; row++){
    for(let col=0; col<=row; col++){
      const card = d.pop();
      card.row = row;
      card.col = col;
      card.removed = false;
      state.pyramid.push(card);
    }
  }
  state.stock = d;
  state.waste = [];
  pyramidSel = null;
  renderPyramid();
}

function pyramidAt(row, col){
  return state.pyramid.find(function(card){ return card.row === row && card.col === col; });
}

function isFreePyramid(card){
  if(card.removed) return false;
  if(card.row === 6) return true;
  const left = pyramidAt(card.row + 1, card.col);
  const right = pyramidAt(card.row + 1, card.col + 1);
  return Boolean(left && left.removed && right && right.removed);
}

function finishPyramidMove(){
  pyramidSel = null;
  moves++;
  updateHUD();
  renderPyramid();
  if(state.pyramid.every(function(card){ return card.removed; })) showWin();
}

function clearPyramidCards(cards){
  pushUndo();
  cards.forEach(function(card){ card.removed = true; });
  finishPyramidMove();
}

function pyramidCardClick(card){
  if(!card || !isFreePyramid(card)) return;
  if(card.val === 13){
    clearPyramidCards([card]);
    return;
  }
  if(pyramidSel && pyramidSel.card.id === card.id && pyramidSel.source === 'pyramid'){
    pyramidSel = null;
    renderPyramid();
    return;
  }
  if(pyramidSel && pyramidSel.card.val + card.val === 13){
    pushUndo();
    card.removed = true;
    if(pyramidSel.source === 'waste') state.waste.pop();
    else pyramidSel.card.removed = true;
    finishPyramidMove();
    return;
  }
  pyramidSel = { card: card, source: 'pyramid' };
  renderPyramid();
}

function pyramidWasteClick(){
  const card = state.waste.at(-1);
  if(!card) return;
  if(card.val === 13){
    pushUndo();
    state.waste.pop();
    finishPyramidMove();
    return;
  }
  if(pyramidSel && pyramidSel.card.id === card.id && pyramidSel.source === 'waste'){
    pyramidSel = null;
    renderPyramid();
    return;
  }
  if(pyramidSel && pyramidSel.card.val + card.val === 13){
    pushUndo();
    state.waste.pop();
    if(pyramidSel.source === 'pyramid') pyramidSel.card.removed = true;
    finishPyramidMove();
    return;
  }
  pyramidSel = { card: card, source: 'waste' };
  renderPyramid();
}

function renderPyramid(){
  let html = '<div class="pyramid-board">';
  for(let row=0; row<7; row++){
    html += '<div class="pyramid-row">';
    for(let col=0; col<=row; col++){
      const card = pyramidAt(row, col);
      if(!card || card.removed){
        html += '<div class="pyramid-gap"></div>';
        continue;
      }
      const free = isFreePyramid(card);
      const selected = pyramidSel && pyramidSel.source === 'pyramid' && pyramidSel.card.id === card.id;
      html += '<div class="pyramid-card-wrap"><div class="card ' + (card.color === 'red' ? 'red ' : '') + (free ? '' : 'back ') + (selected ? 'selected ' : '') + '" data-pyramid-id="' + card.id + '">' +
        (free ? card.rank + '<div class="small">' + card.suit + '</div>' : '') + '</div></div>';
    }
    html += '</div>';
  }
  const waste = state.waste.at(-1);
  const wasteSelected = waste && pyramidSel && pyramidSel.source === 'waste' && pyramidSel.card.id === waste.id;
  html += '</div><div class="waste-row pyramid-stock-row">' +
    '<div id="pyramid-stock">' + (state.stock.length ? '<div class="card back"></div>' : '<div class="pile-slot"></div>') + '</div>' +
    '<div id="pyramid-waste">' + (waste ? '<div class="card ' + (waste.color === 'red' ? 'red ' : '') + (wasteSelected ? 'selected ' : '') + '" data-id="' + waste.id + '">' + waste.rank + '<div class="small">' + waste.suit + '</div></div>' : '<div class="pile-slot"></div>') + '</div>' +
    '<span>Pair cards to 13. Kings clear alone.</span></div>';
  board.innerHTML = html;
  board.querySelectorAll('[data-pyramid-id]').forEach(function(el){
    el.addEventListener('click', function(){
      const id = parseInt(el.dataset.pyramidId, 10);
      pyramidCardClick(state.pyramid.find(function(card){ return card.id === id; }));
    });
  });
  document.querySelector('#pyramid-stock').addEventListener('click', function(){
    pushUndo();
    if(state.stock.length) state.waste.push(state.stock.pop());
    else {
      state.stock = state.waste.reverse();
      state.waste = [];
    }
    pyramidSel = null;
    moves++;
    updateHUD();
    renderPyramid();
  });
  const wasteCard = document.querySelector('#pyramid-waste .card[data-id]');
  if(wasteCard) wasteCard.addEventListener('click', pyramidWasteClick);
}

/* ==================== SHARED ==================== */

function pushUndo(){
  try{
    undoStack.push(JSON.stringify({game, state, moves, fcSelId: fcSel?.id ?? null, kSel, pyramidSelId: pyramidSel?.card?.id ?? null, pyramidSelSource: pyramidSel?.source ?? null}));
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
  pyramidSel = null;
  if(o.pyramidSelId != null){
    const source = o.pyramidSelSource || 'pyramid';
    const sourceCards = source === 'waste' ? (state.waste || []) : (state.pyramid || []);
    const card = sourceCards.find(function(item){ return item.id === o.pyramidSelId; });
    if(card) pyramidSel = { card: card, source: source };
  }
  renderCurrent();
  updateHUD();
}

function updateHUD(){
  $('#moves').textContent = 'Moves: ' + moves;
}

function showWin(){
  $('#win-stats').textContent = `${game} | ${difficulty} | ${moves} moves | ${$('#timer').textContent}`;
  $('#win').classList.remove('hidden');
  clearInterval(timerInt);
}

function timerText(){
  return String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
}

function renderTimer(){
  $('#timer').textContent = timerText();
}

function runTimer(){
  clearInterval(timerInt);
  timerInt = setInterval(function(){
    if(isPaused) return;
    seconds++;
    renderTimer();
  }, 1000);
}

function setPaused(paused){
  isPaused = paused;
  playArea.classList.toggle('is-paused', isPaused);
  const pause = document.querySelector('#pauseBtn');
  if(pause) pause.textContent = isPaused ? '▶ Resume' : '⏸ Pause';
  if(isPaused) clearInterval(timerInt);
  else if(!playArea.classList.contains('hidden')) runTimer();
}

function startTimer(){
  clearInterval(timerInt);
  isPaused = false;
  seconds = 0;
  renderTimer();
  setPaused(false);
}

function stopLiveMiniGames(){
  clearInterval(snakeInt);
  clearInterval(frogInt);
  snakeInt = null;
  frogInt = null;
  if(snakeGame){
    snakeGame.destroy(true);
    snakeGame = null;
  }
  if(slotGame){
    slotGame.destroy();
    slotGame = null;
  }
  if(blackjackGame){
    blackjackGame.destroy();
    blackjackGame = null;
  }
  if(sicBoGame){
    sicBoGame.destroy();
    sicBoGame = null;
  }
  if(pokerGame){
    pokerGame.destroy();
    pokerGame = null;
  }
  document.onkeydown = null;
}

function applyDeck(){
  const d = (document.querySelector('#deck') && document.querySelector('#deck').value) || 'forest';
  document.body.className = document.body.className.replace(/\bdeck-\w+\b/g, '').trim();
  document.body.classList.add('deck-' + d);
}
function renderCurrent(){
  applyDeck();
  if(game === 'klondike') renderKlondike();
  else if(game === 'tripeaks') renderTriPeaks();
  else if(game === 'freecell') renderFreeCell();
  else if(game === 'pyramid') renderPyramid();
  else renderQuickGame();
}
function newGame(){
  stopLiveMiniGames();
  moves = 0;
  undoStack = [];
  fcSel = null;
  kSel = null;
  pyramidSel = null;
  state = {};
  difficulty = $('#difficulty').value;
  startTimer();
  updateHUD();
  $('#win').classList.add('hidden');
  if(game === 'klondike') newKlondike();
  else if(game === 'tripeaks') newTriPeaks();
  else if(game === 'freecell') newFreeCell();
  else if(game === 'pyramid') newPyramid();
  else renderQuickGame();
}
/* ==================== CASINO / ARCADE MINI-GAMES ==================== */

function findArcadeGame(gameId){
  for(const room of ROOMS){
    const found = room.games.find(function(item){ return item.id === gameId; });
    if(found) return { room: room, game: found };
  }
  return null;
}

function miniCard(c){
  return '<div class="mini-card ' + (c.color === 'red' ? 'red' : '') + '">' + c.rank + '<span>' + c.suit + '</span></div>';
}

function pokerScore(hand){
  const vals = hand.map(function(c){ return c.val; }).sort(function(a,b){ return a-b; });
  const suits = hand.map(function(c){ return c.suit; });
  const counts = {};
  vals.forEach(function(v){ counts[v] = (counts[v] || 0) + 1; });
  const groups = Object.values(counts).sort(function(a,b){ return b-a; });
  const flush = suits.every(function(s){ return s === suits[0]; });
  const lowAce = vals.join(',') === '1,2,3,4,5';
  const straight = lowAce || vals.every(function(v,i){ return i === 0 || v === vals[i-1] + 1; });
  if(straight && flush) return 'Straight flush';
  if(groups[0] === 4) return 'Four of a kind';
  if(groups[0] === 3 && groups[1] === 2) return 'Full house';
  if(flush) return 'Flush';
  if(straight) return 'Straight';
  if(groups[0] === 3) return 'Three of a kind';
  if(groups[0] === 2 && groups[1] === 2) return 'Two pair';
  if(groups[0] === 2) return 'Pair';
  return 'High card';
}

function renderPokerMini(selected){
  board.innerHTML = '<div id="pokerMount"></div>';
  if(window.RetroArcadePokerRoom){
    pokerGame = window.RetroArcadePokerRoom.mount({
      parent: 'pokerMount',
      selected: selected,
      onHandComplete: function(){
        moves++;
        updateHUD();
      }
    });
    return;
  }
  const engine = selected.engine === 'draw' ? window.RetroArcadeDrawPoker : window.RetroArcadePoker;
  if(!engine){
    board.innerHTML = '<section class="mini-game coming-soon-game"><h2>' + selected.name + '</h2><p class="mini-status">Poker table engine did not load. Refresh and try again.</p></section>';
    return;
  }
  pokerGame = engine.mount({
    parent: 'pokerMount',
    selected: selected,
    onHandComplete: function(){
      moves++;
      updateHUD();
    }
  });
}

function renderBlackjackMini(selected){
  board.innerHTML = '<div id="blackjackMount"></div>';
  if(!window.RetroArcadeBlackjack){
    board.innerHTML = '<section class="mini-game coming-soon-game"><h2>' + selected.name + '</h2><p class="mini-status">Blackjack table engine did not load. Refresh and try again.</p></section>';
    return;
  }
  blackjackGame = window.RetroArcadeBlackjack.mount({
    parent: 'blackjackMount',
    selected: selected,
    onHandComplete: function(){
      moves++;
      updateHUD();
    }
  });
}

function renderHighCardMini(selected){
  const deck = buildDeck();
  const player = deck.pop();
  const house = deck.pop();
  const result = player.val === house.val ? 'Tie' : (player.val > house.val ? 'You win' : 'House wins');
  moves++;
  updateHUD();
  board.innerHTML = '<section class="mini-game poker-mini"><h2>' + selected.name + '</h2>' +
    '<p class="mini-status">' + result + '</p>' +
    '<div class="versus-hand"><div><span>You</span>' + miniCard(player) + '</div><div><span>House</span>' + miniCard(house) + '</div></div>' +
    '<div class="mini-actions"><button id="miniDeal">Play round</button></div></section>';
  document.querySelector('#miniDeal').addEventListener('click', function(){ renderHighCardMini(selected); });
}

function renderRouletteMini(selected){
  const n = Math.floor(Math.random() * 37);
  const color = n === 0 ? 'green' : (n % 2 ? 'red' : 'black');
  moves++;
  updateHUD();
  board.innerHTML = '<section class="mini-game roulette-mini"><h2>' + selected.name + '</h2>' +
    '<div class="roulette-wheel ' + color + '">' + n + '</div>' +
    '<p class="mini-status">' + color.toUpperCase() + '</p>' +
    '<div class="mini-actions"><button id="miniSpin">Spin wheel</button></div></section>';
  document.querySelector('#miniSpin').addEventListener('click', function(){ renderRouletteMini(selected); });
}

function renderDiceMini(selected){
  const diceCount = selected.diceCount || 2;
  const dice = Array.from({length: diceCount}, function(){ return 1 + Math.floor(Math.random() * 6); });
  const total = dice.reduce(function(sum, n){ return sum + n; }, 0);
  moves++;
  updateHUD();
  board.innerHTML = '<section class="mini-game dice-mini"><h2>' + selected.name + '</h2>' +
    '<div class="dice-row">' + dice.map(function(n){ return '<span>' + n + '</span>'; }).join('') + '</div>' +
    '<p class="mini-status">Roll total ' + total + '</p>' +
    '<div class="mini-actions"><button id="miniRoll">Roll again</button></div></section>';
  document.querySelector('#miniRoll').addEventListener('click', function(){ renderDiceMini(selected); });
}

function renderSicBoMini(selected){
  board.innerHTML = '<div id="sicBoMount"></div>';
  if(!window.RetroArcadeSicBo){
    board.innerHTML = '<section class="mini-game coming-soon-game"><h2>' + selected.name + '</h2><p class="mini-status">Sic Bo table engine did not load. Refresh and try again.</p></section>';
    return;
  }
  sicBoGame = window.RetroArcadeSicBo.mount({
    parent: 'sicBoMount',
    selected: selected,
    onRollComplete: function(){
      moves++;
      updateHUD();
    }
  });
}

function renderBaccaratMini(selected){
  const deck = buildDeck();
  const player = [deck.pop(), deck.pop()];
  const banker = [deck.pop(), deck.pop()];
  const score = function(hand){ return hand.reduce(function(sum,c){ return sum + Math.min(c.val, 10); }, 0) % 10; };
  const ps = score(player);
  const bs = score(banker);
  const result = ps === bs ? 'Tie' : (ps > bs ? 'Player wins' : 'Banker wins');
  moves++;
  updateHUD();
  board.innerHTML = '<section class="mini-game poker-mini"><h2>' + selected.name + '</h2>' +
    '<p class="mini-status">' + result + ' | Player ' + ps + ' | Banker ' + bs + '</p>' +
    '<div class="versus-hand"><div><span>Player</span>' + player.map(miniCard).join('') + '</div><div><span>Banker</span>' + banker.map(miniCard).join('') + '</div></div>' +
    '<div class="mini-actions"><button id="miniDeal">Deal again</button></div></section>';
  document.querySelector('#miniDeal').addEventListener('click', function(){ renderBaccaratMini(selected); });
}

function renderSlotMini(selected){
  const symbols = selected.symbols || ['7','BAR','Cherry','Bell','Gem','Star'];
  const reels = [0,1,2].map(function(){ return symbols[Math.floor(Math.random() * symbols.length)]; });
  let result = 'Try again';
  if(reels[0] === reels[1] && reels[1] === reels[2]) result = 'Jackpot';
  else if(reels[0] === reels[1] || reels[1] === reels[2] || reels[0] === reels[2]) result = 'Small win';
  moves++;
  updateHUD();
  board.innerHTML = '<section class="mini-game slot-mini"><h2>' + selected.name + '</h2>' +
    '<div class="slot-reels">' + reels.map(function(r){ return '<span>' + r + '</span>'; }).join('') + '</div>' +
    '<p class="mini-status">' + result + '</p>' +
    '<div class="mini-actions"><button id="miniSpin">Spin</button></div></section>';
  document.querySelector('#miniSpin').addEventListener('click', function(){ renderSlotMini(selected); });
}

function renderComingSoon(selected){
  board.innerHTML = '<section class="mini-game coming-soon-game"><h2>' + selected.name + '</h2>' +
    '<p class="mini-status">This cabinet is being rebuilt as a real game.</p></section>';
}

function renderRetroSlotMini(selected){
  board.innerHTML = '<div id="retroSlotMount"></div>';
  if(!window.RetroArcadeSlots){
    board.innerHTML = '<section class="mini-game coming-soon-game"><h2>' + selected.name + '</h2><p class="mini-status">Slot engine did not load. Refresh and try again.</p></section>';
    return;
  }
  slotGame = window.RetroArcadeSlots.mount({
    parent: 'retroSlotMount',
    selected: selected,
    onSpin: function(){
      moves++;
      updateHUD();
    }
  });
}

function renderSnakeMini(){
  board.innerHTML = '<section class="mini-game snake-mini forest-snake-game"><h2>Garden Snake</h2>' +
    '<div class="snake-canvas-wrap"><div id="snakePhaser" class="snake-phaser-stage"></div></div>' +
    '<p class="mini-status">Use arrow keys or WASD to guide the garden snake. Press R to restart.</p>' +
    '<div class="snake-controls" aria-label="Snake controls"><button data-dir="up" aria-label="Up">↑</button><button data-dir="left" aria-label="Left">←</button><button data-dir="down" aria-label="Down">↓</button><button data-dir="right" aria-label="Right">→</button></div>' +
    '<div class="mini-actions"><button id="snakeRestart">Restart</button></div></section>';

  if(!window.RetroArcadeSnake || !window.Phaser){
    document.querySelector('#snakePhaser').innerHTML = '<div class="engine-missing">Phaser did not load. Check the network and refresh.</div>';
    return;
  }

  snakeGame = window.RetroArcadeSnake.start({
    parent: 'snakePhaser',
    difficulty: difficulty,
    onScore: function(){
      moves++;
      updateHUD();
    },
  });

  board.querySelectorAll('[data-dir]').forEach(function(button){
    button.addEventListener('click', function(){
      if(snakeGame && snakeGame.input) snakeGame.input(button.dataset.dir);
    });
  });
  document.querySelector('#snakeRestart').addEventListener('click', function(){
    moves = 0;
    updateHUD();
    if(snakeGame && snakeGame.restart) snakeGame.restart();
  });
}
function ensureFrogState(){
  if(state.frog) return;
  const savedHi = parseInt(localStorage.getItem('retroArcadeFrogHi') || '0', 10);
  state.frog = {
    credits: 0,
    mode: 'attract',
    score: 0,
    hi: savedHi,
    lives: 3,
    time: 60,
    tick: 0,
    frog: { col: 5, row: 12, x: 5.5, y: 12.5 },
    homes: [false, false, false, false, false],
    lanes: [
      { row: 1, type: 'log', speed: .055, width: 2.4, items: [{x:0}, {x:4.5}, {x:8.8}] },
      { row: 2, type: 'log', speed: -.045, width: 1.8, items: [{x:1.5}, {x:5.8}, {x:9.4}] },
      { row: 3, type: 'log', speed: .065, width: 2.8, items: [{x:.8}, {x:6.2}] },
      { row: 4, type: 'log', speed: -.052, width: 2.2, items: [{x:0}, {x:4.2}, {x:8.3}] },
      { row: 5, type: 'log', speed: .04, width: 1.7, items: [{x:2.4}, {x:6.7}, {x:10.2}] },
      { row: 8, type: 'car', speed: -.07, width: 1.15, items: [{x:1}, {x:4.6}, {x:8.2}] },
      { row: 9, type: 'car', speed: .09, width: 1.3, items: [{x:.4}, {x:5.8}, {x:9.5}] },
      { row: 10, type: 'car', speed: -.055, width: 1.8, items: [{x:2.2}, {x:7.3}] },
      { row: 11, type: 'car', speed: .075, width: 1.05, items: [{x:0}, {x:3.2}, {x:6.4}, {x:9.6}] },
    ],
    message: 'INSERT COIN'
  };
}

function resetFrogRun(frog){
  frog.frog = { col: 5, row: 12, x: 5.5, y: 12.5 };
  frog.time = 60;
}

function coinFrog(){
  ensureFrogState();
  state.frog.credits++;
  state.frog.message = 'PRESS START';
  renderFrogCrossing();
}

function startFrog(){
  ensureFrogState();
  const frog = state.frog;
  if(frog.mode === 'playing') return;
  if(frog.credits <= 0){
    frog.message = 'INSERT COIN';
    renderFrogCrossing();
    return;
  }
  frog.credits--;
  frog.mode = 'playing';
  frog.score = 0;
  frog.lives = 3;
  frog.homes = [false, false, false, false, false];
  frog.message = 'GO';
  resetFrogRun(frog);
  renderFrogCrossing();
}

function endFrogLife(reason){
  const frog = state.frog;
  frog.lives--;
  frog.message = reason;
  if(frog.lives <= 0){
    frog.mode = 'gameover';
    frog.message = frog.credits > 0 ? 'GAME OVER - PRESS START' : 'GAME OVER';
    if(frog.score > frog.hi){
      frog.hi = frog.score;
      localStorage.setItem('retroArcadeFrogHi', String(frog.hi));
    }
    return;
  }
  resetFrogRun(frog);
}

function frogHop(dx, dy){
  ensureFrogState();
  const frog = state.frog;
  if(frog.mode !== 'playing') return;
  const nextCol = Math.max(0, Math.min(10, frog.frog.col + dx));
  const nextRow = Math.max(0, Math.min(12, frog.frog.row + dy));
  frog.frog.col = nextCol;
  frog.frog.row = nextRow;
  frog.frog.x = nextCol + .5;
  frog.frog.y = nextRow + .5;
  frog.score += dy < 0 ? 10 : 1;
  moves++;
  updateHUD();
  checkFrogPosition();
  drawFrogCrossing();
}

function wrapLaneItem(item, lane){
  item.x += lane.speed;
  if(lane.speed > 0 && item.x > 11.5) item.x = -lane.width - .5;
  if(lane.speed < 0 && item.x < -lane.width - .5) item.x = 11.5;
}

function checkFrogPosition(){
  const frog = state.frog;
  if(frog.mode !== 'playing') return;
  const row = frog.frog.row;
  if(row === 0){
    const homeCols = [1, 3, 5, 7, 9];
    const home = homeCols.findIndex(function(col){ return Math.abs(frog.frog.x - (col + .5)) < .72; });
    if(home < 0 || frog.homes[home]){
      endFrogLife('MISSED HOME');
      return;
    }
    frog.homes[home] = true;
    frog.score += 100;
    frog.message = 'FROG HOME';
    if(frog.homes.every(Boolean)){
      frog.mode = 'win';
      frog.score += frog.lives * 250 + Math.max(0, Math.ceil(frog.time)) * 10;
      frog.message = 'ALL FROGS HOME';
      if(frog.score > frog.hi){
        frog.hi = frog.score;
        localStorage.setItem('retroArcadeFrogHi', String(frog.hi));
      }
      stopLiveMiniGames();
      showWin();
      return;
    }
    resetFrogRun(frog);
    return;
  }
  const lane = frog.lanes.find(function(item){ return item.row === row; });
  if(!lane) return;
  if(lane.type === 'car'){
    const hit = lane.items.some(function(item){ return frog.frog.x > item.x && frog.frog.x < item.x + lane.width; });
    if(hit) endFrogLife('ROADKILL');
    return;
  }
  if(lane.type === 'log'){
    const ride = lane.items.find(function(item){ return frog.frog.x > item.x && frog.frog.x < item.x + lane.width; });
    if(!ride){
      endFrogLife('SPLASH');
      return;
    }
  }
}

function tickFrog(){
  ensureFrogState();
  const frog = state.frog;
  if(frog.mode === 'playing'){
    frog.tick++;
    frog.time -= .05;
    frog.lanes.forEach(function(lane){ lane.items.forEach(function(item){ wrapLaneItem(item, lane); }); });
    const lane = frog.lanes.find(function(item){ return item.row === frog.frog.row; });
    if(lane && lane.type === 'log') frog.frog.x += lane.speed;
    if(frog.frog.x < 0 || frog.frog.x > 11) endFrogLife('SPLASH');
    if(frog.time <= 0) endFrogLife('TIME UP');
    checkFrogPosition();
  }
  drawFrogCrossing();
}

function drawRoundedRect(ctx, x, y, w, h, r){
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.fill();
}

function drawFrogCrossing(){
  const canvas = document.querySelector('#frogCanvas');
  if(!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext('2d');
  const frog = state.frog;
  const w = canvas.width;
  const h = canvas.height;
  const top = 44;
  const cols = 11;
  const rows = 13;
  const cell = Math.floor(Math.min(w / cols, (h - top) / rows));
  const ox = Math.floor((w - cols * cell) / 2);
  const oy = top;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#061016';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#0b0612';
  ctx.fillRect(0, 0, w, top);
  ctx.fillStyle = '#75d8ff';
  ctx.font = '16px monospace';
  ctx.fillText('1UP ' + frog.score, 14, 25);
  ctx.fillText('HI ' + frog.hi, 166, 25);
  ctx.fillText('CREDIT ' + frog.credits, 332, 25);
  ctx.fillStyle = '#ffd46f';
  ctx.fillText('TIME ' + Math.max(0, Math.ceil(frog.time)), 474, 25);

  for(let row=0; row<rows; row++){
    let fill = '#102c18';
    if(row === 0) fill = '#173513';
    if(row >= 1 && row <= 5) fill = '#08345b';
    if(row === 6 || row === 7 || row === 12) fill = '#20391e';
    if(row >= 8 && row <= 11) fill = '#1b1c25';
    ctx.fillStyle = fill;
    ctx.fillRect(ox, oy + row * cell, cols * cell, cell);
    if(row >= 8 && row <= 11){
      ctx.strokeStyle = 'rgba(255,255,255,.14)';
      ctx.setLineDash([12, 10]);
      ctx.beginPath();
      ctx.moveTo(ox, oy + row * cell + cell / 2);
      ctx.lineTo(ox + cols * cell, oy + row * cell + cell / 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  const homeCols = [1, 3, 5, 7, 9];
  homeCols.forEach(function(col, idx){
    ctx.fillStyle = frog.homes[idx] ? '#7cffb2' : '#050b07';
    drawRoundedRect(ctx, ox + col * cell + 5, oy + 5, cell - 10, cell - 10, 8);
  });

  frog.lanes.forEach(function(lane){
    lane.items.forEach(function(item){
      const x = ox + item.x * cell;
      const y = oy + lane.row * cell + 8;
      const ww = lane.width * cell;
      if(lane.type === 'log'){
        ctx.fillStyle = '#8b5a2b';
        drawRoundedRect(ctx, x, y, ww, cell - 16, 7);
        ctx.fillStyle = 'rgba(255,212,111,.35)';
        ctx.fillRect(x + 12, y + 8, ww - 24, 4);
      }else{
        ctx.fillStyle = lane.speed > 0 ? '#e33f32' : '#ffd46f';
        drawRoundedRect(ctx, x, y, ww, cell - 16, 6);
        ctx.fillStyle = '#061016';
        ctx.fillRect(x + 8, y + 6, 14, 8);
        ctx.fillRect(x + ww - 22, y + 6, 14, 8);
      }
    });
  });

  if(frog.mode === 'playing'){
    const fx = ox + frog.frog.x * cell;
    const fy = oy + frog.frog.y * cell;
    ctx.fillStyle = '#7cffb2';
    drawRoundedRect(ctx, fx - cell * .34, fy - cell * .32, cell * .68, cell * .64, 8);
    ctx.fillStyle = '#061016';
    ctx.fillRect(fx - 9, fy - 8, 5, 5);
    ctx.fillRect(fx + 4, fy - 8, 5, 5);
  }

  ctx.fillStyle = '#ffd46f';
  ctx.font = '15px monospace';
  ctx.fillText('LIVES ' + frog.lives, 14, h - 14);
  if(frog.mode !== 'playing' || frog.message !== 'GO'){
    const blink = Math.floor(Date.now() / 420) % 2 === 0;
    if(frog.mode !== 'attract' || blink){
      ctx.fillStyle = 'rgba(0,0,0,.72)';
      ctx.fillRect(120, 260, 400, 64);
      ctx.fillStyle = frog.mode === 'gameover' ? '#e33f32' : '#ffd46f';
      ctx.font = '22px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(frog.message, w / 2, 300);
      ctx.textAlign = 'left';
    }
  }
}

function renderFrogCrossing(){
  ensureFrogState();
  const frog = state.frog;
  board.innerHTML = '<section class="mini-game frog-cabinet-game">' +
    '<div class="cabinet-3d frog-cabinet"><div class="cabinet-side left"></div><div class="cabinet-side right"></div>' +
    '<div class="cabinet-marquee">FROG CROSSING</div>' +
    '<div class="cabinet-screen"><canvas id="frogCanvas" width="640" height="760"></canvas></div>' +
    '<div class="cabinet-controls"><button id="frogCoin">COIN</button><button id="frogStart">START</button><span>' + frog.message + '</span></div>' +
    '</div><p class="mini-status">5 coin, 1 start, arrows/WASD hop. Get every frog home.</p></section>';
  document.querySelector('#frogCoin').addEventListener('click', coinFrog);
  document.querySelector('#frogStart').addEventListener('click', startFrog);
  document.onkeydown = function(event){
    if(game !== 'frog-crossing') return;
    const key = event.key.toLowerCase();
    if(key === '5') { event.preventDefault(); coinFrog(); return; }
    if(key === '1') { event.preventDefault(); startFrog(); return; }
    const hops = { arrowup: [0,-1], w: [0,-1], arrowdown: [0,1], s: [0,1], arrowleft: [-1,0], a: [-1,0], arrowright: [1,0], d: [1,0] };
    if(hops[key]){
      event.preventDefault();
      frogHop(hops[key][0], hops[key][1]);
    }
  };
  drawFrogCrossing();
  if(!frogInt) frogInt = setInterval(tickFrog, 50);
}

function renderQuickGame(){
  const found = findArcadeGame(game);
  if(!found) return;
  const selected = found.game;
  if(selected.kind !== 'snake' && selected.kind !== 'frog') stopLiveMiniGames();
  if(selected.kind === 'poker') return renderPokerMini(selected);
  if(selected.kind === 'blackjack') return renderBlackjackMini(selected);
  if(selected.kind === 'highcard') return renderHighCardMini(selected);
  if(selected.kind === 'roulette') return renderRouletteMini(selected);
  if(selected.kind === 'sicbo') return renderSicBoMini(selected);
  if(selected.kind === 'dice') return renderDiceMini(selected);
  if(selected.kind === 'baccarat') return renderBaccaratMini(selected);
  if(selected.kind === 'retro-slot') return renderRetroSlotMini(selected);
  if(selected.kind === 'slots') return renderSlotMini(selected);
  if(selected.kind === 'snake') return renderSnakeMini(selected);
  if(selected.kind === 'frog') return renderFrogCrossing(selected);
  renderComingSoon(selected);
}
const ROOMS = [
  {
    id: 'cards',
    icon: 'Cards',
    name: 'Card Tables',
    desc: 'Solitaire and quick card games',
    games: [
      { id: 'klondike', name: 'Klondike', table: 'Table 1', available: true },
      { id: 'tripeaks', name: 'Tri-Peaks', table: 'Table 2', available: true },
      { id: 'freecell', name: 'FreeCell', table: 'Table 3', available: true },
      { id: 'pyramid', name: 'Pyramid', table: 'Table 4', available: true },
    ],
  },
  {
    id: 'tablegames',
    icon: 'Tables',
    name: 'Table Games',
    desc: 'Roulette, blackjack, dice, and baccarat',
    games: [
      { id: 'blackjack', name: 'Blackjack', table: 'Table 1', kind: 'blackjack', available: true },
      { id: 'sic-bo', name: 'Sic Bo', table: 'Dice 1', kind: 'sicbo', available: true },
    ],
  },
  {
    id: 'poker',
    icon: 'Poker',
    name: 'Poker Tables',
    desc: 'Holdem, draw, stud, and video poker',
    games: [
      { id: 'jacks-or-better', name: 'Jacks or Better', table: 'Video Poker 1', kind: 'poker', engine: 'jacks', available: true },
      { id: 'five-card-draw', name: '5-Card Draw', table: 'Table 1', kind: 'poker', engine: 'draw', available: true },
    ],
  },
  {
    id: 'slots',
    icon: 'Slots',
    name: 'Slot Machines',
    desc: 'Rows of playable slot cabinets',
    games: [
      { id: 'retro-arcade-slot', name: 'RetroArcade Reels', table: 'Slot 1', kind: 'retro-slot', symbols: ['PIXEL','JOY','CRT','7','CHERRY','COIN'], available: true },
    ],
  },
  {
    id: 'classics',
    icon: 'Arcade',
    name: 'Classic Arcade',
    desc: 'Stand-up retro cabinet games',
    games: [
      { id: 'frog-crossing', name: 'Frog Crossing', table: 'Cabinet 1', kind: 'frog', mode: 'frog', prompt: 'Hop lanes and reach the safe side.', available: true },
      { id: 'snake', name: 'Snake', table: 'Cabinet 2', kind: 'snake', mode: 'snake', prompt: 'Eat pixels and dodge your own tail.', available: true },
    ],
  },
];

const arcadeGrid = document.querySelector('#game-grid');
const gameGridWrap = document.querySelector('#game-grid-wrap');
const playArea = document.querySelector('#play-area');
const breadcrumb = document.querySelector('#breadcrumb');
const lobbySubtitle = document.querySelector('#lobby-subtitle');
const arcadeHint = document.querySelector('.arcade-hint');
let currentRoom = null;

function setBreadcrumb(html){
  breadcrumb.innerHTML = html;
  breadcrumb.classList.toggle('hidden', !html);
}

function renderLounge(){
  stopLiveMiniGames();
  currentRoom = null;
  document.body.className = document.body.className.replace(/\bdeck-\w+\b/g, '').trim();
  document.body.classList.add('deck-arcade');
  clearInterval(timerInt);
  isPaused = false;
  playArea.classList.remove('is-paused');
  const pause = document.querySelector('#pauseBtn');
  if(pause) pause.textContent = '⏸ Pause';
  gameGridWrap.classList.remove('hidden');
  playArea.classList.add('hidden');
  document.querySelector('#win').classList.add('hidden');
  lobbySubtitle.textContent = 'Pick a floor';
  if(arcadeHint) arcadeHint.textContent = 'Choose cards, table games, poker, slots, or classic arcade.';
  setBreadcrumb('');

  arcadeGrid.className = 'cabinet-grid casino-floor lounge-floor';
  arcadeGrid.innerHTML = ROOMS.map(function(room){
    return '<button class="zone-door zone-' + room.id + '" type="button" data-room="' + room.id + '">' +
      '<span class="zone-icon">' + room.icon + '</span>' +
      '<span class="zone-name">' + room.name + '</span>' +
      '<span class="zone-desc">' + room.games.length + ' games</span>' +
      '</button>';
  }).join('');

  arcadeGrid.querySelectorAll('[data-room]').forEach(function(card){
    card.addEventListener('click', function(){ renderRoom(card.dataset.room); });
  });
}

function renderRoom(roomId){
  stopLiveMiniGames();
  currentRoom = ROOMS.find(function(room){ return room.id === roomId; });
  if(!currentRoom) return renderLounge();
  gameGridWrap.classList.remove('hidden');
  playArea.classList.add('hidden');
  lobbySubtitle.textContent = currentRoom.name;
  if(arcadeHint) arcadeHint.textContent = 'Pick a game.';
  setBreadcrumb('<a href="#" id="bc-lobby">Arcade</a> / ' + currentRoom.name);
  document.querySelector('#bc-lobby').addEventListener('click', function(event){
    event.preventDefault();
    renderLounge();
  });

  arcadeGrid.className = 'cabinet-grid casino-floor room-floor room-' + currentRoom.id;
  arcadeGrid.innerHTML = currentRoom.games.map(function(item){
    return '<button class="floor-game game-choice station-' + item.id + (item.available === false ? ' unavailable' : '') + '" type="button" data-game="' + item.id + '"' + (item.available === false ? ' disabled' : '') + '>' +
      '<span class="table-label">' + item.table + '</span>' +
      '<span class="table-name">' + item.name + '</span>' +
      '<span class="play-tag">' + (item.available === false ? 'COMING SOON' : 'PLAY') + '</span>' +
      '</button>';
  }).join('');

  arcadeGrid.querySelectorAll('[data-game]').forEach(function(card){
    card.addEventListener('click', function(){ launchGame(card.dataset.game); });
  });
}

function launchGame(gameId){
  const found = findArcadeGame(gameId);
  const selected = found && found.game;
  if(!selected || !selected.available) return;
  currentRoom = found.room;
  game = selected.id;
  arcadeGrid.classList.remove('casino-floor');
  gameGridWrap.classList.add('hidden');
  playArea.classList.remove('hidden');
  playArea.className = playArea.className.split(/\s+/).filter(function(name){ return name && !name.startsWith('play-area-') && !name.startsWith('room-'); }).join(' ');
  playArea.classList.add('play-area-' + selected.id);
  playArea.classList.add('room-' + found.room.id);
  lobbySubtitle.textContent = selected.name;
  document.querySelector('#game-title').textContent = selected.name;
  setBreadcrumb('<a href="#" id="bc-lobby">Arcade</a> / <a href="#" id="bc-room">' + currentRoom.name + '</a> / ' + selected.name);
  document.querySelector('#bc-lobby').addEventListener('click', function(event){
    event.preventDefault();
    renderLounge();
  });
  document.querySelector('#bc-room').addEventListener('click', function(event){
    event.preventDefault();
    renderRoom(currentRoom.id);
  });
  newGame();
}

function backToCurrentRoom(){
  if(currentRoom){
    renderRoom(currentRoom.id);
    return;
  }
  renderLounge();
}

document.querySelector('#backBtn').addEventListener('click', function(){
  renderLounge();
});

document.querySelector('#newGame').addEventListener('click', newGame);
document.querySelector('#pauseBtn').addEventListener('click', function(){
  if(playArea.classList.contains('hidden')) return;
  setPaused(!isPaused);
});
var deckSel = document.querySelector('#deck');
if(deckSel){
  deckSel.addEventListener('change', function(){
    applyDeck();
    if(!playArea.classList.contains('hidden')) renderCurrent();
  });
}
document.querySelector('#undo').addEventListener('click', doUndo);
document.querySelector('#playAgain').addEventListener('click', function(){
  document.querySelector('#win').classList.add('hidden');
  newGame();
});
document.querySelector('#backToArcade').addEventListener('click', renderLounge);

renderLounge();