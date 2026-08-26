(function(){
  'use strict';

  const STORAGE_KEY = 'retroArcadeSnakeHi';
  const WORLD = { cols: 40, rows: 30, cell: 40, width: 1600, height: 1200 };
  const VIEW = { width: 960, height: 640 };
  const DIRECTIONS = {
    up: { x: 0, y: -1, angle: -90 },
    down: { x: 0, y: 1, angle: 90 },
    left: { x: -1, y: 0, angle: 180 },
    right: { x: 1, y: 0, angle: 0 },
  };
  const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };

  let activeGame = null;
  let activeScene = null;
  let controller = null;

  function centerOf(cell){
    return {
      x: cell.x * WORLD.cell + WORLD.cell / 2,
      y: cell.y * WORLD.cell + WORLD.cell / 2,
    };
  }

  function cellKey(cell){
    return cell.x + ',' + cell.y;
  }

  function readHighScore(){
    return parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10) || 0;
  }

  function writeHighScore(score){
    const hi = Math.max(readHighScore(), score);
    localStorage.setItem(STORAGE_KEY, String(hi));
    return hi;
  }

  function makeObstacleCells(){
    const cells = [];
    function add(type, x, y, w, h){
      for(let yy = y; yy < y + h; yy++){
        for(let xx = x; xx < x + w; xx++) cells.push({ type, x: xx, y: yy });
      }
    }
    add('log', 16, 8, 5, 1);
    add('log', 26, 19, 4, 1);
    add('bush', 30, 8, 2, 2);
    add('bush', 11, 23, 2, 2);
    add('rock', 21, 14, 2, 2);
    add('rock', 6, 6, 2, 2);
    add('bush', 34, 24, 2, 2);
    add('log', 5, 18, 4, 1);
    return cells;
  }

  function makeObstacleMap(obstacles){
    const map = new Set();
    obstacles.forEach(function(cell){ map.add(cellKey(cell)); });
    return map;
  }

  function isBlocked(cell, scene){
    return cell.x < 1 || cell.x >= WORLD.cols - 1 || cell.y < 1 || cell.y >= WORLD.rows - 1 || scene.obstacleMap.has(cellKey(cell));
  }

  function randomOpenCell(scene){
    let cell;
    let guard = 0;
    do{
      cell = {
        x: Phaser.Math.Between(2, WORLD.cols - 3),
        y: Phaser.Math.Between(2, WORLD.rows - 3),
      };
      guard++;
    }while((isBlocked(cell, scene) || scene.snakeCells.some(function(part){ return part.x === cell.x && part.y === cell.y; })) && guard < 500);
    return cell;
  }

  function drawTexture(scene, key, width, height, draw){
    if(scene.textures.exists(key)) return;
    const g = scene.make.graphics({ x: 0, y: 0, add: false });
    draw(g, width, height);
    g.generateTexture(key, width, height);
    g.destroy();
  }

  function makeTextures(scene){
    drawTexture(scene, 'snake-grass-tile', 80, 80, function(g){
      g.fillStyle(0x23461f, 1).fillRect(0, 0, 80, 80);
      for(let i = 0; i < 56; i++){
        const x = Phaser.Math.Between(0, 80);
        const y = Phaser.Math.Between(0, 80);
        const c = Phaser.Utils.Array.GetRandom([0x2f6b2b, 0x356f32, 0x1a3519, 0x5a7430]);
        g.lineStyle(1, c, Phaser.Math.FloatBetween(.32, .72));
        g.beginPath();
        g.moveTo(x, y + Phaser.Math.Between(2, 8));
        g.lineTo(x + Phaser.Math.Between(-4, 4), y - Phaser.Math.Between(4, 12));
        g.strokePath();
      }
      g.fillStyle(0x2b5124, .22).fillRect(0, 0, 80, 3).fillRect(0, 0, 3, 80);
    });

    drawTexture(scene, 'snake-body', 88, 58, function(g){
      g.fillStyle(0x061207, .35).fillEllipse(47, 33, 75, 36);
      g.fillStyle(0x4f8a2f, 1).fillEllipse(44, 28, 76, 42);
      g.fillStyle(0x7caf43, .92).fillEllipse(40, 24, 54, 25);
      g.fillStyle(0x2e5a24, .78);
      for(let i = 0; i < 11; i++) g.fillEllipse(18 + i * 5, 18 + (i % 2) * 15, 7, 4);
      g.lineStyle(2, 0xb1d16a, .55).strokeEllipse(44, 28, 70, 36);
    });

    drawTexture(scene, 'snake-head', 108, 82, function(g){
      g.fillStyle(0x061207, .38).fillEllipse(57, 47, 88, 42);
      g.fillStyle(0x558c33, 1).fillEllipse(52, 40, 88, 54);
      g.fillStyle(0x7eb047, .92).fillEllipse(56, 33, 58, 30);
      g.fillStyle(0xf4f8d0, 1).fillEllipse(73, 27, 13, 13).fillEllipse(73, 53, 13, 13);
      g.fillStyle(0x11190b, 1).fillEllipse(76, 27, 5, 8).fillEllipse(76, 53, 5, 8);
      g.fillStyle(0x2f5c25, .8);
      for(let i = 0; i < 14; i++) g.fillEllipse(18 + i * 4, 25 + (i % 3) * 10, 6, 4);
      g.lineStyle(2, 0xb6dc68, .7).strokeEllipse(52, 40, 82, 48);
    });

    drawTexture(scene, 'snake-apple', 58, 58, function(g){
      g.fillStyle(0x0b1208, .35).fillEllipse(31, 35, 40, 18);
      g.fillStyle(0xbd2734, 1).fillEllipse(29, 32, 36, 36);
      g.fillStyle(0xf05d5e, .9).fillEllipse(21, 24, 14, 12);
      g.fillStyle(0x6b3a17, 1).fillRect(28, 9, 5, 14);
      g.fillStyle(0x5a9a35, 1).fillEllipse(40, 15, 18, 9);
    });

    drawTexture(scene, 'snake-rock', 80, 66, function(g){
      g.fillStyle(0x060706, .35).fillEllipse(44, 48, 60, 16);
      g.fillStyle(0x63665d, 1).fillRoundedRect(13, 13, 52, 38, 16);
      g.fillStyle(0x909284, .55).fillRoundedRect(20, 17, 24, 11, 7);
      g.lineStyle(2, 0x30352e, .55).strokeRoundedRect(13, 13, 52, 38, 16);
    });

    drawTexture(scene, 'snake-log', 150, 54, function(g){
      g.fillStyle(0x090604, .35).fillEllipse(77, 39, 130, 15);
      g.fillStyle(0x77451f, 1).fillRoundedRect(9, 12, 132, 26, 13);
      g.fillStyle(0x9b6130, .85).fillRoundedRect(16, 16, 80, 7, 5);
      g.lineStyle(2, 0x3a1d10, .55).strokeRoundedRect(9, 12, 132, 26, 13);
      g.strokeCircle(20, 25, 10).strokeCircle(130, 25, 10);
    });

    drawTexture(scene, 'snake-bush', 96, 78, function(g){
      g.fillStyle(0x050a05, .3).fillEllipse(50, 57, 70, 18);
      [0x1d5f2b, 0x267837, 0x3b8a3b, 0x165020].forEach(function(color, i){
        g.fillStyle(color, .92);
        g.fillCircle(25 + i * 14, 37 - (i % 2) * 9, 23);
      });
      g.fillStyle(0xb7d16e, .55).fillCircle(45, 22, 4).fillCircle(62, 38, 3).fillCircle(28, 45, 3);
    });

    drawTexture(scene, 'snake-flower', 34, 46, function(g){
      g.lineStyle(3, 0x2e7d32, 1).beginPath().moveTo(17, 45).lineTo(17, 20).strokePath();
      [0xffd66b, 0xff7cab, 0x84d8ff].forEach(function(color, i){
        g.fillStyle(color, .95).fillEllipse(17 + Math.cos(i * 2.1) * 8, 15 + Math.sin(i * 2.1) * 8, 12, 9);
      });
      g.fillStyle(0xfff0a5, 1).fillCircle(17, 16, 5);
    });

    drawTexture(scene, 'snake-grass-front', 90, 95, function(g){
      for(let i = 0; i < 18; i++){
        const base = 10 + i * 4;
        g.lineStyle(3, Phaser.Utils.Array.GetRandom([0x2f7d33, 0x4f9a42, 0x214d24]), .9);
        g.beginPath();
        g.moveTo(base, 92);
        g.lineTo(base + Phaser.Math.Between(-8, 8), Phaser.Math.Between(34, 70));
        g.strokePath();
      }
    });

    drawTexture(scene, 'snake-leaf', 20, 14, function(g){
      g.fillStyle(0x89aa3f, 1).fillEllipse(10, 7, 18, 9);
      g.lineStyle(1, 0x435c20, .8).beginPath().moveTo(2, 7).lineTo(18, 7).strokePath();
    });
  }

  function makeAudio(scene){
    scene.soundBank = {
      play: function(type){
        try{
          const AudioContext = window.AudioContext || window.webkitAudioContext;
          if(!AudioContext) return;
          if(!scene.audioCtx) scene.audioCtx = new AudioContext();
          const ctx = scene.audioCtx;
          if(ctx.state === 'suspended') ctx.resume();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = type === 'death' ? 'sawtooth' : 'triangle';
          osc.frequency.value = type === 'eat' ? 540 : type === 'turn' ? 190 : 90;
          gain.gain.setValueAtTime(type === 'death' ? .08 : .035, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + (type === 'death' ? .38 : .12));
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start();
          osc.stop(ctx.currentTime + (type === 'death' ? .4 : .14));
        }catch(err){
          // Browser audio can be unavailable until user interaction. Gameplay keeps running.
        }
      }
    };
  }

  function buildWorld(scene){
    scene.add.tileSprite(0, 0, WORLD.width, WORLD.height, 'snake-grass-tile').setOrigin(0).setDepth(0);
    const dirt = scene.add.graphics().setDepth(1);
    dirt.fillStyle(0x5f4727, .28);
    dirt.fillRoundedRect(0, 550, WORLD.width, 175, 55);
    dirt.fillRoundedRect(640, 0, 180, WORLD.height, 55);
    dirt.lineStyle(3, 0x2a1d10, .18).strokeRoundedRect(0, 550, WORLD.width, 175, 55).strokeRoundedRect(640, 0, 180, WORLD.height, 55);

    scene.obstacles = makeObstacleCells();
    scene.obstacleMap = makeObstacleMap(scene.obstacles);
    const grouped = new Map();
    scene.obstacles.forEach(function(cell){
      const key = cell.type + ':' + cell.x + ':' + cell.y;
      grouped.set(key, cell);
    });
    grouped.forEach(function(cell){
      const p = centerOf(cell);
      const texture = cell.type === 'log' ? 'snake-log' : cell.type === 'rock' ? 'snake-rock' : 'snake-bush';
      const sprite = scene.add.sprite(p.x, p.y + 4, texture).setDepth(42);
      if(cell.type === 'log') sprite.setScale(1.05, .88);
      if(cell.type === 'bush') sprite.setScale(.82);
      if(cell.type === 'rock') sprite.setScale(.72);
    });

    for(let i = 0; i < 90; i++){
      const x = Phaser.Math.Between(60, WORLD.width - 60);
      const y = Phaser.Math.Between(60, WORLD.height - 60);
      const flower = scene.add.sprite(x, y, 'snake-flower').setDepth(8).setScale(Phaser.Math.FloatBetween(.55, 1.1));
      flower.setAlpha(Phaser.Math.FloatBetween(.65, .95));
    }

    scene.frontGrass = scene.add.group();
    for(let i = 0; i < 95; i++){
      const grass = scene.add.sprite(Phaser.Math.Between(30, WORLD.width - 30), Phaser.Math.Between(90, WORLD.height - 20), 'snake-grass-front')
        .setDepth(70)
        .setScale(Phaser.Math.FloatBetween(.45, .9))
        .setAlpha(Phaser.Math.FloatBetween(.48, .82));
      scene.frontGrass.add(grass);
    }
  }

  function resetSnake(scene){
    if(scene.snakeSprites){
      scene.snakeSprites.forEach(function(sprite){ sprite.destroy(); });
    }
    if(scene.foodSprite) scene.foodSprite.destroy();
    if(scene.tongue) scene.tongue.clear();
    scene.snakeCells = [
      { x: 9, y: 15 }, { x: 8, y: 15 }, { x: 7, y: 15 }, { x: 6, y: 15 }, { x: 5, y: 15 },
    ];
    scene.direction = 'right';
    scene.queuedDirection = 'right';
    scene.score = 0;
    scene.highScore = readHighScore();
    scene.alive = true;
    scene.lastStep = 0;
    scene.stepMs = scene.registry.get('difficulty') === 'hard' ? 118 : scene.registry.get('difficulty') === 'easy' ? 178 : 145;
    scene.foodCell = randomOpenCell(scene);
    scene.snakeSprites = [];
    scene.spine.clear();
    scene.gameOverPanel.setVisible(false);
    createSnakeSprites(scene, false);
    moveFood(scene, false);
    updateHud(scene, 'Garden run. Eat fruit, dodge rocks, logs, brush, and yourself.');
  }

  function createSnakeSprites(scene, tween){
    while(scene.snakeSprites.length < scene.snakeCells.length){
      const index = scene.snakeSprites.length;
      const texture = index === 0 ? 'snake-head' : 'snake-body';
      const sprite = scene.add.sprite(0, 0, texture).setDepth(index === 0 ? 55 : 50 - Math.min(index, 20) * .05);
      sprite.setData('born', scene.time.now);
      scene.snakeSprites.push(sprite);
    }
    while(scene.snakeSprites.length > scene.snakeCells.length){
      scene.snakeSprites.pop().destroy();
    }
    updateSnakeSprites(scene, tween);
  }

  function angleBetween(a, b){
    return Phaser.Math.RadToDeg(Math.atan2(b.y - a.y, b.x - a.x));
  }

  function updateSnakeSprites(scene, tween){
    scene.spine.clear();
    scene.spine.lineStyle(25, 0x244e1f, .34);
    scene.spine.beginPath();
    scene.snakeCells.forEach(function(cell, index){
      const pos = centerOf(cell);
      if(index === 0) scene.spine.moveTo(pos.x, pos.y);
      else scene.spine.lineTo(pos.x, pos.y);
    });
    scene.spine.strokePath();

    scene.snakeCells.forEach(function(cell, index){
      const sprite = scene.snakeSprites[index];
      const pos = centerOf(cell);
      const next = scene.snakeCells[Math.max(0, index - 1)] || cell;
      const prev = scene.snakeCells[Math.min(scene.snakeCells.length - 1, index + 1)] || cell;
      const angle = index === 0 ? DIRECTIONS[scene.direction].angle : angleBetween(prev, next);
      const taper = index === 0 ? 1 : Phaser.Math.Clamp(1 - index / (scene.snakeCells.length * 1.35), .38, .9);
      const scaleX = index === 0 ? .72 : taper;
      const scaleY = index === 0 ? .72 : Phaser.Math.Clamp(taper * .88, .3, .78);
      sprite.setDepth(index === 0 ? 58 : 56 - index * .02);
      if(tween){
        scene.tweens.killTweensOf(sprite);
        scene.tweens.add({
          targets: sprite,
          x: pos.x,
          y: pos.y,
          angle: angle,
          scaleX: scaleX,
          scaleY: scaleY,
          duration: scene.stepMs * .84,
          ease: 'Sine.easeInOut',
        });
      }else{
        sprite.setPosition(pos.x, pos.y).setAngle(angle).setScale(scaleX, scaleY);
      }
    });
    drawTongue(scene);
  }

  function drawTongue(scene){
    scene.tongue.clear();
    if(!scene.alive || !scene.snakeSprites[0]) return;
    const blink = Math.sin(scene.time.now / 120) > .25;
    if(!blink) return;
    const head = scene.snakeSprites[0];
    const rad = Phaser.Math.DegToRad(head.angle);
    const x1 = head.x + Math.cos(rad) * 35;
    const y1 = head.y + Math.sin(rad) * 35;
    const x2 = head.x + Math.cos(rad) * 55;
    const y2 = head.y + Math.sin(rad) * 55;
    scene.tongue.lineStyle(3, 0xd83b58, .95);
    scene.tongue.beginPath();
    scene.tongue.moveTo(x1, y1);
    scene.tongue.lineTo(x2, y2);
    scene.tongue.strokePath();
    scene.tongue.lineStyle(2, 0xff7182, .9);
    scene.tongue.beginPath();
    scene.tongue.moveTo(x2, y2);
    scene.tongue.lineTo(x2 + Math.cos(rad + .55) * 9, y2 + Math.sin(rad + .55) * 9);
    scene.tongue.moveTo(x2, y2);
    scene.tongue.lineTo(x2 + Math.cos(rad - .55) * 9, y2 + Math.sin(rad - .55) * 9);
    scene.tongue.strokePath();
  }

  function moveFood(scene, tween){
    const pos = centerOf(scene.foodCell);
    if(!scene.foodSprite){
      scene.foodSprite = scene.add.sprite(pos.x, pos.y, 'snake-apple').setDepth(34).setScale(.82);
      scene.tweens.add({ targets: scene.foodSprite, scale: .94, duration: 620, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      return;
    }
    if(tween){
      scene.foodSprite.setPosition(pos.x, pos.y).setScale(.6);
      scene.tweens.add({ targets: scene.foodSprite, scale: .86, duration: 160, ease: 'Back.easeOut' });
    }else{
      scene.foodSprite.setPosition(pos.x, pos.y);
    }
  }

  function spawnLeaves(scene, x, y, count){
    for(let i = 0; i < count; i++){
      const leaf = scene.add.sprite(x, y, 'snake-leaf').setDepth(80).setAlpha(.9).setScale(Phaser.Math.FloatBetween(.6, 1.2));
      scene.tweens.add({
        targets: leaf,
        x: x + Phaser.Math.Between(-95, 95),
        y: y + Phaser.Math.Between(-85, 85),
        angle: Phaser.Math.Between(-180, 180),
        alpha: 0,
        duration: Phaser.Math.Between(450, 850),
        ease: 'Sine.easeOut',
        onComplete: function(){ leaf.destroy(); },
      });
    }
  }

  function updateHud(scene, message){
    scene.scoreText.setText('SCORE ' + scene.score + '   BEST ' + scene.highScore);
    scene.statusText.setText(message || '');
  }

  function queueDirection(scene, dir){
    if(!scene || !DIRECTIONS[dir] || !scene.alive) return;
    if(OPPOSITE[dir] === scene.direction) return;
    if(scene.queuedDirection !== dir) scene.soundBank.play('turn');
    scene.queuedDirection = dir;
  }

  function stepSnake(scene){
    if(!scene.alive) return;
    scene.direction = scene.queuedDirection;
    const dir = DIRECTIONS[scene.direction];
    const head = scene.snakeCells[0];
    const next = { x: head.x + dir.x, y: head.y + dir.y };
    const bodyHit = scene.snakeCells.slice(0, -1).some(function(part){ return part.x === next.x && part.y === next.y; });
    if(isBlocked(next, scene) || bodyHit){
      killSnake(scene, isBlocked(next, scene) ? 'You hit the garden edge.' : 'You bit your own body.');
      return;
    }

    scene.snakeCells.unshift(next);
    const ate = next.x === scene.foodCell.x && next.y === scene.foodCell.y;
    if(ate){
      scene.score += 10;
      scene.highScore = writeHighScore(scene.score);
      scene.foodCell = randomOpenCell(scene);
      const p = centerOf(next);
      spawnLeaves(scene, p.x, p.y, 18);
      scene.cameras.main.flash(80, 118, 255, 162, false);
      scene.soundBank.play('eat');
      if(typeof scene.registry.get('onScore') === 'function') scene.registry.get('onScore')(scene.score);
      updateHud(scene, 'Crunch. New fruit is deeper in the grass.');
      moveFood(scene, true);
    }else{
      scene.snakeCells.pop();
      updateHud(scene, 'Arrow keys or WASD. Glide through the garden.');
    }
    createSnakeSprites(scene, true);
  }

  function killSnake(scene, reason){
    scene.alive = false;
    scene.highScore = writeHighScore(scene.score);
    updateHud(scene, reason);
    scene.soundBank.play('death');
    const head = scene.snakeSprites[0];
    if(head) spawnLeaves(scene, head.x, head.y, 36);
    scene.cameras.main.shake(260, .012);
    scene.snakeSprites.forEach(function(sprite, index){
      scene.tweens.killTweensOf(sprite);
      scene.tweens.add({
        targets: sprite,
        angle: sprite.angle + Phaser.Math.Between(-28, 28),
        alpha: index === 0 ? 1 : .55,
        scaleX: sprite.scaleX * .92,
        scaleY: sprite.scaleY * .8,
        duration: 420,
        ease: 'Sine.easeOut',
      });
    });
    scene.gameOverPanel.setVisible(true);
    if(typeof scene.registry.get('onGameOver') === 'function') scene.registry.get('onGameOver')(scene.score);
  }

  function createScene(options){
    return {
      key: 'GardenSnakeScene',
      preload: function(){},
      create: function(){
        activeScene = this;
        this.registry.set('difficulty', options.difficulty || 'medium');
        this.registry.set('onScore', options.onScore);
        this.registry.set('onGameOver', options.onGameOver);
        makeTextures(this);
        makeAudio(this);
        this.spine = this.add.graphics().setDepth(48);
        this.tongue = this.add.graphics().setDepth(72);
        buildWorld(this);
        this.scoreText = this.add.text(22, 18, '', {
          fontFamily: 'Arial, sans-serif', fontSize: '20px', color: '#e6ffd8',
          stroke: '#061207', strokeThickness: 5,
        }).setScrollFactor(0).setDepth(100);
        this.statusText = this.add.text(22, 48, '', {
          fontFamily: 'Arial, sans-serif', fontSize: '15px', color: '#d9f4c5',
          stroke: '#061207', strokeThickness: 4,
        }).setScrollFactor(0).setDepth(100);
        this.gameOverPanel = this.add.container(VIEW.width / 2, VIEW.height / 2).setScrollFactor(0).setDepth(120).setVisible(false);
        const panelBg = this.add.graphics();
        panelBg.fillStyle(0x07140c, .9).fillRoundedRect(-210, -84, 420, 168, 18);
        panelBg.lineStyle(2, 0xb9db6f, .8).strokeRoundedRect(-210, -84, 420, 168, 18);
        const title = this.add.text(0, -36, 'SNAKE DOWN', { fontFamily: 'Arial Black, Arial, sans-serif', fontSize: '30px', color: '#ffd46f' }).setOrigin(.5);
        const help = this.add.text(0, 18, 'Press Restart or New Game', { fontFamily: 'Arial, sans-serif', fontSize: '18px', color: '#dfffd2' }).setOrigin(.5);
        this.gameOverPanel.add([panelBg, title, help]);

        resetSnake(this);
        this.cursors = this.input.keyboard.createCursorKeys();
        this.wasd = this.input.keyboard.addKeys('W,A,S,D');
        this.input.keyboard.on('keydown-UP', function(){ queueDirection(this, 'up'); }, this);
        this.input.keyboard.on('keydown-DOWN', function(){ queueDirection(this, 'down'); }, this);
        this.input.keyboard.on('keydown-LEFT', function(){ queueDirection(this, 'left'); }, this);
        this.input.keyboard.on('keydown-RIGHT', function(){ queueDirection(this, 'right'); }, this);
        this.input.keyboard.on('keydown-W', function(){ queueDirection(this, 'up'); }, this);
        this.input.keyboard.on('keydown-S', function(){ queueDirection(this, 'down'); }, this);
        this.input.keyboard.on('keydown-A', function(){ queueDirection(this, 'left'); }, this);
        this.input.keyboard.on('keydown-D', function(){ queueDirection(this, 'right'); }, this);
        this.input.keyboard.on('keydown-R', function(){ resetSnake(this); }, this);
        this.cameras.main.setBounds(0, 0, WORLD.width, WORLD.height);
        this.physics.world.setBounds(0, 0, WORLD.width, WORLD.height);
        this.cameras.main.startFollow(this.snakeSprites[0], true, .09, .09);
        this.cameras.main.setZoom(1);
      },
      update: function(time){
        if(!this.alive){
          drawTongue(this);
          return;
        }
        if(time - this.lastStep >= this.stepMs){
          stepSnake(this);
          this.lastStep = time;
        }
        drawTongue(this);
      }
    };
  }

  function start(options){
    options = options || {};
    const parentEl = typeof options.parent === 'string' ? document.getElementById(options.parent) : options.parent;
    if(!parentEl) return null;
    if(activeGame) destroy();
    if(!window.Phaser){
      parentEl.innerHTML = '<div class="engine-missing">Phaser did not load. Check the network and refresh.</div>';
      return null;
    }
    activeGame = new Phaser.Game({
      type: Phaser.AUTO,
      parent: parentEl,
      width: VIEW.width,
      height: VIEW.height,
      backgroundColor: '#0b1a10',
      physics: { default: 'arcade', arcade: { debug: false } },
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      scene: createScene(options),
    });
    controller = {
      input: function(dir){ if(activeScene) queueDirection(activeScene, dir); },
      restart: function(){ if(activeScene) resetSnake(activeScene); },
      destroy: destroy,
    };
    return controller;
  }

  function destroy(){
    if(activeGame){
      activeGame.destroy(true);
      activeGame = null;
    }
    activeScene = null;
    controller = null;
  }

  window.RetroArcadeSnake = {
    start: start,
    destroy: destroy,
    input: function(dir){ if(controller) controller.input(dir); },
    restart: function(){ if(controller) controller.restart(); },
  };
})();
