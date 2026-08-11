# Astronomy Companion v0.3

Offline-first telescope-side astronomy software.

## What changed in v0.3

v0.3 is the first desktop-oriented build.

- Added a Tauri 2 desktop shell project under `src-tauri/`.
- Added a completely self-contained portable build under `portable/`.
- Added `Launch Astronomy Companion.bat` to open the portable build in an app-style Edge/Chrome window when available.
- Added `Create Desktop Shortcut.bat` for a one-click Windows desktop shortcut.
- Kept the red night-vision mode and 5–100% software brightness control.
- Added the `N` keyboard shortcut to toggle night vision in the portable build.
- Added fullscreen control and settings export/reset to the portable build.
- Retained all offline v0.2 astronomy calculations: Sun, Moon, planets, Alt/Az, RA/Dec, Moon phase, rise/set, 20° altitude crossings, and astronomical dawn/dusk.

## Easiest way to use it right now on Windows

1. Open the `portable` folder.
2. Double-click `Launch Astronomy Companion.bat`.
3. Open **Settings** and enter or capture your observing location.
4. Optionally run `Create Desktop Shortcut.bat` once.

The portable build is a single HTML file containing the interface and astronomy engine. It does not download astronomy data at runtime.

If the app-style launcher cannot find Edge or Chrome it falls back to opening the HTML file in your default browser.

## Proper Tauri desktop build

The source is also configured as a Tauri 2 project. A Windows development machine needs the normal Tauri prerequisites (Node/npm, Rust, Microsoft C++ build tools, and WebView2).

After prerequisites are installed:

```powershell
npm install
npm run tauri dev
```

To build the Windows installer:

```powershell
npm run tauri build
```

The Tauri config currently targets an NSIS setup executable.

## Project layout

- `src/main.tsx` — React interface used by the Tauri source build.
- `src/astronomy.ts` — self-contained offline astronomy calculation engine.
- `src/styles.css` — day/night UI styling and software dimmer.
- `src-tauri/` — Tauri 2 Rust shell and desktop configuration.
- `portable/Astronomy Companion.html` — single-file portable build.
- `portable/Launch Astronomy Companion.bat` — Windows app-style launcher.
- `portable/Create Desktop Shortcut.bat` — shortcut helper.

## Accuracy / intended use

The current solar-system model is intended for visual observing and planning. It is not designed for occultation timing, spacecraft navigation, or precision astrometry.

## Next planned astronomy feature pass

The next useful feature set is equipment + deep-sky support:

- telescope profiles;
- eyepiece profiles;
- magnification, exit pupil, and true field of view;
- bright-star catalog;
- Messier catalog;
- object search across planets, stars, and deep-sky objects;
- basic field-of-view preview.
