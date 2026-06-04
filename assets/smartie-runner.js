/* ============================================================================
 * SMARTIE RUNNER — a small, calm runner for prawees.com
 * A miniature of "Ramathon Dash". After a run it quietly points to the full
 * game on the Ramathon Run Club site. Jump only. No noise.
 *
 * Keeps the entry point window.initRunnerGame(canvas, opts) so index.html only
 * needs its <script src> swapped.
 * ==========================================================================*/
(function () {
  var RAMATHON_URL = 'https://ramathonrun.pythonanywhere.com/arcade';

  function init(canvas, opts) {
    opts = opts || {};
    if (opts.ramathonUrl) RAMATHON_URL = opts.ramathonUrl;
    var ctx = canvas.getContext('2d');

    var W = 320, H = 80;
    canvas.width = W * 2; canvas.height = H * 2;
    ctx.scale(2, 2);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    var groundY = H - 12;

    var INK = '#240046';
    // one calm palette (no jarring scene changes)
    var BODY = '#C5D86D', SHADE = '#A7BE52', CAP = '#7E9636', CHEEK = '#E07A5F';
    var SKY1 = '#DCEDE3', SKY2 = '#F2F7EC', HILL = '#AFCBA8', GROUND = '#9FBE8E', STRIPE = '#88A877', ACCENT = '#5E8C61';

    var state = 'ready'; // ready | playing | dead
    var score = 0, frame = 0, speed = 2.2, maxSpeed = 4.6;
    var hi = parseInt(localStorage.getItem('smartie_hi') || '0', 10);
    var shake = 0, flash = 0;

    var P = { x: 46, y: groundY, vy: 0, onGround: true, leg: 0, blink: 0 };
    var GRAV = 0.55, JUMP = -6.0;
    var SCALE = 0.42;                         // sneaker scale (engine units -> demo)

    var obstacles = [], coins = [], clouds = [], hills = [], marks = [], parts = [];
    clouds.push({ x: 60, y: 16, s: 0.9 }, { x: 170, y: 24, s: 0.7 }, { x: 270, y: 13, s: 1.0 });
    for (var i = 0; i < 4; i++) hills.push({ x: i * 110 + 30, s: 0.8 + Math.random() * 0.4 });
    for (var m = 0; m < 16; m++) marks.push({ x: Math.random() * W, y: groundY + 4 + Math.random() * 8 });
    var obsT = 0, coinT = 0;

    // ---- quiet, classy funnel (appears only after a run) ----
    var card = canvas.closest('.game-card') || canvas.parentNode;
    var cta = document.createElement('div');
    cta.style.cssText = 'display:none; margin:14px auto 2px; text-align:center;' +
      'font-family:"IBM Plex Mono","IBM Plex Sans Thai",monospace; font-size:12px;' +
      'letter-spacing:.2px; color:#9a93a6; line-height:1.6;';
    var link = document.createElement('a');
    link.href = RAMATHON_URL; link.target = '_blank'; link.rel = 'noopener';
    link.style.cssText = 'color:#240046; text-decoration:none; border-bottom:1px solid rgba(36,0,70,.28); padding-bottom:1px; transition:border-color .2s;';
    link.onmouseenter = function () { link.style.borderBottomColor = 'rgba(36,0,70,.7)'; };
    link.onmouseleave = function () { link.style.borderBottomColor = 'rgba(36,0,70,.28)'; };
    cta.appendChild(document.createTextNode(''));
    cta.appendChild(link);
    if (card && card.parentNode) card.parentNode.insertBefore(cta, card.nextSibling);
    function showCTA() {
      var en = document.body && document.body.className.indexOf('lang-en') >= 0;
      cta.childNodes[0].nodeValue = en ? 'A fuller version lives at ' : 'เกมเวอร์ชันเต็มอยู่ที่ ';
      link.textContent = 'Ramathon Run Club ↗';
      cta.style.display = 'block';
    }

    // ---- audio (soft) ----
    var AC = null;
    function blip(f, d, type, v) {
      if (opts.muted) return;
      try {
        if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
        if (AC.state === 'suspended') AC.resume();
        var o = AC.createOscillator(), g = AC.createGain();
        o.type = type || 'sine'; o.frequency.value = f; g.gain.value = v || 0.035;
        o.connect(g); g.connect(AC.destination);
        var n = AC.currentTime; g.gain.exponentialRampToValueAtTime(0.0001, n + d);
        o.start(n); o.stop(n + d);
      } catch (e) {}
    }

    // ---- input (jump only) ----
    function jump() {
      if (state === 'ready') { state = 'playing'; cta.style.display = 'none'; return; }
      if (state === 'dead') { reset(); return; }
      if (P.onGround) { P.vy = JUMP; P.onGround = false; blip(440, 0.13, 'sine', 0.04); puff(); }
    }
    function reset() {
      state = 'playing'; score = 0; speed = 2.2; frame = 0;
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

    function puff() { for (var i = 0; i < 4; i++) parts.push({ x: P.x + 3, y: groundY, vx: -(0.4 + Math.random()) * 1.1, vy: -Math.random() * 1.1 - 0.2, life: 14, max: 14, c: 'rgba(255,255,255,.7)', r: 1.2 + Math.random() }); }
    function burst(x, y, c) { for (var i = 0; i < 10; i++) { var a = Math.random() * 6.28, s = 0.8 + Math.random() * 2.4; parts.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1, life: 18 + Math.random() * 8, max: 26, c: i % 3 ? c : INK, r: 1.2 + Math.random() * 1.6, g: 0.16 }); } }

    function gameOver() {
      if (state === 'dead') return;
      state = 'dead'; shake = 6; flash = 5;
      blip(170, 0.26, 'sine', 0.06);
      burst(P.x + 6, P.y - 7, BODY);
      if (Math.floor(score) > hi) { hi = Math.floor(score); try { localStorage.setItem('smartie_hi', String(hi)); } catch (e) {} }
      setTimeout(function () { if (state === 'dead') showCTA(); }, 360);
    }

    // ---- update ----
    function update() {
      frame++;
      for (var i = parts.length - 1; i >= 0; i--) { var p = parts[i]; p.x += p.vx; p.y += p.vy; if (p.g) p.vy += p.g; if (--p.life <= 0) parts.splice(i, 1); }
      for (var c = 0; c < clouds.length; c++) { clouds[c].x -= 0.12; if (clouds[c].x < -24) clouds[c].x = W + 20; }
      if (flash > 0) flash--;
      if (shake > 0.3) shake *= 0.85; else shake = 0;

      if (state !== 'playing') { P.leg += 0.14; P.blink = (P.blink + 1) % 200; return; }

      speed = Math.min(maxSpeed, 2.2 + score * 0.003);
      score += 0.1 * speed;

      for (var h = 0; h < hills.length; h++) { hills[h].x -= speed * 0.12; if (hills[h].x < -90) hills[h].x += hills.length * 110; }
      for (var k2 = 0; k2 < marks.length; k2++) { marks[k2].x -= speed * 0.8; if (marks[k2].x < -6) { marks[k2].x = W + Math.random() * 20; marks[k2].y = groundY + 4 + Math.random() * 8; } }

      P.vy += GRAV; P.y += P.vy;
      if (P.y >= groundY) { P.y = groundY; P.vy = 0; if (!P.onGround) puff(); P.onGround = true; }
      var prev = P.leg; P.leg += P.onGround ? (0.18 + speed * 0.02) : 0.05;
      if (P.onGround && Math.floor(prev / Math.PI) !== Math.floor(P.leg / Math.PI)) puff();
      P.blink = (P.blink + 1) % 210;

      obsT += speed;
      if (obsT >= 70 + Math.random() * 70) {
        obsT = 0;
        if (Math.random() < 0.78) obstacles.push({ kind: 'cone', x: W + 8, h: 10 + Math.random() * 7 });
        else obstacles.push({ kind: 'bird', x: W + 8, baseY: groundY - 15, t: 0, bob: Math.random() * 6.28 });
      }
      for (var o = obstacles.length - 1; o >= 0; o--) { var ob = obstacles[o]; ob.x -= speed; ob.t = (ob.t || 0) + 1; if (ob.x < -16) obstacles.splice(o, 1); }

      coinT += speed;
      if (coinT >= 95 + Math.random() * 80) { coinT = 0; var n = 2 + (Math.random() * 3 | 0); var by = groundY - 16 - Math.random() * 20; for (var ci = 0; ci < n; ci++) coins.push({ x: W + 8 + ci * 16, y: by, bob: Math.random() * 6.28 }); }
      for (var kk = coins.length - 1; kk >= 0; kk--) { coins[kk].x -= speed; coins[kk].bob += 0.1; if (coins[kk].x < -8) coins.splice(kk, 1); }

      // collisions — hitbox roughly the sneaker
      var hx = P.x - 9, hy = P.y - 13, hw = 19, hh = 13;
      for (var j = 0; j < obstacles.length; j++) {
        var box = obstacleBox(obstacles[j]);
        if (hx < box.x + box.w && hx + hw > box.x && hy < box.y + box.h && hy + hh > box.y) { gameOver(); return; }
      }
      for (var c3 = coins.length - 1; c3 >= 0; c3--) {
        var cn = coins[c3], cy = cn.y + Math.sin(cn.bob) * 2;
        if (hx < cn.x + 5 && hx + hw > cn.x - 5 && hy < cy + 5 && hy + hh > cy - 5) { score += 20; coins.splice(c3, 1); blip(900, 0.06, 'triangle', 0.045); burst(cn.x, cy, '#E7B43C'); }
      }
    }
    function obstacleBox(o) {
      if (o.kind === 'cone') return { x: o.x, y: groundY - o.h, w: 11, h: o.h };
      var by = o.baseY + Math.sin(o.t * 0.12 + o.bob) * 4;
      return { x: o.x, y: by - 7, w: 18, h: 13 };
    }

    // ---- draw ----
    function rr(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
    function hexA(hex, a) { return 'rgba(' + parseInt(hex.substr(1, 2), 16) + ',' + parseInt(hex.substr(3, 2), 16) + ',' + parseInt(hex.substr(5, 2), 16) + ',' + a + ')'; }

    // the sneaker, drawn in engine units around origin (sole bottom)
    function drawSneaker() {
      ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = INK;
      var up = new Path2D();
      up.moveTo(-31, -14); up.lineTo(-31, -30);
      up.quadraticCurveTo(-31, -38, -22, -38);
      up.quadraticCurveTo(-16, -38, -14, -31);
      up.lineTo(-8, -40); up.quadraticCurveTo(0, -41, 4, -34);
      up.quadraticCurveTo(24, -33, 37, -15); up.quadraticCurveTo(41, -12, 35, -12);
      up.lineTo(-31, -14); up.closePath();
      var g = ctx.createLinearGradient(0, -42, 0, -12); g.addColorStop(0, BODY); g.addColorStop(1, SHADE);
      ctx.fillStyle = g; ctx.lineWidth = 3.2; ctx.fill(up); ctx.stroke(up);
      // heel + toe caps
      ctx.beginPath(); ctx.moveTo(-31, -14); ctx.lineTo(-31, -30); ctx.quadraticCurveTo(-31, -37, -23, -37.5); ctx.quadraticCurveTo(-20, -24, -20, -14); ctx.closePath(); ctx.fillStyle = CAP; ctx.lineWidth = 2; ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(20, -13); ctx.quadraticCurveTo(33, -14, 37, -15); ctx.quadraticCurveTo(41, -12, 35, -12); ctx.lineTo(20, -13); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = hexA(INK, 0.45); ctx.beginPath(); ctx.ellipse(-15, -33, 6, 3.2, -0.35, 0, 6.2832); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.moveTo(-6, -15); ctx.quadraticCurveTo(8, -24, 30, -17); ctx.stroke();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-2, -33); ctx.lineTo(7, -30); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, -28); ctx.lineTo(9, -26); ctx.stroke();
      // sole
      ctx.fillStyle = '#fff'; ctx.strokeStyle = INK; ctx.lineWidth = 3.2;
      var sl = new Path2D(); sl.moveTo(-32, -13); sl.quadraticCurveTo(-36, -13, -35, -6); sl.quadraticCurveTo(-34, -1, -25, -1); sl.lineTo(30, -1); sl.quadraticCurveTo(42, -1, 40, -11); sl.quadraticCurveTo(39, -15, 32, -14); sl.lineTo(-32, -13);
      ctx.fill(sl); ctx.stroke(sl);
      // face
      var blink = P.blink > 204;
      ctx.fillStyle = hexA(CHEEK, 0.5); ctx.beginPath(); ctx.arc(-16, -19, 4, 0, 6.2832); ctx.fill();
      [-17, -5].forEach(function (ex) {
        if (blink) { ctx.strokeStyle = INK; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(ex - 4, -26); ctx.lineTo(ex + 4, -26); ctx.stroke(); return; }
        ctx.fillStyle = '#fff'; ctx.strokeStyle = INK; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.ellipse(ex, -26, 5, 6.5, 0, 0, 6.2832); ctx.fill(); ctx.stroke();
        ctx.fillStyle = INK; var lx = ex + 1.6; ctx.beginPath(); ctx.moveTo(lx, -26); ctx.arc(lx, -25.5, 3.4, -0.4 * Math.PI, 0.4 * Math.PI); ctx.closePath(); ctx.fill();
      });
      ctx.strokeStyle = INK; ctx.lineWidth = 2;
      if (state === 'playing') { ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(-11, -19, 2.2, 2.8, 0, 0, 6.2832); ctx.fill(); }
      else { ctx.beginPath(); ctx.arc(-11, -21, 3.2, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke(); }
    }

    function drawPlayer() {
      var running = P.onGround && state === 'playing';
      var cyc = P.leg;
      var hop = running ? Math.abs(Math.sin(cyc)) * 4 : 0;
      var tilt = P.onGround ? Math.sin(cyc) * 0.06 : Math.max(-0.3, Math.min(0.3, -P.vy * 0.03));
      var sqY = running ? (0.95 + (hop / 4) * 0.12) : 1, sqX = running ? (1.05 - (hop / 4) * 0.09) : 1;
      // shadow
      ctx.globalAlpha = 0.15 * (P.onGround ? 1 : 0.5); ctx.fillStyle = INK;
      ctx.beginPath(); ctx.ellipse(P.x, groundY + 2, 12 - hop, 2.6, 0, 0, 6.2832); ctx.fill(); ctx.globalAlpha = 1;
      ctx.save();
      ctx.translate(P.x, P.y - hop); ctx.rotate(tilt); ctx.scale(SCALE * sqX, SCALE * sqY);
      drawSneaker();
      ctx.restore();
    }

    function render() {
      ctx.save();
      if (shake > 0.3) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
      // sky
      var sg = ctx.createLinearGradient(0, 0, 0, groundY + 8);
      sg.addColorStop(0, flash > 0 ? '#fff' : SKY1); sg.addColorStop(1, flash > 0 ? '#fff' : SKY2);
      ctx.fillStyle = sg; ctx.fillRect(-4, -4, W + 8, H + 8);
      // sun
      ctx.fillStyle = 'rgba(255,252,235,.85)'; ctx.beginPath(); ctx.arc(W - 42, 20, 12, 0, 6.2832); ctx.fill();
      // clouds
      ctx.fillStyle = 'rgba(255,255,255,.8)';
      clouds.forEach(function (c) { ctx.save(); ctx.translate(c.x, c.y); ctx.scale(c.s, c.s); ctx.beginPath(); ctx.arc(0, 0, 6, 0, 6.28); ctx.arc(7, 2, 5, 0, 6.28); ctx.arc(-6, 2, 4, 0, 6.28); ctx.fill(); ctx.restore(); });
      // hills
      ctx.fillStyle = hexA(HILL, 0.85);
      hills.forEach(function (hl) { var r = 56 * hl.s; ctx.beginPath(); ctx.moveTo(hl.x - r, groundY); ctx.quadraticCurveTo(hl.x, groundY - r * 0.6, hl.x + r, groundY); ctx.closePath(); ctx.fill(); });
      // ground
      ctx.fillStyle = GROUND; ctx.fillRect(-4, groundY, W + 8, H - groundY + 4);
      ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(-4, groundY, W + 8, 1.5);
      ctx.fillStyle = hexA(STRIPE, 0.5); marks.forEach(function (mk) { ctx.fillRect(mk.x, mk.y, 6, 1.4); });

      // coins
      coins.forEach(function (cn) {
        var cy = cn.y + Math.sin(cn.bob) * 2;
        var cg = ctx.createRadialGradient(cn.x - 1, cy - 1, 0.5, cn.x, cy, 5);
        cg.addColorStop(0, '#FCE8B0'); cg.addColorStop(1, '#E7B43C');
        ctx.fillStyle = cg; ctx.strokeStyle = INK; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(cn.x, cy, 5, 0, 6.28); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#9A6E12'; ctx.font = 'bold 6px Georgia'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('฿', cn.x, cy + 0.4);
      });
      // obstacles
      obstacles.forEach(function (o) {
        ctx.strokeStyle = INK; ctx.lineWidth = 1.6; ctx.lineJoin = 'round';
        if (o.kind === 'cone') {
          ctx.fillStyle = '#E07A5F'; ctx.beginPath(); ctx.moveTo(o.x, groundY); ctx.lineTo(o.x + 5.5, groundY - o.h); ctx.lineTo(o.x + 11, groundY); ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#FBF6E6'; ctx.fillRect(o.x + 2.5, groundY - o.h * 0.5, 6, 1.8);
        } else {
          var by = o.baseY + Math.sin(o.t * 0.12 + o.bob) * 4, wf = Math.sin(o.t * 0.35) * 4;
          ctx.fillStyle = '#6E6390'; ctx.beginPath(); ctx.ellipse(o.x + 9, by, 8, 5.5, 0, 0, 6.28); ctx.fill(); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(o.x + 5, by - 1); ctx.quadraticCurveTo(o.x - 3, by - 5 - wf, o.x - 7, by - 1); ctx.quadraticCurveTo(o.x - 1, by + 1, o.x + 5, by - 1); ctx.fill(); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(o.x + 13, by - 1); ctx.quadraticCurveTo(o.x + 21, by - 5 - wf, o.x + 25, by - 1); ctx.quadraticCurveTo(o.x + 19, by + 1, o.x + 13, by - 1); ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#F2C14E'; ctx.beginPath(); ctx.moveTo(o.x + 16, by); ctx.lineTo(o.x + 21, by - 1); ctx.lineTo(o.x + 16, by + 2); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(o.x + 12, by - 2, 1.6, 0, 6.28); ctx.fill();
          ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(o.x + 12.5, by - 2, 0.8, 0, 6.28); ctx.fill();
        }
      });
      // particles
      parts.forEach(function (p) { ctx.globalAlpha = Math.max(0, p.life / p.max); ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.28); ctx.fill(); }); ctx.globalAlpha = 1;

      drawPlayer();
      ctx.restore();

      // HUD
      ctx.textBaseline = 'top'; ctx.fillStyle = INK; ctx.font = 'bold 9px "IBM Plex Mono",monospace';
      ctx.textAlign = 'right'; ctx.fillText(('0000' + Math.floor(score)).slice(-4), W - 6, 5);
      if (hi > 0) { ctx.textAlign = 'left'; ctx.fillStyle = hexA(INK, 0.55); ctx.fillText('hi ' + ('0000' + hi).slice(-4), 6, 5); }

      if (state === 'ready') {
        ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(36,0,70,.26)'; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 11px "IBM Plex Mono",monospace'; ctx.fillText('smartie runner', W / 2, 26);
        ctx.font = '8px "IBM Plex Mono",monospace'; ctx.fillText('tap or space to jump', W / 2, 42);
      } else if (state === 'dead') {
        ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(36,0,70,.30)'; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 11px "IBM Plex Mono",monospace'; ctx.fillText('nice run · ' + Math.floor(score), W / 2, 26);
        ctx.font = '8px "IBM Plex Mono",monospace'; ctx.fillText('tap to run again', W / 2, 42);
      }
    }

    function loop() { update(); render(); requestAnimationFrame(loop); }
    requestAnimationFrame(loop);
  }

  window.initRunnerGame = init;
})();
