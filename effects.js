(() => {
  const auroraCanvas = document.getElementById('auroraCanvas');
  const glassCanvas = document.getElementById('glassNoise');
  const hero = document.querySelector('.hero');
  if (!auroraCanvas || !hero) return;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const MAX_STOPS = 5;
  const MAX_LAYERS = 3;

  const VERTEX = `#version 300 es
in vec2 aPosition;
void main(){gl_Position=vec4(aPosition,0.0,1.0);}`;

  const FRAGMENT = `#version 300 es
precision highp float;
precision highp int;
uniform vec2 uResolution;
uniform float uTime;
uniform vec3 uStops[5];
uniform int uStopCount;
uniform float uAmplitude;
uniform float uBlend;
uniform float uHeight;
uniform float uScale;
uniform float uGlow;
uniform float uBrightness;
uniform int uLayers;
uniform float uFlip;
uniform vec3 uPointer;
uniform float uReveal;
uniform float uOpacity;
uniform float uLightMode;
out vec4 outColor;

vec3 permute(vec3 x){return mod(((x*34.0)+1.0)*x,289.0);}
float snoise(vec2 v){
 const vec4 C=vec4(0.211324865405187,0.366025403784439,-0.577350269189626,0.024390243902439);
 vec2 i=floor(v+dot(v,C.yy)); vec2 x0=v-i+dot(i,C.xx);
 vec2 i1=(x0.x>x0.y)?vec2(1.0,0.0):vec2(0.0,1.0);
 vec4 x12=x0.xyxy+C.xxzz; x12.xy-=i1; i=mod(i,289.0);
 vec3 p=permute(permute(i.y+vec3(0.0,i1.y,1.0))+i.x+vec3(0.0,i1.x,1.0));
 vec3 m=max(0.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.0);
 m=m*m;m=m*m; vec3 x=2.0*fract(p*C.www)-1.0; vec3 h=abs(x)-0.5; vec3 ox=floor(x+0.5); vec3 a0=x-ox;
 m*=1.79284291400159-0.85373472095314*(a0*a0+h*h);
 vec3 g;g.x=a0.x*x0.x+h.x*x0.y;g.yz=a0.yz*x12.xz+h.yz*x12.yw;
 return 130.0*dot(m,g);
}
float smootherstep(float a,float b,float x){float t=clamp((x-a)/(b-a),0.0,1.0);return t*t*t*(t*(t*6.0-15.0)+10.0);}
vec3 oklabToLinear(vec3 c){
 float l=c.x+0.3963377774*c.y+0.2158037573*c.z;
 float m=c.x-0.1055613458*c.y-0.0638541728*c.z;
 float s=c.x-0.0894841775*c.y-1.2914855480*c.z;
 l=l*l*l;m=m*m*m;s=s*s*s;
 return vec3(4.0767416621*l-3.3077115913*m+0.2309699292*s,-1.2684380046*l+2.6097574011*m-0.3413193965*s,-0.0041960863*l-0.7034186147*m+1.7076147010*s);
}
vec3 toSrgb(vec3 c){c=clamp(c,0.0,1.0);return mix(c*12.92,1.055*pow(c,vec3(1.0/2.4))-0.055,step(0.0031308,c));}
vec3 ramp(float t){
 float x=clamp(t,0.0,1.0)*float(uStopCount-1);
 int i=int(min(floor(x),float(uStopCount-2))); float f=x-float(i); f=f*f*(3.0-2.0*f);
 vec3 lch=mix(uStops[i],uStops[i+1],f);
 return toSrgb(oklabToLinear(vec3(lch.x,lch.y*cos(lch.z),lch.y*sin(lch.z))));
}
float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
void main(){
 vec2 frag=gl_FragCoord.xy; float y=1.0-frag.y/uResolution.y; y=mix(y,1.0-y,uFlip);
 float ux=frag.x/uResolution.x; float X=(frag.x-uResolution.x*0.5)/uResolution.y; float t=uTime;
 float reach=uPointer.z*exp(-pow((X-uPointer.x)/0.38,2.0));
 vec3 glow=vec3(0.0);float cover=0.0;
 for(int k=0;k<3;k++){
  if(k>=uLayers)break;float layer=float(k);float seed=layer*13.7;float pace=t*(1.0-layer*0.18);
  float warp=snoise(vec2(X*0.45*uScale+pace*0.02+seed,pace*0.05+seed));
  float wave=snoise(vec2(X*0.75*uScale+warp*0.35-pace*0.03+seed,pace*0.07-seed))*0.72+snoise(vec2(X*1.6*uScale+warp*0.5+pace*0.04-seed,pace*0.1+seed*0.5))*0.28;
  float hem=uHeight+layer*0.07+wave*0.15*uAmplitude;hem+=reach*0.08*(layer<0.5?1.0:0.4);hem=mix(-0.25,hem,uReveal);
  float soft=(0.04+uBlend*0.16)*(1.0+layer*0.9);float rise=hem-y;float low=-soft-uGlow*0.14;float high=0.26+soft*0.6;
  float body=pow(smootherstep(low,high,rise),1.5+uGlow*0.6);
  float lobes=0.86+0.14*snoise(vec2(X*0.9*uScale-pace*0.025+seed,y*0.3+pace*0.04));
  float alpha=body*lobes*(layer<0.5?1.0:0.32/layer);
  alpha=clamp(alpha*(1.0+reach*0.25*smootherstep(0.9,0.0,abs(y-hem))),0.0,1.0);
  vec3 tint=ramp(ux+0.05*sin(pace*0.08+layer*2.3)+layer*0.1+max(rise,0.0)*0.05);
  glow=1.0-(1.0-glow)*(1.0-tint*alpha);cover=1.0-(1.0-cover)*(1.0-alpha);
 }
 float fade=smootherstep(0.0,0.7,uReveal)*uOpacity;float strength=clamp(uBrightness,0.0,2.0);
 glow*=fade*min(strength,1.0);cover*=fade*min(strength,1.0);glow=1.0-pow(1.0-glow,vec3(max(strength,1.0)));
 float dither=(hash(frag)-0.5)/255.0;outColor=vec4(glow+dither,clamp(cover+dither,0.0,1.0));
}`;

  const compile=(gl,type,source)=>{
    const shader=gl.createShader(type); if(!shader)return null;
    gl.shaderSource(shader,source);gl.compileShader(shader);
    if(gl.getShaderParameter(shader,gl.COMPILE_STATUS))return shader;
    gl.deleteShader(shader);return null;
  };
  const createProgram=(gl,fragment)=>{
    const v=compile(gl,gl.VERTEX_SHADER,VERTEX),f=compile(gl,gl.FRAGMENT_SHADER,fragment),p=gl.createProgram();
    if(!v||!f||!p)return null;
    gl.attachShader(p,v);gl.attachShader(p,f);gl.bindAttribLocation(p,0,'aPosition');gl.linkProgram(p);gl.deleteShader(v);gl.deleteShader(f);
    if(!gl.getProgramParameter(p,gl.LINK_STATUS)){gl.deleteProgram(p);return null;}
    return p;
  };

  const gl=auroraCanvas.getContext('webgl2',{alpha:true,premultipliedAlpha:true,antialias:false,depth:false,stencil:false,powerPreference:'high-performance'});
  if(!gl)return;

  const program=createProgram(gl,FRAGMENT); if(!program)return;
  const vao=gl.createVertexArray(),buffer=gl.createBuffer();
  gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);

  const U={};for(const n of ['uResolution','uTime','uStops','uStopCount','uAmplitude','uBlend','uHeight','uScale','uGlow','uBrightness','uLayers','uFlip','uPointer','uReveal','uOpacity'])U[n]=gl.getUniformLocation(program,n);

  const probe=document.createElement('canvas').getContext('2d',{willReadFrequently:true});
  const cache=new Map();
  const parse=value=>{
    if(cache.has(value))return cache.get(value);
    let rgb=[1,1,1];
    if(probe){probe.clearRect(0,0,1,1);probe.fillStyle=value;probe.fillRect(0,0,1,1);const d=probe.getImageData(0,0,1,1).data;rgb=[d[0]/255,d[1]/255,d[2]/255];}
    cache.set(value,rgb);return rgb;
  };
  const toOklch=rgb=>{
    const [r,g,b]=rgb.map(c=>c<=.04045?c/12.92:Math.pow((c+.055)/1.055,2.4));
    const l=Math.cbrt(.4122214708*r+.5363325363*g+.0514459929*b),m=Math.cbrt(.2119034982*r+.6806995451*g+.1073969566*b),s=Math.cbrt(.0883024619*r+.2817188376*g+.6299787005*b);
    const lab=[.2104542553*l+.793617785*m-.0040720468*s,1.9779984951*l-2.4285922051*m+.4505937099*s,.0259040371*l+.7827717662*m-.808675766*s];
    return [lab[0],Math.hypot(lab[1],lab[2]),Math.atan2(lab[2],lab[1])];
  };
  const stops=['#2563eb','#38bdf8','#7c3aed'].map(v=>toOklch(parse(v)));
  const palette=new Float32Array(15);
  stops.forEach((v,i)=>palette.set(v,i*3));

  const state={w:1,h:1,dpr:1,px:0,py:.5,reach:0,clock:0,reveal:reduced?1:0,raf:0};
  const pointer={x:0,y:0,inside:false};
  const resize=()=>{
    const r=hero.getBoundingClientRect();state.w=Math.max(1,r.width);state.h=Math.max(1,r.height);
    state.dpr=Math.min(window.devicePixelRatio||1,2,Math.sqrt(2.4e6/(state.w*state.h)));
    auroraCanvas.width=Math.max(1,Math.round(state.w*state.dpr));auroraCanvas.height=Math.max(1,Math.round(state.h*state.dpr));render();
  };
  const render=()=>{
    gl.viewport(0,0,auroraCanvas.width,auroraCanvas.height);gl.useProgram(program);gl.bindVertexArray(vao);
    gl.uniform2f(U.uResolution,auroraCanvas.width,auroraCanvas.height);gl.uniform1f(U.uTime,state.clock);
    gl.uniform3fv(U.uStops,palette);gl.uniform1i(U.uStopCount,3);gl.uniform1f(U.uAmplitude,.9);gl.uniform1f(U.uBlend,.55);
    gl.uniform1f(U.uHeight,.55);gl.uniform1f(U.uScale,.85);gl.uniform1f(U.uGlow,.8);gl.uniform1f(U.uBrightness,1);
    gl.uniform1i(U.uLayers,2);gl.uniform1f(U.uFlip,1);gl.uniform3f(U.uPointer,state.px,state.py,state.reach);
    gl.uniform1f(U.uReveal,1-Math.pow(1-state.reveal,3));gl.uniform1f(U.uOpacity,.78);gl.drawArrays(gl.TRIANGLES,0,3);
  };
  let last=0;
  const frame=now=>{
    const dt=last?Math.min((now-last)/1000,.05):1/60;last=now;state.clock+=dt*(reduced?.15:1);
    const engaged=!reduced&&pointer.inside;const follow=1-Math.exp(-dt/.6);
    if(engaged){state.px+=((pointer.x-state.w/2)/state.h-state.px)*follow;state.py+=(1-pointer.y/state.h-state.py)*follow;}
    state.reach+=( (engaged?1:0)-state.reach )*(1-Math.exp(-dt/(engaged?.9:1.4)));
    if(reduced)state.reveal=1;else if(state.reveal<1)state.reveal=Math.min(1,state.reveal+dt/2.4);
    render();state.raf=requestAnimationFrame(frame);
  };
  const move=e=>{const r=hero.getBoundingClientRect();pointer.x=e.clientX-r.left;pointer.y=e.clientY-r.top;pointer.inside=pointer.x>=0&&pointer.y>=0&&pointer.x<=r.width&&pointer.y<=r.height;};
  const ro=new ResizeObserver(resize);ro.observe(hero);
  window.addEventListener('pointermove',move,{passive:true});window.addEventListener('resize',resize,{passive:true});
  resize();state.raf=requestAnimationFrame(frame);

  if(glassCanvas){
    const gg=glassCanvas.getContext('2d');
    if(gg){
      let t=0;
      const glass=()=>{
        const r=glassCanvas.getBoundingClientRect(),d=Math.min(devicePixelRatio||1,2),w=Math.max(1,r.width),h=Math.max(1,r.height);
        if(glassCanvas.width!==Math.round(w*d)||glassCanvas.height!==Math.round(h*d)){glassCanvas.width=Math.round(w*d);glassCanvas.height=Math.round(h*d);}
        t+=.016;gg.clearRect(0,0,w*d,h*d);gg.fillStyle='rgba(255,255,255,.035)';
        for(let i=0;i<120;i++){const x=((i*73.17+t*4)% (w*d)),y=((i*41.37+t*2)%(h*d));gg.fillRect(x,y,1,1);}
        requestAnimationFrame(glass);
      };glass();
    }
  }

  window.addEventListener('beforeunload',()=>{cancelAnimationFrame(state.raf);ro.disconnect();gl.deleteProgram(program);gl.deleteBuffer(buffer);gl.deleteVertexArray(vao);});
})();