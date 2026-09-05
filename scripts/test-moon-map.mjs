import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// Controller integration checks: real astronomy and official catalog; only DOM,
// timers, and canvas output are replaced. Browser tests cover actual layout/GPU.
const root = fileURLToPath(new URL('../', import.meta.url));
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const decode = value => value.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const voidTags = new Set(['input', 'br', 'hr', 'img', 'meta', 'link']);

class Element {
  constructor(tagName, ownerDocument, attrs = {}) {
    this.tagName = tagName.toUpperCase(); this.ownerDocument = ownerDocument;
    this.attrs = attrs; this.children = []; this.parentElement = null;
    this.id = attrs.id || ''; this.className = attrs.class || '';
    this.style = {}; this.dataset = {}; this.listeners = new Map();
    this.value = decode(attrs.value || ''); this.checked = 'checked' in attrs;
    this.disabled = 'disabled' in attrs; this.open = 'open' in attrs;
    this._text = ''; this._html = ''; this.pointerIds = new Set();
    for (const [name, value] of Object.entries(attrs)) if (name.startsWith('data-')) {
      this.dataset[name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = decode(value);
    }
    this.classList = {toggle: (name, force) => {
      const classes = new Set(this.className.split(/\s+/));
      if (force) classes.add(name); else classes.delete(name);
      this.className = [...classes].filter(Boolean).join(' ');
    }};
  }
  appendChild(child) { child.parentElement = this; this.children.push(child); return child; }
  contains(node) { return this === node || this.children.some(child => child.contains(node)); }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
  set textContent(value) { this._text = String(value); this.children = []; }
  get innerHTML() { return this._html; }
  set innerHTML(html) {
    this._html = String(html); this.children = []; this._text = '';
    const stack = [this];
    for (const token of this._html.match(/<[^>]+>|[^<]+/g) || []) {
      if (token.startsWith('</')) { if (stack.length > 1) stack.pop(); continue; }
      if (token.startsWith('<!')) continue;
      if (!token.startsWith('<')) { stack.at(-1)._text += decode(token); continue; }
      const tag = token.match(/^<([a-z0-9-]+)/i)?.[1]?.toLowerCase();
      if (!tag) continue;
      const attrs = {};
      const body = token.slice(tag.length + 1, -1);
      for (const match of body.matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
        attrs[match[1]] = match[2] ?? match[3] ?? match[4] ?? '';
      }
      const child = new Element(tag, this.ownerDocument, attrs);
      stack.at(-1).appendChild(child);
      if (!voidTags.has(tag) && !token.endsWith('/>')) stack.push(child);
    }
  }
  matches(selector) {
    if (selector.startsWith('#')) return this.id === selector.slice(1);
    if (selector.startsWith('.')) return this.className.split(/\s+/).includes(selector.slice(1));
    const attr = selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
    if (attr) return attr[1] in this.attrs && (attr[2] === undefined || this.attrs[attr[1]] === attr[2]);
    return this.tagName.toLowerCase() === selector.toLowerCase();
  }
  querySelectorAll(selector) {
    const selectors = selector.split(',').map(s => s.trim()), found = [];
    const visit = node => { for (const child of node.children) {
      if (selectors.some(s => child.matches(s))) found.push(child);
      visit(child);
    }};
    visit(this); return found;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  addEventListener(type, callback) { const list = this.listeners.get(type) || []; list.push(callback); this.listeners.set(type, list); }
  dispatch(type, props = {}) {
    const event = {target: this, preventDefault() {}, stopPropagation() {}, ...props};
    if (this.disabled && type === 'click') return;
    this[`on${type}`]?.(event);
    for (const listener of this.listeners.get(type) || []) listener(event);
  }
  focus() { this.ownerDocument.activeElement = this; }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  getAttribute(name) { return this.attrs[name] ?? null; }
  getBoundingClientRect() { return {left: 0, top: 0, width: 800, height: 600}; }
  setPointerCapture(id) { this.pointerIds.add(id); }
  hasPointerCapture(id) { return this.pointerIds.has(id); }
  releasePointerCapture(id) { this.pointerIds.delete(id); }
  getContext() { return this.ownerDocument.canvasContext; }
}

function makeDocument() {
  const document = {baseURI: 'https://offline.test/', activeElement: null, title: ''};
  document.canvasContext = new Proxy({measureText: text => ({width: String(text).length * 6})}, {
    get: (obj, key) => key in obj ? obj[key] : () => {},
    set: (obj, key, value) => { obj[key] = value; return true; }
  });
  document.head = new Element('head', document);
  document.body = new Element('body', document);
  document.body.innerHTML = '<div id="page"></div>';
  document.createElement = tag => new Element(tag, document);
  document.getElementById = id => document.body.querySelector(`#${id}`);
  document.querySelector = selector => document.body.querySelector(selector);
  document.querySelectorAll = selector => document.body.querySelectorAll(selector);
  return document;
}

function start(initialSettings = {}) {
  const document = makeDocument(), frames = new Map(), intervals = new Map();
  const renderers = [], resizers = [], snapshots = [], toasts = [];
  let clock = Date.parse('2026-09-04T04:00:00Z'), nextId = 1, basePageCalls = 0;
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [clock])); }
    static now() { return clock; }
  }
  const settings = structuredClone({
    latitude: '41.88', longitude: '-87.63', elevationM: '180', theme: 'night',
    futureField: {keep: 'unchanged'},
    equipment: {activeTelescopeId: 'old', telescopes: [{id: 'old', name: 'Existing refractor', apertureMm: '90', focalLengthMm: '910', privateNote: 'keep'}], eyepieces: [{id: 'ep32', name: '32 mm Plossl', focalLengthMm: '32', apparentFovDeg: '50'}]},
    ...initialSettings
  });
  const sandbox = {
    console, document, Date: ClockDate, URL, Math, settings,
    PAGES: ['Tonight', 'Planner', 'Weather', 'Sky Map', 'Push-To', 'Equipment', 'Settings'],
    page: 'Tonight', tickTimer: 12345, skyMapResizeObserver: null, devicePixelRatio: 1,
    setInterval(fn) { const id = nextId++; intervals.set(id, fn); return id; },
    clearInterval(id) { intervals.delete(id); },
    requestAnimationFrame(fn) { const id = nextId++; frames.set(id, fn); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
    ResizeObserver: class { constructor(fn) { this.callback = fn; this.disconnected = false; resizers.push(this); } observe() {} disconnect() { this.disconnected = true; } },
    saveSettings() { snapshots.push(JSON.stringify(settings)); },
    toast(value) { toasts.push(value); },
    parseObserver() { return settings.latitude === '' ? null : {latitude: Number(settings.latitude), longitude: Number(settings.longitude), elevationM: Number(settings.elevationM)}; },
    locationRequired() { document.getElementById('page').innerHTML = '<p>Location required</p>'; },
    esc(value) { return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'); },
    localDateTimeInputValue(value) { const local = new ClockDate(value.getTime() - value.getTimezoneOffset() * 60000); return local.toISOString().slice(0, 16); },
    skyCanvasColors() { return {bg: '#000000', accent: '#bb8888', text: '#ffffff', muted: '#aaaaaa'}; },
    fetch() { throw new Error('Moon Map controller must remain offline'); },
    renderPage() { basePageCalls++; },
    renderShell() { sandbox.renderPage(); },
    noctemMoonRenderer: {create(canvas, options) {
      let resolveReady;
      const instance = {canvas, options, draws: [], disposed: false,
        ready: new Promise(resolve => { resolveReady = resolve; }),
        draw(options) { assert.equal(this.disposed, false, 'must not draw a disposed renderer'); this.draws.push(options); },
        dispose() { this.disposed = true; }, resolve() { resolveReady(); }};
      renderers.push(instance); return instance;
    }}
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  // Use the actual equipment calculation from the existing application.
  const index = read('frontend/index.html');
  const math = index.match(/^function eyepieceMath\([^\n]+/m)?.[0];
  assert.ok(math, 'existing equipment calculation must remain available');
  sandbox.num = value => Number(value) || null;
  vm.runInContext(math, sandbox);
  for (const file of ['vendor/astronomy.browser.min.js', 'moon-core.js', 'moon-features.js', 'moon-map.js']) {
    vm.runInContext(read(`frontend/${file}`), sandbox, {filename: file});
  }
  const flush = () => { for (const [id, callback] of [...frames]) { frames.delete(id); callback(); } };
  const element = id => { const el = document.getElementById(id); assert.ok(el, `control ${id} exists`); return el; };
  return {sandbox, document, settings, renderers, resizers, intervals, frames, snapshots, toasts, flush, element,
    get renderer() { return renderers.at(-1); },
    get draw() { return renderers.at(-1)?.draws.at(-1); },
    get basePageCalls() { return basePageCalls; },
    advance(ms) { clock += ms; for (const fn of [...intervals.values()]) fn(); flush(); },
    change(id, value, type = 'change') { const el = element(id); if (typeof value === 'boolean') el.checked = value; else el.value = String(value); el.dispatch(type); flush(); },
    click(id) { element(id).dispatch('click'); flush(); }
  };
}

// Shipping resources: load geometry/data/renderer before installing controller,
// and bundle everything inside the configured Tauri frontend directory.
const bridge = read('frontend/native-bridge.js');
const dependencies = ['vendor/astronomy.browser.min.js', 'moon-core.js', 'moon-features.js', 'moon-render.js', 'moon-map.js'];
let previous = -1;
for (const file of dependencies) {
  const offset = bridge.indexOf(`['${file}',`);
  assert.ok(offset > previous, `${file} must load after its Moon Map dependencies`);
  assert.ok(fs.statSync(path.join(root, 'frontend', file)).size > 0, `${file} is bundled`);
  previous = offset;
}
const config = JSON.parse(read('src-tauri/tauri.conf.json'));
assert.equal(path.resolve(root, 'src-tauri', config.build.frontendDist), path.join(root, 'frontend'));
for (const file of ['data/moon-surface.jpg', 'data/MOON_DATA.md', 'data/moon-source-manifest.json']) assert.ok(fs.existsSync(path.join(root, 'frontend', file)));
assert.match(bridge, /initialize\(\)\.then\(loadV012Features\)/, 'native settings must finish loading before feature migration');

const app = start();
assert.equal(app.sandbox.PAGES.indexOf('Moon Map'), app.sandbox.PAGES.indexOf('Sky Map') + 1);
assert.equal(app.sandbox.PAGES[app.sandbox.PAGES.indexOf('Moon Map') + 1], 'Push-To');
assert.equal(app.settings.equipment.telescopes.length, 2);
assert.equal(app.settings.equipment.activeTelescopeId, 'old', 'Moon profile must not change global active telescope');
assert.equal(app.settings.equipment.telescopes[0].privateNote, 'keep');
assert.deepEqual(app.settings.futureField, {keep: 'unchanged'});
assert.equal(app.settings.moonMap.orientation, 'dobsonian');
assert.equal(app.settings.moonMap.telescopeId, 'scope-xt8i');
vm.runInContext(read('frontend/moon-map.js'), app.sandbox);
assert.equal(app.settings.equipment.telescopes.length, 2, 'reinstall must not duplicate XT8');
assert.equal(app.sandbox.PAGES.filter(p => p === 'Moon Map').length, 1);

const existing = start({moonMap: {orientation: 'manual', telescopeId: 'old', manualRotation: 725, phase: false, extra: 'retain', calibrations: {old: {offsetDeg: 17, mirror: true, calibratedAt: '2026-08-01'}}}});
assert.equal(existing.settings.moonMap.manualRotation, 5);
assert.equal(existing.settings.moonMap.phase, false);
assert.equal(existing.settings.moonMap.extra, 'retain');
assert.equal(existing.settings.moonMap.calibrations.old.offsetDeg, 17);
const savedXt8 = start({equipment: {activeTelescopeId: 'custom-xt8', telescopes: [{id: 'custom-xt8', name: 'My Orion XT8', apertureMm: '203', focalLengthMm: '1200'}], eyepieces: []}});
assert.equal(savedXt8.settings.equipment.telescopes.length, 1, 'reuse existing XT8 equipment');
assert.equal(savedXt8.settings.moonMap.telescopeId, 'custom-xt8');

app.sandbox.noctemMoonMap.open({time: '2026-09-04T04:00:00Z'}); app.flush();
assert.equal(app.element('moonLive').textContent, 'FIXED TIME');
assert.equal(app.draw.geometry.date.toISOString(), '2026-09-04T04:00:00.000Z');
assert.equal(app.draw.phase, true);
assert.equal(app.renderer.options.textureUrl, 'https://offline.test/data/moon-surface.jpg');
assert.equal(app.intervals.size, 1);
app.change('moonPhase', false);
assert.equal(app.draw.phase, false);
assert.equal(app.element('moonDark').disabled, true);
app.change('moonPhase', true); app.change('moonDark', true);
assert.ok(app.draw.nightTerrain > 0);
app.change('moonOrientation', 'north'); assert.equal(app.draw.rotationDeg, 0);
app.change('moonOrientation', 'manual'); app.change('moonRotation', 37, 'input'); app.change('moonRotation', 37);
assert.equal(app.draw.rotationDeg, 37);
app.change('moonMirror', true); assert.equal(app.draw.mirror, true);
app.click('moonSaveMatch');
const savedOffset = app.settings.moonMap.calibrations['scope-xt8i'].offsetDeg;
assert.equal(app.settings.moonMap.orientation, 'dobsonian');
assert.ok(app.settings.moonMap.calibrations['scope-xt8i'].calibratedAt);
assert.ok(Math.abs(app.draw.rotationDeg - 37) < 1e-9, 'saving the match preserves current view');
const firstRotation = app.draw.rotationDeg;
const firstHorizon = app.draw.geometry.horizonRotationDeg;
app.document.querySelectorAll('[data-moon-step]').find(el => el.dataset.moonStep === '60').dispatch('click'); app.flush();
assert.equal(app.draw.geometry.date.toISOString(), '2026-09-04T05:00:00.000Z');
assert.equal(app.settings.moonMap.calibrations['scope-xt8i'].offsetDeg, savedOffset);
assert.ok(Math.abs(app.draw.rotationDeg - firstRotation) > 0.1, 'automatic orientation follows changed observing time');
const signed = app.sandbox.noctemMoonCore.signedDegrees;
const mirroredDrift = signed(app.draw.rotationDeg - firstRotation);
const skyDrift = signed(app.draw.geometry.horizonRotationDeg - firstHorizon);
assert.ok(Math.abs(signed(mirroredDrift + skyDrift)) < 1e-9,
  'mirrored automatic view must reverse the sign of the changing sky angle');
app.change('moonRotation', 75, 'input'); app.change('moonRotation', 75);
assert.ok(Math.abs(signed(app.draw.rotationDeg - 75)) < 1e-9,
  'mirrored Dobsonian slider must select the requested displayed angle');
app.change('moonTime', '1800-01-01T00:00');
assert.equal(app.draw.geometry.date.toISOString(), '2026-09-04T05:00:00.000Z', 'out-of-range time must not replace valid geometry');
app.click('moonClearMatch');
assert.equal(app.settings.moonMap.calibrations['scope-xt8i'].offsetDeg, 0);
assert.equal(app.draw.mirror, false);
assert.equal(app.settings.moonMap.calibrations['scope-xt8i'].calibratedAt, null);

// A saved mirror preference is dormant in North/Horizon modes. Saving the
// currently unmirrored view must not activate that dormant preference and flip
// the crater pattern when the control switches back to automatic Dobsonian.
const parityApp = start();
parityApp.sandbox.noctemMoonMap.open({time: '2026-09-04T04:00:00Z'}); parityApp.flush();
for (const mode of ['north', 'horizon']) {
  parityApp.change('moonMirror', true);
  parityApp.change('moonOrientation', mode);
  assert.equal(parityApp.settings.moonMap.calibrations['scope-xt8i'].mirror, true,
    `${mode}: test requires a dormant mirror preference`);
  const before = parityApp.draw;
  assert.equal(before.mirror, false, `${mode}: visible map is unmirrored`);
  parityApp.click('moonSaveMatch');
  assert.equal(parityApp.settings.moonMap.orientation, 'dobsonian');
  assert.equal(parityApp.draw.mirror, before.mirror,
    `${mode}: Save match must preserve the visible crater-pattern parity`);
  assert.equal(parityApp.settings.moonMap.calibrations['scope-xt8i'].mirror, false);
  assert.ok(Math.abs(signed(parityApp.draw.rotationDeg - before.rotationDeg)) < 1e-9,
    `${mode}: Save match must also preserve the displayed rotation`);
}
const plainAngle = parityApp.draw.rotationDeg;
const plainHorizon = parityApp.draw.geometry.horizonRotationDeg;
parityApp.document.querySelectorAll('[data-moon-step]').find(el => el.dataset.moonStep === '60').dispatch('click'); parityApp.flush();
assert.ok(Math.abs(signed(parityApp.draw.rotationDeg - plainAngle - (parityApp.draw.geometry.horizonRotationDeg - plainHorizon))) < 1e-9,
  'unmirrored automatic view must retain the sign of the changing sky angle');
parityApp.sandbox.noctemMoonMap.dispose();

// Search uses real official records, including secondary craters and unknown sizes.
app.change('moonType', 'crater'); app.change('moonSearch', 'Copernicus A', 'input');
const satellite = app.sandbox.noctemMoonFeatures.find(f => f.name === 'Copernicus A');
assert.ok(app.document.querySelectorAll('[data-moon-feature]').some(el => el.dataset.moonFeature === satellite.id));
app.change('moonType', ''); app.change('moonSearch', 'Copernicus', 'input');
const copernicus = app.sandbox.noctemMoonFeatures.find(f => f.name === 'Copernicus');
const result = app.document.querySelectorAll('[data-moon-feature]')[0];
assert.equal(result.dataset.moonFeature, copernicus.id, 'exact search match is first');
result.dispatch('click'); app.flush();
assert.match(app.element('moonDetail').innerHTML, /Copernicus/);
app.click('moonCenterFeature');
const centered = app.draw;
app.element('moonOverlay').dispatch('keydown', {key: 'ArrowRight'}); app.flush();
assert.ok(Math.abs(app.draw.centerX - centered.centerX - 35) < 1e-8, 'keyboard pan continues from centered feature');
app.click('moonCenterFeature');
app.element('moonOverlay').dispatch('keydown', {key: '+'}); app.flush();
const projected = app.sandbox.noctemMoonCore.project(copernicus.longitude, copernicus.latitude, app.draw.geometry);
const angle = app.draw.rotationDeg * Math.PI / 180;
const px = app.draw.mirror ? -projected.x : projected.x;
assert.ok(Math.abs(app.draw.centerX + app.draw.radius * (Math.cos(angle) * px + Math.sin(angle) * projected.y) - app.draw.width / 2) < 1e-8, 'keyboard zoom keeps feature centered');
const unknown = app.sandbox.noctemMoonFeatures.find(f => f.diameterKm === null);
app.change('moonSearch', unknown.name, 'input');
const unknownResult = app.document.querySelectorAll('[data-moon-feature]').find(el => el.dataset.moonFeature === unknown.id);
assert.ok(unknownResult); unknownResult.dispatch('click'); app.flush();
assert.match(app.element('moonDetail').innerHTML, /Unknown size/);
assert.doesNotMatch(app.element('moonDetail').innerHTML, />0 km</);

// Live updates preserve an unfinished eyepiece edit and its input element.
app.click('moonNow'); assert.equal(app.element('moonLive').textContent, 'LIVE');
app.change('moonEyepiece', 'custom');
const input = app.element('moonEpMm'); input.value = '25'; input.focus();
app.advance(10_000);
assert.equal(app.element('moonEpMm'), input);
assert.equal(input.value, '25');
app.change('moonEpMm', 25); app.change('moonEpAfov', 50);
assert.equal(app.settings.moonMap.customEyepiece.focalLengthMm, '25');
assert.equal(app.settings.moonMap.customEyepiece.apparentFovDeg, '50');
assert.equal(app.element('moonFitFov').disabled, false);
app.click('moonFitFov');
assert.ok(Number.isFinite(app.draw.radius) && app.draw.radius > 0);

// Navigate away while the image promise is pending; late completion must not
// touch the replacement page or restart animation/timers.
const retiring = app.renderer, resize = app.resizers.at(-1);
app.sandbox.page = 'Tonight'; app.sandbox.renderShell();
assert.equal(retiring.disposed, true); assert.equal(resize.disconnected, true);
assert.equal(app.frames.size, 0); assert.equal(app.intervals.size, 0);
assert.ok(app.basePageCalls > 0);
retiring.resolve(); await Promise.resolve(); await Promise.resolve();
assert.equal(app.frames.size, 0, 'late surface load must not schedule a disposed view');
app.sandbox.noctemMoonMap.open(); app.flush();
assert.equal(app.intervals.size, 1, 'reopening installs exactly one live timer');
assert.equal(app.settings.equipment.telescopes.length, 2);
app.sandbox.noctemMoonMap.dispose();
assert.equal(app.intervals.size, 0);
const noLocation = start({latitude: ''});
noLocation.sandbox.noctemMoonMap.open();
assert.equal(noLocation.renderers.length, 0, 'missing location must not start map rendering');
assert.equal(noLocation.intervals.size, 0);

console.log('Moon Map controller integration passed: offline assets/order, migration, phase, orientation/calibration, time, catalog/search, keyboard centering, equipment edits, and lifecycle.');
