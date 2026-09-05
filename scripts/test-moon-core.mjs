import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const base = new URL('../', import.meta.url);
const sandbox = {Date, Math, console};
vm.createContext(sandbox);
for (const file of ['frontend/vendor/astronomy.browser.min.js', 'frontend/moon-core.js']) {
  vm.runInContext(fs.readFileSync(new URL(file, base), 'utf8'), sandbox, {filename: file});
}
const core = sandbox.noctemMoonCore;
const A = sandbox.Astronomy;
const rad = Math.PI / 180;
let assertions = 0;
function near(actual, expected, tolerance, label) {
  assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected} +/- ${tolerance}, received ${actual}`);
  assertions++;
}
const angularNear = (actual, expected, tolerance, label) => near(core.signedDegrees(actual - expected), 0, tolerance, label);

// Independent JPL-derived NASA SVS fixtures, retrieved 2026-09-04.
// https://svs.gsfc.nasa.gov/5587/
// https://svs.gsfc.nasa.gov/vis/a000000/a005500/a005587/mooninfo_2026.json
// These are geocentric. NASA posangle and RA/Dec use the J2000 north direction.
// Columns: UTC, illuminated %, diameter arcsec, distance km, RA h, Dec deg,
// subsolar east longitude/latitude, sub-Earth east longitude/latitude, pole PA.
const fixtures = [
  ['2026-01-01T00:00:00Z',91.40,1985.1,361045,4.2348,26.3373,32.520,-1.346,-1.279,-6.556,349.893],
  ['2026-01-18T20:00:00Z',0.09,1812.7,395399,20.0861,-23.7629,175.779,-1.071,-4.090,4.441,349.192],
  ['2026-01-26T00:00:00Z',47.87,1924.3,372459,1.9571,16.4923,88.493,-0.894,-4.044,-5.409,340.599],
  ['2026-03-03T12:00:00Z',100.00,1872.9,382672,10.9292,6.4282,4.566,0.139,4.745,0.523,20.937],
  ['2026-04-15T00:00:00Z',8.21,1910.7,375107,23.4461,-2.2541,-153.243,1.122,-6.540,-1.593,338.306],
  ['2026-06-01T00:00:00Z',99.46,1763.8,406349,17.0311,-27.6361,-7.071,1.584,-0.116,6.388,6.109],
  ['2026-09-04T00:00:00Z',53.87,1932.2,370940,4.2656,26.5919,-87.725,-0.331,-2.156,-6.729,349.707],
  ['2026-12-01T00:00:00Z',52.93,1903.9,376442,10.4430,8.6455,-79.936,-1.471,6.670,1.346,19.924]
];
const maxErrors = {surfaceDeg:0, poleDeg:0, phasePercent:0, diameterArcsec:0};
for (const [date,phase,diameter,distance,ra,dec,solarLon,solarLat,earthLon,earthLat,pole] of fixtures) {
  const g = core.geometry(new Date(date));
  near(g.phase.illuminatedFraction * 100, phase, 0.04, `${date} illumination`);
  near(g.angularDiameterDeg * 3600, diameter, 0.6, `${date} angular diameter`);
  near(g.distanceKm, distance, 100, `${date} distance`);
  angularNear(g.j2000.raHours * 15, ra * 15, 1/60, `${date} right ascension`);
  near(g.j2000.decDeg, dec, 1/60, `${date} declination`);
  angularNear(g.subSolar.lonDeg, solarLon, 0.035, `${date} subsolar longitude`);
  near(g.subSolar.latDeg, solarLat, 0.02, `${date} subsolar latitude`);
  angularNear(g.subEarth.lonDeg, earthLon, 0.035, `${date} sub-Earth longitude`);
  near(g.subEarth.latDeg, earthLat, 0.02, `${date} sub-Earth latitude`);
  angularNear(g.polePositionAngleJ2000Deg, pole, 0.02, `${date} lunar pole angle`);
  maxErrors.surfaceDeg = Math.max(maxErrors.surfaceDeg, Math.abs(core.signedDegrees(g.subSolar.lonDeg-solarLon)),
    Math.abs(g.subSolar.latDeg-solarLat),Math.abs(core.signedDegrees(g.subEarth.lonDeg-earthLon)),Math.abs(g.subEarth.latDeg-earthLat));
  maxErrors.poleDeg = Math.max(maxErrors.poleDeg, Math.abs(core.signedDegrees(g.polePositionAngleJ2000Deg-pole)));
  maxErrors.phasePercent = Math.max(maxErrors.phasePercent, Math.abs(g.phase.illuminatedFraction*100-phase));
  maxErrors.diameterArcsec = Math.max(maxErrors.diameterArcsec, Math.abs(g.angularDiameterDeg*3600-diameter));
}

// Geographic/time cases exercise both hemispheres, the poles, dateline, high
// elevation, and near-horizon parallax. Compare our complete vector correction
// with Astronomy Engine's separately exposed, tested Equator/Horizon API.
const sites = [
  {latitude:41.88,longitude:-87.63,elevationM:180},
  {latitude:-33.87,longitude:151.21,elevationM:58},
  {latitude:0,longitude:179.9,elevationM:0},
  {latitude:89.9,longitude:0,elevationM:0},
  {latitude:-89.9,longitude:0,elevationM:0},
  {latitude:19.8,longitude:-155.5,elevationM:4205}
];
let maxParallax = 0;
for (const site of sites) for (const hour of [0,6,12,18]) {
  const date = new Date(Date.UTC(2026,8,4,hour));
  const g = core.geometry(date,site);
  const obs = new A.Observer(site.latitude,site.longitude,site.elevationM);
  const eq = A.Equator(A.Body.Moon,date,obs,true,false);
  const h = A.Horizon(date,obs,eq.ra,eq.dec,null);
  angularNear(g.raHours * 15,eq.ra * 15,1e-8,'topocentric RA');
  near(g.decDeg,eq.dec,1e-8,'topocentric Dec');
  near(g.altitudeDeg,h.altitude,1e-8,'geometric altitude');
  angularNear(g.azimuthDeg,h.azimuth,1e-8,'azimuth');
  near(g.distanceKm,eq.dist*A.KM_PER_AU,1e-6,'observer distance');

  // Independently compute parallactic angle by the spherical-triangle
  // identity, rather than reusing the vector algorithm in moon-core.js.
  const ha = (A.SiderealTime(date)*15+site.longitude-eq.ra*15)*rad;
  const dec = eq.dec*rad, lat = site.latitude*rad;
  const q = Math.atan2(Math.sin(ha),Math.tan(lat)*Math.cos(dec)-Math.sin(dec)*Math.cos(ha))/rad;
  angularNear(g.parallacticAngleDeg,q,1e-7,'parallactic angle sign');
  const rotation = core.rotationDegrees(g,'horizon')*rad;
  const zx = core.dot(g.zenith,g.east), zy = core.dot(g.zenith,g.north);
  // Clockwise canvas rotation applied to coordinates with y up.
  near(zx*Math.cos(rotation)+zy*Math.sin(rotation),0,1e-12,'horizon-up zenith x');
  assert.ok(-zx*Math.sin(rotation)+zy*Math.cos(rotation)>0,'zenith must point up, not down');
  angularNear(core.rotationDegrees(g,'dob'),core.rotationDegrees(g,'horizon')+180,1e-10,'Newtonian inversion');
  angularNear(core.rotationDegrees(g,'dob',31),core.rotationDegrees(g,'dob')+31,1e-10,'saved clockwise calibration');

  const center = core.project(g.subObserver.lonDeg,g.subObserver.latDeg,g);
  near(center.x,0,1e-12,'sub-observer center x');
  near(center.y,0,1e-12,'sub-observer center y');
  const unprojected = core.unproject(0.23,-0.41,g);
  const projected = core.project(unprojected.lonDeg,unprojected.latDeg,g);
  near(projected.x,0.23,1e-12,'inverse surface projection x');
  near(projected.y,-0.41,1e-12,'inverse surface projection y');
  near(core.dot(core.cross(g.east,g.north),g.view),1,1e-12,'basis handedness');
  assert.equal(core.project(180,0,g).visible,false,'far side must be hidden');
  const subsolar = core.project(g.subSolar.lonDeg,g.subSolar.latDeg,g);
  near(subsolar.sunAltitudeDeg,90,2e-6,'subsolar point illumination');
  const geocentric = core.geometry(date);
  maxParallax = Math.max(maxParallax, Math.acos(Math.max(-1,Math.min(1,core.dot(g.view,geocentric.view))))/rad);
}
assert.ok(maxParallax>0.85,'observer position must materially alter libration near the horizon');
const sea = core.geometry(new Date('2026-09-04T07:00:00Z'),{...sites[0],elevationM:0});
const high = core.geometry(new Date('2026-09-04T07:00:00Z'),{...sites[0],elevationM:5000});
assert.ok(Math.abs(sea.distanceKm-high.distanceKm)>2,'observer elevation must affect distance');
const zenithDate = new Date('2026-09-04T07:00:00Z');
const geoForZenith = core.geometry(zenithDate);
const nearZenith = core.geometry(zenithDate,{
  latitude:geoForZenith.decDeg,
  longitude:core.signedDegrees(geoForZenith.raHours*15-A.SiderealTime(zenithDate)*15),
  elevationM:0
});
assert.ok(nearZenith.altitudeDeg>89.5,'zenith test must put Moon near zenith');
assert.equal(nearZenith.orientationStable,false,'undefined horizon-up region must be flagged');

// Day/night side is operationally critical; a mirrored atlas gives wrong
// crater locations even if its illumination percentage looks plausible.
const waxing = core.geometry(new Date('2026-01-26T00:00:00Z'));
const waning = core.geometry(new Date('2026-09-04T00:00:00Z'));
assert.ok(waxing.phase.waxing && core.dot(waxing.sun,waxing.east)>0,'waxing illuminated side is lunar east/right');
assert.ok(!waning.phase.waxing && core.dot(waning.sun,waning.east)<0,'waning illuminated side is lunar west/left');
assert.equal(core.unproject(1.1,0,waxing),null,'outside-disk clicks have no coordinates');
assert.equal(core.rotationDegrees(waxing,'dob'),null,'telescope orientation needs a location');
assert.throws(()=>core.geometry(new Date('invalid')),/valid date/);
assert.throws(()=>core.geometry(new Date(),{latitude:91,longitude:0}),/valid observing location/);
assert.throws(()=>core.rotationDegrees(waxing,'unknown'),/Unknown/);
console.log(`Moon core passed: ${fixtures.length} NASA epochs, ${sites.length*4} topocentric cases, ${assertions} numeric checks.`);
console.log('Maximum NASA differences:',JSON.stringify(maxErrors));
