/*!
 * dither.js for prawees.com
 *
 * Turns <img data-dither> into a 4-tone dithered picture drawn on a canvas.
 * The four tones are the site palette: black, #767676, #E5E5E5, white.
 * The original colour image stays underneath and "develops" on hover, on tap,
 * or when the page-wide colour switch is on.
 *
 * Algorithms: ordered Bayer (8x8), Floyd-Steinberg (serpentine), Atkinson.
 * No dependencies. Works on desktop browsers and iOS Safari.
 */
(function (w, d) {
  'use strict';

  var TONES = [0, 118 / 255, 229 / 255, 1];          // black, #767676, #E5E5E5, white
  var RGB = [[0, 0, 0], [118, 118, 118], [229, 229, 229], [255, 255, 255]];
  var STORE = 'prawees.colour';

  /* ---------- Bayer matrix, generated recursively ---------- */
  function bayer(n) {
    var m = [[0]];
    for (var s = 1; s < n; s *= 2) {
      var N = m.length, o = [], y, x;
      for (y = 0; y < N * 2; y++) o.push([]);
      for (y = 0; y < N; y++) for (x = 0; x < N; x++) {
        var v = m[y][x] * 4;
        o[y][x] = v; o[y][x + N] = v + 2; o[y + N][x] = v + 3; o[y + N][x + N] = v + 1;
      }
      m = o;
    }
    var out = new Float32Array(n * n), t = n * n;
    for (var j = 0; j < n; j++) for (var i = 0; i < n; i++) out[j * n + i] = (m[j][i] + 0.5) / t;
    return out;
  }
  var B8 = bayer(8), B4 = bayer(4);

  /* ---------- helpers ---------- */
  function lower(v) {                 // index of tone at or below v
    return v >= TONES[3] ? 2 : v >= TONES[2] ? 2 : v >= TONES[1] ? 1 : 0;
  }
  function nearest(v) {
    var best = 0, bd = 9;
    for (var i = 0; i < 4; i++) { var dd = Math.abs(v - TONES[i]); if (dd < bd) { bd = dd; best = i; } }
    return best;
  }

  // Downscale with repeated halving so thin detail is averaged, not skipped.
  function downscale(img, tw, th) {
    var sw = img.naturalWidth || img.width, sh = img.naturalHeight || img.height;
    var cur = img, cw = sw, ch = sh;
    while (cw / 2 >= tw && ch / 2 >= th) {
      var c = d.createElement('canvas');
      c.width = Math.max(tw, Math.floor(cw / 2)); c.height = Math.max(th, Math.floor(ch / 2));
      c.getContext('2d').drawImage(cur, 0, 0, c.width, c.height);
      cur = c; cw = c.width; ch = c.height;
    }
    var f = d.createElement('canvas');
    f.width = tw; f.height = th;
    var g = f.getContext('2d');
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(cur, 0, 0, tw, th);
    return g.getImageData(0, 0, tw, th);
  }

  // Greyscale, auto-levels on the 1st and 99th percentile, then lift shadows.
  function tone(data, o) {
    var n = data.width * data.height, px = data.data, L = new Float32Array(n), i, hist = new Uint32Array(256);
    for (i = 0; i < n; i++) {
      var v = (0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2]);
      L[i] = v / 255; hist[v | 0]++;
    }
    var lo = 0, hi = 255, acc = 0;
    for (i = 0; i < 256; i++) { acc += hist[i]; if (acc >= n * 0.01) { lo = i; break; } }
    acc = 0;
    for (i = 255; i >= 0; i--) { acc += hist[i]; if (acc >= n * 0.01) { hi = i; break; } }
    if (hi - lo < 24) { lo = 0; hi = 255; }
    var l0 = lo / 255, span = (hi - lo) / 255, g = o.lift, c = o.contrast;
    for (i = 0; i < n; i++) {
      var t = (L[i] - l0) / span;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      t = Math.pow(t, g);                                  // g < 1 lifts shadows
      t = (t - 0.5) * c + 0.5;                             // gentle S contrast
      L[i] = t < 0 ? 0 : t > 1 ? 1 : t;
    }
    return L;
  }

  /* ---------- the three dithers, each returns Uint8Array of tone indices ---------- */
  function ordered(L, W, H) {
    var out = new Uint8Array(W * H);
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      var v = L[y * W + x], i = v >= TONES[2] ? 2 : v >= TONES[1] ? 1 : 0;
      var a = TONES[i], b = TONES[i + 1], f = (v - a) / (b - a);
      out[y * W + x] = f > B8[(y & 7) * 8 + (x & 7)] ? i + 1 : i;
    }
    return out;
  }
  function diffuse(L, W, H, atkinson) {
    var buf = new Float32Array(L), out = new Uint8Array(W * H);
    for (var y = 0; y < H; y++) {
      var rtl = (y & 1) === 1, dx = rtl ? -1 : 1;
      for (var k = 0; k < W; k++) {
        var x = rtl ? W - 1 - k : k, p = y * W + x;
        var v = buf[p], q = nearest(v), e = v - TONES[q];
        out[p] = q;
        if (atkinson) {
          e /= 8;
          add(buf, W, H, x + dx, y, e); add(buf, W, H, x + 2 * dx, y, e);
          add(buf, W, H, x - dx, y + 1, e); add(buf, W, H, x, y + 1, e); add(buf, W, H, x + dx, y + 1, e);
          add(buf, W, H, x, y + 2, e);
        } else {
          add(buf, W, H, x + dx, y, e * 7 / 16);
          add(buf, W, H, x - dx, y + 1, e * 3 / 16);
          add(buf, W, H, x, y + 1, e * 5 / 16);
          add(buf, W, H, x + dx, y + 1, e * 1 / 16);
        }
      }
    }
    return out;
  }
  function add(b, W, H, x, y, e) { if (x >= 0 && x < W && y < H) b[y * W + x] += e; }

  /* ---------- paint a tone-index mask onto a canvas at device resolution ---------- */
  function paint(canvas, mask, W, H, block, pal) {
    pal = pal || RGB;
    var cw = W * block, ch = H * block;
    canvas.width = cw; canvas.height = ch;
    var ctx = canvas.getContext('2d'), img = ctx.createImageData(cw, ch), p = img.data;
    for (var y = 0; y < H; y++) {
      for (var x = 0; x < W; x++) {
        var c = pal[mask[y * W + x]];
        for (var by = 0; by < block; by++) {
          var o = ((y * block + by) * cw + x * block) * 4;
          for (var bx = 0; bx < block; bx++) {
            p[o++] = c[0]; p[o++] = c[1]; p[o++] = c[2]; p[o++] = 255;
          }
        }
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  /* ---------- photo wrapper ---------- */
  function readOpts(el) {
    var ds = el.dataset;
    return {
      algo: ds.dither && ds.dither !== '' && ds.dither !== 'true' ? ds.dither : 'fs',
      px: parseFloat(ds.px) || 2,
      lift: parseFloat(ds.lift) || 0.78,
      contrast: parseFloat(ds.contrast) || 1.12
    };
  }

  function mount(img) {
    if (img.__dz) return;
    var o = readOpts(img);
    var wrap = d.createElement('span');
    wrap.className = 'dz';
    img.parentNode.insertBefore(wrap, img);
    wrap.appendChild(img);
    img.classList.add('dz-img');
    var cv = d.createElement('canvas');
    cv.className = 'dz-c';
    cv.setAttribute('aria-hidden', 'true');
    wrap.appendChild(cv);
    var state = { img: img, wrap: wrap, cv: cv, o: o, cols: 0, started: false };
    img.__dz = state;
    wrap.addEventListener('click', function (e) {
      // taps on touch screens toggle; mouse users get hover instead
      if (w.matchMedia('(hover: none)').matches) wrap.classList.toggle('dev');
    });
    wrap.setAttribute('tabindex', '0');
    wrap.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); wrap.classList.toggle('dev'); }
    });
    ready(img, function () { observe(state); });
  }

  function ready(img, fn) {
    if (img.complete && img.naturalWidth) fn();
    else img.addEventListener('load', fn, { once: true });
  }

  var io = 'IntersectionObserver' in w ? new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (e.isIntersecting) { io.unobserve(e.target); draw(e.target.__dzs); }
    });
  }, { rootMargin: '600px 0px' }) : null;

  function observe(s) {
    s.wrap.__dzs = s;
    if (io) io.observe(s.wrap); else draw(s);
  }

  function draw(s) {
    var wcss = s.wrap.clientWidth;
    if (!wcss) return;
    var dpr = Math.min(w.devicePixelRatio || 1, 3);
    var block = Math.max(1, Math.round(s.o.px * dpr));
    var cols = Math.max(24, Math.floor(wcss * dpr / block));
    var ratio = s.img.naturalHeight / s.img.naturalWidth;
    var rows = Math.max(1, Math.round(cols * ratio));
    if (cols === s.cols) return;
    s.cols = cols;
    var data = downscale(s.img, cols, rows);
    var L = tone(data, s.o);
    var mask = s.o.algo === 'bayer' ? ordered(L, cols, rows) : diffuse(L, cols, rows, s.o.algo === 'atkinson');
    paint(s.cv, mask, cols, rows, block);
    s.wrap.classList.add('ready');
    if (!s.started) {
      s.started = true;
      if (!w.matchMedia('(prefers-reduced-motion: reduce)').matches) s.wrap.classList.add('scan');
    }
  }

  var rt;
  function onResize() {
    clearTimeout(rt);
    rt = setTimeout(function () {
      d.querySelectorAll('.dz').forEach(function (el) {
        var s = el.__dzs; if (!s) return;
        var before = s.lastW || 0, now = el.clientWidth;
        if (Math.abs(now - before) > 2) { s.lastW = now; s.cols = 0; draw(s); }
      });
    }, 160);
  }

  /* ---------- page-wide colour switch ---------- */
  function setColour(on) {
    d.documentElement.classList.toggle('colour', !!on);
    d.querySelectorAll('[data-dz-toggle]').forEach(function (b) {
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      var t = on ? b.getAttribute('data-on') : b.getAttribute('data-off');
      if (t) b.textContent = t;
    });
    try { localStorage.setItem(STORE, on ? '1' : '0'); } catch (e) { /* private mode */ }
  }

  function initToggle() {
    var on = false;
    try { on = localStorage.getItem(STORE) === '1'; } catch (e) { /* ignore */ }
    setColour(on);
    d.querySelectorAll('[data-dz-toggle]').forEach(function (b) {
      b.addEventListener('click', function () { setColour(!d.documentElement.classList.contains('colour')); });
    });
  }

  /* ---------- ambient: a faint dithered film frame fixed behind the page ----------
     Sections carry data-amb="path/to/photo.jpg". The frame under the middle of the
     viewport is the one shown. Only two tones are used (#E5E5E5 and white), so text
     stays readable. The colour switch swaps each layer to the original at low opacity. */
  var AMB = [[229, 229, 229], [255, 255, 255]];

  function twoTone(L, W, H) {
    var b = new Float32Array(L), out = new Uint8Array(W * H);
    for (var y = 0; y < H; y++) {
      var rtl = (y & 1) === 1, dx = rtl ? -1 : 1;
      for (var k = 0; k < W; k++) {
        var x = rtl ? W - 1 - k : k, p = y * W + x, v = b[p], q = v >= 0.5 ? 1 : 0, e = v - q;
        out[p] = q;
        add(b, W, H, x + dx, y, e * 7 / 16); add(b, W, H, x - dx, y + 1, e * 3 / 16);
        add(b, W, H, x, y + 1, e * 5 / 16); add(b, W, H, x + dx, y + 1, e / 16);
      }
    }
    return out;
  }

  function ambient() {
    var secs = d.querySelectorAll('[data-amb]');
    if (!secs.length) return;
    var holder = d.createElement('div');
    holder.className = 'amb'; holder.setAttribute('aria-hidden', 'true');
    d.body.insertBefore(holder, d.body.firstChild);
    var layers = {}, lo = 0.26;

    function drawLayer(L) {
      var im = L.img; if (!(im.complete && im.naturalWidth)) return;
      var dpr = Math.min(w.devicePixelRatio || 1, 2), block = Math.max(1, Math.round(3 * dpr));
      var vw = w.innerWidth, vh = Math.round(w.innerHeight * 1.12);
      var cols = Math.max(40, Math.floor(vw * dpr / block)), rows = Math.max(40, Math.floor(vh * dpr / block));
      var sc = Math.max(cols / im.naturalWidth, rows / im.naturalHeight), sw = cols / sc, sh = rows / sc;
      var c = d.createElement('canvas'); c.width = cols; c.height = rows;
      var g = c.getContext('2d'); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
      g.drawImage(im, (im.naturalWidth - sw) / 2, (im.naturalHeight - sh) / 2, sw, sh, 0, 0, cols, rows);
      var T = tone(g.getImageData(0, 0, cols, rows), { lift: 0.85, contrast: 1.25 });
      for (var i = 0; i < T.length; i++) T[i] = lo + (1 - lo) * T[i];
      // tint: the photo's average colour, diluted into white, replaces the grey
      var px = g.getImageData(0, 0, cols, rows).data, r = 0, gg = 0, bb = 0, n = cols * rows, k;
      for (k = 0; k < px.length; k += 4) { r += px[k]; gg += px[k + 1]; bb += px[k + 2]; }
      r /= n; gg /= n; bb /= n;
      var mx = Math.max(r, gg, bb), mn = Math.min(r, gg, bb), boost = mx - mn < 40 ? 1 : 1.35;   // lift muted casts a little
      var tint = [r, gg, bb].map(function (v) { var m = (mx + mn) / 2; v = m + (v - m) * boost; return Math.round(255 - (255 - Math.max(0, Math.min(255, v))) * 0.34); });
      paint(L.cv, twoTone(T, cols, rows), cols, rows, block, [tint, [255, 255, 255]]);
      L.w = vw;
    }
    function layer(src) {
      if (layers[src]) return layers[src];
      var el = d.createElement('div'); el.className = 'amb-l';
      var im = new Image(); im.alt = ''; im.decoding = 'async';
      var cv = d.createElement('canvas');
      el.appendChild(im); el.appendChild(cv); holder.appendChild(el);
      var L = layers[src] = { el: el, img: im, cv: cv, w: 0 };
      im.addEventListener('load', function () { drawLayer(L); });
      im.src = src;
      return L;
    }
    function show(src) {
      Object.keys(layers).forEach(function (k) { layers[k].el.classList.toggle('on', k === src); });
    }
    var first = secs[0].getAttribute('data-amb');
    secs.forEach(function (s) { layer(s.getAttribute('data-amb')); });
    show(first);
    if ('IntersectionObserver' in w) {
      var io2 = new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting) show(e.target.getAttribute('data-amb')); });
      }, { rootMargin: '-50% 0px -50% 0px' });
      secs.forEach(function (s) { io2.observe(s); });
    }
    var rz2;
    w.addEventListener('resize', function () {
      clearTimeout(rz2);
      rz2 = setTimeout(function () {
        Object.keys(layers).forEach(function (k) { var L = layers[k]; if (Math.abs(w.innerWidth - L.w) > 2) drawLayer(L); });
      }, 200);
    });
  }

  /* ---------- go ---------- */
  function init() {
    d.querySelectorAll('img[data-dither]').forEach(mount);
    ambient();
    initToggle();
    w.addEventListener('resize', onResize);
    w.addEventListener('orientationchange', onResize);
  }

  w.Dither = { init: init, mount: mount, ambient: ambient, setColour: setColour };
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', init); else init();
})(window, document);
