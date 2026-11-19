'use strict';
const KEY='vocabmaster-v1';
// 기존 샘플 데이터는 제거하고 DAY별 실제 40개 데이터로 초기화합니다.
let state;try{state=JSON.parse(localStorage.getItem(KEY))}catch{}
if(!state||!Array.isArray(state.words))state={words:[],results:[],reviews:{}};
state.results=Array.isArray(state.results)?state.results:[];
state.reviews=state.reviews&&typeof state.reviews==='object'?state.reviews:{};
state.srs=state.srs&&typeof state.srs==='object'?state.srs:{};
state.notes=state.notes&&typeof state.notes==='object'?state.notes:{};
// 사용자가 제공한 DAY 1~50, 2,000개 단어를 사용합니다.
const master=wordmasterData.map(w=>({...w,day:Number(w.day)}));
const validIds=new Set(master.map(w=>w.id));
state.words=master;
state.results=state.results.filter(r=>validIds.has(r.wordId));
state.reviews=Object.fromEntries(Object.entries(state.reviews).filter(([id])=>validIds.has(id)));
state.srs=Object.fromEntries(Object.entries(state.srs).filter(([id])=>validIds.has(id.split(':')[0])));
try{localStorage.setItem(KEY,JSON.stringify(state))}catch{}
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)], esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(state))}catch{alert('저장 공간이 부족하거나 브라우저 저장이 차단되었습니다.')}};
let tab='home', session=null, advanceTimer=null, countdownTimer=null;
const DAYMS=86400000;
const now=()=>Date.now();
const reviewKey=(w,mode)=>w.id+':'+(mode===4?'spell':mode===3?'recall':'recognition');
const reviewRecord=(w,mode)=>state.srs[reviewKey(w,mode)]||null;
const isDue=(w,mode)=>{const r=reviewRecord(w,mode);return !r||r.due<=now()};
const intervalLabel=(ms)=>ms<DAYMS?'오늘':Math.round(ms/DAYMS)+'일 후';
function schedule(w,mode,kind,confidence='normal',elapsed=0){
 const key=reviewKey(w,mode),old=state.srs[key]||{streak:0,interval:0,ease:2.5,lapses:0};
 const fail=kind!=='correct';let streak=fail?0:old.streak+1;
 const ease=Math.max(1.3,Math.min(3.0,(old.ease||2.5)+(fail?-.2:confidence==='easy'?.1:confidence==='hard'?-.12:0)));
 let days=fail?0:streak===1?1:streak===2?3:Math.min(180,Math.max(4,Math.round((old.interval||3)*ease)));
 if(confidence==='hard'&&!fail)days=Math.max(1,Math.floor(days*.65));
 const interval=days*DAYMS;
 state.srs[key]={streak,interval,ease,lapses:(old.lapses||0)+(fail?1:0),due:now()+(fail?10*60000:interval),last:kind,at:new Date().toISOString(),elapsed};
}
function dayDueCount(){return state.words.filter(w=>[3,4].some(m=>{const r=reviewRecord(w,m);return r&&r.due<=now()})).length}
function memoryCount(){return state.words.filter(w=>{const r=reviewRecord(w,3);return r&&r.streak>=3&&r.interval>=7*DAYMS}).length}

function stopAdvance(){if(advanceTimer!==null){clearTimeout(advanceTimer);advanceTimer=null}if(countdownTimer!==null){clearInterval(countdownTimer);countdownTimer=null}}
function nextQuestion(){stopAdvance();if(!session)return;session.index++;session.checked=false;showQuestion()}
function go(t){if(t!=='quiz')stopAdvance();if(t!=='quiz')document.body.classList.remove('quiz-active','answer-revealed');tab=t;['home','quiz','words','mistakes','history'].forEach(k=>$('#'+k).classList.toggle('hidden',k!==t));$$('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===t));render();window.scrollTo(0,0)}
$$('[data-tab]').forEach(b=>b.onclick=()=>go(b.dataset.tab));
const meanings=w=>w.ko.split(/[;,；]/).map(x=>x.trim()).filter(Boolean);
// PDF meanings are preserved; this list is only used to grade semantically equivalent short answers.
const acceptedMeanings=w=>[...new Set(synonymData[w.en.toLowerCase()]||[])];
const clean=s=>String(s||'').toLowerCase().normalize('NFKC').replace(/[\s.,!?·()\-]/g,'').replace(/(합니다|해요|한다|하다|됩니다|된다|되다)$/,'');
function pdfVariants(ko){
 const out=new Set();
 const split=String(ko).split(/[;,；]/).map(x=>x.trim()).filter(Boolean);
 for(const part of split){
  const variants=[part,part.replace(/\([^)]*\)/g,''),part.replace(/\[([^\]]*)\]/g,''),part.replace(/([가-힣]+)\[([^\]]+)\]([가-힣]*)/g,'$2$3'),part.replace(/([가-힣]+)\(([^)]*)\)/g,'$1$2')];
  for(const v of variants){if(v.trim())out.add(v.trim());
   // Korean dictionary glosses often contain contextual qualifiers, not part of the answer.
   const stripped=v.replace(/^\([^)]*\)\s*/,'').replace(/^<[^>]*>\s*/,'').trim();if(stripped)out.add(stripped);
  }
 }
 return [...out];
}
function judge(w,answer,mode){
 const a=clean(answer);if(!a)return {kind:'wrong',why:'답을 입력하지 않았습니다.'};
 if(mode===4)return {kind:a===clean(w.en)?'correct':'wrong',why:'정답: '+w.en};
 const valid=[...pdfVariants(w.ko),...acceptedMeanings(w)];
 if(valid.some(x=>clean(x)===a))return {kind:'correct',why:'의미가 일치하는 표현입니다.'};
 // Exact normalized variants only: '독' is valid for poison; '독립' is not.
 return {kind:'wrong',why:'등록된 뜻과 확인된 동의어에 없는 표현입니다.'};
}
function days(){return [...new Set(state.words.map(w=>Number(w.day)||1))].sort((a,b)=>a-b)}
function stats(){const r=state.results;return {total:r.length,correct:r.filter(x=>x.kind==='correct').length,wrong:r.filter(x=>x.kind!=='correct').length}}
// 오답노트는 일반 시험과 독립적으로 관리합니다. 이전 버전의 오답 기록도 복원합니다.
state.mistakes=state.mistakes&&typeof state.mistakes==='object'?state.mistakes:{};
if(!state.mistakesMigrated){for(const r of state.results){if(r.kind!=='correct'&&validIds.has(r.wordId)&&!state.mistakes[r.wordId])state.mistakes[r.wordId]={at:r.date,answer:r.answer,mode:r.mode};}state.mistakesMigrated=true;save();}
function mistakeItems(){return state.words.filter(w=>!!state.mistakes[w.id]).sort((a,b)=>a.day-b.day||a.order-b.order)}
function mistakes(){
 const all=mistakeItems();
 const dayOptions=[...new Set(all.map(w=>w.day))];
 const savedDay=window.mistakeSelectedDay||'all';
 const chosen=dayOptions.some(d=>String(d)===String(savedDay))?String(savedDay):'all';
 $('#mistakes').innerHTML=`<div class="card mistake-overview"><div class="eyebrow">REVIEW · 오답노트</div><h2>틀린 단어 모아보기</h2><p class="muted">DAY별로 오답을 확인하고 복습할 수 있어요. 오답 삭제는 시험 기록과 별개로 처리됩니다.</p><div class="stats"><div class="stat"><strong>${all.length}</strong><span>저장된 오답</span></div><div class="stat"><strong>${dayOptions.length}</strong><span>오답이 있는 DAY</span></div><div class="stat"><strong>${all.filter(w=>state.reviews[w.id]?.last==='correct').length}</strong><span>최근 정답</span></div></div><label for="mistakeDay">DAY 필터</label><select id="mistakeDay"><option value="all">전체 DAY · ${all.length}개</option>${dayOptions.map(d=>`<option value="${d}">DAY ${d} · ${all.filter(w=>w.day===d).length}개</option>`).join('')}</select><button id="mistakeQuiz" class="primary-cta">선택한 범위 오답 시험 보기 <span>→</span></button></div><div class="card mistake-list-card"><div class="mistake-list-heading"><div><h2>오답 목록</h2><p class="muted" id="mistakeScopeDescription">DAY별로 구분해 표시합니다.</p></div><span class="pill" id="mistakeCount">${all.length}개</span></div><div class="mistake-toolbar"><button type="button" id="bulkDeleteMistakes" class="mistake-delete-all" aria-label="선택한 범위의 오답 일괄 삭제">선택 범위 일괄삭제</button></div><div id="mistakeList"></div></div>`;
 const select=$('#mistakeDay');select.value=chosen;
 const draw=()=>{
  const day=select.value;window.mistakeSelectedDay=day;
  const filtered=mistakeItems().filter(w=>day==='all'||w.day===Number(day));
  $('#mistakeCount').textContent=filtered.length+'개';
  $('#mistakeScopeDescription').textContent=day==='all'?'전체 DAY의 오답을 DAY별로 묶어 표시합니다.':`DAY ${day}의 오답만 표시합니다.`;
  const groups=[...new Set(filtered.map(w=>w.day))];
  $('#mistakeList').innerHTML=groups.map(d=>{
   const group=filtered.filter(w=>w.day===d);
   return `<section class="mistake-day-group" aria-label="DAY ${d} 오답"><div class="mistake-day-header"><div class="mistake-day-title"><span class="mistake-day-icon">${String(d).padStart(2,'0')}</span><div><strong>DAY ${d}</strong><span>오답 복습 목록</span></div></div><span class="mistake-day-count">${group.length}개</span></div><div class="mistake-day-words">${group.map((w,i)=>`<div class="mistake-word-row"><div class="mistake-word-main"><span class="mistake-word-number">${i+1}</span><div class="mistake-word-content"><strong>${esc(w.en)}</strong><div class="mistake-meaning">${esc(w.ko)}</div><div class="mistake-word-status">${state.reviews[w.id]?.last==='correct'?'최근 정답 · 복습 권장':'오답 복습 대상'}</div></div></div><button type="button" class="mistake-remove-one" data-remove-mistake="${esc(w.id)}" aria-label="${esc(w.en)} 오답에서 삭제">삭제</button></div>`).join('')}</div></section>`;
  }).join('')||'<div class="mistake-empty">저장된 오답이 없습니다.<div>시험에서 틀린 단어가 이곳에 자동으로 모입니다.</div></div>';
  $('#bulkDeleteMistakes').disabled=!filtered.length;
  $('#mistakeQuiz').disabled=!filtered.length;
  $$('#mistakeList [data-remove-mistake]').forEach(button=>button.onclick=()=>{
   const id=button.dataset.removeMistake;
   delete state.mistakes[id];save();
   const remain=mistakeItems();
   if(day!=='all'&&!remain.some(w=>w.day===Number(day)))window.mistakeSelectedDay='all';
   mistakes();
  });
 };
 select.onchange=draw;
 $('#bulkDeleteMistakes').onclick=()=>{
  const day=select.value;
  const targets=mistakeItems().filter(w=>day==='all'||w.day===Number(day));
  if(!targets.length)return;
  const scope=day==='all'?'전체 DAY':`DAY ${day}`;
  if(!confirm(`${scope}의 오답 ${targets.length}개를 모두 삭제할까요?\n\n오답노트에서만 삭제되며 기존 시험 기록은 유지됩니다.`))return;
  targets.forEach(w=>delete state.mistakes[w.id]);
  state.mistakesMigrated=true;save();
  window.mistakeSelectedDay='all';mistakes();
 };
 $('#mistakeQuiz').onclick=()=>{
  const day=select.value;const pool=mistakeItems().filter(w=>day==='all'||w.day===Number(day));
  if(!pool.length){alert('선택한 범위에 오답이 없습니다.');return}
  session={mode:3,items:pool,index:0,answers:[],checked:false,started:now()};go('quiz');
 };
 draw();
}
function render(){if(tab==='home')home();if(tab==='quiz')quiz();if(tab==='words')words();if(tab==='history')history();if(tab==='mistakes')mistakes()}
function learningOverview(){
 const seen=new Set(state.results.filter(r=>validIds.has(r.wordId)).map(r=>r.wordId));
 const total=state.words.length;
 const percent=total?Math.round(seen.size/total*1000)/10:0;
 const last=[...state.results].reverse().find(r=>validIds.has(r.wordId));
 const lastWord=last?state.words.find(w=>w.id===last.wordId):null;
 const todayKey=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Seoul'});
 const today=new Set(state.results.filter(r=>validIds.has(r.wordId)&&new Date(r.date).toLocaleDateString('en-CA',{timeZone:'Asia/Seoul'})===todayKey).map(r=>r.wordId)).size;
 return {seen:seen.size,total,percent,lastWord,today,lastAt:last?.date||null};
}
function home(){
 const s=stats(),due=dayDueCount(),items=mistakeItems(),overview=learningOverview();
 const counts=days().map(d=>({day:d,count:items.filter(w=>w.day===d).length}));
 const last=overview.lastWord;
 const recent=last?`<div class="recent-learning"><div class="recent-learning-top"><span>최근 학습 위치</span><span>${overview.lastAt?esc(new Date(overview.lastAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})):'-'}</span></div><div class="recent-learning-value">DAY ${last.day} <span>· 교재 ${last.order}/40번째 단어</span></div><div class="recent-learning-word">${esc(last.en)} <span>· ${esc(last.ko)}</span></div></div>`:`<div class="recent-learning"><div class="recent-learning-top"><span>최근 학습 위치</span></div><div class="recent-learning-value">아직 학습 기록이 없어요</div><div class="recent-learning-word">DAY 1부터 시작해 보세요.</div></div>`;
 $('#home').innerHTML=`<div class="card hero learning-hero"><div class="hero-topline">전체 학습률 <span>WORDMASTER · ${overview.total.toLocaleString()}단어</span></div><div class="hero-progress"><strong>${overview.percent}%</strong><span>${overview.seen.toLocaleString()} / ${overview.total.toLocaleString()}단어 학습</span></div><div class="hero-track" role="progressbar" aria-label="전체 학습률" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${overview.percent}"><div style="width:${overview.percent}%"></div></div><div class="hero-subline">아직 학습하지 않은 단어 ${(overview.total-overview.seen).toLocaleString()}개</div>${recent}<button id="startHome">DAY 학습 시작 →</button></div><div class="card overview-card"><div class="stats"><div class="stat"><strong>${overview.today}</strong><span>오늘 학습 단어</span></div><div class="stat"><strong>${due}</strong><span>복습 기한 도래</span></div><div class="stat"><strong>${s.total?Math.round(s.correct/s.total*100):0}%</strong><span>누적 정답률</span></div></div><p class="muted">오늘 학습 수는 중복 단어를 제외해 계산합니다. 전체 학습률은 한 번 이상 답안을 제출한 단어를 기준으로 합니다.</p></div><div class="card"><div class="row"><h2>DAY별 오답 시험</h2><span class="pill">${items.length}개</span></div><p class="muted">시험에서 틀린 단어만 모아뒀어요. 원하는 DAY를 선택해서 따로 시험 보세요.</p><label for="homeMistakeDay">오답 DAY 선택</label><select id="homeMistakeDay"><option value="all">전체 DAY · ${items.length}개</option>${counts.map(x=>`<option value="${x.day}">DAY ${x.day} · ${x.count}개 오답</option>`).join('')}</select><div class="row topgap"><span class="muted" id="homeMistakeCount"></span><button class="secondary smallbtn" id="openMistakeList">오답 목록 관리</button></div><button id="startMistakesHome" class="primary-cta">선택한 DAY 오답 시험 보기 <span>→</span></button></div>`;
 $('#startHome').onclick=()=>go('quiz');
 const sel=$('#homeMistakeDay');const update=()=>{const n=sel.value==='all'?items.length:items.filter(w=>w.day===Number(sel.value)).length;$('#homeMistakeCount').textContent=`출제 가능한 오답 ${n}개`;$('#startMistakesHome').disabled=n===0};
 sel.onchange=update;update();
 $('#startMistakesHome').onclick=()=>{const pool=items.filter(w=>sel.value==='all'||w.day===Number(sel.value));if(!pool.length){alert('선택한 DAY에는 오답이 없습니다.');return}session={mode:3,items:pool,index:0,answers:[],checked:false,started:now()};go('quiz')};
 $('#openMistakeList').onclick=()=>go('mistakes');
}
function quiz(){
 if(session){showQuestion();return}
 document.body.classList.remove('quiz-active','answer-revealed');
 const d=days();
 $('#quiz').innerHTML=`<div class="card setup"><div class="eyebrow">PRACTICE · 단어 시험</div><h2>시험 설정</h2><p class="muted">워드마스터 DAY 1~50 · 2,000단어 · 교재 순서 그대로</p>
 <label>시험 범위</label><div class="seg-grid" id="scopeBtns"><button type="button" class="seg-btn selected" data-scope="all">전체 단어</button><button type="button" class="seg-btn" data-scope="wrong">오답만</button></div>
 <label>시험 방식</label><div class="seg-grid" id="modeBtns">${[['1','영어 → 한글 선택'],['3','영어 → 한글 입력'],['4','한글 → 영어 입력']].map(([v,n])=>`<button type="button" class="seg-btn ${v==='3'?'selected':''}" data-mode="${v}">${n}</button>`).join('')}</div>
 <label>학습 DAY</label><select id="daySelect" aria-label="학습 DAY">${d.map(n=>`<option value="${n}">DAY ${n} · 40개</option>`).join('')}</select>
 <label>출제 순서</label><div class="seg-grid" id="orderBtns"><button type="button" class="seg-btn selected" data-order="book">교재 순서대로</button><button type="button" class="seg-btn" data-order="random">랜덤 출제</button></div>
 <div class="note">전체 단어는 DAY당 40문제만 출제합니다. 오답만 선택하면 해당 DAY에 저장된 오답만 출제합니다.</div>
 <p class="note" id="available"></p><button id="begin" class="primary-cta">시험 시작 <span>→</span></button></div>`;
 const settings={mode:'3',day:'1',order:'book',scope:'all',count:'40'};
 const getPool=()=>state.words.filter(w=>settings.scope==='due'||w.day===Number(settings.day)).filter(w=>{
 if(settings.scope==='wrong')return !!state.mistakes[w.id];
 if(settings.scope==='due')return !!reviewRecord(w,Number(settings.mode))&&isDue(w,Number(settings.mode));
 if(settings.scope==='weak')return (reviewRecord(w,Number(settings.mode))?.lapses||0)>0;
 return true;
});
 const update=()=>{const n=getPool().length;$('#available').textContent=`${settings.scope==='due'?'전체 DAY 복습':`DAY ${settings.day}`} · ${Math.min(n,Number(settings.count))}개 출제 예정${settings.scope==='due'?` / 복습 대상 ${n}개`:' / 등록 40개'}`;};
 $('#daySelect').onchange=e=>{settings.day=e.target.value;update()};
 for(const k of Object.keys(settings))$$(`[data-${k}]`).forEach(b=>b.onclick=()=>{settings[k]=b.dataset[k];$$(`[data-${k}]`).forEach(x=>x.classList.toggle('selected',x===b));update()});
 update();
 $('#begin').onclick=()=>{
  let pool=getPool();if(!pool.length){alert('선택한 DAY에 출제 가능한 단어가 없습니다.');return}
  pool=[...pool].sort((a,b)=>a.order-b.order);
  if(settings.order==='random')for(let i=pool.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]]}
  pool=pool.slice(0,Number(settings.count));session={mode:Number(settings.mode),items:pool,index:0,answers:[],checked:false,started:now()};showQuestion();
 };
}
// 교재에 표시된 뜻을 우선하며, 품사는 사전 대조 여부를 구분합니다.
// VERIFIED_POS는 교재의 의미와 품사를 명확히 연결해 별도 검토한 항목만 포함합니다.
const VERIFIED_POS={
 'provide':'동사','develop':'동사','attitude':'명사','cultural':'형용사',
 'challenge':'명사 · 동사','amount':'명사 · 동사','social':'형용사',
 'improve':'동사','individual':'명사 · 형용사','require':'동사',
 'volunteer':'명사 · 동사','behave':'동사','inform':'동사','material':'명사',
 'employ':'동사','research':'명사 · 동사','artifact':'명사',
 'influence':'명사 · 동사','international':'형용사','relationship':'명사',
 'opportunity':'명사','environment':'명사','expense':'명사','local':'형용사',
 'involve':'동사','stress':'명사 · 동사','contain':'동사',
 'average':'명사 · 형용사 · 동사','consume':'동사','focus':'명사 · 동사',
 'encourage':'동사','determine':'동사','scold':'동사','impress':'동사',
 'poison':'명사 · 동사','object':'명사 · 동사','available':'형용사',
 'positive':'형용사','recognize':'동사','commodity':'명사',
 'profession':'명사','despite':'전치사','whereas':'접속사',
 'nevertheless':'부사','furthermore':'부사','except':'전치사 · 동사',
 'due':'형용사','present':'명사 · 동사 · 형용사',
 'content':'명사 · 형용사','novel':'명사 · 형용사',
 'secure':'형용사 · 동사','brief':'형용사 · 명사 · 동사',
 'complex':'형용사 · 명사','function':'명사 · 동사',
 'approach':'명사 · 동사','contact':'명사 · 동사',
 'account':'명사 · 동사','active':'형용사','species':'명사'
};
function inferredPos(w){
 const raw=String(w.ko||'').trim();
 const chunks=raw.split(/[;,；]/).map(x=>x.trim()).filter(Boolean);
 const tags=new Set();
 for(const chunk of chunks){
  const c=chunk.replace(/\([^)]*\)|\[[^\]]*\]|<[^>]*>/g,'').trim();
  if(/(?:하다|되다|시키다|있다|없다|주다|받다|가다|오다|나다|짓다|들다|쓰다|보다|먹다|마시다|찾다|얻다|잃다|깨다|잡다|막다|끌다|밀다|치다|펴다|젓다|뛰다|걷다|달리다|읽다|알다|모르다|살다|내다|돌다|넘다|삼키다|흐르다|서다|앉다|뜨다|지다|붙다|떨어지다|생기다|바라다|넘어지다|떠나다|빌리다|빌려주다|다르다|낫다|녹다|늘다|줄다|열다|닫다|오르다|내리다|지키다|버리다|고르다|돕다|꾸다|쏘다|꿰다|씹다|깨물다|사라지다|나타나다|이어지다|돌아오다|이루다|불다|울다|묻다|묶다|끊다|풀다|놓다|되돌리다)\s*$/.test(c))tags.add('동사');
  else if(/(?:적인|스러운|러운|하는|있는|없는|같은|높은|낮은|빠른|느린|좋은|나쁜|많은|적은|드문|깊은|넓은|좁은|긴|짧은|어려운|쉬운|큰|작은|새로운|오래된|가까운|먼|강한|약한|밝은|어두운|옳은|그른|흔한|희귀한|명백한|유능한|안전한|가능한|불가능한|정확한|충분한|복잡한|간단한|비슷한|동일한|다른|~의|의)\s*$/.test(c))tags.add('형용사');
  else if(/(?:게|히|로|에|에서|뒤에|전에|후에|없이|도록|만큼)\s*$/.test(c))tags.add('부사·기타');
  else if(c)tags.add('명사');
 }
 return [...tags].join(' · ')||'확인 필요';
}
function partOfSpeech(w){return VERIFIED_POS[w.en.toLowerCase()]||inferredPos(w)}
function posStatus(w){return Object.prototype.hasOwnProperty.call(VERIFIED_POS,w.en.toLowerCase())?'검토됨':'교재 뜻 기반 추정'}
// 외부 음원 없이 오프라인에서도 동작하는 정오답 효과음
let soundContext=null;
function playFeedbackSound(correct){
 try{
  const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
  if(!soundContext)soundContext=new AC();
  if(soundContext.state==='suspended')soundContext.resume().catch(()=>{});
  const t=soundContext.currentTime+0.015;
  const tones=correct?[[660,0,.10],[880,.13,.17]]:[[310,0,.14],[220,.17,.22]];
  tones.forEach(([hz,delay,duration])=>{
   const osc=soundContext.createOscillator(),gain=soundContext.createGain();
   osc.type=correct?'sine':'triangle';osc.frequency.setValueAtTime(hz,t+delay);
   gain.gain.setValueAtTime(.0001,t+delay);
   gain.gain.exponentialRampToValueAtTime(correct?.10:.075,t+delay+.015);
   gain.gain.exponentialRampToValueAtTime(.0001,t+delay+duration);
   osc.connect(gain);gain.connect(soundContext.destination);
   osc.start(t+delay);osc.stop(t+delay+duration+.01);
  });
 }catch(e){/* 무음 모드 또는 오디오 미지원 환경에서는 조용히 진행 */}
}
function showQuestion(){stopAdvance();if(session)session.started=now();document.body.classList.add('quiz-active');document.body.classList.remove("answer-revealed");const q=session;if(q.index>=q.items.length){const n=q.answers.filter(a=>a.kind==='correct').length;$('#quiz').innerHTML=`<div class="card"><h2>시험 완료</h2><div class="word">${n} / ${q.items.length}</div><p style="text-align:center">학습 진행률 100% · 정답률 ${Math.round(n/q.items.length*100)}%</p><p class="muted" style="text-align:center">틀린 단어는 오답노트에 저장됩니다. 시험 중 추가 출제하지 않습니다.</p><button id="again" style="width:100%">다른 시험 보기</button><button id="viewMistakes" class="secondary" style="width:100%;margin-top:10px">오답노트 보기</button></div>`;$('#again').onclick=()=>{stopAdvance();session=null;quiz()};$('#viewMistakes').onclick=()=>{session=null;go('mistakes')};return}const w=q.items[q.index], mode=q.mode;let question=mode===1||mode===3?w.en:meanings(w)[0];let done=q.index+(q.checked?1:0), pct=Math.round(done/q.items.length*1000)/10;let html=`<div class="card"><div class="row"><span class="pill">${q.index+1} / ${q.items.length}</span><span class="muted">DAY ${w.day} · ${['','영→한 선택','한→영 선택','영→한 입력','한→영 입력'][mode]}</span></div><div class="row topgap"><strong>학습 진행률 <span id="progressPercent">${pct}%</span></strong><span class="muted" id="progressCount">${done}문제 완료 · ${q.items.length-done}문제 남음</span></div><div class="progress topgap" role="progressbar" aria-label="학습 진행률" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" id="quizProgress"><div style="width:${pct}%" id="progressFill"></div></div><div class="word">${esc(question)}</div><div class="pos-hint" aria-label="품사">품사 <strong>${esc(partOfSpeech(w))}</strong><small> · ${esc(posStatus(w))}</small></div>`;
if(mode<=2){const target=mode===1?meanings(w)[0]:w.en;const others=state.words.filter(x=>x.id!==w.id&&Number(x.day)===Number(w.day)).sort(()=>Math.random()-.5).slice(0,3).map(x=>mode===1?meanings(x)[0]:x.en);const opts=[target,...others].sort(()=>Math.random()-.5);html+=`<div class="stack">${opts.map(o=>`<button class="choice" data-choice="${esc(o)}">${esc(o)}</button>`).join('')}</div>`}else html+=`<input id="answer" placeholder="정답을 입력하세요" autocomplete="off" autocapitalize="none" spellcheck="false"><button id="check" style="width:100%;margin-top:12px">채점하기</button>`;
html+=`<div id="feedback"></div></div><button class="secondary" id="quit">시험 종료</button>`;$('#quiz').innerHTML=html;$('#quit').onclick=()=>{if(confirm('시험을 종료할까요?')){stopAdvance();session=null;quiz()}};
function check(ans){if(q.checked)return;q.checked=true;document.body.classList.add("answer-revealed");if(document.activeElement&&document.activeElement.blur)document.activeElement.blur();let result=mode<=2?{kind:clean(ans)===clean(mode===1?meanings(w)[0]:w.en)?'correct':'wrong',why:'정답: '+(mode===1?meanings(w).join(', '):w.en)}:judge(w,ans,mode);playFeedbackSound(result.kind==='correct');const elapsed=now()-q.started;const record={id:Date.now()+Math.random(),wordId:w.id,en:w.en,mode,answer:ans,kind:result.kind,date:new Date().toISOString(),elapsed};state.results.push(record);q.answers.push(record);state.reviews[w.id]={last:result.kind,at:record.date};if(result.kind!=='correct')state.mistakes[w.id]={at:record.date,answer:ans,mode};schedule(w,mode,result.kind,'normal',elapsed);save();const completed=q.index+1;const percentage=Math.round(completed/q.items.length*1000)/10;$('#progressPercent').textContent=percentage+'%';$('#progressCount').textContent=`${completed}문제 완료 · ${q.items.length-completed}문제 남음`;$('#progressFill').style.width=percentage+'%';$('#quizProgress').setAttribute('aria-valuenow',percentage);if(mode<=2){$$('[data-choice]').forEach(b=>{const chosen=b.dataset.choice===ans;const expected=b.dataset.choice===(mode===1?meanings(w)[0]:w.en);b.classList.toggle('choice-correct',expected);b.classList.toggle('choice-incorrect',chosen&&!expected);b.classList.toggle('choice-muted',!chosen&&!expected);b.disabled=true})}const f=$('#feedback');const name={correct:'정답',partial:'부분 정답',wrong:'오답'};f.classList.add('motion-feedback');f.innerHTML=`<div class="feedback-motion-inner"><div class="feedback ${result.kind==='correct'?'good':result.kind==='partial'?'partial':'bad'}"><div class="verdict-line"><span class="verdict-mark">${result.kind==='correct'?'✓':result.kind==='partial'?'△':'×'}</span><strong id="verdict">${name[result.kind]}</strong></div>${result.kind==='partial'?'<p class="muted">입력한 표현이 일부 일치합니다. 아래 뜻을 확인하세요.</p>':''}<div class="meaning-section"><div class="meaning-label">정식 뜻 <span>품사: ${esc(partOfSpeech(w))} (${esc(posStatus(w))})</span></div><div class="meaning-text">${esc(w.ko)}</div></div>${acceptedMeanings(w).filter(x=>!pdfVariants(w.ko).some(y=>clean(x)===clean(y))).length?`<div class="meaning-section alt"><div class="meaning-label">추가 인정 표현</div><div class="meaning-text">${esc(acceptedMeanings(w).filter(x=>!pdfVariants(w.ko).some(y=>clean(x)===clean(y))).slice(0,3).join(" · "))}</div></div>`:""}${mode===4?`<div class="meaning-section"><div class="meaning-label">정답 영단어</div><div class="meaning-text">${esc(w.en)}</div></div>`:''}</div></div><div class="confidence-row"><button type="button" class="confidence" data-confidence="hard">어려웠음</button><button type="button" class="confidence" data-confidence="easy">쉬웠음</button></div><button id="next" style="width:100%;margin-top:16px">${q.index+1===q.items.length?'결과 보기':'다음 문제'} →</button>`;// Force a committed 0fr frame before expanding. Both multiple-choice and input
// use the same DOM path; translated meanings remain fully masked until reveal.
 const currentFeedback=f;
 void currentFeedback.offsetHeight;
 requestAnimationFrame(()=>{
   if(!currentFeedback.isConnected)return;
   requestAnimationFrame(()=>{
     if(currentFeedback.isConnected)currentFeedback.classList.add('is-open');
   });
 });
$('#next').onclick=nextQuestion;$$('[data-confidence]').forEach(b=>b.onclick=()=>{schedule(w,mode,result.kind,b.dataset.confidence,elapsed);save();$$('[data-confidence]').forEach(x=>x.classList.toggle('selected',x===b))});
stopAdvance();
let remaining=5;
const nextButton=$('#next');
const updateCountdown=()=>{if(nextButton&&nextButton.isConnected)nextButton.innerHTML=`${q.index+1===q.items.length?'결과 보기':'다음 문제'} <span class="countdown-badge">${remaining}초</span> →`};
updateCountdown();
// The timeout is authoritative; the interval is only the visible countdown.
const currentSession=q;
countdownTimer=window.setInterval(()=>{
 if(session!==currentSession||!currentSession.checked){stopAdvance();return}
 remaining=Math.max(0,remaining-1);updateCountdown();
 if(remaining===0)nextQuestion();
},1000);
advanceTimer=window.setTimeout(()=>{if(session===currentSession&&currentSession.checked)nextQuestion()},5250);
}
let choosing=false;
$$('[data-choice]').forEach(b=>b.onclick=()=>{
 if(choosing||q.checked)return;
 choosing=true;
 b.classList.add('choice-selected');
 b.setAttribute('aria-pressed','true');
 $$('[data-choice]').forEach(x=>{x.disabled=true;if(x!==b)x.classList.add('choice-muted')});
 // Give the learner time to perceive their selection before revealing feedback.
 window.setTimeout(()=>{if(session===q&&!q.checked)check(b.dataset.choice)},360);
});if($('#check')){$('#check').onclick=()=>check($('#answer').value);$('#answer').onkeydown=e=>{if(e.key==='Enter')check($('#answer').value)};$('#answer').focus()}}
function words(){
 $('#words').innerHTML=`<div class="card"><div class="eyebrow">VOCABULARY</div><h2>교재 단어장</h2><p class="muted">DAY 1~50 · 총 2,000개 · 교재 원문 뜻</p><select id="wordDaySelect" aria-label="단어장 DAY">${days().map(d=>`<option value="${d}">DAY ${d} · 40개</option>`).join('')}</select><input id="wordSearch" placeholder="영단어 검색 (전체 DAY)" style="margin-top:10px" autocomplete="off"><div id="wordlist"></div></div>`;
 $('#wordDaySelect').onchange=e=>{ $('#wordSearch').value='';listWords(Number(e.target.value))};$('#wordSearch').oninput=e=>{const term=e.target.value.trim().toLowerCase();if(!term){listWords(Number($('#wordDaySelect').value));return}const a=state.words.filter(w=>w.en.toLowerCase().includes(term));$('#wordlist').innerHTML=a.slice(0,100).map(w=>`<div class="listitem"><strong>${esc(w.en)}</strong> <span class="muted">DAY ${w.day}</span><div class="muted">${esc(w.ko)}</div></div>`).join('')||'<p class="muted">검색 결과 없음</p>'};listWords(1);
}
function listWords(day){const a=state.words.filter(w=>w.day===day).sort((x,y)=>x.order-y.order);$('#wordlist').innerHTML=a.map(w=>`<div class="listitem"><div class="row"><strong><span class="number">${String(w.order).padStart(3,'0')}</span> ${esc(w.en)}</strong><span class="pill">DAY ${w.day}</span></div><div class="muted wordmeaning">${esc(w.ko)}</div><div class="muted" style="padding-left:35px">${reviewRecord(w,3)?'다음 회상: '+new Date(reviewRecord(w,3).due).toLocaleDateString('ko-KR'):'미학습'}</div></div>`).join('')}
function parseCSV(s){let out=[],row=[],v='',quoted=false;for(let i=0;i<s.length;i++){let c=s[i];if(c==='"'){if(quoted&&s[i+1]==='"'){v+='"';i++}else quoted=!quoted}else if(c===','&&!quoted){row.push(v);v=''}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&s[i+1]==='\n')i++;row.push(v);if(row.some(x=>x.trim()))out.push(row);row=[];v=''}else v+=c}row.push(v);if(row.some(x=>x.trim()))out.push(row);return out}
function history(){const s=stats();$('#history').innerHTML=`<div class="card"><h2>학습 통계</h2><div class="stats"><div class="stat"><strong>${s.total}</strong><span>총 풀이</span></div><div class="stat"><strong>${s.correct}</strong><span>정답</span></div><div class="stat"><strong>${s.wrong}</strong><span>오답·부분 정답</span></div></div><p class="muted">복습 예정 ${dayDueCount()}개 · 장기기억 후보 ${memoryCount()}개</p><h2 style="margin-top:24px">시험 방식별 정답률</h2>${[1,2,3,4].map(m=>{const a=state.results.filter(x=>x.mode===m),n=a.filter(x=>x.kind==='correct').length,p=a.length?Math.round(n/a.length*100):0;return `<div style="margin:15px 0"><div class="row"><span>${['','영→한 선택','한→영 선택','영→한 입력','한→영 입력'][m]}</span><span class="muted">${n}/${a.length} (${p}%)</span></div><div class="progress topgap"><div style="width:${p}%"></div></div></div>`}).join('')}</div><div class="card"><h2>최근 풀이</h2>${state.results.slice(-30).reverse().map(r=>`<div class="listitem row"><div><strong>${esc(r.en)}</strong><div class="muted">${esc(r.answer)} · ${new Date(r.date).toLocaleDateString('ko-KR')}</div></div><span class="pill">${{correct:'정답',wrong:'오답',partial:'부분 정답'}[r.kind]}</span></div>`).join('')||'<p class="muted">아직 시험 기록이 없습니다.</p>'}</div><div class="card"><h2>데이터 관리</h2><p class="muted">기록은 이 브라우저에만 저장됩니다. Safari 데이터를 삭제하거나 다른 기기를 사용하면 기록이 이전되지 않습니다.</p><button id="backup" class="secondary">전체 데이터 백업</button> <label>백업 복원(JSON)</label><input type="file" id="restore" accept=".json,application/json"><button class="danger topgap" id="clear">학습 기록 초기화</button></div>`;$('#backup').onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}));a.download='단어마스터_백업.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};$('#restore').onchange=async e=>{try{const obj=JSON.parse(await e.target.files[0].text());if(!Array.isArray(obj.words)||!Array.isArray(obj.results)||typeof obj.reviews!=='object'||!obj.reviews)throw Error();if(!confirm('현재 데이터를 백업 파일로 교체할까요?'))return;state.results=obj.results.filter(r=>validIds.has(r.wordId));state.reviews=Object.fromEntries(Object.entries(obj.reviews).filter(([id])=>validIds.has(id)));state.srs=Object.fromEntries(Object.entries(obj.srs||{}).filter(([id])=>validIds.has(id.split(':')[0])));state.notes=obj.notes||{};state.mistakes=obj.mistakes&&typeof obj.mistakes==='object'?Object.fromEntries(Object.entries(obj.mistakes).filter(([id])=>validIds.has(id))):{};for(const r of state.results){if(r.kind!=='correct'&&!state.mistakes[r.wordId])state.mistakes[r.wordId]={at:r.date,answer:r.answer,mode:r.mode}}state.mistakesMigrated=true;save();history()}catch{alert('올바른 백업 파일이 아닙니다.')}};$('#clear').onclick=()=>{if(confirm('시험 기록을 모두 삭제할까요? 단어장은 유지됩니다.')){state.results=[];state.reviews={};state.srs={};state.mistakes={};state.mistakesMigrated=true;save();history()}}}
if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));go('home');
