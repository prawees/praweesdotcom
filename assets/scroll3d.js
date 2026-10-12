/*
 * Scroll position to CSS numbers for the project list on the home page.
 * Each .proj gets --p (-1 entering, 0 centred, 1 leaving), --k (1 centred, 0 at the edges)
 * and --e (0 to 1 as the entry rises into view, then stays 1). The motion itself lives in site.css.
 * Nothing runs with reduced motion, and nothing moves while you are not scrolling.
 */
(function (w, d) {
  var items = Array.prototype.slice.call(d.querySelectorAll('.proj'));
  if (!items.length) return;
  if (w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var queued = false, first = true;
  function ease(x) { return x * x * (3 - 2 * x); }
  function update() {
    queued = false;
    var vh = w.innerHeight, i, r, el, p, k, e;
    for (i = 0; i < items.length; i++) {
      el = items[i]; r = el.getBoundingClientRect();
      if (!first && (r.bottom < -200 || r.top > vh + 200)) continue;
      p = ((r.top + r.height / 2) - vh / 2) / (vh / 2 + r.height / 2);
      p = p < -1 ? -1 : p > 1 ? 1 : p;
      k = ease(1 - Math.abs(p));
      e = ease(Math.max(0, Math.min(1, (vh * 0.95 - r.top) / (vh * 0.4))));
      el.style.setProperty('--p', p.toFixed(3));
      el.style.setProperty('--k', k.toFixed(3));
      el.style.setProperty('--e', e.toFixed(3));
    }
    first = false;
  }
  function schedule() { if (queued) return; queued = true; (w.requestAnimationFrame || setTimeout)(update); }
  w.addEventListener('scroll', schedule, { passive: true });
  w.addEventListener('resize', schedule);
  schedule();
})(window, document);
