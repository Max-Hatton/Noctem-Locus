import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('frontend/weather-v012.js', 'utf8');
const sandbox = {
  console,
  Date,
  Math,
  Number,
  String,
  Object,
  Array,
  Set,
  Promise,
  URLSearchParams,
  navigator: { onLine: false, language: 'en-US', languages: ['en-US'] },
  settings: { latitude: '36.2', longitude: '-86.3', elevationM: '180', locationName: 'Test', weather: { enabled: false } },
  saveSettings() {},
  toast() {},
  PAGES: ['Tonight','Planner','Settings'],
  page: 'Tonight',
  tickTimer: 0,
  clearInterval() {},
  setInterval() { return 1; },
  renderPage() {},
  renderShell() {},
  renderTonight() {},
  renderSettings() {},
  parseObserver() { return null; },
  getBodyPosition() { return { altitudeDeg: -30 }; },
  searchObjects() { return []; },
  OBJECT_CATALOG: [],
  catalogObject() { return null; },
  positionForObject() { return { altitudeDeg: 0, azimuthDeg: 0 }; },
  objectDisplayName(o) { return o?.name || ''; },
  fetch() { throw new Error('Network must not be used in smoke test'); },
  document: {
    title: '',
    head: { appendChild() {} },
    getElementById() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    createElement() { return { id:'', style:{}, dataset:{}, innerHTML:'', textContent:'', appendChild(){}, addEventListener(){} }; }
  }
};
sandbox.window = { __TAURI__: {}, addEventListener() {}, noctemLocusPlanner: null };
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: 'weather-v012.js' });

const api = sandbox.window.noctemWeatherV012;
if (!api) throw new Error('weather API was not exported');

const clear = api.observingScore({
  temperatureC: 15, dewPointC: 8, humidity: 55, cloud: 3, cloudLow: 2, cloudMid: 2, cloudHigh: 3,
  precipProbability: 0, precipitationMm: 0, visibilityM: 30000, windKmh: 5, gustKmh: 8
});
const poor = api.observingScore({
  temperatureC: 15, dewPointC: 14.5, humidity: 97, cloud: 95, cloudLow: 90, cloudMid: 80, cloudHigh: 70,
  precipProbability: 80, precipitationMm: 1.2, visibilityM: 5000, windKmh: 28, gustKmh: 45
});
if (!(clear.score > poor.score && clear.score >= 70 && poor.score < 40)) throw new Error(`Unexpected weather scores: clear=${clear.score}, poor=${poor.score}`);
if (api.dewRisk({temperatureC:10,dewPointC:9.2,humidity:93}).level !== 'High') throw new Error('High dew risk was not detected');
if (api.dewRisk({temperatureC:15,dewPointC:5,humidity:50}).level !== 'Low') throw new Error('Low dew risk was not detected');
console.log(`weather runtime ok: clear ${clear.score}, poor ${poor.score}, dew logic ok`);
