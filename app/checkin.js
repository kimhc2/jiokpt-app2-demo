// 학습 체크인 v2. 이 정의를 서버에 버전별로 고정 저장하고 각 응답에도 복사합니다.
const choice = (value, label, signal = '') => ({ value, label, ...(signal ? { signal } : {}) });
const item = (id, title, options, extra = {}) => ({ id, title, type: 'single', options, ...extra });
const when = (field, ...values) => ({ field, values });
const common = [
  { id: 'note', title: '추가로 남기고 싶은 말이 있나요?', type: 'text', max_length: 500, placeholder: '없으면 건너뛰어도 괜찮아요.' },
  item('contact', '따로 이야기 나누는 방법을 골라 주세요.', [choice('app','앱 답변'), choice('call','통화 희망','상담 요청'), choice('none','지금 불필요')]),
];
const adjustment = [choice('fine','지금대로 괜찮음'),choice('difficulty','문제 난이도','난이도 조정 요청'),choice('amount','목표 문제량','문제량 조정 요청'),choice('duration','한 번에 집중하는 시간','집중시간 조정 요청'),choice('time','시간대','시간대 조정 요청'),choice('technical','접속·기기 환경','기기 환경 확인'),choice('other','기타','조정 요청')];
const influence = [choice('participation','아이 참여 의사'),choice('method','수업·관리 방식'),choice('benefit','기대한 도움 체감 어려움'),choice('load','학습 부담'),choice('schedule','일정'),choice('cost','비용'),choice('expectation','안내와 실제 차이'),choice('other','기타')];
const form = (key, target, title, intro, base_count, items) => ({ key, version: 2, target, title, intro, base_count, items, common, thanks: '남겨 주신 내용은 담당 선생님이 확인하겠습니다. 공부와 리포트는 그대로 이용할 수 있어요.' });

export const CHECKIN_FORMS = {
  lesson: form('lesson','student','첫 수업 체크인','오늘 수업을 다음 수업에 맞추기 위한 짧은 확인이에요. 답하기 어려운 문항은 건너뛰어도 괜찮아요.',2,[
    item('understanding','오늘 수업 내용은 얼마나 이해됐나요?',[choice('mostly','대부분 이해'),choice('some','일부 재설명 필요','재설명 필요'),choice('hard','대부분 어려움','수업 이해 확인'),choice('unknown','아직 모름','경험 확인 필요')]),
    item('adjustment','다음 수업에서 가장 바뀌었으면 하는 것은?',[choice('fine','지금 방식 좋음'),choice('difficulty','문제 난이도','난이도 조정 요청'),choice('explanation','설명 방식','설명 방식 조정 요청'),choice('pace','수업 속도','수업 속도 조정 요청'),choice('questions','질문 기회·방법','수업 질문 방식 확인'),choice('communication','선생님과 대화 방식','대화 방식 확인'),choice('technical','접속·소리·화면','접속 환경 확인'),choice('other','기타','조정 요청')]),
    item('difficulty_direction','문제 난이도를 어떻게 바꾸면 좋을까요?',[choice('easier','더 쉽게'),choice('harder','더 어렵게'),choice('unknown','아직 잘 모르겠음')],{when:when('adjustment','difficulty')}),
    item('pace_direction','수업 속도를 어떻게 바꾸면 좋을까요?',[choice('slower','더 천천히'),choice('faster','더 빠르게'),choice('unknown','아직 잘 모르겠음')],{when:when('adjustment','pace')}),
    item('question_detail','수업 중 질문에서 어떤 점이 걸렸나요?',[choice('opportunity','질문할 기회가 부족했어요'),choice('burden','질문하기 부담스러웠어요'),choice('method','질문하는 방법을 잘 몰랐어요'),choice('other','기타')],{when:when('adjustment','questions')}),
    {id:'adjustment_detail',title:'어떤 점을 바꾸면 좋을지 조금 더 알려 주세요.',type:'text',max_length:500,when:when('adjustment','explanation','communication','technical','other')},
  ]),
  self_study: form('self_study','student','첫 지옥방 체크인','혼자 풀어 본 경험을 알려 주세요. 답을 보고 이후 수업과 과제를 맞춰 가겠습니다.',2,[
    item('independent_pattern','오늘 혼자 문제를 풀 때 가장 가까웠던 모습은?',[choice('independent','대부분 스스로 풀어나감'),choice('rethought','막혔지만 다시 생각해서 해결'),choice('marked','풀리지 않는 문제 표시 후 다른 문제 풀이'),choice('stuck','막힌 문제에서 오래 멈춤','장시간 정체 확인'),choice('start','어디서 시작할지 어려움','풀이 시작 확인')]),
    item('block_reason','가장 크게 막힌 이유는?',[choice('concept','필요한 개념이 안 떠오름'),choice('start','개념은 알지만 시작 어려움'),choice('next','풀이 중 다음 단계가 어려움'),choice('focus','집중 유지 어려움'),choice('unknown','잘 모름')],{when:when('independent_pattern','stuck','start')}),
    item('adjustment','오늘 지옥방에서 가장 조정이 필요한 것은?',adjustment),
  ]),
  week_student: form('week_student','student','첫 주 학습 체크인','이번 주에 실제로 경험한 공부를 돌아보는 시간이에요. 남겨 준 의견은 다음 학습을 조정하는 데 쓰겠습니다.',2,[
    item('helpful','이번 주 실제로 도움이 된 것은? 최대 2개',[choice('concept','개념 이해'),choice('independent','혼자 푸는 문제 생김'),choice('questions','질문 해결(수업 포함 전체 경험)'),choice('habit','공부 시작·지속'),choice('plan','계획한 공부 실행'),choice('unknown','아직 도움 모르겠음','도움 체감 확인'),choice('other','기타')],{type:'multi',max_choices:2,exclusive:['unknown']}),
    item('continuation','다음 주에도 지옥PT에서 공부하는 것에 대해?',[choice('continue','계속하고 싶음'),choice('adjust','바뀌었으면 하는 점 있음','다음 학습 조정 요청'),choice('consider','계속할지 고민','참여 의사 확인'),choice('stop','그만하고 싶음','중단 의사 확인'),choice('unknown','아직 모름','참여 판단 유보')]),
  ]),
  week_guardian: form('week_guardian','parent','첫 주 보호자 체크인','첫 경험을 바탕으로 다음 학습과 관리를 맞추려 합니다. 아직 판단하기 어려운 내용은 그대로 알려 주세요.',3,[
    item('expectation','가입 때 기대한 도움과 첫 주 경험은 얼마나 맞았나요?',[choice('match','대체로 맞음'),choice('partly','일부 다름','기대 차이 확인'),choice('different','많이 다름','기대 차이 확인'),choice('unknown','아직 판단 어려움','경험 판단 유보')]),
    item('expectation_detail','더 확인·조정할 부분은? 최대 2개',[choice('lesson','수업 수준·방식'),choice('habit','공부 습관·관리'),choice('amount','학습량'),choice('feedback','질문·피드백'),choice('load','아이 부담'),choice('exam','시험 준비 방향'),choice('product','안내받은 상품 구성'),choice('other','기타')],{type:'multi',max_choices:2,when:when('expectation','partly','different','unknown')}),
    item('visibility','앱 기록·안내로 학습 상황을 파악할 수 있었나요?',[choice('both','한 일과 다음 계획 모두 파악'),choice('past','한 일은 알지만 다음 계획 모름','다음 계획 안내 필요'),choice('unclear','한 일 파악 어려움','기록 설명 필요'),choice('missing','기록·안내 못 찾음','기록 접근 안내 필요'),choice('unseen','아직 자세히 못 봄','안내 확인 유보')]),
    item('continuation','다음 주 수강에 대한 생각은?',[choice('continue','그대로 진행'),choice('adjust','조정 후 진행','다음 학습 조정 요청'),choice('consider','고민 중','수강 의사 확인'),choice('stop','중단 희망','중단 의사 확인'),choice('unknown','판단 어려움','수강 판단 유보')]),
    item('continuation_detail','가장 큰 영향을 주는 것은? 최대 2개',influence,{type:'multi',max_choices:2,when:when('continuation','adjust','consider','stop')}),
  ]),
  resolution: form('resolution','student','바꾼 학습 확인','선생님이 조정한 방식으로 경험해 본 뒤의 의견을 알려 주세요.',1,[
    item('resolution','바뀐 방식으로 경험해 보니 어떠셨나요?',[choice('better','괜찮아짐'),choice('some','조금 나아짐','추가 조정 확인'),choice('same','그대로','미해결 확인'),choice('untried','아직 바뀐 방식 경험 전','변경 경험 대기')]),
  ]),
};
export const CHECKIN_COLUMNS = [
  {key:'lesson',title:'첫 수업 · 학생',when:'실제 첫 수업 이후',count:2},
  {key:'self_study',title:'첫 지옥방 · 학생',when:'실제 첫 지옥방 이후',count:2},
  {key:'week_student',title:'첫 주 · 학생',when:'첫 실제 경험 다음 날부터',count:2},
  {key:'week_guardian',title:'첫 주 · 보호자',when:'첫 실제 경험 다음 날부터',count:3},
];
export const CHECKIN_STATUS = {planned:'노출 예정',available:'답변 기다리는 중',deferred:'나중에',skipped:'건너뜀',partial:'일부 응답',answered:'응답 완료',superseded:'이전 응답 보관',expired:'노출 종료'};
const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function visibleItems(schema, answers = {}) {
  return schema.items.filter(it=>!it.when || it.when.values.some(v=>answers[it.when.field]?.value===v || answers[it.when.field]?.values?.includes(v)));
}
export function pruneAnswers(schema, answers = {}) {
  const ids=new Set([...visibleItems(schema,answers),...(schema.common||[])].map(x=>x.id));
  return Object.fromEntries(Object.entries(answers).filter(([k])=>ids.has(k)));
}
export function answerText(it, answer) {
  if (!answer) return '—';
  if (it.type==='text') return answer.text || '—';
  const values=answer.values || [answer.value];
  return values.map(v=>it.options.find(o=>o.value===v)?.label || '—').join(' / ');
}
export function checkinPrompt(row) {
  return `<div class="card checkin-prompt"><div class="row"><span style="font-size:24px">📝</span><div><b>${esc(row.schema.title)}</b><p class="muted small">기본 ${row.schema.base_count}문항 · 답변은 선택이에요</p></div></div><div class="row wrap" style="gap:8px;margin-top:12px"><button class="btn sm press" data-sv="${esc(row.id)}">답하기</button><button class="btn sm ghost press" data-ci-later="${esc(row.id)}">나중에</button><button class="btn sm ghost press" data-ci-skip="${esc(row.id)}">건너뛰기</button></div></div>`;
}

// 서버·앱·교직원 미리보기에서 같은 스키마를 사용. 학습 동선이나 보상과 연결하지 않는다.
export function mountCheckin(root, instance, {save,leave,onDone,preview=false} = {}) {
  const schema=instance.schema;
  let answers=structuredClone(instance.answers || {}), step=0, busy=false, error='';
  const context=instance.context || {};
  const render=()=>{
    answers=pruneAnswers(schema,answers);
    const items=visibleItems(schema,answers), final=step>=items.length;
    const it=items[step];
    const selected=it && (answers[it.id]?.values || [answers[it.id]?.value]);
    const common=schema.common || [];
    root.innerHTML=`<section class="checkin-view"><div class="row" style="justify-content:space-between"><button class="back press" data-back aria-label="이전">‹</button><span class="pill p-grape">${preview?'미리보기 · ':''}${esc(schema.title)}</span></div><p class="muted small" style="margin:12px 0">${esc(schema.intro)}</p>${context.adjustment ? `<div class="card"><b>이렇게 바꿨어요</b><p style="white-space:pre-wrap">${esc(context.adjustment)}</p>${context.next_plan?`<p class="muted small">다음 계획 · ${esc(context.next_plan)}</p>`:''}</div>`:''}
      <div class="bar" style="margin:16px 0"><i style="width:${Math.round(Math.min(step+1,items.length+1)*100/(items.length+1))}%"></i></div>
      ${final ? `<h2 style="font-size:21px">더 남기고 싶은 내용이 있나요?</h2><p class="muted small">아래 입력도 선택이에요. 아무것도 남기지 않으면 건너뜀으로 기록합니다.</p>${common.map(c=>c.type==='text'?`<label style="display:block;margin-top:16px">${esc(c.title)}<textarea class="memo" data-common="${c.id}" maxlength="${c.max_length||500}" placeholder="${esc(c.placeholder||'선택 입력')}">${esc(answers[c.id]?.text||'')}</textarea></label>`:`<label style="display:block;margin-top:16px">${esc(c.title)}<select class="sel" data-common="${c.id}"><option value="">선택하지 않음</option>${c.options.map(o=>`<option value="${o.value}" ${answers[c.id]?.value===o.value?'selected':''}>${esc(o.label)}</option>`).join('')}</select></label>`).join('')}`
      : `<div class="qTitle">${esc(it.title)}</div>${it.type==='multi'?`<p class="muted small">최대 ${it.max_choices||2}개 · 선택하지 않고 넘어가도 괜찮아요.</p>`:''}${it.type==='text'?`<textarea class="memo" data-text maxlength="${it.max_length||500}" placeholder="선택 입력">${esc(answers[it.id]?.text||'')}</textarea>`:it.options.map(o=>`<button class="cand press ${selected.includes(o.value)?'sel':''}" data-option="${o.value}" aria-pressed="${selected.includes(o.value)}">${esc(o.label)}</button>`).join('')}`}
      <p role="alert" class="error" ${error?'':'hidden'}>${esc(error)}</p><div class="stack" style="margin-top:18px"><button class="btn press" data-next ${busy?'disabled':''}>${busy?'저장 중…':final?(preview?'미리보기 마치기':'남긴 내용 전달하기'):'다음'}</button>${!final?'<button class="btn ghost press" data-skip>이 문항 건너뛰기</button>':''}<button class="btn ghost press" data-later ${busy?'disabled':''}>나중에</button></div></section>`;
    root.querySelector('[data-back]').onclick=()=>{if(busy)return;if(step>0){step--;error='';render();}else leave?.();};
    root.querySelectorAll('[data-option]').forEach(b=>b.onclick=()=>{
      if(busy)return;const value=b.dataset.option;error='';
      if(it.type==='multi'){
        let values=[...(answers[it.id]?.values||[])];
        if(values.includes(value))values=values.filter(v=>v!==value);
        else {if((it.exclusive||[]).includes(value))values=[];else values=values.filter(v=>!(it.exclusive||[]).includes(v));if(values.length>=(it.max_choices||2)){error=`최대 ${it.max_choices||2}개까지 골라 주세요.`;render();return;}values.push(value);}
        if(values.length)answers[it.id]={values};else delete answers[it.id];
      }else answers[it.id]={value};render();
    });
    const collect=()=>{
      const text=root.querySelector('[data-text]');if(text){if(text.value.trim())answers[it.id]={text:text.value.trim()};else delete answers[it.id];}
      root.querySelectorAll('[data-common]').forEach(el=>{const def=common.find(c=>c.id===el.dataset.common),value=el.value.trim();if(value)answers[def.id]=def.type==='text'?{text:value}:{value};else delete answers[def.id];});
    };
    const persist=async action=>{
      if(busy)return;collect();busy=true;error='';render();
      try {const result=await save?.({action,answers:pruneAnswers(schema,answers),revision:instance.revision||0});if(action==='defer')leave?.();else onDone?.(result || {status:'answered'});}
      catch(e){error=e.message || '저장하지 못했어요. 다시 시도해 주세요.';busy=false;render();}
    };
    root.querySelector('[data-next]').onclick=()=>{if(busy)return;collect();if(final)persist('submit');else{step++;error='';render();}};
    const skip=root.querySelector('[data-skip]');if(skip)skip.onclick=()=>{if(busy)return;delete answers[it.id];step++;error='';render();};
    root.querySelector('[data-later]').onclick=()=>persist('defer');
  };
  render();
  return {getAnswers:()=>structuredClone(answers)};
}
