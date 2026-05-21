// Pixel runner mini-game. Bear chasing you. Jump over obstacles. Collect power-ups.
(function () {
  function init(canvas, opts) {
    opts = opts || {};
    var ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    var W = 320, H = 80;
    canvas.width  = W * 2;
    canvas.height = H * 2;
    ctx.scale(2, 2);

    var INK    = opts.ink    || '#1A1A1A';
    var MUTED  = opts.muted  || '#999999';
    var BG     = opts.bg     || '#FFFFFF';
    var ACCENT = opts.accent || '#1E66D0';
    var BEAR_C = '#7B4F2E';
    var DARK_C = '#5C3418';
    var GOLD   = '#F4B942';
    var SHIELD = '#4FC3F7';
    var TURBO  = '#FF6B35';
    var MULTI  = '#9B59B6';
    var RED    = '#E74C3C';

    var gameOver = false, gameOverReason = '', started = false;
    var score = 0;
    var hiScore = parseInt(localStorage.getItem('prawee_runner_hi') || '0', 10);
    var frame = 0;
    var groundY = H - 12;
    var speed = 2.0, maxSpeed = 7.0;

    // Power-up timers (frames remaining)
    var shieldTimer = 0, turboTimer = 0, multiTimer = 0, hitFlash = 0;

    // Bear chaser state
    // bearOffset: position of bear relative to runner.x (negative = behind/left)
    // Starts far left, creeps toward 0; game over when right edge of bear reaches runner
    var bearOffset = -165;
    var bearAnim = 0;
    var BEAR_W = 14, BEAR_H = 17;
    var BEAR_CATCH = -(BEAR_W + 2); // game over when bearOffset >= this

    var runner = {
      x: 28, y: groundY - 16, w: 12, h: 16,
      vy: 0, jumping: false, legFrame: 0
    };
    var GRAVITY = 0.45, JUMP_V = -7.4;

    var obstacles = [], powerups = [], clouds = [], speedLines = [];
    clouds.push({ x: 60, y: 14 }, { x: 200, y: 22 }, { x: 280, y: 10 });

    var spawnCount = 0, nextSpawn = 80;
    var puCount = 0, puNext = 160 + Math.random() * 80;

    // ---- Spawn helpers ----
    function spawnObstacle() {
      var kind = Math.random() < 0.65 ? 0 : 1;
      if (kind === 0) obstacles.push({ x: W + 4, y: groundY - 8,  w: 6, h: 8,  kind: 0 });
      else            obstacles.push({ x: W + 4, y: groundY - 14, w: 4, h: 14, kind: 1 });
    }

    function spawnPowerup() {
      var r = Math.random();
      var type = r < 0.42 ? 'coin' : r < 0.62 ? 'shield' : r < 0.80 ? 'turbo' : 'multi';
      var y = (type === 'coin')
        ? groundY - 8 - Math.floor(Math.random() * 14)
        : groundY - 26 - Math.floor(Math.random() * 10);
      powerups.push({ x: W + 4, y: y, w: 8, h: 8, type: type });
    }

    // ---- Input ----
    function jump() {
      if (gameOver) { reset(); return; }
      if (!started) started = true;
      if (!runner.jumping) { runner.vy = JUMP_V; runner.jumping = true; }
    }

    function reset() {
      gameOver = false; gameOverReason = ''; started = true;
      score = 0; speed = 2.0;
      obstacles.length = 0; powerups.length = 0; speedLines.length = 0;
      runner.y = groundY - 16; runner.vy = 0; runner.jumping = false; runner.legFrame = 0;
      spawnCount = 0; nextSpawn = 80; puCount = 0; puNext = 160 + Math.random() * 80;
      bearOffset = -165; bearAnim = 0;
      shieldTimer = 0; turboTimer = 0; multiTimer = 0; hitFlash = 0;
    }

    canvas.addEventListener('mousedown', function (e) { e.preventDefault(); jump(); });
    canvas.addEventListener('touchstart', function (e) { e.preventDefault(); jump(); }, { passive: false });
    window.addEventListener('keydown', function (e) {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        var r = canvas.getBoundingClientRect();
        if (r.top < window.innerHeight && r.bottom > 0) { e.preventDefault(); jump(); }
      }
    });

    // ---- Drawing ----
    function px(x, y, w, h, c) {
      ctx.fillStyle = c;
      ctx.fillRect(Math.round(x), Math.round(y), w, h);
    }

    function drawRunner() {
      var x = runner.x, y = runner.y, af = runner.legFrame;

      // Shield aura
      if (shieldTimer > 0 && (shieldTimer > 30 || frame % 4 < 2)) {
        ctx.save();
        ctx.globalAlpha = 0.28;
        ctx.fillStyle = SHIELD;
        ctx.beginPath();
        ctx.ellipse(x + 6, y + 8, 11, 12, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      // Turbo ghost trail
      if (turboTimer > 0) {
        for (var t = 1; t <= 3; t++) {
          ctx.save();
          ctx.globalAlpha = 0.09 * (4 - t);
          ctx.fillStyle = TURBO;
          ctx.fillRect(x - t * 5, y + 2, runner.w, runner.h - 4);
          ctx.restore();
        }
      }
      // head
      px(x + 4, y,     4, 3, INK);
      // neck
      px(x + 5, y + 3, 2, 1, INK);
      // torso
      px(x + 3, y + 4, 6, 4, INK);
      // arms
      if (runner.jumping) {
        px(x + 1, y + 4, 2, 1, INK);
        px(x + 9, y + 4, 2, 1, INK);
      } else if (af === 0) {
        px(x + 1, y + 5, 2, 1, INK);
        px(x + 9, y + 4, 2, 1, INK);
      } else {
        px(x + 1, y + 4, 2, 1, INK);
        px(x + 9, y + 5, 2, 1, INK);
      }
      // hips
      px(x + 3, y + 8, 6, 1, INK);
      // legs
      if (runner.jumping) {
        px(x + 3, y + 9,  2, 3, INK); px(x + 7, y + 9,  2, 3, INK);
        px(x + 2, y + 12, 3, 2, INK); px(x + 7, y + 12, 3, 2, INK);
      } else if (af === 0) {
        px(x + 3, y + 9,  2, 4, INK); px(x + 7, y + 9,  2, 3, INK);
        px(x + 2, y + 13, 3, 1, INK); px(x + 6, y + 12, 4, 1, INK);
      } else {
        px(x + 3, y + 9,  2, 3, INK); px(x + 7, y + 9,  2, 4, INK);
        px(x + 2, y + 12, 4, 1, INK); px(x + 7, y + 13, 3, 1, INK);
      }
    }

    function drawBear(bx, by) {
      var a = bearAnim;
      // ears
      px(bx + 1,  by,      3, 2, BEAR_C);
      px(bx + 10, by,      3, 2, BEAR_C);
      // head
      px(bx + 1,  by + 2,  12, 5, BEAR_C);
      // white eyes + pupils (angry — pupils in inner corner)
      px(bx + 3,  by + 3,  2, 2, '#FFFFFF');
      px(bx + 9,  by + 3,  2, 2, '#FFFFFF');
      px(bx + 4,  by + 3,  1, 1, DARK_C);
      px(bx + 9,  by + 3,  1, 1, DARK_C);
      // snout
      px(bx + 4,  by + 5,  6, 2, '#C4956A');
      px(bx + 6,  by + 6,  2, 1, DARK_C);  // nose
      // grr mouth
      px(bx + 4,  by + 7,  1, 1, DARK_C);
      px(bx + 9,  by + 7,  1, 1, DARK_C);
      // body
      px(bx + 2,  by + 7,  10, 5, BEAR_C);
      // arms (alternate frames)
      if (a === 0) { px(bx,      by + 7, 2, 4, BEAR_C); px(bx + 12, by + 8, 2, 3, BEAR_C); }
      else         { px(bx,      by + 8, 2, 3, BEAR_C); px(bx + 12, by + 7, 2, 4, BEAR_C); }
      // legs
      if (a === 0) {
        px(bx + 2, by + 12, 4, 4, BEAR_C); px(bx + 8, by + 12, 4, 3, BEAR_C);
        px(bx + 7, by + 15, 5, 1, BEAR_C);
      } else {
        px(bx + 2, by + 12, 4, 3, BEAR_C); px(bx + 8, by + 12, 4, 4, BEAR_C);
        px(bx + 1, by + 15, 5, 1, BEAR_C);
      }
      // claws
      px(bx + 2,  by + 16, 1, 1, DARK_C); px(bx + 4,  by + 16, 1, 1, DARK_C);
      px(bx + 8,  by + 16, 1, 1, DARK_C); px(bx + 10, by + 16, 1, 1, DARK_C);
    }

    function drawObstacle(o) {
      if (o.kind === 0) {
        px(o.x + 2, o.y,     2, 2, INK);
        px(o.x + 1, o.y + 2, 4, 2, INK);
        px(o.x,     o.y + 4, 6, 4, INK);
      } else {
        px(o.x,     o.y,         o.w,     o.h, INK);
        px(o.x - 1, o.y + o.h-2, o.w + 2, 2,   INK);
      }
    }

    function drawPowerup(p) {
      var x = p.x, y = p.y;
      // subtle bob
      var dy = Math.round(Math.sin(frame * 0.12 + x * 0.05) * 1.5);
      y += dy;
      if (p.type === 'coin') {
        px(x+2, y,   4, 1, GOLD); px(x+1, y+1, 6, 1, GOLD);
        px(x,   y+2, 8, 4, GOLD); px(x+1, y+6, 6, 1, GOLD);
        px(x+2, y+7, 4, 1, GOLD);
        px(x+2, y+2, 1, 2, '#FFFDE7'); // shine
      } else if (p.type === 'shield') {
        px(x+2, y,   4, 1, SHIELD); px(x+1, y+1, 6, 5, SHIELD);
        px(x+2, y+6, 4, 1, SHIELD); px(x+3, y+7, 2, 1, SHIELD);
        // S glyph
        px(x+3, y+2, 2, 1, '#fff'); px(x+2, y+3, 3, 1, '#fff'); px(x+3, y+4, 2, 1, '#fff');
      } else if (p.type === 'turbo') {
        // lightning bolt
        px(x+4, y,   3, 3, TURBO);
        px(x+2, y+3, 5, 2, TURBO);
        px(x+1, y+5, 3, 1, TURBO);
        px(x+2, y+6, 3, 3, TURBO);
      } else if (p.type === 'multi') {
        // star / x2
        px(x+3, y,   2, 8, MULTI); px(x,   y+3, 8, 2, MULTI);
        px(x+1, y+1, 2, 2, MULTI); px(x+5, y+1, 2, 2, MULTI);
        px(x+1, y+5, 2, 2, MULTI); px(x+5, y+5, 2, 2, MULTI);
      }
    }

    function drawCloud(cl) {
      px(cl.x,     cl.y+2, 2, 2, MUTED);
      px(cl.x + 2, cl.y,   6, 4, MUTED);
      px(cl.x + 8, cl.y+2, 2, 2, MUTED);
    }

    function drawGround() {
      ctx.fillStyle = MUTED;
      for (var x = 0; x < W; x += 6)
        ctx.fillRect(x - ((frame * speed) % 6), groundY, 3, 1);
    }

    function drawHUD() {
      ctx.textBaseline = 'top';

      // Score
      ctx.fillStyle = MUTED;
      ctx.font = '10px "IBM Plex Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillText(('00000' + Math.floor(score)).slice(-5), W - 6, 4);

      // Hi score
      if (hiScore > 0) {
        ctx.textAlign = 'left';
        ctx.fillText('hi: ' + ('00000' + hiScore).slice(-5), 6, 4);
      }

      // Active power-up chips (top centre)
      var ix = Math.round(W / 2) - 14;
      function chip(label, color, timer, duration) {
        var fading = timer < 60 && frame % 6 < 3;
        ctx.fillStyle = fading ? '#ccc' : color;
        ctx.fillRect(ix, 2, label.length <= 1 ? 8 : 12, 8);
        ctx.fillStyle = '#fff';
        ctx.font = '6px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(label, ix + (label.length <= 1 ? 4 : 6), 3);
        ix += (label.length <= 1 ? 8 : 12) + 3;
      }
      if (shieldTimer > 0) chip('S', SHIELD, shieldTimer, 300);
      if (turboTimer  > 0) chip('T', TURBO,  turboTimer,  200);
      if (multiTimer  > 0) chip('x2', MULTI, multiTimer,  500);

      // Bear danger: red tint + warning text
      var danger = Math.max(0, Math.min(1, (bearOffset + 165) / 151));
      if (danger > 0.25) {
        ctx.save();
        ctx.globalAlpha = (danger - 0.25) / 0.75 * 0.28 * (0.5 + 0.5 * Math.sin(frame * 0.28));
        ctx.fillStyle = RED;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }
      if (danger > 0.82) {
        ctx.save();
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = RED;
        ctx.font = '8px "IBM Plex Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('! BEAR CLOSING IN !', W / 2, groundY - 9);
        ctx.restore();
      }

      if (!started) {
        ctx.textAlign = 'center';
        ctx.fillStyle = INK;
        ctx.font = '11px "IBM Plex Mono", monospace';
        ctx.fillText('[space] / tap to run!', W / 2, 24);
        ctx.font = '8px "IBM Plex Mono", monospace';
        ctx.fillStyle = BEAR_C;
        ctx.fillText('there is a bear. run.', W / 2, 40);
      } else if (gameOver) {
        ctx.textAlign = 'center';
        var line1 = gameOverReason === 'bear' ? 'THE BEAR GOT YOU!' : 'face full of obstacle';
        ctx.fillStyle = ACCENT;
        ctx.font = 'bold 11px "IBM Plex Mono", monospace';
        ctx.fillText(line1, W / 2, 20);
        ctx.fillStyle = INK;
        ctx.font = '9px "IBM Plex Mono", monospace';
        ctx.fillText('tap to try again', W / 2, 36);
      }
    }

    function aabb(a, b) {
      return a.x < b.x + b.w && a.x + a.w > b.x &&
             a.y < b.y + b.h && a.y + a.h > b.y;
    }

    function triggerGameOver(reason) {
      if (gameOver) return;
      gameOver = true; gameOverReason = reason || 'obstacle';
      if (Math.floor(score) > hiScore) {
        hiScore = Math.floor(score);
        try { localStorage.setItem('prawee_runner_hi', String(hiScore)); } catch (e) {}
      }
    }

    // ---- Update ----
    function update() {
      if (gameOver || !started) return;
      frame++;

      // Speed ramp (reaches max ~score 833)
      speed = Math.min(maxSpeed, 2.0 + score * 0.006);

      // Score (doubled during x2)
      score += 0.15 * speed * (multiTimer > 0 ? 2 : 1);

      // Timers
      if (shieldTimer > 0) shieldTimer--;
      if (turboTimer  > 0) turboTimer--;
      if (multiTimer  > 0) multiTimer--;
      if (hitFlash    > 0) hitFlash--;

      // Runner physics
      runner.vy += GRAVITY;
      runner.y  += runner.vy;
      if (runner.y >= groundY - 16) {
        runner.y = groundY - 16; runner.vy = 0; runner.jumping = false;
      }
      var legTick = Math.max(3, 8 - Math.floor(speed));
      if (frame % legTick === 0) runner.legFrame ^= 1;

      // Bear approaches faster at higher speed; turbo pushes it back
      var bearSpeed = 0.10 + (speed - 2.0) * 0.048;
      if (turboTimer > 0) {
        bearOffset -= 1.6;
        if (bearOffset < -165) bearOffset = -165;
      } else {
        bearOffset += bearSpeed;
      }
      if (frame % 8 === 0) bearAnim ^= 1;
      if (bearOffset >= BEAR_CATCH) { triggerGameOver('bear'); return; }

      // Obstacles — spawn interval shrinks with speed
      spawnCount++;
      if (spawnCount >= nextSpawn) {
        spawnObstacle();
        spawnCount = 0;
        nextSpawn = Math.max(40, 55 + Math.random() * 50 - (speed - 2.0) * 5);
      }
      for (var i = obstacles.length - 1; i >= 0; i--) {
        obstacles[i].x -= speed;
        if (obstacles[i].x + obstacles[i].w < -2) obstacles.splice(i, 1);
      }

      // Power-ups (slightly slower than obstacles so they're catchable)
      puCount++;
      if (puCount >= puNext) {
        spawnPowerup();
        puCount = 0;
        puNext = 120 + Math.random() * 110;
      }
      for (var pi = powerups.length - 1; pi >= 0; pi--) {
        powerups[pi].x -= speed * 0.88;
        if (powerups[pi].x < -12) powerups.splice(pi, 1);
      }

      // Speed lines during turbo
      if (turboTimer > 0 && frame % 4 === 0)
        speedLines.push({ x: W - 5, y: 4 + Math.random() * (groundY - 8), life: 13 });
      for (var si = speedLines.length - 1; si >= 0; si--) {
        speedLines[si].x -= speed * 2.5;
        if (--speedLines[si].life <= 0 || speedLines[si].x < -32) speedLines.splice(si, 1);
      }

      // Clouds (slow parallax)
      clouds.forEach(function (cl) {
        cl.x -= 0.3;
        if (cl.x < -10) { cl.x = W + Math.random() * 80; cl.y = 6 + Math.random() * 22; }
      });

      // Collision boxes (inset slightly)
      var rBox = { x: runner.x + 2, y: runner.y + 1, w: runner.w - 4, h: runner.h - 2 };

      // vs obstacles
      for (var j = 0; j < obstacles.length; j++) {
        if (aabb(rBox, obstacles[j])) {
          if (shieldTimer > 0) {
            shieldTimer = 0; hitFlash = 20; obstacles.splice(j, 1);
          } else if (turboTimer > 0) {
            turboTimer = 0; hitFlash = 20; obstacles.splice(j, 1);
          } else {
            triggerGameOver('obstacle');
          }
          break;
        }
      }
      if (gameOver) return;

      // vs power-ups
      for (var ki = powerups.length - 1; ki >= 0; ki--) {
        var pu = powerups[ki];
        if (aabb(rBox, { x: pu.x, y: pu.y, w: pu.w, h: pu.h })) {
          if      (pu.type === 'coin')   { score += 50; }
          else if (pu.type === 'shield') { shieldTimer = 300; }
          else if (pu.type === 'turbo')  { turboTimer = 200; bearOffset -= 75; if (bearOffset < -165) bearOffset = -165; }
          else if (pu.type === 'multi')  { multiTimer = 500; }
          powerups.splice(ki, 1);
        }
      }
    }

    // ---- Render ----
    function render() {
      ctx.fillStyle = hitFlash > 0 ? '#FFE8E8' : BG;
      ctx.fillRect(0, 0, W, H);

      clouds.forEach(drawCloud);
      drawGround();

      // Speed lines behind everything
      for (var si = 0; si < speedLines.length; si++) {
        var sl = speedLines[si];
        ctx.save();
        ctx.globalAlpha = sl.life / 13 * 0.45;
        ctx.fillStyle = TURBO;
        ctx.fillRect(Math.round(sl.x), Math.round(sl.y), 22, 1);
        ctx.restore();
      }

      obstacles.forEach(drawObstacle);
      powerups.forEach(drawPowerup);

      // Bear (only draw when on screen)
      var bx = Math.round(runner.x + bearOffset);
      if (bx > -BEAR_W) drawBear(bx, groundY - BEAR_H);

      drawRunner();
      drawHUD();
    }

    function loop() { update(); render(); requestAnimationFrame(loop); }
    requestAnimationFrame(loop);
  }

  window.initRunnerGame = init;
})();
