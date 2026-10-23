/*
 * 경기 화면 5종목
 * createGameView(종목, ctx)  — ctx가 있으면 학생이 조작하는 화면, 없으면(null) 선생님 관전 화면
 * ctx = { tap(종류), act(종류, 데이터) }
 */
function createGameView(ev, ctx) {
  const make = { tug: tugGame, land: landGame, relay: relayGame, zone: zoneGame, nunchi: nunchiGame }[ev];
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

/* ⑤ 눈치게임 */
function nunchiGame(ctx) {
  const round = h('div', { class: 'nunchi-round' });
  const num = h('div', { class: 'nunchi-num' });
  const sub = h('div', { class: 'nunchi-sub' });
  const pts = h('div', { class: 'nunchi-pts' });
  const log = h('ul', { class: 'nunchi-log' });
  let btn = null, tk = null;
  if (ctx) {
    btn = h('button', { class: 'tap', type: 'button' });
    btn.addEventListener('pointerdown', e => {
      e.preventDefault();
      if (btn.disabled) return;
      ctx.act('call');
      if (navigator.vibrate) navigator.vibrate(15);
    });
    tk = techking(TIPS.nunchi);
  }
  return {
    root: h('div', {}, round, h('div', { class: 'box nunchi-board' }, h('small', { text: '다음 숫자' }), num, sub), pts,
      btn && h('div', { class: 'pad' }, btn), log, tk && tk.root),
    update(s, me) {
      const N = s.nunchi;
      round.textContent = N.round ? `${N.round} / ${N.rounds} 라운드` : '곧 시작해요';
      const brk = N.state === 'break';
      num.textContent = brk ? '준비' : String(N.k);
      sub.textContent = brk ? `${N.round + 1 > N.rounds ? '' : N.round + 1 + '라운드 '}${N.breakLeft}초 뒤 시작` : `아직 못 외친 사람 ${N.left}명`;
      setOnce(pts, N.pts.red + ':' + N.pts.blue, () => [teamTag('red', `${N.pts.red}점`), teamTag('blue', `${N.pts.blue}점`)]);
      log.replaceChildren(...N.log.slice().reverse().map(x => {
        const who = x.names.map((n, i) => h('span', { class: `t-${x.teams[i]} who` }, n));
        if (x.last) return h('li', { class: 'bad' }, '꼴찌 ', ...who, ' −1');
        return h('li', { class: x.ok ? 'good' : 'bad' }, h('b', { text: String(x.k) }), ' ', ...who, x.ok ? ' +1' : ' 겹쳤다! −1');
      }));
      if (btn) {
        const live = s.phase === 'playing' && !brk;
        btn.className = `tap t-${me.team}`;
        btn.disabled = !live || me.done;
        btn.textContent = me.done ? '외쳤어!' : brk ? '준비…' : `${N.k}!`;
        tk.who(me.team);
        tk.say(me.done ? '외쳤다! 이번 라운드는 친구들을 지켜보자.' : TIPS.nunchi);
      }
    },
  };
}
