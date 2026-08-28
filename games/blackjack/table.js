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
    const cardKey = card && card.uid ? ' data-card-id="' + card.uid + '"' : '';
    if(hidden){
      return '<div class="bj-card bj-card-back' + freshClass + '"' + cardKey + ' style="--i:' + index + '"><div class="bj-card-back-inner">RA</div></div>';
    }
    return '<div class="bj-card ' + (card.color === 'red' ? 'red' : 'black') + freshClass + '"' + cardKey + ' style="--i:' + index + '">' +
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

  function cardPoints(card){
    return card.val === 1 ? 1 : Math.min(card.val, 10);
  }

  function hasSplit(state){
    return Array.isArray(state.playerHands) && state.playerHands.length > 1;
  }

  function playerHands(state){
    if(hasSplit(state)) return state.playerHands;
    return [{ cards: state.player, bet: state.roundBet, done: false, label: 'You' }];
  }

  function currentHand(state){
    const hands = playerHands(state);
    return hands[state.activeHand || 0] || hands[0];
  }

  function totalRoundBet(state){
    if(hasSplit(state)){
      return state.playerHands.reduce(function(total, hand){ return total + hand.bet; }, 0);
    }
    return state.roundBet;
  }

  function handCardsHtml(hand, freshCards){
    return hand.cards.map(function(card, i){
      return '<span class="bj-card-slot" style="--i:' + i + '">' + cardHtml(card, false, i, freshCards.includes(card.uid)) + '</span>';
    }).join('');
  }

  function handResultText(hand){
    if(!hand.outcome) return '';
    return '<span class="bj-split-result ' + hand.outcome + '">' + hand.message + '</span>';
  }

  function tableHtml(state){
    const dealerVisible = state.phase !== 'player';
    const split = hasSplit(state);
    const wager = state.phase === 'player' || state.phase === 'dealer' ? totalRoundBet(state) : state.bet;
    const freshCards = state.freshCards || [];
    const dealerCards = state.dealer.map(function(card, i){
      return '<span class="bj-card-slot" style="--i:' + i + '">' + cardHtml(card, state.phase === 'player' && i === 1, i, freshCards.includes(card.uid)) + '</span>';
    }).join('');
    const hands = playerHands(state);
    const active = currentHand(state);
    const dealerTotal = dealerVisible ? handTotal(state.dealer) : handTotal([state.dealer[0]]);
    const activeTotal = active && active.cards ? handTotal(active.cards) : handTotal(state.player);
    const playerSummary = split ? hands.map(function(hand, i){ return 'H' + (i + 1) + ' ' + handTotal(hand.cards); }).join(' / ') : String(handTotal(state.player));
    const canAct = state.phase === 'player';
    const canDeal = state.phase === 'idle' || state.phase === 'settled';
    const canSplit = canAct && !split && state.player.length === 2 && cardPoints(state.player[0]) === cardPoints(state.player[1]) && state.balance >= state.roundBet;
    const canDouble = canAct && active && active.cards.length === 2 && state.balance >= active.bet;
    const dealLabel = state.phase === 'settled' ? 'Next hand' : 'Deal';
    const dealClass = canDeal ? '' : ' is-disabled';
    const hitClass = canAct ? '' : ' is-disabled';
    const standClass = canAct ? '' : ' is-disabled';
    const splitClass = canSplit ? '' : ' is-disabled';
    const doubleClass = canDouble ? '' : ' is-disabled';
    const resultClass = state.outcome ? ' ' + state.outcome : '';
    const resultMessage = state.resultMessage || state.message;
    const outcomeLabel = state.outcome === 'win' ? 'YOU WIN' : state.outcome === 'push' ? 'PUSH' : state.outcome === 'loss' ? 'YOU LOSE' : 'HAND OVER';
    const outcomeHint = state.outcome === 'win' ? 'Arcade Chips paid to your bank.' : state.outcome === 'push' ? 'Your bet returns to the tray.' : state.outcome === 'loss' ? 'Dealer takes the wager.' : 'Hand complete.';
    const resultStrip = state.phase === 'settled' ? '<div class="bj-result-strip' + resultClass + '"><strong>' + resultMessage + '</strong><span>Dealer ' + dealerTotal + ' / You ' + playerSummary + '</span></div>' : '';
    const outcomePop = state.phase === 'settled' ? '<div class="bj-outcome-layer' + resultClass + '" aria-live="polite"><div class="bj-outcome-pop' + resultClass + '"><small>' + outcomeLabel + '</small><strong>' + resultMessage + '</strong><span>Dealer ' + dealerTotal + ' / You ' + playerSummary + '</span><em>' + outcomeHint + '</em></div></div>' : '';
    const playerCards = split ? '<div class="bj-split-hands">' + hands.map(function(hand, i){
      const isActive = state.phase === 'player' && i === (state.activeHand || 0);
      return '<div class="bj-split-hand' + (isActive ? ' active' : '') + (hand.done ? ' done' : '') + (hand.outcome ? ' ' + hand.outcome : '') + '">' +
        '<div class="bj-seat-label"><span>Hand ' + (i + 1) + '</span><strong>' + handTotal(hand.cards) + '</strong></div>' +
        '<div class="bj-cards">' + handCardsHtml(hand, freshCards) + '</div>' +
        '<div class="bj-split-bet">' + chipsHtml(hand.bet) + '</div>' +
        handResultText(hand) +
      '</div>';
    }).join('') + '</div>' : '<div class="bj-cards">' + handCardsHtml({ cards: state.player }, freshCards) + '</div>';
    return '<section class="blackjack-game" aria-label="RetroArcade blackjack table">' +
      '<div class="bj-room-light"></div>' +
      outcomePop +
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
        (split ? '' : '<div class="bj-bet-spot">' + chipsHtml(wager) + '</div>') +
        '<div class="bj-message" id="bjMessage">' + state.message + '</div>' +
        '<div class="bj-hand-zone player-zone ' + (split ? 'split-player-zone ' : '') + (state.phase === 'player' ? 'active' : '') + '">' +
          (split ? '' : '<div class="bj-seat-label"><span>You</span><strong>' + (state.player.length ? activeTotal : '--') + '</strong></div>') +
          playerCards +
        '</div>' +
      '</div>' +
      resultStrip +
      '<div class="bj-control-deck">' +
        '<div class="bj-bet-controls"><button id="bjBetDown" class="' + (!canDeal ? 'is-disabled' : '') + '" type="button">-</button>' + chipsHtml(state.bet) + '<button id="bjBetUp" class="' + (!canDeal ? 'is-disabled' : '') + '" type="button">+</button></div>' +
        '<button id="bjDeal" class="bj-primary' + dealClass + '" type="button">' + dealLabel + '</button>' +
        '<button id="bjHit" class="' + hitClass + '" type="button">Hit</button>' +
        '<button id="bjStand" class="' + standClass + '" type="button">Stand</button>' +
        '<button id="bjSplit" class="' + splitClass + '" type="button">Split</button>' +
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
      setMessage('Finish this hand with Hit, Stand, Double, or Split.');
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
    state.playerHands = null;
    state.activeHand = 0;
    state.dealer = [draw(state), draw(state)];
    state.phase = 'player';
    state.message = 'Your move.';
    state.resultMessage = '';
    state.outcome = '';
    state.celebrateWin = false;
    markFresh(state, state.player.concat(state.dealer));
    saveBank(state);
    render();
    if(isBlackjack(state.player) || isBlackjack(state.dealer)) settle();
  }

  function playerSplit(){
    const state = mounted.state;
    if(state.phase !== 'player'){
      setMessage(state.phase === 'settled' ? 'Hand is over. Deal the next hand.' : 'Deal a hand first.');
      return;
    }
    if(hasSplit(state)){
      setMessage('This hand is already split.');
      return;
    }
    if(state.player.length !== 2 || cardPoints(state.player[0]) !== cardPoints(state.player[1])){
      setMessage('Split needs two matching-value cards.');
      return;
    }
    if(state.balance < state.roundBet){
      setMessage('Not enough Arcade Chips to split.');
      return;
    }
    const first = state.player[0];
    const second = state.player[1];
    const cardA = draw(state);
    const cardB = draw(state);
    state.balance -= state.roundBet;
    state.playerHands = [
      { cards: [first, cardA], bet: state.roundBet, done: false, label: 'Hand 1' },
      { cards: [second, cardB], bet: state.roundBet, done: false, label: 'Hand 2' },
    ];
    state.player = state.playerHands[0].cards;
    state.activeHand = 0;
    state.roundBet *= 2;
    state.message = 'Split. Play Hand 1.';
    markFresh(state, [cardA, cardB]);
    saveBank(state);
    render();
  }

  function playerHit(){
    const state = mounted.state;
    if(state.phase !== 'player'){
      setMessage(state.phase === 'settled' ? 'Hand is over. Deal the next hand.' : 'Deal a hand first.');
      return;
    }
    const hand = currentHand(state);
    const card = draw(state);
    hand.cards.push(card);
    if(hasSplit(state)) state.player = hand.cards;
    markFresh(state, [card]);
    if(handTotal(hand.cards) > 21){
      if(hasSplit(state)){
        hand.done = true;
        hand.outcome = 'loss';
        hand.message = 'Bust ' + handTotal(hand.cards);
        advanceSplitOrDealer('Hand ' + ((state.activeHand || 0) + 1) + ' busts.');
        return;
      }
      state.message = 'Bust. Dealer takes the bet.';
      settle();
      return;
    }
    state.message = hasSplit(state) ? 'Hand ' + ((state.activeHand || 0) + 1) + ' hit. Choose Hit, Stand, or Double.' : 'Hit dealt one card. Choose Hit or Stand.';
    render();
  }

  function playerStand(){
    const state = mounted.state;
    if(state.phase !== 'player'){
      setMessage(state.phase === 'settled' ? 'Hand is over. Deal the next hand.' : 'Deal a hand first.');
      return;
    }
    if(hasSplit(state)){
      const hand = currentHand(state);
      hand.done = true;
      advanceSplitOrDealer('Hand ' + ((state.activeHand || 0) + 1) + ' stands.');
      return;
    }
    dealerPlay();
  }

  function playerDouble(){
    const state = mounted.state;
    if(state.phase !== 'player'){
      setMessage(state.phase === 'settled' ? 'Hand is over. Deal the next hand.' : 'Deal a hand first.');
      return;
    }
    const hand = currentHand(state);
    if(hand.cards.length !== 2){
      setMessage('Double is only available on the first two cards of this hand.');
      return;
    }
    if(state.balance < hand.bet){
      setMessage('Not enough Arcade Chips to double.');
      return;
    }
    state.balance -= hand.bet;
    state.roundBet += hand.bet;
    hand.bet += hand.bet;
    const card = draw(state);
    hand.cards.push(card);
    if(hasSplit(state)) state.player = hand.cards;
    markFresh(state, [card]);
    saveBank(state);
    if(hasSplit(state)){
      hand.done = true;
      if(handTotal(hand.cards) > 21){
        hand.outcome = 'loss';
        hand.message = 'Bust ' + handTotal(hand.cards);
      }
      advanceSplitOrDealer('Double down on Hand ' + ((state.activeHand || 0) + 1) + '.');
      return;
    }
    state.message = 'Double down.';
    if(handTotal(hand.cards) > 21) settle();
    else dealerPlay();
  }

  function advanceSplitOrDealer(message){
    const state = mounted.state;
    const nextIndex = state.playerHands.findIndex(function(hand, index){
      return index > (state.activeHand || 0) && !hand.done && handTotal(hand.cards) <= 21;
    });
    if(nextIndex >= 0){
      state.activeHand = nextIndex;
      state.player = state.playerHands[nextIndex].cards;
      state.message = message + ' Play Hand ' + (nextIndex + 1) + '.';
      render();
      return;
    }
    dealerPlay();
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
    if(hasSplit(state) && state.playerHands.every(function(hand){ return handTotal(hand.cards) > 21; })){
      settle();
      return;
    }
    function step(){
      if(!mounted || mounted.state !== state) return;
      if(state.paused){
        timers.push(window.setTimeout(step, 160));
        return;
      }
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

  function settleSingle(hand, dealer, naturalAllowed){
    const player = handTotal(hand.cards);
    const dealerTotal = handTotal(dealer);
    let paid = 0;
    let message = '';
    let outcome = 'loss';
    if(player > 21){
      message = 'Bust ' + player;
    }else if(naturalAllowed && isBlackjack(hand.cards) && !isBlackjack(dealer)){
      paid = Math.floor(hand.bet * 2.5);
      message = 'Blackjack pays 3:2';
      outcome = 'win';
    }else if(isBlackjack(dealer) && !(naturalAllowed && isBlackjack(hand.cards))){
      message = 'Dealer blackjack';
    }else if(dealerTotal > 21){
      paid = hand.bet * 2;
      message = 'Dealer busts';
      outcome = 'win';
    }else if(player > dealerTotal){
      paid = hand.bet * 2;
      message = 'Wins ' + player + ' to ' + dealerTotal;
      outcome = 'win';
    }else if(player === dealerTotal){
      paid = hand.bet;
      message = 'Push at ' + player;
      outcome = 'push';
    }else{
      message = 'Dealer wins ' + dealerTotal + ' to ' + player;
    }
    return { paid: paid, message: message, outcome: outcome };
  }

  function settle(){
    const state = mounted.state;
    const dealer = handTotal(state.dealer);
    let paid = 0;
    let message = '';
    let outcome = 'loss';
    if(hasSplit(state)){
      let wins = 0;
      let pushes = 0;
      let losses = 0;
      state.playerHands.forEach(function(hand){
        const result = settleSingle(hand, state.dealer, false);
        hand.paid = result.paid;
        hand.message = result.message;
        hand.outcome = result.outcome;
        paid += result.paid;
        if(result.outcome === 'win') wins++;
        else if(result.outcome === 'push') pushes++;
        else losses++;
      });
      const net = paid - state.roundBet;
      outcome = net > 0 ? 'win' : net === 0 ? 'push' : 'loss';
      message = 'Split result: ' + wins + ' win' + (wins === 1 ? '' : 's') + ', ' + pushes + ' push' + (pushes === 1 ? '' : 'es') + ', ' + losses + ' loss' + (losses === 1 ? '' : 'es') + '.';
    }else{
      const hand = { cards: state.player, bet: state.roundBet };
      const result = settleSingle(hand, state.dealer, true);
      paid = result.paid;
      outcome = result.outcome;
      const player = handTotal(state.player);
      if(player > 21) message = 'You bust with ' + player + '. Dealer wins.';
      else if(result.message === 'Blackjack pays 3:2') message = 'Blackjack pays 3:2.';
      else if(result.message === 'Dealer blackjack') message = 'Dealer blackjack. Dealer wins.';
      else if(dealer > 21) message = 'Dealer busts with ' + dealer + '. You win.';
      else if(outcome === 'win') message = 'You win ' + player + ' to ' + dealer + '.';
      else if(outcome === 'push') message = 'Push at ' + player + '. Bet returned.';
      else message = 'Dealer wins ' + dealer + ' to ' + player + '.';
    }
    const playerWon = outcome === 'win';
    state.balance += paid;
    state.lastPaid = paid;
    state.phase = 'settled';
    state.message = message;
    state.resultMessage = message;
    state.outcome = outcome;
    state.celebrateWin = playerWon;
    state.roundBet = 0;
    state.activeHand = 0;
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
    root.querySelector('#bjStand').addEventListener('click', playerStand);
    root.querySelector('#bjSplit').addEventListener('click', playerSplit);
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
        playerHands: null,
        activeHand: 0,
        dealer: [],
        phase: 'idle',
        outcome: '',
        resultMessage: '',
        message: 'Place a bet and deal.',
        paused: false,
      }
    };
    render();
    return { destroy: destroy, pause: pause, resume: resume };
  }

  function pause(){
    if(mounted) mounted.state.paused = true;
  }

  function resume(){
    if(mounted) mounted.state.paused = false;
  }

  function destroy(){
    clearTimers();
    mounted = null;
  }

  window.RetroArcadeBlackjack = { mount: mount, destroy: destroy };
})();
