/* ============================================================
 * ParallaxHeroImages — vanilla port
 * ------------------------------------------------------------
 * Original component: React Bits / Aceternity (parallax hero images),
 * MIT. The React + framer-motion layers are replaced by a minimal
 * rAF loop with exponential smoothing (motion value + spring → lerp)
 * and layered transforms (wrapper = parallax translate, img = enter
 * scale/blur). Zero dependencies; works on any static page.
 *
 * Usage:
 *   const ph = ParallaxHeroImages(document.getElementById('el'), {
 *     images: ['a.jpg','b.jpg'],           // max 8, used in order
 *     variant: 'default' | 'edge-focus',  // depth distribution
 *     maxOffset: 40
 *   });
 *   ph.destroy();
 * ============================================================ */
(function (global) {
  'use strict';

  var POSITIONS = [
    { key: 'top-left',     top: '8%',  left: '4%'  },
    { key: 'top-right',    top: '8%',  right: '4%' },
    { key: 'mid-left',     top: '38%', left: '6%'  },
    { key: 'mid-right',    top: '38%', right: '6%' },
    { key: 'bottom-left',  top: '68%', left: '4%'  },
    { key: 'bottom-right', top: '68%', right: '4%' },
    { key: 'far-left',     top: '52%', left: '2%'  },
    { key: 'far-right',    top: '52%', right: '2%' }
  ];

  var DEPTHS = {
    default:     [0.3, 0.35, 0.9, 0.85, 0.4, 0.45, 0.25, 0.2],
    'edge-focus': [0.85, 0.9, 0.3, 0.35, 0.8, 0.85, 0.4, 0.45]
  };

  function ParallaxHeroImages(container, opts) {
    if (!container) return null;
    opts = opts || {};

    /* touch devices have no hover; reduce-motion users get a static frame */
    var reducedMotion = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;

    var images = (opts.images || []).slice(0, 8);
    if (!images.length) return { update: function () {}, destroy: function () {} };

    var variant = opts.variant === 'edge-focus' ? 'edge-focus' : 'default';
    var depths = DEPTHS[variant];
    var maxOffset = opts.maxOffset || 40;

    var wrap = document.createElement('div');
    wrap.setAttribute('aria-hidden', 'true');
    wrap.style.cssText =
      'position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:1';

    var items = [];
    images.forEach(function (src, index) {
      var pos = POSITIONS[index];
      var depth = depths[index];
      var delay = index * 0.12;

      var box = document.createElement('div');
      var style = 'position:absolute;top:' + pos.top + ';';
      if (pos.left) style += 'left:' + pos.left + ';';
      if (pos.right) style += 'right:' + pos.right + ';';
      style += 'will-change:transform;opacity:0;';
      box.style.cssText = style;

      var img = document.createElement('img');
      img.src = src;
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.style.cssText =
        'display:block;width:clamp(5rem,9vw,8rem);height:auto;aspect-ratio:4/3;object-fit:cover;' +
        'border-radius:0.75rem;box-shadow:0 10px 30px rgba(0,0,0,.45);' +
        'border:1px solid rgba(255,255,255,.12);opacity:.88;' +
        'transition:opacity .8s ease,filter .8s ease,transform .8s cubic-bezier(.25,.1,.25,1);' +
        'transition-delay:' + delay + 's;opacity:0;filter:blur(20px);transform:scale(.9);';

      box.appendChild(img);
      wrap.appendChild(box);

      items.push({ box: box, img: img, depth: depth, delay: delay });
    });
    container.appendChild(wrap);

    /* enter animation: next frame flips to visible (transition does the rest) */
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        items.forEach(function (it) {
          it.img.style.opacity = '0.88';
          it.img.style.filter = 'blur(0px)';
          it.img.style.transform = 'scale(1)';
        });
      });
    });

    if (reducedMotion || (global.matchMedia && global.matchMedia('(pointer:coarse)').matches)) {
      return { update: function () {}, destroy: function () { destroy(); } };
    }

    /* mouse → normalized [-1, 1], smoothed by exponential lerp */
    var targetX = 0, targetY = 0;
    var smoothX = 0, smoothY = 0;
    var raf = 0;
    var destroyed = false;

    function onMove(e) {
      targetX = (e.clientX / global.innerWidth) * 2 - 1;
      targetY = (e.clientY / global.innerHeight) * 2 - 1;
    }
    global.addEventListener('mousemove', onMove, { passive: true });

    function render() {
      if (destroyed) return;
      smoothX += (targetX - smoothX) * 0.08;
      smoothY += (targetY - smoothY) * 0.08;
      items.forEach(function (it) {
        var ox = -maxOffset * it.depth * smoothX;
        var oy = -maxOffset * it.depth * smoothY;
        it.box.style.transform = 'translate3d(' + ox.toFixed(2) + 'px,' + oy.toFixed(2) + 'px,0)';
      });
      raf = requestAnimationFrame(render);
    }

    /* visibility guard: stop when off-screen */
    var visible = true;
    var io = null;
    if (global.IntersectionObserver) {
      io = new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
        if (!visible && raf) { cancelAnimationFrame(raf); raf = 0; }
        if (visible && !raf) raf = requestAnimationFrame(render);
      }, { threshold: 0 });
      io.observe(container);
    }
    if (visible && !raf) raf = requestAnimationFrame(render);

    function destroy() {
      destroyed = true;
      if (raf) cancelAnimationFrame(raf);
      global.removeEventListener('mousemove', onMove);
      if (io) io.disconnect();
      try { container.removeChild(wrap); } catch (e) {}
    }

    return {
      update: function (next) {
        /* static port keeps a simple API for parity */
        if (next && next.maxOffset !== undefined) maxOffset = next.maxOffset;
      },
      destroy: destroy
    };
  }

  global.ParallaxHeroImages = ParallaxHeroImages;
})(window);
