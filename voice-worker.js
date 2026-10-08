const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';
const MODEL_ID = 'onnx-community/whisper-tiny.en';
let transcriber;

self.addEventListener('message', async event => {
  const { type, id, audio } = event.data;
  if (type === 'load') {
    try {
      const { env, pipeline } = await import(MODEL_URL);
      env.allowLocalModels = false;
      env.useBrowserCache = true;
      env.useWasmCache = true;
      transcriber = await pipeline('automatic-speech-recognition', MODEL_ID, {
        device: 'wasm',
        dtype: 'q8',
        progress_callback: progress => {
          if (progress.status === 'progress' && Number.isFinite(progress.progress)) {
            self.postMessage({ type: 'progress', progress: Math.round(progress.progress) });
          }
        }
      });
      self.postMessage({ type: 'ready' });
    } catch (error) {
      self.postMessage({ type: 'load-error', message: error?.message || 'Could not load the voice model' });
    }
    return;
  }

  if (type === 'transcribe' && transcriber) {
    try {
      const result = await transcriber(audio, {
        // This English-only model rejects explicit language/task options.
        max_new_tokens: 8,
        do_sample: false
      });
      self.postMessage({ type: 'transcribed', id, text: result.text || '' });
    } catch (error) {
      self.postMessage({ type: 'transcription-error', id, message: error?.message || 'Could not transcribe this clip' });
    }
  }
});
