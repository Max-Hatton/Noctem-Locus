# NOCTEM LOCUS

**Offline astronomy and telescope companion for Windows**

Noctem Locus is an offline-first observing application built for use beside a telescope. It began as **Astronomy Companion** and became **Noctem Locus** with the v0.9 desktop migration.

## Current version

**v0.10.0** — observing planner, saved observing sites, and custom local horizons.

The current application includes:

- Tonight dashboard with twilight and solar-system visibility
- Offline Sun, Moon, and planet calculations
- Bright-star and Messier object catalogs
- Interactive **All-Sky** map
- First-person **Horizon View** with drag-to-look and zoom
- Object Finder with altitude/azimuth, rise/set, and observing guidance
- **Observing Planner** that ranks targets across a configurable time window
- Automatic plan building using altitude, darkness, Moon interference, telescope aperture, and the active site's local horizon
- Persistent observing queue with manual reordering and target removal
- Observing Session mode with Push-To handoff, observed/skip actions, and direct observation logging
- Multiple saved observing-site profiles
- Eight-direction custom local-horizon profiles for houses, trees, hills, and other obstructions
- Local-horizon blocking integrated into object ratings and planner recommendations
- Telescope and eyepiece profiles with magnification, exit pupil, and field-of-view calculations
- Push-To / star-hop guidance
- Two-star telescope/sensor alignment
- Telescope reticle and future IMU/encoder input API
- Observation log with telescope, eyepiece, conditions, notes, ratings, and photo attachments
- Native Windows app-data storage for settings, observations, site profiles, planner state, and attached photos
- Full `.nlbackup` backup/restore including observation photos and planner/site data
- Red night-vision mode and software brightness reduction
- Offline operation after installation

## Download / install

Windows installers are built automatically by GitHub Actions. Open the repository's **Releases** section and download the newest Windows `setup.exe`.

> **Beta note:** v0.x builds are currently unsigned development releases. Windows may show an unknown-publisher warning. Do not disable Windows security features just to install the app.

The portable HTML fallback from the initial desktop migration is stored in [`portable/`](portable/). Native storage, full backup, and the v0.10 planner feature layer require the installed Tauri desktop app.

## Observing planner

The **Planner** page can rank the current catalog for the active observing site over the next 4–12 hours. Recommendations account for:

- target altitude and azimuth
- astronomical darkness / twilight
- Moon illumination and separation
- the active telescope's aperture
- the custom local-horizon profile for the selected site

Targets can be added manually or assembled with **Auto-build plan**. **Begin observing session** turns the queue into a simple target-by-target workflow and can hand the current object directly to Push-To or the observation logger.

## Saved sites and local horizons

Beginning with v0.10.0, **Settings → Observing sites & local horizon** can store multiple locations. Each site stores latitude, longitude, elevation, and a local obstruction altitude for N, NE, E, SE, S, SW, W, and NW. Values between those directions are interpolated.

For example, if a house blocks the southeast sky to 22°, the planner can mark an object at 15° altitude as **Blocked by local horizon** and estimate when it clears that obstruction.

## Data and backups

Beginning with v0.9.1, the installed desktop application keeps its primary working data in the platform application-data directory associated with `com.noctemlocus.app`.

The **Settings → Native data & backup** panel shows the exact data directory in use and can create a single `.nlbackup` file containing:

- settings and saved observing sites
- custom local-horizon profiles
- planner queue and session history
- telescope and eyepiece profiles
- Push-To/alignment state
- observation log
- attached observation photos

## Development

Noctem Locus uses **Tauri 2** with a self-contained HTML/JavaScript astronomy frontend and a Rust native layer.

```text
frontend/index.html          Core UI + astronomy engine
frontend/native-bridge.js    Native storage/migration UI bridge
frontend/planner.js          v0.10 planner, site, and horizon feature layer
src-tauri/                   Native Tauri/Rust backend
portable/                    Browser fallback build
archive/                     Historical Astronomy Companion builds
.github/workflows/           Validation + Windows release automation
```

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

Version branches and pull requests are compiled on `windows-latest` by GitHub Actions before release.

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

No open-source license has been selected yet. The repository is public for development/testing visibility; no additional rights are granted by default.
