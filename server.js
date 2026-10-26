'use strict';
/*
 * 테크킹 운동회 서버
 * - 추가 설치(npm install) 없이 Node.js만 있으면 실행됩니다.
 * - 실행: node server.js
 * - 포트/선생님 PIN 바꾸기: PORT=4000 HOST_PIN=1234 node server.js
 * - 경기 규칙은 public/engine.js 에 있어요.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { createEngine } = require('./public/engine.js');

const PORT = Number(process.env.PORT) || 3000;
const HOST_PIN = String(process.env.HOST_PIN || Math.floor(1000 + Math.random() * 9000));
const PUBLIC_DIR = path.join(__dirname, 'public');
const TICK = 100;          // 0.1초마다 판정하고 모두에게 보내요
const MAX_PLAYERS = 60;

const now = () => Date.now();
const isOnline = p => p.conn > 0 || now() - p.lastSeen < 8000;
const engine = createEngine({ isOnline, makeId: () => crypto.randomBytes(8).toString('hex') });
const players = engine.players;
const clients = new Set();
let dirty = true;

/* ---------- 팀 꾸미기 (이름·색·대표 이미지) — teams.json에 저장돼요 ---------- */
const TEAMS_FILE = path.join(__dirname, 'teams.json');
const DEFAULT_TEAMS = {
  red: { name: '테크킹팀', color: '#ff4d4d', img: null },   // img가 null이면 기본 캐릭터
  blue: { name: '대니쌤팀', color: '#2f7bff', img: null },
};
function cleanTeams(input, base) {
  const out = JSON.parse(JSON.stringify(base));
  for (const k of ['red', 'blue']) {
    const v = (input && input[k]) || {};
    if (typeof v.name === 'string') out[k].name = v.name.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 8) || DEFAULT_TEAMS[k].name;
    if (typeof v.color === 'string' && /^#[0-9a-f]{6}$/i.test(v.color)) out[k].color = v.color;
    if (v.img === null) out[k].img = null;
    else if (typeof v.img === 'string' && /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(v.img) && v.img.length < 400000) out[k].img = v.img;
  }
  if (out.red.color.toLowerCase() === out.blue.color.toLowerCase()) out.blue.color = out.red.color === DEFAULT_TEAMS.blue.color ? DEFAULT_TEAMS.red.color : DEFAULT_TEAMS.blue.color;
  return out;
}
let teams = DEFAULT_TEAMS;
try { teams = cleanTeams(JSON.parse(fs.readFileSync(TEAMS_FILE, 'utf8')), DEFAULT_TEAMS); } catch (e) {}
let teamsVersion = 1;
engine.setTeamNames({ red: teams.red.name, blue: teams.blue.name });
function saveTeams(input) {
  teams = cleanTeams(input, teams);
  teamsVersion++;
  engine.setTeamNames({ red: teams.red.name, blue: teams.blue.name });
  fs.writeFile(TEAMS_FILE, JSON.stringify(teams), () => {});
}

function cleanName(name) {
  name = String(name || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 10);
  return name || '친구' + (players.size + 1);
}

/* ---------- 상태 보내기 ---------- */
function broadcast() {
  const pub = JSON.stringify(engine.publicState());
  const rv = engine.rosterVersion;
  let rosterJson = null;
  for (const c of clients) {
    let msg = '{"s":' + pub;
    if (c.rv !== rv) { rosterJson = rosterJson || JSON.stringify(engine.roster()); msg += ',"roster":' + rosterJson; c.rv = rv; }
    if (c.tv !== teamsVersion) { msg += ',"teams":' + JSON.stringify(teams); c.tv = teamsVersion; }
    if (c.playerId) msg += ',"me":' + JSON.stringify(engine.meState(players.get(c.playerId)));
    c.res.write('data: ' + msg + '}\n\n');
  }
}

let lastSend = 0, tickCount = 0, lastVersion = 0;
setInterval(() => {
  const t = now();
  if (++tickCount % 10 === 0) {
    for (const p of players.values()) { const on = isOnline(p); if (on !== p.on) { p.on = on; engine.bump(); } }
  }
  const before = engine.game.phase;
  engine.tick(t);
  if (engine.game.phase !== before || engine.rosterVersion !== lastVersion) { dirty = true; lastVersion = engine.rosterVersion; }
  const live = engine.game.phase === 'countdown' || engine.game.phase === 'playing';
  if (live || dirty || t - lastSend > 1000) { broadcast(); lastSend = t; dirty = false; }
}, TICK);

/* ---------- 요청 처리 ---------- */
function send(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; if (data.length > 500000) { reject(new Error('too big')); req.destroy(); } });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}
function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(`http://${a.address}:${PORT}`);
  }
  return out;
}

function api(route, body, res) {
  if (route === '/api/join') {
    let p = body.id && players.get(body.id);
    if (p) { if (body.name) p.name = cleanName(body.name); engine.bump(); }
    else {
      if (players.size >= MAX_PLAYERS) return send(res, 409, { error: '자리가 꽉 찼어요. 선생님께 말해 주세요.' });
      p = engine.addPlayer(cleanName(body.name), null, { conn: 0, lastSeen: now(), on: true });
    }
    dirty = true;
    return send(res, 200, { id: p.id, name: p.name, team: p.team });
  }
  if (route === '/api/act') {
    const p = players.get(body.id);
    if (!p) return send(res, 404, { error: 'not joined' });
    p.lastSeen = now();
    engine.act(p, String(body.type || ''), body);
    return send(res, 200, { ok: true });
  }
  if (route === '/api/teams') return send(res, 200, teams);
  if (route === '/api/info') return send(res, 200, { addresses: lanAddresses(), port: PORT });
  if (route === '/api/host') {
    if (String(body.pin) !== HOST_PIN) return send(res, 403, { error: 'PIN이 맞지 않아요.' });
    switch (body.cmd) {
      case 'ping': break;
      case 'start': engine.startEvent(body.event); break;
      case 'stop': engine.stop(); break;
      case 'lobby': engine.toLobby(); break;
      case 'shuffle': engine.shuffleTeams(); break;
      case 'move': engine.moveTeam(body.id); break;
      case 'clean': engine.removeOffline(); break;
      case 'resetScores': engine.resetScores(); break;
      case 'teams': saveTeams(body.teams); break;
      default: return send(res, 400, { error: '알 수 없는 명령' });
    }
    dirty = true;
    return send(res, 200, { ok: true });
  }
  send(res, 404, { error: '없는 주소' });
}

function openStream(req, res, url) {
  const hostPin = url.searchParams.get('host');
  const pid = url.searchParams.get('id');
  if (hostPin !== null && hostPin !== HOST_PIN) { res.writeHead(403); return res.end(); }
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.on('error', () => {});
  res.write('retry: 2000\n\n');
  const p = pid ? players.get(pid) : null;
  const c = { res, playerId: pid || null, rv: 0, tv: 0 };
  clients.add(c);
  if (p) { p.conn = (p.conn || 0) + 1; p.lastSeen = now(); }
  dirty = true;
  req.on('close', () => {
    clients.delete(c);
    if (p) { p.conn = Math.max(0, p.conn - 1); p.lastSeen = now(); }
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json',
};
function serveStatic(pathname, res) {
  if (pathname === '/') pathname = '/index.html';
  if (pathname === '/host') pathname = '/host.html';
  let file;
  try { file = path.normalize(path.join(PUBLIC_DIR, decodeURIComponent(pathname))); } catch (e) { res.writeHead(400); return res.end(); }
  if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('페이지를 찾을 수 없어요.'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/events') return openStream(req, res, url);
    if (req.method === 'POST' && url.pathname.startsWith('/api/')) return api(url.pathname, await readBody(req), res);
    if (req.method === 'GET') return serveStatic(url.pathname, res);
    send(res, 405, { error: '지원하지 않는 요청' });
  } catch (e) {
    if (!res.headersSent) send(res, 400, { error: '잘못된 요청' });
  }
});
server.keepAliveTimeout = 65000;

server.listen(PORT, '0.0.0.0', () => {
  const addrs = lanAddresses();
  console.log('\n  👑 테크킹 운동회 서버가 켜졌어요!\n');
  console.log('  ▶ 학생 접속 주소 (같은 와이파이에서):');
  if (addrs.length) addrs.forEach(a => console.log('      ' + a));
  else console.log(`      http://localhost:${PORT}  (네트워크 주소를 찾지 못했어요)`);
  console.log('\n  ▶ 선생님 진행 화면:');
  console.log(`      ${addrs[0] || 'http://localhost:' + PORT}/host`);
  console.log(`\n  ▶ 선생님 PIN: ${HOST_PIN}\n`);
  console.log('  이 창을 닫으면 서버가 꺼져요. 끝낼 때는 Ctrl + C\n');
});
server.on('error', err => {
  if (err.code === 'EADDRINUSE') console.log(`\n  ⚠ ${PORT}번 포트를 이미 쓰고 있어요. 다른 포트로 실행해 보세요: PORT=4000 node server.js\n`);
  else console.log(err);
  process.exit(1);
});
