const state={query:''};
let apps=[];
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sourceOrder={WinGet:0,'F-Droid':1,Flathub:2};
const platformName={windows:'Windows',android:'Android',linux:'Linux'};
const sourcePlatform={WinGet:'Windows','F-Droid':'Android',Flathub:'Linux'};

function norm(s){return String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()}
function groupedResults(q){
  const query=norm(q);
  if(!query)return [];
  const terms=query.split(' ').filter(Boolean);
  const scored=apps.map(a=>{
    const hay=norm([a.name,a.appId,a.summary,a.description,a.developer,a.source,...(a.categories||[]),...(a.keywords||[])].join(' '));
    const n=norm(a.name);
    let score=0;
    if(n===query)score+=1000;
    if(n.startsWith(query))score+=500;
    if(n.includes(query))score+=250;
    for(const t of terms)if(hay.includes(t))score+=35;
    if(!score)return null;
    return {a,score};
  }).filter(Boolean);
  const groups=new Map();
  for(const {a,score} of scored){
    const key=norm(a.name);
    if(!groups.has(key))groups.set(key,{name:a.name,score:0,records:[]});
    const g=groups.get(key);
    g.score=Math.max(g.score,score);
    if(!g.records.some(x=>x.id===a.id))g.records.push(a);
  }
  return [...groups.values()].sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name));
}

function iconFor(a,small=false){
  if(a?.icon)return '<img loading="lazy" src="'+esc(a.icon)+'" alt="" referrerpolicy="no-referrer" onerror="this.parentElement.innerHTML=\'<span class="icon-fallback">'+esc((a.name||'?').slice(0,1).toUpperCase())+'</span>\">';
  return '<span class="icon-fallback">'+esc((a?.name||'?').slice(0,1).toUpperCase())+'</span>';
}
function sourceLabel(a){
  return '<a class="source" href="'+esc(a.upstream||'#')+'" target="_blank" rel="noreferrer"><i></i><span>'+esc(a.source)+'</span><span class="platform">'+esc(sourcePlatform[a.source]||platformName[a.platform]||a.platform||'')+'</span></a>';
}
function render(){
  const groups=groupedResults(state.query);
  const results=$('#results');
  const list=$('#resultList');
  if(!state.query.trim()){results.classList.remove('visible');list.innerHTML='';$('#detail').classList.remove('open');return}
  results.classList.add('visible');
  $('#resultTitle').textContent=groups.length?'Software':'No software found';
  $('#resultCount').textContent=groups.length?(groups.length+' match'+(groups.length===1?'':'es')):'';
  if(!groups.length){
    list.innerHTML='<div class="empty"><strong>No matching software</strong>Try the app name, package ID, or developer.</div>';
    $('#detail').classList.remove('open');
    return;
  }
  list.innerHTML=groups.map((g,i)=>{
    const primary=g.records[0];
    const records=[...g.records].sort((a,b)=>(sourceOrder[a.source]??9)-(sourceOrder[b.source]??9));
    const ids=records.map(a=>a.appId).filter(Boolean).join(' · ');
    return '<article class="result" tabindex="0" role="button" data-group="'+i+'"><div class="icon">'+iconFor(primary)+'</div><div><div class="name">'+esc(g.name)+'</div><div class="summary">'+esc(primary.summary||primary.description||'Software available through upstream catalogues.')+'</div><div class="ids">'+esc(ids)+'</div></div><div class="sources">'+records.map(sourceLabel).join('')+'</div></article>';
  }).join('');
  document.querySelectorAll('.result').forEach((el,i)=>{
    el.onclick=e=>{if(e.target.closest('a'))return;openGroup(groups[i])};
    el.onkeydown=e=>{if((e.key==='Enter'||e.key===' ')&&!e.target.closest('a')){e.preventDefault();openGroup(groups[i])}};
  });
}

function openGroup(group){
  const records=[...group.records].sort((a,b)=>(sourceOrder[a.source]??9)-(sourceOrder[b.source]??9));
  const primary=records[0];
  $('#detail').innerHTML='<div class="detail-top"><div class="detail-icon">'+iconFor(primary,true)+'</div><div class="detail-title"><h2>'+esc(group.name)+'</h2><p>'+esc(primary.summary||primary.description||'Software from upstream catalogues.')+'</p></div></div><div class="detail-sources">'+records.map(a=>{
    const command=a.install?.command;
    const open=a.upstream||a.install?.url||'#';
    const install=command?'<code class="install">'+esc(command)+'</code>':'<span class="install none">Open upstream catalogue to install</span>';
    return '<div class="detail-source"><strong>'+esc(a.source)+'</strong><small>'+esc(sourcePlatform[a.source]||platformName[a.platform]||a.platform||'')+' · '+esc(a.appId||'Package ID unavailable')+'</small>'+install+'<div class="detail-actions"><a class="action" href="'+esc(open)+'" target="_blank" rel="noreferrer">Open '+esc(a.source)+' ↗</a>'+(a.homepage?'<a class="action" href="'+esc(a.homepage)+'" target="_blank" rel="noreferrer">Website ↗</a>':'')+'</div></div>';
  }).join('')+'</div>';
  $('#detail').classList.add('open');
  $('#detail').scrollIntoView({behavior:'smooth',block:'start'});
}

async function boot(){
  try{
    const r=await fetch('./data/catalog.json',{cache:'no-store'});
    if(!r.ok)throw new Error(String(r.status));
    const data=await r.json();
    apps=Array.isArray(data.apps)?data.apps:[];
  }catch(e){
    apps=[];
    $('#resultTitle').textContent='Catalogue unavailable';
    $('#resultCount').textContent='';
  }
}
$('#search').addEventListener('input',e=>{state.query=e.target.value;render()});
document.addEventListener('keydown',e=>{
  if(e.key==='/'&&document.activeElement!==$('#search')){e.preventDefault();$('#search').focus()}
  if(e.key==='Escape'){$('#search').value='';state.query='';render();$('#search').blur()}
});
boot();
