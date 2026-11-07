(() => {
  const rayCanvas = document.getElementById('lightRays');
  const glassCanvas = document.getElementById('glassNoise');
  const hero = document.querySelector('.hero');
  if (!rayCanvas || !hero) return;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function setupWebGL(canvas, fragmentSource) {
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance'
    });
    if (!gl) return null;
    const vertexSource = `#version 300 es
const vec2 corners[3] = vec2[3](vec2(-1.0,-1.0),vec2(3.0,-1.0),vec2(-1.0,3.0));
void main(){gl_Position=vec4(corners[gl_VertexID],0.0,1.0);}`;
    const compile = (type, source) => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };
    const v = compile(gl.VERTEX_SHADER, vertexSource);
    const f = compile(gl.FRAGMENT_SHADER, fragmentSource);
    if (!v || !f) return null;
    const program = gl.createProgram();
    if (!program) return null;
    gl.attachShader(program,v); gl.attachShader(program,f); gl.linkProgram(program);
    gl.deleteShader(v); gl.deleteShader(f);
    if (!gl.getProgramParameter(program,gl.LINK_STATUS)) return null;
    const vao=gl.createVertexArray();
    return {gl,program,vao,loc:name=>gl.getUniformLocation(program,name)};
  }

  const ray = setupWebGL(rayCanvas,`#version 300 es
precision highp float;
uniform vec2 uResolution;
uniform float uTime;
uniform vec2 uSource;
uniform vec2 uAim;
uniform float uReach;
uniform float uSpread;
uniform float uGlow;
uniform float uHaze;
uniform float uIntensity;
out vec4 fragColor;
float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);vec2 w=f*f*f*(f*(f*6.0-15.0)+10.0);return mix(mix(hash(i),hash(i+vec2(1,0)),w.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),w.x),w.y);}
void main(){
  vec2 coord=vec2(gl_FragCoord.x,uResolution.y-gl_FragCoord.y);
  vec2 d=coord-uSource; float dist=length(d); vec2 dir=d/max(dist,.0001);
  float ca=dot(dir,uAim); float depth=dist/uReach;
  float spread=pow(max(ca,0.0),1.0/max(uSpread,.05));
  float fall=clamp(1.0-depth*0.92,0.0,1.0);
  float source=exp(-depth*depth*8.0)*uGlow;
  float haze=.7+.3*noise(vec2(ca*8.0+uTime*.035,depth*3.2-uTime*.08));
  float shafts=.62+.20*sin(ca*36.0+uTime*1.1)+.16*cos(ca*19.0-uTime*.7);
  float shafts2=.64+.18*sin(ca*22.0-uTime*.8)+.14*cos(ca*43.0+uTime);
  float light=(spread*(.52*shafts+.48*shafts2)*mix(1.0,haze,uHaze)*fall+source);
  light*=smoothstep(-.02,.12,ca);
  light*=1.0-smoothstep(.72,1.05,depth);
  vec3 tint=mix(vec3(.72,.84,1.0),vec3(1.0,.94,.82),smoothstep(0.0,.9,depth));
  float a=clamp(light*.42*uIntensity,0.0,.42);
  fragColor=vec4(tint*light*.72,a);
}`);

  const glass = glassCanvas ? setupWebGL(glassCanvas,`#version 300 es
precision highp float;
uniform vec2 uResolution;
uniform float uTime;
uniform vec2 uPointer;
out vec4 fragColor;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
void main(){
  vec2 uv=gl_FragCoord.xy/uResolution;
  float edge=min(min(uv.x,1.-uv.x),min(uv.y,1.-uv.y));
  float top=exp(-pow((uv.y-.08)*5.0,2.0));
  float pointer=exp(-length(uv-uPointer)*8.0);
  float grain=(hash(gl_FragCoord.xy+uTime*.02)-.5)*.025;
  float sheen=.16*top+.08*pointer;
  fragColor=vec4(vec3(.92,.96,1.0)*(sheen+grain),.18*sheen+.035);
}`) : null;

  const instances=[ray,glass].filter(Boolean);
  if (!ray) { rayCanvas.style.display='none'; return; }

  const state={w:1,h:1,dpr:1,px:.5,py:.35,aimX:0,aimY:1,raf:0,visible:true,start:performance.now()};
  const resize=()=>{
    const rect=hero.getBoundingClientRect();
    state.w=Math.max(1,rect.width); state.h=Math.max(1,rect.height);
    state.dpr=Math.min(window.devicePixelRatio||1,1.5,Math.sqrt(2.4e6/(state.w*state.h)));
    for(const item of instances){
      const c=item===ray?rayCanvas:glassCanvas;
      c.width=Math.max(1,Math.round(state.w*state.dpr));
      c.height=Math.max(1,Math.round(state.h*state.dpr));
    }
  };
  const move=e=>{
    const r=hero.getBoundingClientRect();
    state.px=Math.max(0,Math.min(1,(e.clientX-r.left)/Math.max(1,r.width)));
    state.py=Math.max(0,Math.min(1,(e.clientY-r.top)/Math.max(1,r.height)));
  };
  const frame=now=>{
    state.raf=0;
    if(!state.visible)return;
    const t=(now-state.start)/1000;
    const tx=state.px*2-1, ty=1-state.py*2;
    state.aimX+=(tx-state.aimX)*.045; state.aimY+=(ty-state.aimY)*.045;
    const len=Math.hypot(state.aimX,state.aimY)||1;
    const dx=state.aimX/len,dy=state.aimY/len;
    const gl=ray.gl;
    gl.viewport(0,0,rayCanvas.width,rayCanvas.height);
    gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT); gl.useProgram(ray.program); gl.bindVertexArray(ray.vao);
    gl.uniform2f(ray.loc('uResolution'),rayCanvas.width,rayCanvas.height);
    gl.uniform1f(ray.loc('uTime'),t*(reduced?.35:1));
    gl.uniform2f(ray.loc('uSource'),state.w*.5*state.dpr,-state.h*.14*state.dpr);
    gl.uniform2f(ray.loc('uAim'),dx,dy);
    gl.uniform1f(ray.loc('uReach'),Math.max(state.w,state.h)*state.dpr*1.15);
    gl.uniform1f(ray.loc('uSpread'),.52); gl.uniform1f(ray.loc('uGlow'),.8); gl.uniform1f(ray.loc('uHaze'),.32); gl.uniform1f(ray.loc('uIntensity'),.95);
    gl.drawArrays(gl.TRIANGLES,0,3);

    if(glass){
      const g=glass.gl;
      g.viewport(0,0,glassCanvas.width,glassCanvas.height); g.clearColor(0,0,0,0); g.clear(g.COLOR_BUFFER_BIT); g.useProgram(glass.program); g.bindVertexArray(glass.vao);
      g.uniform2f(glass.loc('uResolution'),glassCanvas.width,glassCanvas.height);
      g.uniform1f(glass.loc('uTime'),t); g.uniform2f(glass.loc('uPointer'),state.px,state.py); g.drawArrays(g.TRIANGLES,0,3);
    }
    if(!reduced || Math.abs(dx-state.aimX)>.0005) state.raf=requestAnimationFrame(frame);
    else state.raf=requestAnimationFrame(frame);
  };

  const ro=new ResizeObserver(resize); ro.observe(hero);
  window.addEventListener('pointermove',move,{passive:true});
  resize(); state.raf=requestAnimationFrame(frame);
  window.addEventListener('resize',resize,{passive:true});
})();