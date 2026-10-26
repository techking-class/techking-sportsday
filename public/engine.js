/*
 * 테크킹 운동회 게임 엔진 — 모든 규칙과 판정이 여기 있어요.
 * 실제 서버(server.js)와 체험판이 이 파일을 똑같이 사용합니다.
 *
 * ⚖ 인원 보정: 두 팀 인원이 달라도 공평하도록
 *   팀 크기 비율(weight = 평균 인원 ÷ 우리 팀 인원)로 힘·점수·쿨타임을 맞춰요.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TechkingEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const EVENT_NAMES = {
    tug: '전략 줄다리기', land: '땅따먹기', relay: '이어달리기', zone: '거점 점령전',
    nunchi: '눈치게임', flip: '판뒤집기', meteor: '운석 피하기', rps: '단체 가위바위보',
  };
  const DURATION = { tug: 60, land: 60, relay: 150, zone: 90, nunchi: 90, flip: 45, meteor: 60, rps: 120 }; // 초
  const TEAMS = ['red', 'blue'];

  const ROPES = 5;            // 줄 개수
  const ROPE_MOVE_MS = 800;   // 줄을 옮기면 이 시간 동안 못 당김
  const ROPE_K = 6;           // 줄이 움직이는 빠르기
  const LAND_COOL = 450;      // 땅따먹기 기본 쿨타임(ms)
  const FLIP_COOL = 300;      // 판뒤집기 기본 쿨타임(ms)
  const ZONE = {
    r: 8, speed: 1.8, goal: 100,
    points: [{ x: 22, y: 15 }, { x: 78, y: 15 }, { x: 50, y: 30 }, { x: 22, y: 45 }, { x: 78, y: 45 }],
  };
  const NUNCHI = { rounds: 3, roundMs: 20000, breakMs: 3500, windowMs: 450 };
  // 단체 가위바위보: 팀원이 가장 많이 낸 손이 팀의 손! 3판 먼저 이기면 승리
  const RPS = { pickMs: 7000, revealMs: 3500, win: 3, maxRounds: 9 };
  const BEATS = { r: 's', s: 'p', p: 'r' }; // 바위>가위, 가위>보, 보>바위
  // 운석 피하기: 우주 공간 가로 100 × 세로 70
  const METEOR = { w: 100, h: 70, pr: 2.4, speed: 42, reviveR: 7, reviveMs: 2000, shieldMs: 2000 };

  // 모든 화면이 같은 순서·같은 시간에 같은 운석을 보도록, 같은 '씨앗(seed)'으로 운석 목록을 계산해요
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function makeMeteors(seed, durSec = 60) {
    const R = mulberry32(seed), W = METEOR.w, H = METEOR.h, m = 6, out = [];
    let t = 1.5;
    while (t < durSec) {
      const prog = t / durSec;
      t += -Math.log(1 - R()) / (0.9 + 4.6 * prog); // 시간이 갈수록 많아져요
      const edge = Math.floor(R() * 4);
      let x, y;
      if (edge === 0) { x = R() * W; y = -m; } else if (edge === 1) { x = W + m; y = R() * H; }
      else if (edge === 2) { x = R() * W; y = H + m; } else { x = -m; y = R() * H; }
      const tx = W * (0.15 + 0.7 * R()), ty = H * (0.15 + 0.7 * R());
      const sp = 9 + 10 * prog + R() * 7, d = Math.hypot(tx - x, ty - y);
      out.push({ t0: t, x, y, vx: ((tx - x) / d) * sp, vy: ((ty - y) / d) * sp,
        r: 1.8 + R() * 2.6 * (0.6 + 0.6 * prog), life: (Math.hypot(W, H) + 2 * m) / sp, spin: R() * 4 - 2 });
    }
    return out;
  }
  
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const r1 = v => Math.round(v * 10) / 10;
  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  // 받침에 따라 이/가
  function iga(w) {
    const c = String(w).charCodeAt(String(w).length - 1);
    if (!(c >= 0xac00 && c <= 0xd7a3)) return w + '이(가)';
    return w + ((c - 0xac00) % 28 ? '이' : '가');
  }
  const fmt = v => (Number.isInteger(v) ? String(v) : v.toFixed(1));

  function createEngine(options = {}) {
    const now = options.now || Date.now;
    const online = options.isOnline || (() => true);
    const TEAM_KO = { red: '테크킹팀', blue: '대니쌤팀' };
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
    // ⚖ 인원 보정 가중치: 인원이 적은 팀일수록 1보다 커요
    function weight(team) { const ref = (size('red') + size('blue')) / 2; return ref / size(team); }

    function resetPlayer(p, t) {
      p.stamina = 100; p.exhausted = false; p.lastTapAt = 0; p.cellAt = 0;
      p.tokens = 14; p.tokenAt = t; p.rope = 0; p.ropeAt = 0;
      p.down = false; p.rev = 0; p.shieldUntil = 0; p.posAt = t; p.hits = 0;
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
    function takeTaps(p, n, t) {
      p.tokens = Math.min(14, p.tokens + (t - p.tokenAt) * 0.012); // 초당 12회까지
      p.tokenAt = t;
      n = clamp(Math.floor(Number(n) || 0), 0, 30);
      const ok = Math.min(n, Math.floor(p.tokens));
      p.tokens -= ok;
      return ok;
    }

    /* ---------- 경기 시작·끝 ---------- */
    function landSize() { const n = players.size; return n <= 12 ? 10 : n <= 24 ? 12 : 14; }
    function flipSize() { const n = players.size; return n <= 12 ? 8 : n <= 24 ? 10 : 12; } // 8×8 ~ 12×12판

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
      if (ev === 'flip') {
        const n = flipSize();
        const cells = shuffle(Array.from({ length: n * n }, (_, i) => (i % 2 ? 'red' : 'blue')));
        game.flip = { n, cells, flips: Array(n * n).fill(0) };
      }
      if (ev === 'rps') {
        game.endAt = Infinity;
        game.rps = { round: 0, state: 'reveal', revealUntil: goAt, picks: {}, wins: { red: 0, blue: 0 }, log: [], roundStart: 0, roundEndAt: 0, over: false };
      }
      if (ev === 'meteor') {
        game.meteor = { seed: Math.floor(Math.random() * 2 ** 31), score: { red: 0, blue: 0 }, scoreAt: goAt };
        for (const team of TEAMS) {
          const list = members(team);
          list.forEach((p, k) => {
            p.x = team === 'red' ? 30 : 70; p.y = 8 + (k + 0.5) * (54 / list.length);
            p.shieldUntil = goAt + METEOR.shieldMs; p.posAt = goAt;
          });
        }
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
    const pick = (a, b) => (Math.abs(a - b) < 1e-9 ? 'draw' : a > b ? 'red' : 'blue');

    function finishByTime() {
      const ev = game.event, R = TEAM_KO.red, B = TEAM_KO.blue;
      if (ev === 'tug') {
        const c = { red: 0, blue: 0 };
        for (const r of game.tug.ropes) {
          const w = r.winner || (r.pos < -5 ? 'red' : r.pos > 5 ? 'blue' : null);
          if (w) c[w]++;
        }
        finish(pick(c.red, c.blue), `시간 종료! 이긴 줄과 더 많이 끌어온 줄: ${R} ${c.red}개 · ${B} ${c.blue}개`);
      } else if (ev === 'land') {
        const c = landCount();
        finish(pick(c.red, c.blue), `${R} ${c.red}칸 : ${B} ${c.blue}칸`);
      } else if (ev === 'relay') {
        const w = pick(relayFrac(game.relay.red), relayFrac(game.relay.blue));
        finish(w, w === 'draw' ? '시간 종료! 두 팀이 똑같은 거리를 달렸어요.' : '시간 종료! 더 멀리 달린 팀이 이겼어요.');
      } else if (ev === 'zone') {
        const s = game.zone.score;
        finish(pick(s.red, s.blue), `시간 종료! ${R} ${s.red}점 : ${B} ${s.blue}점`);
      } else if (ev === 'nunchi') {
        const s = game.nunchi.pts;
        finish(pick(r1(s.red), r1(s.blue)), `${R} ${fmt(r1(s.red))}점 : ${B} ${fmt(r1(s.blue))}점`);
      } else if (ev === 'rps') {
        const w = game.rps.wins;
        finish(pick(w.red, w.blue), `${R} ${w.red}승 : ${B} ${w.blue}승`);
      } else if (ev === 'meteor') {
        const s = game.meteor.score;
        finish(pick(s.red, s.blue), `${R} ${s.red}점 : ${B} ${s.blue}점`);
      } else if (ev === 'flip') {
        const c = flipCount();
        finish(pick(c.red, c.blue), `${R} ${c.red}장 : ${B} ${c.blue}장`);
      }
    }

    /* ---------- ① 전략 줄다리기 ---------- */
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
    function tugWins() { const c = { red: 0, blue: 0 }; for (const r of game.tug.ropes) if (r.winner) c[r.winner]++; return c; }
    function tickTug(t) {
      for (const p of players.values()) {
        if (t - p.lastTapAt > 400) p.stamina = Math.min(100, p.stamina + 2.5);
        if (p.exhausted && p.stamina >= 40) p.exhausted = false;
      }
      const sr = size('red'), sb = size('blue');
      for (const r of game.tug.ropes) {
        if (!r.winner) {
          // ⚖ 팀 인원으로 나눠서 인원이 달라도 같은 힘
          r.pos = clamp(r.pos + (r.acc.blue / sb - r.acc.red / sr) * ROPE_K, -100, 100);
          if (r.pos <= -100) r.winner = 'red';
          else if (r.pos >= 100) r.winner = 'blue';
        }
        r.acc.red = 0; r.acc.blue = 0;
      }
      const w = tugWins();
      if (w.red >= 3) finish('red', `${iga(TEAM_KO.red)} 줄 ${w.red}개를 먼저 차지했어요!`);
      else if (w.blue >= 3) finish('blue', `${iga(TEAM_KO.blue)} 줄 ${w.blue}개를 먼저 차지했어요!`);
    }

    /* ---------- ② 땅따먹기 ---------- */
    function landCount() { const c = { red: 0, blue: 0 }; for (const x of game.land.cells) if (x) c[x]++; return c; }
    function adjacentOwn(L, i, team) {
      const n = L.n, r = Math.floor(i / n), c = i % n;
      return (r > 0 && L.cells[i - n] === team) || (r < n - 1 && L.cells[i + n] === team) ||
             (c > 0 && L.cells[i - 1] === team) || (c < n - 1 && L.cells[i + 1] === team);
    }
    // ⚖ 인원이 많은 팀은 한 명당 쿨타임이 조금 길어져서, 팀 전체 속도가 같아요
    const coolFor = (p, base) => Math.round(base / weight(p.team));
    function landHit(p, i, t) {
      const L = game.land, n = L.n;
      i = Math.floor(Number(i));
      if (!(i >= 0 && i < n * n) || t - p.cellAt < coolFor(p, LAND_COOL) || i === 0 || i === n * n - 1) return false;
      const owner = L.cells[i];
      if (owner === p.team || !adjacentOwn(L, i, p.team)) return false;
      p.cellAt = t;
      L.cells[i] = owner ? null : p.team;
      return true;
    }

    /* ---------- ③ 이어달리기 ---------- */
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
        if (r.legsDone >= r.legs) { r.finishedAt = t; finish(team, `${iga(TEAM_KO[team])} 먼저 결승선에 들어왔어요!`); }
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
      const Z = game.zone, list = all(), w = { red: weight('red'), blue: weight('blue') };
      for (const p of list) {
        const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy);
        if (d <= ZONE.speed) { p.x = p.tx; p.y = p.ty; } else { p.x += (dx / d) * ZONE.speed; p.y += (dy / d) * ZONE.speed; }
      }
      for (const q of Z.points) {
        q.red = 0; q.blue = 0;
        for (const p of list) if (Math.hypot(p.x - q.x, p.y - q.y) <= ZONE.r) q[p.team]++;
        const diff = q.red * w.red - q.blue * w.blue; // ⚖ 인원 보정된 머릿수로 비교
        if (Math.abs(diff) > 1e-6) q.cap = clamp(q.cap + clamp(diff, -3, 3) * 2, -100, 100);
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
        const win = pick(Z.score.red, Z.score.blue);
        finish(win, win === 'draw' ? `두 팀이 동시에 ${ZONE.goal}점!` : `${iga(TEAM_KO[win])} 먼저 ${ZONE.goal}점을 모았어요!`);
      }
    }

    /* ---------- ⑤ 눈치게임 ---------- */
    function nunchiCall(p, t) {
      const N = game.nunchi;
      if (N.state !== 'play' || N.done[p.id]) return;
      N.done[p.id] = true;
      if (!N.window) N.window = { k: N.k, at: t, ids: [] };
      N.window.ids.push(p.id);
    }
    function tickNunchi(t) {
      const N = game.nunchi;
      if (N.state === 'break') {
        if (t >= N.breakUntil) { N.round++; N.state = 'play'; N.k = 1; N.window = null; N.done = {}; N.log = []; N.roundEndAt = t + NUNCHI.roundMs; }
        return;
      }
      if (N.window && t - N.window.at >= NUNCHI.windowMs) {
        const ps = N.window.ids.map(id => players.get(id)).filter(Boolean);
        // ⚖ 점수에 인원 보정 가중치를 곱해요
        if (ps.length === 1) N.pts[ps[0].team] += weight(ps[0].team);
        else ps.forEach(p => { N.pts[p.team] -= weight(p.team); });
        N.log.push({ k: N.window.k, ok: ps.length === 1, names: ps.map(p => p.name), teams: ps.map(p => p.team) });
        N.k++; N.window = null;
      }
      if (N.window) return;
      const left = all().filter(p => !N.done[p.id]);
      if (left.length <= 1 || t >= N.roundEndAt) {
        if (left.length && all().length > 1) {
          left.forEach(p => { N.pts[p.team] -= weight(p.team); });
          N.log.push({ last: true, names: left.map(p => p.name), teams: left.map(p => p.team) });
        }
        if (N.round >= N.rounds) finishByTime();
        else { N.state = 'break'; N.breakUntil = t + NUNCHI.breakMs; }
      }
    }

    /* ---------- ⑥ 판뒤집기 ---------- */
    function flipCount() { const c = { red: 0, blue: 0 }; for (const x of game.flip.cells) c[x]++; return c; }
    function flipHit(p, i, t) {
      const F = game.flip;
      i = Math.floor(Number(i));
      if (!(i >= 0 && i < F.cells.length) || F.cells[i] === p.team || t - p.cellAt < coolFor(p, FLIP_COOL)) return false;
      p.cellAt = t;
      F.cells[i] = p.team;
      F.flips[i]++;
      return true;
    }

    /* ---------- ⑧ 단체 가위바위보 ---------- */
    function rpsPick(p, c, t) {
      const G = game.rps;
      if (G.state !== 'pick' || !BEATS[c]) return;
      G.picks[p.id] = c; // 시간 안에는 몇 번이든 바꿀 수 있어요
    }
    function teamVotes(team) {
      const v = { r: 0, p: 0, s: 0 };
      for (const p of members(team)) { const c = game.rps.picks[p.id]; if (c) v[c]++; }
      return v;
    }
    function tickRps(t) {
      const G = game.rps;
      if (G.state === 'reveal') {
        if (t < G.revealUntil) return;
        if (G.over) { finishByTime(); return; }
        G.round++; G.state = 'pick'; G.picks = {}; G.roundStart = t; G.roundEndAt = t + RPS.pickMs;
        return;
      }
      const list = all();
      const everyone = list.length > 0 && list.every(p => G.picks[p.id]);
      if (t < G.roundEndAt && !(everyone && t - G.roundStart >= 3000)) return;
      // 팀마다 가장 많이 나온 손 (같으면 그중에서 무작위)
      const hands = {}, counts = {};
      for (const team of TEAMS) {
        const v = teamVotes(team); counts[team] = v;
        const max = Math.max(v.r, v.p, v.s);
        const top = ['r', 'p', 's'].filter(c => v[c] === max);
        hands[team] = top[Math.floor(Math.random() * top.length)];
      }
      let winner = 'draw';
      if (BEATS[hands.red] === hands.blue) winner = 'red';
      else if (BEATS[hands.blue] === hands.red) winner = 'blue';
      if (winner !== 'draw') G.wins[winner]++;
      G.log.push({ round: G.round, hands, counts, winner });
      if (G.log.length > 12) G.log.shift();
      G.state = 'reveal'; G.revealUntil = t + RPS.revealMs;
      G.over = G.wins.red >= RPS.win || G.wins.blue >= RPS.win || G.round >= RPS.maxRounds;
    }

    /* ---------- ⑦ 운석 피하기 ---------- */
    // 내 위치와 '맞았다'는 각자 휴대폰이 판단해서 알려줘요 (지연 없이 공정하게). 서버는 부활과 점수를 맡아요.
    function meteorPos(p, x, y, t) {
      if (p.down) return;
      x = Number(x); y = Number(y);
      if (!isFinite(x) || !isFinite(y)) return;
      const dt = Math.max(0.05, (t - p.posAt) / 1000), max = METEOR.speed * dt * 1.4 + 1.5; // 순간이동 막기
      const dx = x - p.x, dy = y - p.y, d = Math.hypot(dx, dy);
      const k = d > max ? max / d : 1;
      p.x = clamp(p.x + dx * k, 0, METEOR.w); p.y = clamp(p.y + dy * k, 0, METEOR.h); p.posAt = t;
    }
    function meteorHit(p, t) {
      if (p.down || t < p.shieldUntil) return;
      p.down = true; p.rev = 0; p.hits++;
    }
    function aliveCount(team) { return members(team).filter(p => !p.down).length; }
    function tickMeteor(t) {
      const M = game.meteor, list = all();
      for (const p of list) {
        if (!p.down) continue;
        // 살아 있는 팀원이 옆에 있으면 부활 게이지가 차요
        const helper = list.some(q => q.team === p.team && !q.down && Math.hypot(q.x - p.x, q.y - p.y) <= METEOR.reviveR);
        p.rev = helper ? p.rev + 100 : Math.max(0, p.rev - 50);
        if (p.rev >= METEOR.reviveMs) { p.down = false; p.rev = 0; p.shieldUntil = t + METEOR.shieldMs; }
      }
      while (t - M.scoreAt >= 1000) {
        M.scoreAt += 1000;
        // ⚖ 살아 있는 '비율'만큼 점수 (인원이 달라도 공평)
        for (const team of TEAMS) M.score[team] += Math.round((aliveCount(team) / size(team)) * 10);
      }
      if (list.length && list.every(p => p.down)) finishByTime();
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
        case 'flip': if (type === 'cell') return flipHit(p, d.i, t); break;
        case 'rps': if (type === 'pick') rpsPick(p, d.c, t); break;
        case 'meteor': if (type === 'pos') meteorPos(p, d.x, d.y, t); else if (type === 'hit') meteorHit(p, t); break;
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
      else if (game.event === 'meteor') tickMeteor(t);
      else if (game.event === 'rps') tickRps(t);
      if (game.phase === 'playing' && t >= game.endAt) finishByTime();
    }

    function publicState() {
      const t = now(), ev = game.event, list = all();
      const s = {
        phase: game.phase, event: ev, eventName: EVENT_NAMES[ev] || '', scores, winner: game.winner, note: game.note,
        history: history.slice(-6),
        counts: { red: members('red').length, blue: members('blue').length },
        countdown: game.phase === 'countdown' ? Math.max(1, Math.ceil((game.goAt - t) / 1000)) : 0,
        timeLeft: game.phase === 'countdown' ? DURATION[ev] : game.phase === 'playing' ? Math.max(0, Math.ceil((game.endAt - t) / 1000)) : 0,
      };
      if (ev === 'tug' && game.tug) {
        s.tug = {
          wins: tugWins(),
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
          pos: list.map(p => [p.id, r1(p.x), r1(p.y), p.team]),
        };
      }
      if (ev === 'nunchi' && game.nunchi) {
        const N = game.nunchi;
        s.nunchi = {
          round: N.round, rounds: N.rounds, k: N.k, state: N.state, log: N.log.slice(-8),
          pts: { red: r1(N.pts.red), blue: r1(N.pts.blue) },
          left: list.filter(p => !N.done[p.id]).length,
          breakLeft: N.state === 'break' ? Math.max(1, Math.ceil((N.breakUntil - t) / 1000)) : 0,
        };
        if (game.phase === 'playing') s.timeLeft = N.state === 'play' ? Math.max(0, Math.ceil((N.roundEndAt - t) / 1000)) : 0;
      }
      if (ev === 'rps' && game.rps) {
        const G = game.rps;
        // 고르는 중에는 '누가 무엇을 냈는지' 숨기고 몇 명이 골랐는지만 보여줘요
        const voted = {};
        for (const team of TEAMS) voted[team] = members(team).filter(p => G.picks[p.id]).length;
        s.rps = { round: G.round, state: G.state, wins: G.wins, win: RPS.win, voted, last: G.log[G.log.length - 1] || null, log: G.log.slice(-6), over: G.over };
        if (game.phase === 'playing') s.timeLeft = G.state === 'pick' ? Math.max(0, Math.ceil((G.roundEndAt - t) / 1000)) : 0;
      }
      if (ev === 'meteor' && game.meteor) {
        const M = game.meteor;
        s.meteor = {
          seed: M.seed, goAt: game.goAt, now: t, w: METEOR.w, h: METEOR.h, pr: METEOR.pr, reviveR: METEOR.reviveR,
          score: M.score, alive: { red: aliveCount('red'), blue: aliveCount('blue') },
          pos: list.map(p => [p.id, r1(p.x), r1(p.y), p.team, p.down ? 1 : 0, Math.round((p.rev / METEOR.reviveMs) * 100), t < p.shieldUntil ? 1 : 0]),
        };
      }
      if (ev === 'flip' && game.flip) {
        const F = game.flip;
        s.flip = { n: F.n, cells: F.cells.map(c => (c === 'red' ? 'r' : 'b')).join(''), count: flipCount() };
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
      if (ev === 'land') m.cool = Math.max(0, coolFor(p, LAND_COOL) - (t - p.cellAt));
      if (ev === 'flip') m.coolMs = coolFor(p, FLIP_COOL);
      if (ev === 'rps' && game.rps) { m.pick = game.rps.picks[p.id] || null; m.teamVotes = teamVotes(p.team); } // 우리 팀 투표 현황은 우리 팀만 봐요
      if (ev === 'meteor') { m.x = r1(p.x); m.y = r1(p.y); m.down = p.down; m.shield = Math.max(0, p.shieldUntil - t); }
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
      EVENT_NAMES, DURATION, TEAMS, TEAM_KO, ROPES, ZONE, NUNCHI, METEOR, RPS,
      players,
      get game() { return game; },
      get scores() { return scores; },
      get rosterVersion() { return rosterVersion; },
      bump, members, weight, addPlayer, startEvent, finishByTime, act, tick, publicState, meState, roster,
      setTeamNames(names) { for (const k of TEAMS) if (names && names[k]) TEAM_KO[k] = names[k]; },
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

  return { createEngine, EVENT_NAMES, DURATION, TEAMS, iga, makeMeteors, METEOR };
});
