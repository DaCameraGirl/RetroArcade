const SUITS=[['♠','black'],['♥','red'],['♦','red'],['♣','black']];
const RANKS=['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const RVAL=Object.fromEntries(RANKS.map((r,i)=>[r,i+1]));
let game='klondike',difficulty='medium',moves=0,undoStack=[],state={},timerInt,seconds=0;
const $=s=>document.querySelector(s),board=$('#board');

function buildDeck(){
  let d=[], id=1;
  for(let [s,c] of SUITS) for(let r of RANKS)
    d.push({suit:s,color:c,rank:r,val:RVAL[r],id:id++});
  return d.sort(()=>Math.random()-.5);
}
function cardHtml(c,fd=false){
  if(fd||!c) return `<div class="card back" data-id="${c?.id||''}"></div>`;
  return `<div class="card ${c.color==='red'?'red':''}" data-id="${c.id}">${c.rank}<div class="small">${c.suit}</div></div>`;
}

/* ===== KLONDIKE ===== */
function newKlondike(){
  let d=buildDeck();
  state.tableau=[...Array(7)].map((_,i)=>d.splice(0,i+1).map((card,j)=>({...card,faceUp:j===i})));
  state.stock=d; state.waste=[]; state.foundations=[[],[],[],[]];
  renderKlondike();
}
function renderKlondike(){
  board.innerHTML=`<div class="piles"><div id="stock-pile">${
    state.stock.length?cardHtml({},true):'<div class="pile-slot"></div>'
  }</div><div id="waste-pile" class="waste-click">${
    state.waste.at(-1)?cardHtml(state.waste.at(-1)):'<div class="pile-slot"></div>'
  }</div><div style="flex:1"></div>${
    state.foundations.map((f,i)=>`<div class="pile-slot foundation" data-found="${i}">${
      f.at(-1)?cardHtml(f.at(-1)):''
    }</div>`).join('')
  }</div><div class="tableau">${
    state.tableau.map((col,ci)=>`<div class="tableau-col" data-col="${ci}">`+
      col.map(c=>c.faceUp?cardHtml(c):cardHtml(c,true)).join('')+
      (col.length===0?'<div class="pile-slot empty-col"></div>':'')+
      `</div>`
    ).join('')
  }</div>`;

  // card clicks
  board.querySelectorAll('.card:not(.back)').forEach(el=>{
    el.onclick = e => { e.stopPropagation(); klondikeCardClick(e); };
  });
  // empty tableau column clicks
  board.querySelectorAll('.tableau-col').forEach(el=>{
    el.onclick = e => {
      if(e.target.closest('.card')) return;
      let ci = parseInt(el.dataset.col,10);
      klondikeColClick(ci);
    };
  });
  // foundation clicks
  board.querySelectorAll('.foundation').forEach(el=>{
    el.onclick = () => { if(sel) autoFoundFromTableau(); };
  });
  // stock
  $('#stock-pile').onclick=()=>{
    pushUndo();
    if(state.stock.length){
      let n=difficulty==='hard'?3:1;
      for(let i=0;i<n&&state.stock.length;i++) state.waste.push(state.stock.pop());
    }else{
      state.stock=state.waste.reverse(); state.waste=[];
    }
    sel=null;
    moves++; updateHUD(); renderKlondike();
  };
  // waste pile click (for auto-foundation)
  const wp = board.querySelector('.waste-click');
  if(wp) wp.onclick = e => {
    if(e.target.closest('.card')) return;
    let w = state.waste.at(-1);
    if(w) tryFoundation(w, true);
  };
}
let sel=null;

function klondikeCardClick(e){
  const id=parseInt(e.currentTarget.dataset.id,10);

  // waste card?
  let w = state.waste.find(x=>x.id===id);
  if(w){ tryFoundation(w,true); return; }

  // find in tableau
  for(let ci=0; ci<state.tableau.length; ci++){
    let col=state.tableau[ci], idx=col.findIndex(c=>c.id===id);
    if(idx>=0 && col[idx].faceUp){
      // clicking the already-selected card = try foundation
      if(sel && sel.ci===ci && sel.idx===idx){
        if(tryFoundation(col[idx], false)){ sel=null; return; }
        // foundation failed, keep selected
        return;
      }
      // no selection yet -> select this stack
      if(!sel){
        sel={ci,idx};
        e.currentTarget.classList.add('selected');
        return;
      }
      // have a selection, clicking a different card = try move
      if(sel.ci!==ci || sel.idx!==idx){
        if(tryKMove(sel.ci, sel.idx, ci)){
          sel=null;
          return;
        } else {
          // illegal move, keep selection, just flash
          return;
        }
      }
      return;
    }
  }
  sel=null; renderKlondike();
}

function klondikeColClick(ci){
  if(!sel) return;
  // clicking empty column - try to move King there
  if(tryKMove(sel.ci, sel.idx, ci)){
    sel=null;
  }
}

function tryKMove(a,b,to){
  if(a===to) return false;
  let stack=state.tableau[a].slice(b), target=state.tableau[to].at(-1), first=stack[0];
  if((!target && first.val===13) || (target && target.color!==first.color && target.val===first.val+1)){
    pushUndo();
    state.tableau[to].push(...stack);
    state.tableau[a].length=b;
    let t=state.tableau[a].at(-1); if(t) t.faceUp=true;
    moves++; updateHUD(); renderKlondike(); checkKWin(); return true;
  }
  return false;
}
function tryFoundation(card, fromWaste=false){
  for(let f of state.foundations){
    let top=f.at(-1);
    if((!top && card.val===1) || (top && top.suit===card.suit && top.val+1===card.val)){
      pushUndo();
      if(fromWaste){ state.waste.pop(); }
      else{
        for(let col of state.tableau){
          let i=col.findIndex(x=>x.id===card.id);
          if(i>=0){ col.splice(i,1); let t=col.at(-1); if(t) t.faceUp=true; break; }
        }
      }
      f.push(card); moves++; updateHUD(); renderKlondike(); checkKWin(); return true;
    }
  }
  return false;
}
function autoFoundFromTableau(){
  if(!sel) return;
  let card=state.tableau[sel.ci][sel.idx];
  if(card) tryFoundation(card,false);
  sel=null;
}
function checkKWin(){
  if(state.foundations.reduce((a,f)=>a+f.length,0)===52) showWin();
}

/* ===== TRI-PEAKS ===== */
function newTriPeaks(){
  let d=buildDeck();
  state.peaks=[];
  for(let p=0;p<3;p++){
    let pk=[];
    for(let r=0;r<4;r++) for(let i=0;i<=r;i++)
      pk.push({...d.pop(),peak:p,row:r,col:i,removed:false});
    state.peaks.push(pk);
  }
  state.stock=d; state.waste=[state.stock.pop()];
  renderTriPeaks();
}
function peakAt(p,r,c){ return state.peaks[p].find(x=>x.row===r&&x.col===c); }
function isFreeTP(c){
  if(c.removed) return false;
  let ch=[peakAt(c.peak,c.row+1,c.col), peakAt(c.peak,c.row+1,c.col+1)].filter(Boolean);
  return ch.every(x=>x.removed);
}
function renderTriPeaks(){
  let h='<div class="peaks">';
  for(let r=0;r<4;r++){
    h+='<div class="peak-row">';
    for(let p=0;p<3;p++) for(let c=0;c<=r;c++){
      let card=peakAt(p,r,c);
      if(!card||card.removed){ h+='<div style="width:68px;height:20px"></div>'; continue; }
      let free=isFreeTP(card);
      h+=`<div class="card ${card.color==='red'?'red':''}${free?'':' back'}" data-tpid="${card.id}" style="opacity:${free?1:.55}">${
        free?card.rank+'<div class="small">'+card.suit+'</div>':''
      }</div>`;
    }
    h+='</div>';
  }
  h+='</div>';
  let w=state.waste.at(-1);
  h+=`<div class="waste-row"><div id="tp-stock">${
    state.stock.length?'<div class="card back"></div>':'<div class="pile-slot"></div>'
  }</div><div>${w?cardHtml(w):'<div class="pile-slot"></div>'}</div><span style="color:#888">Click ±1 rank</span></div>`;
  board.innerHTML=h;
  board.querySelectorAll('[data-tpid]').forEach(el=>{
    el.onclick=()=>{
      let id=parseInt(el.dataset.tpid,10);
      let c=state.peaks.flat().find(x=>x.id===id);
      if(!isFreeTP(c)) return;
      let top=state.waste.at(-1), df=Math.abs(c.val-top.val);
      if(df===1||df===12){
        pushUndo(); c.removed=true; state.waste.push(c);
        moves++; updateHUD(); renderTriPeaks();
        if(state.peaks.flat().every(x=>x.removed)) showWin();
      }
    };
  });
  $('#tp-stock').onclick=()=>{
    if(state.stock.length){ pushUndo(); state.waste.push(state.stock.pop());
      moves++; updateHUD(); renderTriPeaks();
    }
  };
}

/* ===== FREE CELL ===== */
function newFreeCell(){
  let d=buildDeck();
  if(difficulty==='easy') d.sort((a,b)=>a.val-b.val+Math.random()-.5);
  state.fc_free=[null,null,null,null];
  state.fc_found=[[],[],[],[]];
  state.fc_tableau=[...Array(8)].map(()=>[]);
  let ci=0; while(d.length){ state.fc_tableau[ci%8].push(d.pop()); ci++; }
  renderFreeCell();
}
function renderFreeCell(){
  let h='<div class="fc-top">'+
    state.fc_free.map((c,i)=>`<div><div class="fc-label">Free</div><div class="pile-slot fc-free" data-free="${i}">${
      c?cardHtml(c):''
    }</div></div>`).join('')+
    '<div style="width:30px"></div>'+
    state.fc_found.map((f,i)=>`<div><div class="fc-label">Home</div><div class="pile-slot">${f.at(-1)?cardHtml(f.at(-1)):''}</div></div>`).join('')+
    '</div>';
  h+='<div class="tableau">'+state.fc_tableau.map((col,ci)=>
    `<div class="tableau-col" data-fccol="${ci}">`+col.map(c=>cardHtml(c)).join('')+`</div>`
  ).join('')+'</div>';
  board.innerHTML=h;
  board.querySelectorAll('.card').forEach(el=>el.onclick=fcClick);
  board.querySelectorAll('.fc-free').forEach(el=>el.onclick=fcSlotClick);
}
let fcSel=null;
function fcGet(id){
  for(let col of state.fc_tableau){ let c=col.find(x=>x.id===id); if(c) return c; }
  return state.fc_free.find(x=>x&&x.id===id);
}
function fcClick(e){
  let id=parseInt(e.currentTarget.dataset.id,10), card=fcGet(id);
  if(!card) return;
  // try auto-foundation first
  for(let f=0; f<4; f++){
    let p=state.fc_found[f], top=p.at(-1);
    if((!top && card.val===1) || (top && top.suit===card.suit && top.val+1===card.val)){
      pushUndo(); fcRemove(card); p.push(card);
      moves++; updateHUD(); renderFreeCell(); checkFCWin(); return;
    }
  }
  // select / deselect
  if(fcSel && fcSel.id===id){ fcSel=null; renderFreeCell(); return; }
  fcSel=card; e.currentTarget.classList.add('selected');
}
function fcSlotClick(e){
  let idx=parseInt(e.currentTarget.dataset.free,10);
  if(fcSel && !state.fc_free[idx]){
    pushUndo(); fcRemove(fcSel); state.fc_free[idx]=fcSel; fcSel=null;
    moves++; updateHUD(); renderFreeCell();
  }
}
function fcRemove(card){
  for(let col of state.fc_tableau){
    let i=col.findIndex(x=>x.id===card.id);
    if(i>=0 && i===col.length-1){ col.splice(i,1); return true; }
  }
  let fi=state.fc_free.findIndex(x=>x&&x.id===card.id);
  if(fi>=0){ state.fc_free[fi]=null; return true; }
  return false;
}
// FreeCell tableau drag-drop click
document.addEventListener('click', e=>{
  if(game!=='freecell') return;
  let colEl=e.target.closest('.tableau-col[data-fccol]');
  if(!colEl || !fcSel) return;
  let ci=parseInt(colEl.dataset.fccol,10);
  let targetCol=state.fc_tableau[ci], target=targetCol.at(-1);
  if((!target && fcSel.val===13) || (target && target.color!==fcSel.color && target.val===fcSel.val+1)){
    pushUndo();
    if(fcRemove(fcSel)){
      targetCol.push(fcSel); fcSel=null;
      moves++; updateHUD(); renderFreeCell();
    }
  }
});
function checkFCWin(){
  if(state.fc_found.reduce((a,f)=>a+f.length,0)===52) showWin();
}

/* ===== SHARED ===== */
function pushUndo(){
  try{ undoStack.push(JSON.stringify({game,state,moves})); if(undoStack.length>40) undoStack.shift(); }catch(e){}
}
function doUndo(){
  let s=undoStack.pop(); if(!s) return;
  let o=JSON.parse(s); state=o.state; moves=o.moves; fcSel=null; sel=null;
  renderCurrent(); updateHUD();
}
function updateHUD(){ $('#moves').textContent='Moves: '+moves; }
function showWin(){
  $('#win-stats').textContent=`${game} — ${difficulty} — ${moves} moves — ${$('#timer').textContent}`;
  $('#win').classList.remove('hidden'); clearInterval(timerInt);
}
function startTimer(){
  clearInterval(timerInt); seconds=0;
  timerInt=setInterval(()=>{
    seconds++;
    $('#timer').textContent=String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');
  },1000);
}
function renderCurrent(){
  if(game==='klondike') renderKlondike();
  else if(game==='tripeaks') renderTriPeaks();
  else renderFreeCell();
}
function newGame(){
  moves=0; undoStack=[]; fcSel=null; sel=null;
  difficulty=$('#difficulty').value;
  startTimer(); updateHUD(); $('#win').classList.add('hidden');
  if(game==='klondike') newKlondike();
  else if(game==='tripeaks') newTriPeaks();
  else newFreeCell();
}
document.querySelectorAll('.game-btn').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('.game-btn').forEach(x=>x.classList.remove('active'));
  b.classList.add('active'); game=b.dataset.game; newGame();
});
$('#newGame').onclick=newGame;
$('#undo').onclick=doUndo;
$('#playAgain').onclick=()=>{ $('#win').classList.add('hidden'); newGame(); };
newGame();
