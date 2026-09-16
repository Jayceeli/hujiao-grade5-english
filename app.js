let CATALOG=null,UNITS=[],MANIFEST=null,POINTMAP=null,POINT_INDEX=null,currentUnit=0,currentView='point';
let stopAt=null,playStart=null,activeLine=null,ORIGINAL=false,monitorId=null,boundaryGuard=0;
let pointItems=[],activePointIndex=-1,sequenceItems=[],sequencePos=-1,sequenceMode=false;
let dictWords=[],dictQueue=[],dictIndex=0,dictStage=0,dictStarted=false;
const CORE_CACHE='hujiao-grade5-core-v5';
const MEDIA_CACHE='hujiao-grade5-media-v1';
const $=s=>document.querySelector(s); const audio=$('#audio');
const htmlEsc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));

async function init(){
  registerSW();
  bindStaticEvents();
  try{
    const [catalog,manifest,pointIndex]=await Promise.all([
      fetch('data/index.json',{cache:'no-store'}).then(r=>r.json()),
      fetch('data/audio-sprite-manifest.json',{cache:'no-store'}).then(r=>r.json()),
      fetch('data/point-v3/index.json',{cache:'no-store'}).then(r=>r.json())
    ]);
    CATALOG=catalog; MANIFEST=manifest; POINT_INDEX=pointIndex;
    const pointFiles=await Promise.all(pointIndex.files.map(f=>fetch('data/'+f,{cache:'no-store'}).then(r=>r.json())));
    POINTMAP={version:pointIndex.version||4,tracks:Object.assign({},...pointFiles.map(x=>x.tracks||{}))};
    UNITS=await Promise.all(CATALOG.units.map(x=>fetch('data/'+x.file,{cache:'no-store'}).then(r=>r.json())));
    await probeOriginalAudio();
    renderNav(); renderUnit(0); updateOfflineStatus();
    const n=Object.values(POINTMAP?.tracks||{}).reduce((sum,t)=>sum+(t.segments?.length||0),0)+22;
    if(ORIGINAL)$('#audioStatus').textContent=`出版社原版音频已就绪 · ${n} 个精校点读段`;
  }catch(e){
    console.error(e); $('#audioStatus').textContent='教材数据加载失败，请刷新页面';
  }
}

function registerSW(){
  if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(console.warn);
}

function bindStaticEvents(){
  $('#stopAll').onclick=stopAll;
  $('#speed').onchange=e=>audio.playbackRate=parseFloat(e.target.value)||1;
  $('#prevPoint').onclick=()=>playPoint(activePointIndex-1);
  $('#repeatPoint').onclick=()=>playPoint(activePointIndex);
  $('#nextPoint').onclick=()=>playPoint(activePointIndex+1);
  document.querySelectorAll('.view-tab').forEach(b=>b.onclick=()=>setView(b.dataset.view));
  $('#search').addEventListener('input',handleSearch);
  $('#notesSearch').addEventListener('input',()=>highlightNotes($('#notesSearch').value));
  $('#notesFontDown').onclick=()=>adjustNotesFont(-10);
  $('#notesFontUp').onclick=()=>adjustNotesFont(10);
  $('#myNote').addEventListener('input',saveMyNote);
  $('#dictStart').onclick=()=>startDictation($('#dictScope').value);
  $('#dictRestart').onclick=()=>startDictation($('#dictScope').value);
  $('#dictCard').onclick=dictationCardClick;
  $('#offlineDownload').onclick=downloadOffline;
  $('#offlineClear').onclick=clearOffline;
}

async function probeOriginalAudio(){
  try{
    const r=await fetch('assets/audio-sprite.ogg',{method:'HEAD',cache:'no-store'});
    if(!r.ok)throw new Error('publisher audio missing');
    ORIGINAL=true; audio.src='assets/audio-sprite.ogg'; audio.preload='auto'; audio.hidden=true; audio.load();
    await new Promise(resolve=>{
      if(audio.readyState>=1){resolve();return;}
      const done=()=>resolve(); audio.addEventListener('loadedmetadata',done,{once:true}); setTimeout(done,3000);
    });
  }catch(e){ORIGINAL=false;audio.hidden=true;$('#audioStatus').textContent='出版社原版音频未加载';}
}

function renderNav(){
  const nav=$('#nav');nav.innerHTML='';
  UNITS.forEach((u,i)=>{const b=document.createElement('button');b.textContent=u.title;b.dataset.i=i;b.onclick=()=>renderUnit(i);nav.appendChild(b)});
}
function setView(view){
  currentView=view; stopAll();
  document.querySelectorAll('.view-tab').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
  ['point','notes','dictation','offline'].forEach(v=>{$('#view-'+v).hidden=v!==view});
  $('#playerBox').hidden=view!=='point';
  $('#search').hidden=view!=='point';
  if(view==='notes')renderNotes();
  if(view==='dictation')renderDictation();
  if(view==='offline')updateOfflineStatus();
}
function renderUnit(i){
  stopAll(); currentUnit=i; pointItems=[]; activePointIndex=-1; resetSequence(); updatePointNav();
  document.querySelectorAll('#nav button').forEach(b=>b.classList.toggle('active',+b.dataset.i===i));
  const u=UNITS[i]; $('#title').textContent=u.title; $('#range').textContent=`教材 PDF 第 ${u.pageRange[0]}–${u.pageRange[1]} 页`;
  renderPoint(); renderNotes(); renderDictation();
  if(currentView==='point')window.scrollTo({top:0,behavior:'smooth'});
}

function clearActive(){if(activeLine)activeLine.classList.remove('playing-line');activeLine=null;}
function clearMonitor(){if(monitorId){cancelAnimationFrame(monitorId);monitorId=null;}}
function resetSequence(){sequenceMode=false;sequenceItems=[];sequencePos=-1;}
function stopAll(){
  audio.pause();stopAt=null;playStart=null;boundaryGuard=0;clearMonitor();clearActive();resetSequence();
  if($('#now'))$('#now').textContent='点击带 ▶ 的精校正文播放原版录音';
}
function ensureMonitor(){if(monitorId)return;const tick=()=>{monitorId=requestAnimationFrame(tick);checkBoundary()};monitorId=requestAnimationFrame(tick)}
function checkBoundary(){
  if(stopAt==null||audio.paused||performance.now()<boundaryGuard)return;
  if(audio.currentTime>=stopAt-0.018){
    if(sequenceMode){
      if(sequencePos<sequenceItems.length-1){sequencePos++;cuePoint(sequenceItems[sequencePos],true)}
      else{audio.pause();stopAt=null;playStart=null;clearMonitor();clearActive();resetSequence();$('#now').textContent='本节精校正文播放完成'}
      return;
    }
    if($('#loop').checked&&playStart!=null){boundaryGuard=performance.now()+120;audio.currentTime=playStart;audio.play().catch(()=>{})}
    else{audio.pause();stopAt=null;playStart=null;clearMonitor();clearActive()}
  }
}
audio.addEventListener('timeupdate',checkBoundary);audio.addEventListener('play',ensureMonitor);audio.addEventListener('pause',()=>{if(stopAt==null)clearMonitor()});

function loadOriginal(track,start=null,end=null,lineEl=null,label='',keepSequence=false){
  if(!ORIGINAL)return;if(!keepSequence)resetSequence();const m=MANIFEST?.tracks?.[track];if(!m)return;
  clearActive();activeLine=lineEl||null;if(activeLine)activeLine.classList.add('playing-line');
  const absStart=m.start+(start??0),absEnd=end==null?m.end:m.start+end;playStart=absStart;stopAt=absEnd;boundaryGuard=performance.now()+80;
  audio.pause();try{audio.currentTime=absStart}catch(e){}audio.playbackRate=parseFloat($('#speed').value)||1;
  audio.play().then(ensureMonitor).catch(()=>{$('#audioStatus').textContent='请再次点击以播放原版音频'});
  $('#now').textContent=`原版朗读 · ${label||track.replace(/^\d+_/,'')}`;
}
function cuePoint(p,keepPlaying=false){
  if(!p||!ORIGINAL)return;const m=MANIFEST?.tracks?.[p.track];if(!m)return;
  clearActive();activeLine=p.el||null;if(activeLine)activeLine.classList.add('playing-line');activePointIndex=p.globalIndex;updatePointNav();
  playStart=m.start+p.start;stopAt=m.start+p.end;boundaryGuard=performance.now()+80;audio.playbackRate=parseFloat($('#speed').value)||1;
  try{audio.currentTime=playStart}catch(e){}$('#now').textContent=`原版点读 · ${p.text}`;
  if(!keepPlaying||audio.paused)audio.play().then(ensureMonitor).catch(()=>{$('#audioStatus').textContent='请再次点击句子以播放原版音频'});
}
function playSequence(items){if(!items?.length||!ORIGINAL)return;sequenceItems=items;sequencePos=0;sequenceMode=true;cuePoint(sequenceItems[0],false)}
function pointRow(s){return POINTMAP?.tracks?.[s.track]||null}
function pointSegments(s){if(s.segments?.length)return s.segments;const row=pointRow(s);return row?.segments?.length?row.segments:null}
function setActivePoint(index){activePointIndex=index;updatePointNav()}
function updatePointNav(){const p=$('#prevPoint'),r=$('#repeatPoint'),n=$('#nextPoint');if(!p)return;p.disabled=activePointIndex<=0;r.disabled=activePointIndex<0;n.disabled=activePointIndex<0||activePointIndex>=pointItems.length-1}
function playPoint(index){const p=pointItems[index];if(!p)return;resetSequence();setActivePoint(index);cuePoint(p,false);p.el?.scrollIntoView?.({block:'nearest',behavior:'smooth'})}

function renderPoint(filter=''){
  const root=$('#content');if(!root)return;root.innerHTML='';pointItems=[];activePointIndex=-1;updatePointNav();
  const q=filter.trim().toLowerCase();let count=0;
  const units=q?UNITS:[UNITS[currentUnit]];
  units.forEach(u=>u.sections.forEach(s=>{
    const segs=pointSegments(s);const hay=(s.title+' '+(s.text||'')+' '+(segs||[]).map(x=>x.text).join(' ')).toLowerCase();
    if(q&&!hay.includes(q))return;
    root.appendChild(sectionCard(s,u,q));count++;
  }));
  if(q){$('#title').textContent='搜索结果';$('#range').textContent=`关键词：${filter} · ${count} 个栏目`}
}
function sectionCard(s,u,searchMode=false){
  const wrap=document.createElement('article');wrap.className='section';
  const segs=pointSegments(s);const refined=!!segs?.length;const sectionPoints=[];
  const h=document.createElement('div');h.className='section-head';
  h.innerHTML=`<div>${searchMode?`<div class="search-unit">${htmlEsc(u.title)}</div>`:''}<h2>${htmlEsc(s.title)}</h2><div class="sub">教材页 ${s.pages.join(', ')}</div></div>`;
  const acts=document.createElement('div');acts.className='section-actions';
  if(refined){
    const b=document.createElement('button');b.className='play-btn';b.disabled=!ORIGINAL;b.textContent='▶ 连续播放精校正文';b.onclick=()=>playSequence(sectionPoints);acts.appendChild(b);
  }else if(s.track){
    const b=document.createElement('button');b.className='play-btn secondary';b.disabled=!ORIGINAL;b.textContent='🎧 播放本节原版音频';b.onclick=()=>loadOriginal(s.track,null,null,b,s.title);acts.appendChild(b);
  }else{
    const b=document.createElement('button');b.className='play-btn secondary';b.disabled=true;b.textContent='无独立原版音轨';acts.appendChild(b);
  }
  h.appendChild(acts);wrap.appendChild(h);
  if(refined){
    const body=document.createElement('div');body.className='section-body';
    const badge=document.createElement('p');badge.className='note';badge.textContent='精校正文：点击带 ▶ 的句子只播放对应出版社原版录音。';body.appendChild(badge);
    segs.forEach((g,idx)=>{
      const d=document.createElement('div');d.className='sentence precise';d.tabIndex=0;d.setAttribute('role','button');d.innerHTML=`<span class="speak">▶</span><span><b>${idx+1}.</b> ${htmlEsc(g.text)}</span>`;
      const globalIndex=pointItems.length,item={track:s.track,start:g.start,end:g.end,text:g.text,el:d,globalIndex};pointItems.push(item);sectionPoints.push(item);
      const play=()=>{resetSequence();setActivePoint(globalIndex);cuePoint(item,false)};
      if(ORIGINAL){d.onclick=play;d.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();play()}}}
      body.appendChild(d);
    });
    wrap.appendChild(body);
  }
  return wrap;
}
function handleSearch(e){
  const q=e.target.value.trim();
  if(q){setView('point');renderPoint(q)}else{const u=UNITS[currentUnit];$('#title').textContent=u.title;$('#range').textContent=`教材 PDF 第 ${u.pageRange[0]}–${u.pageRange[1]} 页`;renderPoint()}
}

function parseWords(u){
  const sec=u?.sections?.find(s=>s.id==='words-to-use');if(!sec?.text)return[];
  const topic=(u.sections.find(s=>s.id==='topic-words')?.text||'').toLowerCase();
  return sec.text.split(/\n+/).map(x=>x.trim()).filter(Boolean).map(line=>{
    let word='',pos='',meaning='';
    let m=line.match(/^(.+?)\s+((?:n|v|adj|adv|prep|conj|pron|num)\.)\s+(.+)$/i);
    if(m){word=m[1].trim();pos=m[2];meaning=m[3].trim()}
    else{m=line.match(/^([A-Za-z][A-Za-z'’\- ]+?)\s+(.+)$/);if(m){word=m[1].trim();meaning=m[2].trim()}else{word=line}}
    const clean=word.replace(/[…]+/g,'').trim();
    return{word:clean||word,pos,meaning,key:clean?topic.includes(clean.toLowerCase()):false};
  }).filter(x=>x.word);
}

let notesFontScale=100;
function renderNotes(){
  if(!UNITS.length)return;const u=UNITS[currentUnit],words=parseWords(u);const root=$('#autoNotes');if(!root)return;
  const refined=u.sections.filter(s=>pointSegments(s)?.length);
  root.innerHTML=`<div class="notes-card"><h3>本单元词汇</h3>${words.length?`<div class="word-grid">${words.map(w=>`<div class="word-row"><b>${htmlEsc(w.word)}</b><span>${htmlEsc(w.pos)} ${htmlEsc(w.meaning)}</span></div>`).join('')}</div>`:'<p class="muted">本单元暂无词汇表。</p>'}</div>`+
    `<div class="notes-card"><h3>精校正文索引</h3>${refined.map(s=>`<div class="notes-section"><h4>${htmlEsc(s.title)} · 教材页 ${s.pages.join(', ')}</h4>${pointSegments(s).map(x=>`<p>${htmlEsc(x.text)}</p>`).join('')}</div>`).join('')||'<p class="muted">暂无精校正文。</p>'}</div>`;
  root.style.fontSize=notesFontScale+'%';$('#myNote').value=localStorage.getItem('hujiao_note_'+u.id)||'';
}
function saveMyNote(){if(!UNITS.length)return;localStorage.setItem('hujiao_note_'+UNITS[currentUnit].id,$('#myNote').value)}
function adjustNotesFont(delta){notesFontScale=Math.max(80,Math.min(150,notesFontScale+delta));$('#autoNotes').style.fontSize=notesFontScale+'%'}
function highlightNotes(q){
  renderNotes();q=q.trim();if(!q)return;const root=$('#autoNotes'),walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
  for(const node of nodes){const text=node.nodeValue,idx=text.toLowerCase().indexOf(q.toLowerCase());if(idx<0)continue;const frag=document.createDocumentFragment();frag.append(text.slice(0,idx));const mark=document.createElement('mark');mark.textContent=text.slice(idx,idx+q.length);frag.append(mark,text.slice(idx+q.length));node.parentNode.replaceChild(frag,node)}
  root.querySelector('mark')?.scrollIntoView({behavior:'smooth',block:'center'});
}

function renderDictation(){
  if(!UNITS.length)return;dictWords=parseWords(UNITS[currentUnit]);dictStarted=false;$('#dictQuiz').hidden=true;$('#dictResult').hidden=true;
  const keyCount=dictWords.filter(w=>w.key).length;$('#dictWordCount').textContent=`本单元词汇 ${dictWords.length} 个${keyCount?`，Topic words ${keyCount} 个`:''}`;
}
function shuffle(arr){const a=arr.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function startDictation(scope){
  const pool=scope==='key'?dictWords.filter(w=>w.key):dictWords;if(!pool.length){alert('当前范围没有可听写单词');return}
  dictQueue=shuffle(pool);dictIndex=0;dictStage=0;dictStarted=true;$('#dictQuiz').hidden=false;$('#dictResult').hidden=true;renderDictCard();
}
function renderDictCard(){const item=dictQueue[dictIndex];$('#dictProgress').textContent=`第 ${dictIndex+1} / ${dictQueue.length} 个单词`;$('#dictFront').hidden=false;$('#dictBack').hidden=true;$('#dictStageHint').textContent='点击卡片，先听发音';$('#dictCard').classList.remove('revealed','listening');dictStage=0}
function speakWord(word){if(!('speechSynthesis' in window))return;window.speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(word);u.lang='en-US';u.rate=.85;const voices=window.speechSynthesis.getVoices();const en=voices.find(v=>v.lang?.toLowerCase().startsWith('en'));if(en)u.voice=en;window.speechSynthesis.speak(u)}
function dictationCardClick(){
  if(!dictStarted||!dictQueue[dictIndex])return;const item=dictQueue[dictIndex];
  if(dictStage===0){speakWord(item.word);$('#dictStageHint').textContent='再点一下，显示单词';$('#dictCard').classList.add('listening');dictStage=1;return}
  if(dictStage===1){$('#dictBack').innerHTML=`<div class="dict-word">${htmlEsc(item.word)}</div><div class="dict-meta">${htmlEsc(item.pos)} ${htmlEsc(item.meaning)}</div>`;$('#dictFront').hidden=true;$('#dictBack').hidden=false;$('#dictStageHint').textContent='再点一下，看下一个单词';$('#dictCard').classList.add('revealed');dictStage=2;return}
  dictIndex++;if(dictIndex<dictQueue.length)renderDictCard();else finishDictation();
}
function finishDictation(){
  const u=UNITS[currentUnit],key='hujiao_dict_'+u.id,prev=JSON.parse(localStorage.getItem(key)||'{}');localStorage.setItem(key,JSON.stringify({lastCount:dictQueue.length,lastAt:Date.now(),best:Math.max(prev.best||0,dictQueue.length)}));
  $('#dictSummary').innerHTML=dictQueue.map(w=>`<div class="dict-summary-item"><b>${htmlEsc(w.word)}</b><span>${htmlEsc(w.pos)} ${htmlEsc(w.meaning)}</span></div>`).join('');$('#dictQuiz').hidden=true;$('#dictResult').hidden=false;dictStarted=false;
}

function offlineUrls(){
  const unitFiles=(CATALOG?.units||[]).map(x=>'data/'+x.file);const pointFiles=(POINT_INDEX?.files||[]).map(x=>'data/'+x);
  return ['./','index.html','styles.css','app.js','manifest.webmanifest','data/index.json','data/audio-sprite-manifest.json','data/point-v3/index.json',...unitFiles,...pointFiles];
}
async function updateOfflineStatus(){
  if(!$('#offlineStatus'))return;
  if(!('caches' in window)){$('#offlineStatus').textContent='当前浏览器不支持离线缓存。';return}
  try{
    const media=await caches.open(MEDIA_CACHE),audioCached=!!(await media.match(new URL('assets/audio-sprite.ogg',location.href).href,{ignoreSearch:true}));
    let storage='';if(navigator.storage?.estimate){const e=await navigator.storage.estimate();storage=` · 已用 ${formatBytes(e.usage||0)} / ${formatBytes(e.quota||0)}`}
    $('#offlineStatus').textContent=(audioCached?'完整原版音频已离线缓存':'尚未下载完整离线包')+storage;$('#offlineDownload').textContent=audioCached?'重新检查 / 补全离线包':'下载完整离线包';
  }catch(e){$('#offlineStatus').textContent='无法读取离线状态：'+e.message}
}
function formatBytes(n){if(!n)return'0 MB';return(n/1024/1024).toFixed(n>100*1024*1024?0:1)+' MB'}
async function downloadOffline(){
  const btn=$('#offlineDownload'),prog=$('#offlineProgress');btn.disabled=true;prog.hidden=false;prog.value=0;prog.max=100;
  try{
    if(navigator.storage?.persist)try{await navigator.storage.persist()}catch(_){ }
    const core=await caches.open(CORE_CACHE),urls=offlineUrls();let done=0,total=urls.length+1;
    for(const path of urls){const url=new URL(path,location.href).href;const res=await fetch(url,{cache:'no-store'});if(!res.ok)throw new Error(`${path} 下载失败 (${res.status})`);await core.put(url,res.clone());done++;prog.value=Math.round(done/total*100);$('#offlineDetail').textContent=`正在缓存教材与程序 ${done}/${total}`}
    const media=await caches.open(MEDIA_CACHE),audioUrl=new URL('assets/audio-sprite.ogg',location.href).href;const res=await fetch(audioUrl,{cache:'no-store'});if(!res.ok)throw new Error('原版音频下载失败');await media.put(audioUrl,res.clone());done++;prog.value=100;$('#offlineDetail').textContent='下载完成：教材数据、精校时间轴与出版社原版音频均可离线使用。';
  }catch(e){$('#offlineDetail').textContent='下载未完成：'+e.message+'。已完成部分会保留，可再次点击继续。'}finally{btn.disabled=false;updateOfflineStatus()}
}
async function clearOffline(){
  if(!confirm('确定清除本机下载的五年级上离线教材和音频吗？个人笔记与听写记录不会删除。'))return;
  await caches.delete(MEDIA_CACHE);await caches.delete(CORE_CACHE);$('#offlineDetail').textContent='离线缓存已清除。';updateOfflineStatus();
}

init();