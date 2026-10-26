/*
 * 경기 화면 5종목
 * createGameView(종목, ctx)  — ctx가 있으면 학생이 조작하는 화면, 없으면(null) 선생님 관전 화면
 * ctx = { tap(종류), act(종류, 데이터) }
 */
function createGameView(ev, ctx) {
  const make = { tug: tugGame, land: landGame, relay: relayGame, zone: zoneGame, nunchi: nunchiGame, flip: flipGame, meteor: meteorGame, rps: rpsGame }[ev];
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

/* ⑦ 운석 피하기 — 우주 공간 가로·세로 평면 */
function meteorGame(ctx) {
  const Eng = (typeof TechkingEngine !== 'undefined') ? TechkingEngine : null;
  const wrap = h('div', { class: 'meteor-wrap' + (ctx ? ' playable' : '') });
  const cv = h('canvas', { class: 'meteor-cv', role: 'img', 'aria-label': ctx ? '우주 공간. 드래그하거나 방향키로 움직여요' : '운석 피하기 경기장' });
  const banner = h('div', { class: 'meteor-banner', hidden: '' });
  wrap.append(cv, banner);
  const scoreBox = h('div', { class: 'meteor-score' });
  const tk = ctx ? techking(TIPS.meteor) : null;
  const g = cv.getContext('2d');

  let W = 100, H = 70, PR = 2.4, RR = 7;
  let meteors = [], seed = null, goAt = 0, offset = -Infinity, lastS = null, lastMe = null, roster = [];
  const others = new Map();         // 친구들 화면 위치 (부드럽게 따라가기)
  const imgs = {};
  let myX = 50, myY = 35, tgtX = 50, tgtY = 35, placed = false, hitAt = 0, shieldLocal = 0, lastSent = 0, sentX = -1, sentY = -1;
  const keys = new Set();
  const stars = Array.from({ length: 90 }, (_, i) => ({ x: (i * 37.7) % 100, y: (i * 53.3) % 70, r: (i % 3) * 0.12 + 0.12, p: i }));

  function img(team) {
    const src = MASCOT[team];
    if (!imgs[team] || imgs[team].src !== new URL(src, location.href).href) { const im = new Image(); im.src = src; imgs[team] = im; }
    return imgs[team];
  }
  function serverNow() { return Date.now() + (isFinite(offset) ? offset : 0); }

  // 드래그: 손가락이 움직인 만큼 내 우주선이 움직여요 (손가락이 캐릭터를 가리지 않게)
  let drag = null;
  if (ctx) {
    wrap.addEventListener('pointerdown', e => { e.preventDefault(); drag = { x: e.clientX, y: e.clientY }; wrap.setPointerCapture && wrap.setPointerCapture(e.pointerId); });
    wrap.addEventListener('pointermove', e => {
      if (!drag) return;
      const k = W / cv.clientWidth * 1.15;
      tgtX = Math.max(0, Math.min(W, tgtX + (e.clientX - drag.x) * k));
      tgtY = Math.max(0, Math.min(H, tgtY + (e.clientY - drag.y) * k));
      drag = { x: e.clientX, y: e.clientY };
    });
    const end = () => { drag = null; };
    wrap.addEventListener('pointerup', end); wrap.addEventListener('pointercancel', end);
    const kd = e => {
      if (!wrap.isConnected) return document.removeEventListener('keydown', kd);
      if (/^(Arrow|Key[WASD])/.test(e.code)) { e.preventDefault(); keys.add(e.code); }
    };
    const ku = e => { keys.delete(e.code); if (!wrap.isConnected) document.removeEventListener('keyup', ku); };
    document.addEventListener('keydown', kd); document.addEventListener('keyup', ku);
  }

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1), cw = cv.clientWidth || 340;
    const ch = cw * H / W;
    if (cv.width !== Math.round(cw * dpr)) { cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr); cv.style.height = ch + 'px'; }
    return cv.width / W; // 1칸당 픽셀
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

    // 내 움직임
    if (ctx && lastMe && playing && !meDown) {
      let kx = 0, ky = 0;
      if (keys.has('ArrowLeft') || keys.has('KeyA')) kx--; if (keys.has('ArrowRight') || keys.has('KeyD')) kx++;
      if (keys.has('ArrowUp') || keys.has('KeyW')) ky--; if (keys.has('ArrowDown') || keys.has('KeyS')) ky++;
      if (kx || ky) { const d = Math.hypot(kx, ky); tgtX = Math.max(0, Math.min(W, myX + kx / d * 8)); tgtY = Math.max(0, Math.min(H, myY + ky / d * 8)); }
      const dx = tgtX - myX, dy = tgtY - myY, d = Math.hypot(dx, dy), step = Eng ? Eng.METEOR.speed * dt : 42 * dt;
      if (d <= step) { myX = tgtX; myY = tgtY; } else { myX += dx / d * step; myY += dy / d * step; }
      // 맞았는지 내 화면에서 바로 확인
      if (Date.now() > shieldLocal) {
        for (const m of meteors) {
          const a = tau - m.t0;
          if (a < 0 || a > m.life) continue;
          if (Math.hypot(m.x + m.vx * a - myX, m.y + m.vy * a - myY) < m.r + PR * 0.85) {
            hitAt = Date.now(); ctx.act('hit'); if (navigator.vibrate) navigator.vibrate(120); break;
          }
        }
      }
      if (now - lastSent > 130 && (Math.abs(myX - sentX) > 0.05 || Math.abs(myY - sentY) > 0.05)) {
        lastSent = now; sentX = myX; sentY = myY; ctx.act('pos', { x: myX, y: myY });
      }
    }
    draw(tau);
  }
  requestAnimationFrame(frame);

  function draw(tau) {
    const k = resize(), w = cv.width, hgt = cv.height;
    // 우주 배경
    const bg = g.createRadialGradient(w * 0.5, hgt * 0.4, 10, w * 0.5, hgt * 0.5, w * 0.8);
    bg.addColorStop(0, '#22306b'); bg.addColorStop(1, '#0b1030');
    g.fillStyle = bg; g.fillRect(0, 0, w, hgt);
    for (const st of stars) {
      g.globalAlpha = 0.45 + 0.4 * Math.sin(tau * 2 + st.p);
      g.fillStyle = '#fff'; g.beginPath(); g.arc(st.x * k, st.y * k, st.r * k, 0, 7); g.fill();
    }
    g.globalAlpha = 1;
    // 운석
    for (const m of meteors) {
      const a = tau - m.t0;
      if (a < 0 || a > m.life) continue;
      const x = (m.x + m.vx * a) * k, y = (m.y + m.vy * a) * k, r = m.r * k, sp = Math.hypot(m.vx, m.vy);
      const tx = x - (m.vx / sp) * r * 3.2, ty = y - (m.vy / sp) * r * 3.2;
      const tr = g.createLinearGradient(x, y, tx, ty);
      tr.addColorStop(0, 'rgba(255,170,60,.85)'); tr.addColorStop(1, 'rgba(255,90,30,0)');
      g.strokeStyle = tr; g.lineWidth = r * 1.3; g.lineCap = 'round';
      g.beginPath(); g.moveTo(x, y); g.lineTo(tx, ty); g.stroke();
      g.save(); g.translate(x, y); g.rotate(a * m.spin);
      g.fillStyle = '#8d7966'; g.strokeStyle = '#2a1e14'; g.lineWidth = Math.max(1.5, k * 0.35);
      g.beginPath();
      for (let i = 0; i < 8; i++) { const ang = i / 8 * Math.PI * 2, rr = r * (0.82 + ((i * 7) % 3) * 0.09); g.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr); }
      g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#6b5a4a';
      g.beginPath(); g.arc(-r * 0.3, -r * 0.2, r * 0.22, 0, 7); g.arc(r * 0.3, r * 0.25, r * 0.16, 0, 7); g.fill();
      g.restore();
    }
    // 친구들
    const css = getComputedStyle(document.documentElement);
    const col = { red: css.getPropertyValue('--red').trim() || '#ff4d4d', blue: css.getPropertyValue('--blue').trim() || '#2f7bff' };
    const names = new Map(roster.map(p => [p.id, p.name]));
    for (const [id, o] of others) {
      o.x += (o.tx - o.x) * 0.3; o.y += (o.ty - o.y) * 0.3;
      if (lastMe && id === lastMe.id) continue;
      drawPlayer(o.x * k, o.y * k, PR * k, o.team, o.down, o.rev, o.shield, initial(names.get(id)), false, col, k);
    }
    if (ctx && lastMe) {
      const meDown = lastMe.down || Date.now() - hitAt < 700;
      drawPlayer(myX * k, myY * k, PR * k * 1.25, lastMe.team, meDown, (others.get(lastMe.id) || {}).rev || 0, Date.now() < shieldLocal, '', true, col, k);
    }
  }

  function drawPlayer(x, y, r, team, down, rev, shield, label, isMe, col, k) {
    g.save();
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
      if (shield) { g.strokeStyle = 'rgba(160,230,255,.9)'; g.setLineDash([k * 0.6, k * 0.5]); g.lineWidth = Math.max(1.5, k * 0.35); g.beginPath(); g.arc(x, y, r + k * 1.1, 0, 7); g.stroke(); }
    }
    g.restore();
  }

  return {
    root: h('div', {}, scoreBox, wrap, tk && tk.root),
    update(s, me, rs) {
      lastS = s; lastMe = me; roster = rs || roster;
      const M = s.meteor;
      W = M.w; H = M.h; PR = M.pr; RR = M.reviveR; goAt = M.goAt;
      offset = Math.max(offset, M.now - Date.now()); // 서버 시계 맞추기
      if (M.seed !== seed && Eng) { seed = M.seed; meteors = Eng.makeMeteors(seed); }
      const seen = new Set();
      for (const [id, x, y, team, down, rev, shield] of M.pos) {
        seen.add(id);
        const o = others.get(id) || { x, y };
        Object.assign(o, { tx: x, ty: y, team, down, rev, shield });
        others.set(id, o);
      }
      for (const id of [...others.keys()]) if (!seen.has(id)) others.delete(id);
      if (me) {
        if (!placed || me.down) { myX = tgtX = me.x; myY = tgtY = me.y; placed = true; }
        shieldLocal = Date.now() + (me.shield || 0);
        if (!me.down && Date.now() - hitAt > 700) hitAt = 0;
        banner.hidden = !me.down;
        banner.textContent = '쾅! 쓰러졌어요. 팀원이 옆에 오면 부활해요';
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
