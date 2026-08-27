/* ============================================================
 * ScrollExpand — vanilla port
 * ------------------------------------------------------------
 * Original component: React Bits (https://reactbits.dev/), MIT.
 * Scroll-driven frame that expands from a resting inset frame to
 * full bleed as the page (or an inner scroller) is scrolled.
 * No dependencies; the React layer is replaced by a plain factory.
 *
 * Usage:
 *   const se = ScrollExpand(document.getElementById('scrollExpand'), {
 *     src: 'img.jpg', alt: '', title: 'Built to scale',
 *     scrollHint: 'Scroll', overlayHTML: '<h2>…</h2><p>…</p>',
 *     startWidth: 42, startHeight: 58, startRadius: 24, endRadius: 0,
 *     mediaZoom: 1.35, scrollDistance: 1.2, holdDistance: 0.35,
 *     smoothing: 0.1, overlayScrim: 0.45, useWindowScroll: true
 *   });
 *   se.destroy();
 * ============================================================ */
(function (global) {
  'use strict';

  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var smoothstep = function (edge0, edge1, x) {
    var t = clamp((x - edge0) / (edge1 - edge0 || 1e-6), 0, 1);
    return t * t * (3 - 2 * t);
  };

  var DEFAULTS = {
    src: '',
    mediaType: 'image',
    poster: '',
    alt: '',
    title: '',
    scrollHint: '',
    overlayHTML: '',
    startWidth: 42,
    startHeight: 58,
    startRadius: 24,
    endRadius: 0,
    mediaZoom: 1.35,
    scrollDistance: 1.2,
    holdDistance: 0.35,
    smoothing: 0.1,
    overlayScrim: 0.45,
    useWindowScroll: false,
    enabled: true
  };

  function ScrollExpand(container, props) {
    if (!container) return null;

    var settings = {};
    for (var k in DEFAULTS) settings[k] = DEFAULTS[k];
    if (props) for (var k2 in props) if (props[k2] !== undefined) settings[k2] = props[k2];

    var reduceMotion = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* ---- build DOM ---- */
    container.classList.add('scroll-expand');
    if (!settings.useWindowScroll) container.classList.add('scroll-expand--scroller');

    var track = document.createElement('div');
    track.className = 'scroll-expand__track';
    var stage = document.createElement('div');
    stage.className = 'scroll-expand__stage';
    var frame = document.createElement('div');
    frame.className = 'scroll-expand__frame';

    var media;
    if (settings.mediaType === 'video') {
      media = document.createElement('video');
      media.className = 'scroll-expand__media';
      media.src = settings.src;
      if (settings.poster) media.poster = settings.poster;
      media.autoplay = true;
      media.muted = true;
      media.loop = true;
      media.playsInline = true;
    } else {
      media = document.createElement('img');
      media.className = 'scroll-expand__media';
      media.src = settings.src;
      media.alt = settings.alt || '';
      media.draggable = false;
    }

    var scrim = document.createElement('div');
    scrim.className = 'scroll-expand__scrim';

    frame.appendChild(media);
    frame.appendChild(scrim);

    var overlay = null;
    if (settings.overlayHTML) {
      overlay = document.createElement('div');
      overlay.className = 'scroll-expand__overlay';
      overlay.innerHTML = settings.overlayHTML;
      frame.appendChild(overlay);
    }

    stage.appendChild(frame);

    var titleEl = null;
    if (settings.title) {
      titleEl = document.createElement('div');
      titleEl.className = 'scroll-expand__title';
      titleEl.textContent = settings.title;
      stage.appendChild(titleEl);
    }

    var hintEl = null;
    if (settings.scrollHint) {
      hintEl = document.createElement('div');
      hintEl.className = 'scroll-expand__hint';
      hintEl.textContent = settings.scrollHint;
      stage.appendChild(hintEl);
    }

    track.appendChild(stage);
    container.appendChild(track);

    /* ---- animation state ---- */
    var raf = 0;
    var current = 0;
    var target = 0;
    var stageH = 0;
    var running = false;

    var applyProgress = function (p) {
      var e = smoothstep(0, 1, p);
      var w = settings.startWidth + (100 - settings.startWidth) * e;
      var h = settings.startHeight + (100 - settings.startHeight) * e;
      var ix = Math.max(0, (100 - w) / 2);
      var iy = Math.max(0, (100 - h) / 2);
      var r = settings.startRadius + (settings.endRadius - settings.startRadius) * e;
      frame.style.clipPath = 'inset(' + iy + '% ' + ix + '% ' + iy + '% ' + ix + '% round ' + r + 'px)';

      media.style.transform = 'scale(' + (settings.mediaZoom + (1 - settings.mediaZoom) * e) + ')';

      scrim.style.opacity = String(settings.overlayScrim * e);

      if (titleEl) {
        var out = smoothstep(0.4, 0.88, p);
        titleEl.style.opacity = String(1 - out);
        titleEl.style.transform = 'translate3d(0, ' + (-28 * out) + 'px, 0) scale(' + (1 + 0.06 * out) + ')';
      }

      if (hintEl) {
        var gone = smoothstep(0, 0.12, p);
        hintEl.style.opacity = String(1 - gone);
        hintEl.style.transform = 'translate3d(0, ' + (8 * gone) + 'px, 0)';
      }

      if (overlay) {
        var inn = smoothstep(0.68, 1, p);
        overlay.style.opacity = String(inn);
        overlay.style.transform = 'translate3d(0, ' + (18 * (1 - inn)) + 'px, 0)';
      }
    };

    var measure = function () {
      stageH = settings.useWindowScroll ? global.innerHeight : container.clientHeight;
      if (stageH <= 0) return;
      stage.style.height = stageH + 'px';
      track.style.height = (stageH * (1 + Math.max(0, settings.scrollDistance) + Math.max(0, settings.holdDistance))) + 'px';
      var w = container.clientWidth || stageH;
      stage.style.setProperty('--se-title-size', clamp(w * 0.075, 20, 84) + 'px');
    };

    var readProgress = function () {
      if (!settings.enabled) return 1;
      var span = stageH * Math.max(0.01, settings.scrollDistance);
      if (settings.useWindowScroll) {
        var top = track.getBoundingClientRect().top;
        return clamp(-top / span, 0, 1);
      }
      return clamp(container.scrollTop / span, 0, 1);
    };

    var tick = function () {
      var k = settings.smoothing <= 0 ? 1 : 1 - Math.exp(-1 / (60 * settings.smoothing));
      current += (target - current) * k;
      if (Math.abs(target - current) < 0.0004) {
        current = target;
        running = false;
      }
      applyProgress(current);
      raf = running ? requestAnimationFrame(tick) : 0;
    };

    var kick = function () {
      if (running) return;
      running = true;
      if (!raf) raf = requestAnimationFrame(tick);
    };

    var onScroll = function () {
      target = readProgress();
      if (settings.smoothing <= 0 || reduceMotion) {
        current = target;
        applyProgress(current);
        return;
      }
      kick();
    };

    var onResize = function () {
      measure();
      target = readProgress();
      current = target;
      applyProgress(current);
    };

    measure();
    target = readProgress();
    current = target;
    applyProgress(current);

    var scroller = settings.useWindowScroll ? global : container;
    scroller.addEventListener('scroll', onScroll, { passive: true });
    global.addEventListener('resize', onResize);
    var ro = null;
    if (global.ResizeObserver) {
      ro = new ResizeObserver(onResize);
      ro.observe(container);
    }

    var update = function (next) {
      for (var k in next) if (next[k] !== undefined && k in settings) settings[k] = next[k];
      measure();
      onResize();
    };

    var destroy = function () {
      if (raf) cancelAnimationFrame(raf);
      scroller.removeEventListener('scroll', onScroll);
      global.removeEventListener('resize', onResize);
      if (ro) ro.disconnect();
      try { container.removeChild(track); } catch (e) {}
      container.classList.remove('scroll-expand', 'scroll-expand--scroller');
    };

    return { update: update, destroy: destroy };
  }

  global.ScrollExpand = ScrollExpand;
})(window);
