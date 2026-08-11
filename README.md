# NOCTEM LOCUS

**Offline astronomy and telescope companion for Windows**

Noctem Locus is an offline-first observing application built for use beside a telescope. It began as **Astronomy Companion** and became **Noctem Locus** with the v0.9 desktop migration.

## Current version

**v0.9.1** — native data, migration, and full backup foundation.

The current application includes:

- Tonight dashboard with twilight and solar-system visibility
- Offline Sun, Moon, and planet calculations
- Bright-star and Messier object catalogs
- Interactive **All-Sky** map
- First-person **Horizon View** with drag-to-look and zoom
- Object Finder with altitude/azimuth, rise/set, and observing guidance
- Telescope and eyepiece profiles with magnification, exit pupil, and field-of-view calculations
- Push-To / star-hop guidance
- Two-star telescope/sensor alignment
- Telescope reticle and future IMU/encoder input API
- Observation log with telescope, eyepiece, conditions, notes, ratings, and photo attachments
- Native Windows app-data storage for settings, observations, and attached photos
- Automatic migration from the v0.9.0 WebView storage format
- Full `.nlbackup` backup/restore including observation photos
- Red night-vision mode and software brightness reduction
- Offline operation after installation

## Download / install

Windows installers are built automatically by GitHub Actions. Open the repository's **Releases** section and download the newest Windows `setup.exe`.

> **Beta note:** v0.9.x builds are currently unsigned development releases. Windows may show an unknown-publisher warning. Do not disable Windows security features just to install the app.

The portable HTML fallback from the initial desktop migration is stored in [`portable/`](portable/). Native storage and full backup features require the installed Tauri desktop app.

## Data and backups

Beginning with v0.9.1, the installed desktop application keeps its primary working data in the platform application-data directory associated with `com.noctemlocus.app`.

The **Settings → Native data & backup** panel shows the exact data directory in use and can create a single `.nlbackup` file containing:

- settings and observing location
- telescope and eyepiece profiles
- Push-To/alignment state
- observation log
- attached observation photos

On first v0.9.1 launch, Noctem Locus imports the existing v0.9.0 WebView settings and any referenced observation photos it can find. WebView storage remains as a temporary compatibility fallback during the v0.9.x migration period.

## Development

Noctem Locus v0.9 uses **Tauri 2** with a self-contained HTML/JavaScript astronomy frontend and a Rust native layer.

```text
frontend/index.html          Main UI + astronomy engine
frontend/native-bridge.js    Native storage/migration UI bridge
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

Development branches and pull requests are also compiled on `windows-latest` by GitHub Actions before release.

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
