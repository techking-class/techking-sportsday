/* 학생·선생님 화면과 체험판이 함께 쓰는 도우미 */
const TK_SRC = typeof TK !== 'undefined' ? TK : 'techking.png';
const DANNY_SRC = typeof DANNY !== 'undefined' ? DANNY : 'dannyssam.png';
const TEAM_KO = { red: '테크킹팀', blue: '대니쌤팀' };
const MASCOT = { red: TK_SRC, blue: DANNY_SRC };       // 팀마다 대표 캐릭터
const MASCOT_NAME = { red: '테크킹', blue: '대니쌤' };
const EVENTS = [
  { id: 'tug', name: '전략 줄다리기', desc: '5개의 줄을 옮겨 다니며 당기기 · 3줄 먼저 (60초)' },
  { id: 'land', name: '땅따먹기', desc: '붙어 있는 칸만 차지 · 상대 땅은 두 번 (60초)' },
  { id: 'relay', name: '이어달리기', desc: '운동장을 한 바퀴씩 이어 달리기 · 응원 보너스' },
  { id: 'zone', name: '거점 점령전', desc: '움직여서 거점 5곳 점령 · 100점 먼저 (90초)' },
  { id: 'nunchi', name: '눈치게임', desc: '친구와 겹치지 않게 숫자 외치기 · 3라운드' },
];
const TIPS = {
  tug: '줄을 눌러 옮겨 다닐 수 있어! 옮기면 0.8초 동안은 못 당겨. 한 줄에 우리 팀이 많을수록 세져. 5줄 중 3줄을 먼저 이기면 승리!',
  land: '노란 칸만 누를 수 있어. 상대 땅은 두 번 눌러야 뺏을 수 있지! ★ 본진은 못 뺏어.',
  relay: '운동장 한 바퀴가 한 구간이야! 내 차례엔 달리기, 기다릴 땐 응원하기로 우리 주자를 빠르게 해 줘!',
  zone: '운동장을 눌러서 이동해! 거점 안에 우리 팀이 더 많으면 점령돼. 점령한 거점마다 1초에 1점, 100점 먼저!',
  nunchi: '1부터 차례로 외쳐! 혼자 외치면 +1, 친구와 동시에 누르면 겹쳐서 −1, 끝까지 못 외치면 꼴찌 −1!',
};

function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const kid of kids) if (kid != null) e.append(kid);
  return e;
}
function svg(tag, attrs) {
  const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v);
  return e;
}

async function post(path, body) {
  const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  let data = {};
  try { data = await r.json(); } catch (e) {}
  if (!r.ok) throw Object.assign(new Error(data.error || '요청 실패'), { status: r.status });
  return data;
}
function showConn(ok) {
  let bar = document.querySelector('.conn');
  if (!bar) { bar = h('div', { class: 'conn', text: '서버와 다시 연결하는 중…' }); document.body.append(bar); }
  bar.hidden = ok;
}
function connect(url, onMsg) {
  const es = new EventSource(url);
  es.onopen = () => showConn(true);
  es.onerror = () => showConn(false);
  es.onmessage = e => { try { onMsg(JSON.parse(e.data)); } catch (err) { console.error(err); } };
  return es;
}
function initial(name) { return (name || '?').slice(0, 1); }
function teamIcon(team) { return h('img', { class: 'tag-ic', src: MASCOT[team], alt: '' }); }
function teamTag(team, text) { return h('span', { class: `tag t-${team}` }, teamIcon(team), text == null ? TEAM_KO[team] : text); }
// 내용이 바뀔 때만 다시 그리기 (깜빡임 방지)
function setOnce(el, key, build) { if (el._k !== key) { el._k = key; el.replaceChildren(...build()); } }

/* 점수판 */
function hud() {
  const red = h('div', { class: 'score red t-red' }, h('span', { class: 'score-name' }, teamIcon('red'), TEAM_KO.red), h('b', { text: '0' }));
  const blue = h('div', { class: 'score blue t-blue' }, h('span', { class: 'score-name' }, TEAM_KO.blue, teamIcon('blue')), h('b', { text: '0' }));
  const clock = h('div', { class: 'clock' }, h('span', { text: '' }), h('small', { text: '남은 시간' }));
  return {
    root: h('div', { class: 'hud' }, red, clock, blue),
    update(s) {
      red.querySelector('b').textContent = s.scores.red;
      blue.querySelector('b').textContent = s.scores.blue;
      const live = s.phase === 'playing' || s.phase === 'countdown';
      clock.firstChild.textContent = live ? s.timeLeft : '—';
      clock.lastChild.textContent = live ? (s.event === 'nunchi' ? '라운드 시간' : '남은 시간') : '누적 점수';
    },
  };
}

/* 테크킹 말풍선 */
function techking(text, team) {
  const b = h('div', { class: 'bubble', text });
  const img = h('img', { src: MASCOT[team] || TK_SRC, alt: MASCOT_NAME[team] || '테크킹' });
  return {
    root: h('div', { class: 'techking' }, img, b),
    say(t) { if (b.textContent !== t) b.textContent = t; },
    who(tm) { const src = MASCOT[tm] || TK_SRC; if (img.getAttribute('src') !== src) { img.src = src; img.alt = MASCOT_NAME[tm]; } }, // 우리 팀 캐릭터가 말해요
  };
}

function resultView(s, myTeam) {
  const w = s.winner;
  const title = w === 'draw' ? h('h2', { text: '무승부!' }) : h('h2', {}, teamTag(w), ' 승리!');
  const faces = h('div', { class: 'result-faces' }, ...(w === 'draw' ? ['red', 'blue'] : [w]).map(t => h('img', { src: MASCOT[t], alt: MASCOT_NAME[t] })));
  let line = '';
  if (myTeam && w !== 'draw') line = myTeam === w ? '우리 팀 최고야! +100점' : '다음 경기에서 역전하자!';
  if (w === 'draw') line = '두 팀 모두 +50점!';
  return h('div', { class: 'result box' },
    faces,
    h('div', { text: s.eventName }), title,
    h('p', { text: s.note }), line ? h('div', { text: line }) : null);
}

function teamColumns(roster, meId, onClick) {
  return ['red', 'blue'].map(team => {
    const list = roster.filter(p => p.team === team);
    return h('div', { class: `team-col t-${team}` },
      h('h3', { text: `${TEAM_KO[team]} ${list.filter(p => p.on).length}명` }),
      h('ul', {}, ...list.map(p => h('li', {
        class: (p.on ? '' : 'off') + (p.id === meId ? ' me' : ''), text: p.name,
        ...(onClick ? { onclick: () => onClick(p), title: '눌러서 팀 바꾸기' } : {}),
      }))));
  });
}
function historyItems(s) {
  return s.history.slice().reverse().map(x => h('li', { text: `${x.event}: ${x.winner === 'draw' ? '무승부' : TEAM_KO[x.winner] + ' 승'}` }));
}
