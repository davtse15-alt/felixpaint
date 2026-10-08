# Flex Paint

Flex Paint is a touch-first, Windows 11 Paint-inspired drawing app made for playful, low-friction drawing. It runs in the browser. Optional sound colour mode downloads an English speech model on first use and processes voice on the device.

## Features

- Brush, pencil, straight line, eraser, and color picker
- Solid, repeating multicolor gradient, color-band, and rainbow strokes
- Large draggable rainbow spectrum and brightness picker for choosing solid colors
- Editable color sequences with reorder, reverse, presets, and saved custom palettes
- Vertical mirror and four-way symmetry drawing
- Large touch controls and a fixed 16:9 canvas
- Separate **Learn** mode with ten practice guides for a selected uppercase U.S. letter (A–Z), or a full worksheet for numbers (0–9)
- Select, step through, and retry tracing guides while keeping learning marks separate from paint pictures
- Drum-only picture stamps, including a colorful toy drum kit, snare, bongos, bass drum, and tom
- **Little hands mode** hides the controls and requires a deliberate press-and-hold to unlock
- Multi-touch protection prevents a second finger from interrupting an active stroke
- Full-screen button with iPad/iPhone Home Screen fallback
- Sound colour mode: say a basic colour to select it, using on-device speech recognition
- Speech is submitted after a short pause at the end of a word, with a large colour-name and confetti celebration on the canvas
- Responsive phone layout with a swipeable toolbar and single-column color editor
- 16-step undo history and redo
- Offline-capable installable web app

## Run it locally

From this folder, start any static web server. For example:

```powershell
python -m http.server 4173
```

Then open `http://localhost:4173` on the same computer.

## Put it on an iPad

The iPad needs to open the app from an HTTPS address once; iPadOS cannot install a PWA directly from a downloaded folder. Voice colours also need a secure address for microphone access (localhost is allowed for development).

1. Host this folder on a static HTTPS web host. For local development, use localhost; an iPad connecting to a computer over Wi-Fi needs HTTPS.
2. Open that address in Safari on the iPad.
3. Tap **Share**, then **Add to Home Screen**.
4. Launch **Flex Paint** from its new Home Screen icon.

The installed app requests full-screen display. When using ordinary Safari instead, tap the **Full screen** button. On devices where Safari does not expose full-screen mode, **Add to Home Screen** provides the most app-like experience.

After the first successful load, the service worker caches the application so it can continue to open without a connection.

Sound colour mode needs microphone access and an internet connection the first time so it can download its speech model (about 45 MB). Once downloaded, speech is processed locally and is not sent to a speech service. The model can be cached by the browser for later use.
