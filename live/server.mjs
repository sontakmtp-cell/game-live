// TikTok LIVE Arcade & Live Server (v1.1)
// Spec: TECHNICAL_SPEC.md v1.1
// Serves Overlay + Control Panel, WebSocket /ws, Local Admin Auth, Gift Normalizer & Attack Scheduler.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

import { GameState } from './src/core/game-state.mjs';
import { AttackScheduler } from './src/core/attack-scheduler.mjs';
import { GiftNormalizer } from './src/core/gift-normalizer.mjs';
import { Protocol, MESSAGE_TYPES, validateClientMessage } from './src/core/protocol.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const TTS_DIR = path.join(__dirname, 'tts');
fs.mkdirSync(TTS_DIR, { recursive: true });
for (const f of fs.readdirSync(TTS_DIR)) { try { fs.unlinkSync(path.join(TTS_DIR, f)); } catch {} }

const PORT = +process.env.PORT || 3000;
const HOST = process.env.HOST || '127.0.0.1';

/* ----------------------------------------------------------- Local Admin Auth (SEC-02, SEC-03) */
// Token bootstrap ngẫu nhiên 256-bit dùng 1 lần trong RAM
export let bootstrapToken = crypto.randomBytes(32).toString('hex');
export const validSessions = new Set();

/* ----------------------------------------------------------- Arcade Core Engines (P1) */
export const gameState = new GameState();
export const scheduler = new AttackScheduler({
  gameState,
  broadcast: (msg) => broadcast(msg),
});
export const giftNormalizer = new GiftNormalizer();
giftNormalizer.onActionReady = (action) => scheduler.enqueue(action);

// Ticker vật lý 1/120s ở server
setInterval(() => {
  gameState.tick(1 / 120);
}, 1000 / 120);

/* ------------------------------------------------------------------ Legacy Live State */
const settings = {
  title: 'TikTok LIVE Arcade',
  subtitle: 'Mô Phỏng 3D',
  voice: 'vi-VN-NamMinhNeural',
  pitch: -18,
  rate: -20,
  music: false, mo: false, moBpm: 52,
  autoChant: false, chantEveryMin: 3,
  seatMode: 'auto',
  joinOnEnter: false,
  gifts: { readAll: true, minDiamonds: 1 },
};
const viewers = new Map();
const startedAt = Date.now();
let tiktok = null, tiktokState = { status: 'idle', uniqueId: '', error: '' };
const log = [];
function addLog(s){ const line = `[${new Date().toLocaleTimeString('vi-VN')}] ${s}`; log.push(line); if (log.length > 300) log.shift(); broadcast({ t:'log', line }, 'control'); console.log(line); }

function capacity(){ return 100; }
function snapshot(){
  return {
    t: 'state',
    settings,
    viewers: [...viewers.values()],
    cap: capacity(),
    startedAt,
    tiktok: tiktokState,
    arcade: gameState.getSnapshot(scheduler.queue.length),
  };
}

function seat(id, name, opts = {}){
  let v = viewers.get(id);
  if (v){ v.lastAt = Date.now(); return { v, isNew:false }; }
  v = { id, name: (name||id).slice(0, 18), coins: 0, joinedAt: Date.now(), lastAt: Date.now() };
  viewers.set(id, v);
  return { v, isNew:true };
}

/* ------------------------------------------------------------- Events In */
function onChat(id, name, text){
  text = String(text || '').slice(0, 120);
  const { v } = seat(id, name);
  if (!v) return;
  broadcast({ t:'chat', id, name: v.name, text });

  // Nhận lệnh 'choi' để kích hoạt demo miễn phí
  const clean = text.trim().toLowerCase();
  if (clean === 'choi' || clean === 'chơi' || clean === 'play') {
    scheduler.enqueue({
      requestId: `req_chat_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      user: { id, displayName: v.name },
      count: 1,
      diamonds: 1,
      action: { toolId: 'knife_left', side: 'left', contactMs: 800, durationMs: 2400, impulseRadPerSec: 0.65, wearDelta: 2 },
    });
    addLog(`🎮 ${v.name} kích hoạt chơi thử qua bình luận`);
  }
}

function onGift(id, name, giftName, count, diamonds){
  const { v } = seat(id, name);
  if (!v) return;
  const coins = Math.max(1, (diamonds || 1) * (count || 1));
  v.coins += coins;
  addLog(`🎁 ${v.name} tặng ${giftName} x${count}`);
}

/* ------------------------------------------------------------------ TTS */
const ttsQueue = []; let ttsBusy = false, ttsSeq = 0;
function esc(s){ return String(s).replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c])); }
function say(text, meta = {}){ if (ttsQueue.length >= 15) return; ttsQueue.push({ text: String(text).slice(0, 500), meta }); pumpTTS(); }
async function pumpTTS(){
  if (ttsBusy || !ttsQueue.length) return; ttsBusy = true;
  const { text, meta } = ttsQueue.shift();
  try {
    const file = `tts_${Date.now()}_${++ttsSeq}.mp3`;
    const tts = new MsEdgeTTS();
    await tts.setMetadata(settings.voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
    const { audioStream } = tts.toStream(esc(text), { pitch: `${settings.pitch >= 0 ? '+' : ''}${settings.pitch}Hz`, rate: `${settings.rate >= 0 ? '+' : ''}${settings.rate}%` });
    const chunks = [];
    await new Promise((res, rej) => { audioStream.on('data', c => chunks.push(c)); audioStream.on('close', res); audioStream.on('error', rej); });
    try { tts.close(); } catch {}
    fs.writeFileSync(path.join(TTS_DIR, file), Buffer.concat(chunks));
    broadcast({ t:'tts', url: `/live/tts/${file}`, text, ...meta });
  } catch (e) { addLog('TTS lỗi: ' + (e?.message || e)); }
  ttsBusy = false; setTimeout(pumpTTS, 50);
}

/* --------------------------------------------------------------- TikTok */
let TikTokLib = null;
async function connectTikTok(uniqueId){
  uniqueId = String(uniqueId || '').trim().replace(/^.*tiktok\.com\/@?/i, '').replace(/^@/, '').replace(/\/.*$/, '');
  if (!uniqueId) return;
  await disconnectTikTok();
  tiktokState = { status: 'connecting', uniqueId, error: '' }; broadcast({ t:'tiktok', ...tiktokState });
  try {
    TikTokLib ||= await import('tiktok-live-connector');
    const { TikTokLiveConnection, WebcastEvent, ControlEvent } = TikTokLib;
    const conn = new TikTokLiveConnection(uniqueId, { enableExtendedGiftInfo: true, processInitialData: false });
    const nm = u => u?.nickname || u?.uniqueId || 'ẩn danh';
    conn.on(WebcastEvent.CHAT, d => onChat(d.user?.uniqueId || d.user?.userId, nm(d.user), d.comment));
    conn.on(WebcastEvent.GIFT, d => {
      const type = d.giftDetails?.giftType ?? d.extendedGiftInfo?.type;
      const gname = d.giftDetails?.giftName || d.extendedGiftInfo?.name || 'quà';
      const dia = d.giftDetails?.diamondCount ?? d.extendedGiftInfo?.diamond_count ?? 1;

      // Đưa vào GiftNormalizer để xử lý streak và gộp combo (EVT-01)
      giftNormalizer.processGiftEvent({
        userId: d.user?.uniqueId || d.user?.userId,
        nickname: nm(d.user),
        giftId: d.giftDetails?.giftId || gname,
        giftName: gname,
        giftType: type,
        repeatCount: d.repeatCount || 1,
        repeatEnd: d.repeatEnd,
        diamondCount: dia,
      });

      if (type !== 1 || d.repeatEnd) {
        onGift(d.user?.uniqueId || d.user?.userId, nm(d.user), gname, d.repeatCount || 1, dia);
      }
    });
    conn.on(ControlEvent.DISCONNECTED, () => { tiktokState = { ...tiktokState, status: 'disconnected' }; broadcast({ t:'tiktok', ...tiktokState }); addLog('TikTok: mất kết nối'); });
    conn.on(ControlEvent.ERROR, e => addLog('TikTok lỗi: ' + (e?.info || e?.message || e)));
    await conn.connect();
    tiktok = conn;
    tiktokState = { status: 'connected', uniqueId, error: '' };
    addLog(`✅ Đã kết nối live @${uniqueId}`);
  } catch (e) {
    tiktokState = { status: 'error', uniqueId, error: String(e?.message || e) };
    addLog(`❌ Không kết nối được @${uniqueId}: ${tiktokState.error}`);
  }
  broadcast({ t:'tiktok', ...tiktokState });
}
async function disconnectTikTok(){ if (tiktok){ try { await tiktok.disconnect(); } catch {} tiktok = null; } tiktokState = { status:'idle', uniqueId:'', error:'' }; broadcast({ t:'tiktok', ...tiktokState }); }

/* ------------------------------------------------------------- Control Panel Commands */
function onControl(m){
  switch (m.cmd){
    case 'connect': connectTikTok(m.uniqueId); break;
    case 'disconnect': disconnectTikTok(); addLog('Đã ngắt kết nối TikTok'); break;
    case 'chat': { const n = String(m.name || 'Khách').slice(0, 18); onChat('sim_' + n, n, String(m.text || 'choi').slice(0, 120)); break; }
    case 'gift': {
      const n = String(m.name || 'Người chơi').slice(0, 18);
      giftNormalizer.processGiftEvent({
        userId: 'sim_' + n,
        nickname: n,
        giftName: m.gift || 'Hoa hồng',
        diamondCount: m.diamonds || 1,
        repeatCount: m.count || 1,
        repeatEnd: true,
      });
      break;
    }
    case 'action': {
      const valid = ['touch_left', 'touch_right', 'miss', 'reset', 'double_hit'];
      if (valid.includes(m.action)) {
        if (m.action === 'reset') {
          gameState.resetRound();
          scheduler.clearQueue();
          broadcast({ t:'action', action: 'reset' });
          addLog('↺ Đã reset vật lý và round');
        } else if (m.action === 'double_hit') {
          scheduler.enqueue({
            requestId: `req_act_${Date.now()}_1`,
            user: { id: 'admin', displayName: 'Admin' },
            count: 1, diamonds: 1,
            action: { toolId: 'knife_left', side: 'left', contactMs: 800, durationMs: 2400, impulseRadPerSec: 0.65, wearDelta: 2 },
          });
          scheduler.enqueue({
            requestId: `req_act_${Date.now()}_2`,
            user: { id: 'admin', displayName: 'Admin' },
            count: 1, diamonds: 1,
            action: { toolId: 'knife_right', side: 'right', contactMs: 800, durationMs: 2400, impulseRadPerSec: -0.65, wearDelta: 2 },
          });
        } else {
          const side = m.action === 'touch_right' ? 'right' : 'left';
          const isMiss = m.action === 'miss';
          scheduler.enqueue({
            requestId: `req_act_${Date.now()}`,
            user: { id: 'admin', displayName: 'Admin' },
            count: 1, diamonds: 1,
            action: {
              toolId: `knife_${side}`,
              side,
              variant: isMiss ? 'miss' : 'touch',
              contactMs: 800, durationMs: 2400,
              impulseRadPerSec: isMiss ? 0 : (side === 'left' ? 0.65 : -0.65),
              wearDelta: isMiss ? 0 : 2,
            },
          });
        }
        addLog(`🎮 Thử nghiệm đạo cụ: ${m.action}`);
      }
      break;
    }
    case 'queue:pause': scheduler.pause(); addLog('⏸ Đã tạm dừng hàng đợi'); break;
    case 'queue:resume': scheduler.resume(); addLog('▶ Đã tiếp tục hàng đợi'); break;
    case 'queue:clear': scheduler.clearQueue(); addLog('🗑 Đã làm sạch hàng đợi'); break;
    case 'queue:sim100': {
      addLog('🚀 Mô phỏng 100 sự kiện quà tặng liên tục...');
      for (let i = 0; i < 100; i++) {
        scheduler.enqueue({
          requestId: `req_sim100_${i}`,
          user: { id: `u_${i % 10}`, displayName: `Viewer ${i % 10}` },
          count: 1, diamonds: 1,
          action: { toolId: 'knife_left', side: i % 2 === 0 ? 'left' : 'right', contactMs: 800, durationMs: 2400 },
        });
      }
      break;
    }
    case 'say': if (m.text) say(String(m.text).slice(0, 400), { tag:'say' }); break;
  }
}

/* -------------------------------------------------------------- HTTP & Security */
const MIME = {
  '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css', '.json':'application/json',
  '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp', '.mp3':'audio/mpeg', '.svg':'image/svg+xml', '.ico':'image/x-icon',
  '.mp4':'video/mp4', '.webm':'video/webm', '.glb':'model/gltf-binary',
};
const ALLOWED_HOSTS = new Set([`localhost:${PORT}`, `127.0.0.1:${PORT}`, `[::1]:${PORT}`]);
const okHost = h => ALLOWED_HOSTS.has(String(h || '').toLowerCase());
const SEP = path.sep;

function resolveStatic(urlPath){
  let p = urlPath === '/' ? '/live/control.html' : urlPath;
  if (!/^\/(assets|live)\//.test(p)) return null;
  if (p.split('/').some(seg => seg.startsWith('.') || seg === 'node_modules')) return null;

  // Allow static assets under /live/public/
  if (p.startsWith('/live/public/')) {
    if (/\.(mjs|js|json|css|png|jpg|jpeg|webp|mp3|mp4|webm|glb)$/i.test(p)) {
      const file = path.normalize(path.join(ROOT, p));
      return file.startsWith(ROOT + SEP) ? file : null;
    }
    return null;
  }

  if (/\.(mjs|json|md|log)$/i.test(p) && !p.startsWith('/assets/')) return null;
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT + SEP)) return null;
  return file;
}

const server = http.createServer((req, res) => {
  if (!okHost(req.headers.host)) { res.writeHead(421).end('wrong host'); return; }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }

  let p;
  let parsedUrl;
  try {
    parsedUrl = new URL(req.url, `http://${req.headers.host}`);
    p = decodeURIComponent(parsedUrl.pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }

  // --- SEC-02 & SEC-03: Local Admin Bootstrap Token & Cookie Authentication ---
  if (p === '/live/control.html') {
    const queryToken = parsedUrl.searchParams.get('token');
    const cookieHeader = req.headers.cookie || '';
    const sessionMatch = cookieHeader.match(/arcade_session=([a-f0-9]{64})/);
    const existingSession = sessionMatch ? sessionMatch[1] : null;
    const hasValidSession = existingSession && validSessions.has(existingSession);

    // Kịch bản A: Truy cập kèm bootstrap token
    if (queryToken) {
      if (bootstrapToken && queryToken === bootstrapToken) {
        // Hủy bootstrap token ngay lập tức (Single-use token)
        bootstrapToken = null;
        const newSessionId = crypto.randomBytes(32).toString('hex');
        validSessions.add(newSessionId);

        // 303 Redirect sang URL sạch không còn token trên thanh địa chỉ
        res.writeHead(303, {
          'Location': '/live/control.html',
          'Set-Cookie': `arcade_session=${newSessionId}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400`,
          'Cache-Control': 'no-store',
          'Referrer-Policy': 'no-referrer',
        });
        res.end();
        return;
      } else {
        // Token sai hoặc đã được sử dụng
        res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h2>403 Forbidden</h2><p>Token bootstrap không hợp lệ hoặc đã qua sử dụng. Vui lòng kiểm tra terminal hoặc khởi động lại server.</p>');
        return;
      }
    }

    // Kịch bản B: Không có query token -> kiểm tra cookie session
    if (!hasValidSession) {
      res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h2>403 Forbidden — Yêu cầu xác thực Admin</h2><p>Vui lòng mở liên kết chứa token bootstrap được in ra terminal khi server khởi động.</p>');
      return;
    }
  }

  const file = resolveStatic(p);
  if (!file) { res.writeHead(404).end('not found'); return; }

  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': p.startsWith('/live/tts/') ? 'no-store' : 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    });
    if (req.method === 'HEAD') { res.end(); return; }
    fs.createReadStream(file).pipe(res);
  });
});

/* ----------------------------------------------------------- WebSocket Server */
const wss = new WebSocketServer({
  server,
  path: '/ws',
  maxPayload: 64 * 1024,
  verifyClient: ({ origin, req }, cb) => {
    if (!okHost(req.headers.host)) return cb(false, 421, 'Wrong host');
    if (origin) {
      try {
        if (!okHost(new URL(origin).host)) return cb(false, 403, 'Forbidden origin');
      } catch {
        return cb(false, 403, 'Invalid origin');
      }
    }

    // Kiểm tra quyền role=control bằng cookie session (SEC-02)
    const urlObj = new URL(req.url, 'http://x');
    const requestedRole = urlObj.searchParams.get('role');
    const cookieHeader = req.headers.cookie || '';
    const sessionMatch = cookieHeader.match(/arcade_session=([a-f0-9]{64})/);
    const sessionId = sessionMatch ? sessionMatch[1] : null;
    const isAuthedAdmin = sessionId && validSessions.has(sessionId);

    if (requestedRole === 'control' && !isAuthedAdmin) {
      return cb(false, 401, 'Unauthorized control role');
    }

    cb(true);
  },
});

function broadcast(msg, only){
  const s = JSON.stringify(msg);
  for (const c of wss.clients) {
    if (c.readyState === 1 && (!only || c.role === only)) c.send(s);
  }
}

wss.on('connection', (ws, req) => {
  const urlObj = new URL(req.url, 'http://x');
  const cookieHeader = req.headers.cookie || '';
  const sessionMatch = cookieHeader.match(/arcade_session=([a-f0-9]{64})/);
  const sessionId = sessionMatch ? sessionMatch[1] : null;
  const isAuthedAdmin = sessionId && validSessions.has(sessionId);

  ws.role = (urlObj.searchParams.get('role') === 'control' && isAuthedAdmin) ? 'control' : 'overlay';

  // Nếu là Overlay, cấp phát rendererId và gán Primary Renderer nếu chưa có
  if (ws.role === 'overlay') {
    ws.rendererId = 'rend_' + crypto.randomBytes(4).toString('hex');
    if (!scheduler.primaryRendererId) {
      scheduler.setPrimaryRenderer(ws.rendererId);
    }
  }

  // Gửi snapshot đồng bộ ban đầu
  ws.send(JSON.stringify(snapshot()));
  if (ws.role === 'control') {
    ws.send(JSON.stringify({ t:'logs', lines: log }));
  }

  ws.on('message', buf => {
    try {
      const m = JSON.parse(buf);

      // 1. Phân quyền Control Panel
      if (ws.role === 'control' && m && m.t === 'ctl') {
        onControl(m);
        return;
      }

      // 2. Tiếp nhận Telemetry từ Overlay (PREPARE, ACK, ABORT)
      if (ws.role === 'overlay') {
        const validation = validateClientMessage(m);
        if (!validation.valid) return;

        if (m.type === MESSAGE_TYPES.OVERLAY_PREPARED) {
          scheduler.handleOverlayPrepared(m);
        } else if (m.type === MESSAGE_TYPES.OVERLAY_ATTACK_ACK) {
          scheduler.handleAttackAck(m);
        } else if (m.type === MESSAGE_TYPES.OVERLAY_DRIFT_ABORT) {
          scheduler.handleDriftAbort(m);
        }
      }
    } catch (e) {
      addLog('Lỗi xử lý message: ' + e.message);
    }
  });

  ws.on('close', () => {
    if (ws.role === 'overlay' && ws.rendererId) {
      scheduler.handleRendererDisconnect(ws.rendererId);
    }
  });
});

server.listen(PORT, HOST, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 TIKTOK LIVE ARCADE SERVER v1.1`);
  console.log(`📍 Lắng nghe: http://127.0.0.1:${PORT}`);
  console.log(`🔑 BOOTSTRAP ADMIN URL (Dùng 1 lần):`);
  console.log(`   http://127.0.0.1:${PORT}/live/control.html?token=${bootstrapToken}`);
  console.log(`🎬 OVERLAY 9:16 URL:`);
  console.log(`   http://127.0.0.1:${PORT}/live/overlay.html`);
  console.log(`======================================================\n`);
  addLog(`Server chạy tại http://localhost:${PORT}`);
});
