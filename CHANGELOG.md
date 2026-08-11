# Changelog

## v0.9.0 — Noctem Locus
- Renamed Astronomy Companion to **Noctem Locus**.
- Migrated the v0.8.1 frontend into a Tauri 2 native desktop shell.
- Added Windows application metadata and icon assets.
- Preserved portable HTML fallback and existing hardware JavaScript APIs.

## v0.8.1
- Fixed Horizon View line/projection artifacts near the zenith.
- Added safer clipping for guide and constellation segments crossing the camera plane.

## v0.8
- Added first-person **Horizon View** while retaining the original All-Sky map.
- Added click-drag look controls, zoom/FOV controls, cardinal presets, center-selected behavior, and telescope-follow support.

## v0.7.2.1
- Fixed an Observations startup crash caused by a date/time helper naming typo.

## v0.7.2
- Added photo attachments to observations.
- Stored image data offline in IndexedDB and added thumbnail/fullscreen viewing.

## v0.7.1
- Built the full Observations log.
- Added object, date/time, location, telescope, eyepiece, magnification, seeing, transparency, conditions, rating, notes, edit/search, and CSV/JSON export.

## v0.7
- Expanded finder-star catalog to 121 stars.
- Added two-star telescope/sensor alignment using a 3D rotation solution.
- Added raw IMU simulation/testing and calibrated telescope reticle output.

## v0.6
- Added Push-To / star-hop mode.
- Added nearby reference-star suggestions, angular hop guidance, finder-field estimates, and manual telescope reticle input.
- Added hardware pointing API groundwork.

## v0.5.1
- Added rotatable All-Sky map with 0–359° facing controls and N/E/S/W presets.

## v0.5
- Added interactive All-Sky map.
- Added Sun, Moon, planets, bright stars, Messier objects, constellation guides, layer toggles, clickable objects, and time stepping.

## v0.4.1
- Added the Orion AstroView 90mm EQ #9024 default telescope profile: 90 mm aperture, 910 mm focal length, approximately f/10.1.

## v0.4
- Added telescope and eyepiece equipment profiles.
- Added magnification, exit pupil, focal ratio, and approximate true-field calculations.
- Added the Messier catalog, bright-star search, and Observe Now ratings.

## v0.3.1
- Repackaged the portable build as a Smart App Control-friendly standalone HTML file with no launcher scripts.

## v0.3
- Added early Tauri desktop shell/source structure and portable desktop-style launcher experiments.

## v0.2
- Added the offline astronomy engine for Sun, Moon, Mercury, Venus, Mars, Jupiter, Saturn, Uranus, and Neptune.
- Added altitude/azimuth, rise/set, 20° altitude events, twilight, and Moon phase calculations.

## v0.1
- Initial Astronomy Companion foundation.
- Added Tonight, Find Object, Equipment, Observations, Settings shell, local settings, red night mode, and software brightness control.
