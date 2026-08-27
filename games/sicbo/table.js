(function(){
  'use strict';

  const STORAGE_KEY = 'retroArcadeSicBoStateV1';
  const BETS = [10, 25, 50, 100, 250, 500];
  const TOTAL_PAYS = { 4: 60, 5: 30, 6: 17, 7: 12, 8: 8, 9: 6, 10: 6, 11: 6, 12: 6, 13: 8, 14: 12, 15: 17, 16: 30, 17: 60 };
  const BET_DEFS = [
    { id: 'small', label: 'Small', sub: '4-10', pay: '1:1' },
    { id: 'big', label: 'Big', sub: '11-17', pay: '1:1' },
    { id: 'odd', label: 'Odd', sub: 'No triple', pay: '1:1' },
    { id: 'even', label: 'Even', sub: 'No triple', pay: '1:1' },
    { id: 'any-triple', label: 'Any Triple', sub: 'Any 3 same', pay: '30:1' },
    { id: 'triple-1', label: 'Triple 1', sub: '1-1-1', pay: '150:1' },
    { id: 'triple-6', label: 'Triple 6', sub: '6-6-6', pay: '150:1' },
    { id: 'single-1', label: 'Single 1', sub: 'Each 1 pays', pay: '1-3x' },
    { id: 'single-2', label: 'Single 2', sub: 'Each 2 pays', pay: '1-3x' },
    { id: 'single-3', label: 'Single 3', sub: 'Each 3 pays', pay: '1-3x' },
    { id: 'single-4', label: 'Single 4', sub: 'Each 4 pays', pay: '1-3x' },
    { id: 'single-5', label: 'Single 5', sub: 'Each 5 pays', pay: '1-3x' },
    { id: 'single-6', label: 'Single 6', sub: 'Each 6 pays', pay: '1-3x' },
    { id: 'total-10', label: 'Total 10', sub: 'Exact sum', pay: '6:1' },
    { id: 'total-11', label: 'Total 11', sub: 'Exact sum', pay: '6:1' },
    { id: 'total-12', label: 'Total 12', sub: 'Exact sum', pay: '6:1' },
    { id: 'total-13', label: 'Total 13', sub: 'Exact sum', pay: '8:1' },
    { id: 'total-14', label: 'Total 14', sub: 'Exact sum', pay: '12:1' },
  ];

  let mounted = null;
  let timers = [];

  function loadState(){
    try{
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return {
        balance: Number.isFinite(saved.balance) ? saved.balance : 10000,
        bet: BETS.includes(saved.bet) ? saved.bet : 25,
        selected: BET_DEFS.some(function(def){ return def.id === saved.selected; }) ? saved.selected : 'big',
      };
    }catch(err){
      return { balance: 10000, bet: 25, selected: 'big' };
    }
  }

  function saveBank(state){
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ balance: state.balance, bet: state.bet, selected: state.selected }));
  }

  function formatChips(value){
    return Math.round(value).toLocaleString('en-US');
  }

  function rollDice(){
    return [1, 2, 3].map(function(){ return 1 + Math.floor(Math.random() * 6); });
  }

  function isTriple(dice){
    return dice[0] === dice[1] && dice[1] === dice[2];
  }

  function scoreBet(selected, dice){
    const total = dice.reduce(function(sum, n){ return sum + n; }, 0);
    const triple = isTriple(dice);
    let multiplier = 0;
    let label = 'No hit';
    if(selected === 'small' && total >= 4 && total <= 10 && !triple){ multiplier = 1; label = 'Small wins'; }
    else if(selected === 'big' && total >= 11 && total <= 17 && !triple){ multiplier = 1; label = 'Big wins'; }
    else if(selected === 'odd' && total % 2 === 1 && !triple){ multiplier = 1; label = 'Odd wins'; }
    else if(selected === 'even' && total % 2 === 0 && !triple){ multiplier = 1; label = 'Even wins'; }
    else if(selected === 'any-triple' && triple){ multiplier = 30; label = 'Any triple'; }
    else if(selected.indexOf('triple-') === 0){
      const face = parseInt(selected.split('-')[1], 10);
      if(triple && dice[0] === face){ multiplier = 150; label = 'Specific triple'; }
    }else if(selected.indexOf('single-') === 0){
      const face = parseInt(selected.split('-')[1], 10);
      const count = dice.filter(function(n){ return n === face; }).length;
      if(count){ multiplier = count; label = count + ' single ' + face; }
    }else if(selected.indexOf('total-') === 0){
      const target = parseInt(selected.split('-')[1], 10);
      if(total === target){ multiplier = TOTAL_PAYS[target] || 6; label = 'Total ' + target; }
    }
    return { total: total, triple: triple, multiplier: multiplier, paid: multiplier ? mounted.state.bet * (multiplier + 1) : 0, label: label };
  }

  function chipsHtml(amount){
    const colors = ['red', 'blue', 'green', 'gold'];
    const count = Math.max(2, Math.min(7, Math.ceil(amount / 50)));
    let html = '<div class="sic-chip-stack" aria-label="Bet ' + formatChips(amount) + '">';
    for(let i = 0; i < count; i++) html += '<span class="sic-chip ' + colors[i % colors.length] + '" style="--i:' + i + '"></span>';
    return html + '<strong>' + formatChips(amount) + '</strong></div>';
  }

  function dieHtml(value, index, rolling){
    let pips = '';
    for(let i = 1; i <= 9; i++) pips += '<i class="pip p' + i + '"></i>';
    return '<div class="sic-die face-' + value + (rolling ? ' rolling' : '') + '" style="--i:' + index + '" aria-label="Die ' + value + '">' + pips + '</div>';
  }

  function betButtonHtml(def, state){
    return '<button class="sic-bet-zone ' + (state.selected === def.id ? 'selected' : '') + '" data-sic-bet="' + def.id + '" type="button">' +
      '<span>' + def.label + '</span><small>' + def.sub + '</small><strong>' + def.pay + '</strong>' +
    '</button>';
  }

  function tableHtml(state){
    return '<section class="sicbo-game" aria-label="RetroArcade Sic Bo table">' +
      '<div class="sic-room-light"></div>' +
      '<div class="sic-meter-panel">' +
        '<div><small>Arcade Chips</small><strong>' + formatChips(state.balance) + '</strong></div>' +
        '<div><small>Bet</small><strong>' + formatChips(state.bet) + '</strong></div>' +
        '<div><small>Last Paid</small><strong>' + formatChips(state.lastPaid || 0) + '</strong></div>' +
      '</div>' +
      '<div class="sic-table">' +
        '<div class="sic-table-title"><span>RETROARCADE</span><strong>SIC BO</strong><em>Three dice. Pick the board.</em></div>' +
        '<div class="sic-dice-bowl">' + state.dice.map(function(n, i){ return dieHtml(n, i, state.rolling); }).join('') + '</div>' +
        '<div class="sic-message">' + state.message + '</div>' +
        '<div class="sic-bet-board">' + BET_DEFS.map(function(def){ return betButtonHtml(def, state); }).join('') + '</div>' +
        '<div class="sic-active-chip">' + chipsHtml(state.bet) + '</div>' +
      '</div>' +
      '<div class="sic-controls">' +
        '<div class="sic-bet-controls"><button id="sicBetDown" type="button" ' + (state.rolling ? 'disabled' : '') + '>-</button>' + chipsHtml(state.bet) + '<button id="sicBetUp" type="button" ' + (state.rolling ? 'disabled' : '') + '>+</button></div>' +
        '<button id="sicRoll" class="sic-roll-button" type="button" ' + (state.rolling ? 'disabled' : '') + '>Roll</button>' +
      '</div>' +
    '</section>';
  }

  function clearTimers(){
    timers.forEach(function(id){ window.clearTimeout(id); });
    timers = [];
  }

  function render(){
    if(!mounted) return;
    mounted.parent.innerHTML = tableHtml(mounted.state);
    bindControls();
  }

  function changeBet(dir){
    const state = mounted.state;
    if(state.rolling) return;
    const idx = BETS.indexOf(state.bet);
    const next = BETS[Math.max(0, Math.min(BETS.length - 1, idx + dir))];
    state.bet = next;
    if(state.bet > state.balance) state.bet = BETS.reduce(function(best, bet){ return bet <= state.balance ? bet : best; }, BETS[0]);
    state.message = 'Bet set to ' + formatChips(state.bet) + ' Arcade Chips.';
    saveBank(state);
    render();
  }

  function selectBet(id){
    const state = mounted.state;
    if(state.rolling) return;
    state.selected = id;
    const def = BET_DEFS.find(function(item){ return item.id === id; });
    state.message = 'Betting ' + (def ? def.label : id) + '.';
    saveBank(state);
    render();
  }

  function roll(){
    const state = mounted.state;
    if(state.rolling) return;
    if(state.balance < state.bet){
      state.message = 'Not enough Arcade Chips for that bet.';
      render();
      return;
    }
    clearTimers();
    state.balance -= state.bet;
    state.lastPaid = 0;
    state.rolling = true;
    state.message = 'Dice tumbling...';
    saveBank(state);
    render();
    let frames = 0;
    function tumble(){
      if(!mounted || mounted.state !== state) return;
      state.dice = rollDice();
      frames++;
      render();
      if(frames < 7){
        timers.push(window.setTimeout(tumble, 110));
      }else{
        state.rolling = false;
        const result = scoreBet(state.selected, state.dice);
        state.lastPaid = result.paid;
        state.balance += result.paid;
        state.message = result.paid ? result.label + ' pays ' + formatChips(result.paid) + ' chips. Total ' + result.total + '.' : 'House wins. Total ' + result.total + '.';
        saveBank(state);
        render();
        if(typeof mounted.onRollComplete === 'function') mounted.onRollComplete(result);
      }
    }
    timers.push(window.setTimeout(tumble, 120));
  }

  function bindControls(){
    const root = mounted.parent;
    root.querySelectorAll('[data-sic-bet]').forEach(function(button){
      button.addEventListener('click', function(){ selectBet(button.dataset.sicBet); });
    });
    root.querySelector('#sicBetDown').addEventListener('click', function(){ changeBet(-1); });
    root.querySelector('#sicBetUp').addEventListener('click', function(){ changeBet(1); });
    root.querySelector('#sicRoll').addEventListener('click', roll);
  }

  function mount(options){
    options = options || {};
    destroy();
    const parent = typeof options.parent === 'string' ? document.getElementById(options.parent) : options.parent;
    if(!parent) return null;
    const bank = loadState();
    mounted = {
      parent: parent,
      onRollComplete: options.onRollComplete,
      state: {
        balance: bank.balance,
        bet: bank.bet,
        selected: bank.selected,
        dice: [1, 2, 3],
        rolling: false,
        lastPaid: 0,
        message: 'Choose a bet and roll.',
      }
    };
    render();
    return { destroy: destroy };
  }

  function destroy(){
    clearTimers();
    mounted = null;
  }

  window.RetroArcadeSicBo = { mount: mount, destroy: destroy };
})();
