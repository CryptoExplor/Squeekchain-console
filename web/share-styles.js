// Extra share card styles: "Night scene" and "Classic". Same data and Show on card switches as the flip card.
// Display only, like share-card.js: they draw values already on screen and never touch a wallet or the chain.
import { CARD_W, CARD_H, levelColor, orbList } from './share-card.js';
const BRAND = { yellow: '#FCBE46', blue: '#597AF7', night: '#0A0A0C' };
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
function fit(ctx, text, max, size, weight = 700) { return fitFont(ctx, text, max, size, weight, MONO); }

// ---- Night scene ----
// Flat (no WebGL) version of the scene: night stage, glowing rail, glossy orbs, the wheel. Phones use this.
function drawBackdrop(ctx, data, t = 0) {
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
  const orbs = orbList(data.orbLevels ?? data.levels); const P = (u) => { const a = [-40, 330], b = [260, 400], c = [520, 250], d = [860, 420], m = 1 - u; return [m*m*m*a[0] + 3*m*m*u*b[0] + 3*m*u*u*c[0] + u*u*u*d[0], m*m*m*a[1] + 3*m*m*u*b[1] + 3*m*u*u*c[1] + u*u*u*d[1]]; };
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
function drawOverlay(ctx, data) {
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
  if (data.meta !== false) {
    ctx.font = `600 20px ${MONO}`; const chip = `${data.network.toUpperCase()} · ${data.date}`; const cw = ctx.measureText(chip).width + 32;
    roundRect(ctx, W - 56 - cw, 48, cw, 42, 21); ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.fillText(chip, W - 56 - cw + 16, 76);
  }

  // title: address, like "Checkpoint example"
  const title = data.address || 'A Squeek holder';
  ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.font = `600 22px ${COND}`; ctx.fillText(data.address ? 'SQUEEK HOLDER CHECKPOINT' : 'SQUEEK HOLDER', 72, 452);
  ctx.fillStyle = '#FFFFFF'; fitFont(ctx, title, 640, 68, 700, SANS); ctx.fillText(title, 70, 520);

  // Fixed metric cells prevent long numbers or five selected fields from spilling into each other.
  const stats = data.stats, gap = 18, left = 72, room = W - 144;
  const cell = stats.length ? (room - gap * (stats.length - 1)) / stats.length : room;
  stats.forEach(([value, name], i) => {
    const x = left + i * (cell + gap);
    ctx.fillStyle = '#FFFFFF'; fitFont(ctx,value,cell,42,600,COND); ctx.fillText(value,x,565,cell);
    ctx.fillStyle = 'rgba(255,255,255,.6)'; fitFont(ctx,name,cell,19,500,COND); ctx.fillText(name,x,590,cell);
  });
  // Level summary occupies its own row; hidden levels also remove level-derived scene orbs.
  ctx.font = `600 18px ${COND}`; let x = left;
  for(let i=0;i<data.levels.length;i++) {
    const {level,count}=data.levels[i], text=`L${level} × ${count}`, width=ctx.measureText(text).width+32;
    if(x+width+(i<data.levels.length-1?60:0)>W-72){ctx.fillStyle='#FFFFFF';ctx.fillText(`+${data.levels.length-i} levels`,x,620,W-72-x);break;}
    ctx.fillStyle=levelColor(level);ctx.beginPath();ctx.arc(x+5,614,5,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='rgba(255,255,255,.75)';ctx.fillText(text,x+17,620);x+=width;
  }
  const illustrated = orbList(data.orbLevels ?? data.levels).length;
  const total = (data.orbLevels ?? data.levels).reduce((sum,item)=>sum+item.count,0);
  if(illustrated && total>illustrated){ctx.font=`500 14px ${MONO}`;ctx.fillStyle='rgba(255,255,255,.5)';ctx.textAlign='right';ctx.fillText(`Showing ${illustrated} of ${total} Squeeks`,W-72,434);ctx.textAlign='start';}
  ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.font = `500 16px ${MONO}`;
  ctx.fillText(data.network === 'Mainnet' ? 'Not financial advice' : 'Testnet values · not financial advice', 72, 640);
  const site = 'wheel-house.pages.dev'; ctx.fillText(site, W - 56 - ctx.measureText(site).width, 640);
}

export function drawNight(ctx, data, { t = 0, scene = null } = {}) {
  ctx.save(); ctx.clearRect(0, 0, CARD_W, CARD_H);
  if (scene) ctx.drawImage(scene, 0, 0, CARD_W, CARD_H); else drawBackdrop(ctx, data, t);
  drawOverlay(ctx, data); ctx.restore();
}

// ---- Classic (light or dark, follows the app theme) ----
export function drawClassic(ctx, data, { dark = false, t = 0 } = {}) {
  const W = CARD_W, H = CARD_H, ink = dark ? '#F6F3EA' : BRAND.night, muted = dark ? '#A7A39A' : '#5D5A52';
  const panel = dark ? '#16171C' : '#FFFFFF', line = dark ? '#2A2C33' : '#E8E1D0';
  ctx.save(); ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = dark ? BRAND.night : '#FFF8EA'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = dark ? 'rgba(255,255,255,.06)' : 'rgba(10,10,12,.07)';
  for (let x = 24; x < W; x += 32) for (let y = 24; y < H; y += 32) { ctx.beginPath(); ctx.arc(x, y, 1.6, 0, Math.PI * 2); ctx.fill(); }

  // header
  ctx.fillStyle = ink; ctx.font = '800 34px ' + MONO; ctx.textBaseline = 'alphabetic';
  ctx.fillText('WHEELHOUSE', 64, 92);
  if (data.meta !== false) { ctx.font = '600 22px ' + MONO; const chip = `${data.network} · ${data.date}`; const chipW = ctx.measureText(chip).width + 36;
  roundRect(ctx, W - 64 - chipW, 58, chipW, 46, 23); ctx.fillStyle = panel; ctx.fill(); ctx.strokeStyle = line; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = muted; ctx.fillText(chip, W - 64 - chipW + 18, 89); }

  // address (with Levels hidden the body moves down so no empty band is left above the footer)
  const dy = data.levels.length ? 0 : 44;
  if (data.address) { ctx.fillStyle = muted; ctx.font = '600 22px ' + MONO; ctx.fillText('SQUEEK HOLDER', 64, 170 + dy); }
  ctx.fillStyle = ink; fit(ctx, data.address || 'A Squeek holder', 640, 64, 800); ctx.fillText(data.address || 'A Squeek holder', 64, 236 + dy);

  // wheel (top right): spokes turn with t
  const cx = 1050, cy = 185 + dy, r = 70, spin = t * 2.4; // sits above the stat boxes (top 300)
  ctx.lineWidth = 10; ctx.strokeStyle = BRAND.blue; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 4; ctx.strokeStyle = BRAND.yellow;
  for (let i = 0; i < 8; i++) { const a = spin + i * Math.PI / 4; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * (r - 6), cy + Math.sin(a) * (r - 6)); ctx.stroke(); }
  ctx.fillStyle = BRAND.yellow; ctx.beginPath(); ctx.arc(cx, cy, 14, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = ink; ctx.beginPath(); ctx.moveTo(cx - 30, cy + r + 24); ctx.lineTo(cx, cy); ctx.lineTo(cx + 30, cy + r + 24); ctx.lineWidth = 6; ctx.strokeStyle = ink; ctx.stroke();

  // stats
  const stats = data.stats.map(([value, label]) => [label.toUpperCase(), value]);
  const gap = 20, boxH = 150, top = 300 + dy * 2, boxW = stats.length ? (W - 128 - gap * (stats.length - 1)) / stats.length : 0;
  stats.forEach(([label, value], i) => {
    const x = 64 + i * (boxW + gap); const accent = i === stats.length - 1 && /SQK/.test(label);
    roundRect(ctx, x, top, boxW, boxH, 20); ctx.fillStyle = accent ? BRAND.yellow : panel; ctx.fill();
    if (!accent) { ctx.strokeStyle = line; ctx.lineWidth = 2; ctx.stroke(); }
    ctx.fillStyle = accent ? BRAND.night : muted; ctx.font = '600 20px ' + MONO; fitFont(ctx, label, boxW - 48, 20, 600, MONO); ctx.fillText(label, x + 24, top + 44, boxW-48);
    ctx.fillStyle = accent ? BRAND.night : ink; fit(ctx, value, boxW - 48, stats.length > 3 ? 44 : 56, 800); ctx.fillText(value, x + 24, top + 116, boxW-48);
  });

  // levels
  if (data.levels.length) { ctx.fillStyle = muted; ctx.font = '600 20px ' + MONO; ctx.fillText('LEVELS', 64, 510);
  let x = 64; ctx.font = '700 24px ' + MONO;
  const chips = data.levels.map(item => `L${item.level} × ${item.count}`);
  for (const text of chips) {
    const w = ctx.measureText(text).width + 32; if (x + w > W - 64) { ctx.fillStyle = muted; ctx.fillText('…', x, 562); break; }
    roundRect(ctx, x, 528, w, 48, 24); ctx.fillStyle = panel; ctx.fill(); ctx.strokeStyle = BRAND.blue; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = ink; ctx.fillText(text, x + 16, 561); x += w + 12;
  } }

  // footer
  ctx.fillStyle = muted; ctx.font = '500 20px ' + MONO;
  ctx.fillText(data.network === 'Mainnet' ? 'Not financial advice.' : 'Testnet values. Not financial advice.', 64, 630);
  const site = 'wheel-house.pages.dev'; ctx.fillText(site, W - 64 - ctx.measureText(site).width, 630);

  // sheen
  const pos = ((t * 0.35) % 1.6) - 0.3; const g = ctx.createLinearGradient(W * pos - 200, 0, W * pos + 200, H);
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, dark ? 'rgba(255,255,255,.05)' : 'rgba(255,255,255,.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

// Classic in motion: the flat card floats as a slab over a plain backdrop. It turns a little left and right,
// nods and bobs, with a light sheen. The PNG still uses the flat drawClassic.
const makeFace = () => { if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(CARD_W, CARD_H); const c = document.createElement('canvas'); c.width = CARD_W; c.height = CARD_H; return c; };
let classicFace = null;
export function drawClassicMoving(ctx, data, { t = 0, dark = true, makeCanvas = makeFace } = {}) {
  const W = CARD_W, H = CARD_H;
  if (!classicFace) classicFace = makeCanvas(W, H);
  const fctx = classicFace.getContext('2d');
  fctx.save(); fctx.clearRect(0, 0, W, H); drawClassic(fctx, data, { t, dark });
  fctx.globalCompositeOperation = 'destination-in'; roundRect(fctx, 0, 0, W, H, 22); fctx.fill(); fctx.globalCompositeOperation = 'source-over';
  roundRect(fctx, 2, 2, W - 4, H - 4, 20); fctx.strokeStyle = dark ? 'rgba(255,255,255,.16)' : 'rgba(10,10,12,.12)'; fctx.lineWidth = 4; fctx.stroke(); fctx.restore();
  ctx.save(); ctx.clearRect(0, 0, W, H);
  const bg = ctx.createRadialGradient(W / 2, H * 0.4, 40, W / 2, H / 2, W * 0.7);
  bg.addColorStop(0, dark ? '#1C1D23' : '#FFFFFF'); bg.addColorStop(1, dark ? '#050506' : '#E9E2D2');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  const s = 0.8, fw = W * s, fh = H * s, cx = W / 2, cy = H / 2 - 6 + Math.sin(t * 1.3) * 7;
  // same motion as the first share card's 3D slab: turn ±0.16 rad, nod ±0.06 rad, small bob
  const yaw = Math.sin(t * 0.9) * 0.16, pitch = Math.sin(t * 0.6) * 0.03, roll = 0, D = 2400, c = Math.cos(yaw), sn = Math.sin(yaw);
  const sh = ctx.createRadialGradient(cx, H - 40, 10, cx, H - 40, fw * 0.55); sh.addColorStop(0, dark ? 'rgba(0,0,0,.6)' : 'rgba(60,45,20,.28)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save(); ctx.scale(1, 0.12); ctx.fillStyle = sh; ctx.beginPath(); ctx.arc(cx, (H - 34) / 0.12, fw * 0.55, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  ctx.translate(cx, cy); ctx.rotate(roll); ctx.translate(-cx, -cy);
  const N = 150, sw = W / N, proj = u => { const xl = (u - 0.5) * fw, k = D / (D + xl * sn); return { x: cx + xl * c * k, k, dy: (u - 0.5) * fw * pitch }; };
  // yellow slab edge on the side turned toward the viewer, like the 3D box's gold sides
  { const a = proj(0), b = proj(1), e = sn * 16, ka = a.k, kb = b.k; ctx.fillStyle = BRAND.yellow; ctx.beginPath();
    ctx.moveTo(a.x - Math.max(0, -e), cy - fh * ka / 2 + a.dy); ctx.lineTo(b.x + Math.max(0, e), cy - fh * kb / 2 + b.dy);
    ctx.lineTo(b.x + Math.max(0, e), cy + fh * kb / 2 + b.dy); ctx.lineTo(a.x - Math.max(0, -e), cy + fh * ka / 2 + a.dy); ctx.closePath(); ctx.fill(); }
  for (let i = 0; i < N; i++) {
    const a = proj(i / N), b = proj((i + 1) / N), k = (a.k + b.k) / 2, hgt = fh * k;
    ctx.drawImage(classicFace, i * sw, 0, sw, H, Math.min(a.x, b.x), cy - hgt / 2 + (a.dy + b.dy) / 2, Math.abs(b.x - a.x) + 0.6, hgt);
  }
  ctx.globalCompositeOperation = dark ? 'lighter' : 'source-over'; const sx = cx + sn * 520, gl = ctx.createLinearGradient(sx - 140, 0, sx + 140, 0);
  gl.addColorStop(0, 'rgba(255,255,255,0)'); gl.addColorStop(0.5, `rgba(255,255,255,${dark ? 0.07 : 0.22})`); gl.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gl; ctx.fillRect(cx - fw / 2, cy - fh / 2 + 24, fw, fh - 48);
  ctx.restore();
}
