/* 선생님 진행 화면 */
let pin = null;
try { pin = sessionStorage.getItem('tk_pin'); } catch (e) {}
let picked = 'tug';
let roster = [];
let stageKey = '';
let stageView = null;
let ui = null;

document.getElementById('pinForm').addEventListener('submit', async e => {
  e.preventDefault();
  const v = document.getElementById('pinInput').value.trim();
  try {
    await post('/api/host', { pin: v, cmd: 'ping' });
    pin = v;
    try { sessionStorage.setItem('tk_pin', pin); } catch (err) {}
    openDash();
  } catch (ex) {
    document.getElementById('pinError').textContent = ex.status === 403 ? 'PIN이 맞지 않아요. 서버 창의 숫자를 확인하세요.' : '서버에 연결할 수 없어요.';
  }
});

function cmd(name, extra) {
  return post('/api/host', Object.assign({ pin, cmd: name }, extra)).catch(ex => alert(ex.message));
}

let addr = location.origin;
let decoOpen = false;
async function openDash() {
  document.getElementById('login').hidden = true;
  document.getElementById('dash').hidden = false;
  if (/localhost|127\.0\.0\.1/.test(location.hostname)) {
    try { const info = await post('/api/info', {}); if (info.addresses[0]) addr = info.addresses[0]; } catch (e) {}
  }
  buildDash();
  connect('/events?host=' + encodeURIComponent(pin), onMsg);
}

function buildDash() {
  const dash = document.getElementById('dash');
  const top = hud();
  const joinUrl = h('div', { class: 'join-url' }, h('small', { text: '학생 접속 주소' }), addr.replace(/^https?:\/\//, ''));
  const count = h('div', { class: 'big-team' });

  const cards = EVENTS.map(ev => {
    const c = h('button', { class: 'event-card', type: 'button', 'aria-pressed': String(ev.id === picked) },
      h('b', { text: ev.name }), h('span', { text: ev.desc }));
    c.addEventListener('click', () => { picked = ev.id; cards.forEach((x, k) => x.setAttribute('aria-pressed', String(EVENTS[k].id === picked))); });
    return c;
  });
  const startBtn = h('button', { class: 'btn', type: 'button', text: '경기 시작', onclick: () => cmd('start', { event: picked }) });
  const stopBtn = h('button', { class: 'btn ghost', type: 'button', text: '지금 끝내기', onclick: () => cmd('stop') });
  const lobbyBtn = h('button', { class: 'btn ghost', type: 'button', text: '대기실로', onclick: () => cmd('lobby') });
  const shuffleBtn = h('button', { class: 'btn small ghost', type: 'button', text: '팀 다시 섞기', onclick: () => cmd('shuffle') });
  const cleanBtn = h('button', { class: 'btn small ghost', type: 'button', text: '나간 친구 정리', onclick: () => cmd('clean') });
  const resetBtn = h('button', { class: 'btn small ghost', type: 'button', text: '점수 초기화', onclick: () => { if (confirm('누적 점수를 0으로 되돌릴까요?')) cmd('resetScores'); } });

  const cols = h('div', { class: 'team-cols host-roster' });
  const editor = teamEditor(async cfg => { await post('/api/host', { pin, cmd: 'teams', teams: cfg }); });
  const deco = h('details', { class: 'box deco' }, h('summary', { text: '🎨 팀 꾸미기 (이름 · 색깔 · 대표 이미지)' }), editor.root);
  if (decoOpen) deco.open = true;
  deco.addEventListener('toggle', () => { decoOpen = deco.open; });
  const hist = h('ul', { class: 'history' });
  const stage = h('div', { class: 'box stage' });

  dash.replaceChildren(
    h('div', { class: 'host-top' }, joinUrl, h('div', { class: 'host-hud' }, top.root)),
    h('div', { class: 'host-grid' },
      h('div', {},
        h('div', { class: 'event-pick' }, ...cards),
        h('div', { class: 'controls' }, startBtn, stopBtn, lobbyBtn),
        h('div', { class: 'box', style: 'margin-top:16px' }, count, cols,
          h('p', { class: 'hint', text: '이름을 누르면 팀 바꾸기 · 관전자로 바꾸기 · 내보내기를 할 수 있어요.' }),
          h('div', { class: 'controls' }, shuffleBtn, cleanBtn, resetBtn)),
        deco, hist),
      stage));
  ui = { top, count, cols, hist, stage, startBtn, stopBtn, shuffleBtn, stamp: teamsStamp };
  stageKey = ''; rosterKey = '';
}

let rosterKey = '';
function onMsg(msg) {
  if (msg.roster) roster = msg.roster;
  if (msg.teams) applyTeams(msg.teams);
  if (ui.stamp !== teamsStamp) buildDash(); // 팀 설정이 바뀌면 다시 그리기
  const s = msg.s;
  ui.top.update(s);
  const live = s.phase === 'playing' || s.phase === 'countdown';
  ui.startBtn.disabled = live;
  ui.stopBtn.disabled = !live;
  ui.shuffleBtn.disabled = live;
  const on = roster.filter(p => p.on && !p.spec).length, specOn = roster.filter(p => p.on && p.spec).length;
  const c = s.counts;
  ui.count.textContent = `지금 ${on}명 참가 중` + (specOn ? ` · 👀 관전 ${specOn}명` : '') + (c.red !== c.blue ? ` · ⚖ ${c.red}:${c.blue} 인원 자동 보정 중` : '');

  const k = roster.map(p => p.id + p.team + p.on + p.name + p.spec).join();
  if (k !== rosterKey || ui.live !== live) {
    rosterKey = k; ui.live = live;
    ui.cols.replaceChildren(...teamColumns(roster, null, p => playerMenu(p, {
      canMove: !live,
      onMove: q => cmd('move', { id: q.id }),
      onSpec: (q, on) => cmd('spec', { id: q.id, on }),
      onKick: q => cmd('kick', { id: q.id }),
    })));
  }
  ui.hist.replaceChildren(...historyItems(s));

  const key = s.phase === 'lobby' ? 'lobby' : s.phase === 'result' ? `result-${s.history.length}` : `game-${s.event}`;
  if (key !== stageKey) {
    stageKey = key;
    if (s.phase === 'lobby') {
      const tk = techking('');
      stageView = {
        root: h('div', {}, tk.root, h('p', { class: 'tap-hint', text: '왼쪽에서 경기를 고르고 [경기 시작]을 누르세요. 3초 카운트다운 후 시작돼요.' })),
        update() { tk.say(on ? `${on}명이 모였어! ${TEAM_KO.red} 대 ${TEAM_KO.blue}, 누가 이길까?` : '학생들이 위 주소로 들어오면 여기에 이름이 나타나요.'); },
      };
    } else if (s.phase === 'result') {
      stageView = { root: resultView(s, null) };
    } else {
      const v = createGameView(s.event, null);
      const head = h('h2', { class: 'stage-title', text: s.eventName });
      const cd = h('div', { class: 'stage-count' });
      stageView = {
        root: h('div', {}, head, cd, v.root, h('p', { class: 'tap-hint', text: TIPS[s.event] })),
        update(st) { cd.textContent = st.phase === 'countdown' ? `${st.countdown}…` : ''; cd.hidden = st.phase !== 'countdown'; v.update(st, null, roster); },
      };
    }
    ui.stage.replaceChildren(stageView.root);
  }
  if (stageView.update) stageView.update(s);
}

if (pin) {
  post('/api/host', { pin, cmd: 'ping' }).then(openDash).catch(() => { try { sessionStorage.removeItem('tk_pin'); } catch (e) {} });
}
