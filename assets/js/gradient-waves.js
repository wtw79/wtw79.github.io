/* ============================================================
 * GradientWaves — vanilla WebGL2 port
 * ------------------------------------------------------------
 * Original component: React Bits (https://reactbits.dev/), MIT.
 * Shader is the original GLSL, unmodified. The React + ogl layers
 * are replaced by a minimal native WebGL2 pipeline so the effect
 * runs on any static page with zero dependencies.
 *
 * Usage:
 *   const waves = GradientWaves(document.getElementById('el'), {
 *     horizonColor:'#2C465E', waveColor:'#3A5A78', crestColor:'#A8CCE8',
 *     speed:0.4, amplitude:2.5, waveScale:0.6, waveRatio:0.9,
 *     swell:35, turbulence:20, tilt:1.11, zoom:1.0, height:5.5,
 *     fogDepth:15, detail:'medium', brightness:1.0, opacity:1.0,
 *     mouseInteraction:true, parallaxStrength:0.5,
 *     grain:true, grainIntensity:0.05
 *   });
 *   waves.update({ speed: 0.6 });   // live prop change
 *   waves.destroy();                // full teardown
 * ============================================================ */
(function (global) {
  'use strict';

  /* ---------- helpers ---------- */
  var hexToRgb = function (hex) {
    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return [1, 1, 1];
    return [
      parseInt(result[1], 16) / 255,
      parseInt(result[2], 16) / 255,
      parseInt(result[3], 16) / 255
    ];
  };

  var detailToSteps = function (detail) {
    if (detail === 'low') return 40.0;
    if (detail === 'high') return 110.0;
    return 70.0;
  };

  /* ---------- GLSL ---------- */
  var vertexSrc = [
    '#version 300 es',
    'in vec2 position;',
    'void main() {',
    '  gl_Position = vec4(position, 0.0, 1.0);',
    '}'
  ].join('\n');

  var fragmentSrc = [
    '#version 300 es',
    'precision highp float;',
    'uniform vec2 iResolution;',
    'uniform float iTime;',
    'uniform float uSpeed;',
    'uniform float uAmplitude;',
    'uniform float uWaveScale;',
    'uniform float uWaveRatio;',
    'uniform float uSwell;',
    'uniform float uTurbulence;',
    'uniform float uTilt;',
    'uniform float uZoom;',
    'uniform float uHeight;',
    'uniform float uFogDepth;',
    'uniform float uSteps;',
    'uniform float uBrightness;',
    'uniform float uOpacity;',
    'uniform float uGrain;',
    'uniform float uGrainIntensity;',
    'uniform vec2 uMouse;',
    'uniform float uParallax;',
    'uniform bool uEnableMouse;',
    'uniform vec3 uHorizonColor;',
    'uniform vec3 uWaveColor;',
    'uniform vec3 uCrestColor;',
    'out vec4 fragColor;',
    '',
    'const float MAX_DIST = 20000.0;',
    '',
    'float hash21(vec2 p) {',
    '  vec3 p3 = fract(vec3(p.xyx) * 0.1031);',
    '  p3 += dot(p3, p3.yzx + 33.33);',
    '  return fract((p3.x + p3.y) * p3.z);',
    '}',
    '',
    'float plasma(vec3 r, vec2 freq, vec4 tc) {',
    '  float mx = r.x + tc.x;',
    '  mx += uSwell * sin((r.y + mx) / 20.0 + tc.y);',
    '  float my = r.y - tc.z;',
    '  my += uTurbulence * cos(r.x / 23.0 + tc.w);',
    '  return r.z - (sin(mx * freq.x) * uAmplitude + sin(my * freq.y) * uAmplitude + uHeight);',
    '}',
    '',
    'float raymarch(vec3 pos, vec3 dir, vec2 freq, vec4 tc) {',
    '  float dist = 0.0;',
    '  for (int i = 0; i < 128; i++) {',
    '    if (float(i) >= uSteps) break;',
    '    float dscene = plasma(pos + dist * dir, freq, tc);',
    '    if (abs(dscene) < 0.1) break;',
    '    dist += 0.9 * dscene;',
    '    if (!(abs(dist) < MAX_DIST)) return MAX_DIST;',
    '  }',
    '  return dist;',
    '}',
    '',
    'void main() {',
    '  float T = iTime * uSpeed;',
    '  vec2 freq = vec2(uWaveScale / 7.0, (uWaveScale * uWaveRatio) / 3.0);',
    '  vec4 tc = vec4(T / 0.130, T / 0.810, T / 0.200, T / 0.710);',
    '  float c, s;',
    '  float vfov = (3.14159 / 2.3) / max(uZoom, 0.05);',
    '  vec3 cam = vec3(0.0, 0.0, 30.0);',
    '  vec2 uv = (gl_FragCoord.xy / iResolution.xy) - 0.5;',
    '  uv.x *= iResolution.x / iResolution.y;',
    '  uv.y *= -1.0;',
    '',
    '  vec3 dir = vec3(0.0, 0.0, -1.0);',
    '  float ulen = length(uv);',
    '  float xrot = vfov * ulen;',
    '  c = cos(xrot); s = sin(xrot);',
    '  dir = mat3(1.0, 0.0, 0.0, 0.0, c, -s, 0.0, s, c) * dir;',
    '  vec2 nuv = ulen > 1e-5 ? uv / ulen : vec2(1.0, 0.0);',
    '  c = nuv.x; s = nuv.y;',
    '  dir = mat3(c, -s, 0.0, s, c, 0.0, 0.0, 0.0, 1.0) * dir;',
    '  c = cos(uTilt); s = sin(uTilt);',
    '  dir = mat3(c, 0.0, s, 0.0, 1.0, 0.0, -s, 0.0, c) * dir;',
    '',
    '  if (uEnableMouse) {',
    '    float yaw = (uMouse.x - 0.5) * uParallax * 0.4;',
    '    float pitch = (uMouse.y - 0.5) * uParallax * 0.4;',
    '    c = cos(yaw); s = sin(yaw);',
    '    dir = mat3(c, 0.0, s, 0.0, 1.0, 0.0, -s, 0.0, c) * dir;',
    '    c = cos(pitch); s = sin(pitch);',
    '    dir = mat3(1.0, 0.0, 0.0, 0.0, c, -s, 0.0, s, c) * dir;',
    '  }',
    '',
    '  float dist = raymarch(cam, dir, freq, tc);',
    '  vec3 pos = cam + dist * dir;',
    '',
    '  float t = clamp(uFogDepth / max(dist, 0.001), 0.0, 1.0);',
    '  vec3 body = mix(uWaveColor, uCrestColor, clamp(pos.z * 0.08 + 0.5, 0.0, 1.0));',
    '  vec3 col = mix(uHorizonColor, body, t);',
    '  col *= uBrightness;',
    '  col = clamp(col, 0.0, 1.0);',
    '',
    '  float alpha = clamp(t, 0.0, 1.0) * uOpacity;',
    '  if (uGrain > 0.5) {',
    '    float g = hash21(gl_FragCoord.xy + mod(iTime, 64.0) * 11.0);',
    '    alpha += (g - 0.5) * uGrainIntensity;',
    '  }',
    '  alpha = clamp(alpha, 0.0, 1.0);',
    '  fragColor = vec4(col * alpha, alpha);',
    '}'
  ].join('\n');

  var DEFAULTS = {
    horizonColor: '#5227FF',
    waveColor: '#FF9FFC',
    crestColor: '#FFFFFF',
    speed: 0.4,
    amplitude: 2.5,
    waveScale: 0.6,
    waveRatio: 0.9,
    swell: 35,
    turbulence: 20,
    tilt: 1.11,
    zoom: 1.0,
    height: 5.5,
    fogDepth: 15,
    detail: 'medium',
    brightness: 1.0,
    opacity: 1.0,
    mouseInteraction: true,
    parallaxStrength: 0.5,
    grain: true,
    grainIntensity: 0.05
  };

  /* ---------- component ---------- */
  function GradientWaves(container, props) {
    if (!container) return null;

    var settings = {};
    for (var k in DEFAULTS) settings[k] = DEFAULTS[k];
    if (props) for (var k2 in props) if (props[k2] !== undefined) settings[k2] = props[k2];

    var canvas = document.createElement('canvas');
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    container.appendChild(canvas);

    var gl = canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      powerPreference: 'high-performance'
    });

    if (!gl) {
      canvas.remove();
      return { update: function () {}, destroy: function () {} };
    }

    gl.clearColor(0, 0, 0, 0);

    /* compile + link */
    function compile(type, src) {
      var sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        if (global.console && console.warn) console.warn('GradientWaves shader error:', gl.getShaderInfoLog(sh));
      }
      return sh;
    }
    var vs = compile(gl.VERTEX_SHADER, vertexSrc);
    var fs = compile(gl.FRAGMENT_SHADER, fragmentSrc);
    var program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.useProgram(program);

    /* fullscreen triangle */
    var vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var posLoc = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    /* uniform locations */
    var names = [
      'iTime', 'iResolution',
      'uSpeed', 'uAmplitude', 'uWaveScale', 'uWaveRatio',
      'uSwell', 'uTurbulence', 'uTilt', 'uZoom', 'uHeight', 'uFogDepth',
      'uSteps', 'uBrightness', 'uOpacity', 'uGrain', 'uGrainIntensity',
      'uMouse', 'uParallax', 'uEnableMouse',
      'uHorizonColor', 'uWaveColor', 'uCrestColor'
    ];
    var U = {};
    names.forEach(function (n) { U[n] = gl.getUniformLocation(program, n); });

    var res = new Float32Array([1, 1]);
    var mouse = new Float32Array([0.5, 0.5]);
    var targetMouse = [0.5, 0.5];
    var enableMouse = settings.mouseInteraction;

    var applyUniforms = function () {
      gl.uniform1f(U.iTime, time);
      gl.uniform2fv(U.iResolution, res);
      gl.uniform1f(U.uSpeed, settings.speed);
      gl.uniform1f(U.uAmplitude, settings.amplitude);
      gl.uniform1f(U.uWaveScale, settings.waveScale);
      gl.uniform1f(U.uWaveRatio, settings.waveRatio);
      gl.uniform1f(U.uSwell, settings.swell);
      gl.uniform1f(U.uTurbulence, settings.turbulence);
      gl.uniform1f(U.uTilt, settings.tilt);
      gl.uniform1f(U.uZoom, settings.zoom);
      gl.uniform1f(U.uHeight, settings.height);
      gl.uniform1f(U.uFogDepth, settings.fogDepth);
      gl.uniform1f(U.uSteps, detailToSteps(settings.detail));
      gl.uniform1f(U.uBrightness, settings.brightness);
      gl.uniform1f(U.uOpacity, settings.opacity);
      gl.uniform1f(U.uGrain, settings.grain ? 1.0 : 0.0);
      gl.uniform1f(U.uGrainIntensity, settings.grainIntensity);
      gl.uniform2fv(U.uMouse, mouse);
      gl.uniform1f(U.uParallax, settings.parallaxStrength);
      gl.uniform1i(U.uEnableMouse, enableMouse ? 1 : 0);
      var h = hexToRgb(settings.horizonColor);
      var w = hexToRgb(settings.waveColor);
      var c = hexToRgb(settings.crestColor);
      gl.uniform3f(U.uHorizonColor, h[0], h[1], h[2]);
      gl.uniform3f(U.uWaveColor, w[0], w[1], w[2]);
      gl.uniform3f(U.uCrestColor, c[0], c[1], c[2]);
    };

    var time = 0;
    var dpr = Math.min(global.devicePixelRatio || 1, 2);

    var render = function () {
      gl.viewport(0, 0, canvas.width, canvas.height);
      applyUniforms();
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    var setSize = function () {
      var rect = container.getBoundingClientRect();
      var w = Math.max(1, Math.floor(rect.width));
      var h = Math.max(1, Math.floor(rect.height));
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      res[0] = canvas.width;
      res[1] = canvas.height;
      render();
    };

    var ro = null;
    if (global.ResizeObserver) {
      ro = new ResizeObserver(setSize);
      ro.observe(container);
    }
    setSize();

    /* pointer parallax */
    var onPointerMove = function (e) {
      var rect = canvas.getBoundingClientRect();
      targetMouse[0] = (e.clientX - rect.left) / rect.width;
      targetMouse[1] = 1.0 - (e.clientY - rect.top) / rect.height;
    };
    var onPointerLeave = function () {
      targetMouse[0] = 0.5;
      targetMouse[1] = 0.5;
    };
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerleave', onPointerLeave);

    /* animation loop + visibility guards */
    var reducedMotion = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var raf = 0;
    var isVisible = true;
    var isPageVisible = !document.hidden;
    var t0 = performance.now();

    var loop = function (t) {
      time = (t - t0) * 0.001;
      var tx = enableMouse ? targetMouse[0] : 0.5;
      var ty = enableMouse ? targetMouse[1] : 0.5;
      mouse[0] += 0.05 * (tx - mouse[0]);
      mouse[1] += 0.05 * (ty - mouse[1]);
      render();
      raf = requestAnimationFrame(loop);
    };

    var tryStart = function () {
      if (isVisible && isPageVisible && raf === 0 && !reducedMotion) raf = requestAnimationFrame(loop);
    };
    var tryStop = function () {
      if (raf !== 0) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    };

    var io = null;
    if (global.IntersectionObserver) {
      io = new IntersectionObserver(
        function (entries) {
          isVisible = entries[0].isIntersecting;
          isVisible ? tryStart() : tryStop();
        },
        { threshold: 0 }
      );
      io.observe(container);
    }

    var onVisibility = function () {
      isPageVisible = !document.hidden;
      isPageVisible ? tryStart() : tryStop();
    };
    document.addEventListener('visibilitychange', onVisibility);

    tryStart();

    /* public API */
    var update = function (next) {
      for (var k in next) if (next[k] !== undefined && k in settings) settings[k] = next[k];
      enableMouse = settings.mouseInteraction;
      render();
    };

    var destroy = function () {
      tryStop();
      if (ro) ro.disconnect();
      if (io) io.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      try {
        container.removeChild(canvas);
      } catch (e) {}
      gl.getExtension('WEBGL_lose_context') && gl.getExtension('WEBGL_lose_context').loseContext();
    };

    return { update: update, destroy: destroy };
  }

  global.GradientWaves = GradientWaves;
})(window);
