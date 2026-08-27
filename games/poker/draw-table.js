(function(){
  'use strict';

  const STORAGE_KEY = 'retroArcadeDrawPokerBankV1';
  const RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
  const SUITS = [
    { mark: '♠', color: 'black' },
    { mark: '♥', color: 'red' },
    { mark: '♦', color: 'red' },
    { mark: '♣', color: 'black' },
  ];
  const SEAT_NAMES = ['YOU','Mack','Rosa','Chip','Dee','Vic'];
  const SEAT_AVATARS = ['YOU','MK','RO','CH','DE','VC'];
  const BET_STEP = 25;
  const PLAYER_TURN_SECONDS = 10;
  const BOT_ACTION_DELAY = 1200;
  const BOT_REVEAL_DELAY = 650;

  let mounted = null;

  function formatChips(value){
    return Math.round(value).toLocaleString('en-US');
  }

  function loadBank(){
    try{
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return Number.isFinite(saved.bankroll) ? saved.bankroll : 5000;
    }catch(err){
      return 5000;
    }
  }

  function saveBank(bankroll){
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ bankroll: bankroll }));
  }

  function evaluateHand(hand){
    const rankOrder = { '2':2, '3':3, '4':4, '5':5, '6':6, '7':7, '8':8, '9':9, '10':10, J:11, Q:12, K:13, A:14 };
    const vals = hand.map(function(card){ return rankOrder[card.rank]; }).sort(function(a,b){ return b-a; });
    const suits = hand.map(function(card){ return card.suit; });
    const unique = Array.from(new Set(vals)).sort(function(a,b){ return b-a; });
    const isWheel = unique.join(',') === '14,5,4,3,2';
    const isStraight = unique.length === 5 && (unique[0] - unique[4] === 4 || isWheel);
    const isFlush = new Set(suits).size === 1;
    const counts = {};
    vals.forEach(function(value){ counts[value] = (counts[value] || 0) + 1; });
    const groups = Object.keys(counts).map(function(value){ return { value: Number(value), count: counts[value] }; })
      .sort(function(a,b){ return b.count - a.count || b.value - a.value; });
    const freq = groups.map(function(group){ return group.count; });
    let rankValue = 0;
    let name = 'High Card';
    let ordered = groups.flatMap(function(group){ return Array(group.count).fill(group.value); });
    if(isStraight && isFlush){ rankValue = 8; name = 'Straight Flush'; ordered = [isWheel ? 5 : unique[0]]; }
    else if(freq[0] === 4){ rankValue = 7; name = 'Four of a Kind'; }
    else if(freq[0] === 3 && freq[1] === 2){ rankValue = 6; name = 'Full House'; }
    else if(isFlush){ rankValue = 5; name = 'Flush'; ordered = vals; }
    else if(isStraight){ rankValue = 4; name = 'Straight'; ordered = [isWheel ? 5 : unique[0]]; }
    else if(freq[0] === 3){ rankValue = 3; name = 'Three of a Kind'; }
    else if(freq[0] === 2 && freq[1] === 2){ rankValue = 2; name = 'Two Pair'; }
    else if(freq[0] === 2){ rankValue = 1; name = 'Pair of ' + RANKS[groups[0].value - 2] + 's'; }
    const tieBreak = ordered.reduce(function(total, value, index){ return total + value * Math.pow(15, 5 - index); }, 0);
    return { rankValue: rankValue, name: name, tieBreak: tieBreak };
  }

  class DrawPoker {
    constructor(maxSeats, bankroll){
      this.maxSeats = maxSeats || 6;
      this.ante = 10;
      this.seats = new Array(this.maxSeats).fill(null);
      this.seats[0] = { name: 'YOU', chips: bankroll, hand: [], currentBet: 0, folded: false, lastAction: '' };
      this.pot = 0;
      this.phase = 'idle';
      this.deck = [];
      this.currentPlayer = 0;
      this.lastResult = '';
      this.lastWinner = null;
      for(let i = 1; i < this.maxSeats; i++) this.joinSeat(i);
    }

    joinSeat(index){
      if(index <= 0 || index >= this.maxSeats || this.seats[index]) return;
      this.seats[index] = { name: SEAT_NAMES[index], chips: 1800 + Math.floor(Math.random() * 2600), hand: [], currentBet: 0, folded: false, lastAction: '' };
    }

    newDeck(){
      this.deck = [];
      SUITS.forEach(function(suit){
        RANKS.forEach(function(rank, index){
          this.deck.push({ rank: rank, suit: suit.mark, color: suit.color, value: index });
        }, this);
      }, this);
      for(let i = this.deck.length - 1; i > 0; i--){
        const j = Math.floor(Math.random() * (i + 1));
        const temp = this.deck[i];
        this.deck[i] = this.deck[j];
        this.deck[j] = temp;
      }
    }

    activeSeats(){
      return this.seats.map(function(seat, index){ return seat ? index : null; }).filter(function(index){ return index !== null; });
    }

    deal(){
      if(this.seats[0].chips < this.ante) return false;
      this.newDeck();
      this.pot = 0;
      this.lastResult = '';
      this.lastWinner = null;
      this.activeSeats().forEach(function(index){
        const seat = this.seats[index];
        seat.hand = [];
        seat.currentBet = 0;
        seat.folded = false;
        seat.lastAction = 'Ante ' + this.ante;
        const ante = Math.min(this.ante, seat.chips);
        seat.chips -= ante;
        this.pot += ante;
      }, this);
      this.activeSeats().forEach(function(index){
        this.seats[index].hand = this.deck.splice(0, 5);
      }, this);
      this.phase = 'draw';
      this.currentPlayer = 0;
      this.lastResult = 'Cards dealt. Choose your discards.';
      saveBank(this.seats[0].chips);
      return true;
    }

    playerDraw(discardIdxs){
      if(this.phase !== 'draw') return;
      const player = this.seats[0];
      discardIdxs.sort(function(a,b){ return b-a; }).forEach(function(index){
        if(index >= 0 && index < player.hand.length) player.hand.splice(index, 1);
      });
      while(player.hand.length < 5 && this.deck.length) player.hand.push(this.deck.shift());
      this.activeSeats().forEach(function(index){
        if(index === 0) return;
        const seat = this.seats[index];
        const ev = evaluateHand(seat.hand);
        let discards = [];
        if(ev.rankValue < 1){
          const sorted = seat.hand.map(function(card, cardIndex){ return Object.assign({ cardIndex: cardIndex }, card); }).sort(function(a,b){ return a.value - b.value; });
          discards = sorted.slice(0, 3).map(function(card){ return card.cardIndex; });
        }else if(ev.rankValue === 1){
          const counts = {};
          seat.hand.forEach(function(card){ counts[card.rank] = (counts[card.rank] || 0) + 1; });
          const pairRank = Object.keys(counts).find(function(rank){ return counts[rank] === 2; });
          seat.hand.forEach(function(card, cardIndex){ if(card.rank !== pairRank) discards.push(cardIndex); });
        }
        const discardCount = discards.length;
        discards.sort(function(a,b){ return b-a; }).forEach(function(cardIndex){ seat.hand.splice(cardIndex, 1); });
        while(seat.hand.length < 5 && this.deck.length) seat.hand.push(this.deck.shift());
        seat.lastAction = discardCount ? 'Drew ' + discardCount : 'Stands pat';
      }, this);
      this.phase = 'bet';
      this.currentPlayer = 0;
      this.lastResult = 'Your turn. Bet or check.';
    }

    playerBet(amount){
      if(this.phase !== 'bet') return 0;
      amount = Math.max(0, Math.min(amount, this.seats[0].chips | 0));
      const player = this.seats[0];
      player.chips -= amount;
      player.currentBet = amount;
      player.lastAction = amount ? 'Bet ' + formatChips(amount) : 'Checks';
      this.pot += amount;
      this.phase = 'bot-betting';
      this.lastResult = 'Dealer is moving action around the table.';
      saveBank(player.chips);
      return amount;
    }

    botBet(index, playerAmount){
      if(this.phase !== 'bot-betting') return '';
      const seat = this.seats[index];
      if(!seat || seat.folded) return '';
      const ev = evaluateHand(seat.hand);
      let botBet = 0;
      let action = 'Checks';
      if(playerAmount > 0){
        const shouldCall = ev.rankValue >= 1 || Math.random() > 0.45;
        if(shouldCall){
          botBet = Math.min(seat.chips, playerAmount);
          action = 'Calls ' + formatChips(botBet);
        }else{
          seat.folded = true;
          action = 'Folds';
        }
      }else if(ev.rankValue >= 2){
        botBet = Math.min(seat.chips, 25 + Math.floor(Math.random() * 3) * 25);
        action = 'Bets ' + formatChips(botBet);
      }
      seat.currentBet = botBet;
      seat.chips -= botBet;
      seat.lastAction = action;
      this.pot += botBet;
      return action;
    }

    showdown(){
      const active = this.activeSeats().filter(function(index){ return !this.seats[index].folded; }, this);
      const results = active.map(function(index){
        const ev = evaluateHand(this.seats[index].hand);
        return Object.assign({ index: index }, ev);
      }, this).sort(function(a,b){ return b.rankValue - a.rankValue || b.tieBreak - a.tieBreak; });
      const winner = results[0];
      this.seats[winner.index].chips += this.pot;
      this.lastWinner = winner.index;
      this.lastResult = (winner.index === 0 ? 'YOU WIN! ' : this.seats[winner.index].name + ' wins ') + 'with ' + winner.name + ' - Pot: ' + formatChips(this.pot);
      this.pot = 0;
      this.phase = 'showdown';
      saveBank(this.seats[0].chips);
    }

    resetHand(){
      this.seats.forEach(function(seat){
        if(seat){ seat.hand = []; seat.currentBet = 0; seat.folded = false; seat.lastAction = ''; }
      });
      this.phase = 'idle';
      this.lastResult = '';
      this.lastWinner = null;
      this.currentPlayer = 0;
    }
  }

  function cardHtml(card, index, selected){
    if(!card) return '';
    return '<button type="button" class="draw-card ' + (card.color === 'red' ? 'red' : 'black') + (selected ? ' selected' : '') + '" data-card-index="' + index + '"><span>' + card.rank + '</span><strong>' + card.suit + '</strong></button>';
  }

  function seatCardsHtml(seat, index, phase){
    if(!seat || !seat.hand.length) return '';
    if(index === 0) return '';
    if(phase === 'showdown') return seat.hand.map(function(card){ return '<span class="draw-mini-card ' + card.color + '">' + card.rank + card.suit + '</span>'; }).join('');
    return seat.hand.map(function(){ return '<span class="draw-card-back"></span>'; }).join('');
  }

  function chipStackHtml(amount){
    const count = Math.max(1, Math.min(7, Math.ceil(amount / 50)));
    let html = '<div class="draw-pot-chips" aria-hidden="true">';
    for(let i = 0; i < count; i++) html += '<span style="--i:' + i + '"></span>';
    return html + '</div>';
  }

  function clearActionTimers(){
    if(!mounted) return;
    if(mounted.playerTimer) clearInterval(mounted.playerTimer);
    mounted.playerTimer = null;
    mounted.playerSeconds = null;
    mounted.actionTimers.forEach(function(timer){ clearTimeout(timer); });
    mounted.actionTimers = [];
  }

  function queueAction(fn, delay){
    if(!mounted) return;
    const timer = setTimeout(function(){
      if(!mounted) return;
      mounted.actionTimers = mounted.actionTimers.filter(function(item){ return item !== timer; });
      fn();
    }, delay);
    mounted.actionTimers.push(timer);
  }

  function startPlayerTimer(){
    clearActionTimers();
    if(!mounted || mounted.game.phase !== 'bet') return;
    mounted.playerSeconds = PLAYER_TURN_SECONDS;
    mounted.playerTimer = setInterval(function(){
      if(!mounted || mounted.game.phase !== 'bet'){
        clearActionTimers();
        return;
      }
      mounted.playerSeconds -= 1;
      if(mounted.playerSeconds <= 0){
        startBotSequence(0);
        return;
      }
      render();
    }, 1000);
    render();
  }

  function startBotSequence(amount){
    if(!mounted || mounted.game.phase !== 'bet') return;
    clearActionTimers();
    mounted.playerBetAmount = mounted.game.playerBet(amount);
    mounted.botQueue = mounted.game.activeSeats().filter(function(index){ return index !== 0 && mounted.game.seats[index] && !mounted.game.seats[index].folded; });
    advanceBotQueue();
  }

  function advanceBotQueue(){
    if(!mounted) return;
    const game = mounted.game;
    if(!mounted.botQueue.length){
      game.currentPlayer = -1;
      game.lastResult = 'Dealer reveals the hands.';
      render();
      queueAction(function(){
        if(!mounted) return;
        game.showdown();
        if(typeof mounted.onHandComplete === 'function') mounted.onHandComplete({ message: game.lastResult });
        render();
      }, BOT_REVEAL_DELAY);
      return;
    }
    const index = mounted.botQueue.shift();
    const seat = game.seats[index];
    game.currentPlayer = index;
    seat.lastAction = 'Thinking';
    game.lastResult = seat.name + ' is thinking.';
    render();
    queueAction(function(){
      if(!mounted || game.phase !== 'bot-betting') return;
      const action = game.botBet(index, mounted.playerBetAmount);
      game.lastResult = seat.name + ' ' + action.toLowerCase() + '.';
      render();
      queueAction(advanceBotQueue, BOT_REVEAL_DELAY);
    }, BOT_ACTION_DELAY);
  }

  function seatActionText(seat){
    if(!seat) return '';
    if(seat.folded) return 'Folded';
    return seat.lastAction || '';
  }

  function render(){
    if(!mounted) return;
    const game = mounted.game;
    const selected = mounted.selectedDiscard;
    const player = game.seats[0];
    const playerEval = player.hand.length === 5 ? evaluateHand(player.hand).name : '';
    const timerText = game.phase === 'bet' && mounted.playerSeconds !== null ? '<em class="draw-action-timer">Turn ' + mounted.playerSeconds + '</em>' : '';
    const status = mounted.message || (game.phase === 'idle' ? 'Deal a hand. Ante is 10 Arcade Chips.' :
      game.phase === 'draw' ? (selected.size ? selected.size + ' selected to discard.' : 'Select cards to discard or stand pat.') :
      game.phase === 'bet' ? 'Your turn. Bet or check.' :
      game.phase === 'bot-betting' ? game.lastResult : game.lastResult);
    const mainLabel = game.phase === 'idle' ? 'Deal Hand' :
      game.phase === 'draw' ? (selected.size ? 'Draw ' + selected.size : 'Stand Pat') :
      game.phase === 'bet' ? 'Bet ' + formatChips(mounted.uiBet) :
      game.phase === 'bot-betting' ? 'Action...' : 'Next Hand';
    const mainDisabled = game.phase === 'bot-betting' ? ' disabled' : '';
    const secondary = game.phase === 'draw' ? '<button type="button" class="draw-btn" id="drawKeep">Keep All</button>' :
      game.phase === 'bet' ? '<button type="button" class="draw-btn" id="drawCheck">Check</button>' : '';
    const betControls = game.phase === 'bet' ? '<div class="draw-bet-controls"><button type="button" id="drawBetDown">-</button><span>' + formatChips(mounted.uiBet) + '</span><button type="button" id="drawBetUp">+</button></div>' : '';
    mounted.parent.innerHTML = '<section class="draw-poker-game" aria-label="5-card draw poker table">' +
      '<div class="draw-topbar"><strong>Poker Room - Table 1</strong><span>5-Card Draw</span><span>Arcade Chips <b>' + formatChips(player.chips) + '</b></span></div>' +
      '<div class="draw-table-wrap"><div class="draw-poker-table">' +
        '<div class="draw-pot-area">' + chipStackHtml(game.pot) + '<strong>' + formatChips(game.pot) + '</strong><span>POT</span></div>' +
        '<div class="draw-table-log">' + timerText + '<span>' + status + '</span></div>' +
        game.seats.map(function(seat, index){
          const occupied = seat ? ' occupied' : ' empty';
          const active = game.currentPlayer === index && game.phase !== 'idle' && game.phase !== 'showdown' ? ' active' : '';
          const winner = game.lastWinner === index ? ' winner' : '';
          const folded = seat && seat.folded ? ' folded' : '';
          const thinking = seat && seat.lastAction === 'Thinking' ? ' thinking' : '';
          const betText = seat && seat.currentBet ? 'Bet ' + formatChips(seat.currentBet) : '';
          return '<div class="draw-seat draw-seat-' + index + occupied + active + winner + folded + thinking + '">' +
            '<div class="draw-avatar">' + (seat ? SEAT_AVATARS[index] : '+') + '</div>' +
            '<div class="draw-seat-name">' + (seat ? seat.name : 'JOIN') + '</div>' +
            '<div class="draw-seat-chips">' + (seat ? formatChips(seat.chips) : '') + '</div>' +
            '<div class="draw-seat-bet">' + betText + '</div>' +
            '<div class="draw-seat-action">' + seatActionText(seat) + '</div>' +
            '<div class="draw-seat-cards">' + seatCardsHtml(seat, index, game.phase) + '</div>' +
          '</div>';
        }).join('') +
      '</div></div>' +
      '<div class="draw-hand-dock"><div class="draw-hand-panel"><div class="draw-your-cards">' + player.hand.map(function(card, index){ return cardHtml(card, index, selected.has(index)); }).join('') + '</div><div class="draw-status"><span>' + status + '</span><strong>' + playerEval + '</strong></div></div>' +
      '<div class="draw-action-panel"><button type="button" class="draw-btn primary" id="drawMain"' + mainDisabled + '>' + mainLabel + '</button>' + betControls + secondary + '</div></div>' +
    '</section>';
    bindControls();
  }

  function bindControls(){
    if(!mounted) return;
    const root = mounted.parent;
    root.querySelectorAll('.draw-card').forEach(function(button, index){
      button.addEventListener('click', function(){
        if(mounted.game.phase !== 'draw') return;
        if(mounted.selectedDiscard.has(index)) mounted.selectedDiscard.delete(index);
        else mounted.selectedDiscard.add(index);
        render();
      });
    });
    const main = root.querySelector('#drawMain');
    if(main) main.addEventListener('click', function(){
      const game = mounted.game;
      mounted.message = '';
      if(game.phase === 'idle'){
        clearActionTimers();
        if(!game.deal()) mounted.message = 'Not enough Arcade Chips to ante.';
        mounted.selectedDiscard.clear();
        render();
      }else if(game.phase === 'draw'){
        game.playerDraw(Array.from(mounted.selectedDiscard));
        mounted.selectedDiscard.clear();
        mounted.uiBet = Math.min(50, game.seats[0].chips);
        startPlayerTimer();
      }else if(game.phase === 'bet'){
        startBotSequence(mounted.uiBet);
      }else if(game.phase === 'showdown'){
        clearActionTimers();
        game.resetHand();
        mounted.selectedDiscard.clear();
        render();
      }
    });
    const keep = root.querySelector('#drawKeep');
    if(keep) keep.addEventListener('click', function(){
      mounted.message = '';
      mounted.selectedDiscard.clear();
      mounted.game.playerDraw([]);
      startPlayerTimer();
    });
    const check = root.querySelector('#drawCheck');
    if(check) check.addEventListener('click', function(){
      mounted.message = '';
      startBotSequence(0);
    });
    const up = root.querySelector('#drawBetUp');
    if(up) up.addEventListener('click', function(){ mounted.uiBet = Math.min(mounted.game.seats[0].chips, mounted.uiBet + BET_STEP); render(); });
    const down = root.querySelector('#drawBetDown');
    if(down) down.addEventListener('click', function(){ mounted.uiBet = Math.max(0, mounted.uiBet - BET_STEP); render(); });
  }
  function mount(options){
    options = options || {};
    destroy();
    const parent = typeof options.parent === 'string' ? document.getElementById(options.parent) : options.parent;
    if(!parent) return null;
    mounted = {
      parent: parent,
      game: new DrawPoker(6, loadBank()),
      selectedDiscard: new Set(),
      uiBet: 50,
      playerSeconds: null,
      playerTimer: null,
      actionTimers: [],
      botQueue: [],
      playerBetAmount: 0,
      message: '',
      onHandComplete: options.onHandComplete,
    };
    render();
    return { destroy: destroy };
  }

  function destroy(){
    clearActionTimers();
    mounted = null;
  }

  window.RetroArcadeDrawPoker = { mount: mount, destroy: destroy, evaluateHand: evaluateHand, DrawPoker: DrawPoker };
})();