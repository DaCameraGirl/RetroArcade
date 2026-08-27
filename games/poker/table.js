(function(){
  'use strict';

  const STORAGE_KEY = 'retroA…teV1';
  const BETS = [10, 25, 50, 100, 250, 500];

  const SUITS = [
    { mark: '♠', name: 'spades', color: 'black' },
    { mark: '♥', name: 'hearts', color: 'red' },
    { mark: '♦', name: 'diamonds', color: 'red' },
    { mark: '♣', name: 'clubs', color: 'black' },
  ];
  const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
  const RANK_VAL = { 'A':1,'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13 };

  // Jacks or Better paytable (per 1 coin, multiplied by bet/25 for scaling)
  const PAYTABLE = [
    { name: 'Royal Flush', test: isRoyalFlush, pay: 800 },
    { name: 'Straight Flush', test: isStraightFlush, pay: 50 },
    { name: 'Four of a Kind', test: isFourKind, pay: 25 },
    { name: 'Full House', test: isFullHouse, pay: 9 },
    { name: 'Flush', test: isFlush, pay: 6 },
    { name: 'Straight', test: isStraight, pay: 4 },
    { name: 'Three of a Kind', test: isThreeKind, pay: 3 },
    { name: 'Two Pair', test: isTwoPair, pay: 2 },
    { name: 'Jacks or Better', test: isJacksOrBetter, pay: 1 },
  ];

  let mounted = null;
  let cardUid = 0;

  function freshDeck(){
    const deck = [];
    SUITS.forEach(function(suit){
      RANKS.forEach(function(rank){
        deck.push({ uid: ++cardUid, rank: rank, suit: suit.mark, suitName: suit.name, color: suit.color, val: RANK_VAL[rank] });
      });
    });
    for(let i = deck.length-1; i > 0; i--){
      const j = Math.floor(Math.random()*(i+1));
      const t = deck[i]; deck[i]=deck[j]; deck[j]=t;
    }
    return deck;
  }

  function loadState(){
    try{
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return {
        balance: Number.isFinite(saved.balance) ? saved.balance : 10000,
        bet: BETS.includes(saved.bet) ? saved.bet : 25,
      };
    }catch(e){ return { balance: 10000, bet: 25 }; }
  }
  function saveBank(s){ localStorage.setItem(STORAGE_KEY, JSON.stringify({ balance: s.balance, bet: s.bet })); }
  function fmt(n){ return Math.round(n).toLocaleString('en-US'); }

  // --- hand eval ---
  function valCounts(hand){
    const c = {};
    hand.forEach(function(card){ c[card.val] = (c[card.val]||0)+1; });
    return Object.values(c).sort(function(a,b){ return b-a; });
  }
  function isFlush(hand){
    const s0 = hand[0].suit;
    return hand.every(function(c){ return c.suit === s0; });
  }
  function isStraight(hand){
    const v = hand.map(function(c){ return c.val; }).sort(function(a,b){ return a-b; });
    // A-10-J-Q-K royal
    if(v.join(',') === '1,10,11,12,13') return true;
    // A-2-3-4-5
    if(v.join(',') === '1,2,3,4,5') return true;
    for(let i=1;i<v.length;i++) if(v[i] !== v[i-1]+1) return false;
    return true;
  }
  function isRoyalFlush(hand){ return isFlush(hand) && hand.map(function(c){return c.val;}).sort(function(a,b){return a-b;}).join(',') === '1,10,11,12,13'; }
  function isStraightFlush(hand){ return isFlush(hand) && isStraight(hand) && !isRoyalFlush(hand); }
  function isFourKind(hand){ return valCounts(hand)[0] === 4; }
  function isFullHouse(hand){ const g = valCounts(hand); return g[0] === 3 && g[1] === 2; }
  function isThreeKind(hand){ const g = valCounts(hand); return g[0] === 3 && g[1] !== 2; }
  function isTwoPair(hand){ const g = valCounts(hand); return g[0] === 2 && g[1] === 2; }
  function isJacksOrBetter(hand){
    const counts = {};
    hand.forEach(function(c){ counts[c.val] = (counts[c.val]||0)+1; });
    for(const v in counts){
      if(counts[v] >= 2 && (parseInt(v,10) >= 11 || parseInt(v,10) === 1)) return true;
    }
    return false;
  }
  function evalHand(hand){
    for(let i=0;i<PAYTABLE.length;i++){
      if(PAYTABLE[i].test(hand)) return PAYTABLE[i];
    }
    return null;
  }

  // --- UI ---
  function cardHtml(card, index, held, fresh){
    const holdClass = held ? ' pk-held' : '';
    const freshClass = fresh ? ' deal-new' : '';
    return '<div class="bj-card pk-card ' + (card.color==='red' ? 'red' : 'black') + holdClass + freshClass + '" data-pk-idx="'+index+'" style="--i:'+index+'">' +
      '<span class="bj-corner top">'+card.rank+'<small>'+card.suit+'</small></span>' +
      '<strong class="bj-suit bj-'+card.suitName+'">'+card.suit+'</strong>' +
      '<span class="bj-corner bottom">'+card.rank+'<small>'+card.suit+'</small></span>' +
      (held ? '<em class="pk-hold-badge">HOLD</em>' : '') +
    '</div>';
  }
  function chipsHtml(amount){
    const colors = ['blue','red','green','gold'];
    const count = Math.max(2, Math.min(7, Math.ceil(amount/50)));
    let html = '<div class="bj-chip-stack" aria-label="Bet '+fmt(amount)+'">';
    for(let i=0;i<count;i++) html += '<span class="bj-chip '+colors[i%colors.length]+'" style="--i:'+i+'"></span>';
    return html + '<strong>'+fmt(amount)+'</strong></div>';
  }

  function tableHtml(state){
    const canDeal = state.phase === 'idle' || state.phase === 'settled';
    const canDraw = state.phase === 'hold';
    const freshCards = state.freshCards || [];
    const cards = state.hand.map(function(card,i){
      return card ? cardHtml(card, i, state.holds[i], freshCards.includes(card.uid)) : '<div class="pk-card-slot"></div>';
    }).join('');
    const payRows = PAYTABLE.map(function(row){
      const payout = row.pay * (state.bet / 25);
      const active = state.lastWin && state.lastWin.name === row.name ? ' active' : '';
      return '<div class="pk-pay-row'+active+'"><span>'+row.name+'</span><strong>'+fmt(payout)+'</strong></div>';
    }).join('');
    return '<section class="blackjack-game poker-game" aria-label="RetroArcade draw poker">'+
      '<div class="bj-room-light"></div>'+
      '<div class="bj-bank-panel">'+
        '<div><small>Arcade Chips</small><strong>'+fmt(state.balance)+'</strong></div>'+
        '<div><small>Current Bet</small><strong>'+fmt(state.bet)+'</strong></div>'+
        '<div><small>Last Paid</small><strong>'+fmt(state.lastPaid||0)+'</strong></div>'+
      '</div>'+
      '<div class="blackjack-table-felt pk-table-felt">'+
        '<div class="bj-table-rail"></div>'+
        '<div class="bj-table-title"><span>RETROARCADE</span><strong>DRAW POKER</strong><em>Jacks or Better pays</em></div>'+
        '<div class="pk-paytable">'+ payRows +'</div>'+
        '<div class="pk-hand-zone">'+
          '<div class="bj-cards pk-cards">'+ cards +'</div>'+
          '<div class="pk-hand-readout">'+ (state.handResult || 'Place a bet and deal.') +'</div>'+
        '</div>'+
      '</div>'+
      '<div class="bj-control-deck pk-controls">'+
        '<div class="bj-bet-controls"><button id="pkBetDown" class="'+(!canDeal?'is-disabled':'')+'" type="button">-</button>'+chipsHtml(state.bet)+'<button id="pkBetUp" class="'+(!canDeal?'is-disabled':'')+'" type="button">+</button></div>'+
        (canDraw
          ? '<button id="pkDraw" class="bj-primary" type="button">DRAW ('+ state.holds.filter(Boolean).length +' held)</button>'
          : '<button id="pkDeal" class="bj-primary'+(!canDeal?' is-disabled':'')+'" type="button">'+(state.phase==='settled'?'Deal again':'Deal')+'</button>'
        )+
        '<button id="pkHoldAll" class="'+(!canDraw?'is-disabled':'')+'" type="button">Hold all</button>'+
        '<button id="pkClearHolds" class="'+(!canDraw?'is-disabled':'')+'" type="button">Clear</button>'+
      '</div>'+
    '</section>';
  }

  function render(){
    if(!mounted) return;
    mounted.parent.innerHTML = tableHtml(mounted.state);
    bind();
    mounted.state.freshCards = [];
  }

  function bind(){
    const root = mounted.parent;
    const dealBtn = root.querySelector('#pkDeal');
    if(dealBtn) dealBtn.addEventListener('click', deal);
    const drawBtn = root.querySelector('#pkDraw');
    if(drawBtn) drawBtn.addEventListener('click', draw);
    const up = root.querySelector('#pkBetUp');
    const down = root.querySelector('#pkBetDown');
    if(up) up.addEventListener('click', function(){ changeBet(1); });
    if(down) down.addEventListener('click', function(){ changeBet(-1); });
    const holdAll = root.querySelector('#pkHoldAll');
    if(holdAll) holdAll.addEventListener('click', function(){
      if(mounted.state.phase !== 'hold') return;
      mounted.state.holds = [true,true,true,true,true];
      render();
    });
    const clearH = root.querySelector('#pkClearHolds');
    if(clearH) clearH.addEventListener('click', function(){
      if(mounted.state.phase !== 'hold') return;
      mounted.state.holds = [false,false,false,false,false];
      render();
    });
    root.querySelectorAll('.pk-card').forEach(function(el){
      el.addEventListener('click', function(){
        const idx = parseInt(el.dataset.pkIdx,10);
        toggleHold(idx);
      });
    });
  }

  function changeBet(dir){
    const state = mounted.state;
    if(state.phase === 'hold'){ state.handResult = 'Finish this hand before changing the bet.'; render(); return; }
    const idx = BETS.indexOf(state.bet);
    const next = BETS[Math.max(0, Math.min(BETS.length-1, idx + dir))];
    state.bet = Math.min(next, state.balance || BETS[0]);
    if(state.bet > state.balance) state.bet = BETS.reduce(function(b, bet){ return bet <= state.balance ? bet : b; }, BETS[0]);
    state.handResult = 'Bet set to ' + fmt(state.bet) + ' Arcade Chips.';
    saveBank(state);
    render();
  }

  function deal(){
    const state = mounted.state;
    if(state.phase === 'hold'){ state.handResult = 'Choose your holds, then Draw.'; render(); return; }
    if(state.balance < state.bet){ state.handResult = 'Not enough Arcade Chips. Lower the bet.'; render(); return; }
    state.balance -= state.bet;
    state.lastPaid = 0;
    state.deck = freshDeck();
    state.hand = [0,1,2,3,4].map(function(){ return state.deck.pop(); });
    state.holds = [false,false,false,false,false];
    state.phase = 'hold';
    state.lastWin = null;
    state.handResult = 'Tap cards to HOLD, then press DRAW.';
    state.freshCards = state.hand.map(function(c){ return c.uid; });
    saveBank(state);
    render();
  }

  function toggleHold(i){
    const state = mounted.state;
    if(state.phase !== 'hold') return;
    state.holds[i] = !state.holds[i];
    render();
  }

  function draw(){
    const state = mounted.state;
    if(state.phase !== 'hold') return;
    const fresh = [];
    for(let i=0;i<5;i++){
      if(!state.holds[i]){
        const c = state.deck.pop();
        state.hand[i] = c;
        fresh.push(c.uid);
      }
    }
    state.freshCards = fresh;
    const win = evalHand(state.hand);
    let paid = 0;
    if(win){
      // paytable is per 25-chip unit, scaled by bet
      paid = win.pay * (state.bet / 25) * 25;
      // Actually: pay = multiplier * bet
      paid = win.pay * state.bet;
    }
    state.balance += paid;
    state.lastPaid = paid;
    state.lastWin = win;
    state.phase = 'settled';
    state.handResult = win ? (win.name + ' — ' + fmt(paid) + ' Arcade Chips!') : 'No win. Deal again?';
    state.holds = [false,false,false,false,false];
    saveBank(state);
    render();
    if(typeof mounted.onHandComplete === 'function') mounted.onHandComplete({ paid: paid });
  }

  function mount(options){
    options = options || {};
    const parent = typeof options.parent === 'string' ? document.getElementById(options.parent) : options.parent;
    if(!parent) return null;
    const bank = loadState();
    mounted = {
      parent: parent,
      onHandComplete: options.onHandComplete,
      state: {
        balance: bank.balance,
        bet: bank.bet,
        lastPaid: 0,
        deck: [],
        hand: [null,null,null,null,null],
        holds: [false,false,false,false,false],
        phase: 'idle',
        handResult: 'Place a bet and deal.',
        freshCards: [],
        lastWin: null,
      }
    };
    render();
    return { destroy: destroy };
  }

  function destroy(){ mounted = null; }

  window.RetroArcadePoker = { mount: mount, destroy: destroy };
})();