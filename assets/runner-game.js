// Pixel runner mini-game. Tap/space to jump over obstacles.
(function () {
  function init(canvas, opts) {
    opts = opts || {};
    var ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    // Logical pixel grid; we draw at internal resolution and scale via CSS
    var W = 320, H = 80;
    canvas.width = W * 2;   // hi-res for crispness
    canvas.height = H * 2;
    ctx.scale(2, 2);

    var COLOR_INK = opts.ink || '#1A1A1A';
    var COLOR_MUTED = opts.muted || '#999999';
    var COLOR_BG = opts.bg || '#FFFFFF';
    var COLOR_ACCENT = opts.accent || '#1E66D0';

    var gameOver = false;
    var started = false;
    var score = 0;
    var hiScore = parseInt(localStorage.getItem('prawee_runner_hi') || '0', 10);
    var frame = 0;
    var groundY = H - 12;
    var speed = 2.0;
    var maxSpeed = 4.2;

    // Runner state
    var runner = {
      x: 28, y: groundY - 16, w: 12, h: 16,
      vy: 0, jumping: false, legFrame: 0
    };
    var GRAVITY = 0.45;
    var JUMP_V = -7.4;

    // Obstacles
    var obstacles = [];
    function spawnObstacle() {
      // Mix of small (cone) and tall (post) obstacles
      var kind = Math.random() < 0.7 ? 0 : 1;
      var ob;
      if (kind === 0) {
        ob = { x: W + 4, y: groundY - 8, w: 6, h: 8, kind: 0 };
      } else {
        ob = { x: W + 4, y: groundY - 14, w: 4, h: 14, kind: 1 };
      }
      obstacles.push(ob);
    }

    var nextSpawn = 80;
    var spawnCounter = 0;

    // Clouds (slow)
    var clouds = [
      { x: 60, y: 14 }, { x: 200, y: 22 }, { x: 280, y: 10 }
    ];

    // Input
    function jump() {
      if (gameOver) {
        reset();
        return;
      }
      if (!started) { started = true; }
      if (!runner.jumping) {
        runner.vy = JUMP_V;
        runner.jumping = true;
      }
    }

    function reset() {
      gameOver = false; started = true;
      score = 0; speed = 2.0;
      obstacles.length = 0;
      runner.y = groundY - 16; runner.vy = 0; runner.jumping = false;
      spawnCounter = 0; nextSpawn = 80;
    }

    // Listeners
    canvas.addEventListener('mousedown', function (e) { e.preventDefault(); jump(); });
    canvas.addEventListener('touchstart', function (e) { e.preventDefault(); jump(); }, { passive: false });

    window.addEventListener('keydown', function (e) {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        // Only jump if canvas is in view-ish (basic check)
        var rect = canvas.getBoundingClientRect();
        if (rect.top < window.innerHeight && rect.bottom > 0) {
          e.preventDefault();
          jump();
        }
      }
    });

    // Drawing helpers
    function px(x, y, w, h, c) {
      ctx.fillStyle = c;
      ctx.fillRect(Math.round(x), Math.round(y), w, h);
    }

    // Draw 12x16 runner sprite
    // Two frames for legs
    var runnerFrameA = [
      // y,x sequence: rows of pixels [...] each row is binary 1s
      // We'll instead use rect-based sprite chunks for crispness:
    ];

    function drawRunner() {
      var x = runner.x, y = runner.y, c = COLOR_INK;
      // head (3x3 at top)
      px(x + 4, y + 0, 4, 3, c);
      // neck
      px(x + 5, y + 3, 2, 1, c);
      // torso
      px(x + 3, y + 4, 6, 4, c);
      // arms
      if (runner.jumping) {
        px(x + 1, y + 4, 2, 1, c);
        px(x + 9, y + 4, 2, 1, c);
      } else {
        // swing arms by leg frame
        if (runner.legFrame === 0) {
          px(x + 1, y + 5, 2, 1, c);
          px(x + 9, y + 4, 2, 1, c);
        } else {
          px(x + 1, y + 4, 2, 1, c);
          px(x + 9, y + 5, 2, 1, c);
        }
      }
      // hips
      px(x + 3, y + 8, 6, 1, c);
      // legs
      if (runner.jumping) {
        // tucked
        px(x + 3, y + 9, 2, 3, c);
        px(x + 7, y + 9, 2, 3, c);
        px(x + 2, y + 12, 3, 2, c);
        px(x + 7, y + 12, 3, 2, c);
      } else {
        if (runner.legFrame === 0) {
          px(x + 3, y + 9, 2, 4, c);
          px(x + 7, y + 9, 2, 3, c);
          px(x + 2, y + 13, 3, 1, c);
          px(x + 6, y + 12, 4, 1, c);
        } else {
          px(x + 3, y + 9, 2, 3, c);
          px(x + 7, y + 9, 2, 4, c);
          px(x + 2, y + 12, 4, 1, c);
          px(x + 7, y + 13, 3, 1, c);
        }
      }
    }

    function drawObstacle(o) {
      if (o.kind === 0) {
        // cone: triangle made of stacked pixels
        var c = COLOR_INK;
        px(o.x + 2, o.y + 0, 2, 2, c);
        px(o.x + 1, o.y + 2, 4, 2, c);
        px(o.x + 0, o.y + 4, 6, 2, c);
        px(o.x + 0, o.y + 6, 6, 2, c);
      } else {
        // post
        px(o.x, o.y, o.w, o.h, COLOR_INK);
        px(o.x - 1, o.y + o.h - 2, o.w + 2, 2, COLOR_INK);
      }
    }

    function drawCloud(cl) {
      var c = COLOR_MUTED;
      px(cl.x,     cl.y + 2, 2, 2, c);
      px(cl.x + 2, cl.y + 0, 6, 4, c);
      px(cl.x + 8, cl.y + 2, 2, 2, c);
    }

    function drawGround() {
      // ground line dotted
      ctx.fillStyle = COLOR_MUTED;
      for (var x = 0; x < W; x += 6) {
        ctx.fillRect(x - ((frame * speed) % 6), groundY, 3, 1);
      }
    }

    function drawHUD() {
      ctx.fillStyle = COLOR_MUTED;
      ctx.font = '10px "IBM Plex Mono", monospace';
      ctx.textBaseline = 'top';
      ctx.textAlign = 'right';
      var s = ('00000' + Math.floor(score)).slice(-5);
      ctx.fillText(s, W - 6, 4);
      if (hiScore > 0) {
        ctx.textAlign = 'left';
        ctx.fillStyle = COLOR_MUTED;
        ctx.fillText('hi: ' + ('00000' + hiScore).slice(-5), 6, 4);
      }
      if (!started) {
        ctx.textAlign = 'center';
        ctx.fillStyle = COLOR_INK;
        ctx.font = '11px "IBM Plex Mono", monospace';
        ctx.fillText('press [space] / tap to run', W / 2, 32);
      } else if (gameOver) {
        ctx.textAlign = 'center';
        ctx.fillStyle = COLOR_ACCENT;
        ctx.font = 'bold 12px "IBM Plex Mono", monospace';
        ctx.fillText('GAME OVER', W / 2, 26);
        ctx.fillStyle = COLOR_INK;
        ctx.font = '10px "IBM Plex Mono", monospace';
        ctx.fillText('tap to restart', W / 2, 42);
      }
    }

    function aabb(a, b) {
      return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    }

    function update() {
      if (gameOver || !started) return;
      frame++;
      score += 0.15 * speed;
      if (Math.floor(score) % 50 === 0 && speed < maxSpeed) speed += 0.001;

      // physics
      runner.vy += GRAVITY;
      runner.y += runner.vy;
      if (runner.y >= groundY - 16) {
        runner.y = groundY - 16;
        runner.vy = 0;
        runner.jumping = false;
      }
      // leg animation
      if (frame % 6 === 0) runner.legFrame = 1 - runner.legFrame;

      // obstacles
      spawnCounter++;
      if (spawnCounter >= nextSpawn) {
        spawnObstacle();
        spawnCounter = 0;
        nextSpawn = 60 + Math.random() * 70;
      }
      for (var i = obstacles.length - 1; i >= 0; i--) {
        obstacles[i].x -= speed;
        if (obstacles[i].x + obstacles[i].w < -2) obstacles.splice(i, 1);
      }

      // clouds
      clouds.forEach(function (c) {
        c.x -= 0.3;
        if (c.x < -10) { c.x = W + Math.random() * 80; c.y = 6 + Math.random() * 22; }
      });

      // collide
      var rBox = { x: runner.x + 1, y: runner.y + 1, w: runner.w - 2, h: runner.h - 2 };
      for (var j = 0; j < obstacles.length; j++) {
        if (aabb(rBox, obstacles[j])) {
          gameOver = true;
          if (Math.floor(score) > hiScore) {
            hiScore = Math.floor(score);
            try { localStorage.setItem('prawee_runner_hi', String(hiScore)); } catch (e) {}
          }
          break;
        }
      }
    }

    function render() {
      ctx.fillStyle = COLOR_BG;
      ctx.fillRect(0, 0, W, H);
      clouds.forEach(drawCloud);
      drawGround();
      obstacles.forEach(drawObstacle);
      drawRunner();
      drawHUD();
    }

    function loop() {
      update();
      render();
      requestAnimationFrame(loop);
    }

    requestAnimationFrame(loop);
  }

  window.initRunnerGame = init;
})();
