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
export const DEFAULT_SHOW = { address: false, count: true, power: true, claimable: true, claimed: false, compounded: false, levels: true, meta: true };
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
  return { ...data, address: on.address ? data.address : null, front, back, stats: [...front, ...back], levels: on.levels ? data.levels : [], orbLevels: on.levels ? data.levels : [], meta: on.meta };
}

export function fileName(data, ext) {
  const who = data.address ? data.address.replace('…', '-') : 'holder';
  return `wheelhouse-${who}-${data.date}.${ext}`;
}

export const LEVEL_COLORS = ['#FCBE46', '#597AF7', '#FF5FA2', '#3DDC97', '#9B6BFF', '#FF8A3D', '#4FD1E8', '#F2F2F2'];
export const levelColor = level => LEVEL_COLORS[((Number.isInteger(level) && level > 0 ? level : 1) - 1) % LEVEL_COLORS.length];
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
  const limit = Number.isFinite(max) ? Math.max(0, Math.min(14, Math.floor(max))) : 14;
  const out = []; for (const { level, count } of levels ?? []) {
    if (!Number.isInteger(level) || level < 1 || !Number.isFinite(count) || count < 1) continue;
    for (let i = 0; i < Math.floor(count) && out.length < limit; i++) out.push(level);
    if (out.length === limit) break;
  }
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
  return base + Math.sin(p * Math.PI * 2 / LOOP_SECONDS) * 0.12;
}

// Grey studio backdrop with grain, like a product shot.
let grain = null;
function drawStudio(ctx, make) {
  const W = CARD_W, H = CARD_H;
  const g = ctx.createLinearGradient(0, 0, W * 0.55, H); g.addColorStop(0, '#414757'); g.addColorStop(0.4, '#252936'); g.addColorStop(0.72, '#13151D'); g.addColorStop(1, '#08090D');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const band = ctx.createLinearGradient(W, 0, W * 0.35, H); band.addColorStop(0, 'rgba(163,183,255,.18)'); band.addColorStop(0.35, 'rgba(255,255,255,0)'); band.addColorStop(0.7, 'rgba(0,0,0,.55)');
  ctx.fillStyle = band; ctx.fillRect(0, 0, W, H);
  if (!grain) { grain = make(W, H); const gc = grain.getContext('2d'); let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 42000; i++) { const v = rnd() > 0.5 ? 255 : 0; gc.fillStyle = `rgba(${v},${v},${v},${0.008 + rnd() * 0.02})`; gc.fillRect(rnd() * W, rnd() * H, 1.4, 1.4); } }
  ctx.drawImage(grain, 0, 0);
}

export function drawDisclaimer(ctx, data, x, y, centered = false) {
  ctx.save(); ctx.textAlign = centered ? 'center' : 'start';
  ctx.font = `500 12px ${MONO}`; ctx.fillStyle = 'rgba(255,255,255,.62)';
  ctx.fillText(data.network.toLowerCase() === 'mainnet' ? 'Holder snapshot · Not financial advice' : 'Testnet snapshot · Not financial advice', x, y);
  ctx.restore();
}

function cardBase(ctx) {
  const w = FACE_W, h = FACE_H;
  roundRect(ctx, 0, 0, w, h, 30); const g = ctx.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#17181E'); g.addColorStop(1, '#0C0D11'); ctx.fillStyle = g; ctx.fill();
  ctx.save(); roundRect(ctx, 0, 0, w, h, 30); ctx.clip(); ctx.fillStyle = 'rgba(255,255,255,.022)'; for (let x = 0; x < w; x += 4) ctx.fillRect(x, 0, 1, h); ctx.restore();
  roundRect(ctx, 0.75, 0.75, w - 1.5, h - 1.5, 30); ctx.strokeStyle = 'rgba(255,255,255,.07)'; ctx.lineWidth = 1.5; ctx.stroke();
}
// Shared foil palette keeps the marks, window trim and turning edge coordinated.
export const FOIL_COLORS = ['#9CFFD0', '#9BE7FF', '#B9A6FF', '#FFF3D6'];
export const BACK_WHEEL = Object.freeze({ x: 580, y: 270, radius: 130, lineWidth: 20 });
export function foil(ctx, x, y, w, h) {
  const gradient = ctx.createLinearGradient(x, y, x + w, y + h);
  FOIL_COLORS.forEach((color, i) => gradient.addColorStop(i / (FOIL_COLORS.length - 1), color));
  return gradient;
}
export function wheelMark(ctx, x, y, radius, t = 0) {
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = foil(ctx, -radius, -radius, radius * 2, radius * 2);
  ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#242631'; ctx.lineWidth = Math.max(1.3, radius * 0.1);
  ctx.beginPath(); ctx.arc(0, 0, radius * 0.78, 0, Math.PI * 2); ctx.stroke();
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3 + t * 0.5;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * radius * 0.78, Math.sin(a) * radius * 0.78); ctx.stroke();
  }
  ctx.fillStyle = '#242631'; ctx.beginPath(); ctx.arc(0, 0, radius * 0.15, 0, Math.PI * 2); ctx.fill(); ctx.restore();
}
function logo(ctx, data) {
  wheelMark(ctx, 58, 62, 17);
  ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#FFFFFF'; ctx.font = `700 30px ${SANS}`; ctx.fillText('wheelhouse', 84, 72); const ww = ctx.measureText('wheelhouse').width;
  if (data.meta !== false) { ctx.font = `600 13px ${MONO}`; ctx.fillStyle = '#C9C0EB'; const n = data.network.toUpperCase(); ctx.fillText(n, 84 + ww - ctx.measureText(n).width, 92); }
}
function label(ctx, text, x, y, max = 340) { ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.font = `500 13px ${MONO}`; ctx.fillText(text.toUpperCase().split('').join('\u200A'), x, y, max); }
function holder(ctx, data, x, y) {
  const name = data.address || 'A Squeek holder', seed = [...(data.address || 'holder')].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);
  const g = ctx.createLinearGradient(x, y - 14, x + 28, y + 14); g.addColorStop(0, LEVEL_COLORS[seed % 8]); g.addColorStop(1, LEVEL_COLORS[(seed >>> 3) % 8]);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x + 14, y, 14, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.font = `600 19px ${SANS}`; ctx.fillText(name, x + 38, y + 7);
}
function levelChips(ctx, levels, x, y, maxX) {
  ctx.font = `600 20px ${SANS}`;
  for (let i = 0; i < levels.length; i++) {
    const {level,count} = levels[i];
    const text = `L${level} × ${count}`, w = ctx.measureText(text).width + 38;
    const reserve = i < levels.length - 1 ? 50 : 0;
    if (x + w + reserve > maxX) { ctx.fillStyle='#FFFFFF'; ctx.fillText(`+${levels.length-i}`,x,y,Math.max(1,maxX-x)); break; }
    ctx.fillStyle = levelColor(level); ctx.beginPath(); ctx.arc(x + 8, y - 7, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#FFFFFF'; ctx.fillText(text, x + 24, y); x += w;
  }
}
// Flat window scene: the hamster in its wheel (used when there is no WebGL).
function drawWindowScene(ctx, w, h, t) {
  const glow = ctx.createRadialGradient(w / 2, h * 0.45, 10, w / 2, h * 0.45, w * 0.8); glow.addColorStop(0, 'rgba(89,122,247,.28)'); glow.addColorStop(1, 'rgba(89,122,247,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, w, h);
  const cx = w / 2, cy = h * 0.43, r = w * 0.38, spin = -t * 2.6;
  ctx.strokeStyle = '#2B2F44'; ctx.lineWidth = 10; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(cx - r * 0.55, h * 0.83); ctx.lineTo(cx, cy); ctx.lineTo(cx + r * 0.55, h * 0.83); ctx.stroke();
  ctx.strokeStyle = foil(ctx, cx - r, cy - r, r * 2, r * 2); ctx.lineWidth = 9; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
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
  roundRect(ctx, x, y, w, h, 16); ctx.strokeStyle = foil(ctx, x, y, w, h); ctx.lineWidth = 2; ctx.stroke();
  ctx.font = `600 12px ${MONO}`; const cap = data.meta !== false ? `CHECKPOINT · ${data.date}` : 'CHECKPOINT'; const cw = ctx.measureText(cap).width;
  const cx = x + w / 2, cy = y + h - 16; ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.fillText(cap, cx - cw / 2, cy);
  ctx.fillStyle = '#B9A6FF'; ctx.fillText('[', cx - cw / 2 - 18, cy); ctx.fillText(']', cx + cw / 2 + 10, cy);
}
export function drawFront(ctx, data, { t = 0, scene = null } = {}) {
  ctx.clearRect(0, 0, FACE_W, FACE_H); cardBase(ctx); logo(ctx, data); ctx.textBaseline = 'alphabetic';
  let y = 152; data.front.forEach(([value, name], i) => {
    label(ctx, name, 44, y); ctx.fillStyle = '#FFFFFF'; fitFont(ctx, value, 340, i ? 34 : 50, 700, SANS); ctx.fillText(value, 42, y + (i ? 42 : 56), 340); y += i ? 78 : 92;
  });
  if (data.levels.length) { label(ctx, 'Levels', 44, y); levelChips(ctx, data.levels, 44, y + 36, 396); }
  holder(ctx, data, 44, FACE_H - 46);
  drawWindow(ctx, data, t, scene);
}
function holo(ctx, x, y, s, t) {
  const g = foil(ctx, x, y, s, s);
  roundRect(ctx, x, y, s, s, 9); ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.save(); roundRect(ctx, x + 5, y + 5, s - 10, s - 10, 6);
  ctx.fillStyle = '#242631'; ctx.fill(); ctx.restore();
  wheelMark(ctx, x + s / 2, y + s / 2, s * 0.29, t);
}
export function drawBack(ctx, data, { t = 0 } = {}) {
  ctx.clearRect(0, 0, FACE_W, FACE_H); cardBase(ctx);
  ctx.save(); roundRect(ctx, 0, 0, FACE_W, FACE_H, 30); ctx.clip();
  // The entire rim stays inside the face, with clearance from the badge and footer.
  const { x, y, radius, lineWidth } = BACK_WHEEL;
  ctx.translate(x, y); ctx.rotate(-t * 0.15);
  ctx.globalAlpha = 0.12; ctx.strokeStyle = foil(ctx, -radius, -radius, radius * 2, radius * 2);
  ctx.lineWidth = lineWidth; ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = 0.065; ctx.lineWidth = 10;
  for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * (radius - 10), Math.sin(a) * (radius - 10)); ctx.stroke(); }
  ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fillStyle = '#B9A6FF'; ctx.fill();
  ctx.restore();
  logo(ctx, data); holo(ctx, FACE_W - 92, 36, 50, t);
  if (!data.back.length && data.meta === false) { label(ctx, 'HOLDER CHECKPOINT', 44, 182); ctx.fillStyle='#FFFFFF'; ctx.font=`600 28px ${SANS}`; ctx.fillText('No reward metrics selected',44,238); }
  ctx.textBaseline = 'alphabetic';
  const back = data.back.length ? data.back : (data.meta !== false ? [[data.date, 'Checked']] : []);
  if (back[0]) { label(ctx, back[0][1], 44, 182); ctx.fillStyle = '#FFFFFF'; fitFont(ctx, back[0][0], 460, 60, 700, SANS); ctx.fillText(back[0][0], 42, 244, 460); }
  back.slice(1).forEach(([value, name], i) => { const x = 44 + i * 240; label(ctx, name, x, 298, 220); ctx.fillStyle = '#FFFFFF'; fitFont(ctx, value, 220, 30, 700, SANS); ctx.fillText(value, x - 1, 336, 220); });
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
  // card edge (pastel foil), visible when nearly side-on
  const N = 160, sw = FACE_W / N;
  const proj = u => { const xl = (u - 0.5) * FACE_W * (showBack ? -1 : 1), k = D / (D + xl * sn); return { x: cx + xl * c * k, k, dy: (u - 0.5) * FACE_W * pitch }; };
  if (Math.abs(c) < 0.35) { const k = 1; ctx.fillStyle = foil(ctx, cx - 8, cy - FACE_H / 2, 16, FACE_H); const e = Math.max(3, 14 * Math.abs(sn) * (1 - Math.abs(c))); roundRect(ctx, cx - e / 2, cy - FACE_H * k / 2, e, FACE_H * k, e / 2); ctx.fill(); }
  for (let i = 0; i < N; i++) {
    const a = proj(i / N), b = proj((i + 1) / N), left = Math.min(a.x, b.x), width = Math.abs(b.x - a.x) + 0.6, k = (a.k + b.k) / 2, hgt = FACE_H * k;
    if (width < 0.2) continue; ctx.drawImage(face, i * sw, 0, sw, FACE_H, left, cy - hgt / 2 + (a.dy + b.dy) / 2, width, hgt);
  }
  // sheen sweeping across as it turns
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; const sx = cx + Math.sin(turn) * 380, gl = ctx.createLinearGradient(sx - 120, 0, sx + 120, 0);
  gl.addColorStop(0, 'rgba(255,255,255,0)'); gl.addColorStop(0.5, `rgba(255,255,255,${0.06 * Math.abs(c)})`); gl.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gl; ctx.fillRect(cx - FACE_W / 2 - 40, cy - FACE_H / 2 - 20, FACE_W + 80, FACE_H + 40); ctx.restore();
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.font = `500 15px ${MONO}`; const site = 'WHEEL-HOUSE.PAGES.DEV'.split('').join('\u200A'); ctx.fillText(site, cx - ctx.measureText(site).width / 2, 635);
  drawDisclaimer(ctx, data, cx, 659, true);
}


// Best container X accepts first; WebM is the fallback and is labelled so.
export function pickVideoType(isSupported = type => globalThis.MediaRecorder?.isTypeSupported?.(type)) {
  for (const type of ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm']) {
    try { if (isSupported(type)) return { type, ext: type.startsWith('video/mp4') ? 'mp4' : 'webm' }; } catch { /* next */ }
  }
  return null;
}

// Records `seconds` of the canvas while frame(t) draws each step. Resolves { blob, ext }.
export function recordCanvas(canvas, frame, { seconds = 5, fps = 30, signal, onProgress } = {}) {
  const kind = pickVideoType();
  if (!kind || typeof canvas.captureStream !== 'function') return Promise.reject(new Error('Video recording is not supported in this browser.'));
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 30 || !Number.isFinite(fps) || fps <= 0 || fps > 60) return Promise.reject(new Error('Invalid recording duration or frame rate.'));
  return new Promise((resolve, reject) => {
    let stream, recorder, raf = 0, timer, watchdog, settled = false;
    const chunks = [];
    const finish = (error, result) => {
      if (settled) return;
      settled = true; cancelAnimationFrame(raf); clearTimeout(timer); clearTimeout(watchdog);
      signal?.removeEventListener('abort', abort);
      if (recorder && recorder.state !== 'inactive') { try { recorder.stop(); } catch {} }
      stream?.getTracks().forEach(track => { try { track.stop(); } catch {} });
      error ? reject(error) : resolve(result);
    };
    const abort = () => finish(new Error('Recording cancelled.'));
    if (signal?.aborted) return abort();
    signal?.addEventListener('abort', abort, { once: true });
    try {
      frame(0); if (settled) return;
      stream = canvas.captureStream(fps);
      recorder = new MediaRecorder(stream, { mimeType: kind.type, videoBitsPerSecond: 8_000_000 });
      recorder.ondataavailable = event => { if (event.data?.size) chunks.push(event.data); };
      recorder.onerror = event => finish(event.error ?? new Error('Recording failed.'));
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: kind.type.split(';')[0] });
        finish(blob.size ? null : new Error('Recording came out empty.'), { blob, ext: kind.ext });
      };
      const start = performance.now();
      const step = now => {
        if (settled || recorder.state !== 'recording') return;
        try { const t = Math.min((now - start) / 1000, seconds); frame(t); onProgress?.(t / seconds); }
        catch (error) { finish(error); return; }
        if (!settled) raf = requestAnimationFrame(step);
      };
      recorder.start(250); if (settled) return; raf = requestAnimationFrame(step);
      timer = setTimeout(() => { try { if (!settled && recorder.state === 'recording') { onProgress?.(1); recorder.stop(); } } catch (error) { finish(error); } }, seconds * 1000);
      watchdog = setTimeout(() => finish(new Error('Video encoder timed out. Try the picture instead.')), seconds * 1000 + 10_000);
    } catch (error) { finish(error); }
  });
}

export function webglAvailable(doc = document) {
  // Three.js requires WebGL2. Release the probe immediately instead of leaking one context per style switch.
  let gl;
  try { gl = doc.createElement('canvas').getContext('webgl2'); return Boolean(gl); }
  catch { return false; }
  finally { try { gl?.getExtension?.('WEBGL_lose_context')?.loseContext(); } catch { /* capability probes must fail closed */ } }
}

export async function loadFonts(doc = document) {
  let timer;
  try { await Promise.race([Promise.all([`500 20px ${SANS}`, `600 30px ${SANS}`, `700 68px ${SANS}`, `600 44px ${COND}`, `500 20px ${COND}`, `500 20px ${MONO}`, `600 20px ${MONO}`].map(font => doc.fonts?.load(font))),new Promise(resolve=>{timer=setTimeout(resolve,3000);})]); } catch { /* system fallback */ } finally {clearTimeout(timer);}
}

// Opens the card in `host`. Desktop with WebGL renders the scene in 3D (three.js, shared with the hero) under the
// text layer; phones or no WebGL get the flat scene. One 2D output canvas is what you see, save and record.
// Card styles the share sheet offers. Flip is the default and the default; Night also has its own optional 3D stage.
export const STYLES = [['flip', 'Flip card'], ['night', 'Night scene'], ['classic', 'Classic']];
export const STYLE_HINTS = { flip: 'Animated showcase · two-sided', night: 'Cinematic scene · level-coloured orbs', classic: 'Clean stats · lightweight' };
export const styleSeconds = style => style === 'flip' ? LOOP_SECONDS : 5;

export async function mountCard(host, initial, { reducedMotion = false, wide = true, loadStage, loadNight, style: firstStyle = 'flip', dark = true, signal } = {}) {
  const doc = host.ownerDocument;
  const assertOpen = () => { if (signal?.aborted) throw new Error('Card closed.'); };
  assertOpen(); await loadFonts(doc); assertOpen();
  let data = initial, style = STYLES.some(([key]) => key === firstStyle) ? firstStyle : 'flip';
  const styles = await import('./share-styles.js'); assertOpen();
  const out = doc.createElement('canvas'); out.width = CARD_W; out.height = CARD_H;
  const ctx = out.getContext('2d');
  if (!ctx) throw new Error('Canvas drawing is not supported in this browser.');
  let stage = null, flip = null, night = null, stagePromise = null, nightPromise = null;
  let alive = true, exporting = false, raf = 0, lastPreview = 0;
  const abort = new AbortController();
  const scratch = new Map();
  const makeScratch = (w,h) => { const key=`${w}x${h}`; if(!scratch.has(key))scratch.set(key,defaultCanvas(w,h));return scratch.get(key); };
  const front = defaultCanvas(FACE_W, FACE_H), back = defaultCanvas(FACE_W, FACE_H);
  const frontCtx = front.getContext('2d'), backCtx = back.getContext('2d');
  if (!frontCtx || !backCtx) throw new Error('Canvas drawing is not supported in this browser.');
  out.classList.add('share-canvas'); out.setAttribute('aria-label', 'Holder share card preview'); out.setAttribute('role', 'img');
  const capable = wide && (loadStage || loadNight) ? webglAvailable(doc) : false;
  const lossHandlers = new Map();
  const unwatch = resource => { const listener=lossHandlers.get(resource); if(listener){resource.canvas.removeEventListener('webglcontextlost',listener);lossHandlers.delete(resource);} };
  const releaseFlip = () => { unwatch(flip); unwatch(stage); flip?.dispose(); stage?.dispose(); flip = stage = null; };
  const releaseNight = () => { unwatch(night); night?.dispose(); night = null; };
  const watch = (resource, release) => {
    if(!resource?.canvas?.addEventListener)return;
    const listener = () => { release(); if(alive && !exporting) render(0.8); };
    lossHandlers.set(resource,listener);resource.canvas.addEventListener('webglcontextlost',listener);
  };
  const stop = () => {
    if (!alive) return;
    alive = false; abort.abort(); cancelAnimationFrame(raf);
    signal?.removeEventListener('abort', stop); releaseFlip(); releaseNight();
    // A late old mount must never remove a newer card's canvas.
    if (out.parentNode === host) out.remove();
  };
  signal?.addEventListener('abort', stop, { once: true });
  const ensureStage = () => {
    if (!alive || !capable || !loadStage) return Promise.resolve();
    return stagePromise ??= Promise.resolve().then(loadStage).then(factory => {
      if (!alive) return;
      stage = factory({ width: WIN.w * 2, height: WIN.h * 2 });
      flip = stage.createFlip?.(front, back);
      watch(stage,releaseFlip);watch(flip,releaseFlip);
    }).catch(releaseFlip);
  };
  const ensureNight = () => {
    if (!alive || !capable || !loadNight) return Promise.resolve();
    return nightPromise ??= Promise.resolve().then(loadNight).then(factory => {
      if (alive) { night = factory({ width: CARD_W, height: CARD_H, orbs: orbList(data.orbLevels ?? data.levels) }); watch(night,releaseNight); }
    }).catch(releaseNight);
  };
  const prepare = () => style === 'flip' ? ensureStage() : style === 'night' ? ensureNight() : Promise.resolve();
  const render = (t, turn) => {
    if (!alive) return;
    if (style === 'night') {
      try { night?.frame(t); } catch { releaseNight(); }
      return styles.drawNight(ctx, data, { t, scene: night?.canvas ?? null });
    }
    if (style === 'classic') return turn === undefined ? styles.drawClassicMoving(ctx, data, { t, dark }) : styles.drawClassic(ctx, data, { t, dark });
    const phase = ((t % LOOP_SECONDS) + LOOP_SECONDS) % LOOP_SECONDS;
    try {
      stage?.frame(phase);
      if (flip) {
        drawFront(frontCtx, data, { t: phase, scene: stage.canvas });
        drawBack(backCtx, data, { t: phase });
        flip.frame(phase, turn ?? cardTurn(phase));
      }
    } catch { releaseFlip(); }
    if (!flip) return drawCard(ctx, data, { t: phase, scene: stage?.canvas ?? null, makeCanvas:makeScratch, ...(turn === undefined ? {} : { turn }) });
    drawStudio(ctx, defaultCanvas);
    const shadow = ctx.createRadialGradient(600, 573, 4, 600, 573, 365);
    shadow.addColorStop(0, 'rgba(0,0,0,.6)'); shadow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save(); ctx.translate(600,573); ctx.scale(1,0.12); ctx.fillStyle=shadow; ctx.translate(-600,-573); ctx.fillRect(200,173,800,800); ctx.restore();
    ctx.drawImage(flip.canvas, 0, 0);
    ctx.fillStyle = '#ddd'; ctx.font = `500 15px ${MONO}`; ctx.textAlign = 'center';
    ctx.fillText('WHEEL-HOUSE.PAGES.DEV', CARD_W / 2, 635); ctx.textAlign = 'start';
    drawDisclaimer(ctx, data, 600, 659, true);
  };
  try { await prepare(); assertOpen(); if (!alive) throw new Error('Card closed.'); render(0.6); host.replaceChildren(out); }
  catch (error) { stop(); throw error; }
  const start = performance.now();
  const loop = now => {
    if (!alive) return;
    // Preview at 24 FPS; export renders separately at its requested rate.
    if (!exporting && doc.visibilityState !== 'hidden' && now - lastPreview >= 1000 / 24) { render(0.8 + (now - start) / 1000); lastPreview = now; }
    raf = requestAnimationFrame(loop);
  };
  if (!reducedMotion) raf = requestAnimationFrame(loop);
  return {
    get mode() { return (style === 'night' ? night : style === 'flip' ? stage : null) ? '3d' : '2d'; },
    get style() { return style; },
    get videoSupported() { return Boolean(pickVideoType() && typeof out.captureStream === 'function'); },
    update: next => {
      if (exporting || !alive) return false;
      data = next;
      // Synchronize both visible labels and GPU orbs immediately when privacy options change.
      night?.setOrbs(orbList(data.orbLevels ?? data.levels));
      render(0.8); return true;
    },
    setStyle: next => {
      if (exporting || !alive || !STYLES.some(([key]) => key === next)) return false;
      style = next; render(0.8);
      prepare().then(() => { if (alive && !exporting) render(0.8); });
      return true;
    },
    png: async (side = 'front') => {
      if (!alive || exporting) throw new Error('Wait for the current export to finish.');
      exporting = true;
      try {
        await prepare(); if (!alive) throw new Error('Card closed.');
        render(side === 'back' ? 4.5 : 0.6, side === 'back' ? Math.PI : 0);
        const blob = await new Promise((resolve, reject) => out.toBlob(value => value ? resolve(value) : reject(new Error('Could not make the picture.')), 'image/png'));
        if (!alive) throw new Error('Card closed.');
        return blob;
      } finally { exporting = false; }
    },
    video: async (seconds, onProgress) => {
      if (exporting || !alive) throw new Error('Already exporting or closed.');
      exporting = true;
      const controller = new AbortController();
      const cancel = () => controller.abort();
      const visibility = () => { if (doc.visibilityState === 'hidden') controller.abort(); };
      abort.signal.addEventListener('abort', cancel, { once: true });
      doc.addEventListener('visibilitychange', visibility);
      try {
        await prepare();
        if (!alive || doc.visibilityState === 'hidden') controller.abort();
        return await recordCanvas(out, t => render(t), { seconds: seconds ?? styleSeconds(style), signal: controller.signal, onProgress });
      } finally { exporting = false; abort.signal.removeEventListener('abort', cancel); doc.removeEventListener('visibilitychange', visibility); }
    },
    stop,
  };
}

export function download(blob, name, doc = document) {
  const url = URL.createObjectURL(blob), a = doc.createElement('a');
  a.href = url; a.download = name; doc.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
