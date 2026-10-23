/*
 * 테크킹 운동회 게임 엔진 — 모든 규칙과 판정이 여기 있어요.
 * 실제 서버(server.js)와 체험판이 이 파일을 똑같이 사용합니다.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TechkingEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const EVENT_NAMES = { tug: '전략 줄다리기', land: '땅따먹기', relay: '이어달리기', zone: '거점 점령전', nunchi: '눈치게임' };
  const DURATION = { tug: 60, land: 60, relay: 150, zone: 90, nunchi: 90 }; // 초
  const TEAMS = ['red', 'blue'];
  const TEAM_KO = { red: '테크킹팀', blue: '대니쌤팀' };

  const ROPES = 5;            // 줄 개수
  const ROPE_MOVE_MS = 800;   // 줄을 옮기면 이 시간 동안 못 당김
  const ROPE_K = 6;           // 줄이 움직이는 빠르기
  const ZONE = {
    r: 8, speed: 1.8, goal: 100,  // 거점 반지름, 이동 속도(0.1초당), 목표 점수
    points: [{ x: 22, y: 15 }, { x: 78, y: 15 }, { x: 50, y: 30 }, { x: 22, y: 45 }, { x: 78, y: 45 }],
  };
  const NUNCHI = { rounds: 3, roundMs: 20000, breakMs: 3500, windowMs: 450 };

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  const r1 = v => Math.round(v * 10) / 10;

  function createEngine(options = {}) {
    const now = options.now || Date.now;
    const online = options.isOnline || (() => true);
    const players = new Map();
    let scores = { red: 0, blue: 0 };
    let history = [];
    let game = { phase: 'lobby', event: null };
    let rosterVersion = 1;
    let idSeq = 0;

    const bump = () => { rosterVersion++; };
    const all = () => [...players.values()].filter(online);
    const members = team => all().filter(p => p.team === team);
    const size = team => Math.max(1, members(team).length);

    function resetPlayer(p, t) {
      p.stamina = 100; p.exhausted = false; p.lastTapAt = 0; p.cellAt = 0;
      p.tokens = 14; p.tokenAt = t; p.rope = 0; p.ropeAt = 0;
      p.x = p.team === 'red' ? 6 : 94; p.y = 30; p.tx = p.x; p.ty = p.y;
    }
    function addPlayer(name, team, extra) {
      if (!team) { const r = members('red').length, b = members('blue').length; team = r <= b ? 'red' : 'blue'; }
      const p = Object.assign({ id: options.makeId ? options.makeId() : 'p' + (++idSeq), name, team }, extra || {});
      resetPlayer(p, now());
      players.set(p.id, p);
      bump();
      return p;
    }

    // 연타 매크로 방지: 1인당 초당 12회까지만 인정
    function takeTaps(p, n, t) {
      p.tokens = Math.min(14, p.tokens + (t - p.tokenAt) * 0.012);
      p.tokenAt = t;
      n = clamp(Math.floor(Number(n) || 0), 0, 30);
      const ok = Math.min(n, Math.floor(p.tokens));
      p.tokens -= ok;
      return ok;
    }

    /* ---------- 경기 시작·끝 ---------- */
    function landSize() { const n = players.size; return n <= 12 ? 10 : n <= 24 ? 12 : 14; }

    function startEvent(ev) {
      if (!EVENT_NAMES[ev]) return false;
      const t = now(), goAt = t + 3000;
      game = { phase: 'countdown', event: ev, goAt, endAt: goAt + DURATION[ev] * 1000, winner: null, note: '' };
      for (const p of players.values()) resetPlayer(p, t);

      if (ev === 'tug') {
        game.tug = { ropes: Array.from({ length: ROPES }, () => ({ pos: 0, winner: null, acc: { red: 0, blue: 0 } })) };
        for (const team of TEAMS) shuffle(members(team)).forEach((p, k) => { p.rope = k % ROPES; });
      }
      if (ev === 'land') {
        const n = landSize(), cells = Array(n * n).fill(null);
        cells[0] = 'red'; cells[n * n - 1] = 'blue';
        game.land = { n, cells };
      }
      if (ev === 'relay') {
        game.relay = {};
        for (const team of TEAMS) {
          const order = shuffle(members(team).map(p => p.id));
          const legs = Math.max(1, order.length);
          game.relay[team] = {
            order, legs, legLen: clamp(Math.round(240 / legs), 15, 60), legsDone: 0, idx: 0, progress: 0,
            state: 'run', handoffAt: goAt, lastTapAt: goAt, finishedAt: null, cheerTimes: [], lastHandoffMs: null, skipped: null,
          };
        }
      }
      if (ev === 'zone') {
        game.zone = { points: ZONE.points.map(q => ({ x: q.x, y: q.y, cap: 0, owner: null, red: 0, blue: 0 })), score: { red: 0, blue: 0 }, scoreAt: goAt };
        for (const team of TEAMS) {
          const list = members(team);
          list.forEach((p, k) => { p.x = p.tx = team === 'red' ? 5 : 95; p.y = p.ty = 6 + (k + 0.5) * (48 / list.length); });
        }
      }
      if (ev === 'nunchi') {
        game.endAt = Infinity;
        game.nunchi = { round: 0, rounds: NUNCHI.rounds, state: 'break', breakUntil: goAt, k: 1, window: null, log: [], pts: { red: 0, blue: 0 }, done: {}, roundEndAt: 0 };
      }
      bump();
      return true;
    }

    function finish(winner, note) {
      if (game.phase !== 'playing') return;
      game.phase = 'result';
      game.winner = winner;
      if (winner === 'draw') { scores.red += 50; scores.blue += 50; } else scores[winner] += 100;
      game.note = note || '';
      history.push({ event: EVENT_NAMES[game.event], winner });
      if (history.length > 20) history.shift();
      bump();
    }
    const pick = (a, b) => (a > b ? 'red' : b > a ? 'blue' : 'draw');

    function finishByTime() {
      const ev = game.event;
      if (ev === 'tug') {
        const c = { red: 0, blue: 0 };
        for (const r of game.tug.ropes) {
          const w = r.winner || (r.pos < -5 ? 'red' : r.pos > 5 ? 'blue' : null);
          if (w) c[w]++;
        }
        finish(pick(c.red, c.blue), `시간 종료! 이긴 줄과 더 많이 끌어온 줄: ${TEAM_KO.red} ${c.red}개 · ${TEAM_KO.blue} ${c.blue}개`);
      } else if (ev === 'land') {
        const c = landCount();
        finish(pick(c.red, c.blue), `${TEAM_KO.red} ${c.red}칸 : ${TEAM_KO.blue} ${c.blue}칸`);
      } else if (ev === 'relay') {
        const w = pick(relayFrac(game.relay.red), relayFrac(game.relay.blue));
        finish(w, w === 'draw' ? '시간 종료! 두 팀이 똑같은 거리를 달렸어요.' : '시간 종료! 더 멀리 달린 팀이 이겼어요.');
      } else if (ev === 'zone') {
        const s = game.zone.score;
        finish(pick(s.red, s.blue), `시간 종료! ${TEAM_KO.red} ${s.red}점 : ${TEAM_KO.blue} ${s.blue}점`);
      } else if (ev === 'nunchi') {
        const s = game.nunchi.pts;
        finish(pick(s.red, s.blue), `${TEAM_KO.red} ${s.red}점 : ${TEAM_KO.blue} ${s.blue}점`);
      }
    }

    /* ---------- ① 전략 줄다리기: 5개의 줄 ---------- */
    function tugRope(p, k, t) {
      k = Math.floor(Number(k));
      const R = game.tug.ropes;
      if (!(k >= 0 && k < ROPES) || k === p.rope || R[k].winner) return;
      p.rope = k; p.ropeAt = t;
    }
    function tugTap(p, n, t) {
      if (p.exhausted || t - p.ropeAt < ROPE_MOVE_MS) return;
      const r = game.tug.ropes[p.rope];
      if (!r || r.winner) return;
      const ok = takeTaps(p, n, t);
      if (!ok) return;
      p.stamina -= ok * 2;
      if (p.stamina <= 0) { p.stamina = 0; p.exhausted = true; }
      p.lastTapAt = t;
      r.acc[p.team] += ok;
    }
    function tugWins() {
      const c = { red: 0, blue: 0 };
      for (const r of game.tug.ropes) if (r.winner) c[r.winner]++;
      return c;
    }
    function tickTug(t) {
      for (const p of players.values()) {
        if (t - p.lastTapAt > 400) p.stamina = Math.min(100, p.stamina + 2.5);
        if (p.exhausted && p.stamina >= 40) p.exhausted = false;
      }
      const sr = size('red'), sb = size('blue');
      for (const r of game.tug.ropes) {
        if (!r.winner) {
          // 팀 전체 인원으로 나눠서, 한 줄에 사람을 많이 모을수록 그 줄이 강해져요
          r.pos = clamp(r.pos + (r.acc.blue / sb - r.acc.red / sr) * ROPE_K, -100, 100);
          if (r.pos <= -100) r.winner = 'red';
          else if (r.pos >= 100) r.winner = 'blue';
        }
        r.acc.red = 0; r.acc.blue = 0;
      }
      const w = tugWins();
      if (w.red >= 3) finish('red', `${TEAM_KO.red}이 줄 ${w.red}개를 먼저 차지했어요!`);
      else if (w.blue >= 3) finish('blue', `${TEAM_KO.blue}이 줄 ${w.blue}개를 먼저 차지했어요!`);
    }

    /* ---------- ② 땅따먹기 ---------- */
    function landCount() {
      const c = { red: 0, blue: 0 };
      for (const x of game.land.cells) if (x) c[x]++;
      return c;
    }
    function adjacentOwn(L, i, team) {
      const n = L.n, r = Math.floor(i / n), c = i % n;
      return (r > 0 && L.cells[i - n] === team) || (r < n - 1 && L.cells[i + n] === team) ||
             (c > 0 && L.cells[i - 1] === team) || (c < n - 1 && L.cells[i + 1] === team);
    }
    function landHit(p, i, t) {
      const L = game.land, n = L.n;
      i = Math.floor(Number(i));
      if (!(i >= 0 && i < n * n) || t - p.cellAt < 450 || i === 0 || i === n * n - 1) return false;
      const owner = L.cells[i];
      if (owner === p.team || !adjacentOwn(L, i, p.team)) return false;
      p.cellAt = t;
      L.cells[i] = owner ? null : p.team; // 상대 땅은 두 번 눌러야 뺏겨요
      return true;
    }

    /* ---------- ③ 이어달리기: 운동장 한 바퀴 = 한 구간 ---------- */
    function relayFrac(r) { return clamp((r.legsDone * r.legLen + r.progress) / (r.legs * r.legLen), 0, 1); }
    function hasNext(r) { return r.order.length > 1 && r.legsDone + 1 < r.legs; }
    function runnerOf(r, offset = 0) { return r.order.length ? r.order[(r.idx + offset) % r.order.length] : null; }
    function relayTap(p, n, t) {
      const team = p.team, r = game.relay[team];
      if (!r || r.finishedAt || runnerOf(r) !== p.id || r.state !== 'run') return;
      const ok = takeTaps(p, n, t);
      if (!ok) return;
      r.cheerTimes = r.cheerTimes.filter(x => t - x < 1000);
      const bonus = Math.min(0.6, (r.cheerTimes.length / Math.max(1, size(team) - 1)) * 0.12);
      r.progress += ok * (1 + bonus);
      r.lastTapAt = t;
      if (r.progress >= r.legLen) {
        r.legsDone++; r.progress = 0;
        if (r.legsDone >= r.legs) { r.finishedAt = t; finish(team, `${TEAM_KO[team]}이 먼저 결승선에 들어왔어요!`); }
        else { r.idx++; r.state = 'handoff'; r.handoffAt = t; r.skipped = null; }
      }
    }
    function relayCheer(p, n, t) {
      const r = game.relay[p.team];
      if (!r || r.finishedAt || runnerOf(r) === p.id) return;
      const ok = takeTaps(p, n, t);
      for (let k = 0; k < ok; k++) r.cheerTimes.push(t);
      if (r.cheerTimes.length > 300) r.cheerTimes.splice(0, r.cheerTimes.length - 300);
    }
    function relayBaton(p, t) {
      const r = game.relay[p.team];
      if (!r || r.state !== 'handoff' || runnerOf(r) !== p.id) return;
      r.state = 'run'; r.lastTapAt = t; r.lastHandoffMs = t - r.handoffAt;
    }
    function tickRelay(t) {
      for (const team of TEAMS) {
        const r = game.relay[team];
        if (r.finishedAt || !r.order.length) continue;
        if (r.state === 'handoff' && t - r.handoffAt > 4000) { r.state = 'run'; r.lastTapAt = t; r.lastHandoffMs = 4000; }
        const runner = players.get(runnerOf(r));
        if (r.state === 'run' && (!runner || !online(runner) || t - r.lastTapAt > 7000)) {
          r.skipped = runner ? runner.name : '나간 친구';
          r.idx++; r.state = 'handoff'; r.handoffAt = t;
        }
      }
    }

    /* ---------- ④ 거점 점령전 ---------- */
    function zoneMove(p, x, y) {
      x = Number(x); y = Number(y);
      if (!isFinite(x) || !isFinite(y)) return;
      p.tx = clamp(x, 2, 98); p.ty = clamp(y, 2, 58);
    }
    function tickZone(t) {
      const Z = game.zone, list = all();
      for (const p of list) {
        const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy);
        if (d <= ZONE.speed) { p.x = p.tx; p.y = p.ty; } else { p.x += (dx / d) * ZONE.speed; p.y += (dy / d) * ZONE.speed; }
      }
      for (const q of Z.points) {
        q.red = 0; q.blue = 0;
        for (const p of list) if (Math.hypot(p.x - q.x, p.y - q.y) <= ZONE.r) q[p.team]++;
        const diff = q.red - q.blue; // 거점 안에 더 많은 팀 쪽으로 게이지가 움직여요
        if (diff) q.cap = clamp(q.cap + clamp(diff, -3, 3) * 2, -100, 100);
        if (q.cap >= 100) q.owner = 'red';
        else if (q.cap <= -100) q.owner = 'blue';
        else if (q.owner === 'red' && q.cap <= 0) q.owner = null;
        else if (q.owner === 'blue' && q.cap >= 0) q.owner = null;
      }
      while (t - Z.scoreAt >= 1000) {
        Z.scoreAt += 1000;
        for (const q of Z.points) if (q.owner) Z.score[q.owner]++;
      }
      if (Z.score.red >= ZONE.goal || Z.score.blue >= ZONE.goal) {
        const w = pick(Z.score.red, Z.score.blue);
        finish(w, w === 'draw' ? '두 팀이 동시에 100점!' : `${TEAM_KO[w]}이 먼저 ${ZONE.goal}점을 모았어요!`);
      }
    }

    /* ---------- ⑤ 눈치게임 ---------- */
    function nunchiCall(p, t) {
      const N = game.nunchi;
      if (N.state !== 'play' || N.done[p.id]) return;
      N.done[p.id] = true;
      if (!N.window) N.window = { k: N.k, at: t, ids: [] };
      N.window.ids.push(p.id); // 0.45초 안에 같이 누르면 겹친 거예요
    }
    function tickNunchi(t) {
      const N = game.nunchi;
      if (N.state === 'break') {
        if (t >= N.breakUntil) { N.round++; N.state = 'play'; N.k = 1; N.window = null; N.done = {}; N.log = []; N.roundEndAt = t + NUNCHI.roundMs; }
        return;
      }
      if (N.window && t - N.window.at >= NUNCHI.windowMs) {
        const ps = N.window.ids.map(id => players.get(id)).filter(Boolean);
        if (ps.length === 1) N.pts[ps[0].team]++;
        else ps.forEach(p => N.pts[p.team]--);
        N.log.push({ k: N.window.k, ok: ps.length === 1, names: ps.map(p => p.name), teams: ps.map(p => p.team) });
        N.k++; N.window = null;
      }
      if (N.window) return;
      const left = all().filter(p => !N.done[p.id]);
      const timeout = t >= N.roundEndAt;
      if (left.length <= 1 || timeout) {
        if (left.length && all().length > 1) {
          left.forEach(p => N.pts[p.team]--);
          N.log.push({ last: true, names: left.map(p => p.name), teams: left.map(p => p.team) });
        }
        if (N.round >= N.rounds) finishByTime();
        else { N.state = 'break'; N.breakUntil = t + NUNCHI.breakMs; }
      }
    }

    /* ---------- 공통 ---------- */
    function act(p, type, d) {
      if (game.phase !== 'playing' || !p) return false;
      d = d || {};
      const t = now();
      switch (game.event) {
        case 'tug': if (type === 'tap') tugTap(p, d.n, t); else if (type === 'rope') tugRope(p, d.k, t); break;
        case 'land': if (type === 'cell') return landHit(p, d.i, t); break;
        case 'relay':
          if (type === 'tap') relayTap(p, d.n, t);
          else if (type === 'cheer') relayCheer(p, d.n, t);
          else if (type === 'baton') relayBaton(p, t);
          break;
        case 'zone': if (type === 'move') zoneMove(p, d.x, d.y); break;
        case 'nunchi': if (type === 'call') nunchiCall(p, t); break;
      }
      return true;
    }

    function tick(t) {
      t = t || now();
      if (game.phase === 'countdown' && t >= game.goAt) game.phase = 'playing';
      if (game.phase !== 'playing') return;
      if (game.event === 'tug') tickTug(t);
      else if (game.event === 'relay') tickRelay(t);
      else if (game.event === 'zone') tickZone(t);
      else if (game.event === 'nunchi') tickNunchi(t);
      if (game.phase === 'playing' && t >= game.endAt) finishByTime();
    }

    function publicState() {
      const t = now(), ev = game.event;
      const s = {
        phase: game.phase, event: ev, eventName: EVENT_NAMES[ev] || '', scores, winner: game.winner, note: game.note,
        history: history.slice(-6),
        countdown: game.phase === 'countdown' ? Math.max(1, Math.ceil((game.goAt - t) / 1000)) : 0,
        timeLeft: game.phase === 'countdown' ? DURATION[ev] : game.phase === 'playing' ? Math.max(0, Math.ceil((game.endAt - t) / 1000)) : 0,
      };
      if (ev === 'tug' && game.tug) {
        const list = all();
        s.tug = {
          wins: tugWins(),
          // 누가 어느 줄에 있는지: [아이디, 줄 번호, 팀, 옮기는 중(1/0), 당기는 중(1/0)]
          who: list.map(p => [p.id, p.rope, p.team, t - p.ropeAt < ROPE_MOVE_MS ? 1 : 0, t - p.lastTapAt < 350 ? 1 : 0]),
          ropes: game.tug.ropes.map((r, k) => ({
            pos: r1(r.pos), winner: r.winner,
            red: list.filter(p => p.team === 'red' && p.rope === k).length,
            blue: list.filter(p => p.team === 'blue' && p.rope === k).length,
          })),
        };
      }
      if (ev === 'land' && game.land) {
        const L = game.land;
        s.land = { n: L.n, cells: L.cells.map(c => (c === 'red' ? 'r' : c === 'blue' ? 'b' : '.')).join(''), count: landCount() };
      }
      if (ev === 'relay' && game.relay) {
        s.relay = {};
        for (const team of TEAMS) {
          const r = game.relay[team], cur = players.get(runnerOf(r)), nxt = hasNext(r) ? players.get(runnerOf(r, 1)) : null;
          r.cheerTimes = r.cheerTimes.filter(x => t - x < 1000);
          s.relay[team] = {
            legs: r.legs, legsDone: Math.min(r.legsDone, r.legs), frac: relayFrac(r),
            lap: r.finishedAt ? 1 : r.progress / r.legLen,
            runner: cur ? cur.name : '', next: nxt ? nxt.name : '', state: r.state, finished: !!r.finishedAt,
            lastHandoffMs: r.lastHandoffMs, skipped: r.skipped, cheering: r.cheerTimes.length,
          };
        }
      }
      if (ev === 'zone' && game.zone) {
        const Z = game.zone;
        s.zone = {
          goal: ZONE.goal, r: ZONE.r, score: Z.score,
          points: Z.points.map(q => ({ x: q.x, y: q.y, cap: Math.round(q.cap), owner: q.owner, red: q.red, blue: q.blue })),
          pos: all().map(p => [p.id, r1(p.x), r1(p.y), p.team]),
        };
      }
      if (ev === 'nunchi' && game.nunchi) {
        const N = game.nunchi;
        s.nunchi = {
          round: N.round, rounds: N.rounds, k: N.k, state: N.state, log: N.log.slice(-8), pts: N.pts,
          left: all().filter(p => !N.done[p.id]).length,
          breakLeft: N.state === 'break' ? Math.max(1, Math.ceil((N.breakUntil - t) / 1000)) : 0,
        };
        if (game.phase === 'playing') s.timeLeft = N.state === 'play' ? Math.max(0, Math.ceil((N.roundEndAt - t) / 1000)) : 0;
      }
      return s;
    }

    function meState(p) {
      if (!p) return null;
      const t = now(), m = { id: p.id, name: p.name, team: p.team };
      const ev = game.event;
      if (ev === 'tug') {
        m.stamina = Math.round(p.stamina); m.exhausted = p.exhausted; m.rope = p.rope;
        m.moving = t - p.ropeAt < ROPE_MOVE_MS;
        m.ropeDone = !!(game.tug && game.tug.ropes[p.rope] && game.tug.ropes[p.rope].winner);
      }
      if (ev === 'land') m.cool = Math.max(0, 450 - (t - p.cellAt));
      if (ev === 'relay' && game.relay) {
        const r = game.relay[p.team], cur = runnerOf(r);
        m.role = r.finishedAt ? 'done' : cur === p.id ? (r.state === 'handoff' ? 'baton' : 'run')
          : hasNext(r) && runnerOf(r, 1) === p.id ? 'next' : 'cheer';
        m.legLen = r.legLen; m.progress = r1(r.progress);
      }
      if (ev === 'zone') { m.tx = r1(p.tx); m.ty = r1(p.ty); }
      if (ev === 'nunchi' && game.nunchi) m.done = !!game.nunchi.done[p.id];
      return m;
    }

    function roster() { return [...players.values()].map(p => ({ id: p.id, name: p.name, team: p.team, on: online(p) })); }

    return {
      EVENT_NAMES, DURATION, TEAMS, TEAM_KO, ROPES, ZONE, NUNCHI,
      players,
      get game() { return game; },
      get scores() { return scores; },
      get rosterVersion() { return rosterVersion; },
      bump, members, addPlayer, startEvent, finishByTime, act, tick, publicState, meState, roster,
      toLobby() { game = { phase: 'lobby', event: null }; bump(); },
      stop() {
        if (game.phase === 'playing') finishByTime();
        else if (game.phase === 'countdown') { game = { phase: 'lobby', event: null }; bump(); }
      },
      shuffleTeams() {
        if (game.phase === 'playing' || game.phase === 'countdown') return;
        shuffle(all()).forEach((p, k) => { p.team = TEAMS[k % 2]; });
        bump();
      },
      moveTeam(id) {
        const p = players.get(id);
        if (p && game.phase !== 'playing') { p.team = p.team === 'red' ? 'blue' : 'red'; resetPlayer(p, now()); bump(); }
      },
      removeOffline() { for (const p of [...players.values()]) if (!online(p)) players.delete(p.id); bump(); },
      resetScores() { scores = { red: 0, blue: 0 }; history = []; bump(); },
    };
  }

  return { createEngine, EVENT_NAMES, DURATION, TEAMS, TEAM_KO };
});
