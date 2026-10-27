/*
 * 경기 화면 5종목
 * createGameView(종목, ctx)  — ctx가 있으면 학생이 조작하는 화면, 없으면(null) 선생님 관전 화면
 * ctx = { tap(종류), act(종류, 데이터) }
 */
function createGameView(ev, ctx) {
  const make = { tug: tugGame, land: landGame, relay: relayGame, zone: zoneGame, flip: flipGame, meteor: meteorGame, rps: rpsGame, bak: bakGame }[ev];
  return make(ctx);
}

function tapButton(ctx, type, label, extraClass) {
  const btn = h('button', { class: 'tap ' + (extraClass || ''), type: 'button', text: label });
  btn.addEventListener('pointerdown', e => {
    e.preventDefault();
    if (btn.disabled) return;
    if (btn.dataset.mode === 'baton') { ctx.act('baton'); return; }
    ctx.tap(type);
    btn.classList.add('hit');
    setTimeout(() => btn.classList.remove('hit'), 60);
    if (navigator.vibrate) navigator.vibrate(8);
  });
  btn.addEventListener('contextmenu', e => e.preventDefault());
  return btn;
}
function meter(labelText) {
  const fill = h('i'), bar = h('div', { class: 'meter-bar' }, fill);
  const val = h('span');
  const root = h('div', { class: 'meter' }, h('label', {}, h('span', { text: labelText }), val), bar);
  return { root, set(pct, text, low) { fill.style.width = Math.max(0, Math.min(100, pct)) + '%'; val.textContent = text; bar.classList.toggle('low', !!low); } };
}

/* ① 전략 줄다리기 — 줄 5개 */
function tugGame(ctx) {
  const lanes = [];
  const box = h('div', { class: 'ropes' });
  for (let k = 0; k < 5; k++) {
    const flag = h('div', { class: 'rope-flag' });
    const line = h('div', { class: 'rope-line' }, flag);
    const cR = h('span', { class: 'rope-count red' }, teamIcon('red'), h('span')), cB = h('span', { class: 'rope-count blue' }, h('span'), teamIcon('blue'));
    const done = h('div', { class: 'rope-done' });
    const me = h('span', { class: 'rope-me', text: '👑 나' });
    const lane = h(ctx ? 'button' : 'div', { class: 'rope-lane', type: 'button', 'aria-label': `${k + 1}번 줄로 이동` },
      h('div', { class: 'rope-zone red' }), h('div', { class: 'rope-zone blue' }), h('div', { class: 'rope-mid' }),
      line, h('span', { class: 'rope-num', text: `${k + 1}번` }), cR, cB, me, done);
    if (ctx) lane.addEventListener('click', () => ctx.act('rope', { k }));
    lanes.push({ lane, line, cR, cB, done });
    box.append(lane);
  }
  const summary = h('div', { class: 'rope-summary' });
  const layer = h('div', { class: 'rope-layer', 'aria-hidden': 'true' }); // 친구들 캐릭터가 올라가는 층
  box.append(layer);
  const avatars = new Map();
  const tk = techking(TIPS.tug);

  // 친구들이 어느 줄에서 당기고 있는지 실시간으로 그리기
  function drawPeople(s, me, roster) {
    const T = s.tug, names = new Map((roster || []).map(p => [p.id, p.name]));
    const groups = new Map();
    for (const w of T.who) {
      const key = w[1] + w[2];
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(w);
    }
    const tops = lanes.map(L => L.lane.offsetTop + L.lane.offsetHeight * 0.64);
    const seen = new Set();
    for (const list of groups.values()) {
      list.sort((a, b) => (a[0] < b[0] ? -1 : 1));
      const n = list.length, gap = Math.min(6.5, 32 / Math.max(1, n));
      list.forEach(([id, k, team, moving, pulling], j) => {
        seen.add(id);
        let a = avatars.get(id);
        if (!a) { a = h('div', { class: 'avatar tug-av' }); layer.append(a); avatars.set(id, a); }
        const flagX = 50 + T.ropes[k].pos * 0.38;
        const x = team === 'red' ? flagX - 4.5 - j * gap : flagX + 4.5 + j * gap;
        const cls = `avatar tug-av t-${team}` + (me && me.id === id ? ' me' : '') + (moving ? ' moving' : '') + (pulling && !moving ? ' pull' : '');
        if (a.className !== cls) a.className = cls;
        const txt = initial(names.get(id));
        if (a.textContent !== txt) a.textContent = txt;
        a.style.left = Math.max(2, Math.min(98, x)) + '%';
        a.style.top = tops[k] + 'px';
      });
    }
    for (const [id, a] of avatars) if (!seen.has(id)) { a.remove(); avatars.delete(id); }
  }

  if (!ctx) return { root: h('div', {}, summary, box), update(s, me, roster) { draw(s, null); drawPeople(s, null, roster); } };

  const btn = tapButton(ctx, 'tap', '당기기!');
  const power = meter('힘');
  const mates = h('div', { class: 'rope-mates' });
  function draw(s, me) {
    const T = s.tug;
    T.ropes.forEach((r, k) => {
      const L = lanes[k];
      L.line.style.transform = `translateX(${(r.pos * 0.19).toFixed(1)}%)`; // 줄 길이가 칸의 2배라 0.19 → 깃발이 ±38% 이동
      L.cR.lastChild.textContent = r.red;
      L.cB.firstChild.textContent = r.blue;
      L.done.textContent = r.winner ? `${TEAM_KO[r.winner]} 승!` : '';
      L.lane.classList.toggle('won-red', r.winner === 'red');
      L.lane.classList.toggle('won-blue', r.winner === 'blue');
      L.lane.classList.toggle('mine', !!me && me.rope === k);
    });
    setOnce(summary, T.wins.red + ':' + T.wins.blue, () => [
      teamTag('red', `${T.wins.red}줄`), ' 3줄을 먼저 이기면 승리 ', teamTag('blue', `${T.wins.blue}줄`)]);
  }
  return {
    root: h('div', {}, summary, box, h('div', { class: 'pad' }, btn, power.root), mates, tk.root),
    update(s, me, roster) {
      draw(s, me);
      drawPeople(s, me, roster);
      // 내 줄에 누가 있는지
      const names = new Map((roster || []).map(p => [p.id, p.name]));
      const here = s.tug.who.filter(w => w[1] === me.rope && w[0] !== me.id);
      const ours = here.filter(w => w[2] === me.team).map(w => names.get(w[0]) || '?');
      const theirs = here.filter(w => w[2] !== me.team).map(w => names.get(w[0]) || '?');
      const other = me.team === 'red' ? 'blue' : 'red';
      setOnce(mates, me.rope + '|' + ours.join() + '|' + theirs.join(), () => [
        h('b', { text: `${me.rope + 1}번 줄 현황` }),
        h('div', {}, teamIcon(me.team), ours.length ? `나 + ${ours.join(', ')}` : '나 혼자 당기는 중'),
        h('div', {}, teamIcon(other), theirs.length ? theirs.join(', ') : '상대 팀 없음')]);
      btn.className = `tap t-${me.team}`;
      const live = s.phase === 'playing';
      btn.disabled = !live || me.exhausted || me.moving || me.ropeDone;
      btn.textContent = me.ropeDone ? '다른 줄로 이동!' : me.moving ? '줄 옮기는 중…' : me.exhausted ? '숨 고르는 중…' : `${me.rope + 1}번 줄 당기기!`;
      power.set(me.stamina, String(me.stamina), me.stamina < 30);
      tk.who(me.team);
      tk.say(me.ropeDone ? '이 줄은 승부가 났어! 위에서 다른 줄을 눌러 옮겨 가자.' : TIPS.tug);
    },
  };
}

/* ② 땅따먹기 */
function landGame(ctx) {
  const grid = h('div', { class: 'land-grid' });
  const count = h('div', { class: 'land-count' }, h('span'), h('span'));
  let n = 0, cellsEl = [], lastS = null;
  function build(size) {
    n = size;
    grid.style.gridTemplateColumns = `repeat(${n}, 1fr)`;
    cellsEl = [];
    for (let i = 0; i < n * n; i++) {
      const b = h('button', { class: 'cell', type: 'button', 'aria-label': `${Math.floor(i / n) + 1}행 ${i % n + 1}열` });
      if (ctx) {
        b.addEventListener('pointerdown', e => {
          e.preventDefault();
          if (!lastS || lastS.phase !== 'playing' || !b.classList.contains('can')) return;
          b.classList.add('flash');
          setTimeout(() => b.classList.remove('flash'), 250);
          if (navigator.vibrate) navigator.vibrate(10);
          ctx.act('cell', { i });
        });
      } else b.tabIndex = -1;
      cellsEl.push(b);
    }
    grid.replaceChildren(...cellsEl);
  }
  const tk = ctx ? techking(TIPS.land) : null;
  return {
    root: h('div', {}, grid, count, tk && tk.root),
    update(s, me) {
      lastS = s;
      const L = s.land;
      if (L.n !== n) build(L.n);
      const own = me ? (me.team === 'red' ? 'r' : 'b') : null;
      for (let i = 0; i < n * n; i++) {
        const c = L.cells[i], base = i === 0 || i === n * n - 1;
        let can = false;
        if (own && s.phase === 'playing' && !base && c !== own) {
          const r = Math.floor(i / n), col = i % n;
          can = (r > 0 && L.cells[i - n] === own) || (r < n - 1 && L.cells[i + n] === own) ||
                (col > 0 && L.cells[i - 1] === own) || (col < n - 1 && L.cells[i + 1] === own);
        }
        const cls = 'cell' + (c !== '.' ? ' ' + c : '') + (base ? ' base' : '') + (can ? ' can' : '');
        const el = cellsEl[i];
        if (el.className.replace(' flash', '') !== cls) el.className = cls + (el.classList.contains('flash') ? ' flash' : '');
        const txt = base ? '★' : '';
        if (el.textContent !== txt) el.textContent = txt;
      }
      count.firstChild.textContent = `${TEAM_KO.red} ${L.count.red}칸`;
      count.lastChild.textContent = `${TEAM_KO.blue} ${L.count.blue}칸`;
      if (tk && me) tk.who(me.team);
    },
  };
}

/* ③ 이어달리기 — 운동장 트랙 */
function stadiumPath(l, t, r, b) {
  const rad = (b - t) / 2, mid = (l + r) / 2;
  return `M${mid},${t} H${r - rad} A${rad},${rad} 0 0 1 ${r - rad},${b} H${l + rad} A${rad},${rad} 0 0 1 ${l + rad},${t} Z`;
}
function relayGame(ctx) {
  const W = 360, H = 220;
  const s0 = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'stadium', role: 'img', 'aria-label': '이어달리기 운동장' });
  s0.append(
    svg('path', { d: stadiumPath(8, 8, 352, 212), class: 'st-outer' }),
    svg('path', { d: stadiumPath(64, 64, 296, 156), class: 'st-infield' }),
    svg('path', { d: stadiumPath(36, 36, 324, 184), class: 'st-divider' }),
    svg('rect', { x: 177, y: 8, width: 6, height: 56, class: 'st-start' }),
  );
  const img = svg('image', { href: TK_SRC, x: 145, y: 72, width: 70, height: 66 });
  s0.append(img);
  const lapText = svg('text', { x: 180, y: 150, class: 'st-lap', 'text-anchor': 'middle' });
  s0.append(lapText);
  const lanePath = {
    blue: svg('path', { d: stadiumPath(22, 22, 338, 198), class: 'st-lane' }),
    red: svg('path', { d: stadiumPath(50, 50, 310, 170), class: 'st-lane' }),
  };
  const runners = {};
  for (const team of ['blue', 'red']) {
    s0.append(lanePath[team]);
    const g = svg('g', { class: `st-runner t-${team}` });
    const c = svg('circle', { r: 12 });
    const tx = svg('text', { 'text-anchor': 'middle', dy: '4.5' });
    g.append(c, tx);
    s0.append(g);
    runners[team] = { g, tx };
  }
  const info = {}, infoBox = h('div', {});
  for (const team of ['red', 'blue']) {
    info[team] = h('div', { class: `lane-info t-${team}` }, h('span', { class: 'who' }), h('span', { class: 'leg' }));
    infoBox.append(info[team]);
  }
  const msg = h('div', { class: 'relay-msg' });

  function draw(s) {
    const notes = [];
    for (const team of ['red', 'blue']) {
      const r = s.relay[team], path = lanePath[team];
      const len = path.getTotalLength ? path.getTotalLength() : 0;
      if (len) {
        const p = path.getPointAtLength((r.lap % 1 === 0 && r.lap > 0 ? 0.9999 : r.lap) * len);
        runners[team].g.setAttribute('transform', `translate(${p.x.toFixed(1)},${p.y.toFixed(1)})`);
      }
      runners[team].tx.textContent = initial(r.runner);
      const who = info[team].querySelector('.who');
      const line = r.finished ? '골인!' : r.state === 'handoff' ? `바통 터치 → ${r.runner}` : `${r.runner} 달리는 중`;
      setOnce(who, line, () => [teamTag(team), ' ', line]);
      info[team].querySelector('.leg').textContent = `${r.legsDone}/${r.legs}바퀴` + (r.cheering ? ` · 응원 ${r.cheering}` : '');
      if (r.skipped && r.state === 'handoff') notes.push(`${TEAM_KO[team]}: ${r.skipped} 대신 다음 친구가 달려요`);
      else if (r.lastHandoffMs != null && r.lastHandoffMs < 1000 && r.state === 'run' && !r.finished) notes.push(`${TEAM_KO[team]} 바통 터치 ${(r.lastHandoffMs / 1000).toFixed(1)}초!`);
    }
    lapText.textContent = `${MASCOT_NAME.red} ${s.relay.red.legsDone}/${s.relay.red.legs} · ${MASCOT_NAME.blue} ${s.relay.blue.legsDone}/${s.relay.blue.legs}`;
    msg.textContent = notes.join('  ');
  }
  if (!ctx) return { root: h('div', {}, s0, infoBox, msg), update(s) { draw(s); } };

  const runBtn = tapButton(ctx, 'tap', '달리기!');
  const cheerBtn = tapButton(ctx, 'cheer', '응원하기!', 'cheer');
  const lap = meter('내 바퀴');
  const tk = techking(TIPS.relay);
  return {
    root: h('div', {}, s0, infoBox, msg,
      h('div', { class: 'duo' },
        h('div', { class: 'duo-col' }, runBtn, h('small', { text: '내 차례에만' })),
        h('div', { class: 'duo-col' }, cheerBtn, h('small', { text: '기다릴 때' }))),
      h('div', { class: 'pad' }, lap.root), tk.root),
    update(s, me) {
      draw(s);
      const role = me.role, live = s.phase === 'playing';
      runBtn.className = `tap t-${me.team}` + (role === 'baton' && live ? ' pulse' : '');
      runBtn.dataset.mode = role === 'baton' ? 'baton' : 'tap';
      runBtn.disabled = !live || !(role === 'run' || role === 'baton');
      runBtn.textContent = role === 'baton' ? '바통 받기!' : role === 'run' ? '달리기!' : role === 'next' ? '곧 내 차례' : role === 'done' ? '골인!' : '달리기';
      cheerBtn.disabled = !live || role === 'run' || role === 'baton' || role === 'done';
      lap.root.hidden = role !== 'run';
      if (role === 'run') lap.set((me.progress / me.legLen) * 100, `${Math.floor((me.progress / me.legLen) * 100)}%`);
      tk.who(me.team);
      tk.say(role === 'baton' ? '바통이 왔어! 지금 "바통 받기"를 눌러!' : role === 'next' ? '다음이 네 차례야. 응원하면서 준비해!'
        : role === 'run' ? '달려라! 운동장 한 바퀴를 돌면 다음 친구에게 바통이 넘어가!' : TIPS.relay);
    },
  };
}

/* ④ 거점 점령전 */
function zoneGame(ctx) {
  const field = h('div', { class: 'zone-field' + (ctx ? ' playable' : ''), role: ctx ? 'application' : 'img', 'aria-label': '거점 점령전 운동장. 누르면 그곳으로 이동해요' });
  const target = h('div', { class: 'zone-target', hidden: '' });
  field.append(target);
  const pts = [];
  'ABCDE'.split('').forEach((label, k) => {
    const ring = h('div', { class: 'zone-ring' });
    const cnt = h('div', { class: 'zone-cnt' });
    const el = h('div', { class: 'zone-pt' }, ring, h('b', { text: label }), cnt);
    field.append(el);
    pts.push({ el, ring, cnt });
  });
  const avatars = new Map();
  const bars = { red: h('i'), blue: h('i') };
  const scoreLine = { red: h('span'), blue: h('span') };
  const scoreBox = h('div', { class: 'zone-score' },
    h('div', { class: 't-red' }, scoreLine.red, h('div', { class: 'zbar' }, bars.red)),
    h('div', { class: 't-blue' }, scoreLine.blue, h('div', { class: 'zbar' }, bars.blue)));
  let lastS = null;
  if (ctx) {
    field.addEventListener('pointerdown', e => {
      e.preventDefault();
      if (!lastS || lastS.phase !== 'playing') return;
      const rect = field.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100, y = ((e.clientY - rect.top) / rect.height) * 60;
      target.hidden = false;
      target.style.left = x + '%'; target.style.top = (y / 60) * 100 + '%';
      ctx.act('move', { x, y });
    });
  }
  const tk = ctx ? techking(TIPS.zone) : null;
  return {
    root: h('div', {}, scoreBox, field, tk && tk.root),
    update(s, me, roster) {
      lastS = s;
      const Z = s.zone;
      Z.points.forEach((q, k) => {
        const P = pts[k];
        if (!P.placed) {
          P.el.style.left = q.x + '%'; P.el.style.top = (q.y / 60) * 100 + '%';
          P.el.style.width = (Z.r * 2) + '%';
          P.placed = true;
        }
        const pct = Math.abs(q.cap), col = q.cap >= 0 ? 'var(--red)' : 'var(--blue)';
        P.ring.style.background = `conic-gradient(${col} ${pct}%, transparent 0)`;
        P.el.className = 'zone-pt' + (q.owner ? ' own-' + q.owner : '');
        P.cnt.textContent = q.red || q.blue ? `${q.red}:${q.blue}` : '';
      });
      const names = new Map((roster || []).map(p => [p.id, p.name]));
      const seen = new Set();
      for (const [id, x, y, team] of Z.pos) {
        seen.add(id);
        let a = avatars.get(id);
        if (!a) { a = h('div', { class: 'avatar' }); field.append(a); avatars.set(id, a); }
        const cls = `avatar t-${team}` + (me && me.id === id ? ' me' : '');
        if (a.className !== cls) a.className = cls;
        const txt = initial(names.get(id));
        if (a.textContent !== txt) a.textContent = txt;
        a.style.left = x + '%'; a.style.top = (y / 60) * 100 + '%';
      }
      for (const [id, a] of avatars) if (!seen.has(id)) { a.remove(); avatars.delete(id); }
      if (me) {
        const mine = Z.pos.find(p => p[0] === me.id);
        if (mine && Math.hypot(mine[1] - me.tx, mine[2] - me.ty) < 1) target.hidden = true;
      }
      if (tk && me) tk.who(me.team);
      for (const team of ['red', 'blue']) {
        scoreLine[team].textContent = `${TEAM_KO[team]} ${Z.score[team]}점 · 거점 ${Z.points.filter(q => q.owner === team).length}곳`;
        bars[team].style.width = Math.min(100, (Z.score[team] / Z.goal) * 100) + '%';
      }
    },
  };
}

/* ⑥ 판뒤집기 */
function flipGame(ctx) {
  const grid = h('div', { class: 'flip-grid' });
  const count = h('div', { class: 'flip-count' });
  let n = 0, discs = [], lastS = null, lastMe = null, lastPick = 0;
  function build(size) {
    n = size;
    grid.style.gridTemplateColumns = `repeat(${n}, 1fr)`;
    discs = [];
    for (let i = 0; i < n * n; i++) {
      const d = h('button', { class: 'disc', type: 'button', 'aria-label': `${i + 1}번 판` }, h('span', { class: 'disc-in' }));
      if (ctx) {
        d.addEventListener('pointerdown', e => {
          e.preventDefault();
          if (!lastS || lastS.phase !== 'playing' || !lastMe) return;
          const own = lastMe.team === 'red' ? 'r' : 'b';
          if (d.dataset.c === own) return;
          const t = Date.now();
          if (t - lastPick < (lastMe.coolMs || 300)) return;
          lastPick = t;
          setDisc(d, own); // 바로 뒤집어 보여주고, 서버가 확정해요
          if (navigator.vibrate) navigator.vibrate(8);
          ctx.act('cell', { i });
        });
      } else d.tabIndex = -1;
      discs.push(d);
    }
    grid.replaceChildren(...discs);
  }
  function setDisc(d, c) {
    if (d.dataset.c === c) return;
    const first = !d.dataset.c;
    d.dataset.c = c;
    d.className = 'disc ' + c + (first ? '' : ' flipping');
    if (!first) setTimeout(() => d.classList.remove('flipping'), 260);
  }
  const tk = ctx ? techking(TIPS.flip) : null;
  return {
    root: h('div', {}, count, grid, tk && tk.root),
    update(s, me) {
      lastS = s; lastMe = me;
      const F = s.flip;
      if (F.n !== n) build(F.n);
      for (let i = 0; i < n * n; i++) setDisc(discs[i], F.cells[i]);
      setOnce(count, F.count.red + ':' + F.count.blue + teamsStamp, () => [teamTag('red', `${F.count.red}장`), teamTag('blue', `${F.count.blue}장`)]);
      if (tk && me) tk.who(me.team);
    },
  };
}

/* ⑦ 운석 피하기 — 우주 전체가 한 화면에 보이고, 아래 왼쪽 조이스틱으로 움직여요 */
function meteorGame(ctx) {
  const Eng = (typeof TechkingEngine !== 'undefined') ? TechkingEngine : null;
  const wrap = h('div', { class: 'meteor-wrap' + (ctx ? ' playable' : '') });
  const cv = h('canvas', { class: 'meteor-cv', role: 'img', 'aria-label': ctx ? '우주 공간. 왼쪽 아래 조이스틱이나 방향키로 움직여요' : '운석 피하기 경기장 전체' });
  const banner = h('div', { class: 'meteor-banner', hidden: '' });
  const knob = h('div', { class: 'joy-knob' });
  const joy = h('div', { class: 'joy', 'aria-hidden': 'true' }, knob);
  const feedBox = h('div', { class: 'meteor-feed', 'aria-live': 'polite' });
  wrap.append(cv, banner, feedBox);
  // 조이스틱은 경기장 아래 왼쪽에 (경기장을 가리지 않게)
  const effects = h('div', { class: 'meteor-effects' });
  const joyRow = ctx ? h('div', { class: 'joy-row' }, joy, h('div', {}, h('small', { text: '조이스틱을 밀어서 움직여요 · 컴퓨터는 방향키' }), effects)) : null;
  const legend = h('div', { class: 'item-legend' });
  const scoreBox = h('div', { class: 'meteor-score' });
  const tk = ctx ? techking(TIPS.meteor) : null;
  const g = cv.getContext('2d');

  let W = 130, H = 130, PR = 2.8, RR = 7, SPEED = 30;
  let meteors = [], items = [], seed = null, goAt = 0, offset = -Infinity, lastS = null, lastMe = null, roster = [];
  let taken = new Set();
  const requested = new Set();
  let fastLocal = 0, tinyLocal = 0, frozenLocal = 0, FASTK = 1.6, ITEM_R = 3.4;
  const others = new Map();
  const imgs = {};
  let myX = 65, myY = 65, tgtX = 65, tgtY = 65, placed = false, hitAt = 0, shieldLocal = 0, lastSent = 0, sentX = -1, sentY = -1;
  let camX = 0, camY = 0;
  const keys = new Set();
  const stars = Array.from({ length: 200 }, (_, i) => ({ x: (i * 37.7) % 130, y: (i * 53.3) % 130, r: (i % 3) * 0.12 + 0.12, p: i }));

  function img(team) {
    const src = MASCOT[team];
    if (!imgs[team] || imgs[team].dataset.src !== src) { const im = new Image(); im.src = src; im.dataset.src = src; imgs[team] = im; }
    return imgs[team];
  }
  function serverNow() { return Date.now() + (isFinite(offset) ? offset : 0); }

  // 🕹 조이스틱 (왼쪽 아래)
  let joyVec = { x: 0, y: 0 }, joyId = null;
  function joyMove(e) {
    const r = joy.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, max = r.width * 0.38;
    let dx = e.clientX - cx, dy = e.clientY - cy;
    const d = Math.hypot(dx, dy);
    if (d > max) { dx = dx / d * max; dy = dy / d * max; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    joyVec = { x: dx / max, y: dy / max };
  }
  function joyEnd() { joyId = null; joyVec = { x: 0, y: 0 }; knob.style.transform = ''; joy.classList.remove('on'); }
  // 화면 아무 데나 드래그해도 움직여요
  let drag = null;
  if (ctx) {
    joy.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); joyId = e.pointerId; joy.classList.add('on'); joy.setPointerCapture && joy.setPointerCapture(e.pointerId); joyMove(e); });
    joy.addEventListener('pointermove', e => { if (e.pointerId === joyId) joyMove(e); });
    joy.addEventListener('pointerup', joyEnd); joy.addEventListener('pointercancel', joyEnd);
    wrap.addEventListener('pointerdown', e => { e.preventDefault(); drag = { x: e.clientX, y: e.clientY, id: e.pointerId }; wrap.setPointerCapture && wrap.setPointerCapture(e.pointerId); });
    wrap.addEventListener('pointermove', e => {
      if (!drag || e.pointerId !== drag.id) return;
      const k = W / cv.clientWidth * 1.15;
      tgtX = Math.max(0, Math.min(W, tgtX + (e.clientX - drag.x) * k));
      tgtY = Math.max(0, Math.min(H, tgtY + (e.clientY - drag.y) * k));
      drag.x = e.clientX; drag.y = e.clientY;
    });
    const end = e => { if (drag && e.pointerId === drag.id) drag = null; };
    wrap.addEventListener('pointerup', end); wrap.addEventListener('pointercancel', end);
    const kd = e => { if (!wrap.isConnected) return document.removeEventListener('keydown', kd); if (/^(Arrow|Key[WASD])/.test(e.code)) { e.preventDefault(); keys.add(e.code); } };
    const ku = e => { keys.delete(e.code); if (!wrap.isConnected) document.removeEventListener('keyup', ku); };
    document.addEventListener('keydown', kd); document.addEventListener('keyup', ku);
  }

  function viewSize() { return { vw: W, vh: H }; } // 학생·선생님 모두 우주 전체
  function resize() {
    const { vw, vh } = viewSize();
    const dpr = Math.min(2, window.devicePixelRatio || 1), cw = cv.clientWidth || 340, ch = cw * vh / vw;
    if (cv.width !== Math.round(cw * dpr) || cv.height !== Math.round(ch * dpr)) { cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr); cv.style.height = ch + 'px'; }
    return cv.width / vw;
  }

  let lastFrame = performance.now();
  function frame(now) {
    if (!wrap.isConnected) return;
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - lastFrame) / 1000); lastFrame = now;
    if (!lastS || !lastS.meteor) return;
    const tau = (serverNow() - goAt) / 1000;
    const playing = lastS.phase === 'playing';
    const meDown = lastMe ? (lastMe.down || Date.now() - hitAt < 700) : false;
    const nowMs = Date.now(), frozen = nowMs < frozenLocal, speed = SPEED * (nowMs < fastLocal ? FASTK : 1);
    const myR = PR * (nowMs < tinyLocal ? 0.5 : 1);
    if (ctx && lastMe && playing && !meDown && frozen) { tgtX = myX; tgtY = myY; }
    if (ctx && lastMe && playing && !meDown && !frozen) {
      let vx = joyVec.x, vy = joyVec.y;
      if (keys.has('ArrowLeft') || keys.has('KeyA')) vx -= 1; if (keys.has('ArrowRight') || keys.has('KeyD')) vx += 1;
      if (keys.has('ArrowUp') || keys.has('KeyW')) vy -= 1; if (keys.has('ArrowDown') || keys.has('KeyS')) vy += 1;
      const mag = Math.hypot(vx, vy);
      if (mag > 0.12) {
        const m = Math.pow(Math.min(1, mag), 1.6); // 조금만 밀면 천천히, 끝까지 밀어야 최고 속도
        myX = Math.max(0, Math.min(W, myX + vx / mag * m * speed * dt));
        myY = Math.max(0, Math.min(H, myY + vy / mag * m * speed * dt));
        tgtX = myX; tgtY = myY;
      } else {
        const dx = tgtX - myX, dy = tgtY - myY, d = Math.hypot(dx, dy), step = speed * dt;
        if (d <= step) { myX = tgtX; myY = tgtY; } else { myX += dx / d * step; myY += dy / d * step; }
      }
      if (Date.now() > shieldLocal) {
        for (const m of meteors) {
          const a = tau - m.t0;
          if (a < 0 || a > m.life) continue;
          if (Math.hypot(m.x + m.vx * a - myX, m.y + m.vy * a - myY) < m.r + myR * 0.85) {
            hitAt = Date.now(); ctx.act('hit'); if (navigator.vibrate) navigator.vibrate(120); break;
          }
        }
      }
      // 아이템 줍기
      items.forEach((it, i) => {
        if (taken.has(i) || requested.has(i)) return;
        const a = tau - it.t0;
        if (a < 0 || a > it.life) return;
        if (Math.hypot(it.x - myX, it.y - myY) < myR + ITEM_R) { requested.add(i); ctx.act('item', { i }); if (navigator.vibrate) navigator.vibrate(30); }
      });
      if (now - lastSent > 130 && (Math.abs(myX - sentX) > 0.05 || Math.abs(myY - sentY) > 0.05)) {
        lastSent = now; sentX = myX; sentY = myY; ctx.act('pos', { x: myX, y: myY });
      }
    }
    draw(tau);
  }
  requestAnimationFrame(frame);

  function draw(tau) {
    const k = resize(), w = cv.width, hgt = cv.height, { vw, vh } = viewSize();
    // 카메라: 내 캐릭터를 가운데에 (맵 끝에서는 멈춰요)
    camX = 0; camY = 0; // 한 화면에 전체를 보여줘요
    const SX = x => (x - camX) * k, SY = y => (y - camY) * k;
    g.fillStyle = '#070a1e'; g.fillRect(0, 0, w, hgt);
    const bg = g.createRadialGradient(SX(W / 2), SY(H / 2), 10, SX(W / 2), SY(H / 2), W * k * 0.7);
    bg.addColorStop(0, '#26357a'); bg.addColorStop(1, '#0b1030');
    g.fillStyle = bg; g.fillRect(SX(0), SY(0), W * k, H * k);
    for (const st of stars) {
      const x = SX(st.x), y = SY(st.y);
      if (x < -5 || y < -5 || x > w + 5 || y > hgt + 5) continue;
      g.globalAlpha = 0.45 + 0.4 * Math.sin(tau * 2 + st.p);
      g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, st.r * k, 0, 7); g.fill();
    }
    g.globalAlpha = 1;
    // 우주 경계선
    g.strokeStyle = 'rgba(255,225,26,.75)'; g.setLineDash([k * 2, k * 1.4]); g.lineWidth = Math.max(2, k * 0.5);
    g.strokeRect(SX(0), SY(0), W * k, H * k); g.setLineDash([]);
    // 운석
    for (const m of meteors) {
      const a = tau - m.t0;
      if (a < 0 || a > m.life) continue;
      const wx = m.x + m.vx * a, wy = m.y + m.vy * a;
      if (wx < camX - 12 || wy < camY - 12 || wx > camX + vw + 12 || wy > camY + vh + 12) continue;
      const x = SX(wx), y = SY(wy), r = m.r * k, sp = Math.hypot(m.vx, m.vy);
      const tl = r * (m.kind === 'fast' ? 7 : m.kind === 'slow' ? 1.6 : 3.2); // 빠를수록 꼬리가 길어요
      const tx = x - (m.vx / sp) * tl, ty = y - (m.vy / sp) * tl;
      const tr = g.createLinearGradient(x, y, tx, ty);
      if (m.kind === 'fast') { tr.addColorStop(0, 'rgba(255,255,200,.95)'); tr.addColorStop(0.3, 'rgba(255,190,60,.8)'); tr.addColorStop(1, 'rgba(255,90,30,0)'); }
      else { tr.addColorStop(0, 'rgba(255,170,60,.8)'); tr.addColorStop(1, 'rgba(255,90,30,0)'); }
      g.strokeStyle = tr; g.lineWidth = r * 1.3; g.lineCap = 'round';
      g.beginPath(); g.moveTo(x, y); g.lineTo(tx, ty); g.stroke();
      g.save(); g.translate(x, y); g.rotate(a * m.spin);
      g.fillStyle = m.kind === 'slow' ? '#6f6a66' : m.kind === 'fast' ? '#c98a4b' : '#8d7966'; g.strokeStyle = '#2a1e14'; g.lineWidth = Math.max(1.5, k * 0.35);
      g.beginPath();
      for (let i = 0; i < 8; i++) { const ang = i / 8 * Math.PI * 2, rr = r * (0.82 + ((i * 7) % 3) * 0.09); g.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr); }
      g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#6b5a4a';
      g.beginPath(); g.arc(-r * 0.3, -r * 0.2, r * 0.22, 0, 7); g.arc(r * 0.3, r * 0.25, r * 0.16, 0, 7); g.fill();
      g.restore();
    }
    // 아이템
    items.forEach((it, i) => {
      if (taken.has(i) || requested.has(i)) return;
      const a = tau - it.t0;
      if (a < 0 || a > it.life) return;
      if (it.life - a < 2 && Math.floor(a * 6) % 2) return; // 사라지기 전 깜빡깜빡
      const x = SX(it.x), y = SY(it.y + Math.sin(tau * 3 + i) * 0.8), r = ITEM_R * k;
      const glow = g.createRadialGradient(x, y, r * 0.2, x, y, r * 1.7);
      glow.addColorStop(0, 'rgba(255,240,150,.9)'); glow.addColorStop(1, 'rgba(255,240,150,0)');
      g.fillStyle = glow; g.beginPath(); g.arc(x, y, r * 1.7, 0, 7); g.fill();
      g.fillStyle = '#fff'; g.strokeStyle = '#ffe11a'; g.lineWidth = Math.max(2, k * 0.5);
      g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); g.stroke();
      g.font = `${Math.round(r * 1.25)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(Eng ? Eng.ITEM_KINDS[it.kind].icon : '?', x, y + r * 0.08);
    });
    const css = getComputedStyle(document.documentElement);
    const col = { red: css.getPropertyValue('--red').trim() || '#ff4d4d', blue: css.getPropertyValue('--blue').trim() || '#2f7bff' };
    const names = new Map(roster.map(p => [p.id, p.name]));
    for (const [id, o] of others) {
      o.x += (o.tx - o.x) * 0.3; o.y += (o.ty - o.y) * 0.3;
      if (lastMe && id === lastMe.id) continue;
      drawPlayer(SX(o.x), SY(o.y), PR * k * (o.tiny ? 0.55 : 1), o.team, o.down, o.rev, o.shield, initial(names.get(id)), false, col, k, o.fast, o.frozen);
    }
    if (ctx && lastMe) {
      const meDown = lastMe.down || Date.now() - hitAt < 700;
      const nm = Date.now();
      drawPlayer(SX(myX), SY(myY), PR * k * 1.25 * (nm < tinyLocal ? 0.55 : 1), lastMe.team, meDown, (others.get(lastMe.id) || {}).rev || 0, nm < shieldLocal, '', true, col, k, nm < fastLocal, nm < frozenLocal);
    }
  }

  function drawPlayer(x, y, r, team, down, rev, shield, label, isMe, col, k, fast, frozen) {
    g.save();
    if (!down && fast) { // ⚡ 번개: 노란 잔상
      g.fillStyle = 'rgba(255,225,26,.45)'; g.beginPath(); g.arc(x, y, r * 1.7, 0, 7); g.fill();
    }
    if (down) {
      g.strokeStyle = 'rgba(255,255,255,.35)'; g.setLineDash([k * 0.8, k * 0.8]); g.lineWidth = Math.max(1, k * 0.25);
      g.beginPath(); g.arc(x, y, RR * k, 0, 7); g.stroke(); g.setLineDash([]);
      g.fillStyle = '#7d8190'; g.strokeStyle = '#000'; g.lineWidth = Math.max(1.5, k * 0.4);
      g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); g.stroke();
      g.strokeStyle = '#fff'; g.lineWidth = Math.max(1.5, k * 0.45);
      g.beginPath(); g.moveTo(x - r * 0.45, y - r * 0.45); g.lineTo(x + r * 0.45, y + r * 0.45); g.moveTo(x + r * 0.45, y - r * 0.45); g.lineTo(x - r * 0.45, y + r * 0.45); g.stroke();
      if (rev > 0) { g.strokeStyle = col[team]; g.lineWidth = Math.max(2, k * 0.7); g.beginPath(); g.arc(x, y, r + k * 0.9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * rev / 100); g.stroke(); }
    } else {
      if (isMe) {
        const im = img(team);
        g.fillStyle = col[team]; g.beginPath(); g.arc(x, y, r * 1.08, 0, 7); g.fill();
        g.lineWidth = Math.max(2, k * 0.5); g.strokeStyle = '#ffe11a'; g.stroke();
        if (im.complete && im.naturalWidth) g.drawImage(im, x - r * 1.05, y - r * 1.05, r * 2.1, r * 2.1);
      } else {
        g.fillStyle = col[team]; g.strokeStyle = '#000'; g.lineWidth = Math.max(1.5, k * 0.4);
        g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); g.stroke();
        g.fillStyle = '#fff'; g.font = `${Math.round(r * 1.1)}px Jua, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(label, x, y + r * 0.05);
      }
      if (frozen) { // ❄️ 얼음: 얼음 상자
        g.fillStyle = 'rgba(180,230,255,.6)'; g.strokeStyle = '#e6f8ff'; g.lineWidth = Math.max(1.5, k * 0.35);
        g.beginPath(); g.rect(x - r * 1.45, y - r * 1.45, r * 2.9, r * 2.9); g.fill(); g.stroke();
      }
      if (shield) { g.strokeStyle = 'rgba(160,230,255,.9)'; g.setLineDash([k * 0.6, k * 0.5]); g.lineWidth = Math.max(1.5, k * 0.35); g.beginPath(); g.arc(x, y, r + k * 1.1, 0, 7); g.stroke(); }
    }
    g.restore();
  }

  return {
    root: h('div', {}, scoreBox, wrap, joyRow, legend, tk && tk.root),
    update(s, me, rs) {
      lastS = s; lastMe = me; roster = rs || roster;
      const M = s.meteor;
      W = M.w; H = M.h; PR = M.pr; RR = M.reviveR; goAt = M.goAt; SPEED = M.speed || SPEED;
      offset = Math.max(offset, M.now - Date.now());
      if (M.seed !== seed && Eng) { seed = M.seed; meteors = Eng.makeMeteors(seed); items = Eng.makeItems(seed); requested.clear(); }
      taken = new Set(M.taken || []);
      FASTK = M.fast || FASTK; ITEM_R = M.itemR || ITEM_R;
      for (const i of [...requested]) if (taken.has(i)) requested.delete(i); // 다른 친구가 먼저 주웠으면 정리
      // 아이템 소식
      const FEED = { shield: f => `🛡️ ${f.name} 보호막!`, bolt: f => `⚡ ${f.name} 번개! 슝슝`, heart: f => `💖 ${f.name} 단체 부활!${f.extra}`,
        ice: f => `❄️ ${f.name} 얼음! ${TEAM_KO[f.team === 'red' ? 'blue' : 'red']} 꽁꽁`, star: f => `⭐ ${f.name} 별! ${TEAM_KO[f.team]} +20점`, mush: f => `🍄 ${f.name} 꼬마버섯!` };
      setOnce(feedBox, (M.feed || []).map(f => f.name + f.kind + Math.floor(f.ago / 3000)).join() + teamsStamp, () =>
        (M.feed || []).slice(-3).map(f => h('div', { class: `feed-item t-${f.team}`, text: (FEED[f.kind] || (() => ''))(f) })));
      if (Eng && !legend.childNodes.length) legend.append(...Object.values(Eng.ITEM_KINDS).map(it => h('span', { class: 'legend-chip', title: it.desc }, it.icon, ' ', it.name)));
      const seen = new Set();
      for (const [id, x, y, team, down, rev, shield, fast, tiny, frozen] of M.pos) {
        seen.add(id);
        const o = others.get(id) || { x, y };
        Object.assign(o, { tx: x, ty: y, team, down, rev, shield, fast, tiny, frozen });
        others.set(id, o);
      }
      for (const id of [...others.keys()]) if (!seen.has(id)) others.delete(id);
      if (me) {
        if (!placed || me.down) {
          myX = tgtX = me.x; myY = tgtY = me.y;
          placed = true;
        }
        shieldLocal = Date.now() + (me.shield || 0);
        fastLocal = Date.now() + (me.fast || 0); tinyLocal = Date.now() + (me.tiny || 0); frozenLocal = Date.now() + (me.frozen || 0);
        const chips = [];
        if (me.shield > 0 && !me.down) chips.push(`🛡️ ${Math.ceil(me.shield / 1000)}초`);
        if (me.fast > 0) chips.push(`⚡ ${Math.ceil(me.fast / 1000)}초`);
        if (me.tiny > 0) chips.push(`🍄 ${Math.ceil(me.tiny / 1000)}초`);
        if (me.frozen > 0) chips.push(`❄️ ${Math.ceil(me.frozen / 1000)}초`);
        effects.textContent = chips.join('  ');
        if (!me.down && Date.now() - hitAt > 700) hitAt = 0;
        banner.hidden = !(me.down || me.frozen > 0);
        banner.textContent = me.down ? '쾅! 쓰러졌어요. 팀원이 옆에 오면 부활해요' : '❄️ 꽁꽁 얼었어요! 잠깐 못 움직여요';
      }
      setOnce(scoreBox, JSON.stringify(M.score) + JSON.stringify(M.alive) + JSON.stringify(s.counts) + teamsStamp, () => ['red', 'blue'].map(t =>
        h('div', { class: `meteor-team t-${t}` }, teamTag(t), h('b', { text: `${M.score[t]}점` }), h('small', { text: `생존 ${M.alive[t]}/${s.counts[t]}` }))));
      if (tk && me) { tk.who(me.team); tk.say(me.down ? '쾅! 쓰러졌어. 우리 팀 친구가 옆에 2초 있으면 부활할 수 있어!' : TIPS.meteor); }
    },
  };
}

/* ⑧ 단체 가위바위보 */
const RPS_ICON = { r: '✊', p: '✋', s: '✌️' };
const RPS_NAME = { r: '바위', p: '보', s: '가위' };
function rpsGame(ctx) {
  const score = h('div', { class: 'rps-score' });
  const info = h('div', { class: 'rps-info' });
  const stage = h('div', { class: 'box rps-stage' });
  const picks = h('div', { class: 'rps-picks' });
  const log = h('ul', { class: 'rps-log' });
  const btns = {};
  if (ctx) {
    for (const c of ['r', 'p', 's']) {
      const b = h('button', { class: 'rps-btn', type: 'button' }, h('span', { class: 'rps-emoji', text: RPS_ICON[c] }), h('span', { text: RPS_NAME[c] }), h('small'));
      b.addEventListener('pointerdown', e => { e.preventDefault(); if (!b.disabled) { ctx.act('pick', { c }); if (navigator.vibrate) navigator.vibrate(10); picked = c; paint(); } });
      btns[c] = b; picks.append(b);
    }
  }
  const tk = ctx ? techking(TIPS.rps) : null;
  let picked = null, lastS = null, lastMe = null;
  function paint() {
    if (!ctx || !lastS) return;
    const R = lastS.rps, live = lastS.phase === 'playing' && R.state === 'pick';
    const mine = picked || (lastMe && lastMe.pick);
    for (const c of ['r', 'p', 's']) {
      const b = btns[c];
      b.disabled = !live;
      b.classList.toggle('on', mine === c);
      const v = lastMe && lastMe.teamVotes ? lastMe.teamVotes[c] : 0;
      b.querySelector('small').textContent = live ? (v ? `우리 팀 ${v}명` : '') : '';
    }
  }
  const dots = (n, w) => '●'.repeat(n) + '○'.repeat(Math.max(0, w - n));
  return {
    root: h('div', {}, score, info, stage, picks, log, tk && tk.root),
    update(s, me) {
      const prev = lastS && lastS.rps;
      lastS = s; lastMe = me;
      const R = s.rps;
      if (!prev || prev.round !== R.round) picked = null; // 새 라운드
      setOnce(score, JSON.stringify(R.wins) + teamsStamp, () => ['red', 'blue'].map(t =>
        h('div', { class: `rps-team t-${t}` }, teamTag(t), h('b', { text: dots(R.wins[t], R.win) }), h('small', { text: `${R.wins[t]}승` }))));
      const cnt = s.counts || { red: 0, blue: 0 };
      info.textContent = R.round ? `${R.round}라운드 · ${R.win}판 먼저 이기면 승리` : '곧 시작해요';
      const key = R.state + R.round + (R.state === 'pick' ? JSON.stringify(R.voted) : '') + teamsStamp + (me ? me.team : '');
      setOnce(stage, key, () => {
        if (R.state === 'pick') {
          return [h('div', { class: 'rps-title', text: '무엇을 낼까? 팀원이 가장 많이 낸 손이 우리 팀 손!' }),
            h('div', { class: 'rps-vs' }, ...['red', 'blue'].map(t => h('div', { class: `rps-side t-${t}` },
              h('img', { src: MASCOT[t], alt: '' }), h('div', { class: 'rps-hand hidden', text: '❔' }),
              h('small', { text: `${R.voted[t]}/${cnt[t]}명 골랐어요` }))))];
        }
        const L = R.last;
        if (!L) return [h('div', { class: 'rps-title', text: '준비! 곧 1라운드가 시작돼요' })];
        const res = L.winner === 'draw' ? '비겼어요! 다시 한 번!' : `${TEAM_KO[L.winner]} 승!`;
        return [h('div', { class: 'rps-title', text: `${L.round}라운드 결과 — ${res}` }),
          h('div', { class: 'rps-vs' }, ...['red', 'blue'].map(t => h('div', { class: `rps-side t-${t}` + (L.winner === t ? ' win' : '') },
            h('img', { src: MASCOT[t], alt: '' }), h('div', { class: 'rps-hand pop', text: RPS_ICON[L.hands[t]] }),
            h('small', { text: ['r', 'p', 's'].map(c => `${RPS_ICON[c]}${L.counts[t][c]}`).join(' ') }))))];
      });
      setOnce(log, R.log.map(x => x.round + x.winner).join() + teamsStamp, () => R.log.slice().reverse().map(x =>
        h('li', {}, h('b', { text: `${x.round}R` }), ' ', teamTag('red', RPS_ICON[x.hands.red]), ' vs ', teamTag('blue', RPS_ICON[x.hands.blue]), ' ',
          x.winner === 'draw' ? '무승부' : `${TEAM_KO[x.winner]} 승`)));
      if (ctx) {
        paint();
        tk.who(me.team);
        tk.say(R.state === 'pick' ? (me.pick ? `${RPS_NAME[me.pick]}를 냈어! 시간 안에는 바꿀 수 있어. 우리 팀 숫자를 보고 맞춰 봐!` : TIPS.rps) : TIPS.rps);
      }
    },
  };
}

/* ⑨ 박 터트리기 — 주머니를 당겼다 놓아서(새총처럼) 흔들리는 박을 맞혀요 */
function bakGame(ctx) {
  const FW = ctx ? 100 : 200, FH = ctx ? 130 : 112;    // 학생: 우리 팀 박 하나 / 선생님: 두 팀 박
  const GRAV = 160, BAG_R = 2.6, BAK_R = 10, THROW_X = 50, THROW_Y = 121;
  const wrap = h('div', { class: 'bak-wrap' + (ctx ? ' playable' : '') });
  const cv = h('canvas', { class: 'bak-cv', role: 'img', 'aria-label': ctx ? '박 터트리기. 화면을 아래로 당겼다 놓으면 주머니가 날아가요' : '두 팀의 박' });
  wrap.append(cv);
  const g = cv.getContext('2d');
  const bars = h('div', { class: 'bak-bars' });
  const tk = ctx ? techking(TIPS.bak) : null;
  const t0 = performance.now();
  let lastS = null, lastMe = null, coolUntil = 0, myPending = 0;
  const lastHits = { red: null, blue: null };
  const bags = [];       // 날아가는 주머니
  const fx = [];         // 퍽! 효과·색종이
  const shake = { red: 0, blue: 0 };
  const burstT = { red: 0, blue: 0 };
  const imgs = {};
  function img(team) { const src = MASCOT[team]; if (!imgs[team] || imgs[team].dataset.src !== src) { const im = new Image(); im.src = src; im.dataset.src = src; imgs[team] = im; } return imgs[team]; }
  function colors() { const c = getComputedStyle(document.documentElement); return { red: c.getPropertyValue('--red').trim() || '#ff4d4d', blue: c.getPropertyValue('--blue').trim() || '#2f7bff' }; }
  // 박 위치: 좌우로 흔들려요 (팀마다 조금 다르게)
  function bakPos(team, tau) {
    const cx = ctx ? 50 : (team === 'red' ? 50 : 150), ph = team === 'red' ? 0 : 1.7;
    return { x: cx + 24 * Math.sin(tau * 0.95 + ph), y: 30 + 2.2 * Math.sin(tau * 1.8 + ph) };
  }
  function myTeam() { return lastMe ? lastMe.team : 'red'; }

  // 당겼다 놓기
  let pull = null;
  function toUnits(e) { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * FW, y: (e.clientY - r.top) / r.height * FH }; }
  if (ctx) {
    wrap.addEventListener('pointerdown', e => { e.preventDefault(); const u = toUnits(e); pull = { sx: u.x, sy: u.y, x: u.x, y: u.y, id: e.pointerId }; wrap.setPointerCapture && wrap.setPointerCapture(e.pointerId); });
    wrap.addEventListener('pointermove', e => { if (pull && e.pointerId === pull.id) { const u = toUnits(e); pull.x = u.x; pull.y = u.y; } });
    const release = e => {
      if (!pull || e.pointerId !== pull.id) return;
      const v = launchVel(pull); pull = null;
      if (!v || !lastS || lastS.phase !== 'playing' || (lastS.bak && lastS.bak.burst)) return;
      const now = performance.now();
      if (now < coolUntil) return;
      coolUntil = now + (lastS.bak ? lastS.bak.cool : 380) + 40;
      bags.push({ x: THROW_X, y: THROW_Y, vx: v.x, vy: v.y, rot: 0, team: myTeam(), mine: true });
      if (navigator.vibrate) navigator.vibrate(12);
    };
    wrap.addEventListener('pointerup', release);
    wrap.addEventListener('pointercancel', () => { pull = null; });
  }
  function launchVel(p) {
    const dx = p.sx - p.x, dy = p.sy - p.y, d = Math.hypot(dx, dy);
    if (d < 3) return null;
    const k = Math.min(260, d * 5.2) / d;
    return { x: dx * k, y: dy * k };
  }

  function spawnTeamBag(team, tau) { // 팀원·상대가 맞힌 주머니 (보여주기용)
    const T = 0.55, x0 = (ctx ? 15 + Math.random() * 70 : (team === 'red' ? 15 : 115) + Math.random() * 70), y0 = FH - 4;
    const tp = bakPos(team, tau + T);
    bags.push({ x: x0, y: y0, vx: (tp.x - x0) / T, vy: (tp.y - y0 - 0.5 * GRAV * T * T) / T, rot: 0, team, mine: false, ghost: true, ttl: T });
  }
  function boom(team, x, y, col) {
    shake[team] = 1;
    fx.push({ kind: 'puck', x, y, t: 0, team });
    for (let i = 0; i < 6; i++) fx.push({ kind: 'dust', x, y, vx: (Math.random() - 0.5) * 50, vy: (Math.random() - 0.8) * 40, t: 0, c: col });
  }

  let lastFrame = performance.now();
  function frame(now) {
    if (!wrap.isConnected) return;
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - lastFrame) / 1000); lastFrame = now;
    const tau = (now - t0) / 1000;
    const col = colors();
    // 주머니 날리기
    for (let i = bags.length - 1; i >= 0; i--) {
      const b = bags[i];
      b.vy += GRAV * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.rot += dt * 8;
      if (b.ghost) {
        b.ttl -= dt;
        if (b.ttl <= 0) { const p = bakPos(b.team, tau); boom(b.team, p.x, p.y, col[b.team]); bags.splice(i, 1); }
        continue;
      }
      const teams = ctx ? [myTeam()] : ['red', 'blue'];
      let hit = false;
      for (const tm of teams) {
        if (burstT[tm]) continue;
        const p = bakPos(tm, tau);
        if (Math.hypot(b.x - p.x, b.y - p.y) < BAK_R + BAG_R) {
          hit = true; boom(tm, b.x, b.y, col[tm]);
          if (b.mine && ctx && lastS && lastS.phase === 'playing') { myPending++; ctx.act('hit'); if (navigator.vibrate) navigator.vibrate(25); }
          break;
        }
      }
      if (hit || b.y > FH + 10 || b.x < -10 || b.x > FW + 10) bags.splice(i, 1);
    }
    for (const t of ['red', 'blue']) shake[t] = Math.max(0, shake[t] - dt * 4);
    draw(tau, dt, col);
  }
  requestAnimationFrame(frame);

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1), cw = cv.clientWidth || 340, ch = cw * FH / FW;
    if (cv.width !== Math.round(cw * dpr) || cv.height !== Math.round(ch * dpr)) { cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr); cv.style.height = ch + 'px'; }
    return cv.width / FW;
  }

  function draw(tau, dt, col) {
    const k = resize(), w = cv.width, hh = cv.height;
    // 맑은 운동회 하늘과 운동장
    const sky = g.createLinearGradient(0, 0, 0, hh);
    sky.addColorStop(0, '#9fdcff'); sky.addColorStop(0.72, '#e8f7ff'); sky.addColorStop(0.72, '#f3d6a4'); sky.addColorStop(1, '#e9c48c');
    g.fillStyle = sky; g.fillRect(0, 0, w, hh);
    // 만국기
    g.strokeStyle = '#555'; g.lineWidth = Math.max(1, k * 0.25);
    g.beginPath(); g.moveTo(0, 6 * k); g.quadraticCurveTo(w / 2, 13 * k, w, 6 * k); g.stroke();
    const flagCols = ['#ff4d4d', '#ffe11a', '#2f7bff', '#1fa85a', '#ff8a1f', '#8b5cf6'];
    for (let i = 0; i < FW / 7; i++) {
      const x = (i * 7 + 3) * k, t = x / w, y = (6 + 7 * 4 * t * (1 - t) * 1) * k;
      g.fillStyle = flagCols[i % flagCols.length]; g.beginPath(); g.moveTo(x - 2.4 * k, y); g.lineTo(x + 2.4 * k, y); g.lineTo(x, y + 5 * k); g.closePath(); g.fill();
    }
    const teams = ctx ? [myTeam()] : ['red', 'blue'];
    for (const tm of teams) {
      const p = bakPos(tm, tau), sx = shake[tm] * Math.sin(tau * 60) * 1.4;
      const gauge = lastS && lastS.bak ? lastS.bak.gauge[tm] / lastS.bak.goal : 0;
      // 박을 매단 줄
      g.strokeStyle = '#6b4a2a'; g.lineWidth = Math.max(1, k * 0.4);
      g.beginPath(); g.moveTo((p.x) * k, 0); g.lineTo((p.x + sx) * k, (p.y - BAK_R) * k); g.stroke();
      drawBak((p.x + sx) * k, p.y * k, BAK_R * k, col[tm], gauge, burstT[tm], tm);
      if (burstT[tm]) burstT[tm] += dt;
    }
    // 던지는 사람 (우리 팀 캐릭터)
    if (ctx) {
      const im = img(myTeam());
      if (im.complete && im.naturalWidth) g.drawImage(im, (THROW_X - 8) * k, (THROW_Y - 6) * k, 16 * k, 16 * k);
      const ready = performance.now() >= coolUntil;
      if (!pull) drawBag(THROW_X * k, (THROW_Y - 7) * k, col[myTeam()], 0, ready ? 1 : 0.4, k);
      if (pull) {
        const v = launchVel(pull);
        // 당기는 고무줄과 예상 경로(앞부분만 보여줘요)
        g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = Math.max(1, k * 0.35);
        g.beginPath(); g.moveTo(THROW_X * k, (THROW_Y - 7) * k); g.lineTo((THROW_X - (pull.sx - pull.x) * 0.25) * k, (THROW_Y - 7 - (pull.sy - pull.y) * 0.25) * k); g.stroke();
        if (v) {
          g.fillStyle = 'rgba(0,0,0,.45)';
          for (let i = 1; i <= 7; i++) { const t = i * 0.035; g.beginPath(); g.arc((THROW_X + v.x * t) * k, (THROW_Y - 7 + v.y * t + 0.5 * GRAV * t * t) * k, Math.max(1, k * 0.55), 0, 7); g.fill(); }
        }
        drawBag((THROW_X - (pull.sx - pull.x) * 0.25) * k, (THROW_Y - 7 - (pull.sy - pull.y) * 0.25) * k, col[myTeam()], 0, 1, k);
      }
    }
    for (const b of bags) drawBag(b.x * k, b.y * k, col[b.team], b.rot, b.ghost ? 0.75 : 1, k);
    // 효과
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i]; f.t += dt;
      if (f.kind === 'puck') {
        g.globalAlpha = Math.max(0, 1 - f.t * 2); g.fillStyle = '#000'; g.font = `${Math.round(6 * k)}px Jua, sans-serif`; g.textAlign = 'center';
        g.fillText('퍽!', (f.x + 9) * k, (f.y - 8 - f.t * 14) * k); g.globalAlpha = 1;
        if (f.t > 0.5) fx.splice(i, 1);
      } else {
        f.vy += 90 * dt; f.x += f.vx * dt; f.y += f.vy * dt;
        g.globalAlpha = Math.max(0, 1 - f.t * 1.2); g.fillStyle = f.c;
        g.save(); g.translate(f.x * k, f.y * k); g.rotate(f.t * 9 + i); g.fillRect(-k * 0.9, -k * 0.5, k * 1.8, k * (f.kind === 'confetti' ? 1 : 1.2)); g.restore();
        g.globalAlpha = 1;
        if (f.t > (f.kind === 'confetti' ? 2.6 : 0.8) || f.y > FH + 5) fx.splice(i, 1);
      }
    }
  }

  function drawBak(x, y, r, c, gauge, bt, team) {
    g.save();
    if (!bt) {
      g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = Math.max(2, r * 0.09);
      g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
      g.fillStyle = c; g.beginPath(); g.arc(x, y, r, Math.PI, 0); g.closePath(); g.fill(); // 위쪽 절반은 팀 색
      g.beginPath(); g.arc(x, y, r, 0, 7); g.stroke();
      g.beginPath(); g.moveTo(x - r, y); g.lineTo(x + r, y); g.stroke();
      // 게이지가 찰수록 금이 가요
      g.strokeStyle = '#000'; g.lineWidth = Math.max(1, r * 0.06);
      const cracks = gauge > 0.85 ? 3 : gauge > 0.6 ? 2 : gauge > 0.3 ? 1 : 0;
      const C = [[[-.2, -.9], [-.05, -.55], [-.25, -.3], [0, 0]], [[.6, -.7], [.35, -.35], [.5, -.1]], [[-.7, .4], [-.4, .2], [-.5, .6], [-.2, .75]]];
      for (let i = 0; i < cracks; i++) { g.beginPath(); C[i].forEach(([a, b], j) => j ? g.lineTo(x + a * r, y + b * r) : g.moveTo(x + a * r, y + b * r)); g.stroke(); }
      // 게이지 링
      g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = Math.max(3, r * 0.22);
      g.beginPath(); g.arc(x, y, r * 1.32, 0, 7); g.stroke();
      g.strokeStyle = c; g.beginPath(); g.arc(x, y, r * 1.32, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * gauge); g.stroke();
      g.fillStyle = '#000'; g.font = `${Math.round(r * 0.55)}px Jua, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(`${Math.round(gauge * 100)}%`, x, y + r * 0.5);
    } else {
      // 쩍! 반으로 갈라지며 현수막이 내려와요
      const a = Math.min(1, bt * 2.2) * 1.1;
      for (const s of [-1, 1]) {
        g.save(); g.translate(x + s * r * 0.02, y - r * 0.05); g.rotate(s * a);
        g.fillStyle = c; g.strokeStyle = '#000'; g.lineWidth = Math.max(2, r * 0.09);
        g.beginPath(); g.arc(0, 0, r, s < 0 ? Math.PI / 2 : -Math.PI / 2, s < 0 ? Math.PI * 1.5 : Math.PI / 2); g.closePath(); g.fill(); g.stroke();
        g.restore();
      }
      const drop = Math.min(1, bt * 1.6), bw = r * 2.6, bh = r * 4.2 * drop;
      g.fillStyle = '#fff'; g.strokeStyle = c; g.lineWidth = Math.max(2, r * 0.12);
      g.fillRect(x - bw / 2, y, bw, bh); g.strokeRect(x - bw / 2, y, bw, bh);
      if (drop > 0.6) {
        g.fillStyle = '#000'; g.font = `${Math.round(r * 0.62)}px Jua, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
        const name = MASCOT_NAME[team];
        ['축', name.slice(0, 4), name.slice(4, 8), '승리'].filter(Boolean).forEach((t, i, arr) => g.fillText(t, x, y + bh * (i + 0.6) / (arr.length + 0.2)));
      }
    }
    g.restore();
  }
  function drawBag(x, y, c, rot, alpha, k) {
    g.save(); g.globalAlpha = alpha; g.translate(x, y); g.rotate(rot);
    const s = BAG_R * k;
    g.fillStyle = c; g.strokeStyle = '#000'; g.lineWidth = Math.max(1.5, k * 0.35);
    g.beginPath(); g.roundRect ? g.roundRect(-s, -s, s * 2, s * 2, s * 0.6) : g.rect(-s, -s, s * 2, s * 2); g.fill(); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.75)';
    for (const [a, b] of [[-.4, -.4], [.4, .3], [-.3, .45], [.35, -.35]]) { g.beginPath(); g.arc(a * s, b * s, s * 0.14, 0, 7); g.fill(); }
    g.restore();
  }

  return {
    root: h('div', {}, bars, wrap, tk && tk.root),
    update(s, me) {
      lastS = s; lastMe = me;
      const B = s.bak, tau = (performance.now() - t0) / 1000;
      for (const tm of ['red', 'blue']) {
        if (lastHits[tm] === null) lastHits[tm] = B.hits[tm];
        let n = B.hits[tm] - lastHits[tm];
        lastHits[tm] = B.hits[tm];
        if (me && tm === me.team) { const own = Math.min(n, myPending); myPending -= own; n -= own; }
        if (ctx && me && tm !== me.team) n = 0; // 학생 화면엔 우리 팀 박만
        for (let i = 0; i < Math.min(n, 6); i++) setTimeout(() => spawnTeamBag(tm, (performance.now() - t0) / 1000), i * 90);
        if (B.burst === tm && !burstT[tm] && (!ctx || (me && me.team === tm))) {
          burstT[tm] = 0.001;
          const col = colors(), p = bakPos(tm, tau);
          for (let i = 0; i < 70; i++) fx.push({ kind: 'confetti', x: p.x, y: p.y, vx: (Math.random() - 0.5) * 90, vy: -Math.random() * 70, t: 0, c: ['#ffe11a', '#ff4d4d', '#2f7bff', '#1fa85a', '#fff', col[tm]][i % 6] });
        }
      }
      setOnce(bars, JSON.stringify(B.gauge) + teamsStamp + (me ? me.team : ''), () => ['red', 'blue'].map(t =>
        h('div', { class: `bak-bar t-${t}` + (me && me.team === t ? ' mine' : '') }, teamTag(t),
          h('div', { class: 'zbar' }, h('i', { style: `width:${Math.min(100, B.gauge[t] / B.goal * 100)}%` })),
          h('small', { text: `${Math.round(B.gauge[t] / B.goal * 100)}% · ${B.hits[t]}번 맞힘` }))));
      if (tk && me) {
        tk.who(me.team);
        tk.say(B.burst ? (B.burst === me.team ? '쩍! 우리 팀 박이 터졌다! 🎉' : '아쉽다! 상대 팀 박이 먼저 터졌어.') : TIPS.bak);
      }
    },
  };
}
