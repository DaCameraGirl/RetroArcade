# 🕹️ RetroArcade

<div align="center">

![JavaScript](https://img.shields.io/badge/JavaScript-64.6%25-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![CSS](https://img.shields.io/badge/CSS-30.5%25-1572B6?style=for-the-badge&logo=css&logoColor=white)
![HTML](https://img.shields.io/badge/HTML-4.9%25-E34F26?style=for-the-badge&logo=html5&logoColor=white)

**Retro casino arcade floor with honest playable rooms and cabinet/table rebuilds in progress**

</div>

---

## Playable Casino Floor

| Area | Games |
|---|---|
| **Card Tables** | Klondike, Tri-Peaks, FreeCell, Pyramid |
| **Table Games** | Blackjack, Sic Bo |
| **Poker Tables** | Jacks or Better, 5-Card Draw |
| **Slot Machines** | RetroArcade Reels |
| **Classic Arcade** | Frog Crossing, Snake |

Klondike, Tri-Peaks, FreeCell, and Pyramid use card-table rules. Frog Crossing is a canvas arcade cabinet with coin/start controls, traffic, logs, lives, homes, score, and local hi-score. Blackjack is now a dedicated full-width table module with a felt table, dealer shoe, visible chips, bet controls, hit/stand/split/double actions, dealer play, Arcade Chips payouts, and longer win/lose/push result ceremonies. Jacks or Better is now a dedicated video poker table with hold/draw controls, a paytable, and persisted Arcade Chips. 5-Card Draw is now a dedicated poker table module with six seats, antes, draw/discard, a visible timed betting round, bot calls/raises/folds, player call-or-fold responses, staged showdown, and persisted Arcade Chips. Sic Bo is now a dedicated dice-table module with a felt betting board, animated dice, chip balance, bet controls, single/total/triple betting zones, and Arcade Chips payouts. RetroArcade Reels is now a dedicated slot-machine module with a physical cabinet, animated reel strips, Arcade Chips balance, bet controls, hold buttons, paytable, win lights, and coin feedback. Snake is a dedicated Phaser 3/WebGL game module with a garden scene, sprite-based snake animation, collision scenery, particles, camera follow, score, and local hi-score. Placeholder mini-game loops are no longer listed as playable games.

---

## 🚀 Play Now

**Live demo:** https://dacameragirl.github.io/RetroArcade/

Or clone and open locally:
```bash
git clone https://github.com/DaCameraGirl/RetroArcade.git
cd RetroArcade
# then open index.html in your browser
```

---

## 🛠️ Built With

- **JavaScript** – Game logic & interactions
- **Phaser 3** – 2D/2.5D arcade runtime for Snake and future cabinet games
- **Dedicated game modules** – Blackjack, Poker, Sic Bo, Slots, and Snake now mount inside the shared RetroArcade shell
- **CSS** – Retro arcade styling
- **HTML** – Clean, semantic markup

No build step. GitHub Pages loads Phaser from a pinned CDN script, then each dedicated game module owns its own scene.

---

<div align="center">
<sub>🕹️ Built by <a href="https://github.com/DaCameraGirl">DaCameraGirl</a></sub>
</div>
