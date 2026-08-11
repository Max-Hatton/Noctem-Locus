// Astronomy Companion v0.3 offline astronomy core.
//
// The orbital-element model and major perturbation terms are adapted from
// Paul Schlyter's "How to compute planetary positions". The implementation
// is intentionally self-contained so the observing app can work with no
// network connection or remote ephemeris service.

export type BodyName =
  | 'Sun'
  | 'Moon'
  | 'Mercury'
  | 'Venus'
  | 'Mars'
  | 'Jupiter'
  | 'Saturn'
  | 'Uranus'
  | 'Neptune';

export type Observer = {
  latitude: number;
  longitude: number;
  elevationM?: number;
};

export type BodyPosition = {
  body: BodyName;
  date: Date;
  raHours: number;
  decDeg: number;
  azimuthDeg: number;
  altitudeDeg: number;
  distance: number;
  distanceUnit: 'AU' | 'Earth radii';
  eclipticLongitudeDeg: number;
  eclipticLatitudeDeg: number;
};

export type HorizonEvent = {
  time: Date;
  altitudeDeg: number;
};

export type MoonPhaseInfo = {
  elongationDeg: number;
  illuminatedFraction: number;
  name: string;
};

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;
const DAY_MS = 86_400_000;
const EARTH_RADIUS_KM = 6378.14;

export const SOLAR_SYSTEM_BODIES: BodyName[] = [
  'Sun',
  'Moon',
  'Mercury',
  'Venus',
  'Mars',
  'Jupiter',
  'Saturn',
  'Uranus',
  'Neptune',
];

function sinDeg(x: number) { return Math.sin(x * DEG); }
function cosDeg(x: number) { return Math.cos(x * DEG); }
function asinDeg(x: number) { return Math.asin(Math.max(-1, Math.min(1, x))) * RAD; }
function atan2Deg(y: number, x: number) { return Math.atan2(y, x) * RAD; }

export function normalizeDegrees(x: number): number {
  return ((x % 360) + 360) % 360;
}

function normalizeSignedDegrees(x: number): number {
  const n = normalizeDegrees(x);
  return n > 180 ? n - 360 : n;
}

/** Days since 1999-12-31 00:00 UTC (Schlyter day number d). */
function dayNumber(date: Date): number {
  return (date.getTime() - Date.UTC(1999, 11, 31, 0, 0, 0)) / DAY_MS;
}

function obliquity(d: number): number {
  return 23.4393 - 3.563e-7 * d;
}

type Elements = { N: number; i: number; w: number; a: number; e: number; M: number };

type EclipticVector = {
  x: number;
  y: number;
  z: number;
  r: number;
  lon: number;
  lat: number;
};

function sunElements(d: number): Elements {
  return {
    N: 0,
    i: 0,
    w: normalizeDegrees(282.9404 + 4.70935e-5 * d),
    a: 1,
    e: 0.016709 - 1.151e-9 * d,
    M: normalizeDegrees(356.0470 + 0.9856002585 * d),
  };
}

function moonElements(d: number): Elements {
  return {
    N: normalizeDegrees(125.1228 - 0.0529538083 * d),
    i: 5.1454,
    w: normalizeDegrees(318.0634 + 0.1643573223 * d),
    a: 60.2666,
    e: 0.054900,
    M: normalizeDegrees(115.3654 + 13.0649929509 * d),
  };
}

function planetElements(body: Exclude<BodyName, 'Sun' | 'Moon'>, d: number): Elements {
  switch (body) {
    case 'Mercury': return { N: normalizeDegrees(48.3313 + 3.24587e-5*d), i: 7.0047 + 5e-8*d, w: normalizeDegrees(29.1241 + 1.01444e-5*d), a: 0.387098, e: 0.205635 + 5.59e-10*d, M: normalizeDegrees(168.6562 + 4.0923344368*d) };
    case 'Venus':   return { N: normalizeDegrees(76.6799 + 2.46590e-5*d), i: 3.3946 + 2.75e-8*d, w: normalizeDegrees(54.8910 + 1.38374e-5*d), a: 0.723330, e: 0.006773 - 1.302e-9*d, M: normalizeDegrees(48.0052 + 1.6021302244*d) };
    case 'Mars':    return { N: normalizeDegrees(49.5574 + 2.11081e-5*d), i: 1.8497 - 1.78e-8*d, w: normalizeDegrees(286.5016 + 2.92961e-5*d), a: 1.523688, e: 0.093405 + 2.516e-9*d, M: normalizeDegrees(18.6021 + 0.5240207766*d) };
    case 'Jupiter': return { N: normalizeDegrees(100.4542 + 2.76854e-5*d), i: 1.3030 - 1.557e-7*d, w: normalizeDegrees(273.8777 + 1.64505e-5*d), a: 5.20256, e: 0.048498 + 4.469e-9*d, M: normalizeDegrees(19.8950 + 0.0830853001*d) };
    case 'Saturn':  return { N: normalizeDegrees(113.6634 + 2.38980e-5*d), i: 2.4886 - 1.081e-7*d, w: normalizeDegrees(339.3939 + 2.97661e-5*d), a: 9.55475, e: 0.055546 - 9.499e-9*d, M: normalizeDegrees(316.9670 + 0.0334442282*d) };
    case 'Uranus':  return { N: normalizeDegrees(74.0005 + 1.3978e-5*d), i: 0.7733 + 1.9e-8*d, w: normalizeDegrees(96.6612 + 3.0565e-5*d), a: 19.18171 - 1.55e-8*d, e: 0.047318 + 7.45e-9*d, M: normalizeDegrees(142.5905 + 0.011725806*d) };
    case 'Neptune': return { N: normalizeDegrees(131.7806 + 3.0173e-5*d), i: 1.7700 - 2.55e-7*d, w: normalizeDegrees(272.8461 - 6.027e-6*d), a: 30.05826 + 3.313e-8*d, e: 0.008606 + 2.15e-9*d, M: normalizeDegrees(260.2471 + 0.005995147*d) };
  }
}

function eccentricAnomalyDeg(Mdeg: number, e: number): number {
  const M = Mdeg * DEG;
  let E = M + e * Math.sin(M) * (1 + e * Math.cos(M));
  for (let k = 0; k < 12; k += 1) {
    const next = E - (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    if (Math.abs(next - E) < 1e-10) return next * RAD;
    E = next;
  }
  return E * RAD;
}

function orbitVector(el: Elements): EclipticVector {
  const E = eccentricAnomalyDeg(el.M, el.e);
  const xv = el.a * (cosDeg(E) - el.e);
  const yv = el.a * (Math.sqrt(1 - el.e * el.e) * sinDeg(E));
  const v = atan2Deg(yv, xv);
  const r = Math.hypot(xv, yv);
  const vw = v + el.w;
  const x = r * (cosDeg(el.N) * cosDeg(vw) - sinDeg(el.N) * sinDeg(vw) * cosDeg(el.i));
  const y = r * (sinDeg(el.N) * cosDeg(vw) + cosDeg(el.N) * sinDeg(vw) * cosDeg(el.i));
  const z = r * (sinDeg(vw) * sinDeg(el.i));
  return {
    x, y, z, r,
    lon: normalizeDegrees(atan2Deg(y, x)),
    lat: atan2Deg(z, Math.hypot(x, y)),
  };
}

function sunEcliptic(d: number): EclipticVector {
  const el = sunElements(d);
  const E = eccentricAnomalyDeg(el.M, el.e);
  const xv = cosDeg(E) - el.e;
  const yv = Math.sqrt(1 - el.e * el.e) * sinDeg(E);
  const v = atan2Deg(yv, xv);
  const r = Math.hypot(xv, yv);
  const lon = normalizeDegrees(v + el.w);
  return { x: r*cosDeg(lon), y: r*sinDeg(lon), z: 0, r, lon, lat: 0 };
}

function perturbedPlanetEcliptic(body: Exclude<BodyName, 'Sun' | 'Moon'>, d: number): EclipticVector {
  const el = planetElements(body, d);
  const base = orbitVector(el);
  let lon = base.lon;
  let lat = base.lat;

  const Mj = planetElements('Jupiter', d).M;
  const Ms = planetElements('Saturn', d).M;
  const Mu = planetElements('Uranus', d).M;

  if (body === 'Jupiter') {
    lon += -0.332*sinDeg(2*Mj - 5*Ms - 67.6)
      -0.056*sinDeg(2*Mj - 2*Ms + 21)
      +0.042*sinDeg(3*Mj - 5*Ms + 21)
      -0.036*sinDeg(Mj - 2*Ms)
      +0.022*cosDeg(Mj - Ms)
      +0.023*sinDeg(2*Mj - 3*Ms + 52)
      -0.016*sinDeg(Mj - 5*Ms - 69);
  } else if (body === 'Saturn') {
    lon += 0.812*sinDeg(2*Mj - 5*Ms - 67.6)
      -0.229*cosDeg(2*Mj - 4*Ms - 2)
      +0.119*sinDeg(Mj - 2*Ms - 3)
      +0.046*sinDeg(2*Mj - 6*Ms - 69)
      +0.014*sinDeg(Mj - 3*Ms + 32);
    lat += -0.020*cosDeg(2*Mj - 4*Ms - 2)
      +0.018*sinDeg(2*Mj - 6*Ms - 49);
  } else if (body === 'Uranus') {
    lon += 0.040*sinDeg(Ms - 2*Mu + 6)
      +0.035*sinDeg(Ms - 3*Mu + 33)
      -0.015*sinDeg(Mj - Mu + 20);
  }

  lon = normalizeDegrees(lon);
  const x = base.r * cosDeg(lon) * cosDeg(lat);
  const y = base.r * sinDeg(lon) * cosDeg(lat);
  const z = base.r * sinDeg(lat);
  return { x, y, z, r: base.r, lon, lat };
}

function moonEcliptic(d: number): EclipticVector {
  const mel = moonElements(d);
  const base = orbitVector(mel);
  const sel = sunElements(d);

  const Ms = sel.M;
  const Mm = mel.M;
  const Ls = normalizeDegrees(sel.M + sel.w);
  const Lm = normalizeDegrees(mel.M + mel.w + mel.N);
  const D = normalizeSignedDegrees(Lm - Ls);
  const F = normalizeSignedDegrees(Lm - mel.N);

  let lon = base.lon
    -1.274*sinDeg(Mm - 2*D)
    +0.658*sinDeg(2*D)
    -0.186*sinDeg(Ms)
    -0.059*sinDeg(2*Mm - 2*D)
    -0.057*sinDeg(Mm - 2*D + Ms)
    +0.053*sinDeg(Mm + 2*D)
    +0.046*sinDeg(2*D - Ms)
    +0.041*sinDeg(Mm - Ms)
    -0.035*sinDeg(D)
    -0.031*sinDeg(Mm + Ms)
    -0.015*sinDeg(2*F - 2*D)
    +0.011*sinDeg(Mm - 4*D);

  let lat = base.lat
    -0.173*sinDeg(F - 2*D)
    -0.055*sinDeg(Mm - F - 2*D)
    -0.046*sinDeg(Mm + F - 2*D)
    +0.033*sinDeg(F + 2*D)
    +0.017*sinDeg(2*Mm + F);

  const r = base.r - 0.58*cosDeg(Mm - 2*D) - 0.46*cosDeg(2*D);
  lon = normalizeDegrees(lon);
  const x = r*cosDeg(lon)*cosDeg(lat);
  const y = r*sinDeg(lon)*cosDeg(lat);
  const z = r*sinDeg(lat);
  return { x, y, z, r, lon, lat };
}

function eclipticToEquatorial(v: EclipticVector, d: number): { raHours: number; decDeg: number; distance: number } {
  const ecl = obliquity(d);
  const xe = v.x;
  const ye = v.y*cosDeg(ecl) - v.z*sinDeg(ecl);
  const ze = v.y*sinDeg(ecl) + v.z*cosDeg(ecl);
  const raDeg = normalizeDegrees(atan2Deg(ye, xe));
  const decDeg = atan2Deg(ze, Math.hypot(xe, ye));
  return { raHours: raDeg / 15, decDeg, distance: Math.hypot(xe, ye, ze) };
}

function geocentricEcliptic(body: BodyName, d: number): EclipticVector {
  if (body === 'Sun') return sunEcliptic(d);
  if (body === 'Moon') return moonEcliptic(d);

  const helio = perturbedPlanetEcliptic(body, d);
  const sun = sunEcliptic(d);
  const x = helio.x + sun.x;
  const y = helio.y + sun.y;
  const z = helio.z;
  const r = Math.hypot(x, y, z);
  return {
    x, y, z, r,
    lon: normalizeDegrees(atan2Deg(y, x)),
    lat: atan2Deg(z, Math.hypot(x, y)),
  };
}

/** Greenwich mean sidereal time in degrees. */
export function gmstDegrees(date: Date): number {
  const jd = date.getTime() / DAY_MS + 2440587.5;
  const T = (jd - 2451545.0) / 36525;
  return normalizeDegrees(
    280.46061837
    + 360.98564736629 * (jd - 2451545.0)
    + 0.000387933*T*T
    - (T*T*T)/38710000,
  );
}

function horizontalCoordinates(raHours: number, decDeg: number, observer: Observer, date: Date): { az: number; alt: number } {
  const lst = normalizeDegrees(gmstDegrees(date) + observer.longitude);
  const ha = normalizeSignedDegrees(lst - raHours*15);
  const x = cosDeg(ha) * cosDeg(decDeg);
  const y = sinDeg(ha) * cosDeg(decDeg);
  const z = sinDeg(decDeg);
  const xhor = x*sinDeg(observer.latitude) - z*cosDeg(observer.latitude);
  const yhor = y;
  const zhor = x*cosDeg(observer.latitude) + z*sinDeg(observer.latitude);
  return {
    az: normalizeDegrees(atan2Deg(yhor, xhor) + 180),
    alt: asinDeg(zhor),
  };
}

export function getBodyPosition(body: BodyName, observer: Observer, date = new Date()): BodyPosition {
  const d = dayNumber(date);
  const ecl = geocentricEcliptic(body, d);
  const eq = eclipticToEquatorial(ecl, d);
  const horizontal = horizontalCoordinates(eq.raHours, eq.decDeg, observer, date);

  // The Moon's geocentric altitude can differ by more than a degree from the
  // actual topocentric altitude. Apply the standard parallax correction in altitude.
  let altitude = horizontal.alt;
  if (body === 'Moon') {
    const parallax = asinDeg(1 / ecl.r);
    altitude -= parallax * cosDeg(horizontal.alt);
  }

  return {
    body,
    date,
    raHours: eq.raHours,
    decDeg: eq.decDeg,
    azimuthDeg: horizontal.az,
    altitudeDeg: altitude,
    distance: ecl.r,
    distanceUnit: body === 'Moon' ? 'Earth radii' : 'AU',
    eclipticLongitudeDeg: ecl.lon,
    eclipticLatitudeDeg: ecl.lat,
  };
}

export function getMoonPhase(date = new Date()): MoonPhaseInfo {
  const d = dayNumber(date);
  const moon = moonEcliptic(d);
  const sun = sunEcliptic(d);
  const elongation = normalizeDegrees(moon.lon - sun.lon);
  const illuminatedFraction = (1 - cosDeg(elongation)) / 2;

  let name: string;
  if (elongation < 22.5 || elongation >= 337.5) name = 'New Moon';
  else if (elongation < 67.5) name = 'Waxing Crescent';
  else if (elongation < 112.5) name = 'First Quarter';
  else if (elongation < 157.5) name = 'Waxing Gibbous';
  else if (elongation < 202.5) name = 'Full Moon';
  else if (elongation < 247.5) name = 'Waning Gibbous';
  else if (elongation < 292.5) name = 'Third Quarter';
  else name = 'Waning Crescent';

  return { elongationDeg: elongation, illuminatedFraction, name };
}

export function moonDistanceKm(position: BodyPosition): number | null {
  return position.body === 'Moon' ? position.distance * EARTH_RADIUS_KM : null;
}

export function compassDirection(azimuthDeg: number): string {
  const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  return dirs[Math.round(normalizeDegrees(azimuthDeg) / 22.5) % 16];
}

export function altitudeLabel(altitudeDeg: number): string {
  if (altitudeDeg >= 60) return 'Very high';
  if (altitudeDeg >= 35) return 'High';
  if (altitudeDeg >= 20) return 'Good';
  if (altitudeDeg >= 10) return 'Low';
  if (altitudeDeg >= 0) return 'Very low';
  return 'Below horizon';
}

/**
 * Finds the next crossing of a requested altitude by scanning and then
 * binary-refining the crossing. direction=+1 is rising, direction=-1 is setting.
 */
export function findNextAltitudeCrossing(
  body: BodyName,
  observer: Observer,
  start: Date,
  targetAltitudeDeg: number,
  direction: 1 | -1,
  searchHours = 48,
): HorizonEvent | null {
  const stepMs = 5 * 60_000;
  const endMs = start.getTime() + searchHours*3_600_000;
  let t0 = start.getTime();
  let y0 = getBodyPosition(body, observer, new Date(t0)).altitudeDeg - targetAltitudeDeg;

  for (let t1 = t0 + stepMs; t1 <= endMs; t1 += stepMs) {
    const y1 = getBodyPosition(body, observer, new Date(t1)).altitudeDeg - targetAltitudeDeg;
    const crossed = direction === 1 ? (y0 < 0 && y1 >= 0) : (y0 >= 0 && y1 < 0);
    if (crossed) {
      let lo = t0;
      let hi = t1;
      for (let i = 0; i < 24; i += 1) {
        const mid = (lo + hi) / 2;
        const yMid = getBodyPosition(body, observer, new Date(mid)).altitudeDeg - targetAltitudeDeg;
        if (direction === 1) {
          if (yMid >= 0) hi = mid; else lo = mid;
        } else {
          if (yMid < 0) hi = mid; else lo = mid;
        }
      }
      const time = new Date((lo + hi) / 2);
      return { time, altitudeDeg: getBodyPosition(body, observer, time).altitudeDeg };
    }
    t0 = t1;
    y0 = y1;
  }
  return null;
}

function apparentHorizonAltitude(body: BodyName): number {
  // Approximate standard refraction at the horizon is 34 arcminutes.
  // For the Sun/Moon, include about 16 arcminutes of apparent radius so
  // rise/set refers roughly to the first/last visible limb rather than center.
  return body === 'Sun' || body === 'Moon' ? -0.833 : -(34/60);
}

export function findNextRise(body: BodyName, observer: Observer, start = new Date()): HorizonEvent | null {
  return findNextAltitudeCrossing(body, observer, start, apparentHorizonAltitude(body), 1, 48);
}

export function findNextSet(body: BodyName, observer: Observer, start = new Date()): HorizonEvent | null {
  return findNextAltitudeCrossing(body, observer, start, apparentHorizonAltitude(body), -1, 48);
}

export function findNextAstronomicalDusk(observer: Observer, start = new Date()): HorizonEvent | null {
  return findNextAltitudeCrossing('Sun', observer, start, -18, -1, 48);
}

export function findNextAstronomicalDawn(observer: Observer, start = new Date()): HorizonEvent | null {
  return findNextAltitudeCrossing('Sun', observer, start, -18, 1, 48);
}

export function angularSeparationDeg(a: BodyPosition, b: BodyPosition): number {
  const ra1 = a.raHours * 15 * DEG;
  const ra2 = b.raHours * 15 * DEG;
  const d1 = a.decDeg * DEG;
  const d2 = b.decDeg * DEG;
  const cosSep = Math.sin(d1)*Math.sin(d2) + Math.cos(d1)*Math.cos(d2)*Math.cos(ra1-ra2);
  return Math.acos(Math.max(-1, Math.min(1, cosSep))) * RAD;
}
