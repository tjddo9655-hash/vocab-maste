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
function nextQuestion(){stopAdvance();if(!session)return;session.index++;if(session.index===session.items.length&&session.retry.length){session.items.push(...session.retry.splice(0));}session.checked=false;showQuestion()}
function go(t){if(t!=='quiz')stopAdvance();tab=t;['home','quiz','words','history'].forEach(k=>$('#'+k).classList.toggle('hidden',k!==t));$$('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===t));render();window.scrollTo(0,0)}
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
function render(){if(tab==='home')home();if(tab==='quiz')quiz();if(tab==='words')words();if(tab==='history')history()}
function home(){const s=stats(),due=dayDueCount(),remembered=memoryCount();$('#home').innerHTML=`<div class="card hero"><div class="muted">PERSONAL VOCAB TRAINER</div><h2 style="font-size:27px;margin:8px 0">오늘의 기억 훈련</h2><p>새 단어를 외우고, 잊기 전에 다시 꺼내 보세요.</p><button id="startHome">DAY 학습 시작 →</button></div><div class="card"><div class="stats"><div class="stat"><strong>${due}</strong><span>복습 기한 도래</span></div><div class="stat"><strong>${remembered}</strong><span>장기기억 후보</span></div><div class="stat"><strong>${s.total?Math.round(s.correct/s.total*100):0}%</strong><span>누적 정답률</span></div></div><button id="dueHome" class="primary-cta" style="margin-top:16px">오늘의 복습 시작 →</button><p class="muted">복습 간격은 정답 이력에 따라 조정됩니다. 장기기억 후보는 7일 이상 간격으로 3회 연속 회상한 단어입니다.</p></div>`;$('#startHome').onclick=()=>go('quiz');$('#dueHome').onclick=()=>{go('quiz');const b=document.querySelector('[data-scope="due"]');if(b)b.click()}}
function quiz(){
 if(session){showQuestion();return}
 const d=days();
 $('#quiz').innerHTML=`<div class="card setup"><div class="eyebrow">PRACTICE · 단어 시험</div><h2>시험 설정</h2><p class="muted">워드마스터 DAY 1~50 · 2,000단어 · 교재 순서 그대로</p>
 <label>시험 방식</label><div class="seg-grid" id="modeBtns">${[['1','영어 → 한글 선택'],['2','한글 → 영어 선택'],['3','영어 → 한글 입력'],['4','한글 → 영어 입력']].map(([v,n])=>`<button type="button" class="seg-btn ${v==='3'?'selected':''}" data-mode="${v}">${n}</button>`).join('')}</div>
 <label>학습 DAY</label><select id="daySelect" aria-label="학습 DAY">${d.map(n=>`<option value="${n}">DAY ${n} · 40개</option>`).join('')}</select>
 <label>문제 수</label><div class="seg-grid" id="countBtns"><button type="button" class="seg-btn" data-count="10">10문제</button><button type="button" class="seg-btn" data-count="20">20문제</button><button type="button" class="seg-btn selected" data-count="40">40문제 · 전체</button></div><label>출제 순서</label><div class="seg-grid" id="orderBtns"><button type="button" class="seg-btn selected" data-order="book">교재 순서대로</button><button type="button" class="seg-btn" data-order="random">랜덤 출제</button></div>
 <label>시험 범위</label><div class="seg-grid" id="scopeBtns"><button type="button" class="seg-btn selected" data-scope="all">전체 단어</button><button type="button" class="seg-btn" data-scope="wrong">오답만</button><button type="button" class="seg-btn" data-scope="due">복습 예정</button><button type="button" class="seg-btn" data-scope="weak">취약 단어</button></div>
 <div class="note">20문제는 교재 순서상 앞 20개(랜덤 선택 시 무작위 20개)를 출제합니다. 오답만 선택하면 복습 대상만 출제합니다.</div>
 <p class="note" id="available"></p><button id="begin" class="primary-cta">시험 시작 <span>→</span></button></div>`;
 const settings={mode:'3',day:'1',order:'book',scope:'all',count:'40'};
 const getPool=()=>state.words.filter(w=>settings.scope==='due'||w.day===Number(settings.day)).filter(w=>{
 if(settings.scope==='wrong')return ['wrong','partial'].includes(state.reviews[w.id]?.last);
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
  pool=pool.slice(0,Number(settings.count));session={mode:Number(settings.mode),items:pool,index:0,answers:[],checked:false,started:now(),retry:[],retested:new Set()};showQuestion();
 };
}
function showQuestion(){stopAdvance();if(session)session.started=now();document.body.classList.remove("answer-revealed");const q=session;if(q.index>=q.items.length){const n=q.answers.filter(a=>a.kind==='correct').length;$('#quiz').innerHTML=`<div class="card"><h2>시험 완료</h2><div class="word">${n} / ${q.items.length}</div><p style="text-align:center">학습 진행률 100% · 정답률 ${Math.round(n/q.items.length*100)}%</p><button id="again" style="width:100%">다른 시험 보기</button></div>`;$('#again').onclick=()=>{stopAdvance();session=null;quiz()};return}const w=q.items[q.index], mode=q.mode;let question=mode===1||mode===3?w.en:meanings(w)[0];let done=q.index+(q.checked?1:0), pct=Math.round(done/q.items.length*1000)/10;let html=`<div class="card"><div class="row"><span class="pill">${q.index+1} / ${q.items.length}</span><span class="muted">DAY ${w.day} · ${['','영→한 선택','한→영 선택','영→한 입력','한→영 입력'][mode]}</span></div><div class="row topgap"><strong>학습 진행률 <span id="progressPercent">${pct}%</span></strong><span class="muted" id="progressCount">${done}문제 완료 · ${q.items.length-done}문제 남음</span></div><div class="progress topgap" role="progressbar" aria-label="학습 진행률" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" id="quizProgress"><div style="width:${pct}%" id="progressFill"></div></div><div class="word">${esc(question)}</div>`;
if(mode<=2){const target=mode===1?meanings(w)[0]:w.en;const others=state.words.filter(x=>x.id!==w.id&&Number(x.day)===Number(w.day)).sort(()=>Math.random()-.5).slice(0,3).map(x=>mode===1?meanings(x)[0]:x.en);const opts=[target,...others].sort(()=>Math.random()-.5);html+=`<div class="stack">${opts.map(o=>`<button class="choice" data-choice="${esc(o)}">${esc(o)}</button>`).join('')}</div>`}else html+=`<input id="answer" placeholder="정답을 입력하세요" autocomplete="off" autocapitalize="none" spellcheck="false"><button id="check" style="width:100%;margin-top:12px">채점하기</button>`;
html+=`<div id="feedback"></div></div><button class="secondary" id="quit">시험 종료</button>`;$('#quiz').innerHTML=html;$('#quit').onclick=()=>{if(confirm('시험을 종료할까요?')){stopAdvance();session=null;quiz()}};
function check(ans){if(q.checked)return;q.checked=true;document.body.classList.add("answer-revealed");if(document.activeElement&&document.activeElement.blur)document.activeElement.blur();let result=mode<=2?{kind:clean(ans)===clean(mode===1?meanings(w)[0]:w.en)?'correct':'wrong',why:'정답: '+(mode===1?meanings(w).join(', '):w.en)}:judge(w,ans,mode);const elapsed=now()-q.started;const record={id:Date.now()+Math.random(),wordId:w.id,en:w.en,mode,answer:ans,kind:result.kind,date:new Date().toISOString(),elapsed};state.results.push(record);q.answers.push(record);state.reviews[w.id]={last:result.kind,at:record.date};schedule(w,mode,result.kind,'normal',elapsed);if(result.kind!=='correct'&&!q.retested.has(w.id)){q.retested.add(w.id);q.retry.push(w)}save();const completed=q.index+1;const percentage=Math.round(completed/q.items.length*1000)/10;$('#progressPercent').textContent=percentage+'%';$('#progressCount').textContent=`${completed}문제 완료 · ${q.items.length-completed}문제 남음`;$('#progressFill').style.width=percentage+'%';$('#quizProgress').setAttribute('aria-valuenow',percentage);const f=$('#feedback');const name={correct:'정답',partial:'부분 정답',wrong:'오답'};f.innerHTML=`<div class="feedback ${result.kind==='correct'?'good':result.kind==='partial'?'partial':'bad'}"><div class="verdict-line"><span class="verdict-mark">${result.kind==='correct'?'✓':result.kind==='partial'?'△':'×'}</span><strong id="verdict">${name[result.kind]}</strong></div>${result.kind==='partial'?'<p class="muted">입력한 표현이 일부 일치합니다. 아래 뜻을 확인하세요.</p>':''}<div class="meaning-section"><div class="meaning-label">정식 뜻 <span>단어장에 등록된 의미</span></div><div class="meaning-text">${esc(w.ko)}</div></div>${acceptedMeanings(w).filter(x=>!pdfVariants(w.ko).some(y=>clean(x)===clean(y))).length?`<div class="meaning-section alt"><div class="meaning-label">추가 인정 표현</div><div class="meaning-text">${esc(acceptedMeanings(w).filter(x=>!pdfVariants(w.ko).some(y=>clean(x)===clean(y))).slice(0,3).join(" · "))}</div></div>`:""}${mode===4?`<div class="meaning-section"><div class="meaning-label">정답 영단어</div><div class="meaning-text">${esc(w.en)}</div></div>`:''}</div><div class="confidence-row"><button type="button" class="confidence" data-confidence="hard">어려웠음</button><button type="button" class="confidence" data-confidence="easy">쉬웠음</button></div><button id="next" style="width:100%;margin-top:16px">${q.index+1===q.items.length?'결과 보기':'다음 문제'} →</button>`;$('#next').onclick=nextQuestion;$$('[data-confidence]').forEach(b=>b.onclick=()=>{schedule(w,mode,result.kind,b.dataset.confidence,elapsed);save();$$('[data-confidence]').forEach(x=>x.classList.toggle('selected',x===b))});
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
$$('[data-choice]').forEach(b=>b.onclick=()=>check(b.dataset.choice));if($('#check')){$('#check').onclick=()=>check($('#answer').value);$('#answer').onkeydown=e=>{if(e.key==='Enter')check($('#answer').value)};$('#answer').focus()}}
function words(){
 $('#words').innerHTML=`<div class="card"><div class="eyebrow">VOCABULARY</div><h2>교재 단어장</h2><p class="muted">DAY 1~50 · 총 2,000개 · 교재 원문 뜻</p><select id="wordDaySelect" aria-label="단어장 DAY">${days().map(d=>`<option value="${d}">DAY ${d} · 40개</option>`).join('')}</select><input id="wordSearch" placeholder="영단어 검색 (전체 DAY)" style="margin-top:10px" autocomplete="off"><div id="wordlist"></div></div>`;
 $('#wordDaySelect').onchange=e=>{ $('#wordSearch').value='';listWords(Number(e.target.value))};$('#wordSearch').oninput=e=>{const term=e.target.value.trim().toLowerCase();if(!term){listWords(Number($('#wordDaySelect').value));return}const a=state.words.filter(w=>w.en.toLowerCase().includes(term));$('#wordlist').innerHTML=a.slice(0,100).map(w=>`<div class="listitem"><strong>${esc(w.en)}</strong> <span class="muted">DAY ${w.day}</span><div class="muted">${esc(w.ko)}</div></div>`).join('')||'<p class="muted">검색 결과 없음</p>'};listWords(1);
}
function listWords(day){const a=state.words.filter(w=>w.day===day).sort((x,y)=>x.order-y.order);$('#wordlist').innerHTML=a.map(w=>`<div class="listitem"><div class="row"><strong><span class="number">${String(w.order).padStart(3,'0')}</span> ${esc(w.en)}</strong><span class="pill">DAY ${w.day}</span></div><div class="muted wordmeaning">${esc(w.ko)}</div><div class="muted" style="padding-left:35px">${reviewRecord(w,3)?'다음 회상: '+new Date(reviewRecord(w,3).due).toLocaleDateString('ko-KR'):'미학습'}</div></div>`).join('')}
function parseCSV(s){let out=[],row=[],v='',quoted=false;for(let i=0;i<s.length;i++){let c=s[i];if(c==='"'){if(quoted&&s[i+1]==='"'){v+='"';i++}else quoted=!quoted}else if(c===','&&!quoted){row.push(v);v=''}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&s[i+1]==='\n')i++;row.push(v);if(row.some(x=>x.trim()))out.push(row);row=[];v=''}else v+=c}row.push(v);if(row.some(x=>x.trim()))out.push(row);return out}
function history(){const s=stats();$('#history').innerHTML=`<div class="card"><h2>학습 통계</h2><div class="stats"><div class="stat"><strong>${s.total}</strong><span>총 풀이</span></div><div class="stat"><strong>${s.correct}</strong><span>정답</span></div><div class="stat"><strong>${s.wrong}</strong><span>오답·부분 정답</span></div></div><p class="muted">복습 예정 ${dayDueCount()}개 · 장기기억 후보 ${memoryCount()}개</p><h2 style="margin-top:24px">시험 방식별 정답률</h2>${[1,2,3,4].map(m=>{const a=state.results.filter(x=>x.mode===m),n=a.filter(x=>x.kind==='correct').length,p=a.length?Math.round(n/a.length*100):0;return `<div style="margin:15px 0"><div class="row"><span>${['','영→한 선택','한→영 선택','영→한 입력','한→영 입력'][m]}</span><span class="muted">${n}/${a.length} (${p}%)</span></div><div class="progress topgap"><div style="width:${p}%"></div></div></div>`}).join('')}</div><div class="card"><h2>최근 풀이</h2>${state.results.slice(-30).reverse().map(r=>`<div class="listitem row"><div><strong>${esc(r.en)}</strong><div class="muted">${esc(r.answer)} · ${new Date(r.date).toLocaleDateString('ko-KR')}</div></div><span class="pill">${{correct:'정답',wrong:'오답',partial:'부분 정답'}[r.kind]}</span></div>`).join('')||'<p class="muted">아직 시험 기록이 없습니다.</p>'}</div><div class="card"><h2>데이터 관리</h2><p class="muted">기록은 이 브라우저에만 저장됩니다. Safari 데이터를 삭제하거나 다른 기기를 사용하면 기록이 이전되지 않습니다.</p><button id="backup" class="secondary">전체 데이터 백업</button> <label>백업 복원(JSON)</label><input type="file" id="restore" accept=".json,application/json"><button class="danger topgap" id="clear">학습 기록 초기화</button></div>`;$('#backup').onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}));a.download='단어마스터_백업.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};$('#restore').onchange=async e=>{try{const obj=JSON.parse(await e.target.files[0].text());if(!Array.isArray(obj.words)||!Array.isArray(obj.results)||typeof obj.reviews!=='object'||!obj.reviews)throw Error();if(!confirm('현재 데이터를 백업 파일로 교체할까요?'))return;state.results=obj.results.filter(r=>validIds.has(r.wordId));state.reviews=Object.fromEntries(Object.entries(obj.reviews).filter(([id])=>validIds.has(id)));state.srs=Object.fromEntries(Object.entries(obj.srs||{}).filter(([id])=>validIds.has(id.split(':')[0])));state.notes=obj.notes||{};save();history()}catch{alert('올바른 백업 파일이 아닙니다.')}};$('#clear').onclick=()=>{if(confirm('시험 기록을 모두 삭제할까요? 단어장은 유지됩니다.')){state.results=[];state.reviews={};state.srs={};save();history()}}}
if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));go('home');
