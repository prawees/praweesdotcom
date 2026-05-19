// Simple typewriter: type out target's text on first load
(function () {
  function typeText(el, text, opts) {
    opts = opts || {};
    var speed = opts.speed || 22;
    var startDelay = opts.delay || 0;
    el.textContent = '';
    el.classList.add('tw-typing');
    setTimeout(function () {
      var i = 0;
      function step() {
        if (i <= text.length) {
          el.textContent = text.slice(0, i);
          i++;
          setTimeout(step, speed + Math.random() * 30);
        } else {
          el.classList.remove('tw-typing');
          el.classList.add('tw-done');
          if (opts.done) opts.done();
        }
      }
      step();
    }, startDelay);
  }
  window.typeText = typeText;
})();
