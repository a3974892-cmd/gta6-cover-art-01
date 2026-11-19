// Palm Sunset Cover Studio — cover drawing engine.
// Draws GTA-poster-style covers on a 2D canvas: multi-panel layouts, colour
// grades, a procedurally drawn Vice City sunset skyline, and bold lettering.
// Everything is drawn in code; no network, no external assets.

export const LAYOUTS = [
  { id: 'grid4', name: 'Four Panel Grid', panels: 4 },
  { id: 'hero3', name: 'Hero + Three', panels: 4 },
  { id: 'grid9', name: 'Nine Panel Grid', panels: 9 },
  { id: 'fullbleed', name: 'Full Bleed', panels: 1 },
  { id: 'tilted', name: 'Tilted Snapshots', panels: 3 },
];

export const GRADES = [
  { id: 'sunset', name: 'Vice Sunset' },
  { id: 'neon', name: 'Neon Night' },
  { id: 'duotone', name: 'Pink / Teal Duotone' },
  { id: 'noir', name: 'Noir' },
  { id: 'halftone', name: 'Halftone Print' },
  { id: 'gold', name: 'Palm Gold' },
];

export const SIZES = [
  { id: 'square', name: 'Square 1080 x 1080', w: 1080, h: 1080 },
  { id: 'portrait', name: 'Portrait 1080 x 1350', w: 1080, h: 1350 },
  { id: 'wide', name: 'Wide 1920 x 1080', w: 1920, h: 1080 },
];

/** Small deterministic pseudo-random generator so the skyline is stable. */
function seededRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Panel rectangles (in pixels) for a layout at W x H. Each has x, y, w, h, rot. */
export function layoutPanels(layout, W, H) {
  const m = Math.round(Math.min(W, H) * 0.022);
  const g = Math.round(Math.min(W, H) * 0.016);
  if (layout === 'grid4') {
    const cw = (W - 2 * m - g) / 2;
    const ch = (H - 2 * m - g) / 2;
    return [
      { x: m, y: m, w: cw, h: ch, rot: 0 },
      { x: m + cw + g, y: m, w: cw, h: ch, rot: 0 },
      { x: m, y: m + ch + g, w: cw, h: ch, rot: 0 },
      { x: m + cw + g, y: m + ch + g, w: cw, h: ch, rot: 0 },
    ];
  }
  if (layout === 'hero3') {
    const heroW = (W - 2 * m - g) * 0.62;
    const sideX = m + heroW + g;
    const sideW = W - m - sideX;
    const ch = (H - 2 * m - 2 * g) / 3;
    return [
      { x: m, y: m, w: heroW, h: H - 2 * m, rot: 0 },
      { x: sideX, y: m, w: sideW, h: ch, rot: 0 },
      { x: sideX, y: m + ch + g, w: sideW, h: ch, rot: 0 },
      { x: sideX, y: m + 2 * (ch + g), w: sideW, h: ch, rot: 0 },
    ];
  }
  if (layout === 'grid9') {
    const cw = (W - 2 * m - 2 * g) / 3;
    const ch = (H - 2 * m - 2 * g) / 3;
    const out = [];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        out.push({ x: m + c * (cw + g), y: m + r * (ch + g), w: cw, h: ch, rot: 0 });
      }
    }
    return out;
  }
  if (layout === 'tilted') {
    const pw = W * 0.46;
    const ph = H * 0.52;
    return [
      { x: W * 0.05, y: H * 0.05, w: pw, h: ph, rot: -7 },
      { x: W * 0.49, y: H * 0.09, w: pw, h: ph, rot: 4 },
      { x: W * 0.27, y: H * 0.40, w: pw, h: ph, rot: -2 },
    ];
  }
  return [{ x: 0, y: 0, w: W, h: H, rot: 0 }]; // fullbleed
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function rampColor(stops, t) {
  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, c0] = stops[i];
    const [t1, c1] = stops[i + 1];
    if (t >= t0 && t <= t1) {
      const k = t1 === t0 ? 0 : (t - t0) / (t1 - t0);
      return [lerp(c0[0], c1[0], k), lerp(c0[1], c1[1], k), lerp(c0[2], c1[2], k)];
    }
  }
  const last = stops[stops.length - 1][1];
  return [last[0], last[1], last[2]];
}

// Gradient-map stops per grade: [position, [r, g, b]] from shadows to highlights.
const GRADE_RAMPS = {
  sunset: [[0, [26, 8, 46]], [0.35, [122, 28, 84]], [0.65, [255, 110, 60]], [1, [255, 214, 110]]],
  neon: [[0, [6, 8, 40]], [0.35, [24, 24, 96]], [0.65, [190, 40, 160]], [1, [120, 240, 255]]],
  duotone: [[0, [12, 40, 48]], [0.5, [20, 130, 140]], [1, [255, 110, 180]]],
  noir: [[0, [0, 0, 0]], [0.5, [110, 110, 110]], [1, [255, 255, 255]]],
  halftone: [[0, [10, 6, 28]], [0.5, [120, 120, 130]], [1, [255, 244, 230]]],
  gold: [[0, [30, 16, 4]], [0.4, [140, 82, 20]], [0.7, [240, 170, 60]], [1, [255, 236, 170]]],
};

const GRADE_STRENGTH = { sunset: 0.55, neon: 0.6, duotone: 0.85, noir: 1, halftone: 0.35, gold: 0.55 };

/** Applies a grade's gradient map in place on ImageData. */
function applyGradePixels(data, gradeId) {
  const stops = GRADE_RAMPS[gradeId] ?? GRADE_RAMPS.sunset;
  const strength = GRADE_STRENGTH[gradeId] ?? 0.5;
  const contrast = gradeId === 'noir' ? 1.25 : gradeId === 'neon' ? 1.12 : 1.06;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    let luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    luma = Math.min(1, Math.max(0, (luma - 0.5) * contrast + 0.5));
    const [mr, mg, mb] = rampColor(stops, luma);
    data[i] = r + (mr - r) * strength;
    data[i + 1] = g + (mg - g) * strength;
    data[i + 2] = b + (mb - b) * strength;
  }
}

/** Turns a graded panel into a halftone dot print. */
function halftonePanel(ctx, w, h) {
  const src = ctx.getImageData(0, 0, w, h);
  const step = Math.max(5, Math.round(w / 90));
  ctx.fillStyle = '#fff3e2';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#160a2e';
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const idx = (y * w + x) * 4;
      const luma = (src.data[idx] + src.data[idx + 1] + src.data[idx + 2]) / 3 / 255;
      const radius = (1 - luma) * step * 0.72;
      if (radius < 0.4) continue;
      ctx.beginPath();
      ctx.arc(x + step / 2, y + step / 2, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

let noisePattern = null;
function grainCanvas() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(128, 128);
  const rnd = seededRandom(20261119);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.floor(rnd() * 255);
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Draws one palm silhouette at (x, y) with height h, leaning by lean (-1..1). */
function drawPalm(ctx, x, y, h, lean) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = '#12061f';
  ctx.fillStyle = '#12061f';
  ctx.lineWidth = Math.max(3, h * 0.045);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(lean * h * 0.25, -h * 0.55, lean * h * 0.45, -h);
  ctx.stroke();
  const topX = lean * h * 0.45;
  const topY = -h;
  ctx.translate(topX, topY);
  for (let i = 0; i < 7; i++) {
    const angle = -Math.PI * 0.95 + (i * Math.PI * 0.9) / 6;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(
      Math.cos(angle) * h * 0.28,
      Math.sin(angle) * h * 0.28 + h * 0.08,
      Math.cos(angle) * h * 0.5,
      Math.sin(angle) * h * 0.5 + h * 0.3,
    );
    ctx.lineWidth = Math.max(2, h * 0.03);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Draws the built-in Vice City sunset skyline scene onto a fresh canvas and
 * returns it, so it can be used as a photo source without any image file.
 */
export function drawSkylineScene(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(2, Math.round(w));
  c.height = Math.max(2, Math.round(h));
  const ctx = c.getContext('2d');
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#1d0b38');
  sky.addColorStop(0.35, '#7b1e5e');
  sky.addColorStop(0.62, '#ff5e62');
  sky.addColorStop(0.8, '#ffb347');
  sky.addColorStop(1, '#ffd76b');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  // Sun with glow.
  const sunX = w * 0.66;
  const sunY = h * 0.46;
  const sunR = w * 0.11;
  const glow = ctx.createRadialGradient(sunX, sunY, sunR * 0.2, sunX, sunY, sunR * 3.2);
  glow.addColorStop(0, 'rgba(255, 220, 120, 0.85)');
  glow.addColorStop(1, 'rgba(255, 120, 80, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#ffe9a3';
  ctx.beginPath();
  ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
  ctx.fill();
  // Sun stripes (retro slats).
  ctx.fillStyle = 'rgba(255, 94, 98, 0.55)';
  for (let i = 0; i < 3; i++) {
    const sy = sunY + sunR * (0.15 + i * 0.3);
    ctx.fillRect(sunX - sunR, sy, sunR * 2, sunR * 0.07);
  }
  const rnd = seededRandom(777);
  const horizon = h * 0.72;
  // Far skyline.
  ctx.fillStyle = '#3a1550';
  let bx = 0;
  while (bx < w) {
    const bw = w * (0.05 + rnd() * 0.07);
    const bh = h * (0.08 + rnd() * 0.16);
    ctx.fillRect(bx, horizon - bh, bw, bh);
    bx += bw + w * 0.008;
  }
  // Near skyline with lit windows.
  ctx.fillStyle = '#170826';
  bx = -w * 0.02;
  while (bx < w) {
    const bw = w * (0.07 + rnd() * 0.09);
    const bh = h * (0.14 + rnd() * 0.2);
    ctx.fillRect(bx, horizon - bh, bw, bh);
    ctx.fillStyle = '#ffd76b';
    for (let wy = horizon - bh + h * 0.02; wy < horizon - h * 0.02; wy += h * 0.035) {
      for (let wx = bx + w * 0.015; wx < bx + bw - w * 0.01; wx += w * 0.025) {
        if (rnd() < 0.28) ctx.fillRect(wx, wy, Math.max(2, w * 0.008), Math.max(2, h * 0.012));
      }
    }
    ctx.fillStyle = '#170826';
    bx += bw + w * 0.01;
  }
  // Water with sun reflection.
  const water = ctx.createLinearGradient(0, horizon, 0, h);
  water.addColorStop(0, '#ff9a5c');
  water.addColorStop(0.4, '#7b1e5e');
  water.addColorStop(1, '#1d0b38');
  ctx.fillStyle = water;
  ctx.fillRect(0, horizon, w, h - horizon);
  ctx.fillStyle = 'rgba(255, 220, 140, 0.5)';
  for (let i = 0; i < 26; i++) {
    const ry = horizon + ((h - horizon) * (i + rnd() * 0.6)) / 26;
    const rw = w * (0.05 + rnd() * 0.22) * (1 - ((ry - horizon) / (h - horizon)) * 0.4);
    ctx.fillRect(sunX - rw / 2 + (rnd() - 0.5) * w * 0.05, ry, rw, Math.max(1.5, h * 0.006));
  }
  // Palms in front.
  drawPalm(ctx, w * 0.08, horizon + h * 0.02, h * 0.34, 0.35);
  drawPalm(ctx, w * 0.93, horizon + h * 0.03, h * 0.4, -0.3);
  drawPalm(ctx, w * 0.2, h * 0.99, h * 0.22, 0.2);
  // Birds.
  ctx.strokeStyle = 'rgba(20, 6, 32, 0.8)';
  ctx.lineWidth = Math.max(1.5, w * 0.002);
  for (let i = 0; i < 5; i++) {
    const px = w * (0.2 + rnd() * 0.5);
    const py = h * (0.12 + rnd() * 0.2);
    const s = w * 0.012;
    ctx.beginPath();
    ctx.moveTo(px - s, py);
    ctx.quadraticCurveTo(px - s / 2, py - s * 0.7, px, py);
    ctx.quadraticCurveTo(px + s / 2, py - s * 0.7, px + s, py);
    ctx.stroke();
  }
  return c;
}

/** Draws one photo into a panel rect with pan/zoom/rotate, then grades it. */
function drawPanel(ctx, img, rect, tr, gradeId) {
  const w = Math.max(2, Math.round(rect.w));
  const h = Math.max(2, Math.round(rect.h));
  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  const o = off.getContext('2d');
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const base = Math.max(w / iw, h / ih);
  const scale = base * (tr.zoom || 1);
  o.save();
  o.translate(w / 2 + (tr.ox || 0) * w, h / 2 + (tr.oy || 0) * h);
  o.rotate(((tr.rot || 0) * Math.PI) / 180);
  o.drawImage(img, (-iw * scale) / 2, (-ih * scale) / 2, iw * scale, ih * scale);
  o.restore();
  const imgData = o.getImageData(0, 0, w, h);
  applyGradePixels(imgData.data, gradeId);
  o.putImageData(imgData, 0, 0);
  if (gradeId === 'halftone') halftonePanel(o, w, h);
  // Paste the graded panel back, honouring the layout rotation.
  ctx.save();
  ctx.translate(rect.x + rect.w / 2, rect.y + rect.h / 2);
  ctx.rotate(((rect.rot || 0) * Math.PI) / 180);
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = Math.max(6, w * 0.03);
  ctx.shadowOffsetY = Math.max(3, h * 0.01);
  ctx.drawImage(off, -w / 2, -h / 2, w, h);
  ctx.restore();
  // White poster border.
  ctx.save();
  ctx.translate(rect.x + rect.w / 2, rect.y + rect.h / 2);
  ctx.rotate(((rect.rot || 0) * Math.PI) / 180);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(2, Math.min(rect.w, rect.h) * 0.014);
  ctx.strokeRect(-w / 2, -h / 2, w, h);
  ctx.restore();
}

/** Fits the title across the cover and draws it with a sunset gradient fill. */
function drawCaption(ctx, W, H, opts) {
  const title = (opts.title || '').trim().toUpperCase();
  const subtitle = (opts.subtitle || '').trim();
  const pos = opts.captionPos === 'top' ? 'top' : 'bottom';
  if (!title && !subtitle) return;
  const bandH = H * 0.22;
  const bandY = pos === 'top' ? 0 : H - bandH;
  const scrim = ctx.createLinearGradient(0, bandY, 0, bandY + bandH);
  if (pos === 'top') {
    scrim.addColorStop(0, 'rgba(10, 2, 24, 0.72)');
    scrim.addColorStop(1, 'rgba(10, 2, 24, 0)');
  } else {
    scrim.addColorStop(0, 'rgba(10, 2, 24, 0)');
    scrim.addColorStop(1, 'rgba(10, 2, 24, 0.78)');
  }
  ctx.fillStyle = scrim;
  ctx.fillRect(0, bandY, W, bandH);
  const cx = W / 2;
  if (title) {
    let size = W * (opts.titleSize ?? 0.11);
    ctx.font = `${size}px Anton, 'Arial Narrow', sans-serif`;
    while (ctx.measureText(title).width > W * 0.92 && size > 14) {
      size -= 2;
      ctx.font = `${size}px Anton, 'Arial Narrow', sans-serif`;
    }
    const grad = ctx.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0, '#ffe259');
    grad.addColorStop(0.45, '#ff7e5f');
    grad.addColorStop(1, '#ff2e88');
    const ty = pos === 'top' ? bandY + size * 1.05 : H - H * 0.055 - (subtitle ? size * 0.42 : 0);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = size * 0.12;
    ctx.shadowOffsetY = size * 0.04;
    ctx.strokeStyle = '#12061f';
    ctx.lineWidth = Math.max(2, size * 0.09);
    ctx.strokeText(title, cx, ty);
    ctx.fillStyle = grad;
    ctx.fillText(title, cx, ty);
    ctx.restore();
    if (subtitle) {
      const subSize = Math.max(14, size * 0.34);
      const sy = pos === 'top' ? ty + subSize * 1.25 : H - H * 0.028;
      ctx.save();
      ctx.translate(cx, sy);
      ctx.rotate(-0.03);
      ctx.font = `${subSize}px Pacifico, cursive`;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffe9a3';
      ctx.shadowColor = 'rgba(255, 46, 136, 0.8)';
      ctx.shadowBlur = subSize * 0.35;
      ctx.fillText(subtitle, 0, 0);
      ctx.restore();
    }
  } else if (subtitle) {
    const subSize = Math.max(16, W * 0.045);
    const sy = pos === 'top' ? bandY + subSize * 1.4 : H - H * 0.05;
    ctx.save();
    ctx.translate(cx, sy);
    ctx.rotate(-0.03);
    ctx.font = `${subSize}px Pacifico, cursive`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffe9a3';
    ctx.shadowColor = 'rgba(255, 46, 136, 0.8)';
    ctx.shadowBlur = subSize * 0.35;
    ctx.fillText(subtitle, 0, 0);
    ctx.restore();
  }
}

/**
 * Draws the whole cover. opts: { layout, grade, title, subtitle, titleSize,
 * captionPos, panels: [{ img, zoom, ox, oy, rot }] }. Returns the panel rects
 * (in cover pixels) so the editor can hit-test them.
 */
export function drawCover(ctx, W, H, opts) {
  const layout = opts.layout || 'grid4';
  const gradeId = opts.grade || 'sunset';
  // Backdrop.
  if (layout === 'tilted') {
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#2b1055');
    bg.addColorStop(0.55, '#c22a6d');
    bg.addColorStop(1, '#ff8c42');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    const scene = drawSkylineScene(W, H);
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.drawImage(scene, 0, 0, W, H);
    ctx.restore();
  } else {
    ctx.fillStyle = '#160a24';
    ctx.fillRect(0, 0, W, H);
  }
  const rects = layoutPanels(layout, W, H);
  const panels = opts.panels || [];
  rects.forEach((rect, i) => {
    const p = panels[i];
    if (p && p.img) drawPanel(ctx, p.img, rect, p, gradeId);
    else {
      ctx.fillStyle = '#2a1245';
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 8]);
      ctx.strokeRect(rect.x + 6, rect.y + 6, rect.w - 12, rect.h - 12);
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      ctx.font = `${Math.max(13, Math.min(rect.w, rect.h) * 0.07)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('Drop a photo here', rect.x + rect.w / 2, rect.y + rect.h / 2);
    }
  });
  drawCaption(ctx, W, H, opts);
  // Grain + vignette over everything.
  if (!noisePattern) noisePattern = ctx.createPattern(grainCanvas(), 'repeat');
  ctx.save();
  ctx.globalAlpha = 0.07;
  ctx.fillStyle = noisePattern;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
  const vig = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.75);
  vig.addColorStop(0, 'rgba(8, 0, 18, 0)');
  vig.addColorStop(1, 'rgba(8, 0, 18, 0.38)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);
  return rects;
}
