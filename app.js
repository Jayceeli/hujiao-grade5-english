let CATALOG=null,UNITS=[],MANIFEST=null,POINTMAP=null,currentUnit=0;
let stopAt=null,playStart=null,activeLine=null,ORIGINAL=false,monitorId=null,boundaryGuard=0;
let pointItems=[],activePointIndex=-1;
let sequenceItems=[],sequencePos=-1,sequenceMode=false;
const $=s=>document.querySelector(s); const audio=$('#audio');
const htmlEsc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#039;'}[c]));

async function init(){
  try{
    const [catalog,manifest,pointIndex]=await Promise.all([
      fetch('data/index.json',{cache:'no-store'}).then(r=>r.json()),
      fetch('data/audio-sprite-manifest.json',{cache:'no-store'}).then(r=>r.json()),
      fetch('data/point-v3/index.json',{cache:'no-store'}).then(r=>r.json())
    ]);
    CATALOG=catalog; MANIFEST=manifest;
    const pointFiles=await Promise.all(pointIndex.files.map(f=>fetch('data/'+f,{cache:'no-store'}).then(r=>r.json())));
    POINTMAP={version:pointIndex.version||3,tracks:Object.assign({},...pointFiles.map(x=>x.tracks||{}))};
    UNITS=await Promise.all(CATALOG.units.map(x=>fetch('data/'+x.file,{cache:'no-store'}).then(r=>r.json())));
    await probeOriginalAudio();
    renderNav(); renderUnit(0);
    const n=Object.values(POINTMAP?.tracks||{}).reduce((sum,t)=>sum+(t.segments?.length||0),0)+22;
    if(ORIGINAL)$('#audioStatus').textContent=`出版社原版音频已就绪 · 精校点读 · ${n} 个原音段`;
  }catch(e){
    console.error(e); $('#audioStatus').textContent='教材数据加载失败，请刷新页面';
  }
}

async function probeOriginalAudio(){
  try{
    const r=await fetch('assets/audio-sprite.ogg',{method:'HEAD',cache:'no-store'});
    if(!r.ok)throw new Error('publisher audio missing');
    ORIGINAL=true; audio.src='assets/audio-sprite.ogg'; audio.preload='auto'; audio.hidden=true; audio.load();
    await new Promise(resolve=>{
      if(audio.readyState>=1){resolve();return;}
      let settled=false;
      const done=()=>{if(settled)return;settled=true;audio.removeEventListener('loadedmetadata',done);resolve();};
      audio.addEventListener('loadedmetadata',done,{once:true});
      setTimeout(done,3000);
    });
  }catch(e){
    ORIGINAL=false; audio.hidden=true; $('#audioStatus').textContent='出版社原版音频未加载';
  }
}

function renderNav(){
  const nav=$('#nav'); nav.innerHTML='';
  UNITS.forEach((u,i)=>{const b=document.createElement('button');b.textContent=u.title;b.dataset.i=i;b.onclick=()=>renderUnit(i);nav.appendChild(b)});
}

function clearActive(){if(activeLine)activeLine.classList.remove('playing-line');activeLine=null;}
function clearMonitor(){if(monitorId){cancelAnimationFrame(monitorId);monitorId=null;}}
function resetSequence(){sequenceMode=false;sequenceItems=[];sequencePos=-1;}
function stopAll(){
  audio.pause(); stopAt=null; playStart=null; boundaryGuard=0; clearMonitor(); clearActive(); resetSequence();
  $('#now').textContent='点击带 ▶ 的教材句子播放原版录音';
}
$('#stopAll').onclick=stopAll;

function ensureMonitor(){
  if(monitorId)return;
  const tick=()=>{monitorId=requestAnimationFrame(tick);checkBoundary();};
  monitorId=requestAnimationFrame(tick);
}
function checkBoundary(){
  if(stopAt==null||audio.paused||performance.now()<boundaryGuard)return;
  if(audio.currentTime>=stopAt-0.018){
    if(sequenceMode){
      if(sequencePos<sequenceItems.length-1){
        sequencePos++;
        cuePoint(sequenceItems[sequencePos],true);
      }else{
        audio.pause(); stopAt=null; playStart=null; clearMonitor(); clearActive(); resetSequence();
        $('#now').textContent='本节精校课文播放完成';
      }
      return;
    }
    if($('#loop').checked&&playStart!=null){
      boundaryGuard=performance.now()+120;
      audio.currentTime=playStart;
      audio.play().catch(()=>{});
    }else{
      audio.pause(); stopAt=null; playStart=null; clearMonitor(); clearActive();
    }
  }
}
audio.addEventListener('timeupdate',checkBoundary);
audio.addEventListener('play',ensureMonitor);
audio.addEventListener('pause',()=>{if(stopAt==null)clearMonitor();});
$('#speed').onchange=e=>audio.playbackRate=parseFloat(e.target.value)||1;

function loadOriginal(track,start=null,end=null,lineEl=null,label='',keepSequence=false){
  if(!ORIGINAL)return;
  if(!keepSequence)resetSequence();
  const m=MANIFEST?.tracks?.[track]; if(!m)return;
  clearActive(); activeLine=lineEl||null; if(activeLine)activeLine.classList.add('playing-line');
  const absStart=m.start+(start??0),absEnd=end==null?m.end:m.start+end;
  playStart=absStart; stopAt=absEnd; boundaryGuard=performance.now()+80;
  audio.pause();
  try{audio.currentTime=absStart;}catch(e){}
  audio.playbackRate=parseFloat($('#speed').value)||1;
  audio.play().then(ensureMonitor).catch(()=>{$('#audioStatus').textContent='请再次点击句子以播放原版音频';});
  const name=label||track.replace(/^\d+_/,'');
  $('#now').textContent=`原版点读 · ${name}`;
}

function cuePoint(p,keepPlaying=false){
  if(!p||!ORIGINAL)return;
  const m=MANIFEST?.tracks?.[p.track]; if(!m)return;
  clearActive(); activeLine=p.el||null; if(activeLine)activeLine.classList.add('playing-line');
  activePointIndex=p.globalIndex; updatePointNav();
  playStart=m.start+p.start; stopAt=m.start+p.end; boundaryGuard=performance.now()+80;
  audio.playbackRate=parseFloat($('#speed').value)||1;
  try{audio.currentTime=playStart;}catch(e){}
  $('#now').textContent=`原版点读 · ${p.text}`;
  if(!keepPlaying||audio.paused)audio.play().then(ensureMonitor).catch(()=>{$('#audioStatus').textContent='请再次点击句子以播放原版音频';});
}

function playSequence(items){
  if(!items?.length||!ORIGINAL)return;
  sequenceItems=items; sequencePos=0; sequenceMode=true;
  cuePoint(sequenceItems[0],false);
}

function splitSentences(text){
  if(!text)return[]; const out=[];
  for(const raw of text.split(/\n+/).map(s=>s.trim()).filter(Boolean)){
    const masked=raw.replace(/a\.m\./g,'a§m§').replace(/p\.m\./g,'p§m§');
    const parts=masked.match(/.+?(?:[.!?。！？]+[”"’']?|$)(?=\s+|$)/g)||[masked];
    for(let p of parts){p=p.trim().replace(/a§m§/g,'a.m.').replace(/p§m§/g,'p.m.');if(p)out.push(p);}
  }
  return out;
}

function pointRow(s){return POINTMAP?.tracks?.[s.track]||null;}
function pointSegments(s){
  if(s.segments?.length)return s.segments;
  const row=pointRow(s);
  if(row?.segments?.length)return row.segments;
  return null;
}

function setActivePoint(index){activePointIndex=index;updatePointNav();}
function updatePointNav(){
  const prev=$('#prevPoint'),rep=$('#repeatPoint'),next=$('#nextPoint');
  if(!prev||!rep||!next)return;
  prev.disabled=activePointIndex<=0; rep.disabled=activePointIndex<0; next.disabled=activePointIndex<0||activePointIndex>=pointItems.length-1;
}
function playPoint(index){
  const p=pointItems[index]; if(!p)return; resetSequence(); setActivePoint(index); cuePoint(p,false);
  p.el?.scrollIntoView?.({block:'nearest',behavior:'smooth'});
}
$('#prevPoint').onclick=()=>playPoint(activePointIndex-1);
$('#repeatPoint').onclick=()=>playPoint(activePointIndex);
$('#nextPoint').onclick=()=>playPoint(activePointIndex+1);

function renderUnit(i){
  stopAll(); currentUnit=i; pointItems=[]; activePointIndex=-1; resetSequence(); updatePointNav();
  document.querySelectorAll('#nav button').forEach(b=>b.classList.toggle('active',+b.dataset.i===i));
  const u=UNITS[i]; $('#title').textContent=u.title; $('#range').textContent=`教材 PDF 第 ${u.pageRange[0]}–${u.pageRange[1]} 页`;
  const root=$('#content');root.innerHTML='';u.sections.forEach(s=>root.appendChild(sectionCard(s)));window.scrollTo({top:0,behavior:'smooth'});
}

function sectionCard(s){
  const wrap=document.createElement('article');wrap.className='section';
  const row=pointRow(s); const segs=pointSegments(s); const isV3=!!row?.segments; const sectionPoints=[];
  const displayOnly=row?.displayOnly||[];
  const h=document.createElement('div');h.className='section-head';h.innerHTML=`<div><h2>${htmlEsc(s.title)}</h2><div class="sub">教材页 ${s.pages.join(', ')}</div></div>`;
  const acts=document.createElement('div');acts.className='section-actions';
  if(s.track){
    const b=document.createElement('button');b.className='play-btn';b.disabled=!ORIGINAL;
    if(segs?.length){b.textContent='▶ 连续播放精校课文';b.onclick=()=>playSequence(sectionPoints);}
    else{b.textContent='🎧 播放本节原版音频';b.onclick=()=>loadOriginal(s.track,null,null,b,s.title);}
    acts.appendChild(b);
  }
  h.appendChild(acts);wrap.appendChild(h);
  const body=document.createElement('div');body.className='section-body';
  if(s.note){const n=document.createElement('p');n.className='note';n.textContent=s.note;body.appendChild(n);}

  if(segs?.length){
    const badge=document.createElement('p');badge.className='note';
    badge.textContent=isV3?'精校点读：点击带 ▶ 的句子只播放对应出版社原版录音；顶部按钮可连续播放已精校正文。':'人工精校点读：点击只播放该句出版社原版录音；顶部按钮可连续播放精校正文。';
    body.appendChild(badge);
    segs.forEach((g,idx)=>{
      const d=document.createElement('div');d.className='sentence precise';d.tabIndex=0;d.setAttribute('role','button');
      d.innerHTML=`<span class="speak">▶</span><span><b>${idx+1}.</b> ${htmlEsc(g.text)}</span>`;
      d.title='点击播放出版社原版点读音频';
      const globalIndex=pointItems.length; const item={track:s.track,start:g.start,end:g.end,text:g.text,el:d,globalIndex};
      pointItems.push(item); sectionPoints.push(item);
      const play=()=>{resetSequence();setActivePoint(globalIndex);cuePoint(item,false)};
      if(ORIGINAL){d.onclick=play;d.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();play();}}}else d.style.cursor='default';
      body.appendChild(d);
    });
    if(displayOnly.length){
      const n=document.createElement('p');n.className='note';n.textContent=row?.displayOnlyNote||'以下教材文字暂未绑定原版逐句音频。';body.appendChild(n);
      displayOnly.forEach(t=>body.appendChild(staticLine(t,true)));
    }
  }else if(s.text){splitSentences(s.text).forEach(p=>body.appendChild(staticLine(p)));}
  else body.innerHTML='<div class="empty">暂无可提取文字</div>';
  wrap.appendChild(body);return wrap;
}
function staticLine(text,unmapped=false){const d=document.createElement('div');d.className='sentence static-line'+(unmapped?' unmapped-line':'');d.innerHTML=`<span class="speak">${unmapped?'—':''}</span><span>${htmlEsc(text)}</span>`;return d;}

$('#search').addEventListener('input',e=>{
  stopAll();pointItems=[];activePointIndex=-1;resetSequence();updatePointNav();
  const q=e.target.value.trim().toLowerCase(); if(!q){renderUnit(currentUnit);return}
  const root=$('#content');root.innerHTML='';let count=0;
  UNITS.forEach(u=>u.sections.forEach(s=>{const row=pointRow(s);const pointText=(pointSegments(s)||[]).map(x=>x.text).join(' ')+' '+(row?.displayOnly||[]).join(' ');if((s.title+' '+(s.text||'')+' '+pointText).toLowerCase().includes(q)){const c=sectionCard(s);const label=document.createElement('div');label.className='search-unit';label.textContent=u.title;c.querySelector('.section-body').prepend(label);root.appendChild(c);count++;}}));
  $('#title').textContent='搜索结果';$('#range').textContent=`关键词：${q} · ${count} 个栏目`;
});
init();