import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Exercise the real no-WebGL raster path without a browser dependency.
function harness(sample = () => 200) {
  const created = [];
  let sourceReads = 0;
  let rasterBuilds = 0;
  class Canvas {
    constructor() {
      this.width = 0;
      this.height = 0;
      this.calls = [];
      this.context = {
        setTransform: (...args) => this.calls.push(['setTransform', ...args]),
        clearRect: (...args) => this.calls.push(['clearRect', ...args]),
        save() {}, restore() {},
        translate: (...args) => this.calls.push(['translate', ...args]),
        rotate: (...args) => this.calls.push(['rotate', ...args]),
        scale: (...args) => this.calls.push(['scale', ...args]),
        drawImage: (image, ...args) => { this.lastImage = image; this.calls.push(['drawImage', ...args]); },
        getImageData: () => {
          sourceReads++;
          const data = new Uint8ClampedArray(this.width*this.height*4);
          for (let y = 0; y < this.height; y++) for (let x = 0; x < this.width; x++) {
            const value = sample(x, y, this.width, this.height);
            const offset = (y*this.width+x)*4;
            data.set([value,value,value,255], offset);
          }
          return { data };
        },
        createImageData: (width, height) => ({ width, height, data: new Uint8ClampedArray(width*height*4) }),
        putImageData: image => { this.pixels = image; rasterBuilds++; }
      };
      created.push(this);
    }
    getContext(type) { return type === '2d' ? this.context : null; }
    addEventListener() {}
    removeEventListener() {}
  }
  const images = [];
  class FakeImage {
    constructor() { this.naturalWidth = 128; this.naturalHeight = 64; images.push(this); }
  }
  const sandbox = { window: {}, document: { createElement: () => new Canvas() }, Image: FakeImage, console };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync('frontend/moon-render.js', 'utf8'), sandbox, { filename: 'frontend/moon-render.js' });
  const canvas = new Canvas();
  const renderer = sandbox.window.noctemMoonRenderer.create(canvas, { textureUrl: 'data/test.jpg' });
  const pixel = (x, y) => {
    const raster = canvas.lastImage;
    assert.ok(raster?.pixels, 'the renderer produced a raster');
    const ix = Math.floor((x+1)*raster.width/2);
    const iy = Math.floor((1-y)*raster.height/2);
    return [...raster.pixels.data.slice((iy*raster.width+ix)*4, (iy*raster.width+ix)*4+4)];
  };
  return { canvas, renderer, images, pixel, stats: () => ({ sourceReads, rasterBuilds }) };
}

const g = { east: [0,1,0], north: [0,0,1], view: [1,0,0], sun: [1,0,0] };
const drawOptions = { geometry: g, width: 512, height: 512, centerX: 256, centerY: 256, radius: 240, rotationDeg: 0, mirror: false, phase: true, nightTerrain: 0.12, nightMode: false };
const h = harness();
h.renderer.draw(drawOptions);
assert.equal(h.stats().rasterBuilds, 0, 'draw before image load waits for texture');
h.images[0].onload();
await h.renderer.ready;
assert.equal(h.renderer.backend, 'canvas2d');
assert.equal(h.canvas.width, 512);
assert.equal(h.pixel(0,0)[0], 209, 'subsolar point preserves terrain contrast');
assert.equal(h.pixel(0.9,0.9)[3], 0, 'outside the spherical disk stays transparent');
const originalBuilds = h.stats().rasterBuilds;
h.renderer.draw({ ...drawOptions, centerX: 300, rotationDeg: 90, mirror: true });
assert.equal(h.stats().rasterBuilds, originalBuilds, 'pan, rotate and mirror reuse the terrain raster');
assert.deepEqual(h.canvas.calls.findLast(x => x[0] === 'translate'), ['translate',300,256]);
assert.deepEqual(h.canvas.calls.findLast(x => x[0] === 'rotate'), ['rotate',Math.PI/2]);
assert.deepEqual(h.canvas.calls.findLast(x => x[0] === 'scale'), ['scale',-1,1], 'mirror precedes clockwise screen rotation');

h.renderer.draw({ ...drawOptions, geometry: { ...g, sun: [0,1,0] } });
assert.ok(h.pixel(0.7,0)[0] > 170, 'lunar east is illuminated at waxing quarter');
assert.ok(h.pixel(-0.7,0)[0] < 30, 'opposite hemisphere uses the dark terrain floor');
h.renderer.draw({ ...drawOptions, geometry: { ...g, sun: [0,-1,0] } });
assert.ok(h.pixel(-0.7,0)[0] > 170, 'waning quarter illuminates lunar west');
assert.ok(h.pixel(0.7,0)[0] < 30);
h.renderer.draw({ ...drawOptions, geometry: { ...g, sun: [-1,0,0] }, nightTerrain: 0 });
assert.equal(h.pixel(0,0)[0], 0, 'new moon with dark terrain disabled has an unlit center');
h.renderer.draw({ ...drawOptions, geometry: { ...g, sun: [-1,0,0] }, phase: false });
assert.equal(h.pixel(0,0)[0], 209, 'atlas mode reveals terrain independent of phase');
h.renderer.draw({ ...drawOptions, nightMode: true });
assert.deepEqual(h.pixel(0,0), [209,0,0,255], 'night mode has no green or blue light');
assert.equal(h.stats().sourceReads, 1, 'software texture extraction is cached');
h.renderer.draw({ ...drawOptions, radius: 0 });
assert.equal(h.canvas.calls.at(-1)[0], 'clearRect', 'zero radius clears the surface');
h.renderer.dispose();
const callsAfterDispose = h.canvas.calls.length;
h.renderer.draw(drawOptions);
assert.equal(h.canvas.calls.length, callsAfterDispose, 'disposed renderer does no work');

// A latitude-coded fixture catches north/south texture inversion independently
// of the uniform fixture used for the phase tests above.
const north = harness((x,y,w,height) => 40 + (1-y/(height-1))*170);
north.images[0].onload();
await north.renderer.ready;
north.renderer.draw({ ...drawOptions, phase: false });
assert.ok(north.pixel(0,0.7)[0] > north.pixel(0,-0.7)[0] + 70, 'north samples the top of the equirectangular map');
const east = harness((x,y,width) => 40 + x/(width-1)*170);
east.images[0].onload();
await east.renderer.ready;
east.renderer.draw({ ...drawOptions, phase: false });
assert.ok(east.pixel(0.7,0)[0] > east.pixel(-0.7,0)[0] + 40, 'east-positive longitude samples toward the right of the map');
const failure = harness();
failure.images[0].onerror();
await assert.rejects(failure.renderer.ready, /could not be loaded/);
const cancelled = harness();
cancelled.renderer.dispose();
await assert.rejects(cancelled.renderer.ready, /closed before/);
console.log('moon renderer checks passed: texture registration, quarter/new/full illumination, night mode, orientation transforms, raster caching, loading and disposal');
