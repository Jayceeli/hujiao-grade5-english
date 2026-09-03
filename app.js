let CATALOG=null,UNITS=[],MANIFEST=null,TIMINGS=null,currentUnit=0,stopAt=null,playStart=null,activeLine=null,ORIGINAL=false;
const $=s=>document.querySelector(s); const audio=$('#audio');
const htmlEsc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#039;'}[c]));
async function init(){
  [CATALOG,MANIFEST,TIMINGS]=await Promise.all([
    fetch('data/index.json').then(r=>r.json()),
    fetch('data/audio-sprite-manifest.json').then(r=>r.json()),
    fetch('data/main-timings.json').then(r=>r.json())
  ]);
  UNITS=await Promise.all(CATALOG.units.map(x=>fetch('data/'+x.file).then(r=>r.json())));
  await probeOriginalAudio(); renderNav(); renderUnit(0);
}
async function probeOriginalAudio(){
  try{
    const r=await fetch('assets/audio-sprite.ogg',{method:'HEAD',cache:'no-store'});
    if(!r.ok) throw new Error('publisher audio missing');
    ORIGINAL=true; audio.src='assets/audio-sprite.ogg'; audio.hidden=false;
    $('#audioStatus').textContent='出版社原版音频已就绪 · 仅原版录音';
  }catch(e){
    ORIGINAL=false; audio.hidden=true;
    $('#audioStatus').textContent='出版社原版音频未加载';
  }
}
function renderNav(){const nav=$('#nav');nav.innerHTML='';UNITS.forEach((u,i)=>{const b=document.createElement('button');b.textContent=u.title;b.dataset.i=i;b.onclick=()=>renderUnit(i);nav.appendChild(b)});}
function stopAll(){audio.pause();stopAt=null;playStart=null;if(activeLine)activeLine.classList.remove('playing-line');activeLine=null;$('#now').textContent='';}
$('#stopAll').onclick=stopAll;
function loadOriginal(track,start=null,end=null,lineEl=null){
  if(!ORIGINAL)return;
  const m=MANIFEST.tracks[track]; if(!m)return;
  if(activeLine)activeLine.classList.remove('playing-line'); activeLine=lineEl||null; if(activeLine)activeLine.classList.add('playing-line');
  const absStart=m.start+(start??0),absEnd=end==null?m.end:m.start+end;
  playStart=absStart;stopAt=absEnd;audio.currentTime=absStart;audio.playbackRate=parseFloat($('#speed').value)||1;
  audio.play().catch(()=>{$('#audioStatus').textContent='当前浏览器无法播放该原版音频格式';});
  $('#now').textContent=`原版音频 · ${track.replace(/^\d+_/,'')}${start!=null?' · 逐句':''}`;
}
audio.addEventListener('timeupdate',()=>{if(stopAt!=null&&audio.currentTime>=stopAt){if($('#loop').checked&&playStart!=null){audio.currentTime=playStart;audio.play();}else{audio.pause();stopAt=null;playStart=null;if(activeLine)activeLine.classList.remove('playing-line');activeLine=null;}}});
$('#speed').onchange=e=>audio.playbackRate=parseFloat(e.target.value);
function splitSentences(text){
  if(!text)return[];const out=[];
  for(const raw of text.split(/\n+/).map(s=>s.trim()).filter(Boolean)){
    const masked=raw.replace(/a\.m\./g,'a§m§').replace(/p\.m\./g,'p§m§');
    const parts=masked.match(/.+?(?:[.!?。！？]+[”"’']?|$)(?=\s+|$)/g)||[masked];
    for(let p of parts){p=p.trim().replace(/a§m§/g,'a.m.').replace(/p§m§/g,'p.m.');if(p)out.push(p);}
  }
  return out;
}
function renderUnit(i){currentUnit=i;document.querySelectorAll('#nav button').forEach(b=>b.classList.toggle('active',+b.dataset.i===i));const u=UNITS[i];$('#title').textContent=u.title;$('#range').textContent=`教材 PDF 第 ${u.pageRange[0]}–${u.pageRange[1]} 页`;const root=$('#content');root.innerHTML='';u.sections.forEach(s=>root.appendChild(sectionCard(s)));window.scrollTo({top:0,behavior:'smooth'});}
function preciseSegments(s){
  if(s.segments?.length)return s.segments;
  const t=TIMINGS?.tracks?.[s.track]?.times;if(!t?.length)return null;
  const textParts=splitSentences(s.text).filter(x=>/[.!?。！？]/.test(x));
  return t.map((a,i)=>({text:textParts[i]||`第 ${i+1} 句`,start:a[0],end:a[1]}));
}
function sectionCard(s){
  const wrap=document.createElement('article');wrap.className='section';
  const h=document.createElement('div');h.className='section-head';h.innerHTML=`<div><h2>${htmlEsc(s.title)}</h2><div class="sub">教材页 ${s.pages.join(', ')}</div></div>`;
  const acts=document.createElement('div');acts.className='section-actions';
  if(s.track){const b=document.createElement('button');b.className='play-btn';b.textContent='🎧 播放本节原版音频';b.disabled=!ORIGINAL;b.onclick=()=>loadOriginal(s.track);acts.appendChild(b);}
  h.appendChild(acts);wrap.appendChild(h);
  const body=document.createElement('div');body.className='section-body';if(s.note){const n=document.createElement('p');n.className='note';n.textContent=s.note;body.appendChild(n);}
  const segs=preciseSegments(s);
  if(segs?.length){
    segs.forEach(g=>{const d=document.createElement('div');d.className='sentence precise';d.innerHTML=`<span class="speak">▶</span><span>${htmlEsc(g.text)}</span>`;d.title='点击播放出版社原版逐句音频';if(ORIGINAL)d.onclick=()=>loadOriginal(s.track,g.start,g.end,d);else d.style.cursor='default';body.appendChild(d);});
    const all=splitSentences(s.text);if(all.length>segs.length){const detail=document.createElement('details');detail.innerHTML='<summary class="note">展开本节其他教材文字（无非原版朗读）</summary>';const box=document.createElement('div');all.slice(segs.length).forEach(p=>box.appendChild(staticLine(p)));detail.appendChild(box);body.appendChild(detail);}
  }else if(s.text){splitSentences(s.text).forEach(p=>body.appendChild(staticLine(p)));}
  else body.innerHTML='<div class="empty">暂无可提取文字</div>';
  wrap.appendChild(body);return wrap;
}
function staticLine(text){const d=document.createElement('div');d.className='sentence';d.style.cursor='default';d.innerHTML=`<span class="speak"></span><span>${htmlEsc(text)}</span>`;return d;}
$('#search').addEventListener('input',e=>{const q=e.target.value.trim().toLowerCase();if(!q){renderUnit(currentUnit);return}const root=$('#content');root.innerHTML='';UNITS.forEach(u=>u.sections.forEach(s=>{if((s.title+' '+(s.text||'')).toLowerCase().includes(q)){const c=sectionCard(s);const label=document.createElement('div');label.className='search-unit';label.textContent=u.title;c.querySelector('.section-body').prepend(label);root.appendChild(c);}}));$('#title').textContent='搜索结果';$('#range').textContent=`关键词：${q}`;});
init();
