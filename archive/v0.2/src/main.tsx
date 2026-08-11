import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  SOLAR_SYSTEM_BODIES,
  altitudeLabel,
  compassDirection,
  findNextAltitudeCrossing,
  findNextAstronomicalDawn,
  findNextAstronomicalDusk,
  findNextRise,
  findNextSet,
  getBodyPosition,
  getMoonPhase,
  moonDistanceKm,
  type BodyName,
  type Observer,
} from './astronomy';
import './styles.css';

type Page = 'Tonight' | 'Find Object' | 'Equipment' | 'Observations' | 'Settings';
type ThemeMode = 'day' | 'night';

type Settings = {
  theme: ThemeMode;
  brightness: number;
  locationName: string;
  latitude: string;
  longitude: string;
  elevationM: string;
};

const defaultSettings: Settings = {
  theme: 'night',
  brightness: 45,
  locationName: '',
  latitude: '',
  longitude: '',
  elevationM: '0',
};

const navItems: Page[] = ['Tonight', 'Find Object', 'Equipment', 'Observations', 'Settings'];

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem('astro.settings');
    return raw ? { ...defaultSettings, ...JSON.parse(raw) } : defaultSettings;
  } catch {
    return defaultSettings;
  }
}

function parseObserver(settings: Settings): Observer | null {
  if (settings.latitude.trim() === '' || settings.longitude.trim() === '') return null;
  const latitude = Number(settings.latitude);
  const longitude = Number(settings.longitude);
  const elevationM = Number(settings.elevationM || 0);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return null;
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude, elevationM: Number.isFinite(elevationM) ? elevationM : 0 };
}

function App() {
  const [page, setPage] = useState<Page>('Tonight');
  const [settings, setSettings] = useState<Settings>(loadSettings);

  useEffect(() => {
    localStorage.setItem('astro.settings', JSON.stringify(settings));
  }, [settings]);

  const observer = useMemo(() => parseObserver(settings), [settings]);
  const dimOpacity = useMemo(() => {
    const normalized = Math.max(5, Math.min(100, settings.brightness));
    return 1 - normalized / 100;
  }, [settings.brightness]);

  return (
    <div className={`app ${settings.theme}`}>
      <div className="shell">
        <aside className="sidebar">
          <div className="brand">
            <div className="brandMark">✦</div>
            <div>
              <h1>Astronomy Companion</h1>
              <p>Offline astronomy v0.2</p>
            </div>
          </div>

          <nav>
            {navItems.map((item) => (
              <button
                key={item}
                className={page === item ? 'navButton active' : 'navButton'}
                onClick={() => setPage(item)}
              >
                {item}
              </button>
            ))}
          </nav>

          <div className="nightControls">
            <div className="controlRow">
              <span>Night vision</span>
              <button
                className="toggle"
                aria-pressed={settings.theme === 'night'}
                onClick={() => setSettings((s) => ({ ...s, theme: s.theme === 'night' ? 'day' : 'night' }))}
              >
                {settings.theme === 'night' ? 'ON' : 'OFF'}
              </button>
            </div>
            <label>
              App brightness <strong>{settings.brightness}%</strong>
              <input
                type="range"
                min="5"
                max="100"
                value={settings.brightness}
                onChange={(e) => setSettings((s) => ({ ...s, brightness: Number(e.target.value) }))}
              />
            </label>
            <button
              className="deepNight"
              onClick={() => setSettings((s) => ({ ...s, theme: 'night', brightness: 12 }))}
            >
              Deep Night
            </button>
          </div>
        </aside>

        <main className="content">
          <header className="topbar">
            <div>
              <p className="eyebrow">OFFLINE-FIRST OBSERVING TOOL</p>
              <h2>{page}</h2>
            </div>
            <div className="status">
              <span className="statusDot" />
              {observer ? (settings.locationName || 'Location set') : 'Location needed'}
            </div>
          </header>

          {page === 'Tonight' && <Tonight observer={observer} locationName={settings.locationName} onOpenSettings={() => setPage('Settings')} />}
          {page === 'Find Object' && <ObjectFinder observer={observer} onOpenSettings={() => setPage('Settings')} />}
          {page === 'Equipment' && <Placeholder title="Equipment" text="Next: telescope and eyepiece profiles, magnification, exit pupil, and true field of view." />}
          {page === 'Observations' && <Placeholder title="Observation Log" text="Next: local observing notes that remain on the laptop with no internet connection." />}
          {page === 'Settings' && <SettingsPage settings={settings} setSettings={setSettings} />}
        </main>
      </div>
      <div className="brightnessOverlay" style={{ opacity: dimOpacity }} />
    </div>
  );
}

function useNow(intervalMs = 15_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

function Tonight({ observer, locationName, onOpenSettings }: { observer: Observer | null; locationName: string; onOpenSettings: () => void }) {
  if (!observer) return <LocationRequired onOpenSettings={onOpenSettings} />;
  return <TonightReady observer={observer} locationName={locationName} />;
}

function TonightReady({ observer, locationName }: { observer: Observer; locationName: string }) {
  const now = useNow();
  const minuteBucket = Math.floor(now.getTime() / 60_000);
  const moon = getBodyPosition('Moon', observer, now);
  const sun = getBodyPosition('Sun', observer, now);
  const phase = getMoonPhase(now);
  const planets = (['Mercury','Venus','Mars','Jupiter','Saturn','Uranus','Neptune'] as BodyName[])
    .map((body) => getBodyPosition(body, observer, now))
    .sort((a, b) => b.altitudeDeg - a.altitudeDeg);

  const events = useMemo(() => {
    const start = new Date(minuteBucket * 60_000);
    const sunset = findNextSet('Sun', observer, start);
    const darkEvent = sun.altitudeDeg < -18
      ? { kind: 'Dawn', event: findNextAstronomicalDawn(observer, start) }
      : { kind: 'Dark', event: findNextAstronomicalDusk(observer, start) };
    return { sunset, darkEvent };
  }, [observer.latitude, observer.longitude, minuteBucket, sun.altitudeDeg < -18]);

  return (
    <section className="pageStack">
      <article className="heroCard compactHero">
        <div className="heroTopline">
          <div>
            <p className="eyebrow">LIVE SKY · {locationName || `${observer.latitude.toFixed(3)}°, ${observer.longitude.toFixed(3)}°`}</p>
            <h3>{skyStateText(sun.altitudeDeg)}</h3>
          </div>
          <div className="clockBlock">
            <strong>{formatTime(now)}</strong>
            <span>{formatDate(now)}</span>
          </div>
        </div>
        <p className="heroBody">All positions on this screen are calculated locally on this device. No internet lookup is required.</p>
      </article>

      <div className="summaryGrid">
        <SummaryCard label="Moon" value={`${Math.round(phase.illuminatedFraction*100)}%`} detail={`${phase.name} · ${moon.altitudeDeg.toFixed(1)}° ${altitudeLabel(moon.altitudeDeg).toLowerCase()}`} />
        <SummaryCard label="Sunset" value={events.sunset ? formatTime(events.sunset.time) : '—'} detail={events.sunset ? relativeTime(events.sunset.time, now) : 'No crossing found in 48 h'} />
        <SummaryCard label={events.darkEvent.kind === 'Dawn' ? 'Astronomical dawn' : 'Astronomical dark'} value={events.darkEvent.event ? formatTime(events.darkEvent.event.time) : '—'} detail={sun.altitudeDeg < -18 ? 'Dark sky now' : `Sun ${sun.altitudeDeg.toFixed(1)}° altitude`} />
      </div>

      <section className="panel">
        <div className="panelHeader">
          <div><p className="eyebrow">SOLAR SYSTEM</p><h3>What is up right now</h3></div>
          <span className="mutedText">Geometric altitude</span>
        </div>
        <div className="targetTable">
          {planets.map((p) => (
            <div className="targetRow" key={p.body}>
              <div className="targetName"><strong>{p.body}</strong><span>{altitudeLabel(p.altitudeDeg)}</span></div>
              <div className="targetMetric"><span>Altitude</span><strong>{p.altitudeDeg.toFixed(1)}°</strong></div>
              <div className="targetMetric"><span>Direction</span><strong>{compassDirection(p.azimuthDeg)} {p.azimuthDeg.toFixed(0)}°</strong></div>
              <div className={`horizonPill ${p.altitudeDeg >= 0 ? 'up' : 'down'}`}>{p.altitudeDeg >= 0 ? 'Above horizon' : 'Below horizon'}</div>
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}

function ObjectFinder({ observer, onOpenSettings }: { observer: Observer | null; onOpenSettings: () => void }) {
  if (!observer) return <LocationRequired onOpenSettings={onOpenSettings} />;
  return <ObjectFinderReady observer={observer} />;
}

function ObjectFinderReady({ observer }: { observer: Observer }) {
  const now = useNow();
  const [body, setBody] = useState<BodyName>('Saturn');
  const minuteBucket = Math.floor(now.getTime() / 60_000);
  const position = getBodyPosition(body, observer, now);
  const moonKm = moonDistanceKm(position);
  const events = useMemo(() => {
    const start = new Date(minuteBucket*60_000);
    return {
      rise: findNextRise(body, observer, start),
      set: findNextSet(body, observer, start),
      twenty: position.altitudeDeg >= 20 ? null : findNextAltitudeCrossing(body, observer, start, 20, 1, 72),
    };
  }, [body, observer.latitude, observer.longitude, minuteBucket, position.altitudeDeg >= 20]);

  return (
    <section className="pageStack">
      <div className="finderBar">
        <label>
          <span>Object</span>
          <select value={body} onChange={(e) => setBody(e.target.value as BodyName)}>
            {SOLAR_SYSTEM_BODIES.map((name) => <option key={name}>{name}</option>)}
          </select>
        </label>
        <div className="finderNow"><span>Calculated for</span><strong>{formatTime(now)}</strong></div>
      </div>

      <article className="objectHero">
        <div>
          <p className="eyebrow">CURRENT POINTING</p>
          <h3>{body}</h3>
          <p className="objectStatus">{position.altitudeDeg >= 0 ? `${altitudeLabel(position.altitudeDeg)} in the ${compassDirection(position.azimuthDeg)}` : 'Currently below your horizon'}</p>
        </div>
        <div className="pointingReadout">
          <div><span>ALT</span><strong>{position.altitudeDeg.toFixed(1)}°</strong></div>
          <div><span>AZ</span><strong>{position.azimuthDeg.toFixed(1)}°</strong><small>{compassDirection(position.azimuthDeg)}</small></div>
        </div>
      </article>

      <div className="detailGrid">
        <DetailCard label="Right ascension" value={formatRA(position.raHours)} />
        <DetailCard label="Declination" value={formatSignedAngle(position.decDeg)} />
        <DetailCard label="Distance" value={moonKm ? `${Math.round(moonKm).toLocaleString()} km` : `${position.distance.toFixed(position.distance < 1 ? 3 : 2)} AU`} />
        <DetailCard label="20° altitude" value={position.altitudeDeg >= 20 ? 'Above it now' : (events.twenty ? formatEvent(events.twenty.time, now) : 'Not in 72 h')} />
        <DetailCard label="Next rise" value={events.rise ? formatEvent(events.rise.time, now) : 'Not in 48 h'} />
        <DetailCard label="Next set" value={events.set ? formatEvent(events.set.time, now) : 'Not in 48 h'} />
      </div>

      <section className="panel notePanel">
        <p className="eyebrow">HOW TO AIM</p>
        <h3>{aimingSentence(position.altitudeDeg, position.azimuthDeg)}</h3>
        <p>Azimuth is measured clockwise from north: east 90°, south 180°, west 270°. Altitude is the angle above the horizon.</p>
      </section>
    </section>
  );
}

function LocationRequired({ onOpenSettings }: { onOpenSettings: () => void }) {
  return (
    <section className="placeholder">
      <div className="orbit">◎</div>
      <h3>Set an observing location first</h3>
      <p>Altitude, azimuth, rise/set times, and darkness all depend on where the telescope is on Earth.</p>
      <button className="primaryButton" onClick={onOpenSettings}>Open Settings</button>
    </section>
  );
}

function SettingsPage({ settings, setSettings }: { settings: Settings; setSettings: React.Dispatch<React.SetStateAction<Settings>> }) {
  const [geoMessage, setGeoMessage] = useState('');
  const observer = parseObserver(settings);

  const useDeviceLocation = () => {
    if (!navigator.geolocation) {
      setGeoMessage('This device does not expose geolocation to the app.');
      return;
    }
    setGeoMessage('Requesting device location…');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setSettings((s) => ({
          ...s,
          latitude: pos.coords.latitude.toFixed(6),
          longitude: pos.coords.longitude.toFixed(6),
          elevationM: pos.coords.altitude == null ? s.elevationM : Math.round(pos.coords.altitude).toString(),
        }));
        setGeoMessage(`Location captured${pos.coords.accuracy ? ` · ±${Math.round(pos.coords.accuracy)} m` : ''}.`);
      },
      (err) => setGeoMessage(`Could not get device location: ${err.message}`),
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 },
    );
  };

  return (
    <section className="settingsCard">
      <div className="settingsHeading">
        <div><h3>Observing location</h3><p>Saved locally on this device. Longitude is negative west of Greenwich.</p></div>
        <span className={`validationBadge ${observer ? 'valid' : ''}`}>{observer ? 'Valid location' : 'Location incomplete'}</span>
      </div>
      <div className="fieldGrid locationFields">
        <label>Location name<input value={settings.locationName} placeholder="e.g. Home or Farm" onChange={(e) => setSettings((s) => ({ ...s, locationName: e.target.value }))} /></label>
        <label>Latitude<input inputMode="decimal" value={settings.latitude} placeholder="36.0000" onChange={(e) => setSettings((s) => ({ ...s, latitude: e.target.value }))} /></label>
        <label>Longitude<input inputMode="decimal" value={settings.longitude} placeholder="-86.0000" onChange={(e) => setSettings((s) => ({ ...s, longitude: e.target.value }))} /></label>
        <label>Elevation (m)<input inputMode="decimal" value={settings.elevationM} placeholder="0" onChange={(e) => setSettings((s) => ({ ...s, elevationM: e.target.value }))} /></label>
      </div>
      <div className="inlineActions">
        <button className="secondaryButton" onClick={useDeviceLocation}>Use device location</button>
        {geoMessage && <span className="mutedText">{geoMessage}</span>}
      </div>

      <div className="settingsDivider" />
      <h3>Night display</h3>
      <p>The app dimmer affects Astronomy Companion itself. Hardware backlight control will come with the desktop-specific shell.</p>

      <div className="settingsDivider" />
      <h3>Offline behavior</h3>
      <p>The v0.2 Sun, Moon, and planet calculations are built into the app. Current positions and event searches do not call an online astronomy service.</p>
    </section>
  );
}

function SummaryCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <article className="card"><span className="cardLabel">{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}

function DetailCard({ label, value }: { label: string; value: string }) {
  return <article className="detailCard"><span>{label}</span><strong>{value}</strong></article>;
}

function Placeholder({ title, text }: { title: string; text: string }) {
  return <section className="placeholder"><div className="orbit">◎</div><h3>{title}</h3><p>{text}</p></section>;
}

function formatTime(date: Date): string {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date);
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).format(date);
}

function relativeTime(target: Date, now: Date): string {
  const minutes = Math.round((target.getTime() - now.getTime()) / 60_000);
  if (minutes < 1) return 'now';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `in ${h}h ${m}m` : `in ${m}m`;
}

function formatEvent(target: Date, now: Date): string {
  const sameDay = target.toDateString() === now.toDateString();
  return sameDay ? `${formatTime(target)} · ${relativeTime(target, now)}` : `${formatDate(target)} ${formatTime(target)}`;
}

function formatRA(hours: number): string {
  const h = Math.floor(hours);
  const minFloat = (hours - h)*60;
  const m = Math.floor(minFloat);
  const s = Math.round((minFloat - m)*60);
  return `${h}h ${m}m ${s}s`;
}

function formatSignedAngle(deg: number): string {
  const sign = deg >= 0 ? '+' : '−';
  const v = Math.abs(deg);
  const d = Math.floor(v);
  const m = Math.round((v-d)*60);
  return `${sign}${d}° ${m}′`;
}

function skyStateText(sunAltitude: number): string {
  if (sunAltitude >= 0) return 'Daylight right now.';
  if (sunAltitude >= -6) return 'Civil twilight.';
  if (sunAltitude >= -12) return 'Nautical twilight.';
  if (sunAltitude >= -18) return 'Astronomical twilight.';
  return 'The sky is astronomically dark.';
}

function aimingSentence(altitude: number, azimuth: number): string {
  if (altitude < 0) return `Wait for it to rise; its bearing is currently ${compassDirection(azimuth)}.`;
  return `Face ${compassDirection(azimuth)} (${azimuth.toFixed(0)}°) and aim ${altitude.toFixed(0)}° above the horizon.`;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
