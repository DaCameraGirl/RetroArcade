(function(){
  'use strict';

  const STORAGE_KEY = 'retroArcadeBlackjackStateV1';
  const BETS = [10, 25, 50, 100, 250, 500];
  const SUITS = [
    { mark: '♠', name: 'spades', color: 'black' },
    { mark: '♥', name: 'hearts', color: 'red' },
    { mark: '♦', name: 'diamonds', color: 'red' },
    { mark: '♣', name: 'clubs', color: 'black' },
  ];
  const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];

  let mounted = null;
  let timers = [];
  let cardUid = 0;

  function freshDeck(){
    const deck = [];
    for(let shoe = 0; shoe < 4; shoe++){
      SUITS.forEach(function(suit){
        RANKS.forEach(function(rank, idx){
          deck.push({ uid: ++cardUid, rank: rank, suit: suit.mark, suitName: suit.name, color: suit.color, val: idx + 1 });
        });
      });
    }
    for(let i = deck.length - 1; i > 0; i--){
      const j = Math.floor(Math.random() * (i + 1));
      const temp = deck[i];
      deck[i] = deck[j];
      deck[j] = temp;
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
    }catch(err){
      return { balance: 10000, bet: 25 };
    }
  }

  function saveBank(state){
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ balance: state.balance, bet: state.bet }));
  }

  function formatChips(value){
    return Math.round(value).toLocaleString('en-US');
  }

  function handTotal(hand){
    let total = 0;
    let aces = 0;
    hand.forEach(function(card){
      if(card.val === 1){ aces++; total += 11; }
      else total += Math.min(card.val, 10);
    });
    while(total > 21 && aces){ total -= 10; aces--; }
    return total;
  }

  function isBlackjack(hand){
    return hand.length === 2 && handTotal(hand) === 21;
  }

  function draw(state){
    if(state.deck.length < 28) state.deck = freshDeck();
    return state.deck.pop();
  }

  function clearTimers(){
    timers.forEach(function(id){ window.clearTimeout(id); });
    timers = [];
  }

  function markFresh(state, cards){
    state.freshCards = cards.map(function(card){ return card.uid; });
  }

  function cardHtml(card, hidden, index, fresh){
    const freshClass = fresh ? ' deal-new' : '';
    if(hidden){
      return '<div class="bj-card bj-card-back' + freshClass + '" style="--i:' + index + '"><div class="bj-card-back-inner">RA</div></div>';
    }
    return '<div class="bj-card ' + (card.color === 'red' ? 'red' : 'black') + freshClass + '" style="--i:' + index + '">' +
      '<span class="bj-corner top">' + card.rank + '<small>' + card.suit + '</small></span>' +
      '<strong class="bj-suit bj-' + card.suitName + '">' + card.suit + '</strong>' +
      '<span class="bj-corner bottom">' + card.rank + '<small>' + card.suit + '</small></span>' +
    '</div>';
  }

  function chipsHtml(amount){
    const colors = ['blue', 'red', 'green', 'gold'];
    const count = Math.max(2, Math.min(7, Math.ceil(amount / 50)));
    let html = '<div class="bj-chip-stack" aria-label="Bet ' + formatChips(amount) + '">';
    for(let i = 0; i < count; i++) html += '<span class="bj-chip ' + colors[i % colors.length] + '" style="--i:' + i + '"></span>';
    return html + '<strong>' + formatChips(amount) + '</strong></div>';
  }

  function tableHtml(state){
    const dealerVisible = state.phase !== 'player';
    const wager = state.phase === 'player' || state.phase === 'dealer' ? state.roundBet : state.bet;
    const freshCards = state.freshCards || [];
    const dealerCards = state.dealer.map(function(card, i){ return cardHtml(card, state.phase === 'player' && i === 1, i, freshCards.includes(card.uid)); }).join('');
    const playerCards = state.player.map(function(card, i){ return cardHtml(card, false, i, freshCards.includes(card.uid)); }).join('');
    const dealerTotal = dealerVisible ? handTotal(state.dealer) : handTotal([state.dealer[0]]);
    const playerTotal = handTotal(state.player);
    const canAct = state.phase === 'player';
    const canDeal = state.phase === 'idle' || state.phase === 'settled';
    const canDouble = canAct && state.player.length === 2 && state.balance >= state.bet;
    const dealLabel = state.phase === 'settled' ? 'Next hand' : 'Deal';
    const dealClass = canDeal ? '' : ' is-disabled';
    const hitClass = canAct ? '' : ' is-disabled';
    const standClass = canAct ? '' : ' is-disabled';
    const doubleClass = canDouble ? '' : ' is-disabled';
    return '<section class="blackjack-game" aria-label="RetroArcade blackjack table">' +
      '<div class="bj-room-light"></div>' +
      '<div class="bj-bank-panel">' +
        '<div><small>Arcade Chips</small><strong id="bjBalance">' + formatChips(state.balance) + '</strong></div>' +
        '<div><small>Current Bet</small><strong id="bjBet">' + formatChips(wager) + '</strong></div>' +
        '<div><small>Last Paid</small><strong id="bjPaid">' + formatChips(state.lastPaid || 0) + '</strong></div>' +
      '</div>' +
      '<div class="blackjack-table-felt ' + (state.phase === 'settled' ? 'hand-settled' : '') + (state.celebrateWin ? ' bj-win-celebrate' : '') + '">' +
        '<div class="bj-table-rail"></div>' +
        (state.celebrateWin ? '<div class="bj-win-burst" aria-hidden="true"><span style="--spark-rotate:0deg"></span><span style="--spark-rotate:58deg"></span><span style="--spark-rotate:126deg"></span><span style="--spark-rotate:206deg"></span><span style="--spark-rotate:284deg"></span><strong>WIN</strong></div>' : '') +
        '<div class="bj-table-title"><span>RETROARCADE</span><strong>BLACKJACK</strong><em>Dealer stands on 17</em></div>' +
        '<div class="bj-shoe"><span></span><strong>SHOE</strong></div>' +
        '<div class="bj-discard"><span></span><strong>DISCARD</strong></div>' +
        '<div class="bj-hand-zone dealer-zone ' + (state.phase === 'dealer' ? 'active' : '') + '">' +
          '<div class="bj-seat-label"><span>Dealer</span><strong>' + (state.dealer.length ? dealerTotal : '--') + '</strong></div>' +
          '<div class="bj-cards">' + dealerCards + '</div>' +
        '</div>' +
        '<div class="bj-bet-spot">' + chipsHtml(wager) + '</div>' +
        '<div class="bj-message" id="bjMessage">' + state.message + '</div>' +
        '<div class="bj-hand-zone player-zone ' + (state.phase === 'player' ? 'active' : '') + '">' +
          '<div class="bj-seat-label"><span>You</span><strong>' + (state.player.length ? playerTotal : '--') + '</strong></div>' +
          '<div class="bj-cards">' + playerCards + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="bj-control-deck">' +
        '<div class="bj-bet-controls"><button id="bjBetDown" class="' + (!canDeal ? 'is-disabled' : '') + '" type="button">-</button>' + chipsHtml(state.bet) + '<button id="bjBetUp" class="' + (!canDeal ? 'is-disabled' : '') + '" type="button">+</button></div>' +
        '<button id="bjDeal" class="bj-primary' + dealClass + '" type="button">' + dealLabel + '</button>' +
        '<button id="bjHit" class="' + hitClass + '" type="button">Hit</button>' +
        '<button id="bjStand" class="' + standClass + '" type="button">Stand</button>' +
        '<button id="bjDouble" class="' + doubleClass + '" type="button">Double</button>' +
      '</div>' +
    '</section>';
  }

  function render(){
    if(!mounted) return;
    mounted.parent.innerHTML = tableHtml(mounted.state);
    bindControls();
    mounted.state.freshCards = [];
    mounted.state.celebrateWin = false;
  }

  function setMessage(message){
    mounted.state.message = message;
    const el = mounted.parent.querySelector('#bjMessage');
    if(el) el.textContent = message;
  }

  function newRound(){
    const state = mounted.state;
    if(state.phase === 'player' || state.phase === 'dealer'){
      setMessage('Finish this hand with Hit, Stand, or Double.');
      return;
    }
    if(state.balance < state.bet){
      setMessage('Not enough Arcade Chips for that bet. Lower the bet.');
      return;
    }
    clearTimers();
    state.roundBet = state.bet;
    state.balance -= state.roundBet;
    state.lastPaid = 0;
    state.deck = state.deck && state.deck.length > 28 ? state.deck : freshDeck();
    state.player = [draw(state), draw(state)];
    state.dealer = [draw(state), draw(state)];
    state.phase = 'player';
    state.message = 'Your move.';
    state.celebrateWin = false;
    markFresh(state, state.player.concat(state.dealer));
    saveBank(state);
    render();
    if(isBlackjack(state.player) || isBlackjack(state.dealer)) settle();
  }

  function playerHit(){
    const state = mounted.state;
    if(state.phase !== 'player'){
      setMessage(state.phase === 'settled' ? 'Hand is over. Deal the next hand.' : 'Deal a hand first.');
      return;
    }
    const card = draw(state);
    state.player.push(card);
    markFresh(state, [card]);
    if(handTotal(state.player) > 21){
      state.message = 'Bust. Dealer takes the bet.';
      settle();
      return;
    }
    state.message = 'Card dealt.';
    render();
  }

  function playerDouble(){
    const state = mounted.state;
    if(state.phase !== 'player'){
      setMessage(state.phase === 'settled' ? 'Hand is over. Deal the next hand.' : 'Deal a hand first.');
      return;
    }
    if(state.player.length !== 2){
      setMessage('Double is only available on your first two cards.');
      return;
    }
    if(state.balance < state.bet){
      setMessage('Not enough Arcade Chips to double.');
      return;
    }
    state.balance -= state.bet;
    state.roundBet += state.bet;
    const card = draw(state);
    state.player.push(card);
    markFresh(state, [card]);
    state.message = 'Double down.';
    saveBank(state);
    if(handTotal(state.player) > 21) settle();
    else dealerPlay();
  }

  function dealerPlay(){
    const state = mounted.state;
    if(state.phase !== 'player' && state.phase !== 'dealer'){
      setMessage(state.phase === 'settled' ? 'Hand is over. Deal the next hand.' : 'Deal a hand first.');
      return;
    }
    state.phase = 'dealer';
    state.message = 'Dealer plays.';
    render();
    function step(){
      if(!mounted || mounted.state !== state) return;
      if(handTotal(state.dealer) < 17){
        const card = draw(state);
        state.dealer.push(card);
        markFresh(state, [card]);
        render();
        timers.push(window.setTimeout(step, 520));
      }else{
        settle();
      }
    }
    timers.push(window.setTimeout(step, 520));
  }

  function settle(){
    const state = mounted.state;
    const player = handTotal(state.player);
    const dealer = handTotal(state.dealer);
    let paid = 0;
    let message = '';
    if(player > 21){
      message = 'Bust. Dealer wins.';
    }else if(isBlackjack(state.player) && !isBlackjack(state.dealer)){
      paid = Math.floor(state.roundBet * 2.5);
      message = 'Blackjack pays 3:2.';
    }else if(isBlackjack(state.dealer) && !isBlackjack(state.player)){
      message = 'Dealer blackjack.';
    }else if(dealer > 21){
      paid = state.roundBet * 2;
      message = 'Dealer busts. You win.';
    }else if(player > dealer){
      paid = state.roundBet * 2;
      message = 'You beat the dealer.';
    }else if(player === dealer){
      paid = state.roundBet;
      message = 'Push. Bet returned.';
    }else{
      message = 'Dealer wins.';
    }
    const playerWon = paid > state.roundBet;
    state.balance += paid;
    state.lastPaid = paid;
    state.phase = 'settled';
    state.message = message;
    state.celebrateWin = playerWon;
    state.roundBet = 0;
    state.bet = Math.min(state.bet, state.balance || BETS[0]);
    if(!BETS.includes(state.bet)) state.bet = BETS.reduce(function(best, bet){ return bet <= state.balance ? bet : best; }, BETS[0]);
    saveBank(state);
    render();
    if(typeof mounted.onHandComplete === 'function') mounted.onHandComplete({ paid: paid, message: message });
  }

  function changeBet(dir){
    const state = mounted.state;
    if(state.phase !== 'idle' && state.phase !== 'settled'){
      setMessage('Finish this hand before changing the bet.');
      return;
    }
    const idx = BETS.indexOf(state.bet);
    const next = BETS[Math.max(0, Math.min(BETS.length - 1, idx + dir))];
    state.bet = Math.min(next, Math.max(next, state.balance));
    if(state.bet > state.balance) state.bet = BETS.reduce(function(best, bet){ return bet <= state.balance ? bet : best; }, BETS[0]);
    state.message = 'Bet set to ' + formatChips(state.bet) + ' Arcade Chips.';
    saveBank(state);
    render();
  }

  function bindControls(){
    const root = mounted.parent;
    root.querySelector('#bjDeal').addEventListener('click', newRound);
    root.querySelector('#bjHit').addEventListener('click', playerHit);
    root.querySelector('#bjStand').addEventListener('click', dealerPlay);
    root.querySelector('#bjDouble').addEventListener('click', playerDouble);
    root.querySelector('#bjBetDown').addEventListener('click', function(){ changeBet(-1); });
    root.querySelector('#bjBetUp').addEventListener('click', function(){ changeBet(1); });
  }

  function mount(options){
    options = options || {};
    destroy();
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
        roundBet: 0,
        deck: freshDeck(),
        player: [],
        dealer: [],
        phase: 'idle',
        message: 'Place a bet and deal.',
      }
    };
    render();
    return { destroy: destroy };
  }

  function destroy(){
    clearTimers();
    mounted = null;
  }

  window.RetroArcadeBlackjack = { mount: mount, destroy: destroy };
})();
