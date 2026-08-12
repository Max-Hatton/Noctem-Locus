# Changelog

## v0.11.0 — Expanded catalog and richer sky views
- Added a compact offline HYG 4.1 star layer with 15,599 source stars through visual magnitude 7.0.
- Added 13,202 NGC/IC source objects from OpenNGC with object type, magnitude, angular size, aliases, and constellation data when available.
- Added Caldwell search aliases plus supplemental C9, C14, C41, and C99 targets for complete C1–C109 coverage.
- Expanded Object Finder search to support NGC, IC, Caldwell designations, common names, HIP identifiers, and the deeper star catalog.
- Integrated suitable NGC/IC targets into Tonight recommendations and the v0.10 Observing Planner.
- Added magnitude-scaled stellar rendering and approximate B−V-derived stellar color in normal/day mode while preserving red night mode.
- Added deep-sky chart symbols by object class, including galaxies, clusters, planetary nebulae, and other nebulae.
- Added constellation-name overlays with collision-aware labels.
- Added a subtle offline Milky Way band guide.
- Added selectable star-depth controls (mag 5.5–7.0) and toggles for deep sky, Milky Way, constellation names, and finder FOV.
- Added finder-scope and selected-eyepiece field-of-view rings around the selected target.
- Drew the active observing site's custom local-horizon obstruction directly into All-Sky and Horizon View.
- Added Horizon View guards to avoid obstruction/projection streaks when looking near the zenith.
- Split v0.11 into catalog, catalog-UI, sky-render, and sky-UI feature modules instead of expanding the original single HTML file.
- Added reproducible catalog generation plus third-party data attribution documentation.
- Changed CI so development pushes use fast frontend/catalog checks; the expensive Windows/Tauri compile now runs only for final pull requests (or manual validation).

## v0.10.0 — Observing planner and local horizons
- Added a new **Planner** page for building an observing night around what is actually visible.
- Added configurable 4–12 hour planning windows and target-count controls.
- Added automatic target ranking using altitude, darkness/twilight, Moon interference, telescope aperture, and local obstructions.
- Added **Auto-build plan** plus manual add, remove, and reorder controls for the observing queue.
- Added **Observing Session** mode with target-by-target progression, Push-To handoff, observed/skip actions, and direct observation-log handoff.
- Added persistent planner state and lightweight completed-session history.
- Added multiple saved observing-site profiles.
- Added eight-direction custom local-horizon profiles (N, NE, E, SE, S, SW, W, NW) with interpolation between directions.
- Integrated the active site's local horizon into object ratings so blocked objects can be distinguished from objects that are simply astronomically above the horizon.
- Added planner messaging for objects blocked by the local horizon and estimated obstruction-clear times.
- Split the new planner/site functionality into `frontend/planner.js` so future feature development no longer requires expanding the original single-file astronomy engine.

## v0.9.1 — Native data foundation
- Moved the working copy of settings, telescope/eyepiece profiles, alignment data, and observation metadata into a native `state.json` file under the Noctem Locus application-data directory.
- Moved new observation photo storage from IndexedDB to real managed files in the native application-data directory.
- Added automatic migration of v0.9.0 WebView settings and referenced observation photos on first launch.
- Kept browser/WebView storage as a compatibility fallback during the migration period.
- Added **Full Backup** and **Restore Backup** using a single `.nlbackup` archive containing application state and observation photos.
- Added native storage status, data-folder information, and version information to Settings.
- Added a Windows validation workflow for development branches and pull requests.
- Removed the one-time GitHub import workflow so future release tags are created from the exact source being released.

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
