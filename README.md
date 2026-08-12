# NOCTEM LOCUS

**Offline astronomy and telescope companion for Windows**

Noctem Locus is an offline-first observing application built for use beside a telescope. It began as **Astronomy Companion** and became **Noctem Locus** with the v0.9 desktop migration.

## Current version

**v0.11.0** — expanded offline catalog + richer All-Sky and Horizon View rendering.

The current application includes:

- Tonight dashboard with twilight and solar-system visibility
- Offline Sun, Moon, and planet calculations
- Expanded offline stellar catalog with stars through visual magnitude 7.0
- Messier plus NGC/IC deep-sky search, with Caldwell aliases and supplemental Caldwell targets for full C1–C109 coverage
- Searchable deep-sky metadata including object type, magnitude, angular size, aliases, and constellation code when available
- Interactive **All-Sky** map
- First-person **Horizon View** with drag-to-look and zoom
- Magnitude-scaled star rendering and approximate stellar color in normal mode
- Zoom/detail controls for star depth, deep-sky symbols, constellation names, and a subtle Milky Way band
- Custom observing-site horizon drawn directly into both sky-map views
- Finder-field and selected-eyepiece field-of-view overlays around the selected target
- Object Finder with altitude/azimuth, rise/set, observing guidance, NGC/IC/Caldwell/common-name search
- **Observing Planner** that ranks targets across a configurable time window
- Automatic plan building using altitude, darkness, Moon interference, telescope aperture, and the active site's local horizon
- NGC/IC deep-sky targets integrated into Planner recommendations
- Persistent observing queue with manual reordering and target removal
- Observing Session mode with Push-To handoff, observed/skip actions, and direct observation logging
- Multiple saved observing-site profiles
- Eight-direction custom local-horizon profiles for houses, trees, hills, and other obstructions
- Telescope and eyepiece profiles with magnification, exit pupil, and field-of-view calculations
- Push-To / star-hop guidance
- Two-star telescope/sensor alignment
- Telescope reticle and future IMU/encoder input API
- Observation log with telescope, eyepiece, conditions, notes, ratings, and photo attachments
- Native Windows app-data storage and full `.nlbackup` backup/restore
- Red night-vision mode and software brightness reduction
- Offline operation after installation

## Download / install

Windows installers are built automatically by GitHub Actions. Open the repository's **Releases** section and download the newest Windows `setup.exe`.

> **Beta note:** v0.x builds are currently unsigned development releases. Windows may show an unknown-publisher warning. Do not disable Windows security features just to install the app.

The portable HTML fallback from the initial desktop migration is stored in [`portable/`](portable/). Native storage, backup, Planner, and v0.11 catalog/sky feature layers require the installed Tauri desktop app.

## Expanded offline catalog

v0.11 bundles a compact astronomy data layer generated from HYG 4.1 and OpenNGC. The installed app does not need internet access to search or draw these objects.

The generated catalog currently contains approximately:

- 15,599 HYG source stars through visual magnitude 7.0
- 13,202 NGC/IC source objects from OpenNGC
- full Caldwell C1–C109 search coverage using catalog cross-references plus four supplemental Caldwell targets that are not represented cleanly by a single NGC/IC row

See [`THIRD_PARTY_DATA.md`](THIRD_PARTY_DATA.md) for dataset attribution and licensing.

## Sky views

The original **All-Sky** map remains available, while **Horizon View** behaves like standing outside and looking around. v0.11 adds a deeper star field, magnitude scaling, object-type symbols, constellation labels, a subtle Milky Way guide, the selected site's obstruction profile, and telescope field-of-view circles.

Sky detail can be adjusted without changing the underlying catalog. This keeps wide views readable while allowing more detail to appear when useful.

## Observing planner

The **Planner** page can rank targets for the active observing site over the next 4–12 hours. Recommendations account for target altitude, astronomical darkness, Moon illumination/separation, active telescope aperture, and the site's custom local horizon. v0.11 also feeds suitable NGC/IC targets into those recommendations.

Targets can be added manually or assembled with **Auto-build plan**. **Begin observing session** turns the queue into a target-by-target workflow and can hand the current object directly to Push-To or the observation logger.

## Saved sites and local horizons

**Settings → Observing sites & local horizon** can store multiple locations. Each site stores latitude, longitude, elevation, and a local obstruction altitude for N, NE, E, SE, S, SW, W, and NW. Values between those directions are interpolated.

The same profile is used by the Planner, Observe Now ratings, and v0.11 sky-map obstruction rendering.

## Data and backups

Beginning with v0.9.1, the installed desktop application keeps its primary working data in the platform application-data directory associated with `com.noctemlocus.app`.

The **Settings → Native data & backup** panel can create one `.nlbackup` containing settings, saved observing sites/horizons, planner state, equipment, alignment state, observation logs, and attached photos.

## Development

Noctem Locus uses **Tauri 2** with a self-contained HTML/JavaScript astronomy frontend and a Rust native layer.

```text
frontend/index.html             Core UI + astronomy engine
frontend/native-bridge.js       Native storage + feature loader
frontend/planner.js             Planner, sites, and local-horizon logic
frontend/catalog-v011.js        Generated compact offline catalog data
frontend/catalog-core-v011.js   Catalog search/object integration
frontend/catalog-ui-v011.js     Finder/Planner/Tonight catalog integration
frontend/sky-render-v011.js     Rich All-Sky/Horizon rendering layer
frontend/sky-ui-v011.js         Sky-detail controls and catalog status UI
scripts/build_catalog_v011.py   Reproducible catalog generator
src-tauri/                      Native Tauri/Rust backend
archive/                        Historical Astronomy Companion builds
.github/workflows/              Fast checks + final Windows validation/release
```

Development pushes on `v*` branches run fast frontend/catalog validation. The expensive Windows/Tauri compile is reserved for a pull request into `main`, followed by the release build after merge.

### Local development

Install the normal Tauri Windows prerequisites, then:

```bash
npm install
npm run dev
```

Build a Windows installer with:

```bash
npm run build
```

## Hardware direction

The project is being designed to support a telescope-mounted IMU / encoder system. The current JavaScript hardware hooks are:

```js
window.noctemLocus.setTelescopePointing(altitudeDeg, azimuthDeg)
window.noctemLocus.setRawIMUPointing(rawAltitudeDeg, rawAzimuthDeg)
```

The legacy `window.astronomyCompanion` alias remains available for compatibility.

## Version history

Historical builds from v0.1 through the desktop migration are preserved under [`archive/`](archive/). See [`CHANGELOG.md`](CHANGELOG.md) for the development timeline.

## License

No open-source license has been selected yet for the Noctem Locus application source. The repository is public for development/testing visibility; no additional rights are granted by default. Bundled third-party astronomical data has separate licensing documented in [`THIRD_PARTY_DATA.md`](THIRD_PARTY_DATA.md).
