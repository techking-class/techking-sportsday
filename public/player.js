/* 학생 화면 */
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} },
};

let myId = store.get('tk_id');
let roster = [];
let es = null;
let me = null;
let mountedKey = '';
let view = null;
const pending = {};   // 아직 서버에 안 보낸 연타 수 (종류별)

const joinView = document.getElementById('joinView');
const playView = document.getElementById('playView');
const nameInput = document.getElementById('nameInput');
nameInput.value = store.get('tk_name') || '';

document.getElementById('joinForm').addEventListener('submit', async e => {
  e.preventDefault();
  const err = document.getElementById('joinError');
  err.textContent = '';
  try {
    const res = await post('/api/join', { name: nameInput.value });
    myId = res.id;
    store.set('tk_id', myId);
    store.set('tk_name', res.name);
    start();
  } catch (ex) {
    err.textContent = ex.status ? ex.message : '서버에 연결할 수 없어요. 주소가 맞는지, 같은 와이파이인지 확인해 주세요.';
  }
});

function showJoin() {
  if (es) { es.close(); es = null; }
  showConn(true);
  joinView.hidden = false;
  playView.hidden = true;
  mountedKey = '';
}

let shell = null;
function buildShell() {
  const meLine = h('div', { class: 'me-line' });
  const top = hud();
  const content = h('div', {});
  const overlay = h('div', { class: 'overlay', hidden: '' });
  playView.replaceChildren(meLine, top.root, content, overlay);
  shell = { meLine, top, content, overlay, stamp: teamsStamp };
  mountedKey = '';
}
// 시작 화면에 팀 대표 이미지·이름 보여주기
function drawHero() {
  document.getElementById('heroA').src = MASCOT.red;
  document.getElementById('heroB').src = MASCOT.blue;
  document.getElementById('heroText').textContent = `친구들과 ${TEAM_KO.red} · ${euro(TEAM_KO.blue)} 나뉘어 겨뤄요`;
}
post('/api/teams', {}).then(cfg => { applyTeams(cfg); drawHero(); }).catch(() => {});

function start() {
  joinView.hidden = true;
  playView.hidden = false;
  buildShell();
  if (es) es.close();
  es = connect('/events?id=' + encodeURIComponent(myId), onMsg);
}

function onMsg(msg) {
  if (msg.kicked) { // 선생님이 내보냈어요
    myId = null; store.set('tk_id', null); showJoin();
    document.getElementById('joinError').textContent = '선생님이 게임에서 내보냈어요. 다시 참가하려면 이름을 쓰고 참가하기를 눌러요.';
    return;
  }
  if (msg.roster) roster = msg.roster;
  if (msg.teams) { applyTeams(msg.teams); drawHero(); }
  if (msg.me === null) { myId = null; store.set('tk_id', null); showJoin(); return; }
  me = msg.me;
  render(msg.s);
}

const ctx = {
  tap(type) { pending[type] = (pending[type] || 0) + 1; },
  act(type, data) { return post('/api/act', Object.assign({ id: myId, type }, data)).catch(() => {}); },
};
// 0.15초마다 모아서 한 번에 보내기 (서버 부담 줄이기)
setInterval(() => {
  if (!myId) return;
  for (const type of Object.keys(pending)) {
    const n = pending[type];
    if (n > 0) { pending[type] = 0; ctx.act(type, { n }); }
  }
}, 150);

let lastCount = -1;
function render(s) {
  if (shell.stamp !== teamsStamp) buildShell(); // 팀 이름·색·이미지가 바뀌면 화면을 새로 그려요
  setOnce(shell.meLine, me.team + me.name + s.eventName, () => [
    h('span', {}, teamTag(me.team), ' ', me.name), h('span', { text: s.eventName || '대기실' })]);
  shell.top.update(s);
  const key = s.phase === 'lobby' ? 'lobby' : s.phase === 'result' ? `result-${s.history.length}` : `game-${s.event}`;
  if (key !== mountedKey) { mountedKey = key; mount(s); }
  if (view && view.update) view.update(s, me, roster);
  const ov = shell.overlay;
  if (s.phase === 'countdown') {
    ov.hidden = false;
    if (s.countdown !== lastCount) {
      lastCount = s.countdown;
      ov.replaceChildren(h('div', { class: 'count' }, h('img', { src: MASCOT[me.team], alt: '' }), String(s.countdown),
        h('div', { class: 'count-name', text: `${s.eventName} 준비!` })));
    }
  } else { ov.hidden = true; lastCount = -1; }
}

function mount(s) {
  for (const k of Object.keys(pending)) pending[k] = 0;
  if (s.phase === 'lobby') view = lobby();
  else if (s.phase === 'result') view = { root: resultView(s, me.team) };
  else view = createGameView(s.event, ctx);
  shell.content.replaceChildren(view.root);
}

function lobby() {
  const tk = techking('선생님이 경기를 고르면 바로 시작해요. 우리 팀 친구들을 확인해 봐!', me.team);
  const big = h('div', { class: 'big-team' });
  const cols = h('div', { class: 'team-cols' });
  const hist = h('ul', { class: 'history' });
  let key = '';
  return {
    root: h('div', {}, big, tk.root, h('div', { class: 'box' }, cols), hist),
    update(s) {
      setOnce(big, me.team, () => [h('img', { class: 'big-mascot', src: MASCOT[me.team], alt: MASCOT_NAME[me.team] }), h('div', {}, '나는 ', teamTag(me.team), ' 이에요')]);
      tk.who(me.team);
      const k = roster.map(p => p.id + p.team + p.on + p.name).join() + me.id;
      if (k !== key) { key = k; cols.replaceChildren(...teamColumns(roster, me.id)); }
      hist.replaceChildren(...historyItems(s));
    },
  };
}

if (myId) start(); else showJoin();
