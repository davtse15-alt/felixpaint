const SAMPLE_RATE = 16000;
const CLIP_LENGTH_MS = 3000;
const SILENCE_MS = 300;
const LIVE_SILENCE_MS = 480;
const LIVE_MAX_CLIP_MS = 4000;
const MAX_PENDING_CLIPS = 2;

const colors = {
  red: '#ed3349',
  orange: '#ff8a24',
  yellow: '#ffd43b',
  green: '#42bd62',
  blue: '#3478f6',
  indigo: '#4b0082',
  purple: '#684bd9',
  violet: '#8b5cf6',
  pink: '#d448c2',
  brown: '#8b5b3e',
  black: '#111111',
  white: '#ffffff',
  grey: '#89909d',
  gray: '#89909d'
};

const colorAliases = {
  rainbow: ['rainbows', 'rainbo', 'wainbow', 'rambo', 'rain bow', 'multicolor', 'multicolour', 'multi color', 'multi colour'],
  red: ['redd', 'reds', 'wed', 'rad', 'read', 'wred'],
  orange: ['oranges', 'owange', 'oranje', 'ornge', 'orng', 'oringe', 'orenge', 'orang', 'arenge', 'arange'],
  yellow: ['yellows', 'yello', 'wellow', 'lellow', 'yella', 'yallow', 'yelo', 'yell', 'lalo', 'jello', 'yalow'],
  green: ['greens', 'gween', 'geen', 'grean', 'greene', 'creen', 'grin', 'gwin', 'gleen'],
  blue: ['blues', 'bloo', 'blew', 'bwoo', 'blu', 'boo', 'bwue', 'bue', 'glue'],
  indigo: ['indico', 'indego', 'indago', 'endigo', 'in the go', 'in to go'],
  purple: ['purples', 'perple', 'purpl', 'pupple', 'purpo', 'puhple', 'porple', 'burple', 'parple', 'purpul', 'pople', 'bople'],
  violet: ['violets', 'viola', 'vilet', 'vialet', 'by let', 'vy let', 'voilet'],
  pink: ['pinks', 'pinc', 'peenk', 'pank', 'bink', 'tink', 'ping', 'pynk', 'pinky'],
  brown: ['browns', 'bwown', 'bown', 'brawn', 'braun', 'broun', 'bround', 'bwon'],
  black: ['blacks', 'bwack', 'blak', 'blac', 'blaq', 'bwaq'],
  white: ['whites', 'wite', 'wyte', 'whight', 'wight', 'whyt', 'wyt'],
  grey: ['greys', 'gway', 'gwey', 'grae'],
  gray: ['grays']
};

const fuzzyTargets = ['orange', 'yellow', 'green', 'indigo', 'purple', 'violet', 'brown', 'black', 'rainbow'];
const fuzzyBlocklist = new Set([
  'great', 'below', 'grown', 'blank', 'block', 'while', 'write', 'where',
  'there', 'three', 'bring', 'back', 'right', 'light', 'people', 'around',
  'ground', 'found', 'sound', 'round', 'plate', 'place', 'break', 'bread',
  'clean', 'queen', 'screen', 'sleep', 'sweet', 'range', 'change', 'strange'
]);

let active = false;
let sessionId = 0;
let stream = null;
let recorder = null;
let segmentTimer = null;
let captureContext = null;
let decodeContext = null;
let analyser = null;
let microphoneSource = null;
let worker = null;
let workerReadyPromise = null;
let workerReadyResolve = null;
let workerReadyReject = null;
let nextJobId = 0;
let processingQueue = false;
const pendingClips = [];
const transcriptionJobs = new Map();

function status(message) {
  window.dispatchEvent(new CustomEvent('sound-colour-status', { detail: { message } }));
}

function diagnostic(field, value) {
  window.dispatchEvent(new CustomEvent('sound-colour-diagnostic', { detail: { field, value } }));
}

function fail(message, currentSession) {
  if (currentSession !== sessionId) return;
  active = false;
  clearTimeout(segmentTimer);
  pendingClips.length = 0;
  processingQueue = false;
  if (recorder && recorder.state !== 'inactive') recorder.stop();
  recorder = null;
  stream?.getTracks().forEach(track => track.stop());
  stream = null;
  closeAudioMonitor();
  window.dispatchEvent(new CustomEvent('sound-colour-error', { detail: { message } }));
}

function getWorker() {
  if (workerReadyPromise) return workerReadyPromise;
  worker = new Worker(new URL('./voice-worker.js?v=21', import.meta.url), { type: 'module' });
  workerReadyPromise = new Promise((resolve, reject) => {
    const loadTimeout = setTimeout(() => workerReadyReject?.(new Error('Speech model loading timed out. Check your connection and try again.')), 120000);
    workerReadyResolve = () => { clearTimeout(loadTimeout); resolve(); };
    workerReadyReject = error => { clearTimeout(loadTimeout); reject(error); };
    worker.addEventListener('message', event => {
      const message = event.data;
      if (message.type === 'progress') {
        if (active) diagnostic('model', `Downloading ${message.progress}%…`);
      } else if (message.type === 'ready') {
        if (active) diagnostic('model', 'Ready');
        workerReadyResolve?.();
        workerReadyResolve = null;
        workerReadyReject = null;
      } else if (message.type === 'load-error') {
        workerReadyReject?.(new Error(message.message));
        workerReadyResolve = null;
        workerReadyReject = null;
      } else if (message.type === 'transcribed' || message.type === 'transcription-error') {
        const job = transcriptionJobs.get(message.id);
        if (!job) return;
        transcriptionJobs.delete(message.id);
        clearTimeout(job.timeout);
        if (message.type === 'transcribed') job.resolve(message.text);
        else job.reject(new Error(message.message));
      }
    });
    worker.addEventListener('error', event => {
      const error = new Error(event.message || 'Voice model worker failed');
      workerReadyReject?.(error);
      workerReadyResolve = null;
      workerReadyReject = null;
      for (const job of transcriptionJobs.values()) {
        clearTimeout(job.timeout);
        job.reject(error);
      }
      transcriptionJobs.clear();
      worker?.terminate();
      worker = null;
      workerReadyPromise = null;
    });
    worker.postMessage({ type: 'load' });
  }).catch(error => {
    worker?.terminate();
    worker = null;
    workerReadyPromise = null;
    throw error;
  });
  return workerReadyPromise;
}

function transcribe(audio) {
  const id = ++nextJobId;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      transcriptionJobs.delete(id);
      worker?.terminate();
      worker = null;
      workerReadyPromise = null;
      reject(new Error('Speech recognition timed out. Turn Sound colours on to retry.'));
    }, 60000);
    transcriptionJobs.set(id, { resolve, reject, timeout });
    worker.postMessage({ type: 'transcribe', id, audio }, [audio.buffer]);
  });
}

function editDistance(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const next = prev[j];
      prev[j] = a[i - 1] === b[j - 1] ? diag : 1 + Math.min(diag, prev[j], prev[j - 1]);
      diag = next;
    }
  }
  return prev[b.length];
}

function makeColorMatch(name) {
  if (name === 'rainbow') return { name: 'rainbow', mode: 'rainbow', color: '#ff8a24' };
  const displayName = name === 'gray' ? 'grey' : name;
  return { name: displayName, color: colors[name] };
}

function matchColor(transcript) {
  const cleaned = transcript.toLowerCase().replace(/[^a-z]+/g, ' ').trim();
  if (!cleaned) return null;

  let best = null;
  const consider = (name, endIndex, priority) => {
    if (!best || endIndex > best.endIndex || (endIndex === best.endIndex && priority > best.priority)) {
      best = { name, endIndex, priority };
    }
  };

  // 1. Exact & toddler-alias phrase matching (last colour mentioned in sentence wins)
  const allTargets = ['rainbow', ...Object.keys(colors)];
  for (const name of allTargets) {
    const candidates = [name, ...(colorAliases[name] || [])];
    for (const candidate of candidates) {
      const pattern = new RegExp(`\\b${candidate.replace(/\s+/g, '\\s+')}\\b`, 'gi');
      let match;
      while ((match = pattern.exec(cleaned)) !== null) {
        consider(name, match.index + match[0].length, candidate === name ? 3 : 2);
      }
    }
  }
  if (best) return makeColorMatch(best.name);

  // 2. Fuzzy + elongated-letter + w->r/l phonetic fallback for young children
  const tokenPattern = /[a-z]+/g;
  let tokenMatch;
  while ((tokenMatch = tokenPattern.exec(cleaned)) !== null) {
    const raw = tokenMatch[0];
    if (raw.length < 3 || fuzzyBlocklist.has(raw)) continue;
    const squashed = raw.replace(/(.)\1+/g, '$1');
    const variants = [raw, squashed];
    if (raw.includes('w')) {
      variants.push(raw.replace(/w/g, 'r'), raw.replace(/w/g, 'l'));
    }
    for (const variant of variants) {
      if (variant === 'rainbow' || colors[variant]) {
        consider(variant, tokenMatch.index + raw.length, 2);
        break;
      }
      if (variant.length < 4) continue;
      for (const target of fuzzyTargets) {
        if (editDistance(variant, target) <= 1) {
          consider(target, tokenMatch.index + raw.length, 1);
          break;
        }
      }
    }
  }
  return best ? makeColorMatch(best.name) : null;
}

async function audioToMono16k(blob, sharedContext = null) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const OfflineAudioContextClass = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!AudioContextClass || !OfflineAudioContextClass) throw new Error('Audio tools are not available in this browser');

  const ownsContext = !sharedContext;
  const context = sharedContext || new AudioContextClass();
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    const length = Math.max(1, Math.ceil(decoded.duration * SAMPLE_RATE));
    const offline = new OfflineAudioContextClass(1, length, SAMPLE_RATE);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    const resampled = await offline.startRendering();
    return resampled.getChannelData(0).slice();
  } finally {
    if (ownsContext) await context.close();
  }
}

function hasSpeech(audio) {
  if (!audio || audio.length === 0) return false;
  // Short live analyser frames (<= 2048 samples): check frame RMS directly.
  if (audio.length <= 2048) {
    let sum = 0;
    for (let i = 0; i < audio.length; i += 1) sum += audio[i] * audio[i];
    return Math.sqrt(sum / audio.length) > 0.005;
  }
  // Full recorded clips: check 50ms windows so a short word inside a longer clip isn't diluted by silence.
  const windowSize = Math.max(1, Math.floor(SAMPLE_RATE * 0.05));
  for (let start = 0; start < audio.length; start += windowSize) {
    const end = Math.min(audio.length, start + windowSize);
    let sum = 0;
    let peak = 0;
    for (let i = start; i < end; i += 1) {
      const sample = audio[i];
      sum += sample * sample;
      const abs = Math.abs(sample);
      if (abs > peak) peak = abs;
    }
    if (Math.sqrt(sum / (end - start)) > 0.005 && peak > 0.015) return true;
  }
  return false;
}

function normalizeAudio(audio) {
  if (!audio || audio.length === 0) return audio;
  const windowSize = Math.floor(SAMPLE_RATE * 0.05);
  let firstActive = -1;
  let lastActive = -1;
  let peak = 0;
  for (let start = 0; start < audio.length; start += windowSize) {
    const end = Math.min(audio.length, start + windowSize);
    let sum = 0;
    let windowPeak = 0;
    for (let i = start; i < end; i += 1) {
      const sample = audio[i];
      sum += sample * sample;
      const abs = Math.abs(sample);
      if (abs > windowPeak) windowPeak = abs;
    }
    if (windowPeak > peak) peak = windowPeak;
    if (Math.sqrt(sum / (end - start)) > 0.004) {
      if (firstActive === -1) firstActive = start;
      lastActive = end;
    }
  }
  const pad = Math.floor(SAMPLE_RATE * 0.22);
  const sliceStart = firstActive === -1 ? 0 : Math.max(0, firstActive - pad);
  const sliceEnd = lastActive === -1 ? audio.length : Math.min(audio.length, lastActive + pad);
  const trimmed = audio.slice(sliceStart, sliceEnd);
  if (peak > 0.01 && peak < 0.75) {
    const gain = Math.min(10, 0.85 / peak);
    for (let i = 0; i < trimmed.length; i += 1) {
      trimmed[i] = Math.max(-1, Math.min(1, trimmed[i] * gain));
    }
  }
  return trimmed;
}

function shouldFinishClip(elapsed, lastSpeech, now) {
  return elapsed >= CLIP_LENGTH_MS || (elapsed >= 450 && lastSpeech !== null && now - lastSpeech >= SILENCE_MS);
}

function shouldFinishLiveClip(elapsed, lastSpeech, now) {
  return elapsed >= LIVE_MAX_CLIP_MS || (elapsed >= 600 && lastSpeech !== null && now - lastSpeech >= LIVE_SILENCE_MS);
}

function closeAudioMonitor() {
  microphoneSource?.disconnect();
  microphoneSource = null;
  analyser = null;
  captureContext?.close().catch(() => {});
  captureContext = null;
  decodeContext?.close().catch(() => {});
  decodeContext = null;
}

function enqueueClip(blob, currentSession) {
  if (!active || currentSession !== sessionId) return;
  if (pendingClips.length >= MAX_PENDING_CLIPS) pendingClips.shift();
  pendingClips.push(blob);
  if (!processingQueue) void processQueue(currentSession);
}

async function processQueue(currentSession) {
  if (processingQueue) return;
  processingQueue = true;
  try {
    while (active && currentSession === sessionId && pendingClips.length > 0) {
      const blob = pendingClips.shift();
      await transcribeClip(blob, currentSession);
    }
  } finally {
    processingQueue = false;
    if (active && currentSession === sessionId) {
      status('Listening — say a colour');
    }
  }
}

async function transcribeClip(blob, currentSession) {
  let stage = 'Reading microphone recording';
  try {
    if (blob.size < 1000) {
      diagnostic('audio', 'Recording was empty or too short');
      return;
    }
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!decodeContext && AudioContextClass) decodeContext = new AudioContextClass();
    const audio = await audioToMono16k(blob, decodeContext);
    if (!active || currentSession !== sessionId) return;
    if (!hasSpeech(audio)) {
      diagnostic('audio', 'Listening quietly…');
      return;
    }
    diagnostic('audio', 'Sound detected');
    const normalized = normalizeAudio(audio);

    stage = 'Loading speech model';
    await getWorker();
    if (!active || currentSession !== sessionId) return;
    stage = 'Recognising speech';
    status('Recognising…');
    const transcript = await transcribe(normalized);
    if (!active || currentSession !== sessionId) return;
    const heard = transcript.trim();
    diagnostic('heard', heard || 'No words recognised');
    if (!heard) return;
    const match = matchColor(transcript);
    if (match) window.dispatchEvent(new CustomEvent('sound-colour-match', { detail: match }));
    else window.dispatchEvent(new CustomEvent('sound-colour-heard', { detail: { transcript: heard } }));
  } catch (error) {
    fail(`${stage}: ${error?.message || String(error)}`, currentSession);
  }
}

function recordSegment(currentSession) {
  if (!active || currentSession !== sessionId || !stream) return;
  let chunks = [];
  try {
    const segmentRecorder = new MediaRecorder(stream);
    recorder = segmentRecorder;
    if (!processingQueue) status('Listening — say a colour');
    const started = performance.now();
    let lastSpeech = null;
    let heardSpeech = false;
    const samples = analyser ? new Float32Array(analyser.fftSize) : null;
    segmentRecorder.addEventListener('error', event => {
      fail(`Microphone recording failed: ${event.error?.message || 'Try turning Sound colours on again.'}`, currentSession);
    });
    segmentRecorder.addEventListener('dataavailable', event => {
      if (event.data?.size) chunks.push(event.data);
    });
    segmentRecorder.addEventListener('stop', () => {
      const clip = new Blob(chunks, { type: segmentRecorder.mimeType });
      chunks = [];
      if (recorder === segmentRecorder) recorder = null;
      if (active && currentSession === sessionId) {
        // Immediately start the next recording segment so there is zero blind-spot gap during transcription.
        recordSegment(currentSession);
        const monitored = analyser && captureContext?.state === 'running';
        if (!monitored || heardSpeech) {
          enqueueClip(clip, currentSession);
        }
      }
    }, { once: true });
    segmentRecorder.start();
    const watch = () => {
      if (!active || currentSession !== sessionId || segmentRecorder.state !== 'recording') return;
      const now = performance.now();
      if (analyser && samples) {
        analyser.getFloatTimeDomainData(samples);
        if (hasSpeech(samples)) {
          lastSpeech = now;
          heardSpeech = true;
        }
      }
      const monitored = analyser && captureContext?.state === 'running';
      if (monitored ? shouldFinishLiveClip(now - started, lastSpeech, now) : now - started >= 2000) {
        segmentRecorder.stop();
      } else segmentTimer = setTimeout(watch, 50);
    };
    segmentTimer = setTimeout(watch, 50);
  } catch (_) {
    fail('This browser could not start microphone recording', currentSession);
  }
}

async function startListening() {
  if (active) return;
  active = true;
  const currentSession = ++sessionId;
  pendingClips.length = 0;
  processingQueue = false;
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    fail('This browser does not support microphone recording', currentSession);
    return;
  }

  if (!window.isSecureContext) {
    fail('Open the app from a secure HTTPS address to use the microphone', currentSession);
    return;
  }

  status('Starting private listening…');
  diagnostic('microphone', 'Requesting permission…');
  diagnostic('model', 'Loading…');
  try {
    // Resume in the original tap so iPad audio is unlocked before async loading.
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      captureContext = new AudioContextClass();
      captureContext.resume().catch(() => {});
    }
    const microphoneRequest = navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    });
    const modelRequest = getWorker().then(
      () => ({ ready: true }),
      error => ({ error })
    );
    const newStream = await microphoneRequest;
    if (!active || currentSession !== sessionId) {
      newStream.getTracks().forEach(track => track.stop());
      return;
    }
    stream = newStream;
    if (captureContext) {
      microphoneSource = captureContext.createMediaStreamSource(stream);
      analyser = captureContext.createAnalyser();
      analyser.fftSize = 2048;
      microphoneSource.connect(analyser);
    }
    diagnostic('microphone', 'Allowed');
    status('Preparing speech model…');
    const modelResult = await modelRequest;
    if (modelResult.error) throw modelResult.error;
    if (!active || currentSession !== sessionId) return;
    diagnostic('model', 'Ready');
    recordSegment(currentSession);
  } catch (error) {
    const message = error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError'
      ? 'Allow microphone access to use sound colours'
      : `Could not start sound colours: ${error?.message || String(error)}`;
    fail(message, currentSession);
  }
}

function stopListening() {
  active = false;
  sessionId += 1;
  clearTimeout(segmentTimer);
  pendingClips.length = 0;
  processingQueue = false;
  if (recorder && recorder.state !== 'inactive') recorder.stop();
  recorder = null;
  stream?.getTracks().forEach(track => track.stop());
  stream = null;
  closeAudioMonitor();
  if (transcriptionJobs.size) {
    for (const job of transcriptionJobs.values()) {
      clearTimeout(job.timeout);
      job.reject(new Error('Sound colours stopped'));
    }
    transcriptionJobs.clear();
    worker?.terminate();
    worker = null;
    workerReadyPromise = null;
  }
}

window.addEventListener('sound-colour-start', () => { void startListening(); });
window.addEventListener('sound-colour-stop', stopListening);

export { audioToMono16k, hasSpeech, matchColor, normalizeAudio, shouldFinishClip };
