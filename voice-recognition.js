const SAMPLE_RATE = 16000;
const CLIP_LENGTH_MS = 4200;

const colors = {
  red: '#ed3349',
  orange: '#ff8a24',
  yellow: '#ffd43b',
  green: '#42bd62',
  blue: '#3478f6',
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
  yellow: ['yello', 'wellow', 'lellow'],
  purple: ['perple', 'purpl']
};

let active = false;
let sessionId = 0;
let stream = null;
let recorder = null;
let segmentTimer = null;
let worker = null;
let workerReadyPromise = null;
let workerReadyResolve = null;
let workerReadyReject = null;
let nextJobId = 0;
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
  if (recorder && recorder.state !== 'inactive') recorder.stop();
  recorder = null;
  stream?.getTracks().forEach(track => track.stop());
  stream = null;
  window.dispatchEvent(new CustomEvent('sound-colour-error', { detail: { message } }));
}

function getWorker() {
  if (workerReadyPromise) return workerReadyPromise;
  worker = new Worker(new URL('./voice-worker.js?v=15', import.meta.url), { type: 'module' });
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

function matchColor(transcript) {
  const words = transcript.toLowerCase().replace(/[^a-z]+/g, ' ').trim();
  for (const [name, color] of Object.entries(colors)) {
    const namesToMatch = [name, ...(colorAliases[name] || [])];
    if (namesToMatch.some(candidate => new RegExp(`\\b${candidate}\\b`, 'i').test(words))) {
      const displayName = name === 'gray' ? 'grey' : name;
      return { name: displayName, color };
    }
  }
  return null;
}

async function audioToMono16k(blob) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const OfflineAudioContextClass = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!AudioContextClass || !OfflineAudioContextClass) throw new Error('Audio tools are not available in this browser');

  const context = new AudioContextClass();
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
    await context.close();
  }
}

function hasSpeech(audio) {
  let sum = 0;
  for (let index = 0; index < audio.length; index += 1) sum += audio[index] * audio[index];
  return audio.length > 0 && Math.sqrt(sum / audio.length) > 0.006;
}

async function transcribeClip(blob, currentSession) {
  let stage = 'Reading microphone recording';
  try {
    if (blob.size < 1000) {
      diagnostic('audio', 'Recording was empty or too short');
      return;
    }
    status('Reading recording…');
    const audio = await audioToMono16k(blob);
    if (!active || currentSession !== sessionId) return;
    if (!hasSpeech(audio)) {
      diagnostic('audio', 'Only quiet audio detected — try speaking closer');
      return;
    }
    diagnostic('audio', 'Sound detected');

    stage = 'Loading speech model';
    await getWorker();
    if (!active || currentSession !== sessionId) return;
    stage = 'Recognising speech';
    status('Recognising speech…');
    const transcript = await transcribe(audio);
    if (!active || currentSession !== sessionId) return;
    const heard = transcript.trim();
    diagnostic('heard', heard || 'No words recognised');
    if (!heard) return;
    const match = matchColor(transcript);
    if (match) window.dispatchEvent(new CustomEvent('sound-colour-match', { detail: match }));
    else window.dispatchEvent(new CustomEvent('sound-colour-heard', { detail: { transcript: heard } }));
  } catch (error) {
    fail(`${stage}: ${error?.message || String(error)}`, currentSession);
  } finally {
    if (active && currentSession === sessionId) {
      status('Listening on this device…');
      segmentTimer = setTimeout(() => recordSegment(currentSession), 180);
    }
  }
}

function recordSegment(currentSession) {
  if (!active || currentSession !== sessionId || !stream) return;
  let chunks = [];
  try {
    const segmentRecorder = new MediaRecorder(stream);
    recorder = segmentRecorder;
    status('Listening — say a colour');
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
      if (active && currentSession === sessionId) void transcribeClip(clip, currentSession);
    }, { once: true });
    segmentRecorder.start();
    segmentTimer = setTimeout(() => {
      if (active && currentSession === sessionId && recorder?.state === 'recording') recorder.stop();
    }, CLIP_LENGTH_MS);
  } catch (_) {
    fail('This browser could not start microphone recording', currentSession);
  }
}

async function startListening() {
  if (active) return;
  active = true;
  const currentSession = ++sessionId;
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
  if (recorder && recorder.state !== 'inactive') recorder.stop();
  recorder = null;
  stream?.getTracks().forEach(track => track.stop());
  stream = null;
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
