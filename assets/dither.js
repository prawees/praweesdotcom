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

  /* ---------- ambient: a dithered film frame fixed behind the page that morphs as you scroll ----------
     Sections carry data-amb="path/to/photo.jpg". Where you are in the page picks two neighbouring
     frames. Their tone maps are blended, then an ordered (Bayer 8x8) dither turns the blend into two
     tones. Ordered dither is stable: a small change flips a few cells, so the motion reads as a slow
     dissolve and not as shimmer. The background also drifts at a fraction of the scroll speed.
     Everything is a function of scroll position, so nothing moves while you read. With reduced
     motion the frame simply changes per section. The colour switch paints the photo's own colours. */
  function smooth(x) { x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * (3 - 2 * x); }

  function ambient() {
    var secs = Array.prototype.slice.call(d.querySelectorAll('[data-amb]'));
    if (!secs.length) return;
    var reduce = !!(w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)').matches);
    var holder = d.createElement('div');
    holder.className = 'amb'; holder.setAttribute('aria-hidden', 'true');
    var cv = d.createElement('canvas'); holder.appendChild(cv);
    d.body.insertBefore(holder, d.body.firstChild);
    var ctx = cv.getContext('2d');
    var srcs = secs.map(function (s) { return s.getAttribute('data-amb'); });
    var frames = {}, cols = 0, vis = 0, tot = 0, imgData = null, lastKey = '', queued = false, shown = false;
    var LO = 0.26;

    function geometry() {
      var vw = w.innerWidth, cell = vw > 900 ? 4 : 3;
      cols = Math.max(40, Math.round(vw / cell));
      var cs = vw / cols;
      vis = Math.max(40, Math.round(w.innerHeight * 1.12 / cs));
      tot = Math.round(vis * 1.3);                         // spare rows to drift through
      cv.width = cols; cv.height = vis;
      imgData = ctx.createImageData(cols, vis);
    }

    function prepare(F) {
      var im = F.im; if (!(im.complete && im.naturalWidth)) return;
      var c = d.createElement('canvas'); c.width = cols; c.height = tot;
      var g = c.getContext('2d'); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
      var sc = Math.max(cols / im.naturalWidth, tot / im.naturalHeight), sw = cols / sc, sh = tot / sc;
      g.drawImage(im, (im.naturalWidth - sw) / 2, (im.naturalHeight - sh) / 2, sw, sh, 0, 0, cols, tot);
      var data = g.getImageData(0, 0, cols, tot);
      var T = tone(data, { lift: 0.85, contrast: 1.25 });
      for (var i = 0; i < T.length; i++) T[i] = LO + (1 - LO) * T[i];
      var px = data.data, r = 0, gg = 0, bb = 0, n = cols * tot, k;
      for (k = 0; k < px.length; k += 4) { r += px[k]; gg += px[k + 1]; bb += px[k + 2]; }
      r /= n; gg /= n; bb /= n;
      var mx = Math.max(r, gg, bb), mn = Math.min(r, gg, bb), boost = mx - mn < 40 ? 1 : 1.35;
      F.tint = [r, gg, bb].map(function (v) { var m = (mx + mn) / 2; v = m + (v - m) * boost; return Math.round(255 - (255 - Math.max(0, Math.min(255, v))) * 0.34); });
      F.T = T; F.rgb = px; F.ok = true;
    }

    function load(src) {
      if (frames[src]) return frames[src];
      var F = frames[src] = { im: new Image(), ok: false, T: null, rgb: null, tint: [229, 229, 229] };
      F.im.alt = ''; F.im.decoding = 'async';
      F.im.addEventListener('load', function () { prepare(F); lastKey = ''; schedule(); });
      F.im.src = src;
      return F;
    }

    function render() {
      queued = false;
      var n = secs.length, mid = w.innerHeight / 2, i = 0, t = 0, k, r;
      for (k = 0; k < n; k++) {
        r = secs[k].getBoundingClientRect();
        if (r.top <= mid) { i = k; t = (mid - r.top) / Math.max(1, r.height); } else break;
      }
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      var a = srcs[i], b = srcs[Math.min(i + 1, n - 1)];
      var wgt = (reduce || a === b) ? 0 : smooth((t - 0.35) / 0.65);
      wgt = Math.round(wgt * 20) / 20;
      var vh = w.innerHeight, docH = Math.max(d.documentElement.scrollHeight, vh + 1);
      var frac = reduce ? 0 : Math.max(0, Math.min(1, (w.pageYOffset || d.documentElement.scrollTop || 0) / (docH - vh)));
      var py = Math.round(frac * (tot - vis));
      var bias = reduce ? 0 : Math.round(Math.sin(frac * Math.PI * 6) * 5) / 100;
      var colour = d.documentElement.classList.contains('colour');
      var key = [a, b, wgt, py, bias, colour].join('|');
      if (key === lastKey) return;
      var fa = frames[a], fb = frames[b];
      if (!fa || !fa.ok) return;
      if (!fb || !fb.ok) { fb = fa; wgt = 0; }
      lastKey = key;
      var Ta = fa.T, Tb = fb.T, out = imgData.data, off = py * cols, x, y, p = 0, idx, v, thr;
      var t0 = fa.tint, t1 = fb.tint;
      var tr = t0[0] + (t1[0] - t0[0]) * wgt, tg = t0[1] + (t1[1] - t0[1]) * wgt, tb = t0[2] + (t1[2] - t0[2]) * wgt;
      var ra = fa.rgb, rb = fb.rgb, iw = 1 - wgt;
      for (y = 0; y < vis; y++) {
        for (x = 0; x < cols; x++, p += 4) {
          idx = off + y * cols + x;
          if (colour) {
            var q = idx * 4;
            out[p] = 255 - (255 - (ra[q] * iw + rb[q] * wgt)) * 0.3;
            out[p + 1] = 255 - (255 - (ra[q + 1] * iw + rb[q + 1] * wgt)) * 0.3;
            out[p + 2] = 255 - (255 - (ra[q + 2] * iw + rb[q + 2] * wgt)) * 0.3;
          } else {
            v = Ta[idx] * iw + Tb[idx] * wgt + bias;
            thr = B8[(y & 7) * 8 + (x & 7)];
            if (v > thr) { out[p] = 255; out[p + 1] = 255; out[p + 2] = 255; }
            else { out[p] = tr; out[p + 1] = tg; out[p + 2] = tb; }
          }
          out[p + 3] = 255;
        }
      }
      ctx.putImageData(imgData, 0, 0);
      if (!shown) { shown = true; holder.classList.add('ready'); }
    }

    function schedule() {
      if (queued) return; queued = true;
      (w.requestAnimationFrame || function (f) { return setTimeout(f, 16); })(render);
    }

    function rebuild() {
      geometry();
      Object.keys(frames).forEach(function (s) { frames[s].ok = false; prepare(frames[s]); });
      lastKey = ''; schedule();
    }

    geometry();
    srcs.forEach(load);
    w.addEventListener('scroll', schedule, { passive: true });
    var rz2, lastW = w.innerWidth;
    w.addEventListener('resize', function () {
      clearTimeout(rz2);
      rz2 = setTimeout(function () { if (Math.abs(w.innerWidth - lastW) > 2) { lastW = w.innerWidth; rebuild(); } else { lastKey = ''; schedule(); } }, 200);
    });
    w.addEventListener('orientationchange', function () { setTimeout(function () { lastW = w.innerWidth; rebuild(); }, 300); });
    if ('MutationObserver' in w) new MutationObserver(function () { lastKey = ''; schedule(); }).observe(d.documentElement, { attributes: true, attributeFilter: ['class'] });
    schedule();
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
