/* 학생·선생님 화면과 체험판이 함께 쓰는 도우미 */
const APP_VERSION = '2026-10-28b'; // 화면 파일 버전 (서버 버전과 같아야 해요)
const TK_SRC = typeof TK !== 'undefined' ? TK : 'techking.png';
const DANNY_SRC = typeof DANNY !== 'undefined' ? DANNY : 'dannyssam.png';
// 팀 이름·대표 이미지·색 (선생님이 바꿀 수 있어요. applyTeams로 갱신)
const TEAM_KO = { red: '테크킹팀', blue: '대니쌤팀' };
const MASCOT = { red: TK_SRC, blue: DANNY_SRC };
const MASCOT_NAME = { red: '테크킹', blue: '대니쌤' };
const DEFAULT_IMG = { red: TK_SRC, blue: DANNY_SRC };
const PALETTE = [
  { hex: '#ff4d4d', name: '빨강' }, { hex: '#2f7bff', name: '파랑' }, { hex: '#1fa85a', name: '초록' },
  { hex: '#ff8a1f', name: '주황' }, { hex: '#8b5cf6', name: '보라' }, { hex: '#f0509b', name: '분홍' },
  { hex: '#14a5d6', name: '하늘' }, { hex: '#9a6236', name: '갈색' }, { hex: '#2b3a67', name: '남색' }, { hex: '#555b66', name: '회색' },
];
let TEAMS_CFG = { red: { name: '테크킹팀', color: '#ff4d4d', img: null }, blue: { name: '대니쌤팀', color: '#2f7bff', img: null } };
let teamsStamp = 0; // 팀 설정이 바뀔 때마다 올라가요 (화면 다시 그리기 신호)
function applyTeams(cfg) {
  if (!cfg) return;
  TEAMS_CFG = JSON.parse(JSON.stringify(cfg));
  const root = document.documentElement;
  for (const k of ['red', 'blue']) {
    const c = cfg[k] || {};
    TEAM_KO[k] = c.name || TEAM_KO[k];
    MASCOT_NAME[k] = TEAM_KO[k].replace(/팀$/, '') || TEAM_KO[k];
    MASCOT[k] = c.img || DEFAULT_IMG[k];
    if (c.color) {
      root.style.setProperty('--' + k, c.color);
      root.style.setProperty('--' + k + '-soft', `color-mix(in srgb, ${c.color} 28%, var(--paper))`);
    }
  }
  teamsStamp++;
}
const EVENTS = [
  { id: 'tug', name: '전략 줄다리기', desc: '5개의 줄을 옮겨 다니며 당기기 · 3줄 먼저 (60초)' },
  { id: 'land', name: '땅따먹기', desc: '붙어 있는 칸만 차지 · 상대 땅은 두 번 (60초)' },
  { id: 'relay', name: '이어달리기', desc: '운동장을 한 바퀴씩 이어 달리기 · 응원 보너스' },
  { id: 'zone', name: '거점 점령전', desc: '움직여서 거점 5곳 점령 · 100점 먼저 (90초)' },
  { id: 'flip', name: '판뒤집기', desc: '상대 색 판을 뒤집어 우리 색으로 · 더 많이 (45초)' },
  { id: 'bak', name: '박 터트리기', desc: '주머니를 던져 흔들리는 박 맞히기 · 먼저 터뜨리기 (90초)' },
  { id: 'rps', name: '단체 가위바위보', desc: '팀원이 가장 많이 낸 손이 팀의 손 · 3판 먼저' },
  { id: 'meteor', name: '운석 피하기', desc: '사방에서 날아오는 운석 피하기 · 아이템 6종 · 쓰러진 친구 부활 (60초)' },
];
const TIPS = {
  tug: '줄을 눌러 옮겨 다닐 수 있어! 옮기면 0.8초 동안은 못 당겨. 한 줄에 우리 팀이 많을수록 세져. 5줄 중 3줄을 먼저 이기면 승리!',
  land: '노란 칸만 누를 수 있어. 상대 땅은 두 번 눌러야 뺏을 수 있지! ★ 본진은 못 뺏어.',
  relay: '운동장 한 바퀴가 한 구간이야! 내 차례엔 달리기, 기다릴 땐 응원하기로 우리 주자를 빠르게 해 줘!',
  zone: '운동장을 눌러서 이동해! 거점 안에 우리 팀이 더 많으면 점령돼. 점령한 거점마다 1초에 1점, 100점 먼저!',
  flip: '상대 팀 색깔 판을 눌러 우리 색으로 뒤집어! 끝났을 때 우리 색 판이 더 많으면 승리!',
  bak: '화면을 아래로 당겼다 놓으면 주머니가 날아가! 좌우로 흔들리는 우리 팀 박을 맞혀서 먼저 터뜨리자!',
  rps: '7초 안에 가위·바위·보 중 하나를 골라! 우리 팀에서 가장 많이 나온 손으로 승부해. 버튼 아래 숫자로 팀원들 생각을 읽어 봐!',
  meteor: '조이스틱(컴퓨터는 방향키)으로 운석을 피하면서 반짝이는 아이템을 주워! 쓰러진 팀원(✕) 옆에 2초 있으면 부활!',
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
// 받침에 맞는 조사: 으로/로
function euro(w) {
  const c = String(w).charCodeAt(String(w).length - 1);
  if (!(c >= 0xac00 && c <= 0xd7a3)) return w + '(으)로';
  const jong = (c - 0xac00) % 28;
  return w + (jong && jong !== 8 ? '으로' : '로');
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
      clock.lastChild.textContent = live ? (s.event === 'rps' ? '고르는 시간' : '남은 시간') : '누적 점수';
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
  const li = p => h('li', {
    class: (p.on ? '' : 'off') + (p.id === meId ? ' me' : ''), text: p.name,
    ...(onClick ? { onclick: () => onClick(p), title: '눌러서 팀 바꾸기·관전자·내보내기' } : {}),
  });
  const cols = ['red', 'blue'].map(team => {
    const list = roster.filter(p => p.team === team && !p.spec);
    return h('div', { class: `team-col t-${team}` },
      h('h3', { text: `${TEAM_KO[team]} ${list.filter(p => p.on).length}명` }),
      h('ul', {}, ...list.map(li)));
  });
  const specs = roster.filter(p => p.spec);
  if (specs.length) cols.push(h('div', { class: 'team-col spec-col' }, h('h3', { text: `👀 관전자 ${specs.filter(p => p.on).length}명` }), h('ul', {}, ...specs.map(li))));
  return cols;
}
function specTag() { return h('span', { class: 'tag spec', text: '👀 관전자' }); }
function historyItems(s) {
  return s.history.slice().reverse().map(x => h('li', { text: `${x.event}: ${x.winner === 'draw' ? '무승부' : TEAM_KO[x.winner] + ' 승'}` }));
}

/* 게임 중 화면 확대 막기 (두 번 탭·두 손가락 확대) */
(function preventZoom() {
  let lastTouchEnd = 0;
  document.addEventListener('touchend', e => {
    const t = Date.now();
    const el = e.target.closest ? e.target : e.target.parentElement;
    if (t - lastTouchEnd <= 350 && el && !el.closest('input, textarea')) {
      e.preventDefault(); // 확대를 막는 대신, 빠르게 연달아 누른 버튼은 직접 눌러 줘요
      const btn = el.closest('button, a, label');
      if (btn && !btn.classList.contains('tap') && !btn.classList.contains('cell')) btn.click();
    }
    lastTouchEnd = t;
  }, { passive: false });
  document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });
  for (const ev of ['gesturestart', 'gesturechange']) document.addEventListener(ev, e => e.preventDefault(), { passive: false });
})();

/* ---------- 팀 꾸미기 편집기 (선생님 화면·체험판) ---------- */
// 사진을 작게 줄여서 data URL로 만들기 (전송량 줄이기)
function shrinkImage(file, max = 160) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      let out = c.toDataURL('image/webp', 0.85);
      if (!out.startsWith('data:image/webp')) out = c.toDataURL('image/png');
      resolve(out);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('이미지를 읽을 수 없어요')); };
    img.src = url;
  });
}
function teamEditor(onSave) {
  let draft = JSON.parse(JSON.stringify(TEAMS_CFG));
  const root = h('div', { class: 'team-editor' });
  const msg = h('p', { class: 'hint' });
  function draw() {
    const cols = ['red', 'blue'].map(k => {
      const other = k === 'red' ? 'blue' : 'red';
      const d = draft[k];
      const name = h('input', { class: 'field-input small', maxlength: '8', value: d.name, 'aria-label': '팀 이름' });
      name.addEventListener('input', () => { d.name = name.value; });
      const preview = h('img', { class: 'te-img', src: d.img || DEFAULT_IMG[k], alt: '대표 이미지' });
      const file = h('input', { type: 'file', accept: 'image/*', hidden: '' });
      file.addEventListener('change', async () => {
        if (!file.files[0]) return;
        try { d.img = await shrinkImage(file.files[0]); draw(); } catch (e) { msg.textContent = e.message; }
      });
      const swatches = h('div', { class: 'swatches' }, ...PALETTE.map(c => {
        const used = draft[other].color.toLowerCase() === c.hex;
        const b = h('button', { type: 'button', class: 'swatch' + (d.color.toLowerCase() === c.hex ? ' on' : ''), title: used ? `${c.name} (상대 팀 색)` : c.name, 'aria-label': c.name, style: `background:${c.hex}` });
        if (used) b.disabled = true;
        b.addEventListener('click', () => { d.color = c.hex; draw(); });
        return b;
      }));
      return h('div', { class: 'te-col', style: `--team:${d.color}` },
        h('div', { class: 'te-head' }, preview,
          h('div', { class: 'te-btns' },
            h('button', { class: 'btn small ghost', type: 'button', text: '사진 바꾸기', onclick: () => file.click() }),
            h('button', { class: 'btn small ghost', type: 'button', text: '기본 이미지', onclick: () => { d.img = null; draw(); } }))),
        file, h('label', { class: 'te-label', text: '팀 이름' }), name, h('label', { class: 'te-label', text: '팀 색깔' }), swatches);
    });
    root.replaceChildren(h('div', { class: 'te-grid' }, ...cols),
      h('div', { class: 'controls' },
        h('button', { class: 'btn', type: 'button', text: '저장하기', onclick: async () => {
          for (const k of ['red', 'blue']) draft[k].name = (draft[k].name || '').trim() || (k === 'red' ? '테크킹팀' : '대니쌤팀');
          try { await onSave(JSON.parse(JSON.stringify(draft))); msg.textContent = '저장했어요! 모든 화면에 바로 적용돼요.'; } catch (e) { msg.textContent = '저장하지 못했어요: ' + e.message; }
        } }),
        h('button', { class: 'btn small ghost', type: 'button', text: '처음 설정으로', onclick: () => {
          draft = { red: { name: '테크킹팀', color: '#ff4d4d', img: null }, blue: { name: '대니쌤팀', color: '#2f7bff', img: null } }; draw();
        } })),
      msg);
  }
  draw();
  return { root, reload() { draft = JSON.parse(JSON.stringify(TEAMS_CFG)); draw(); } };
}

/* ---------- 참가자 관리 메뉴 (선생님: 팀 바꾸기 · 내보내기) ---------- */
function playerMenu(p, opts) {
  document.querySelectorAll('.pmenu-back').forEach(x => x.remove());
  const other = p.team === 'red' ? 'blue' : 'red';
  const close = () => back.remove();
  const moveBtn = h('button', { class: 'btn', type: 'button' }, teamIcon(other), `${euro(TEAM_KO[other])} 옮기기`);
  if (!opts.canMove) { moveBtn.disabled = true; }
  moveBtn.addEventListener('click', () => { opts.onMove(p); close(); });
  const kickBtn = h('button', { class: 'btn danger', type: 'button', text: '내보내기' });
  kickBtn.addEventListener('click', () => {
    if (kickBtn.dataset.sure) { opts.onKick(p); close(); return; }
    kickBtn.dataset.sure = '1'; kickBtn.textContent = '정말 내보낼까요? 한 번 더 누르기';
  });
  const specBtn = opts.onSpec ? h('button', { class: 'btn ghost', type: 'button', text: p.spec ? '🙋 선수로 돌아오기' : '👀 관전자로 바꾸기' }) : null;
  if (specBtn) specBtn.addEventListener('click', () => { opts.onSpec(p, !p.spec); close(); });
  const box = h('div', { class: 'pmenu box', role: 'dialog', 'aria-label': `${p.name} 관리` },
    h('div', { class: 'pmenu-head' }, p.spec ? specTag() : teamTag(p.team), ' ', h('b', { text: p.name }), p.on === false ? h('small', { text: ' (접속 끊김)' }) : null),
    p.spec ? null : moveBtn, p.spec || opts.canMove ? null : h('p', { class: 'hint', text: '경기 중에는 팀을 바꿀 수 없어요. 경기가 끝나면 바꿀 수 있어요.' }),
    specBtn,
    opts.onKick ? kickBtn : null,
    h('button', { class: 'btn small ghost', type: 'button', text: '닫기', onclick: close }));
  const back = h('div', { class: 'pmenu-back' }, box);
  back.addEventListener('click', e => { if (e.target === back) close(); });
  document.body.append(back);
}
