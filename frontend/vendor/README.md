# Astronomy Engine

`astronomy.browser.min.js` is the unmodified browser distribution of
Astronomy Engine **v2.1.19**, authored by Don Cross and contributors.
It is included locally so Moon Map works without internet access.

- Source: https://github.com/cosinekitty/astronomy/tree/v2.1.19
- Distribution: https://raw.githubusercontent.com/cosinekitty/astronomy/v2.1.19/source/js/astronomy.browser.min.js
- API: https://github.com/cosinekitty/astronomy/blob/v2.1.19/source/js/README.md
- License: MIT, reproduced in `astronomy-engine.LICENSE` and in the distribution.
- Retrieved: 2026-09-04; 116,424 bytes.
- SHA-256: `f41139a87941ea017ab902b954c9389fa27ea72083d7fab4971756d7769d14e6`.

Moon Map uses the lunar position model, ellipsoidal observer position,
coordinate rotations, solar direction, and IAU 2015 lunar rotation axis.
It does not change the older astronomy calculations used elsewhere in the app.

The body coordinate transform follows the IAU/NAIF prime-meridian convention:
https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/C/req/pck.html

`scripts/test-moon-core.mjs` compares eight dates to independent NASA SVS
Moon Phase and Libration 2026 data (https://svs.gsfc.nasa.gov/5587/), including
libration, subsolar coordinates, pole angle, diameter, and phase. The IAU
analytical frame approximates the DE421 mean-Earth frame; this is an observing
atlas, not spacecraft navigation or a terrain-shadow model. Position and
surface geometry use the observation epoch; atmospheric refraction, differential
aberration, terrain relief, and eclipse shadows are not modeled.

The Dobsonian orientation combines horizon field rotation, 180-degree optical
rotation, and a user calibration offset. The app cannot infer the observer's
head angle or a changing focuser viewing posture from time and location alone.
