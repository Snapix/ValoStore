(() => {
  const canvas = document.getElementById('lightRays');
  const container = document.querySelector('.hero');
  if (!canvas || !container) return;

  const gl = canvas.getContext('webgl2', {
    alpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: 'high-performance'
  });

  if (!gl) {
    canvas.style.display = 'none';
    return;
  }

  const vertexSource = `#version 300 es
  const vec2 corners[3] = vec2[3](
    vec2(-1.0, -1.0),
    vec2(3.0, -1.0),
    vec2(-1.0, 3.0)
  );
  void main() {
    gl_Position = vec4(corners[gl_VertexID], 0.0, 1.0);
  }`;

  const fragmentSource = `#version 300 es
  precision highp float;
  uniform vec2 uResolution;
  uniform float uTime;
  uniform vec2 uSource;
  uniform vec2 uAim;
  uniform float uReach;
  out vec4 fragColor;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = p - i;
    vec2 w = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), w.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), w.x),
      w.y
    );
  }

  void main() {
    vec2 p = vec2(gl_FragCoord.x, uResolution.y - gl_FragCoord.y);
    vec2 d = p - uSource;
    float dist = length(d);
    vec2 dir = d / max(dist, 0.001);
    float angle = dot(dir, uAim);

    float depth = dist / uReach;
    float spread = pow(max(angle, 0.0), 2.0);
    float falloff = clamp(1.0 - depth * 0.92, 0.0, 1.0);
    float glow = exp(-depth * depth * 7.0) * 0.72;

    float drift = uTime * 0.22;
    float shaftsA = 0.62 + 0.22 * sin(angle * 34.0 + drift)
                         + 0.16 * cos(angle * 19.0 - drift * 0.7);
    float shaftsB = 0.68 + 0.18 * sin(angle * 22.0 - drift * 1.1)
                         + 0.14 * cos(angle * 41.0 + drift);
    float haze = 0.72 + 0.28 * noise(vec2(angle * 7.0 + drift, depth * 3.0 - drift));

    float light = (spread * (0.54 * shaftsA + 0.46 * shaftsB) * haze * falloff) + glow;
    light *= smoothstep(0.0, 0.08, angle);
    light *= 1.0 - smoothstep(0.78, 1.0, depth);

    vec3 warmWhite = vec3(1.0, 0.97, 0.91);
    vec3 coolWhite = vec3(0.86, 0.94, 1.0);
    vec3 color = mix(coolWhite, warmWhite, smoothstep(0.0, 0.75, depth));

    float alpha = clamp(light * 0.24, 0.0, 0.22);
    fragColor = vec4(color * light * 0.42, alpha);
  }`;

  function compile(type, source) {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  const vertex = compile(gl.VERTEX_SHADER, vertexSource);
  const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
  if (!vertex || !fragment) {
    canvas.style.display = 'none';
    return;
  }

  const program = gl.createProgram();
  if (!program) return;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    canvas.style.display = 'none';
    return;
  }

  const uniforms = {
    resolution: gl.getUniformLocation(program, 'uResolution'),
    time: gl.getUniformLocation(program, 'uTime'),
    source: gl.getUniformLocation(program, 'uSource'),
    aim: gl.getUniformLocation(program, 'uAim'),
    reach: gl.getUniformLocation(program, 'uReach')
  };

  const vao = gl.createVertexArray();
  const pointer = { x: 0.5, y: 0.38, seen: false };
  const aim = { x: 0.5, y: 1.0 };
  let width = 1;
  let height = 1;
  let ratio = 1;
  let start = performance.now();
  let raf = 0;
  let visible = true;

  function resize() {
    const rect = container.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
  }

  function frame(now) {
    raf = 0;
    if (!visible) return;

    const t = (now - start) / 1000;
    const followX = pointer.seen ? pointer.x : 0.5;
    const followY = pointer.seen ? pointer.y : 0.55;
    const targetX = followX * 2 - 1;
    const targetY = 1 - followY * 2;

    aim.x += (targetX - aim.x) * 0.035;
    aim.y += (targetY - aim.y) * 0.035;

    const len = Math.hypot(aim.x, aim.y) || 1;
    const dx = aim.x / len;
    const dy = aim.y / len;

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);
    gl.bindVertexArray(vao);

    gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
    gl.uniform1f(uniforms.time, t);
    gl.uniform2f(uniforms.source, width * 0.5 * ratio, -height * 0.08 * ratio);
    gl.uniform2f(uniforms.aim, dx, dy);
    gl.uniform1f(uniforms.reach, Math.max(width, height) * ratio);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
    raf = requestAnimationFrame(frame);
  }

  function move(event) {
    const rect = container.getBoundingClientRect();
    pointer.x = (event.clientX - rect.left) / Math.max(1, rect.width);
    pointer.y = (event.clientY - rect.top) / Math.max(1, rect.height);
    pointer.seen = true;
  }

  const observer = new ResizeObserver(resize);
  observer.observe(container);

  const intersection = new IntersectionObserver(entries => {
    visible = entries.some(entry => entry.isIntersecting);
    if (visible && !raf) raf = requestAnimationFrame(frame);
  });
  intersection.observe(container);

  window.addEventListener('pointermove', move, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && visible && !raf) {
      raf = requestAnimationFrame(frame);
    }
  });

  resize();
  raf = requestAnimationFrame(frame);
})();