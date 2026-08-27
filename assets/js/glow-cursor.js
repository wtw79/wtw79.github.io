/* ============================================================
 * GlowCursor — vanilla WebGL port
 * ------------------------------------------------------------
 * Original component: React Bits (https://reactbits.dev/), MIT.
 * Shader is the original GLSL, unmodified. The React + ogl layers
 * are replaced by a minimal native WebGL1/2 pipeline so the effect
 * runs on any static page with zero dependencies.
 *
 * Usage (attach to a full-viewport fixed layer, e.g. #glowCursorWrap):
 *   const cursor = GlowCursor(document.getElementById('glowCursorWrap'), {
 *     color:'#67E8F9', secondaryColor:'#A78BFA',
 *     trailLength:40, trailWidth:3, trailTaper:0.8, followSpeed:0.16,
 *     glowIntensity:1.2, glowSpread:0.8, hotspot:0.6, brightness:1.0,
 *     opacity:0.9, pulseSpeed:1.1, noiseStrength:0.03,
 *     idleFade:true, idleTimeout:700, fadeDuration:900,
 *     blendMode:'screen'
 *   });
 *   cursor.update({ trailWidth: 4 });
 *   cursor.destroy();
 * ============================================================ */
(function (global) {
  'use strict';

  var MAX_POINTS = 64;

  var VERTEX_SHADER = [
    'attribute vec2 position;',
    'attribute vec2 uv;',
    'varying vec2 vUv;',
    '',
    'void main() {',
    '  vUv = uv;',
    '  gl_Position = vec4(position, 0.0, 1.0);',
    '}'
  ].join('\n');

  var FRAGMENT_SHADER = [
    'precision highp float;',
    '',
    '#define MAX_POINTS 64',
    '',
    'uniform vec2 uResolution;',
    'uniform vec2 uPoints[MAX_POINTS];',
    'uniform float uPointCount;',
    'uniform vec3 uColor;',
    'uniform vec3 uSecondaryColor;',
    'uniform float uTrailWidth;',
    'uniform float uTaper;',
    'uniform float uGlowIntensity;',
    'uniform float uGlowSpread;',
    'uniform float uHotspot;',
    'uniform float uBrightness;',
    'uniform float uOpacity;',
    'uniform float uPulseSpeed;',
    'uniform float uNoiseStrength;',
    'uniform float uTime;',
    'uniform float uFade;',
    '',
    'varying vec2 vUv;',
    '',
    'float sRGB(float x) {',
    '  if (x <= 0.00031308) return 12.92 * x;',
    '  return 1.055 * pow(x, 1.0 / 2.4) - 0.055;',
    '}',
    '',
    'float hash(vec2 p) {',
    '  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);',
    '}',
    '',
    'float filmGrain(vec2 p, float time) {',
    '  float frame = time * 18.0;',
    '  float frameIndex = mod(floor(frame), 256.0);',
    '  float nextFrameIndex = mod(frameIndex + 1.0, 256.0);',
    '  float blend = fract(frame);',
    '  blend = blend * blend * (3.0 - 2.0 * blend);',
    '  vec2 pixel = floor(p);',
    '  float current = hash(pixel + vec2(frameIndex * 17.0, frameIndex * 31.0));',
    '  float next = hash(pixel + vec2(nextFrameIndex * 17.0, nextFrameIndex * 31.0));',
    '  return mix(current, next, blend) * 2.0 - 1.0;',
    '}',
    '',
    'void main() {',
    '  vec2 pixel = vUv * uResolution;',
    '  float denominator = max(uPointCount - 1.0, 1.0);',
    '  float strongest = 0.0;',
    '  float strongestCore = 0.0;',
    '  float colorWeight = 0.0;',
    '  vec3 colorSum = vec3(0.0);',
    '',
    '  for (int i = 0; i < MAX_POINTS - 1; i++) {',
    '    float index = float(i);',
    '    float active = 1.0 - step(uPointCount - 1.0, index);',
    '    vec2 start = uPoints[i];',
    '    vec2 end = uPoints[i + 1];',
    '    vec2 toPixel = pixel - start;',
    '    vec2 segment = end - start;',
    '    float along = clamp(dot(toPixel, segment) / max(dot(segment, segment), 0.0001), 0.0, 1.0);',
    '    float progress = clamp((index + along) / denominator, 0.0, 1.0);',
    '    float life = pow(max(1.0 - progress, 0.0), mix(0.55, 1.25, uTaper));',
    '    float width = uTrailWidth * mix(1.0, 0.25, pow(progress, mix(0.55, 1.6, uTaper)));',
    '    float distanceToTrail = length(toPixel - segment * along);',
    '    float falloff = max(width * (0.8 + uGlowSpread * 1.4), 0.5);',
    '    float beam = min(1.0, (falloff * falloff) / (distanceToTrail * distanceToTrail + falloff * falloff));',
    '    float core = exp(-pow(distanceToTrail / max(width, 0.5), 2.0) * 2.5);',
    '    float pulseAmount = min(abs(uPulseSpeed), 1.0);',
    '    float pulse = 1.0 + sin(uTime * uPulseSpeed * 3.0 - progress * 11.0) * 0.16 * pulseAmount;',
    '    float intensity = (core + beam * uGlowIntensity * 0.55) * life * pulse * active;',
    '    vec3 segmentColor = mix(uColor, uSecondaryColor, progress);',
    '',
    '    strongest = max(strongest, intensity);',
    '    strongestCore = max(strongestCore, core * life * active);',
    '    colorSum += segmentColor * intensity;',
    '    colorWeight += intensity;',
    '  }',
    '',
    '  float grain = filmGrain(pixel, uTime);',
    '  float noiseAmount = (1.0 - exp(-uNoiseStrength * 2.2)) * 0.4;',
    '  float alpha = clamp(strongest * uOpacity * uFade, 0.0, 1.0);',
    '  if (alpha < 0.0005) discard;',
    '',
    '  vec3 color = colorSum / max(colorWeight, 0.0001);',
    '  color = mix(color, vec3(1.0), smoothstep(0.25, 0.95, strongestCore) * uHotspot);',
    '  float luminance = sRGB(clamp(strongest * uBrightness, 0.0, 1.0));',
    '  luminance *= 1.0 + grain * noiseAmount;',
    '  gl_FragColor = vec4(color * luminance, alpha);',
    '}'
  ].join('\n');

  var hexToRgb = function (hex) {
    var value = (hex || '').replace('#', '').trim();
    if (value.length === 3) {
      value = value.split('').map(function (c) { return c + c; }).join('');
    }
    var parsed = parseInt(value || '000000', 16);
    return [((parsed >> 16) & 255) / 255, ((parsed >> 8) & 255) / 255, (parsed & 255) / 255];
  };

  var clamp = function (value, min, max) { return Math.min(Math.max(value, min), max); };

  var DEFAULTS = {
    color: '#67E8F9',
    secondaryColor: '#A78BFA',
    trailLength: 40,
    trailWidth: 3,
    trailTaper: 0.8,
    followSpeed: 0.16,
    glowIntensity: 1.2,
    glowSpread: 0.8,
    hotspot: 0.6,
    brightness: 1.0,
    opacity: 0.9,
    pulseSpeed: 1.1,
    noiseStrength: 0.03,
    idleFade: true,
    idleTimeout: 700,
    fadeDuration: 900,
    blendMode: 'screen',
    enabled: true
  };

  function GlowCursor(container, props) {
    if (!container) return null;

    var settings = {};
    for (var k in DEFAULTS) settings[k] = DEFAULTS[k];
    if (props) for (var k2 in props) if (props[k2] !== undefined) settings[k2] = props[k2];

    /* touch devices have no hover cursor; reduce-motion users get no light trail */
    if (global.matchMedia && global.matchMedia('(pointer:coarse)').matches) return { update: function () {}, destroy: function () {} };
    if (global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches) return { update: function () {}, destroy: function () {} };

    var canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    canvas.style.mixBlendMode = settings.blendMode;
    container.appendChild(canvas);

    var gl = canvas.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: true }) ||
             canvas.getContext('webgl2', { alpha: true, antialias: false, premultipliedAlpha: true });

    if (!gl) {
      canvas.remove();
      return { update: function () {}, destroy: function () {} };
    }
    gl.clearColor(0, 0, 0, 0);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);

    function compile(type, src) {
      var sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS) && global.console && console.warn) {
        console.warn('GlowCursor shader error:', gl.getShaderInfoLog(sh));
      }
      return sh;
    }
    var vs = compile(gl.VERTEX_SHADER, VERTEX_SHADER);
    var fs = compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    var program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.useProgram(program);

    var posBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var posLoc = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    var uvBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 2, 0, 0, 2]), gl.STATIC_DRAW);
    var uvLoc = gl.getAttribLocation(program, 'uv');
    gl.enableVertexAttribArray(uvLoc);
    gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 0, 0);

    var U = {};
    [
      'uResolution', 'uPoints', 'uPointCount', 'uColor', 'uSecondaryColor',
      'uTrailWidth', 'uTaper', 'uGlowIntensity', 'uGlowSpread', 'uHotspot',
      'uBrightness', 'uOpacity', 'uPulseSpeed', 'uNoiseStrength', 'uTime', 'uFade'
    ].forEach(function (n) { U[n] = gl.getUniformLocation(program, n); });

    var pointData = new Float32Array(MAX_POINTS * 2);
    var points = [];
    for (var i = 0; i < MAX_POINTS; i++) points.push({ x: 0, y: 0 });
    var target = { x: 0, y: 0 };
    var head = { x: 0, y: 0 };

    var width = 1, height = 1;
    var initialized = false;
    var pointerInside = false;
    var fade = 0;
    var lastInputTime = performance.now();
    var lastFrameTime = performance.now();
    var raf = 0;
    var destroyed = false;

    function resize() {
      width = Math.max(container.clientWidth || global.innerWidth, 1);
      height = Math.max(container.clientHeight || global.innerHeight, 1);
      var dpr = Math.min(global.devicePixelRatio || 1, settings.maxDevicePixelRatio || 1.5);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
      var res = U.uResolution;
      if (res) gl.uniform2f(res, canvas.width, canvas.height);
    }

    function initializeTrail(x, y) {
      target.x = x; target.y = y;
      head.x = x; head.y = y;
      for (var i = 0; i < MAX_POINTS; i++) { points[i].x = x; points[i].y = y; }
      initialized = true;
      fade = 1;
    }

    function updatePointer(e) {
      var x = clamp(e.clientX, 0, width);
      var y = clamp(height - e.clientY, 0, height);
      if (!initialized) initializeTrail(x, y);
      target.x = x; target.y = y;
      pointerInside = true;
      lastInputTime = performance.now();
    }

    function onPointerLeave() {
      pointerInside = false;
      lastInputTime = performance.now();
    }

    function render(now) {
      if (destroyed) return;
      var delta = Math.min((now - lastFrameTime) / 16.667, 3);
      lastFrameTime = now;

      if (initialized) {
        var headEase = 1 - Math.pow(1 - clamp(settings.followSpeed, 0.01, 0.99), delta);
        var chainBase = clamp(0.28 + settings.followSpeed * 0.35, 0.08, 0.92);
        var chainEase = 1 - Math.pow(1 - chainBase, delta);
        head.x += (target.x - head.x) * headEase;
        head.y += (target.y - head.y) * headEase;
        points[0].x = head.x; points[0].y = head.y;
        for (var i = 1; i < MAX_POINTS; i++) {
          points[i].x += (points[i - 1].x - points[i].x) * chainEase;
          points[i].y += (points[i - 1].y - points[i].y) * chainEase;
        }
        for (var j = 0; j < MAX_POINTS; j++) {
          pointData[j * 2] = points[j].x;
          pointData[j * 2 + 1] = points[j].y;
        }
      }

      var idleFor = now - lastInputTime;
      var shouldFade = settings.idleFade && (!pointerInside || idleFor > settings.idleTimeout);
      var fadeStep = (16.667 * delta) / Math.max(settings.fadeDuration, 16);
      var fadeTarget = initialized && settings.enabled && !shouldFade ? 1 : 0;
      fade += (fadeTarget - fade) * Math.min(1, fadeStep * 7);

      gl.uniform1f(U.uPointCount, clamp(Math.round(settings.trailLength), 2, MAX_POINTS));
      var c1 = hexToRgb(settings.color), c2 = hexToRgb(settings.secondaryColor);
      gl.uniform3f(U.uColor, c1[0], c1[1], c1[2]);
      gl.uniform3f(U.uSecondaryColor, c2[0], c2[1], c2[2]);
      gl.uniform1f(U.uTrailWidth, Math.max(settings.trailWidth, 0.1));
      gl.uniform1f(U.uTaper, clamp(settings.trailTaper, 0, 1));
      gl.uniform1f(U.uGlowIntensity, Math.max(settings.glowIntensity, 0));
      gl.uniform1f(U.uGlowSpread, Math.max(settings.glowSpread, 0));
      gl.uniform1f(U.uHotspot, clamp(settings.hotspot, 0, 1));
      gl.uniform1f(U.uBrightness, Math.max(settings.brightness, 0));
      gl.uniform1f(U.uOpacity, clamp(settings.opacity, 0, 1));
      gl.uniform1f(U.uPulseSpeed, settings.pulseSpeed);
      gl.uniform1f(U.uNoiseStrength, clamp(settings.noiseStrength, 0, 1));
      gl.uniform1f(U.uTime, now * 0.001);
      gl.uniform1f(U.uFade, fade);
      if (U.uPoints) gl.uniform2fv(U.uPoints, pointData);

      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!destroyed) raf = requestAnimationFrame(render);
    }

    var ro = null;
    if (global.ResizeObserver) {
      ro = new ResizeObserver(resize);
      ro.observe(container);
    }
    resize();

    global.addEventListener('pointermove', updatePointer, { passive: true });
    global.addEventListener('pointerdown', updatePointer, { passive: true });
    document.documentElement.addEventListener('mouseleave', onPointerLeave);

    raf = requestAnimationFrame(render);

    var update = function (next) {
      for (var k in next) if (next[k] !== undefined && k in settings) settings[k] = next[k];
      canvas.style.mixBlendMode = settings.blendMode;
    };

    var destroy = function () {
      destroyed = true;
      if (raf) cancelAnimationFrame(raf);
      if (ro) ro.disconnect();
      global.removeEventListener('pointermove', updatePointer);
      global.removeEventListener('pointerdown', updatePointer);
      document.documentElement.removeEventListener('mouseleave', onPointerLeave);
      try { container.removeChild(canvas); } catch (e) {}
      gl.getExtension('WEBGL_lose_context') && gl.getExtension('WEBGL_lose_context').loseContext();
    };

    return { update: update, destroy: destroy };
  }

  global.GlowCursor = GlowCursor;
})(window);
