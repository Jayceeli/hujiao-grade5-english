let CATALOG=null,UNITS=[],MANIFEST=null,currentUnit=0,stopAt=null,playStart=null,activeLine=null;
const $=s=>document.querySelector(s); const audio=$('#audio');
const htmlEsc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
async function init(){
  [CATALOG,MANIFEST]=await Promise.all([fetch('data/index.json').then(r=>r.json()),fetch('data/audio-sprite-manifest.json').then(r=>r.json())]);
  UNITS=await Promise.all(CATALOG.units.map(x=>fetch('data/'+x.file).then(r=>r.json())));
  const can=audio.canPlayType('audio/ogg; codecs="opus"'); $('#audioStatus').textContent=can?'Opus 原版音轨已就绪':'浏览器可能不支持 Opus，可使用句子点读';
  renderNav();renderUnit(0);
}
function renderNav(){const nav=$('#nav');nav.innerHTML='';UNITS.forEach((u,i)=>{const b=document.createElement('button');b.textContent=u.title;b.dataset.i=i;b.onclick=()=>renderUnit(i);nav.appendChild(b)});}
function stopAll(){audio.pause();stopAt=null;playStart=null;speechSynthesis.cancel();if(activeLine)activeLine.classList.remove('playing-line');activeLine=null;}
$('#stopAll').onclick=stopAll;
function loadOriginal(track,start=null,end=null,lineEl=null){
  const m=MANIFEST.tracks[track]; if(!m){speak('This section does not have a separate original audio track.');return;}
  speechSynthesis.cancel(); if(activeLine)activeLine.classList.remove('playing-line'); activeLine=lineEl||null;if(activeLine)activeLine.classList.add('playing-line');
  const absStart=m.start+(start??0), absEnd=(end==null?m.end:m.start+end); playStart=absStart;stopAt=absEnd;audio.currentTime=absStart;audio.playbackRate=parseFloat($('#speed').value)||1;
  audio.play().catch(()=>{if(lineEl)speak(lineEl.dataset.text||'');});
  $('#now').textContent=`原版音频 · ${track.replace(/^\d+_/,'')} ${start!=null?'· 逐句':''}`;
}
audio.addEventListener('timeupdate',()=>{if(stopAt!=null&&audio.currentTime>=stopAt){if($('#loop').checked&&playStart!=null){audio.currentTime=playStart;audio.play()}else{audio.pause();stopAt=null;playStart=null;if(activeLine)activeLine.classList.remove('playing-line');activeLine=null;}}});
$('#speed').onchange=e=>audio.playbackRate=parseFloat(e.target.value);
function bestVoice(){const vs=speechSynthesis.getVoices();return vs.find(v=>/^en-(GB|US|AU)/i.test(v.lang)&&/Samantha|Daniel|Karen|Google|Microsoft|English/i.test(v.name))||vs.find(v=>/^en/i.test(v.lang))||null;}
function speak(text){if(!text)return;audio.pause();stopAt=null;playStart=null;speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.lang='en-US';u.rate=0.86;const v=bestVoice();if(v)u.voice=v;speechSynthesis.speak(u);$('#now').textContent='句子点读 · '+text.slice(0,85)+(text.length>85?'…':'');}
function pieces(text){
  if(!text)return[];const out=[];for(const raw of text.split(/\n+/).map(s=>s.trim()).filter(Boolean)){
    if(raw.length<55){out.push(raw);continue}
    const parts=raw.match(/[^.!?。！？]+[.!?。！？]+|[^.!?。！？]+$/g)||[raw];parts.map(s=>s.trim()).filter(Boolean).forEach(s=>out.push(s));
  }return out;
}
function renderUnit(i){currentUnit=i;document.querySelectorAll('#nav button').forEach(b=>b.classList.toggle('active',+b.dataset.i===i));const u=UNITS[i];$('#title').textContent=u.title;$('#range').textContent=`教材 PDF 第 ${u.pageRange[0]}–${u.pageRange[1]} 页`;const root=$('#content');root.innerHTML='';u.sections.forEach(s=>root.appendChild(sectionCard(s)));window.scrollTo({top:0,behavior:'smooth'});}
function sectionCard(s){
  const wrap=document.createElement('article');wrap.className='section';
  const h=document.createElement('div');h.className='section-head';h.innerHTML=`<div><h2>${htmlEsc(s.title)}</h2><div class="sub">教材页 ${s.pages.join(', ')}</div></div>`;
  const acts=document.createElement('div');acts.className='section-actions';
  if(s.track){const b=document.createElement('button');b.className='play-btn';b.textContent='🎧 原版音频';b.onclick=()=>loadOriginal(s.track);acts.appendChild(b)}
  const t=document.createElement('button');t.className='tts-btn';t.textContent='🔊 朗读本节';t.onclick=()=>speak(s.text);acts.appendChild(t);h.appendChild(acts);wrap.appendChild(h);
  const body=document.createElement('div');body.className='section-body';if(s.note){const n=document.createElement('p');n.className='note';n.textContent=s.note;body.appendChild(n)}
  if(s.segments?.length){
    s.segments.forEach(g=>{const d=document.createElement('div');d.className='sentence precise';d.dataset.text=g.text;d.innerHTML=`<span class="speak">▶</span><span>${htmlEsc(g.text)}</span>`;d.title='点击播放教材原版逐句音频';d.onclick=()=>loadOriginal(s.track,g.start,g.end,d);body.appendChild(d)});
    const detail=document.createElement('details');detail.innerHTML='<summary class="note">展开本节其余教材文字（点击使用系统英语语音）</summary>';const box=document.createElement('div');for(const p of pieces(s.text)){const d=sentenceEl(p);box.appendChild(d)}detail.appendChild(box);body.appendChild(detail);
  }else if(s.text){for(const p of pieces(s.text))body.appendChild(sentenceEl(p));}else body.innerHTML='<div class="empty">暂无可提取文字</div>';
  wrap.appendChild(body);return wrap;
}
function sentenceEl(text){const d=document.createElement('div');d.className='sentence';d.dataset.text=text;d.innerHTML=`<span class="speak">🔊</span><span>${htmlEsc(text)}</span>`;d.title='点击句子点读';d.onclick=()=>speak(text);return d;}
$('#search').addEventListener('input',e=>{const q=e.target.value.trim().toLowerCase();if(!q){renderUnit(currentUnit);return}const root=$('#content');root.innerHTML='';UNITS.forEach(u=>u.sections.forEach(s=>{if((s.title+' '+(s.text||'')).toLowerCase().includes(q)){const c=sectionCard(s);const label=document.createElement('div');label.className='search-unit';label.textContent=u.title;c.querySelector('.section-body').prepend(label);root.appendChild(c)}}));$('#title').textContent='搜索结果';$('#range').textContent=`关键词：${q}`;});
window.speechSynthesis?.addEventListener?.('voiceschanged',()=>{});init();
