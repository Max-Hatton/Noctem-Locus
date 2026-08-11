# Astronomy Companion v0.2

Offline-first observing software prototype for a laptop at the telescope.

## What works in v0.2

- Persistent observing location stored in browser/local app storage.
- Optional device geolocation capture.
- Red night-vision theme.
- Software brightness slider down to 5% plus Deep Night preset.
- Fully local Sun, Moon, Mercury, Venus, Mars, Jupiter, Saturn, Uranus, and Neptune position calculations.
- Current altitude, azimuth, right ascension, declination, and distance.
- Moon phase and illuminated fraction.
- Moon topocentric altitude correction for the observer on Earth's surface.
- Next rise/set searches.
- Next crossing of 20° altitude.
- Astronomical dusk/dawn calculations using Sun altitude = -18°.
- "Tonight" dashboard showing sky state and which planets are above the horizon.
- "Find Object" page for solar-system targets.

All astronomy calculations in this version run locally and do not require an internet service after the app is installed/built.

## Astronomy model

The v0.2 calculation core is a self-contained TypeScript implementation based on the low-precision orbital-element method described by Paul Schlyter in "How to compute planetary positions," including the major listed perturbation terms for the Moon, Jupiter, Saturn, and Uranus. The model is appropriate for amateur observing/planning, but it is not intended for spacecraft navigation, occultation timing, or sub-arcminute astrometry.

Rise/set searches are numerical altitude-crossing searches. Approximate standard horizon refraction is included in the rise/set threshold; astronomical twilight is based on the geometric center of the Sun at -18°.

## Run in development

Requires Node.js and npm once to install the development dependencies.

```bash
npm install
npm run dev
```

Then open the local URL printed by Vite.

## Build the web UI

```bash
npm run build
```

The generated static app can be wrapped in Tauri for a Windows desktop installer in a later step.

## Project layout

- `src/main.tsx` — interface and local settings.
- `src/astronomy.ts` — offline astronomy calculation engine.
- `src/styles.css` — day/night interface and dimming layer.

## Next planned version

v0.3 should add an offline star/deep-sky catalog, richer object search, telescope/eyepiece profiles, and a first field-of-view view.
