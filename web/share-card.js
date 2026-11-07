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
export function cardData({ owner, count, powerLabel = 'Power', power, claimable, levels = [], network = 'Sepolia', date = new Date() } = {}) {
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
    levels: [...byLevel.entries()].sort((a, b) => a[0] - b[0]).map(([level, n]) => ({ level, count: n })),
    network: clean(network),
    date: `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`,
  };
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

// Flat (no WebGL) version of the scene: night stage, glowing rail, glossy orbs, the wheel. Phones use this.
export function drawBackdrop(ctx, data, t = 0) {
  const W = CARD_W, H = CARD_H;
  const bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#121420'); bg.addColorStop(0.55, '#0B0C12'); bg.addColorStop(1, '#050507');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(860, 300, 20, 860, 300, 520); glow.addColorStop(0, 'rgba(89,122,247,.28)'); glow.addColorStop(1, 'rgba(89,122,247,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
  // floor tiles in perspective
  ctx.strokeStyle = 'rgba(255,255,255,.045)'; ctx.lineWidth = 1.5;
  for (let i = -8; i <= 8; i++) { ctx.beginPath(); ctx.moveTo(600 + i * 40, 330); ctx.lineTo(600 + i * 260, H); ctx.stroke(); }
  for (let k = 0; k < 7; k++) { const y = 330 + Math.pow(k / 6, 1.8) * (H - 330); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  // rail: a glossy curved track sweeping from the wheel to the left
  const rail = (offset, color, width) => { ctx.beginPath(); ctx.moveTo(-40, 330 + offset); ctx.bezierCurveTo(260, 400 + offset, 520, 250 + offset, 860, 420 + offset); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.stroke(); };
  rail(8, 'rgba(0,0,0,.6)', 46); rail(0, '#16182A', 40); rail(-12, 'rgba(255,255,255,.10)', 4);
  // wheel
  const cx = 900, cy = 300, r = 150, spin = -t * 2.6;
  ctx.save(); ctx.translate(cx, cy);
  ctx.strokeStyle = '#2A2D3A'; ctx.lineWidth = 16; ctx.beginPath(); ctx.moveTo(-70, r + 120); ctx.lineTo(0, 0); ctx.lineTo(70, r + 120); ctx.stroke();
  ctx.shadowColor = 'rgba(89,122,247,.8)'; ctx.shadowBlur = 30; ctx.strokeStyle = '#597AF7'; ctx.lineWidth = 14; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
  ctx.shadowBlur = 0; ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(89,122,247,.45)'; ctx.beginPath(); ctx.arc(0, 0, r - 22, 0, Math.PI * 2); ctx.stroke();
  for (let i = 0; i < 24; i++) { const a = spin + i * Math.PI / 12; ctx.strokeStyle = i % 6 === 0 ? '#FCBE46' : 'rgba(255,255,255,.22)'; ctx.lineWidth = i % 6 === 0 ? 5 : 3; ctx.beginPath(); ctx.moveTo(Math.cos(a) * (r - 22), Math.sin(a) * (r - 22)); ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); ctx.stroke(); }
  for (let i = 0; i < 6; i++) { const a = spin + i * Math.PI / 3; ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * (r - 22), Math.sin(a) * (r - 22)); ctx.stroke(); }
  ctx.fillStyle = '#FCBE46'; ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // orbs roll along the rail (bezier sampled), bigger for higher levels
  const orbs = orbList(data.levels); const P = (u) => { const a = [-40, 330], b = [260, 400], c = [520, 250], d = [860, 420], m = 1 - u; return [m*m*m*a[0] + 3*m*m*u*b[0] + 3*m*u*u*c[0] + u*u*u*d[0], m*m*m*a[1] + 3*m*m*u*b[1] + 3*m*u*u*c[1] + u*u*u*d[1]]; };
  orbs.forEach((level, i) => {
    const u = 0.06 + (((i + 0.5) / Math.max(orbs.length, 4) + t * 0.02) % 1) * 0.8; const [x, y] = P(u); const rr = 15 + Math.min(level, 8) * 3 + u * 8;
    ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.beginPath(); ctx.ellipse(x + 4, y + rr * 0.15, rr * 1.05, rr * 0.35, 0, 0, Math.PI * 2); ctx.fill();
    const g = ctx.createRadialGradient(x - rr * 0.35, y - rr * 1.35, rr * 0.1, x, y - rr, rr * 1.1); const c = levelColor(level);
    g.addColorStop(0, '#FFFFFF'); g.addColorStop(0.18, c); g.addColorStop(1, shade(c, -0.55));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y - rr, rr, 0, Math.PI * 2); ctx.fill();
  });
}
function shade(hex, k) { const n = parseInt(hex.slice(1), 16), f = v => Math.max(0, Math.min(255, Math.round(v * (1 + k)))); return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`; }

// Text layer, drawn over either the 3D render or the flat backdrop.
export function drawOverlay(ctx, data) {
  const W = CARD_W, H = CARD_H;
  const scrim = ctx.createLinearGradient(0, H * 0.45, 0, H); scrim.addColorStop(0, 'rgba(5,5,7,0)'); scrim.addColorStop(1, 'rgba(5,5,7,.88)');
  ctx.fillStyle = scrim; ctx.fillRect(0, 0, W, H);
  const top = ctx.createLinearGradient(0, 0, 0, 140); top.addColorStop(0, 'rgba(5,5,7,.55)'); top.addColorStop(1, 'rgba(5,5,7,0)');
  ctx.fillStyle = top; ctx.fillRect(0, 0, W, 140);
  ctx.textBaseline = 'alphabetic';
  // logo mark + wordmark (no trailing dot)
  ctx.save(); ctx.translate(76, 70); ctx.strokeStyle = '#FCBE46'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI * 2); ctx.stroke();
  for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * 18, Math.sin(a) * 18); ctx.lineWidth = 2.5; ctx.stroke(); }
  ctx.restore();
  ctx.fillStyle = '#FFFFFF'; ctx.font = `700 36px ${SANS}`; ctx.fillText('wheelhouse', 108, 82);
  ctx.font = `600 20px ${MONO}`; const chip = `${data.network.toUpperCase()} · ${data.date}`; const cw = ctx.measureText(chip).width + 32;
  roundRect(ctx, W - 56 - cw, 48, cw, 42, 21); ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.fillText(chip, W - 56 - cw + 16, 76);

  // title: address, like "Checkpoint example"
  ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.font = `600 22px ${COND}`; ctx.fillText('SQUEEK HOLDER CHECKPOINT', 72, 452);
  ctx.fillStyle = '#FFFFFF'; fitFont(ctx, data.address || 'Unknown wallet', 640, 68, 700, SANS); ctx.fillText(data.address || 'Unknown wallet', 70, 520);

  // stats row
  const stats = [[data.count, 'SQUEEKS'], [data.power, data.powerLabel.toUpperCase()], [data.claimable.replace(/\s*SQK$/i, ''), 'SQK CLAIMABLE']];
  let x = 72; for (const [value, label] of stats) {
    ctx.fillStyle = '#FFFFFF'; ctx.font = `600 44px ${COND}`; ctx.fillText(value, x, 590); const vw = ctx.measureText(value).width;
    ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.font = `500 20px ${COND}`; ctx.fillText(label, x + vw + 10, 590); x += vw + 10 + ctx.measureText(label).width + 34;
  }
  // level chips, right side bottom
  ctx.font = `600 22px ${COND}`; let rx = W - 56; const chips = data.levels.length ? [...data.levels].reverse() : [];
  for (const { level, count } of chips) {
    const text = `L${level} × ${count}`, w = ctx.measureText(text).width + 44; rx -= w; if (rx < 760) break;
    roundRect(ctx, rx, 558, w, 40, 20); ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.16)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = levelColor(level); ctx.beginPath(); ctx.arc(rx + 18, 578, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#FFFFFF'; ctx.fillText(text, rx + 32, 586); rx -= 10;
  }
  ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.font = `500 16px ${MONO}`;
  ctx.fillText('Testnet values · not financial advice', 72, 640);
  const site = 'wheel-house.pages.dev'; ctx.fillText(site, W - 56 - ctx.measureText(site).width, 640);
}

// One full frame: the 3D render when given, otherwise the flat backdrop, then the text.
export function drawCard(ctx, data, { t = 0, scene = null } = {}) {
  ctx.save(); ctx.clearRect(0, 0, CARD_W, CARD_H);
  if (scene) ctx.drawImage(scene, 0, 0, CARD_W, CARD_H); else drawBackdrop(ctx, data, t);
  drawOverlay(ctx, data); ctx.restore();
}

// Best container X accepts first; WebM is the fallback and is labelled so.
export function pickVideoType(isSupported = type => globalThis.MediaRecorder?.isTypeSupported?.(type)) {
  for (const type of ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm']) {
    try { if (isSupported(type)) return { type, ext: type.startsWith('video/mp4') ? 'mp4' : 'webm' }; } catch { /* next */ }
  }
  return null;
}

// Records `seconds` of the canvas while frame(t) draws each step. Resolves { blob, ext }.
export function recordCanvas(canvas, frame, { seconds = 5, fps = 30 } = {}) {
  const kind = pickVideoType();
  if (!kind || typeof canvas.captureStream !== 'function') return Promise.reject(new Error('Video recording is not supported in this browser.'));
  const stream = canvas.captureStream(fps), chunks = [];
  const recorder = new MediaRecorder(stream, { mimeType: kind.type, videoBitsPerSecond: 6_000_000 });
  recorder.ondataavailable = event => { if (event.data?.size) chunks.push(event.data); };
  return new Promise((resolve, reject) => {
    recorder.onerror = event => reject(event.error ?? new Error('Recording failed.'));
    recorder.onstop = () => { stream.getTracks().forEach(track => track.stop()); const blob = new Blob(chunks, { type: kind.type.split(';')[0] }); blob.size ? resolve({ blob, ext: kind.ext }) : reject(new Error('Recording came out empty.')); };
    const start = performance.now();
    const step = now => { const t = (now - start) / 1000; frame(t); if (t < seconds) requestAnimationFrame(step); else recorder.stop(); };
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
export async function mountCard(host, data, { reducedMotion = false, wide = true, loadStage } = {}) {
  await loadFonts();
  const out = document.createElement('canvas'); out.width = CARD_W; out.height = CARD_H; const ctx = out.getContext('2d');
  let stage = null;
  if (wide && loadStage && webglAvailable()) { try { stage = (await loadStage())({ width: CARD_W, height: CARD_H, orbs: orbList(data.levels) }); } catch { stage = null; } }
  out.classList.add('share-canvas'); out.setAttribute('aria-label', 'Holder share card preview'); out.setAttribute('role', 'img');
  host.replaceChildren(out);
  const draw = t => { if (stage) stage.frame(t); drawCard(ctx, data, { t, scene: stage?.canvas ?? null }); };
  draw(0.8);
  let raf = 0, alive = true, recording = false; const start = performance.now();
  const loop = now => { if (!alive) return; if (!recording) draw(0.8 + (now - start) / 1000); raf = requestAnimationFrame(loop); };
  if (!reducedMotion) raf = requestAnimationFrame(loop);
  return {
    mode: stage ? '3d' : '2d',
    png: () => new Promise((resolve, reject) => { out.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not make the picture.')), 'image/png'); }),
    video: async seconds => { recording = true; try { return await recordCanvas(out, draw, { seconds }); } finally { recording = false; } },
    stop: () => { alive = false; cancelAnimationFrame(raf); stage?.dispose(); host.replaceChildren(); },
  };
}

export function download(blob, name, doc = document) {
  const url = URL.createObjectURL(blob), a = doc.createElement('a');
  a.href = url; a.download = name; doc.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
