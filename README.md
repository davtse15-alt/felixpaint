# Flex Paint

Flex Paint is a touch-first, Windows 11 Paint-inspired drawing app made for playful, low-friction drawing. It runs entirely in the browser and has no third-party dependencies.

## Features

- Brush, pencil, straight line, eraser, and color picker
- Solid, repeating multicolor gradient, color-band, and rainbow strokes
- Large draggable rainbow spectrum and brightness picker for choosing solid colors
- Editable color sequences with reorder, reverse, presets, and saved custom palettes
- Vertical mirror and four-way symmetry drawing
- Large touch controls and a fixed 16:9 canvas
- **Little hands mode** hides the controls and requires a deliberate press-and-hold to unlock
- Multi-touch protection prevents a second finger from interrupting an active stroke
- Full-screen button with iPad/iPhone Home Screen fallback
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

The iPad needs to open the app from an HTTP or HTTPS address once; iPadOS cannot install a PWA directly from a downloaded folder.

1. Host this folder on a static web host, or run a local static server on a computer on the same Wi-Fi network.
2. Open that address in Safari on the iPad.
3. Tap **Share**, then **Add to Home Screen**.
4. Launch **Flex Paint** from its new Home Screen icon.

The installed app requests full-screen display. When using ordinary Safari instead, tap the **Full screen** button. On devices where Safari does not expose full-screen mode, **Add to Home Screen** provides the most app-like experience.

After the first successful load, the service worker caches the application so it can continue to open without a connection.
