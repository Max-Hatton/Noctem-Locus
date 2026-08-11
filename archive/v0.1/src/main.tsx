import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

type Page = 'Tonight' | 'Find Object' | 'Equipment' | 'Observations' | 'Settings';
type ThemeMode = 'day' | 'night';

type Settings = {
  theme: ThemeMode;
  brightness: number;
  locationName: string;
  latitude: string;
  longitude: string;
};

const defaultSettings: Settings = {
  theme: 'night',
  brightness: 45,
  locationName: '',
  latitude: '',
  longitude: '',
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

function App() {
  const [page, setPage] = useState<Page>('Tonight');
  const [settings, setSettings] = useState<Settings>(loadSettings);

  useEffect(() => {
    localStorage.setItem('astro.settings', JSON.stringify(settings));
  }, [settings]);

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
              <p>Foundation v0.1</p>
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
            <div className="status"><span className="statusDot" /> Local data</div>
          </header>

          {page === 'Tonight' && <Tonight />}
          {page === 'Find Object' && <Placeholder title="Object Finder" text="Next: search stars, planets, Messier objects, and calculate their live altitude/azimuth." />}
          {page === 'Equipment' && <Placeholder title="Equipment" text="Next: telescope and eyepiece profiles, magnification, exit pupil, and true field of view." />}
          {page === 'Observations' && <Placeholder title="Observation Log" text="Next: local observing notes that remain on the laptop with no internet connection." />}
          {page === 'Settings' && <SettingsPage settings={settings} setSettings={setSettings} />}
        </main>
      </div>
      <div className="brightnessOverlay" style={{ opacity: dimOpacity }} />
    </div>
  );
}

function Tonight() {
  return (
    <section className="pageGrid">
      <article className="heroCard">
        <p className="eyebrow">THE BASE IS RUNNING</p>
        <h3>Your observing dashboard will live here.</h3>
        <p>
          The interface, offline settings storage, navigation, night palette, and software dimmer are working.
          Our next astronomy layer will calculate the Sun, Moon, planets, and target visibility from your observing location.
        </p>
      </article>
      <article className="card"><span className="cardLabel">Moon</span><strong>—</strong><small>Astronomy engine next</small></article>
      <article className="card"><span className="cardLabel">Darkness</span><strong>—</strong><small>Sunset + twilight next</small></article>
      <article className="card"><span className="cardLabel">Best targets</span><strong>—</strong><small>Planner next</small></article>
    </section>
  );
}

function SettingsPage({ settings, setSettings }: { settings: Settings; setSettings: React.Dispatch<React.SetStateAction<Settings>> }) {
  return (
    <section className="settingsCard">
      <h3>Observing location</h3>
      <p>This is saved only on this device for now.</p>
      <div className="fieldGrid">
        <label>Location name<input value={settings.locationName} placeholder="e.g. Home or Farm" onChange={(e) => setSettings((s) => ({ ...s, locationName: e.target.value }))} /></label>
        <label>Latitude<input value={settings.latitude} placeholder="36.0000" onChange={(e) => setSettings((s) => ({ ...s, latitude: e.target.value }))} /></label>
        <label>Longitude<input value={settings.longitude} placeholder="-86.0000" onChange={(e) => setSettings((s) => ({ ...s, longitude: e.target.value }))} /></label>
      </div>
      <div className="settingsDivider" />
      <h3>Night display</h3>
      <p>The app dimmer affects only Astronomy Companion. Hardware backlight control will be a later desktop integration.</p>
    </section>
  );
}

function Placeholder({ title, text }: { title: string; text: string }) {
  return <section className="placeholder"><div className="orbit">◎</div><h3>{title}</h3><p>{text}</p></section>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
