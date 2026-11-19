'use strict';
const KEY='vocabmaster-v1';
// 기존 샘플 데이터는 제거하고 DAY별 실제 40개 데이터로 초기화합니다.
let state;try{state=JSON.parse(localStorage.getItem(KEY))}catch{}
if(!state||!Array.isArray(state.words))state={words:[],results:[],reviews:{}};
state.results=Array.isArray(state.results)?state.results:[];
state.reviews=state.reviews&&typeof state.reviews==='object'?state.reviews:{};
// 제공된 PDF의 DAY 1~3, 120개 단어만 사용합니다.
const master=wordmasterData.map(w=>({...w,day:Number(w.day)}));
const validIds=new Set(master.map(w=>w.id));
state.words=master;
state.results=state.results.filter(r=>validIds.has(r.wordId));
state.reviews=Object.fromEntries(Object.entries(state.reviews).filter(([id])=>validIds.has(id)));
try{localStorage.setItem(KEY,JSON.stringify(state))}catch{}
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)], esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(state))}catch{alert('저장 공간이 부족하거나 브라우저 저장이 차단되었습니다.')}};
let tab='home', session=null, advanceTimer=null, countdownTimer=null;
function stopAdvance(){if(advanceTimer!==null){clearTimeout(advanceTimer);advanceTimer=null}if(countdownTimer!==null){clearInterval(countdownTimer);countdownTimer=null}}
function nextQuestion(){stopAdvance();if(!session)return;session.index++;session.checked=false;showQuestion()}
function go(t){if(t!=='quiz')stopAdvance();tab=t;['home','quiz','words','history'].forEach(k=>$('#'+k).classList.toggle('hidden',k!==t));$$('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===t));render();window.scrollTo(0,0)}
$$('[data-tab]').forEach(b=>b.onclick=()=>go(b.dataset.tab));
const meanings=w=>w.ko.split(/[;,；]/).map(x=>x.trim()).filter(Boolean);
const acceptedExtra={recognize:['알아채다','인식하다','알아보다'],encourage:['북돋우다','장려하다'],require:['필요하다'],reduce:['줄다','감소하다'],improve:['향상하다','개선하다'],develop:['발전하다','발달하다','개발하다'],provide:['제공','공급','준비']};
const acceptedMeanings=w=>[...new Set([...meanings(w),...(acceptedExtra[w.en.toLowerCase()]||[])])];
const clean=s=>String(s||'').toLowerCase().normalize('NFKC').replace(/[\s.,!?·()\-]/g,'').replace(/(하다|되다)$/,'');
function judge(w,answer,mode){const a=clean(answer);if(!a)return {kind:'wrong',why:'답을 입력하지 않았습니다.'};if(mode===4){return {kind:a===clean(w.en)?'correct':'wrong',why:'정답: '+w.en}}const ms=meanings(w);if(ms.some(m=>clean(m)===a))return {kind:'correct',why:'인정되는 뜻: '+ms.join(', ')};
// Only transparent, curated synonym pairs. No speculative fuzzy semantic acceptance.
const aliases={recognize:['인식하다','인지하다','알아채다','알아보다','인정하다'],encourage:['격려하다','장려하다','북돋우다','촉구하다','조장하다'],abandon:['버리다','포기하다'],achieve:['이루다','성취하다','달성하다'],require:['요구하다','필요하다'],increase:['늘다','늘리다','증가하다'],reduce:['줄다','줄이다','감소하다'],consider:['고려하다','생각하다'],provide:['제공하다','공급하다'],prevent:['막다','방지하다','예방하다'],improve:['개선하다','향상하다'],maintain:['유지하다','지속하다']};if((aliases[w.en.toLowerCase()]||[]).some(x=>clean(x)===a))return {kind:'correct',why:'의미가 같은 표현으로 인정했습니다.'};
if(acceptedMeanings(w).some(m=>clean(m)===a))return {kind:'correct',why:'같은 의미의 표현으로 인정했습니다.'};
if(ms.some(m=>clean(m).includes(a)&&a.length>=2))return {kind:'partial',why:'단어 일부만 일치합니다. 뜻을 확인하세요: '+ms.join(', ')};
return {kind:'wrong',why:'등록된 뜻: '+ms.join(', ')+'. 다른 동의어라면 직접 정답으로 변경할 수 있습니다.'}}
function days(){return [...new Set(state.words.map(w=>Number(w.day)||1))].sort((a,b)=>a-b)}
function stats(){const r=state.results;return {total:r.length,correct:r.filter(x=>x.kind==='correct').length,wrong:r.filter(x=>x.kind!=='correct').length}}
function render(){if(tab==='home')home();if(tab==='quiz')quiz();if(tab==='words')words();if(tab==='history')history()}
function home(){const s=stats(), due=state.words.filter(w=>state.reviews[w.id]?.last==='wrong'||state.reviews[w.id]?.last==='partial').length;$('#home').innerHTML=`<div class="card hero"><div class="muted">나의 학습 현황</div><h2 style="font-size:27px;margin:8px 0">오늘도 한 단어씩</h2><p>객관식 정답과 직접 떠올린 정답을 구분해서 기록합니다.</p><button style="background:white;color:#172b55" id="startHome">시험 시작</button></div><div class="card"><div class="stats"><div class="stat"><strong>${state.words.length}</strong><span>등록 단어</span></div><div class="stat"><strong>${s.total?Math.round(s.correct/s.total*100):0}%</strong><span>전체 정답률</span></div><div class="stat"><strong>${due}</strong><span>복습 필요</span></div></div></div>`;$('#startHome').onclick=()=>go('quiz')}
function quiz(){
 if(session){showQuestion();return}
 const d=days();
 $('#quiz').innerHTML=`<div class="card setup"><div class="eyebrow">PRACTICE · 단어 시험</div><h2>시험 설정</h2><p class="muted">첨부 PDF의 DAY 1~3 단어만 출제합니다.</p>
 <label>시험 방식</label><div class="seg-grid" id="modeBtns">${[['1','영어 → 한글 선택'],['2','한글 → 영어 선택'],['3','영어 → 한글 입력'],['4','한글 → 영어 입력']].map(([v,n])=>`<button type="button" class="seg-btn ${v==='3'?'selected':''}" data-mode="${v}">${n}</button>`).join('')}</div>
 <label>학습 DAY</label><div class="seg-grid" id="dayBtns">${d.map(n=>`<button type="button" class="seg-btn ${n===1?'selected':''}" data-day="${n}">DAY ${n}<small>40개</small></button>`).join('')}</div>
 <label>출제 순서</label><div class="seg-grid" id="orderBtns"><button type="button" class="seg-btn selected" data-order="book">교재 순서대로</button><button type="button" class="seg-btn" data-order="random">랜덤 출제</button></div>
 <label>시험 범위</label><div class="seg-grid" id="scopeBtns"><button type="button" class="seg-btn selected" data-scope="all">전체 단어</button><button type="button" class="seg-btn" data-scope="wrong">오답만</button></div>
 <div class="note">한 DAY의 단어 40개를 모두 출제합니다. 오답만 선택하면 해당 DAY의 복습 대상만 출제합니다.</div>
 <p class="note" id="available"></p><button id="begin" class="primary-cta">시험 시작 <span>→</span></button></div>`;
 const settings={mode:'3',day:'1',order:'book',scope:'all'};
 const getPool=()=>state.words.filter(w=>w.day===Number(settings.day)).filter(w=>settings.scope!=='wrong'||['wrong','partial'].includes(state.reviews[w.id]?.last));
 const update=()=>{const n=getPool().length;$('#available').textContent=`DAY ${settings.day} · ${n}개 출제 예정 / 전체 40개`;};
 for(const k of Object.keys(settings))$$(`[data-${k}]`).forEach(b=>b.onclick=()=>{settings[k]=b.dataset[k];$$(`[data-${k}]`).forEach(x=>x.classList.toggle('selected',x===b));update()});
 update();
 $('#begin').onclick=()=>{
  let pool=getPool();if(!pool.length){alert('선택한 DAY에 출제 가능한 단어가 없습니다.');return}
  pool=[...pool].sort((a,b)=>a.order-b.order);
  if(settings.order==='random')for(let i=pool.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]]}
  session={mode:Number(settings.mode),items:pool,index:0,answers:[],checked:false};showQuestion();
 };
}
function showQuestion(){stopAdvance();document.body.classList.remove("answer-revealed");const q=session;if(q.index>=q.items.length){const n=q.answers.filter(a=>a.kind==='correct').length;$('#quiz').innerHTML=`<div class="card"><h2>시험 완료</h2><div class="word">${n} / ${q.items.length}</div><p style="text-align:center">학습 진행률 100% · 정답률 ${Math.round(n/q.items.length*100)}%</p><button id="again" style="width:100%">다른 시험 보기</button></div>`;$('#again').onclick=()=>{stopAdvance();session=null;quiz()};return}const w=q.items[q.index], mode=q.mode;let question=mode===1||mode===3?w.en:meanings(w)[0];let done=q.index+(q.checked?1:0), pct=Math.round(done/q.items.length*1000)/10;let html=`<div class="card"><div class="row"><span class="pill">${q.index+1} / ${q.items.length}</span><span class="muted">DAY ${w.day} · ${['','영→한 선택','한→영 선택','영→한 입력','한→영 입력'][mode]}</span></div><div class="row topgap"><strong>학습 진행률 <span id="progressPercent">${pct}%</span></strong><span class="muted" id="progressCount">${done}문제 완료 · ${q.items.length-done}문제 남음</span></div><div class="progress topgap" role="progressbar" aria-label="학습 진행률" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" id="quizProgress"><div style="width:${pct}%" id="progressFill"></div></div><div class="word">${esc(question)}</div>`;
if(mode<=2){const target=mode===1?meanings(w)[0]:w.en;const others=state.words.filter(x=>x.id!==w.id&&Number(x.day)===Number(w.day)).sort(()=>Math.random()-.5).slice(0,3).map(x=>mode===1?meanings(x)[0]:x.en);const opts=[target,...others].sort(()=>Math.random()-.5);html+=`<div class="stack">${opts.map(o=>`<button class="choice" data-choice="${esc(o)}">${esc(o)}</button>`).join('')}</div>`}else html+=`<input id="answer" placeholder="정답을 입력하세요" autocomplete="off" autocapitalize="none" spellcheck="false"><button id="check" style="width:100%;margin-top:12px">채점하기</button>`;
html+=`<div id="feedback"></div></div><button class="secondary" id="quit">시험 종료</button>`;$('#quiz').innerHTML=html;$('#quit').onclick=()=>{if(confirm('시험을 종료할까요?')){stopAdvance();session=null;quiz()}};
function check(ans){if(q.checked)return;q.checked=true;document.body.classList.add("answer-revealed");if(document.activeElement&&document.activeElement.blur)document.activeElement.blur();let result=mode<=2?{kind:clean(ans)===clean(mode===1?meanings(w)[0]:w.en)?'correct':'wrong',why:'정답: '+(mode===1?meanings(w).join(', '):w.en)}:judge(w,ans,mode);const record={id:Date.now()+Math.random(),wordId:w.id,en:w.en,mode,answer:ans,kind:result.kind,date:new Date().toISOString()};state.results.push(record);q.answers.push(record);state.reviews[w.id]={last:result.kind,at:record.date};save();const completed=q.index+1;const percentage=Math.round(completed/q.items.length*1000)/10;$('#progressPercent').textContent=percentage+'%';$('#progressCount').textContent=`${completed}문제 완료 · ${q.items.length-completed}문제 남음`;$('#progressFill').style.width=percentage+'%';$('#quizProgress').setAttribute('aria-valuenow',percentage);const f=$('#feedback');const name={correct:'정답',partial:'부분 정답',wrong:'오답'};f.innerHTML=`<div class="feedback ${result.kind==='correct'?'good':result.kind==='partial'?'partial':'bad'}"><div class="verdict-line"><span class="verdict-mark">${result.kind==='correct'?'✓':result.kind==='partial'?'△':'×'}</span><strong id="verdict">${name[result.kind]}</strong></div>${result.kind==='partial'?'<p class="muted">입력한 표현이 일부 일치합니다. 아래 뜻을 확인하세요.</p>':''}<div class="meaning-section"><div class="meaning-label">정식 뜻 <span>단어장에 등록된 의미</span></div><div class="meaning-text">${esc(w.ko)}</div></div><div class="meaning-section alt"><div class="meaning-label">인정되는 뜻 <span>채점에 허용되는 표현</span></div><div class="meaning-text">${esc(acceptedMeanings(w).join(' · '))}</div></div>${mode===4?`<div class="meaning-section"><div class="meaning-label">정답 영단어</div><div class="meaning-text">${esc(w.en)}</div></div>`:''}</div><button id="next" style="width:100%;margin-top:16px">${q.index+1===q.items.length?'결과 보기':'다음 문제'} →</button>`;$('#next').onclick=nextQuestion;
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
 $('#words').innerHTML=`<div class="card"><div class="eyebrow">VOCABULARY</div><h2>교재 단어장</h2><p class="muted">첨부 PDF의 DAY 1~3, 총 120개 단어만 사용합니다.</p><div class="seg-grid" id="wordDayBtns">${days().map(d=>`<button class="seg-btn ${d===1?'selected':''}" data-wordday="${d}">DAY ${d}</button>`).join('')}</div><div id="wordlist"></div></div>`;
 $$('[data-wordday]').forEach(b=>b.onclick=()=>{$$('[data-wordday]').forEach(x=>x.classList.toggle('selected',x===b));listWords(Number(b.dataset.wordday))});listWords(1);
}
function listWords(day){const a=state.words.filter(w=>w.day===day).sort((x,y)=>x.order-y.order);$('#wordlist').innerHTML=a.map(w=>`<div class="listitem"><div class="row"><strong><span class="number">${String(w.order).padStart(3,'0')}</span> ${esc(w.en)}</strong><span class="pill">DAY ${w.day}</span></div><div class="muted wordmeaning">${esc(w.ko)}</div></div>`).join('')}
function parseCSV(s){let out=[],row=[],v='',quoted=false;for(let i=0;i<s.length;i++){let c=s[i];if(c==='"'){if(quoted&&s[i+1]==='"'){v+='"';i++}else quoted=!quoted}else if(c===','&&!quoted){row.push(v);v=''}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&s[i+1]==='\n')i++;row.push(v);if(row.some(x=>x.trim()))out.push(row);row=[];v=''}else v+=c}row.push(v);if(row.some(x=>x.trim()))out.push(row);return out}
function history(){const s=stats();$('#history').innerHTML=`<div class="card"><h2>학습 통계</h2><div class="stats"><div class="stat"><strong>${s.total}</strong><span>총 풀이</span></div><div class="stat"><strong>${s.correct}</strong><span>정답</span></div><div class="stat"><strong>${s.wrong}</strong><span>오답·부분 정답</span></div></div><h2 style="margin-top:24px">시험 방식별 정답률</h2>${[1,2,3,4].map(m=>{const a=state.results.filter(x=>x.mode===m),n=a.filter(x=>x.kind==='correct').length,p=a.length?Math.round(n/a.length*100):0;return `<div style="margin:15px 0"><div class="row"><span>${['','영→한 선택','한→영 선택','영→한 입력','한→영 입력'][m]}</span><span class="muted">${n}/${a.length} (${p}%)</span></div><div class="progress topgap"><div style="width:${p}%"></div></div></div>`}).join('')}</div><div class="card"><h2>최근 풀이</h2>${state.results.slice(-30).reverse().map(r=>`<div class="listitem row"><div><strong>${esc(r.en)}</strong><div class="muted">${esc(r.answer)} · ${new Date(r.date).toLocaleDateString('ko-KR')}</div></div><span class="pill">${{correct:'정답',wrong:'오답',partial:'부분 정답'}[r.kind]}</span></div>`).join('')||'<p class="muted">아직 시험 기록이 없습니다.</p>'}</div><div class="card"><h2>데이터 관리</h2><p class="muted">기록은 이 브라우저에만 저장됩니다. Safari 데이터를 삭제하거나 다른 기기를 사용하면 기록이 이전되지 않습니다.</p><button id="backup" class="secondary">전체 데이터 백업</button> <label>백업 복원(JSON)</label><input type="file" id="restore" accept=".json,application/json"><button class="danger topgap" id="clear">학습 기록 초기화</button></div>`;$('#backup').onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}));a.download='단어마스터_백업.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};$('#restore').onchange=async e=>{try{const obj=JSON.parse(await e.target.files[0].text());if(!Array.isArray(obj.words)||!Array.isArray(obj.results)||typeof obj.reviews!=='object'||!obj.reviews)throw Error();if(!confirm('현재 데이터를 백업 파일로 교체할까요?'))return;state.results=obj.results.filter(r=>validIds.has(r.wordId));state.reviews=Object.fromEntries(Object.entries(obj.reviews).filter(([id])=>validIds.has(id)));save();history()}catch{alert('올바른 백업 파일이 아닙니다.')}};$('#clear').onclick=()=>{if(confirm('시험 기록을 모두 삭제할까요? 단어장은 유지됩니다.')){state.results=[];state.reviews={};save();history()}}}
if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));go('home');
