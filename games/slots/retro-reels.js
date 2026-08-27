(function(){
  'use strict';

  const STORAGE_KEY = 'retroArcadeSlotStateV1';
  const DEFAULT_SYMBOLS = ['7', 'BAR', 'CHERRY', 'COIN', 'CRT', 'JOY', 'PIXEL'];
  const PAYTABLE = {
    '7': { five: 120, four: 28, three: 8 },
    BAR: { five: 75, four: 20, three: 6 },
    CHERRY: { five: 45, four: 12, three: 4 },
    COIN: { five: 30, four: 8, three: 3 },
    CRT: { five: 22, four: 6, three: 2 },
    JOY: { five: 22, four: 6, three: 2 },
    PIXEL: { five: 18, four: 5, three: 2 },
  };
  const BETS = [10, 25, 50, 100, 250, 500];

  let mounted = null;
  let spinTimers = [];

  function loadState(symbols){
    try{
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return {
        balance: Number.isFinite(saved.balance) ? saved.balance : 10000,
        bet: BETS.includes(saved.bet) ? saved.bet : 25,
        reels: Array.isArray(saved.reels) && saved.reels.length === 5 ? saved.reels : randomReels(symbols),
        holds: Array.isArray(saved.holds) && saved.holds.length === 5 ? saved.holds : [false, false, false, false, false],
        lastWin: Number.isFinite(saved.lastWin) ? saved.lastWin : 0,
      };
    }catch(err){
      return { balance: 10000, bet: 25, reels: randomReels(symbols), holds: [false, false, false, false, false], lastWin: 0 };
    }
  }

  function saveState(state){
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      balance: state.balance,
      bet: state.bet,
      reels: state.reels,
      holds: state.holds,
      lastWin: state.lastWin,
    }));
  }

  function randomSymbol(symbols){
    const bag = symbols.concat(['CHERRY', 'COIN', 'BAR', '7']);
    return bag[Math.floor(Math.random() * bag.length)];
  }

  function randomReels(symbols){
    return Array.from({ length: 5 }, function(){ return randomSymbol(symbols); });
  }

  function countSymbols(reels){
    return reels.reduce(function(counts, symbol){
      counts[symbol] = (counts[symbol] || 0) + 1;
      return counts;
    }, {});
  }

  function scoreSpin(state){
    const counts = countSymbols(state.reels);
    let best = { symbol: '', count: 0, multiplier: 0 };
    Object.keys(counts).forEach(function(symbol){
      const count = counts[symbol];
      const pay = PAYTABLE[symbol] || { five: 12, four: 4, three: 1 };
      const multiplier = count >= 5 ? pay.five : count >= 4 ? pay.four : count >= 3 ? pay.three : 0;
      if(multiplier > best.multiplier) best = { symbol: symbol, count: count, multiplier: multiplier };
    });
    const retroSet = state.reels.includes('CRT') && state.reels.includes('JOY') && state.reels.includes('PIXEL');
    const bonus = retroSet ? 4 : 0;
    const multiplier = best.multiplier + bonus;
    return {
      win: multiplier ? state.bet * multiplier : 0,
      label: multiplier ? (best.count + ' ' + best.symbol + (bonus ? ' + RETRO SET' : '')) : 'No line win',
      multiplier: multiplier,
      retroSet: retroSet,
    };
  }

  function symbolClass(symbol){
    return 'symbol-' + String(symbol).toLowerCase().replace(/[^a-z0-9]+/g, '-');
  }

  function symbolHtml(symbol){
    const label = symbol === 'CHERRY' ? 'Cherries' : symbol === 'COIN' ? 'Coin' : symbol === 'CRT' ? 'CRT' : symbol === 'JOY' ? 'Joystick' : symbol === 'PIXEL' ? 'Pixel' : symbol;
    return '<div class="slot-symbol ' + symbolClass(symbol) + '"><span class="symbol-mark">' + symbol + '</span><small>' + label + '</small></div>';
  }

  function reelStripHtml(finalSymbol, symbols, spinning){
    const visible = [];
    for(let i = 0; i < 10; i++) visible.push(randomSymbol(symbols));
    visible.push(finalSymbol);
    visible.push(randomSymbol(symbols));
    return '<div class="reel-strip' + (spinning ? ' is-spinning' : '') + '">' + visible.map(symbolHtml).join('') + '</div>';
  }

  function formatChips(value){
    return Math.max(0, value).toLocaleString('en-US');
  }

  function paytableHtml(){
    return ['7', 'BAR', 'CHERRY', 'COIN', 'CRT'].map(function(symbol){
      const pay = PAYTABLE[symbol];
      return '<div class="pay-row"><span>' + symbol + ' x5</span><strong>' + pay.five + 'x</strong></div>';
    }).join('') + '<div class="pay-row"><span>CRT + JOY + PIXEL</span><strong>+4x</strong></div>';
  }

  function cabinetHtml(state, selected){
    const status = state.lastWin > 0 ? 'WIN ' + formatChips(state.lastWin) + ' ARCADE CHIPS' : 'Line up symbols and build the retro set.';
    return '<section class="slot-casino-game" aria-label="RetroArcade Reels slot machine">' +
      '<div class="slot-room-glow"></div>' +
      '<div class="slot-machine-shell ' + (state.lastWin > 0 ? 'slot-winning' : '') + '">' +
        '<div class="slot-marquee"><span>RETROARCADE</span><strong>REELS</strong></div>' +
        '<div class="slot-top-panel">' +
          '<div><small>Balance</small><strong id="slotBalance">' + formatChips(state.balance) + '</strong></div>' +
          '<div><small>Bet</small><strong id="slotBet">' + formatChips(state.bet) + '</strong></div>' +
          '<div><small>Paid</small><strong id="slotPaid">' + formatChips(state.lastWin) + '</strong></div>' +
        '</div>' +
        '<div class="slot-glass">' +
          '<div class="payline"></div>' +
          '<div class="slot-reel-window">' + state.reels.map(function(symbol, i){
            return '<button class="slot-reel-cabinet ' + (state.holds[i] ? 'held' : '') + '" data-hold="' + i + '" type="button" aria-label="Hold reel ' + (i + 1) + '">' +
              reelStripHtml(symbol, selected.symbols || DEFAULT_SYMBOLS, false) +
              '<span class="hold-badge">' + (state.holds[i] ? 'HELD' : 'HOLD') + '</span>' +
            '</button>';
          }).join('') + '</div>' +
        '</div>' +
        '<div class="slot-message" id="slotMessage">' + status + '</div>' +
        '<div class="slot-console">' +
          '<div class="chip-tray" aria-label="Bet controls"><button id="slotBetDown" type="button">-</button><span class="chip-stack"><i></i><i></i><i></i></span><button id="slotBetUp" type="button">+</button></div>' +
          '<button id="slotSpin" class="slot-spin-button" type="button">SPIN</button>' +
          '<button id="slotClearHolds" class="slot-small-button" type="button">Clear holds</button>' +
        '</div>' +
      '</div>' +
      '<aside class="slot-paytable"><h3>Paytable</h3>' + paytableHtml() + '</aside>' +
      '<div class="coin-burst" id="coinBurst"></div>' +
    '</section>';
  }

  function setMessage(text){
    const el = mounted && mounted.parent.querySelector('#slotMessage');
    if(el) el.textContent = text;
  }

  function updateMeters(state){
    const root = mounted && mounted.parent;
    if(!root) return;
    const bal = root.querySelector('#slotBalance');
    const bet = root.querySelector('#slotBet');
    const paid = root.querySelector('#slotPaid');
    if(bal) bal.textContent = formatChips(state.balance);
    if(bet) bet.textContent = formatChips(state.bet);
    if(paid) paid.textContent = formatChips(state.lastWin);
  }

  function burstCoins(){
    const burst = mounted && mounted.parent.querySelector('#coinBurst');
    if(!burst) return;
    burst.innerHTML = '';
    for(let i = 0; i < 26; i++){
      const coin = document.createElement('span');
      coin.style.setProperty('--x', (Math.random() * 420 - 210).toFixed(0) + 'px');
      coin.style.setProperty('--y', (-Math.random() * 260 - 80).toFixed(0) + 'px');
      coin.style.setProperty('--d', (Math.random() * .34).toFixed(2) + 's');
      burst.appendChild(coin);
    }
    window.setTimeout(function(){ burst.innerHTML = ''; }, 1000);
  }

  function rerenderReels(state, selected, spinning){
    const root = mounted && mounted.parent;
    if(!root) return;
    const windowEl = root.querySelector('.slot-reel-window');
    if(!windowEl) return;
    windowEl.innerHTML = state.reels.map(function(symbol, i){
      return '<button class="slot-reel-cabinet ' + (state.holds[i] ? 'held' : '') + '" data-hold="' + i + '" type="button" aria-label="Hold reel ' + (i + 1) + '">' +
        reelStripHtml(symbol, selected.symbols || DEFAULT_SYMBOLS, spinning && !state.holds[i]) +
        '<span class="hold-badge">' + (state.holds[i] ? 'HELD' : 'HOLD') + '</span>' +
      '</button>';
    }).join('');
    bindHoldButtons(state, selected);
  }

  function clearTimers(){
    spinTimers.forEach(function(id){ window.clearTimeout(id); });
    spinTimers = [];
  }

  function bindHoldButtons(state, selected){
    const root = mounted && mounted.parent;
    if(!root) return;
    root.querySelectorAll('[data-hold]').forEach(function(button){
      button.addEventListener('click', function(){
        if(mounted.spinning) return;
        const idx = parseInt(button.dataset.hold, 10);
        state.holds[idx] = !state.holds[idx];
        state.lastWin = 0;
        saveState(state);
        rerenderReels(state, selected, false);
        updateMeters(state);
        setMessage(state.holds[idx] ? 'Reel ' + (idx + 1) + ' held.' : 'Reel ' + (idx + 1) + ' released.');
      });
    });
  }

  function spin(state, selected){
    if(mounted.spinning) return;
    if(state.balance < state.bet){
      setMessage('Not enough Arcade Chips for that bet.');
      return;
    }
    mounted.spinning = true;
    state.balance -= state.bet;
    state.lastWin = 0;
    updateMeters(state);
    setMessage('Reels spinning...');
    const symbols = selected.symbols || DEFAULT_SYMBOLS;
    state.reels = state.reels.map(function(symbol, i){ return state.holds[i] ? symbol : randomSymbol(symbols); });
    rerenderReels(state, selected, true);

    clearTimers();
    spinTimers.push(window.setTimeout(function(){
      const result = scoreSpin(state);
      state.lastWin = result.win;
      state.balance += result.win;
      mounted.spinning = false;
      state.holds = [false, false, false, false, false];
      saveState(state);
      rerenderReels(state, selected, false);
      updateMeters(state);
      const shell = mounted.parent.querySelector('.slot-machine-shell');
      if(shell) shell.classList.toggle('slot-winning', result.win > 0);
      setMessage(result.win > 0 ? result.label + ' pays ' + formatChips(result.win) + ' chips.' : result.label + '. Try the next spin.');
      if(result.win > 0) burstCoins();
      if(typeof mounted.onSpin === 'function') mounted.onSpin(result);
    }, 1180));
  }

  function changeBet(state, dir){
    if(mounted.spinning) return;
    const idx = BETS.indexOf(state.bet);
    const next = BETS[Math.max(0, Math.min(BETS.length - 1, idx + dir))];
    state.bet = next;
    state.lastWin = 0;
    saveState(state);
    updateMeters(state);
    setMessage('Bet set to ' + formatChips(state.bet) + ' Arcade Chips.');
  }

  function bindControls(state, selected){
    const root = mounted.parent;
    bindHoldButtons(state, selected);
    root.querySelector('#slotSpin').addEventListener('click', function(){ spin(state, selected); });
    root.querySelector('#slotBetDown').addEventListener('click', function(){ changeBet(state, -1); });
    root.querySelector('#slotBetUp').addEventListener('click', function(){ changeBet(state, 1); });
    root.querySelector('#slotClearHolds').addEventListener('click', function(){
      if(mounted.spinning) return;
      state.holds = [false, false, false, false, false];
      state.lastWin = 0;
      saveState(state);
      rerenderReels(state, selected, false);
      updateMeters(state);
      setMessage('Holds cleared.');
    });
  }

  function mount(options){
    options = options || {};
    const parent = typeof options.parent === 'string' ? document.getElementById(options.parent) : options.parent;
    if(!parent) return null;
    destroy();
    const selected = options.selected || { symbols: DEFAULT_SYMBOLS };
    const state = loadState(selected.symbols || DEFAULT_SYMBOLS);
    mounted = { parent: parent, state: state, selected: selected, spinning: false, onSpin: options.onSpin };
    parent.innerHTML = cabinetHtml(state, selected);
    bindControls(state, selected);
    return {
      spin: function(){ spin(state, selected); },
      destroy: destroy,
    };
  }

  function destroy(){
    clearTimers();
    if(mounted){
      mounted.spinning = false;
      mounted = null;
    }
  }

  window.RetroArcadeSlots = { mount: mount, destroy: destroy };
})();
