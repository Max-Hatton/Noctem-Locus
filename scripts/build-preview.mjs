import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

// Build a double-clickable review copy. All browser-only adaptations below are
// applied to strings in this output; the desktop application's sources are not
// changed, and the preview never reads the desktop's storage keys or photo DB.
const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--output') {
  console.error('Usage: node scripts/build-preview.mjs --output <preview.html>');
  process.exit(args.includes('--help') ? 0 : 1);
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const frontend = path.join(root, 'frontend');
const output = path.resolve(args[1]);
if (output === path.join(frontend, 'index.html')) throw new Error('Preview output must not overwrite the application source');
const read = name => fs.readFileSync(path.join(frontend, name), 'utf8').replace(/\r\n/g, '\n');
const safeJson = value => JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
const inline = source => `<script>\n${source.replace(/<\/script/gi, '<\\/script')}\n</script>`;
function replaceOnce(source, needle, replacement, description) {
  const first = source.indexOf(needle);
  if (first < 0 || source.indexOf(needle, first + needle.length) >= 0) {
    throw new Error(`Preview adaptation no longer matches the source: ${description}`);
  }
  return source.slice(0, first) + replacement + source.slice(first + needle.length);
}
const isolateStorage = source => source
  .replaceAll('astro.settings', 'noctem.moon.preview')
  .replaceAll('astronomy-companion-observation-media', 'noctem.moon.preview.photos')
  .replace(/\blocalStorage\b/g, 'window.noctemPreviewStorage');

let bridge = read('native-bridge.js');
const featureSection = bridge.slice(bridge.indexOf('async function loadV012Features()'));
const features = [...featureSection.matchAll(/\['([^']+\.js)'\s*,\s*'([^']+)'\]/g)].map(match => [match[1], match[2]]);
if (!features.length || features.at(-1)?.[0] !== 'moon-map.js') throw new Error('The native loader must contain Moon Map before building its preview');
const textureUrl = `data:image/jpeg;base64,${fs.readFileSync(path.join(frontend, 'data/moon-surface.jpg')).toString('base64')}`;
const credits = read('data/MOON_DATA.md');
const scripts = {};
for (const [file] of features) {
  let source = isolateStorage(read(file));
  if (file === 'moon-map.js') {
    source = replaceOnce(source, "new URL('data/moon-surface.jpg',document.baseURI).href", 'window.noctemPreviewTexture', 'Moon texture URL');
    source = replaceOnce(source, 'href="data/MOON_DATA.md" target="_blank" rel="noopener"', 'href="#moon-preview-credits" data-preview-credits', 'Moon credits link');
  }
  if (file === 'weather-v012.js') {
    source = replaceOnce(source,
      'async function refreshForecast({force = false, site = activeSite(), silent = false} = {}) {\n    ensureWeatherSettings();',
      "async function refreshForecast({force = false, site = activeSite(), silent = false} = {}) {\n    ensureWeatherSettings();\n    if (!settings.weather.enabled) throw new Error('Weather is disabled in this browser preview.');",
      'disabled weather refresh guard');
  }
  new vm.Script(source, { filename: file });
  scripts[file] = source;
}

bridge = isolateStorage(bridge);
bridge = replaceOnce(bridge, "if (badge) badge.textContent = '● Native storage active';", "if (badge) badge.textContent = 'Browser preview · separate data';", 'native badge');
bridge = replaceOnce(bridge, 'function augmentSettings() {', 'function augmentSettings() {\n    return; // Native backup controls are unavailable in the browser preview.', 'native backup settings');
bridge = bridge.replaceAll('Logs and photos stay offline in Noctem Locus native app storage.', 'Logs and photos stay in this browser preview, separately from your desktop app.')
  .replaceAll('Original image files are stored in the Noctem Locus application-data folder and included in Full Backup.', 'Images use separate browser preview storage. They are not added to the desktop app.')
  .replaceAll('Native data bridge could not start; compatibility storage is still available.', 'The browser preview could not finish loading.');
const loaderStart = bridge.indexOf('  function loadFeatureScript(file, tag) {');
const loaderEnd = bridge.indexOf('\n  async function loadV012Features()', loaderStart);
if (loaderStart < 0 || loaderEnd < 0) throw new Error('Native script-loader boundary changed');
bridge = bridge.slice(0, loaderStart) + '  function loadFeatureScript(file, tag) {\n    return window.noctemPreviewLoadFeature(file, tag);\n  }\n' + bridge.slice(loaderEnd);
bridge = replaceOnce(bridge,
  "    ]) await loadFeatureScript(file, tag);\n    if (typeof renderShell === 'function') renderShell();",
  '    ]) await loadFeatureScript(file, tag);\n    window.noctemPreviewFinish();',
  'preview completion hook');
new vm.Script(bridge, { filename: 'preview-native-bridge.js' });

const seed = {
  theme: 'day', brightness: 100,
  locationName: 'Chicago · preview site', latitude: '41.8781', longitude: '-87.6298', elevationM: '181',
  locations: [{ id:'site-preview-chicago', name:'Chicago · preview site', latitude:'41.8781', longitude:'-87.6298', elevationM:'181', horizon:[0,0,0,0,0,0,0,0] }],
  activeLocationId:'site-preview-chicago',
  equipment: {
    telescopes: [{ id:'scope-preview-xt8', name:'Orion SkyQuest XT8 IntelliScope', apertureMm:'203', focalLengthMm:'1200', type:'Reflector' }],
    activeTelescopeId:'scope-preview-xt8',
    eyepieces: [
      { id:'preview-ep32', name:'32 mm example · assumed 50° AFOV', focalLengthMm:'32', apparentFovDeg:'50' },
      { id:'preview-ep3', name:'3 mm example · assumed 50° AFOV', focalLengthMm:'3', apparentFovDeg:'50' }
    ]
  },
  navigation:{finderFovDeg:'5'}, alignment:{samples:[],matrix:null,lastRaw:null}, observations:[],
  weather:{enabled:false,alerts:{enabled:false}},
  moonMap:{orientation:'dobsonian'}
};

const bootstrap = `(() => {
  'use strict';
  const KEY = 'noctem.moon.preview';
  const memory = new Map();
  window.noctemPreviewStorage = {
    getItem(key) { try { return localStorage.getItem(key) ?? memory.get(key) ?? null; } catch (_) { return memory.get(key) ?? null; } },
    setItem(key, value) { memory.set(key, String(value)); try { localStorage.setItem(key, String(value)); } catch (_) {} },
    removeItem(key) { memory.delete(key); try { localStorage.removeItem(key); } catch (_) {} }
  };
  const store = window.noctemPreviewStorage;
  let data;
  try { data = JSON.parse(store.getItem(KEY)); } catch (_) {}
  if (!data || typeof data !== 'object') data = ${safeJson(seed)};
  data.weather ||= {};
  data.weather.enabled = false;
  data.weather.alerts ||= {};
  data.weather.alerts.enabled = false;
  store.setItem(KEY, JSON.stringify(data));
  window.__TAURI__ = { core: { invoke: async (command, args = {}) => {
    switch (command) {
      case 'native_load_state': return store.getItem(KEY);
      case 'native_save_state': store.setItem(KEY, args.stateJson); return true;
      case 'native_info': return {dataDir:'Separate browser preview storage',photoCount:0,photoBytes:0,storageFormatVersion:'preview'};
      case 'native_photo_exists': return false;
      case 'native_load_photo': return null;
      case 'native_delete_photo': case 'native_delete_observation_photos': return true;
      case 'native_create_backup': case 'native_restore_backup': return {cancelled:true};
      default: throw new Error('This desktop action is unavailable in the browser preview');
    }
  } } };
  window.noctemPreviewTexture = ${safeJson(textureUrl)};
  const scripts = ${safeJson(scripts)};
  window.noctemPreviewLoadFeature = (file, tag) => new Promise((resolve, reject) => {
    if (!Object.hasOwn(scripts, file)) return reject(new Error('Missing bundled preview feature: ' + file));
    const script = document.createElement('script');
    script.dataset.noctemFeature = tag;
    script.textContent = scripts[file];
    let error;
    const capture = event => { error = event.error || new Error(event.message); };
    window.addEventListener('error', capture);
    document.head.appendChild(script);
    window.removeEventListener('error', capture);
    if (error) return reject(error);
    if (file !== 'planner.js') return resolve();
    // Planner finishes installing asynchronously even after its script runs.
    const started = Date.now();
    const wait = () => {
      if (window.noctemLocusPlanner) resolve();
      else if (Date.now() - started > 5000) reject(new Error('Preview Planner initialization timed out'));
      else setTimeout(wait, 20);
    };
    wait();
  });
  const escapeHtml = text => String(text).replace(/[&<>\"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[char]));
  document.addEventListener('click', event => {
    if (!event.target.closest('[data-preview-credits]')) return;
    event.preventDefault();
    let dialog = document.getElementById('moon-preview-credits');
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.id = 'moon-preview-credits';
      dialog.style.cssText = 'max-width:780px;width:85vw;max-height:85vh;background:#10131d;color:#edf4ff;border:1px solid #424769;border-radius:12px;padding:22px;';
      dialog.innerHTML = '<form method="dialog"><button style="float:right;padding:6px 12px">Close</button></form><h2>Moon map data & credits</h2><p><a style="color:#adb6ff" href="https://astrogeology.usgs.gov/search/map/moon_lro_lroc_wac_global_morphology_mosaic_100m" target="_blank" rel="noopener">USGS surface product</a> · <a style="color:#adb6ff" href="https://planetarynames.wr.usgs.gov/" target="_blank" rel="noopener">IAU / USGS feature gazetteer</a></p><pre style="font:12px/1.6 system-ui;white-space:pre-wrap;overflow-wrap:anywhere">' + escapeHtml(${safeJson(credits)}) + '</pre>';
      document.body.appendChild(dialog);
    }
    dialog.showModal();
  });
  window.noctemPreviewFinish = () => {
    const decorate = () => {
      const badge = document.getElementById('buildBadge');
      if (badge) { badge.textContent = 'Browser preview · separate data'; badge.title = 'Sample Chicago location. This preview stores its own settings and never reads your desktop app data.'; }
      document.title = 'Noctem Locus · Moon Map browser preview';
    };
    const base = renderShell;
    renderShell = function previewRenderShell(...args) { const result = base.apply(this, args); decorate(); return result; };
    window.noctemMoonMap.open();
    decorate();
    window.__NOCTEM_PREVIEW_READY__ = true;
  };
})();`;
new vm.Script(bootstrap, { filename:'preview-bootstrap.js' });

let html = isolateStorage(read('index.html'));
// The original base page already contains its inline core and UI styles.
// Keep the encoding declaration in the first 1024 bytes for file:// launches.
html = replaceOnce(html, '<meta charset="UTF-8">', '<meta charset="UTF-8">' + inline(bootstrap), 'HTML character encoding');
html = replaceOnce(html, '</body>', inline(bridge) + '</body>', 'HTML body');
html = html.replace('<html lang="en">', '<html lang="en" data-noctem-preview="separate-data">');
if (/<script\b[^>]*\bsrc\s*=/i.test(html)) throw new Error('Preview has an external script dependency');
if (!html.includes('data:image/jpeg;base64,')) throw new Error('Preview texture was not embedded');
fs.mkdirSync(path.dirname(output), { recursive:true });
fs.writeFileSync(output, html, 'utf8');
console.log(`Built ${output} (${(Buffer.byteLength(html)/1024/1024).toFixed(2)} MB; ${features.length} bundled feature scripts; separate browser data).`);
