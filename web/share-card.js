// Holder share card: a picture (PNG) or a short clip of the holder view that is already on screen.
// Read-only and local: it draws numbers the page already shows, never reads chain itself,
// and nothing here ever goes into a transaction. Loaded lazily the first time Share card is clicked.

export const CARD_W = 1200, CARD_H = 675;
const BRAND = { yellow: '#FCBE46', blue: '#597AF7', night: '#0A0A0C' };

export function shortAddress(address) {
  const text = String(address ?? '');
  return /^0x[0-9a-fA-F]{40}$/.test(text) ? `${text.slice(0, 6)}…${text.slice(-4)}` : '';
}

// Turns what the holder view shows into the card's fields. Unknown values stay "—", never 0.
export function cardData({ owner, count, powerLabel = 'Power', power, claimable, claimed, compounded, levels = [], network = 'Sepolia', date = new Date() } = {}) {
  const clean = value => { const text = String(value ?? '').trim(); return text && text !== 'Not available' ? text : '—'; };
  const byLevel = new Map();
  for (const level of levels) if (Number.isInteger(level) && level > 0) byLevel.set(level, (byLevel.get(level) ?? 0) + 1);
  const day = date instanceof Date && !Number.isNaN(date.valueOf()) ? date : new Date();
  return {
    address: shortAddress(owner),
    count: clean(count),
    powerLabel: clean(powerLabel) === '—' ? 'Power' : String(powerLabel).trim(),
    power: clean(power),
    claimable: clean(claimable),
    claimed: clean(claimed),
    compounded: clean(compounded),
    levels: [...byLevel.entries()].sort((a, b) => a[0] - b[0]).map(([level, n]) => ({ level, count: n })),
    network: clean(network),
    date: `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`,
  };
}

// What the holder chose to show. The front side carries Squeeks, deposited/power and levels; the back side
// carries the SQK numbers. Address off = "A Squeek holder".
export const MAX_STATS = 5;
export const DEFAULT_SHOW = { address: true, count: true, power: true, claimable: true, claimed: false, compounded: false, levels: true, meta: true };
export const SHOW_FIELDS = [['address', 'Wallet address'], ['count', 'Squeeks'], ['power', 'Deposited / power'], ['claimable', 'Claimable SQK'], ['claimed', 'SQK claimed (lifetime)'], ['compounded', 'SQK compounded (lifetime)'], ['levels', 'Levels'], ['meta', 'Network and date']];
const FRONT_KEYS = ['count', 'power'], BACK_KEYS = ['claimable', 'claimed', 'compounded'];
export const statKeys = [...FRONT_KEYS, ...BACK_KEYS];
const sqkNum = v => String(v).replace(/\s*SQK$/i, '');
export function applyShow(data, show = DEFAULT_SHOW) {
  const on = { ...DEFAULT_SHOW, ...show };
  const label = { count: 'Squeeks', power: String(data.powerLabel), claimable: 'Claimable SQK', claimed: 'SQK claimed', compounded: 'SQK compounded' };
  const value = { count: data.count, power: data.power, claimable: sqkNum(data.claimable), claimed: sqkNum(data.claimed), compounded: sqkNum(data.compounded) };
  const pick = keys => keys.filter(k => on[k] && data[k] !== '—').map(k => [value[k], label[k]]);
  const front = pick(FRONT_KEYS), back = pick(BACK_KEYS);
  return { ...data, address: on.address ? data.address : null, front, back, stats: [...front, ...back], levels: on.levels ? data.levels : [], orbLevels: data.levels, meta: on.meta };
}

export function fileName(data, ext) {
  const who = data.address ? data.address.replace('…', '-') : 'holder';
  return `wheelhouse-${who}-${data.date}.${ext}`;
}

export const LEVEL_COLORS = ['#FCBE46', '#597AF7', '#FF5FA2', '#3DDC97', '#9B6BFF', '#FF8A3D', '#4FD1E8', '#F2F2F2'];
export const levelColor = level => LEVEL_COLORS[(Math.max(1, level) - 1) % LEVEL_COLORS.length];
const SANS = '"Quicksand", ui-rounded, system-ui, sans-serif', COND = '"Barlow Condensed", "Arial Narrow", sans-serif', MONO = '"IBM Plex Mono", ui-monospace, monospace';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function fitFont(ctx, text, max, size, weight, family) {
  let px = size; ctx.font = `${weight} ${px}px ${family}`;
  while (px > 18 && ctx.measureText(text).width > max) { px -= 2; ctx.font = `${weight} ${px}px ${family}`; }
  return px;
}
// The Squeeks as glossy orbs, one per Squeek (max 14), coloured and sized by level.
export function orbList(levels, max = 14) {
  const out = []; for (const { level, count } of levels) for (let i = 0; i < count && out.length < max; i++) out.push(level);
  return out;
}

function shade(hex, k) { const n = parseInt(hex.slice(1), 16), f = v => Math.max(0, Math.min(255, Math.round(v * (1 + k)))); return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`; }
const defaultCanvas = (w, h) => { if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(w, h); const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
export const FACE_W = 760, FACE_H = 460;
const WIN = { x: 418, y: 30, w: 314, h: 400 };

// Two-sided card that turns over by itself: front 0–3 s, turn, back 4–7 s, turn back, every 8 s.
export const LOOP_SECONDS = 8;
const ease = x => x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x);
export function cardTurn(t) {
  const p = ((t % LOOP_SECONDS) + LOOP_SECONDS) % LOOP_SECONDS;
  const base = p < 3 ? 0 : p < 4 ? ease(p - 3) * Math.PI : p < 7 ? Math.PI : Math.PI + ease(p - 7) * Math.PI;
  return base + Math.sin(t * 1.1) * 0.22;
}

// Grey studio backdrop with grain, like a product shot.
let grain = null;
function drawStudio(ctx, make) {
  const W = CARD_W, H = CARD_H;
  const g = ctx.createLinearGradient(0, 0, W * 0.55, H); g.addColorStop(0, '#E4E4E7'); g.addColorStop(0.4, '#A3A3A9'); g.addColorStop(0.72, '#2A2A2F'); g.addColorStop(1, '#0B0B0D');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const band = ctx.createLinearGradient(W, 0, W * 0.35, H); band.addColorStop(0, 'rgba(255,255,255,.55)'); band.addColorStop(0.35, 'rgba(255,255,255,0)'); band.addColorStop(0.7, 'rgba(0,0,0,.55)');
  ctx.fillStyle = band; ctx.fillRect(0, 0, W, H);
  if (!grain) { grain = make(W, H); const gc = grain.getContext('2d'); let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 42000; i++) { const v = rnd() > 0.5 ? 255 : 0; gc.fillStyle = `rgba(${v},${v},${v},${0.05 + rnd() * 0.08})`; gc.fillRect(rnd() * W, rnd() * H, 1.4, 1.4); } }
  ctx.drawImage(grain, 0, 0);
}

function cardBase(ctx) {
  const w = FACE_W, h = FACE_H;
  roundRect(ctx, 0, 0, w, h, 30); const g = ctx.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#17181E'); g.addColorStop(1, '#0C0D11'); ctx.fillStyle = g; ctx.fill();
  ctx.save(); roundRect(ctx, 0, 0, w, h, 30); ctx.clip(); ctx.fillStyle = 'rgba(255,255,255,.022)'; for (let x = 0; x < w; x += 4) ctx.fillRect(x, 0, 1, h); ctx.restore();
  roundRect(ctx, 0.75, 0.75, w - 1.5, h - 1.5, 30); ctx.strokeStyle = 'rgba(255,255,255,.07)'; ctx.lineWidth = 1.5; ctx.stroke();
}
function logo(ctx, data) {
  ctx.save(); ctx.translate(58, 62); ctx.strokeStyle = BRAND.yellow; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.arc(0, 0, 15, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 2.2; for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * 15, Math.sin(a) * 15); ctx.stroke(); }
  ctx.restore();
  ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#FFFFFF'; ctx.font = `700 30px ${SANS}`; ctx.fillText('wheelhouse', 84, 72); const ww = ctx.measureText('wheelhouse').width;
  if (data.meta !== false) { ctx.font = `600 13px ${MONO}`; ctx.fillStyle = BRAND.yellow; const n = data.network.toUpperCase(); ctx.fillText(n, 84 + ww - ctx.measureText(n).width, 92); }
}
function label(ctx, text, x, y) { ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.font = `500 13px ${MONO}`; ctx.fillText(text.toUpperCase().split('').join('\u200A'), x, y); }
function holder(ctx, data, x, y) {
  const name = data.address || 'A Squeek holder', seed = [...(data.address || 'holder')].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);
  const g = ctx.createLinearGradient(x, y - 14, x + 28, y + 14); g.addColorStop(0, LEVEL_COLORS[seed % 8]); g.addColorStop(1, LEVEL_COLORS[(seed >>> 3) % 8]);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x + 14, y, 14, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.font = `600 19px ${SANS}`; ctx.fillText(name, x + 38, y + 7);
}
function levelChips(ctx, levels, x, y, maxX) {
  ctx.font = `600 20px ${SANS}`;
  for (const { level, count } of levels) {
    const text = `L${level} × ${count}`, w = ctx.measureText(text).width + 30; if (x + w > maxX) break;
    ctx.fillStyle = levelColor(level); ctx.beginPath(); ctx.arc(x + 8, y - 7, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#FFFFFF'; ctx.fillText(text, x + 24, y); x += w + 14;
  }
}
// Flat window scene: the hamster in its wheel (used when there is no WebGL).
function drawWindowScene(ctx, w, h, t) {
  const glow = ctx.createRadialGradient(w / 2, h * 0.45, 10, w / 2, h * 0.45, w * 0.8); glow.addColorStop(0, 'rgba(89,122,247,.28)'); glow.addColorStop(1, 'rgba(89,122,247,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, w, h);
  const cx = w / 2, cy = h * 0.43, r = w * 0.38, spin = -t * 2.6;
  ctx.strokeStyle = '#2B2F44'; ctx.lineWidth = 10; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(cx - r * 0.55, h * 0.83); ctx.lineTo(cx, cy); ctx.lineTo(cx + r * 0.55, h * 0.83); ctx.stroke();
  ctx.strokeStyle = BRAND.yellow; ctx.lineWidth = 9; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  for (let i = 0; i < 28; i++) { const a = spin + i * Math.PI / 14; ctx.strokeStyle = 'rgba(217,220,228,.55)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * (r - 14), cy + Math.sin(a) * (r - 14)); ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); ctx.stroke(); }
  ctx.strokeStyle = BRAND.blue; ctx.lineWidth = 4; for (let i = 0; i < 6; i++) { const a = spin + i * Math.PI / 3; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * (r - 14), cy + Math.sin(a) * (r - 14)); ctx.stroke(); }
  ctx.fillStyle = BRAND.blue; ctx.beginPath(); ctx.arc(cx, cy, 9, 0, Math.PI * 2); ctx.fill();
  // hamster running at the bottom of the wheel
  const hx = cx, hy = cy + r - 34, bob = Math.abs(Math.sin(t * 10)) * 3;
  ctx.save(); ctx.translate(hx, hy - bob);
  ctx.fillStyle = '#C98A57'; for (const [lx, ph] of [[-16, 0], [14, Math.PI]]) { const s = Math.sin(t * 10 + ph) * 6; ctx.beginPath(); ctx.ellipse(lx + s, 22, 6, 4, 0, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = '#E3A56C'; ctx.beginPath(); ctx.ellipse(0, 4, 34, 22, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#FFF1DF'; ctx.beginPath(); ctx.ellipse(6, 12, 20, 11, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#E3A56C'; ctx.beginPath(); ctx.arc(24, -6, 17, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#F2A3A0'; ctx.beginPath(); ctx.arc(18, -22, 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#FFF1DF'; ctx.beginPath(); ctx.ellipse(32, 0, 9, 7, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1B1B1F'; ctx.beginPath(); ctx.arc(30, -9, 3.2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#F2A3A0'; ctx.beginPath(); ctx.arc(40, -1, 2.6, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
function drawWindow(ctx, data, t, scene) {
  const { x, y, w, h } = WIN, inset = 22;
  ctx.save(); roundRect(ctx, x, y, w, h, 16); ctx.fillStyle = '#06070A'; ctx.fill(); ctx.clip();
  // recessed walls
  const wall = (pts, c) => { ctx.beginPath(); pts.forEach(([px, py], i) => i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)); ctx.closePath(); ctx.fillStyle = c; ctx.fill(); };
  const X0 = x, X1 = x + w, Y0 = y, Y1 = y + h, x0 = x + inset, x1 = x + w - inset, y0 = y + inset, y1 = y + h - inset;
  wall([[X0, Y0], [X1, Y0], [x1, y0], [x0, y0]], '#14151C'); wall([[X0, Y0], [x0, y0], [x0, y1], [X0, Y1]], '#0F1016');
  wall([[X1, Y0], [X1, Y1], [x1, y1], [x1, y0]], '#191A23'); wall([[X0, Y1], [x0, y1], [x1, y1], [X1, Y1]], '#1C1E28');
  ctx.save(); ctx.beginPath(); ctx.rect(x0, y0, x1 - x0, y1 - y0); ctx.clip(); ctx.fillStyle = '#08090D'; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  if (scene) ctx.drawImage(scene, x0, y0, x1 - x0, y1 - y0); else { ctx.translate(x0, y0); drawWindowScene(ctx, x1 - x0, y1 - y0, t); }
  ctx.restore(); ctx.restore();
  roundRect(ctx, x, y, w, h, 16); ctx.strokeStyle = 'rgba(252,190,70,.55)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.font = `600 12px ${MONO}`; const cap = data.meta !== false ? `CHECKPOINT · ${data.date}` : 'CHECKPOINT'; const cw = ctx.measureText(cap).width;
  const cx = x + w / 2, cy = y + h - 16; ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.fillText(cap, cx - cw / 2, cy);
  ctx.fillStyle = BRAND.yellow; ctx.fillText('[', cx - cw / 2 - 18, cy); ctx.fillText(']', cx + cw / 2 + 10, cy);
}
export function drawFront(ctx, data, { t = 0, scene = null } = {}) {
  ctx.clearRect(0, 0, FACE_W, FACE_H); cardBase(ctx); logo(ctx, data); ctx.textBaseline = 'alphabetic';
  let y = 152; data.front.forEach(([value, name], i) => {
    label(ctx, name, 44, y); ctx.fillStyle = '#FFFFFF'; fitFont(ctx, value, 340, i ? 34 : 50, 700, SANS); ctx.fillText(value, 42, y + (i ? 42 : 56)); y += i ? 78 : 92;
  });
  if (data.levels.length) { label(ctx, 'Levels', 44, y); levelChips(ctx, data.levels, 44, y + 36, 396); }
  holder(ctx, data, 44, FACE_H - 46);
  drawWindow(ctx, data, t, scene);
}
function holo(ctx, x, y, s, t) {
  const g = ctx.createLinearGradient(x + Math.sin(t) * s, y, x + s - Math.sin(t) * s, y + s);
  ['#FF9AD5', '#9BE7FF', '#FFF3A6', '#B9A6FF', '#9CFFD0'].forEach((c, i, a) => g.addColorStop(i / (a.length - 1), c));
  roundRect(ctx, x, y, s, s, 8); ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.save(); ctx.translate(x + s / 2, y + s / 2); ctx.strokeStyle = 'rgba(10,10,12,.55)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, s * 0.28, 0, Math.PI * 2); ctx.stroke();
  for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + t * 0.5; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * s * 0.28, Math.sin(a) * s * 0.28); ctx.stroke(); } ctx.restore();
}
export function drawBack(ctx, data, { t = 0 } = {}) {
  ctx.clearRect(0, 0, FACE_W, FACE_H); cardBase(ctx);
  ctx.save(); roundRect(ctx, 0, 0, FACE_W, FACE_H, 30); ctx.clip();
  ctx.translate(600, 300); ctx.rotate(-t * 0.15); ctx.strokeStyle = 'rgba(255,255,255,.055)'; ctx.lineWidth = 56; ctx.beginPath(); ctx.arc(0, 0, 190, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 22; for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * 165, Math.sin(a) * 165); ctx.stroke(); }
  ctx.restore();
  logo(ctx, data); holo(ctx, FACE_W - 92, 36, 50, t);
  ctx.textBaseline = 'alphabetic';
  const back = data.back.length ? data.back : (data.meta !== false ? [[data.date, 'Checked']] : []);
  if (back[0]) { label(ctx, back[0][1], 44, 182); ctx.fillStyle = '#FFFFFF'; fitFont(ctx, back[0][0], 460, 60, 700, SANS); ctx.fillText(back[0][0], 42, 244); }
  back.slice(1).forEach(([value, name], i) => { const x = 44 + i * 240; label(ctx, name, x, 298); ctx.fillStyle = '#FFFFFF'; fitFont(ctx, value, 220, 30, 700, SANS); ctx.fillText(value, x - 1, 336); });
  holder(ctx, data, 44, FACE_H - 46);
}

// One frame: studio backdrop, then the card turned by `cardTurn(t)` with perspective, then the site line.
// The face is drawn in vertical strips so near edges grow and far edges shrink, as a real card does.
export function drawCard(ctx, input, { t = 0, scene = null, makeCanvas = defaultCanvas, turn = cardTurn(t) } = {}) {
  const data = input.front ? input : applyShow(input);
  drawStudio(ctx, makeCanvas);
  const showBack = Math.cos(turn) < 0, face = makeCanvas(FACE_W, FACE_H), fctx = face.getContext('2d');
  if (showBack) drawBack(fctx, data, { t }); else drawFront(fctx, data, { t, scene });
  const cx = CARD_W / 2, cy = 312 + Math.sin(t * 1.3) * 10, D = 2200, c = Math.cos(turn), sn = Math.sin(turn);
  // pitch: the card nods back and forth (strips shear vertically), and rolls a little, so it never sits still
  const pitch = Math.sin(t * 0.9) * 0.05, roll = Math.sin(t * 0.7 + 1) * 0.03;
  // soft shadow
  const sh = ctx.createRadialGradient(cx, 600, 10, cx, 600, 420); sh.addColorStop(0, 'rgba(0,0,0,.45)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save(); ctx.scale(1, 0.18); ctx.fillStyle = sh; ctx.beginPath(); ctx.arc(cx, 600 / 0.18, 420 * Math.max(0.25, Math.abs(c)), 0, Math.PI * 2); ctx.fill(); ctx.restore();
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(roll); ctx.translate(-cx, -cy);
  // card edge (gold), visible when nearly side-on
  const N = 160, sw = FACE_W / N;
  const proj = u => { const xl = (u - 0.5) * FACE_W * (showBack ? -1 : 1), k = D / (D + xl * sn); return { x: cx + xl * c * k, k, dy: (u - 0.5) * FACE_W * pitch }; };
  if (Math.abs(c) < 0.35) { const k = 1; ctx.fillStyle = BRAND.yellow; const e = Math.max(3, 14 * Math.abs(sn) * (1 - Math.abs(c))); roundRect(ctx, cx - e / 2, cy - FACE_H * k / 2, e, FACE_H * k, e / 2); ctx.fill(); }
  for (let i = 0; i < N; i++) {
    const a = proj(i / N), b = proj((i + 1) / N), left = Math.min(a.x, b.x), width = Math.abs(b.x - a.x) + 0.6, k = (a.k + b.k) / 2, hgt = FACE_H * k;
    if (width < 0.2) continue; ctx.drawImage(face, i * sw, 0, sw, FACE_H, left, cy - hgt / 2 + (a.dy + b.dy) / 2, width, hgt);
  }
  // sheen sweeping across as it turns
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; const sx = cx + Math.sin(turn) * 380, gl = ctx.createLinearGradient(sx - 120, 0, sx + 120, 0);
  gl.addColorStop(0, 'rgba(255,255,255,0)'); gl.addColorStop(0.5, `rgba(255,255,255,${0.06 * Math.abs(c)})`); gl.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gl; ctx.fillRect(cx - FACE_W / 2 - 40, cy - FACE_H / 2 - 20, FACE_W + 80, FACE_H + 40); ctx.restore();
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.font = `500 15px ${MONO}`; const site = 'WHEEL-HOUSE.PAGES.DEV'.split('').join('\u200A'); ctx.fillText(site, cx - ctx.measureText(site).width / 2, 640);
}


// Best container X accepts first; WebM is the fallback and is labelled so.
export function pickVideoType(isSupported = type => globalThis.MediaRecorder?.isTypeSupported?.(type)) {
  for (const type of ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm']) {
    try { if (isSupported(type)) return { type, ext: type.startsWith('video/mp4') ? 'mp4' : 'webm' }; } catch { /* next */ }
  }
  return null;
}

// Records `seconds` of the canvas while frame(t) draws each step. Resolves { blob, ext }.
export function recordCanvas(canvas, frame, { seconds = 5, fps = 30, signal } = {}) {
  const kind = pickVideoType();
  if (!kind || typeof canvas.captureStream !== 'function') return Promise.reject(new Error('Video recording is not supported in this browser.'));
  const stream = canvas.captureStream(fps), chunks = [];
  const recorder = new MediaRecorder(stream, { mimeType: kind.type, videoBitsPerSecond: 6_000_000 });
  recorder.ondataavailable = event => { if (event.data?.size) chunks.push(event.data); };
  return new Promise((resolve, reject) => {
    recorder.onerror = event => reject(event.error ?? new Error('Recording failed.'));
    recorder.onstop = () => { stream.getTracks().forEach(track => track.stop()); const blob = new Blob(chunks, { type: kind.type.split(';')[0] }); blob.size ? resolve({ blob, ext: kind.ext }) : reject(new Error('Recording came out empty.')); };
    const start = performance.now();
    let cancelled = false;
    signal?.addEventListener('abort', () => { cancelled = true; if (recorder.state !== 'inactive') recorder.stop(); }, { once: true });
    recorder.onstop = (orig => () => { if (cancelled) { stream.getTracks().forEach(track => track.stop()); reject(new Error('Recording cancelled.')); } else orig(); })(recorder.onstop);
    const step = now => { if (cancelled) return; const t = (now - start) / 1000; frame(t); if (t < seconds) requestAnimationFrame(step); else recorder.stop(); };
    recorder.start(250); requestAnimationFrame(step);
  });
}

export function webglAvailable(doc = document) {
  try { const c = doc.createElement('canvas'); return Boolean(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}

export async function loadFonts(doc = document) {
  try { await Promise.all([`700 68px ${SANS}`, `600 44px ${COND}`, `500 20px ${COND}`, `600 20px ${MONO}`].map(f => doc.fonts?.load(f))); } catch { /* system fallback */ }
}

// Opens the card in `host`. Desktop with WebGL renders the scene in 3D (three.js, shared with the hero) under the
// text layer; phones or no WebGL get the flat scene. One 2D output canvas is what you see, save and record.
// Card styles the share sheet offers. Flip is the default and the only one with the 3D hamster.
export const STYLES = [['flip', 'Flip card'], ['night', 'Night scene'], ['classic', 'Classic']];
export const styleSeconds = style => style === 'flip' ? LOOP_SECONDS : 5;

export async function mountCard(host, initial, { reducedMotion = false, wide = true, loadStage, style: firstStyle = 'flip', dark = true } = {}) {
  await loadFonts(); let data = initial, style = STYLES.some(([k]) => k === firstStyle) ? firstStyle : 'flip';
  const styles = await import('./share-styles.js');
  const out = document.createElement('canvas'); out.width = CARD_W; out.height = CARD_H; const ctx = out.getContext('2d');
  let stage = null;
  if (wide && loadStage && webglAvailable()) { try { stage = (await loadStage())({ width: WIN.w * 2, height: WIN.h * 2 }); } catch { stage = null; } }
  out.classList.add('share-canvas'); out.setAttribute('aria-label', 'Holder share card preview'); out.setAttribute('role', 'img');
  host.replaceChildren(out);
  const render = (t, turn) => {
    if (style === 'night') return styles.drawNight(ctx, data, { t });
    if (style === 'classic') return turn === undefined ? styles.drawClassicMoving(ctx, data, { t, dark }) : styles.drawClassic(ctx, data, { t, dark });
    if (stage) stage.frame(t);
    return drawCard(ctx, data, { t, scene: stage?.canvas ?? null, ...(turn === undefined ? {} : { turn }) });
  };
  const draw = t => render(t);
  draw(0.6);
  let raf = 0, alive = true, recording = false; const start = performance.now(), abort = new AbortController();
  const loop = now => { if (!alive) return; if (!recording) draw(0.8 + (now - start) / 1000); raf = requestAnimationFrame(loop); };
  if (!reducedMotion) raf = requestAnimationFrame(loop);
  return {
    mode: stage ? '3d' : '2d',
    get style() { return style; },
    update: next => { data = next; if (reducedMotion) draw(0.8); },
    setStyle: next => { if (recording || !STYLES.some(([k]) => k === next)) return false; style = next; draw(0.8); return true; },
    // The picture is held still; the flip card always shows its front.
    png: () => new Promise((resolve, reject) => { render(0.6, 0); out.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not make the picture.')), 'image/png'); }),
    video: async seconds => { if (recording) throw new Error('Already recording.'); recording = true; try { return await recordCanvas(out, draw, { seconds: seconds ?? styleSeconds(style), signal: abort.signal }); } finally { recording = false; } },
    stop: () => { alive = false; abort.abort(); cancelAnimationFrame(raf); stage?.dispose(); host.replaceChildren(); },
  };
}

export function download(blob, name, doc = document) {
  const url = URL.createObjectURL(blob), a = doc.createElement('a');
  a.href = url; a.download = name; doc.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
