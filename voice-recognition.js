const SAMPLE_RATE = 16000;
const CLIP_LENGTH_MS = 2000;
const SILENCE_MS = 550;
const MIN_SPEECH_MS = 120;

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
  red: ['weh', 'wed', 'eh', 're'],
  blue: ['boo', 'bu', 'bloo', 'bwoo'],
  green: ['geen', 'gween', 'een'],
  yellow: ['yello', 'wellow', 'lellow', 'lello', 'yeyo', 'leyo', 'yewo'],
  purple: ['perple', 'purpl', 'puh', 'puhpo'],
  orange: ['ow', 'ornj', 'wange'],
  pink: ['pi', 'pih', 'pin'],
  brown: ['bown', 'bwow'],
  black: ['bwak', 'bak'],
  white: ['wite', 'why']
};

const spokenColors = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'brown', 'black', 'white', 'indigo', 'violet', 'grey', 'gray'];

let active = false;
let sessionId = 0;
let stream = null;
let recorder = null;
let segmentTimer = null;
let captureContext = null;
let analyser = null;
let microphoneSource = null;
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
  closeAudioMonitor();
  window.dispatchEvent(new CustomEvent('sound-colour-error', { detail: { message } }));
}

function getWorker() {
  if (workerReadyPromise) return workerReadyPromise;
  worker = new Worker(new URL('./voice-worker.js?v=19', import.meta.url), { type: 'module' });
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

function phoneticKey(word) {
  return word.toLowerCase().replace(/ph/g, 'f').replace(/wh/g, 'w').replace(/(.)\1+/g, '$1')
    .replace(/[aeiou]/g, (v, index) => index === 0 ? v : '').replace(/c/g, 'k').replace(/q/g, 'k').replace(/x/g, 'ks');
}

function editSimilarity(a, b) {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j += 1) rows[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) for (let j = 1; j <= b.length; j += 1) {
    rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return 1 - rows[a.length][b.length] / Math.max(a.length, b.length, 1);
}

function matchColor(transcript) {
  const words = transcript.toLowerCase().replace(/[^a-z]+/g, ' ').trim();
  if (/^(?:rainbow|multicolou?r|multi colou?r)$/.test(words)) {
    return { name: 'rainbow', mode: 'rainbow', color: '#ff8a24' };
  }
  // Colour mode is a one-word game. Reject conversational context before doing
  // phonetic matching so a colour mentioned in a sentence can never activate.
  if (!words || words.split(' ').length !== 1) return null;
  const utterance = words;
  const key = phoneticKey(utterance);
  const candidates = spokenColors.map(name => {
    const forms = [name, ...(colorAliases[name] || [])];
    const score = Math.max(...forms.map(form => {
      const exactAlias = form === utterance;
      const phonetic = editSimilarity(phoneticKey(form), key);
      const spelling = editSimilarity(form, utterance);
      return exactAlias ? 1 : Math.max(phonetic * 0.96, spelling * 0.88);
    }));
    return { name, score };
  }).sort((a, b) => b.score - a.score);
  const [best, second] = candidates;
  // Exact toddler aliases are strong evidence; fuzzy candidates need a high
  // score and clear margin to avoid choosing between similar short sounds.
  if (best.score < 0.72 || (best.score < 0.94 && best.score - second.score < 0.12)) return null;
  return { name: best.name, color: colors[best.name] };
}

function findColorMention(transcript) {
  const words = transcript.toLowerCase().replace(/[^a-z]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  const found = new Map();
  for (const word of words) {
    if (/^(?:rainbow|multicolou?r)$/.test(word)) found.set('rainbow', { name: 'rainbow', mode: 'rainbow', color: '#ff8a24' });
    for (const name of spokenColors) {
      if ([name, ...(colorAliases[name] || [])].includes(word)) {
        const displayName = name === 'gray' ? 'grey' : name;
        found.set(displayName, { name: displayName, color: colors[name] });
      }
    }
  }
  // If the speaker mentions more than one colour, leave the choice to them.
  return found.size === 1 ? [...found.values()][0] : null;
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

function rms(audio) {
  let sum = 0;
  for (let index = 0; index < audio.length; index += 1) sum += audio[index] * audio[index];
  return audio.length > 0 ? Math.sqrt(sum / audio.length) : 0;
}

function shouldFinishClip(elapsed, lastSpeech, now) {
  return elapsed >= CLIP_LENGTH_MS || (elapsed >= 350 && lastSpeech !== null && now - lastSpeech >= SILENCE_MS);
}

function hasSpeech(audio) {
  const frameLength = Math.max(1, Math.round(SAMPLE_RATE * 0.02));
  for (let start = 0; start < audio.length; start += frameLength) {
    if (rms(audio.subarray(start, Math.min(start + frameLength, audio.length))) > 0.002) return true;
  }
  return false;
}

function closeAudioMonitor() {
  microphoneSource?.disconnect();
  microphoneSource = null;
  analyser = null;
  captureContext?.close().catch(() => {});
  captureContext = null;
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
    else {
      const mentioned = findColorMention(transcript);
      if (mentioned) window.dispatchEvent(new CustomEvent('sound-colour-preview', { detail: mentioned }));
      else window.dispatchEvent(new CustomEvent('sound-colour-heard', { detail: { transcript: heard, retry: heard.split(/\s+/).length === 1 } }));
    }
  } catch (error) {
    fail(`${stage}: ${error?.message || String(error)}`, currentSession);
  } finally {
    if (active && currentSession === sessionId) {
      status('Listening on this device…');
      segmentTimer = setTimeout(() => recordSegment(currentSession), 0);
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
    const started = performance.now();
    let lastSpeech = null;
    let noiseFloor = 0.001;
    let speechStarted = null;
    const samples = analyser ? new Float32Array(analyser.fftSize) : null;
    const watch = () => {
      if (!active || currentSession !== sessionId || segmentRecorder.state !== 'recording') return;
      const now = performance.now();
      if (analyser && samples) {
        analyser.getFloatTimeDomainData(samples);
        const level = rms(samples);
        // Track background noise slowly, and only while it is below the current
        // speech boundary. This adapts to room noise without raising a hard gate.
        const boundary = Math.max(0.0025, noiseFloor * 2.2);
        if (level < boundary) noiseFloor = noiseFloor * 0.96 + level * 0.04;
        if (level > Math.max(0.0025, noiseFloor * 2.2)) {
          speechStarted ??= now;
          if (now - speechStarted >= 60) lastSpeech = now;
        } else if (lastSpeech === null) speechStarted = null;
      }
      const monitored = analyser && captureContext?.state === 'running';
      if (monitored ? shouldFinishClip(now - started, lastSpeech, now) && (lastSpeech === null || now - started >= MIN_SPEECH_MS) : now - started >= CLIP_LENGTH_MS) {
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

export { audioToMono16k, findColorMention, hasSpeech, matchColor, shouldFinishClip };
