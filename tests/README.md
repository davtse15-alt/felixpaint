# Sound integration tests

Serve the repository over HTTP on localhost or HTTPS and open `tests/sound.html`.

The built-in test uses the real production speech worker and model, production audio decoding and colour matching functions, a browser MediaRecorder round trip, and the actual app in an iframe. The fixture `yellow-test.wav` says “Yellow” and was generated locally with Windows System.Speech; it contains no user recording.

The microphone test requests permission only when its button is pressed. After model loading it records 4.2 seconds, then checks decoding, sound detection, transcription, and app colour selection. Recordings are processed locally and not uploaded or saved.

Passing on desktop does not verify iPad microphone permissions, Safari's recording format, its memory limits, child speech accuracy, or continuous-listening timing. Run both tests on the affected device to distinguish model/recording failures from microphone input problems. Each stage and the original error are shown in the page.
