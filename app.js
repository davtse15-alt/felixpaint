(() => {
  'use strict';

  const canvas = document.querySelector('#paintCanvas');
  const guide = document.querySelector('#guideCanvas');
  const frame = document.querySelector('#canvasFrame');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const gtx = guide.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;

  const state = {
    tool: 'brush',
    mode: 'solid',
    size: 18,
    solid: '#3478f6',
    spectrum: { h: 217, s: .78, v: .96 },
    stops: ['#ff3b5c', '#ffb224', '#38c86f', '#3478f6', '#a348e2'],
    style: 'smooth',
    repeat: 180,
    symmetry: 'none',
    littleHands: false,
    drawing: false,
    activePointerId: null,
    moved: false,
    start: null,
    last: null,
    distance: 0,
    lineBase: null,
    undo: [],
    redo: [],
    hasDrawn: false
  };

  const presets = [
    { name: 'Rainbow', colors: ['#ff334f', '#ff9f1c', '#ffe038', '#30cf72', '#2d7dff', '#a747e8'] },
    { name: 'Ocean', colors: ['#072b73', '#157bea', '#20d4d8', '#b7fff2'] },
    { name: 'Sunset', colors: ['#682d91', '#e83f78', '#ff7558', '#ffc857'] },
    { name: 'Candy', colors: ['#ff70a6', '#ff9770', '#ffd670', '#70d6ff'] },
    { name: 'Dinosaur', colors: ['#31572c', '#4f772d', '#90a955', '#ecf39e'] },
    { name: 'Space', colors: ['#11133c', '#46207a', '#9348c7', '#ff7cc8'] }
  ];
  const quickColors = ['#111111', '#ffffff', '#ed3349', '#ff8a24', '#ffd43b', '#42bd62', '#19bfc4', '#3478f6', '#684bd9', '#d448c2', '#8b5b3e', '#89909d'];

  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function hexToRgb(hex) {
    const clean = hex.replace('#', '');
    const value = parseInt(clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean, 16);
    return { r: value >> 16, g: (value >> 8) & 255, b: value & 255 };
  }

  function rgbToHex(r, g, b) {
    return `#${[r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
  }

  function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    let h = 0;
    if (delta) {
      if (max === r) h = 60 * (((g - b) / delta) % 6);
      else if (max === g) h = 60 * ((b - r) / delta + 2);
      else h = 60 * ((r - g) / delta + 4);
    }
    if (h < 0) h += 360;
    return { h, s: max === 0 ? 0 : delta / max, v: max };
  }

  function hsvToHex(h, s, v) {
    const chroma = v * s;
    const x = chroma * (1 - Math.abs((h / 60) % 2 - 1));
    const m = v - chroma;
    let rgb;
    if (h < 60) rgb = [chroma, x, 0];
    else if (h < 120) rgb = [x, chroma, 0];
    else if (h < 180) rgb = [0, chroma, x];
    else if (h < 240) rgb = [0, x, chroma];
    else if (h < 300) rgb = [x, 0, chroma];
    else rgb = [chroma, 0, x];
    return rgbToHex((rgb[0] + m) * 255, (rgb[1] + m) * 255, (rgb[2] + m) * 255);
  }

  function mix(a, b, amount) {
    const c1 = hexToRgb(a);
    const c2 = hexToRgb(b);
    return rgbToHex(c1.r + (c2.r - c1.r) * amount, c1.g + (c2.g - c1.g) * amount, c1.b + (c2.b - c1.b) * amount);
  }

  function rainbowAt(t) {
    const hue = ((t * 360) % 360 + 360) % 360;
    const x = 1 - Math.abs((hue / 60) % 2 - 1);
    const [r, g, b] = hue < 60 ? [1, x, 0] : hue < 120 ? [x, 1, 0] : hue < 180 ? [0, 1, x] : hue < 240 ? [0, x, 1] : hue < 300 ? [x, 0, 1] : [1, 0, x];
    return rgbToHex((r * .78 + .12) * 255, (g * .78 + .12) * 255, (b * .78 + .12) * 255);
  }

  function colorAt(distance) {
    if (state.mode === 'solid') return state.solid;
    if (state.mode === 'rainbow') return rainbowAt(distance / state.repeat);
    if (state.stops.length === 1) return state.stops[0];
    let progress = ((distance / state.repeat) % 1 + 1) % 1;
    if (state.style === 'bands') {
      return state.stops[Math.floor(progress * state.stops.length) % state.stops.length];
    }
    const scaled = progress * state.stops.length;
    const index = Math.floor(scaled) % state.stops.length;
    return mix(state.stops[index], state.stops[(index + 1) % state.stops.length], scaled - Math.floor(scaled));
  }

  function pointFromEvent(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: clamp((event.clientX - rect.left) * W / rect.width, 0, W),
      y: clamp((event.clientY - rect.top) * H / rect.height, 0, H)
    };
  }

  function mirroredPairs(from, to) {
    const pairs = [[from, to]];
    if (state.symmetry === 'vertical' || state.symmetry === 'quad') {
      pairs.push([{ x: W - from.x, y: from.y }, { x: W - to.x, y: to.y }]);
    }
    if (state.symmetry === 'quad') {
      pairs.push([{ x: from.x, y: H - from.y }, { x: to.x, y: H - to.y }]);
      pairs.push([{ x: W - from.x, y: H - from.y }, { x: W - to.x, y: H - to.y }]);
    }
    return pairs;
  }

  function drawColoredSegment(from, to, distanceStart, width, erase = false) {
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    const steps = Math.max(1, Math.ceil(length / 4));
    ctx.save();
    ctx.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = width;
    for (let i = 0; i < steps; i++) {
      const t1 = i / steps;
      const t2 = (i + 1) / steps;
      ctx.beginPath();
      ctx.moveTo(from.x + (to.x - from.x) * t1, from.y + (to.y - from.y) * t1);
      ctx.lineTo(from.x + (to.x - from.x) * t2, from.y + (to.y - from.y) * t2);
      ctx.strokeStyle = erase ? '#000' : colorAt(distanceStart + length * (t1 + t2) / 2);
      ctx.stroke();
    }
    if (length < 1) {
      ctx.fillStyle = erase ? '#000' : colorAt(distanceStart);
      ctx.beginPath();
      ctx.arc(from.x, from.y, width / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawAll(from, to, distanceStart) {
    const width = state.tool === 'pencil' ? Math.max(2, state.size * .34) : state.tool === 'eraser' ? state.size * 1.7 : state.size;
    mirroredPairs(from, to).forEach(pair => drawColoredSegment(pair[0], pair[1], distanceStart, width, state.tool === 'eraser'));
  }

  function beginHistory() {
    state.undo.push(ctx.getImageData(0, 0, W, H));
    if (state.undo.length > 16) state.undo.shift();
    state.redo = [];
    updateHistoryButtons();
  }

  function restore(snapshot) {
    ctx.clearRect(0, 0, W, H);
    ctx.putImageData(snapshot, 0, 0);
    state.hasDrawn = true;
    $('#emptyHint').classList.add('hidden');
  }

  function updateHistoryButtons() {
    $('#undoBtn').disabled = state.undo.length === 0;
    $('#redoBtn').disabled = state.redo.length === 0;
  }

  function onPointerDown(event) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (state.drawing || state.activePointerId !== null) return;
    event.preventDefault();
    frame.setPointerCapture?.(event.pointerId);
    const point = pointFromEvent(event);

    if (state.tool === 'picker') {
      const pixel = ctx.getImageData(Math.floor(point.x), Math.floor(point.y), 1, 1).data;
      state.solid = pixel[3] ? rgbToHex(pixel[0], pixel[1], pixel[2]) : '#ffffff';
      $('#solidColor').value = state.solid;
      syncSpectrumFromSolid();
      setMode('solid');
      updateColorUI();
      showToast('Color picked');
      return;
    }

    state.activePointerId = event.pointerId;
    beginHistory();
    state.drawing = true;
    state.moved = false;
    state.start = point;
    state.last = point;
    state.distance = 0;
    if (state.tool === 'line') state.lineBase = ctx.getImageData(0, 0, W, H);
    else drawAll(point, point, 0);
    state.hasDrawn = true;
    $('#emptyHint').classList.add('hidden');
  }

  function onPointerMove(event) {
    if (!state.drawing || event.pointerId !== state.activePointerId) return;
    event.preventDefault();
    const point = pointFromEvent(event);
    state.moved = true;
    if (state.tool === 'line') {
      ctx.putImageData(state.lineBase, 0, 0);
      drawAll(state.start, point, 0);
    } else {
      drawAll(state.last, point, state.distance);
      state.distance += Math.hypot(point.x - state.last.x, point.y - state.last.y);
    }
    state.last = point;
  }

  function onPointerUp(event) {
    if (!state.drawing || event.pointerId !== state.activePointerId) return;
    event.preventDefault();
    if (state.tool === 'line' && !state.moved) drawAll(state.start, state.start, 0);
    state.drawing = false;
    state.activePointerId = null;
    state.lineBase = null;
    updateHistoryButtons();
  }

  function setTool(tool) {
    state.tool = tool;
    $$('.tool').forEach(button => {
      const active = button.dataset.tool === tool;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active);
    });
    frame.style.cursor = tool === 'picker' ? 'copy' : tool === 'eraser' ? 'cell' : 'crosshair';
    updateStatus();
  }

  function setMode(mode) {
    state.mode = mode;
    $$('.mode').forEach(button => {
      const active = button.dataset.mode === mode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active);
    });
    updateColorUI();
    updateStatus();
  }

  function setSymmetry(symmetry) {
    state.symmetry = symmetry;
    $$('.sym').forEach(button => {
      const active = button.dataset.symmetry === symmetry;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active);
    });
    drawGuides();
    if (symmetry !== 'none') showToast(symmetry === 'vertical' ? 'Mirror drawing on' : 'Four-way drawing on');
  }

  function drawGuides() {
    gtx.clearRect(0, 0, W, H);
    if (state.symmetry === 'none') return;
    gtx.save();
    gtx.setLineDash([10, 12]);
    gtx.lineWidth = 2;
    gtx.strokeStyle = 'rgba(70, 91, 130, .28)';
    gtx.beginPath();
    gtx.moveTo(W / 2, 0); gtx.lineTo(W / 2, H);
    if (state.symmetry === 'quad') { gtx.moveTo(0, H / 2); gtx.lineTo(W, H / 2); }
    gtx.stroke();
    gtx.restore();
  }

  function gradientCss(colors = state.stops) {
    return `linear-gradient(90deg, ${colors.join(', ')})`;
  }

  function updateColorUI() {
    const swatch = $('#activeSwatch');
    const label = $('#colorSummaryText');
    if (state.mode === 'solid') {
      swatch.style.background = state.solid;
      label.textContent = state.solid.toUpperCase();
    } else if (state.mode === 'rainbow') {
      swatch.style.background = gradientCss(presets[0].colors);
      label.textContent = 'Rainbow';
    } else {
      swatch.style.background = gradientCss();
      label.textContent = state.style === 'bands' ? 'Color bands' : 'Color blend';
    }
    $$('.gradient-section').forEach(section => section.style.opacity = state.mode === 'solid' ? '.55' : '1');
  }

  function updateSpectrumUI() {
    const { h, s, v } = state.spectrum;
    $('#spectrumThumb').style.left = `${h / 360 * 100}%`;
    $('#spectrumThumb').style.top = `${(1 - s) * 100}%`;
    $('#brightnessThumb').style.top = `${(1 - v) * 100}%`;
    $('#brightnessTrack').style.background = `linear-gradient(to bottom, #fff, hsl(${h} 100% 50%) 46%, #000)`;
    $('#spectrumField').setAttribute('aria-valuetext', state.solid.toUpperCase());
    $('#brightnessTrack').setAttribute('aria-valuenow', Math.round(v * 100));
  }

  function syncSpectrumFromSolid() {
    const rgb = hexToRgb(state.solid);
    state.spectrum = rgbToHsv(rgb.r, rgb.g, rgb.b);
    updateSpectrumUI();
  }

  function applySpectrumColor() {
    const { h, s, v } = state.spectrum;
    state.solid = hsvToHex(h, s, v);
    $('#solidColor').value = state.solid;
    setMode('solid');
    updateSpectrumUI();
  }

  function bindSpectrumDrag(element, update) {
    let pointerId = null;
    const move = event => {
      if (pointerId !== event.pointerId) return;
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      update(clamp((event.clientX - rect.left) / rect.width, 0, 1), clamp((event.clientY - rect.top) / rect.height, 0, 1));
    };
    element.addEventListener('pointerdown', event => {
      if (pointerId !== null) return;
      pointerId = event.pointerId;
      element.setPointerCapture?.(pointerId);
      move(event);
    });
    element.addEventListener('pointermove', move);
    const end = event => { if (event.pointerId === pointerId) pointerId = null; };
    element.addEventListener('pointerup', end);
    element.addEventListener('pointercancel', end);
  }

  function renderStops() {
    const editor = $('#stopEditor');
    editor.replaceChildren();
    state.stops.forEach((color, index) => {
      const wrap = document.createElement('div');
      wrap.className = 'stop-wrap';
      wrap.innerHTML = `<button class="stop-chip" aria-label="Edit color ${index + 1}" style="background:${color}"></button><input type="color" value="${color}" aria-hidden="true" tabindex="-1"><div class="stop-arrows"><button aria-label="Move color left">‹</button><button aria-label="Move color right">›</button></div>${state.stops.length > 2 ? '<button class="stop-delete" aria-label="Remove color">×</button>' : ''}`;
      const input = wrap.querySelector('input');
      wrap.querySelector('.stop-chip').addEventListener('click', () => input.click());
      input.addEventListener('input', () => { state.stops[index] = input.value; renderStops(); updateColorUI(); });
      const arrows = wrap.querySelectorAll('.stop-arrows button');
      arrows[0].disabled = index === 0;
      arrows[1].disabled = index === state.stops.length - 1;
      arrows[0].addEventListener('click', () => moveStop(index, index - 1));
      arrows[1].addEventListener('click', () => moveStop(index, index + 1));
      wrap.querySelector('.stop-delete')?.addEventListener('click', () => { state.stops.splice(index, 1); renderStops(); updateColorUI(); });
      editor.append(wrap);
    });
  }

  function moveStop(from, to) {
    if (to < 0 || to >= state.stops.length) return;
    const [color] = state.stops.splice(from, 1);
    state.stops.splice(to, 0, color);
    renderStops();
    updateColorUI();
  }

  function renderPalettes() {
    const target = $('#presets');
    target.replaceChildren();
    let saved = [];
    try { saved = JSON.parse(localStorage.getItem('katie-palettes') || '[]'); } catch (_) { /* ignore */ }
    [...presets, ...saved].forEach(preset => {
      const button = document.createElement('button');
      button.className = 'preset';
      button.title = preset.name;
      button.setAttribute('aria-label', `${preset.name} palette`);
      button.style.background = gradientCss(preset.colors);
      button.addEventListener('click', () => {
        state.stops = [...preset.colors];
        setMode(preset.name === 'Rainbow' ? 'rainbow' : 'gradient');
        renderStops();
        showToast(`${preset.name} colors`);
      });
      target.append(button);
    });
  }

  function updateStatus() {
    const tool = state.tool[0].toUpperCase() + state.tool.slice(1);
    const mode = state.mode[0].toUpperCase() + state.mode.slice(1);
    $('#statusText').textContent = `${tool} · ${mode}${state.symmetry === 'none' ? '' : ' · Symmetry'}`;
  }

  let toastTimer;
  function showToast(message) {
    const toast = $('#toast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 1500);
  }

  function toggleColorPanel(force) {
    const panel = $('#colorPanel');
    const open = force ?? panel.hidden;
    panel.hidden = !open;
    $('#colorPanelBtn').setAttribute('aria-expanded', open);
  }

  function setLittleHands(enabled) {
    state.littleHands = enabled;
    const shell = $('.app-shell');
    const button = $('#lockBtn');
    shell.classList.toggle('locked', enabled);
    button.setAttribute('aria-pressed', enabled);
    button.setAttribute('aria-label', enabled ? 'Press and hold to turn off Little hands mode' : 'Turn on Little hands mode');
    button.querySelector('[aria-hidden="true"]').textContent = enabled ? '🔒' : '🔓';
    button.querySelector('.lock-label').textContent = enabled ? 'Hold to unlock' : 'Little hands';
    if (enabled) {
      toggleColorPanel(false);
      showToast('Little hands mode on');
    } else {
      showToast('Controls unlocked');
    }
  }

  function fullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
  }

  function updateFullscreenButton() {
    const button = $('#fullscreenBtn');
    const active = Boolean(fullscreenElement());
    button.querySelector('[aria-hidden="true"]').textContent = active ? '↙' : '⛶';
    button.querySelector('.fullscreen-label').textContent = active ? 'Exit full screen' : 'Full screen';
    button.setAttribute('aria-label', active ? 'Exit full screen' : 'Enter full screen');
    button.title = active ? 'Exit full screen' : 'Full screen';
  }

  async function toggleFullscreen() {
    try {
      if (fullscreenElement()) {
        const exit = document.exitFullscreen || document.webkitExitFullscreen;
        if (exit) await exit.call(document);
        return;
      }
      const root = document.documentElement;
      const request = root.requestFullscreen || root.webkitRequestFullscreen;
      if (!request) {
        showToast('On iPhone: Share → Add to Home Screen');
        return;
      }
      await request.call(root);
    } catch (_) {
      showToast('Use Share → Add to Home Screen for full screen');
    }
  }

  function setupUI() {
    $$('.tool').forEach(button => button.addEventListener('click', () => setTool(button.dataset.tool)));
    $$('.mode').forEach(button => button.addEventListener('click', () => setMode(button.dataset.mode)));
    $$('.sym').forEach(button => button.addEventListener('click', () => setSymmetry(button.dataset.symmetry)));
    $$('.style').forEach(button => button.addEventListener('click', () => {
      state.style = button.dataset.style;
      $$('.style').forEach(other => { const active = other === button; other.classList.toggle('active', active); other.setAttribute('aria-pressed', active); });
      updateColorUI();
    }));

    const sizeRange = $('#sizeRange');
    sizeRange.addEventListener('input', () => {
      state.size = Number(sizeRange.value);
      $('#sizeOutput').value = state.size;
      const diameter = clamp(state.size, 5, 20);
      $('#sizePreview').style.width = `${diameter}px`;
      $('#sizePreview').style.height = `${diameter}px`;
    });

    $('#solidColor').addEventListener('input', event => { state.solid = event.target.value; syncSpectrumFromSolid(); setMode('solid'); });
    $('#repeatRange').addEventListener('input', event => { state.repeat = Number(event.target.value); });
    $('#colorPanelBtn').addEventListener('click', () => toggleColorPanel());
    $('#fullscreenBtn').addEventListener('click', toggleFullscreen);
    document.addEventListener('fullscreenchange', updateFullscreenButton);
    document.addEventListener('webkitfullscreenchange', updateFullscreenButton);
    updateFullscreenButton();

    bindSpectrumDrag($('#spectrumField'), (x, y) => {
      state.spectrum.h = x * 360;
      state.spectrum.s = 1 - y;
      applySpectrumColor();
    });
    bindSpectrumDrag($('#brightnessTrack'), (_x, y) => {
      state.spectrum.v = 1 - y;
      applySpectrumColor();
    });
    $('#spectrumField').addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      if (event.key === 'ArrowLeft') state.spectrum.h = (state.spectrum.h + 357) % 360;
      if (event.key === 'ArrowRight') state.spectrum.h = (state.spectrum.h + 3) % 360;
      if (event.key === 'ArrowUp') state.spectrum.s = clamp(state.spectrum.s + .03, 0, 1);
      if (event.key === 'ArrowDown') state.spectrum.s = clamp(state.spectrum.s - .03, 0, 1);
      applySpectrumColor();
    });
    $('#brightnessTrack').addEventListener('keydown', event => {
      if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      state.spectrum.v = clamp(state.spectrum.v + (event.key === 'ArrowUp' ? .03 : -.03), 0, 1);
      applySpectrumColor();
    });

    const lockButton = $('#lockBtn');
    let unlockTimer;
    let ignoreLockClickUntil = 0;
    const cancelUnlock = () => {
      clearTimeout(unlockTimer);
      lockButton.classList.remove('holding');
    };
    lockButton.addEventListener('click', () => {
      if (Date.now() < ignoreLockClickUntil || state.littleHands) return;
      setLittleHands(true);
    });
    lockButton.addEventListener('pointerdown', event => {
      if (!state.littleHands) return;
      event.preventDefault();
      lockButton.classList.add('holding');
      unlockTimer = setTimeout(() => {
        ignoreLockClickUntil = Date.now() + 600;
        lockButton.classList.remove('holding');
        setLittleHands(false);
      }, 1500);
    });
    lockButton.addEventListener('pointerup', cancelUnlock);
    lockButton.addEventListener('pointercancel', cancelUnlock);
    lockButton.addEventListener('pointerleave', cancelUnlock);

    const quickTarget = $('#basicColors');
    quickColors.forEach(color => {
      const button = document.createElement('button');
      button.className = 'quick-color';
      button.style.background = color;
      button.setAttribute('aria-label', `Use ${color}`);
      button.addEventListener('click', () => { state.solid = color; $('#solidColor').value = color; syncSpectrumFromSolid(); setMode('solid'); });
      quickTarget.append(button);
    });

    $('#addStopBtn').addEventListener('click', () => {
      if (state.stops.length >= 8) return showToast('Eight colors is the maximum');
      state.stops.push(state.solid);
      setMode('gradient');
      renderStops();
    });
    $('#reverseBtn').addEventListener('click', () => { state.stops.reverse(); renderStops(); updateColorUI(); });
    $('#savePresetBtn').addEventListener('click', () => {
      let saved = [];
      try { saved = JSON.parse(localStorage.getItem('katie-palettes') || '[]'); } catch (_) { /* ignore */ }
      saved = [...saved.slice(-5), { name: 'My palette', colors: [...state.stops] }];
      localStorage.setItem('katie-palettes', JSON.stringify(saved));
      renderPalettes();
      showToast('Palette saved');
    });

    $('#undoBtn').addEventListener('click', () => {
      if (!state.undo.length) return;
      state.redo.push(ctx.getImageData(0, 0, W, H));
      restore(state.undo.pop());
      updateHistoryButtons();
    });
    $('#redoBtn').addEventListener('click', () => {
      if (!state.redo.length) return;
      state.undo.push(ctx.getImageData(0, 0, W, H));
      restore(state.redo.pop());
      updateHistoryButtons();
    });

    let clearArmed = false;
    let clearTimer;
    $('#clearBtn').addEventListener('click', event => {
      if (!state.hasDrawn) return;
      if (!clearArmed) {
        clearArmed = true;
        event.currentTarget.textContent = 'Tap again';
        showToast('Tap again to start a new picture');
        clearTimer = setTimeout(() => { clearArmed = false; event.currentTarget.textContent = 'New picture'; }, 2200);
        return;
      }
      clearTimeout(clearTimer);
      clearArmed = false;
      event.currentTarget.textContent = 'New picture';
      beginHistory();
      ctx.clearRect(0, 0, W, H);
      state.hasDrawn = false;
      $('#emptyHint').classList.remove('hidden');
      showToast('Fresh canvas');
    });

    document.addEventListener('pointerdown', event => {
      if (!$('#colorPanel').hidden && !$('#colorPanel').contains(event.target) && !$('#colorPanelBtn').contains(event.target)) toggleColorPanel(false);
    });
    document.addEventListener('keydown', event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); (event.shiftKey ? $('#redoBtn') : $('#undoBtn')).click(); }
    });
  }

  frame.addEventListener('pointerdown', onPointerDown);
  frame.addEventListener('pointermove', onPointerMove);
  frame.addEventListener('pointerup', onPointerUp);
  frame.addEventListener('pointercancel', onPointerUp);
  frame.addEventListener('contextmenu', event => event.preventDefault());

  setupUI();
  renderStops();
  renderPalettes();
  syncSpectrumFromSolid();
  updateColorUI();
  updateStatus();
  drawGuides();

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
  }
})();
