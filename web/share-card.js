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
    date: day.toISOString().slice(0, 10),
  };
}

export function fileName(data, ext) {
  const who = data.address ? data.address.replace('…', '-') : 'holder';
  return `wheelhouse-${who}-${data.date}.${ext}`;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function fit(ctx, text, max, size, weight = 700) {
  let px = size; ctx.font = `${weight} ${px}px ui-monospace, "SFMono-Regular", Menlo, monospace`;
  while (px > 16 && ctx.measureText(text).width > max) { px -= 2; ctx.font = `${weight} ${px}px ui-monospace, "SFMono-Regular", Menlo, monospace`; }
  return px;
}

// Draws one frame. t is seconds; it only turns the wheel and moves a soft sheen, so every frame is readable.
export function drawCard(ctx, data, { dark = false, t = 0 } = {}) {
  const W = CARD_W, H = CARD_H, ink = dark ? '#F6F3EA' : BRAND.night, muted = dark ? '#A7A39A' : '#5D5A52';
  const panel = dark ? '#16171C' : '#FFFFFF', line = dark ? '#2A2C33' : '#E8E1D0';
  ctx.save(); ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = dark ? BRAND.night : '#FFF8EA'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = dark ? 'rgba(255,255,255,.06)' : 'rgba(10,10,12,.07)';
  for (let x = 24; x < W; x += 32) for (let y = 24; y < H; y += 32) { ctx.beginPath(); ctx.arc(x, y, 1.6, 0, Math.PI * 2); ctx.fill(); }

  // header
  ctx.fillStyle = ink; ctx.font = '800 34px ui-monospace, Menlo, monospace'; ctx.textBaseline = 'alphabetic';
  ctx.fillText('WHEELHOUSE', 64, 92); const brandW = ctx.measureText('WHEELHOUSE').width;
  ctx.fillStyle = BRAND.yellow; ctx.beginPath(); ctx.arc(64 + brandW + 12, 86, 7, 0, Math.PI * 2); ctx.fill();
  ctx.font = '600 22px ui-monospace, Menlo, monospace'; const chip = `${data.network} · ${data.date}`; const chipW = ctx.measureText(chip).width + 36;
  roundRect(ctx, W - 64 - chipW, 58, chipW, 46, 23); ctx.fillStyle = panel; ctx.fill(); ctx.strokeStyle = line; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = muted; ctx.fillText(chip, W - 64 - chipW + 18, 89);

  // address
  ctx.fillStyle = muted; ctx.font = '600 22px ui-monospace, Menlo, monospace'; ctx.fillText('SQUEEK HOLDER', 64, 170);
  ctx.fillStyle = ink; fit(ctx, data.address || 'Unknown wallet', 640, 64, 800); ctx.fillText(data.address || 'Unknown wallet', 64, 236);

  // wheel (top right): spokes turn with t
  const cx = 1000, cy = 260, r = 96, spin = t * 2.4;
  ctx.lineWidth = 10; ctx.strokeStyle = BRAND.blue; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 4; ctx.strokeStyle = BRAND.yellow;
  for (let i = 0; i < 8; i++) { const a = spin + i * Math.PI / 4; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * (r - 6), cy + Math.sin(a) * (r - 6)); ctx.stroke(); }
  ctx.fillStyle = BRAND.yellow; ctx.beginPath(); ctx.arc(cx, cy, 14, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = ink; ctx.beginPath(); ctx.moveTo(cx - 40, cy + r + 40); ctx.lineTo(cx, cy); ctx.lineTo(cx + 40, cy + r + 40); ctx.lineWidth = 6; ctx.strokeStyle = ink; ctx.stroke();

  // stats
  const stats = [['SQUEEKS', data.count], [data.powerLabel.toUpperCase(), data.power], ['CLAIMABLE SQK', data.claimable]];
  const boxW = 340, boxH = 150, gap = 24, top = 300;
  stats.forEach(([label, value], i) => {
    const x = 64 + i * (boxW + gap); const accent = i === 2;
    roundRect(ctx, x, top, boxW, boxH, 20); ctx.fillStyle = accent ? BRAND.yellow : panel; ctx.fill();
    if (!accent) { ctx.strokeStyle = line; ctx.lineWidth = 2; ctx.stroke(); }
    ctx.fillStyle = accent ? BRAND.night : muted; ctx.font = '600 20px ui-monospace, Menlo, monospace'; ctx.fillText(label, x + 24, top + 44);
    ctx.fillStyle = accent ? BRAND.night : ink; fit(ctx, value, boxW - 48, 56, 800); ctx.fillText(value, x + 24, top + 116);
  });

  // levels
  ctx.fillStyle = muted; ctx.font = '600 20px ui-monospace, Menlo, monospace'; ctx.fillText('LEVELS', 64, 510);
  let x = 64; ctx.font = '700 24px ui-monospace, Menlo, monospace';
  const chips = data.levels.length ? data.levels.map(item => `L${item.level} × ${item.count}`) : ['No Squeeks yet'];
  for (const text of chips) {
    const w = ctx.measureText(text).width + 32; if (x + w > W - 64) { ctx.fillStyle = muted; ctx.fillText('…', x, 562); break; }
    roundRect(ctx, x, 528, w, 48, 24); ctx.fillStyle = panel; ctx.fill(); ctx.strokeStyle = BRAND.blue; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = ink; ctx.fillText(text, x + 16, 561); x += w + 12;
  }

  // footer
  ctx.fillStyle = muted; ctx.font = '500 20px ui-monospace, Menlo, monospace';
  ctx.fillText('Testnet values. Not financial advice.', 64, 630);
  const site = 'wheel-house.pages.dev'; ctx.fillText(site, W - 64 - ctx.measureText(site).width, 630);

  // sheen
  const pos = ((t * 0.35) % 1.6) - 0.3; const g = ctx.createLinearGradient(W * pos - 200, 0, W * pos + 200, H);
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, dark ? 'rgba(255,255,255,.05)' : 'rgba(255,255,255,.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.restore();
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

// Opens the card in `host`. Desktop with WebGL gets a gently tilting 3D card (three.js, shared with the hero);
// phones or no WebGL get the flat card. Returns controls; stop() frees the loop and the GL context.
export async function mountCard(host, data, { dark = false, reducedMotion = false, wide = true, loadStage } = {}) {
  const source = document.createElement('canvas'); source.width = CARD_W; source.height = CARD_H;
  const ctx = source.getContext('2d'); drawCard(ctx, data, { dark, t: 0 });
  let stage = null;
  if (wide && loadStage && webglAvailable()) { try { stage = (await loadStage())(source, { width: CARD_W, height: CARD_H, dark }); } catch { stage = null; } }
  const shown = stage ? stage.canvas : source; shown.classList.add('share-canvas'); shown.setAttribute('aria-label', 'Holder share card preview'); shown.setAttribute('role', 'img');
  host.replaceChildren(shown);
  const draw = t => { drawCard(ctx, data, { dark, t }); stage?.frame(t); };
  draw(0);
  let raf = 0, alive = true, recording = false; const start = performance.now();
  const loop = now => { if (!alive) return; if (!recording) draw((now - start) / 1000); raf = requestAnimationFrame(loop); };
  if (!reducedMotion) raf = requestAnimationFrame(loop);
  return {
    mode: stage ? '3d' : '2d',
    png: () => new Promise((resolve, reject) => { draw(0); shown.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not make the picture.')), 'image/png'); }),
    video: async seconds => { recording = true; try { return await recordCanvas(shown, draw, { seconds }); } finally { recording = false; } },
    stop: () => { alive = false; cancelAnimationFrame(raf); stage?.dispose(); host.replaceChildren(); },
  };
}

export function download(blob, name, doc = document) {
  const url = URL.createObjectURL(blob), a = doc.createElement('a');
  a.href = url; a.download = name; doc.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
