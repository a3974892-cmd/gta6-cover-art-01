// Palm Sunset Cover Studio — editor wiring.
// Photo tray + layouts + grades + caption + per-panel pan/zoom/rotate,
// live preview, undo/redo, and PNG export at 1080x1080, 1080x1350, 1920x1080.
// Photos are read on the user's own machine and never uploaded.
import { drawCover, drawSkylineScene, LAYOUTS, GRADES, SIZES } from './cover.js';
import { runShot } from './shots.js';

const canvas = document.getElementById('preview');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');

const SAMPLES = [
  { id: 'pier', label: 'Pier Sunset', url: 'samples/pier.jpg' },
  { id: 'boulevard', label: 'Boulevard', url: 'samples/boulevard.jpg' },
  { id: 'skyline', label: 'Vice Skyline', url: null },
];

const photos = new Map(); // id -> { img, label }
let uploadCount = 0;
let skylineCache = null;

function getSkyline() {
  if (!skylineCache) skylineCache = drawSkylineScene(1080, 1080);
  return skylineCache;
}

function blankPanels() {
  return Array.from({ length: 9 }, () => ({ photoId: null, zoom: 1, ox: 0, oy: 0, rot: 0 }));
}

const state = {
  layout: 'grid4',
  grade: 'sunset',
  size: 'square',
  title: 'Sunset Heist',
  subtitle: 'Vice City Nights',
  titleSize: 0.11,
  captionPos: 'bottom',
  panels: blankPanels(),
  selected: 0,
};

function defaultAssignment() {
  const picks = ['pier', 'boulevard', 'skyline', 'pier', 'boulevard', 'skyline', 'pier', 'boulevard', 'skyline'];
  state.panels.forEach((p, i) => { p.photoId = picks[i]; });
}

let undoStack = [];
let redoStack = [];

function snapshot() {
  return JSON.stringify({
    layout: state.layout,
    grade: state.grade,
    size: state.size,
    title: state.title,
    subtitle: state.subtitle,
    titleSize: state.titleSize,
    captionPos: state.captionPos,
    panels: state.panels,
    selected: state.selected,
  });
}

function pushUndo() {
  undoStack.push(snapshot());
  if (undoStack.length > 60) undoStack.shift();
  redoStack = [];
  updateUndoButtons();
}

function restore(json) {
  const s = JSON.parse(json);
  Object.assign(state, s);
  syncControls();
  redraw();
}

function updateUndoButtons() {
  document.getElementById('undo').disabled = undoStack.length === 0;
  document.getElementById('redo').disabled = redoStack.length === 0;
}

/** Loads an image from a URL, resolving once it can be drawn. */
export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('could not load ' + url));
    img.src = url;
  });
}

async function ensureSamples() {
  for (const s of SAMPLES) {
    if (photos.has(s.id)) continue;
    if (s.id === 'skyline') photos.set(s.id, { img: getSkyline(), label: s.label });
    else photos.set(s.id, { img: await loadImage(s.url), label: s.label });
  }
}

function currentSize() {
  return SIZES.find((s) => s.id === state.size) ?? SIZES[0];
}

let lastRects = [];
function redraw() {
  const size = currentSize();
  const scale = Math.min(880 / size.w, 640 / size.h);
  canvas.width = Math.round(size.w * scale);
  canvas.height = Math.round(size.h * scale);
  const panels = state.panels.map((p) => ({
    img: p.photoId ? photos.get(p.photoId)?.img ?? null : null,
    zoom: p.zoom,
    ox: p.ox,
    oy: p.oy,
    rot: p.rot,
  }));
  lastRects = drawCover(ctx, canvas.width, canvas.height, {
    layout: state.layout,
    grade: state.grade,
    title: state.title,
    subtitle: state.subtitle,
    titleSize: state.titleSize,
    captionPos: state.captionPos,
    panels,
  });
  // Outline the selected panel.
  const rect = lastRects[state.selected];
  if (rect) {
    ctx.save();
    ctx.translate(rect.x + rect.w / 2, rect.y + rect.h / 2);
    ctx.rotate(((rect.rot || 0) * Math.PI) / 180);
    ctx.strokeStyle = '#ffe259';
    ctx.lineWidth = 3;
    ctx.setLineDash([12, 8]);
    ctx.strokeRect(-rect.w / 2 - 4, -rect.h / 2 - 4, rect.w + 8, rect.h + 8);
    ctx.restore();
  }
}

function setStatus(text) {
  statusEl.textContent = text;
}

/** Renders the cover at full export size and returns a PNG data URL. */
export async function exportCover(sizeId) {
  const size = SIZES.find((s) => s.id === sizeId) ?? SIZES[0];
  const off = document.createElement('canvas');
  off.width = size.w;
  off.height = size.h;
  const octx = off.getContext('2d');
  const panels = state.panels.map((p) => ({
    img: p.photoId ? photos.get(p.photoId)?.img ?? null : null,
    zoom: p.zoom,
    ox: p.ox,
    oy: p.oy,
    rot: p.rot,
  }));
  drawCover(octx, size.w, size.h, {
    layout: state.layout,
    grade: state.grade,
    title: state.title,
    subtitle: state.subtitle,
    titleSize: state.titleSize,
    captionPos: state.captionPos,
    panels,
  });
  return new Promise((resolve) => off.toBlob((b) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(b);
  }, 'image/png'));
}

function download(url, name) {
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
}

async function exportOne(sizeId) {
  const size = SIZES.find((s) => s.id === sizeId) ?? SIZES[0];
  setStatus(`Exporting ${size.w} x ${size.h}…`);
  const url = await exportCover(sizeId);
  download(url, `palm-sunset-cover-${size.w}x${size.h}.png`);
  setStatus(`Saved palm-sunset-cover-${size.w}x${size.h}.png`);
}

async function exportAll() {
  for (const s of SIZES) await exportOne(s.id);
}

// ---- Controls ----

function buildButtons(containerId, items, current, onPick) {
  const box = document.getElementById(containerId);
  box.innerHTML = '';
  for (const item of items) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip' + (item.id === current ? ' active' : '');
    b.textContent = item.name;
    b.addEventListener('click', () => {
      pushUndo();
      onPick(item.id);
      buildButtons(containerId, items, item.id, onPick);
      redraw();
    });
    box.appendChild(b);
  }
}

function refreshChips() {
  buildButtons('layoutRow', LAYOUTS, state.layout, (id) => { state.layout = id; });
  buildButtons('gradeRow', GRADES, state.grade, (id) => { state.grade = id; });
  buildButtons('sizeRow', SIZES, state.size, (id) => { state.size = id; });
}

function buildTray() {
  const tray = document.getElementById('tray');
  tray.innerHTML = '';
  for (const [id, photo] of photos) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tray-item';
    const thumb = document.createElement('canvas');
    thumb.width = 96;
    thumb.height = 96;
    const tctx = thumb.getContext('2d');
    const iw = photo.img.naturalWidth || photo.img.width;
    const ih = photo.img.naturalHeight || photo.img.height;
    const sc = Math.max(96 / iw, 96 / ih);
    tctx.drawImage(photo.img, (96 - iw * sc) / 2, (96 - ih * sc) / 2, iw * sc, ih * sc);
    b.appendChild(thumb);
    const label = document.createElement('span');
    label.textContent = photo.label;
    b.appendChild(label);
    b.addEventListener('click', () => assignPhoto(id));
    tray.appendChild(b);
  }
}

function assignPhoto(photoId) {
  pushUndo();
  state.panels[state.selected].photoId = photoId;
  redraw();
  setStatus(`Panel ${state.selected + 1} uses ${photos.get(photoId)?.label ?? photoId}.`);
}

function syncControls() {
  document.getElementById('title').value = state.title;
  document.getElementById('subtitle').value = state.subtitle;
  document.getElementById('titleSize').value = String(Math.round(state.titleSize * 100));
  document.getElementById('captionPos').value = state.captionPos;
  const p = state.panels[state.selected];
  document.getElementById('zoom').value = String(p.zoom);
  document.getElementById('rotate').value = String(p.rot);
  document.getElementById('panelLabel').textContent = `Panel ${state.selected + 1}`;
  refreshChips();
}

function bindControls() {
  document.getElementById('title').addEventListener('input', (e) => { state.title = e.target.value; redraw(); });
  document.getElementById('subtitle').addEventListener('input', (e) => { state.subtitle = e.target.value; redraw(); });
  document.getElementById('titleSize').addEventListener('input', (e) => {
    state.titleSize = Number(e.target.value) / 100;
    redraw();
  });
  document.getElementById('captionPos').addEventListener('change', (e) => {
    pushUndo();
    state.captionPos = e.target.value;
    redraw();
  });
  document.getElementById('zoom').addEventListener('input', (e) => {
    state.panels[state.selected].zoom = Number(e.target.value);
    redraw();
  });
  document.getElementById('zoom').addEventListener('change', pushUndo);
  document.getElementById('rotate').addEventListener('input', (e) => {
    state.panels[state.selected].rot = Number(e.target.value);
    redraw();
  });
  document.getElementById('rotate').addEventListener('change', pushUndo);
  document.getElementById('fillAll').addEventListener('click', () => {
    pushUndo();
    const id = state.panels[state.selected].photoId;
    state.panels.forEach((p) => { p.photoId = id; });
    redraw();
    setStatus('Every panel now uses the selected photo.');
  });
  document.getElementById('clearPanel').addEventListener('click', () => {
    pushUndo();
    state.panels[state.selected] = { photoId: null, zoom: 1, ox: 0, oy: 0, rot: 0 };
    syncControls();
    redraw();
  });
  document.getElementById('undo').addEventListener('click', () => {
    if (!undoStack.length) return;
    redoStack.push(snapshot());
    restore(undoStack.pop());
    updateUndoButtons();
  });
  document.getElementById('redo').addEventListener('click', () => {
    if (!redoStack.length) return;
    undoStack.push(snapshot());
    restore(redoStack.pop());
    updateUndoButtons();
  });
  document.getElementById('exportOne').addEventListener('click', () => exportOne(state.size));
  document.getElementById('exportAll').addEventListener('click', exportAll);
  document.getElementById('useSkyline').addEventListener('click', () => {
    pushUndo();
    state.panels.forEach((p) => { p.photoId = 'skyline'; });
    redraw();
    setStatus('Built-in Vice City sunset skyline loaded — no photo needed.');
  });
  // File picker.
  document.getElementById('photoFile').addEventListener('change', async (e) => {
    for (const file of e.target.files) await addUpload(file);
    e.target.value = '';
  });
  // Drag and drop onto the preview.
  const stage = document.getElementById('stage');
  stage.addEventListener('dragover', (e) => { e.preventDefault(); stage.classList.add('dropping'); });
  stage.addEventListener('dragleave', () => stage.classList.remove('dropping'));
  stage.addEventListener('drop', async (e) => {
    e.preventDefault();
    stage.classList.remove('dropping');
    for (const file of e.dataTransfer.files) {
      if (file.type.startsWith('image/')) await addUpload(file);
    }
  });
  // Click a panel to select it; drag to pan it; wheel to zoom it.
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((e.clientY - rect.top) / rect.height) * canvas.height;
    const hit = hitPanel(x, y);
    if (hit >= 0) {
      pushUndo();
      state.selected = hit;
      syncControls();
      redraw();
      drag = { x, y, ox: state.panels[hit].ox, oy: state.panels[hit].oy };
      canvas.setPointerCapture(e.pointerId);
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((e.clientY - rect.top) / rect.height) * canvas.height;
    const p = state.panels[state.selected];
    const panelRect = lastRects[state.selected];
    if (panelRect) {
      p.ox = Math.max(-0.5, Math.min(0.5, drag.ox + (x - drag.x) / panelRect.w));
      p.oy = Math.max(-0.5, Math.min(0.5, drag.oy + (y - drag.y) / panelRect.h));
    }
    redraw();
  });
  canvas.addEventListener('pointerup', () => { drag = null; });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const p = state.panels[state.selected];
    p.zoom = Math.max(1, Math.min(3, p.zoom * (e.deltaY < 0 ? 1.08 : 0.92)));
    document.getElementById('zoom').value = String(p.zoom);
    redraw();
  }, { passive: false });
}

/** Returns the panel index under (x, y) in preview pixels, or -1. */
function hitPanel(x, y) {
  for (let i = lastRects.length - 1; i >= 0; i--) {
    const r = lastRects[i];
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    const angle = -((r.rot || 0) * Math.PI) / 180;
    const dx = x - cx;
    const dy = y - cy;
    const lx = dx * Math.cos(angle) - dy * Math.sin(angle);
    const ly = dx * Math.sin(angle) + dy * Math.cos(angle);
    if (Math.abs(lx) <= r.w / 2 && Math.abs(ly) <= r.h / 2) return i;
  }
  return -1;
}

async function addUpload(file) {
  const img = await loadImage(URL.createObjectURL(file));
  uploadCount += 1;
  const id = `upload${uploadCount}`;
  photos.set(id, { img, label: file.name.slice(0, 18) || 'Your photo' });
  buildTray();
  assignPhoto(id);
  setStatus(`Loaded ${file.name} — kept on this machine, never uploaded.`);
}

// Test / screenshot hooks.
window.__app = {
  state,
  photos,
  redraw,
  exportCover,
  assignPhoto,
  ensureSamples,
  setLayout: (id) => { state.layout = id; refreshChips(); redraw(); },
  setGrade: (id) => { state.grade = id; refreshChips(); redraw(); },
  setSize: (id) => { state.size = id; refreshChips(); redraw(); },
  setTitle: (t) => { state.title = t; syncControls(); redraw(); },
  setSubtitle: (t) => { state.subtitle = t; syncControls(); redraw(); },
  selectPanel: (i) => { state.selected = i; syncControls(); redraw(); },
  exportAllDataUrls: async () => {
    const out = {};
    for (const s of SIZES) out[s.id] = await exportCover(s.id);
    return out;
  },
};

async function init() {
  bindControls();
  defaultAssignment();
  await ensureSamples();
  buildTray();
  syncControls();
  updateUndoButtons();
  // Wait for the bundled fonts so the first paint already uses them.
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load('16px Anton'),
        document.fonts.load('16px Pacifico'),
      ]),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);
  } catch { /* fall back to the system stack */ }
  redraw();
  const shot = new URLSearchParams(location.search).get('shot');
  if (shot) {
    await runShot(shot, new URLSearchParams(location.search), window.__app);
    redraw();
  }
  window.__shotReady = true;
}

init();
