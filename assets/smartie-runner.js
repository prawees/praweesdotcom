/* ============================================================================
 * SMARTIE RUNNER — colourful Cuphead-flavoured teaser for prawees.com
 * A tiny cousin of "Ramathon Dash". On wipeout it invites you to play the
 * full game (4 characters, real venues, real coins) on the Ramathon website.
 *
 * Keeps the original entry point name window.initRunnerGame(canvas, opts)
 * so index.html only needs its <script src> swapped.
 * ==========================================================================*/
(function () {
  // ⚠️ Point this at the live Ramathon arcade page.
  var RAMATHON_URL = 'https://ramathonrun.pythonanywhere.com/arcade';

  function init(canvas, opts) {
    opts = opts || {};
    if (opts.ramathonUrl) RAMATHON_URL = opts.ramathonUrl;
    var ctx = canvas.getContext('2d');

    var W = 320, H = 80;
    canvas.width = W * 2; canvas.height = H * 2;
    ctx.scale(2, 2);
    var groundY = H - 12;

    // Smartie "Speedy" palette (green hero)
    var BODY = '#7FD16B', SHADE = '#4FA94B', DARK = '#2E6B2A', CAP = '#2E6B2A', SHOE = '#E84B3C';
    var INK = '#240046';

    // venue palettes cycled as you run (mini nod to the full game)
    var VENUES = [
      { sky1: '#BBE7FF', sky2: '#E7F7E4', ground: '#6FBF73', stripe: '#5AA75E', name: 'SALAYA' },
      { sky1: '#FFD9A8', sky2: '#FFF1DE', ground: '#9AA0A8', stripe: '#7E848C', name: 'RAMA·PHAYATHAI' },
      { sky1: '#A9E3F7', sky2: '#E3F6FD', ground: '#8B9DB4', stripe: '#73849B', name: 'CNMI' },
      { sky1: '#C9EBC1', sky2: '#F2FAEC', ground: '#7CB342', stripe: '#669436', name: 'LUMPHINI' }
    ];

    var state = 'ready'; // ready | playing | dead
    var score = 0, frame = 0, speed = 2.4, maxSpeed = 6.2;
    var hi = parseInt(localStorage.getItem('smartie_hi') || '0', 10);
    var venueIdx = 0, venueProg = 0, stageLen = 320;
    var shake = 0, flash = 0;

    var P = { x: 36, y: groundY, vy: 0, onGround: true, leg: 0, blink: 0 };
    var GRAV = 0.5, JUMP = -7.6;

    var obstacles = [], coins = [], clouds = [], parts = [];
    clouds.push({ x: 60, y: 16, s: 1 }, { x: 180, y: 24, s: 0.8 }, { x: 280, y: 12, s: 1.1 });
    var obsT = 0, obsGap = 80, coinT = 0, coinGap = 130;

    // ---- death CTA injected into the page ----
    var card = canvas.closest('.game-card') || canvas.parentNode;
    var cta = document.createElement('a');
    cta.href = RAMATHON_URL;
    cta.target = '_blank';
    cta.rel = 'noopener';
    cta.style.cssText = 'display:none;margin:10px auto 0;max-width:520px;text-align:center;' +
      'text-decoration:none;font-family:"IBM Plex Mono",monospace;font-size:12.5px;font-weight:700;' +
      'color:#fff;background:#240046;border:2px solid #240046;border-radius:8px;padding:9px 14px;' +
      'box-shadow:4px 4px 0 #7FD16B;transition:transform .15s, box-shadow .15s;';
    cta.innerHTML = '🕹️ liked that? play the FULL game — 4 characters, real venues, real coins →';
    cta.onmouseenter = function () { cta.style.transform = 'translate(-2px,-2px)'; cta.style.boxShadow = '6px 6px 0 #7FD16B'; };
    cta.onmouseleave = function () { cta.style.transform = ''; cta.style.boxShadow = '4px 4px 0 #7FD16B'; };
    if (card && card.parentNode) card.parentNode.insertBefore(cta, card.nextSibling);

    // ---- audio blips ----
    var AC = null;
    function blip(f, d, type, v) {
      if (opts.muted) return;
      try {
        if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
        if (AC.state === 'suspended') AC.resume();
        var o = AC.createOscillator(), g = AC.createGain();
        o.type = type || 'square'; o.frequency.value = f; g.gain.value = v || 0.04;
        o.connect(g); g.connect(AC.destination);
        var n = AC.currentTime; g.gain.exponentialRampToValueAtTime(0.0001, n + d);
        o.start(n); o.stop(n + d);
      } catch (e) {}
    }

    // ---- input ----
    function jump() {
      if (state === 'ready') { state = 'playing'; cta.style.display = 'none'; return; }
      if (state === 'dead') { reset(); return; }
      if (P.onGround) { P.vy = JUMP; P.onGround = false; blip(520, 0.14, 'square'); puff(); }
    }
    function reset() {
      state = 'playing'; score = 0; speed = 2.4; frame = 0; venueIdx = 0; venueProg = 0;
      obstacles.length = 0; coins.length = 0; parts.length = 0;
      P.y = groundY; P.vy = 0; P.onGround = true; obsT = 0; coinT = 0; flash = 0; shake = 0;
      cta.style.display = 'none';
    }
    canvas.addEventListener('mousedown', function (e) { e.preventDefault(); jump(); });
    canvas.addEventListener('touchstart', function (e) { e.preventDefault(); jump(); }, { passive: false });
    window.addEventListener('keydown', function (e) {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        var r = canvas.getBoundingClientRect();
        if (r.top < window.innerHeight && r.bottom > 0) { e.preventDefault(); jump(); }
      }
    });

    function puff() { for (var i = 0; i < 5; i++) parts.push({ x: P.x + 6, y: groundY, vx: (Math.random() - 0.5) * 2, vy: -Math.random() - 0.3, life: 14, c: 'rgba(255,255,255,.8)', r: 1.5 }); }
    function burst(x, y, c) { for (var i = 0; i < 12; i++) { var a = Math.random() * 6.28, s = 1 + Math.random() * 3; parts.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1, life: 20 + Math.random() * 10, c: i % 2 ? c : INK, r: 1.5 + Math.random() * 2, g: 0.18 }); } }

    function gameOver() {
      if (state === 'dead') return;
      state = 'dead'; shake = 8; flash = 6;
      blip(150, 0.3, 'sawtooth', 0.06);
      burst(P.x + 6, P.y - 10, BODY);
      if (Math.floor(score) > hi) { hi = Math.floor(score); try { localStorage.setItem('smartie_hi', String(hi)); } catch (e) {} }
      setTimeout(function () { if (state === 'dead') cta.style.display = 'block'; }, 350);
    }

    // ---- update ----
    function update() {
      frame++;
      for (var i = parts.length - 1; i >= 0; i--) { var p = parts[i]; p.x += p.vx; p.y += p.vy; if (p.g) p.vy += p.g; if (--p.life <= 0) parts.splice(i, 1); }
      clouds.forEach(function (c) { c.x -= 0.25; if (c.x < -20) c.x = W + 20; });
      if (flash > 0) flash--;
      if (shake > 0) shake *= 0.85;

      if (state !== 'playing') { P.leg += 0.15; P.blink = (P.blink + 1) % 180; return; }

      speed = Math.min(maxSpeed, 2.4 + score * 0.004);
      score += 0.1 * speed;
      venueProg += speed; if (venueProg >= stageLen) { venueProg = 0; venueIdx++; }

      P.vy += GRAV; P.y += P.vy;
      if (P.y >= groundY) { P.y = groundY; P.vy = 0; P.onGround = true; }
      P.leg += P.onGround ? 0.25 : 0.08;
      P.blink = (P.blink + 1) % 180;

      obsT += speed;
      if (obsT >= obsGap) { obsT = 0; obsGap = 60 + Math.random() * 60; obstacles.push({ x: W + 6, h: 9 + Math.random() * 8 }); }
      for (var o = obstacles.length - 1; o >= 0; o--) { obstacles[o].x -= speed; if (obstacles[o].x < -10) obstacles.splice(o, 1); }

      coinT += speed;
      if (coinT >= coinGap) { coinT = 0; coinGap = 90 + Math.random() * 90; coins.push({ x: W + 6, y: groundY - 14 - Math.random() * 22, bob: Math.random() * 6.28 }); }
      for (var k = coins.length - 1; k >= 0; k--) { coins[k].x -= speed; coins[k].bob += 0.1; if (coins[k].x < -8) coins.splice(k, 1); }

      // collisions
      var px = P.x + 2, py = P.y - 18, pw = 12, ph = 18;
      for (var j = 0; j < obstacles.length; j++) {
        var ob = obstacles[j];
        if (px < ob.x + 6 && px + pw > ob.x && py + ph > groundY - ob.h) { gameOver(); return; }
      }
      for (var c2 = coins.length - 1; c2 >= 0; c2--) {
        var cn = coins[c2], cy = cn.y + Math.sin(cn.bob) * 2;
        if (px < cn.x + 5 && px + pw > cn.x - 5 && py < cy + 5 && py + ph > cy - 5) {
          score += 25; coins.splice(c2, 1); blip(880, 0.07, 'triangle', 0.05); burst(cn.x, cy, '#FFD700');
        }
      }
    }

    // ---- draw ----
    function rr(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

    function drawSmartie() {
      var cx = P.x + 8, by = P.y - 11, R = 9;
      // shadow
      ctx.globalAlpha = 0.15; ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(cx, groundY + 1, 11, 3, 0, 0, 6.28); ctx.fill(); ctx.globalAlpha = 1;
      var sw = Math.sin(P.leg) * (P.onGround ? 1 : 0.3);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      // legs
      ctx.strokeStyle = INK; ctx.lineWidth = 3.4;
      ctx.beginPath(); ctx.moveTo(cx - 3, by + R - 1); ctx.lineTo(cx - 3 + sw * 4, by + R + 7); ctx.moveTo(cx + 3, by + R - 1); ctx.lineTo(cx + 3 - sw * 4, by + R + 7); ctx.stroke();
      ctx.strokeStyle = SHOE; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx - 3, by + R - 1); ctx.lineTo(cx - 3 + sw * 4, by + R + 7); ctx.moveTo(cx + 3, by + R - 1); ctx.lineTo(cx + 3 - sw * 4, by + R + 7); ctx.stroke();
      // body
      var g = ctx.createRadialGradient(cx - 3, by - 3, 1, cx, by, R + 2);
      g.addColorStop(0, BODY); g.addColorStop(1, SHADE);
      ctx.fillStyle = g; ctx.strokeStyle = INK; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(cx, by, R, 0, 6.28); ctx.fill(); ctx.stroke();
      // cheeks
      ctx.fillStyle = 'rgba(232,96,122,.5)';
      ctx.beginPath(); ctx.arc(cx - 6, by + 2, 1.8, 0, 6.28); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 6, by + 2, 1.8, 0, 6.28); ctx.fill();
      // eyes
      var blink = P.blink > 172;
      [cx - 4, cx + 4].forEach(function (ex) {
        if (blink) { ctx.strokeStyle = INK; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(ex - 2.5, by - 3); ctx.lineTo(ex + 2.5, by - 3); ctx.stroke(); return; }
        ctx.fillStyle = '#fff'; ctx.strokeStyle = INK; ctx.lineWidth = 1.3;
        ctx.beginPath(); ctx.ellipse(ex, by - 3, 2.6, 3.4, 0, 0, 6.28); ctx.fill(); ctx.stroke();
        ctx.fillStyle = INK; ctx.beginPath(); ctx.moveTo(ex + 1, by - 3); ctx.arc(ex + 1, by - 2.5, 1.9, -0.35 * Math.PI, 0.35 * Math.PI); ctx.closePath(); ctx.fill();
      });
      // smile
      ctx.strokeStyle = INK; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.arc(cx, by, 3, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
      // cap
      ctx.fillStyle = CAP; ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(cx, by - R + 1, 7, 4, 0, Math.PI, 2 * Math.PI); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx + 1, by - R - 1.5); ctx.lineTo(cx + 9, by - R + 1); ctx.lineTo(cx + 4, by - R + 2.5); ctx.closePath(); ctx.fill(); ctx.stroke();
    }

    function render() {
      var v = VENUES[venueIdx % VENUES.length];
      ctx.save();
      if (shake > 0.3) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
      // sky
      var sg = ctx.createLinearGradient(0, 0, 0, H);
      sg.addColorStop(0, flash > 0 ? '#fff' : v.sky1); sg.addColorStop(1, flash > 0 ? '#fff' : v.sky2);
      ctx.fillStyle = sg; ctx.fillRect(-4, -4, W + 8, H + 8);
      // sun
      ctx.fillStyle = 'rgba(255,243,180,.9)'; ctx.beginPath(); ctx.arc(W - 44, 20, 11, 0, 6.28); ctx.fill();
      // clouds
      ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.strokeStyle = 'rgba(36,0,70,.12)'; ctx.lineWidth = 1;
      clouds.forEach(function (c) { ctx.save(); ctx.translate(c.x, c.y); ctx.scale(c.s, c.s); ctx.beginPath(); ctx.arc(0, 0, 6, 0, 6.28); ctx.arc(6, 2, 5, 0, 6.28); ctx.arc(-6, 2, 4, 0, 6.28); ctx.fill(); ctx.stroke(); ctx.restore(); });
      // ground
      ctx.fillStyle = v.ground; ctx.fillRect(-4, groundY, W + 8, H - groundY + 4);
      ctx.fillStyle = 'rgba(0,0,0,.08)'; ctx.fillRect(-4, groundY, W + 8, 2);
      ctx.fillStyle = v.stripe; var off = (frame * speed) % 22;
      for (var sx = -off; sx < W + 22; sx += 22) ctx.fillRect(sx, groundY + 7, 11, 2);

      // coins
      coins.forEach(function (cn) {
        var cy = cn.y + Math.sin(cn.bob) * 2;
        var cg = ctx.createRadialGradient(cn.x - 1, cy - 1, 0.5, cn.x, cy, 5);
        cg.addColorStop(0, '#FFF3B0'); cg.addColorStop(1, '#F2B705');
        ctx.fillStyle = cg; ctx.strokeStyle = INK; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(cn.x, cy, 5, 0, 6.28); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#A86B00'; ctx.font = 'bold 6px Georgia'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('฿', cn.x, cy + 0.5);
      });
      // obstacles (cones)
      obstacles.forEach(function (o) {
        ctx.fillStyle = '#E84B3C'; ctx.strokeStyle = INK; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(o.x, groundY); ctx.lineTo(o.x + 4, groundY - o.h); ctx.lineTo(o.x + 8, groundY); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.fillRect(o.x + 1.5, groundY - o.h * 0.55, 5, 1.6);
      });
      // particles behind/around
      parts.forEach(function (p) { ctx.globalAlpha = Math.max(0, p.life / 24); ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.28); ctx.fill(); }); ctx.globalAlpha = 1;

      drawSmartie();
      ctx.restore();

      // HUD
      ctx.textBaseline = 'top'; ctx.fillStyle = INK; ctx.font = 'bold 9px "IBM Plex Mono",monospace';
      ctx.textAlign = 'right'; ctx.fillText(('00000' + Math.floor(score)).slice(-5), W - 5, 4);
      if (hi > 0) { ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(36,0,70,.6)'; ctx.fillText('hi ' + ('00000' + hi).slice(-5), 5, 4); }
      // venue tag
      ctx.textAlign = 'left'; ctx.fillStyle = v.stripe; ctx.font = 'bold 7px "IBM Plex Mono",monospace'; ctx.fillText(v.name, 5, 14);

      if (state === 'ready') {
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(36,0,70,.3)'; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 11px "IBM Plex Mono",monospace';
        ctx.fillText('SMARTIE RUNNER', W / 2, 24);
        ctx.font = '8px "IBM Plex Mono",monospace';
        ctx.fillText('[space] / tap to run · jump the cones', W / 2, 42);
      } else if (state === 'dead') {
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(36,0,70,.34)'; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#FFD700'; ctx.font = 'bold 12px "IBM Plex Mono",monospace';
        ctx.fillText('WIPEOUT!  ' + Math.floor(score), W / 2, 24);
        ctx.fillStyle = '#fff'; ctx.font = '8px "IBM Plex Mono",monospace';
        ctx.fillText('tap to retry — or play the full game below ↓', W / 2, 42);
      }
    }

    function loop() { update(); render(); requestAnimationFrame(loop); }
    requestAnimationFrame(loop);
  }

  window.initRunnerGame = init;
})();
