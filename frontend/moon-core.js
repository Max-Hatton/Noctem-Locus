/* Noctem Locus lunar surface geometry. Load vendor/astronomy.browser.min.js first.
 * Ephemeris and IAU 2015 lunar rotation: Astronomy Engine 2.1.19 (MIT).
 * Body frame: right-handed, X = 0 E / 0 N, Y = 90 E / 0 N, Z = north pole.
 * Map basis: view points from Moon to observer; east is screen-right (lunar
 * east, NOT celestial east); north is screen-up. cross(east,north) = view.
 * project() uses one lunar radius as unit and y UP; canvas must negate y.
 * rotationDegrees() returns CLOCKWISE degrees for a normal y-down canvas.
 *
 * This is an orthographic spherical atlas, not a terrain/shadow simulation.
 * The IAU analytical lunar frame is an approximation to the high precision
 * DE421 mean-Earth frame used by LRO maps. Geometric altitude excludes
 * refraction. Lunar eclipses and terrain-cast shadows are not simulated.
 */
(function (root) {
  'use strict';
  const A = root.Astronomy;
  if (!A) throw new Error('Moon Map requires the bundled Astronomy Engine.');
  const DEG = Math.PI / 180;
  const RAD = 180 / Math.PI;
  const MOON_RADIUS_KM = 1737.4;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const wrap = a => ((a % 360) + 360) % 360;
  const signed = a => ((a + 180) % 360 + 360) % 360 - 180;
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  const scale = (v, n) => v.map(x => x * n);
  const add = (a, b) => a.map((x, i) => x + b[i]);
  const subtract = (a, b) => a.map((x, i) => x - b[i]);
  const array = v => [v.x, v.y, v.z];
  function unit(v) {
    const length = Math.hypot(...v);
    if (!Number.isFinite(length) || length < 1e-14) return null;
    return scale(v, 1 / length);
  }
  const projectedUnit = (v, normal) => unit(subtract(v, scale(normal, dot(v, normal))));
  const rotateVector = (rotation, v, time) => array(A.RotateVector(rotation, new A.Vector(...v, time)));

  function surfaceVector(lonDeg, latDeg) {
    const lon = Number(lonDeg), lat = Number(latDeg);
    if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lat) > 90) return null;
    const c = Math.cos(lat * DEG);
    return [c * Math.cos(lon * DEG), c * Math.sin(lon * DEG), Math.sin(lat * DEG)];
  }
  function surfaceCoordinates(v) {
    const u = unit(v);
    return u ? {lonDeg: signed(Math.atan2(u[1], u[0]) * RAD), latDeg: Math.asin(clamp(u[2], -1, 1)) * RAD} : null;
  }

  // IAU RA/DEC/W definition: W turns from z(J2000) cross north(Moon)
  // toward the prime meridian. See NAIF PCK Required Reading (text PCKs).
  // https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/C/req/pck.html
  function bodyAxes(time) {
    const axis = A.RotationAxis(A.Body.Moon, time);
    const pole = array(axis.north);
    const node = [-Math.sin(axis.ra * 15 * DEG), Math.cos(axis.ra * 15 * DEG), 0];
    const second = cross(pole, node);
    const w = wrap(axis.spin) * DEG;
    const x = add(scale(node, Math.cos(w)), scale(second, Math.sin(w)));
    const y = add(scale(node, -Math.sin(w)), scale(second, Math.cos(w)));
    return {x, y, pole, toBody: v => [dot(v, x), dot(v, y), dot(v, pole)]};
  }
  function phaseName(elongationDeg) {
    return ['New Moon', 'Waxing Crescent', 'First Quarter', 'Waxing Gibbous',
      'Full Moon', 'Waning Gibbous', 'Third Quarter', 'Waning Crescent'][Math.floor((wrap(elongationDeg) + 22.5) / 45) % 8];
  }
  function validatedObserver(observer) {
    if (observer == null) return null; // Explicit geocentric atlas / reference comparison.
    const latitude = Number(observer.latitude), longitude = Number(observer.longitude);
    const height = Number(observer.elevationM ?? observer.height ?? 0);
    if (!Number.isFinite(latitude) || Math.abs(latitude) > 90 || !Number.isFinite(longitude) ||
        Math.abs(longitude) > 180 || !Number.isFinite(height) || height < -1000 || height > 100000) {
      throw new RangeError('Moon Map needs a valid observing location.');
    }
    return new A.Observer(latitude, longitude, height);
  }

  function geometry(date, observer = null) {
    const instant = date instanceof Date ? date : new Date(date);
    if (!Number.isFinite(instant.getTime())) throw new RangeError('Moon Map needs a valid date.');
    const time = A.MakeTime(instant);
    const site = validatedObserver(observer);
    const axes = bodyAxes(time);
    const moon = array(A.GeoMoon(time));
    // Ellipsoidal Earth, precession, nutation, latitude, longitude AND height:
    // subtract the complete observer vector, not an altitude-only correction.
    const observerVector = site ? array(A.ObserverVector(time, site, false)) : [0, 0, 0];
    const toObserver = subtract(observerVector, moon);
    const distanceKm = Math.hypot(...toObserver) * A.KM_PER_AU;
    const viewJ = unit(toObserver);
    const view = unit(axes.toBody(viewJ));
    const east = unit(cross([0, 0, 1], view));
    const north = unit(cross(view, east));
    // Physical Moon-to-Sun vector. A phase mask tests dot(surfaceNormal,sun).
    const sunJ = unit(scale(array(A.HelioVector(A.Body.Moon, time)), -1));
    const sun = unit(axes.toBody(sunJ));
    const earth = unit(axes.toBody(scale(moon, -1)));
    const illuminatedFraction = clamp((1 + dot(view, sun)) / 2, 0, 1);
    const elongationDeg = A.MoonPhase(time);
    const phase = {illuminatedFraction, elongationDeg, waxing: elongationDeg < 180, name: phaseName(elongationDeg)};

    const northPoleJ = rotateVector(A.Rotation_EQD_EQJ(time), [0, 0, 1], time);
    const celestialNorthJ = projectedUnit(northPoleJ, viewJ);
    const celestialWestJ = unit(cross(celestialNorthJ, viewJ));
    // Position angles are astronomical: from celestial north toward east.
    const polePositionAngleDeg = Math.atan2(-dot(axes.pole, celestialWestJ), dot(axes.pole, celestialNorthJ)) * RAD;
    const j2000North = projectedUnit([0, 0, 1], viewJ);
    const j2000West = unit(cross(j2000North, viewJ));
    const polePositionAngleJ2000Deg = Math.atan2(-dot(axes.pole, j2000West), dot(axes.pole, j2000North)) * RAD;
    const equatorialJ = A.EquatorFromVector(new A.Vector(...scale(toObserver, -1), time));
    const equatorialDate = A.EquatorFromVector(A.RotateVector(A.Rotation_EQJ_EQD(time), equatorialJ.vec));
    let zenith = null, parallacticAngleDeg = null, horizonRotationDeg = null, altitudeDeg = null, azimuthDeg = null;
    let orientationStable = true;
    if (site) {
      const zenithJ = rotateVector(A.Rotation_HOR_EQJ(time, site), [0, 0, 1], time);
      zenith = unit(axes.toBody(zenithJ));
      const tangentZenith = projectedUnit(zenithJ, viewJ);
      const horizontal = A.Horizon(time, site, equatorialDate.ra, equatorialDate.dec, null);
      altitudeDeg = horizontal.altitude;
      azimuthDeg = horizontal.azimuth;
      // Horizon up is mathematically undefined at zenith/nadir. Flag the
      // near-zenith region so the UI can retain the last stable rotation.
      orientationStable = Math.abs(altitudeDeg) < 89.5;
      if (tangentZenith) {
        parallacticAngleDeg = Math.atan2(-dot(tangentZenith, celestialWestJ), dot(tangentZenith, celestialNorthJ)) * RAD;
        horizonRotationDeg = signed(parallacticAngleDeg - polePositionAngleDeg);
      }
    }
    return {
      date: new Date(instant.getTime()), view, east, north, sun, zenith,
      distanceKm, angularDiameterDeg: 2 * Math.asin(MOON_RADIUS_KM / distanceKm) * RAD,
      subObserver: surfaceCoordinates(view), subEarth: surfaceCoordinates(earth), subSolar: surfaceCoordinates(sun),
      phase, polePositionAngleDeg, polePositionAngleJ2000Deg, parallacticAngleDeg, horizonRotationDeg, orientationStable,
      altitudeDeg, azimuthDeg, raHours: equatorialDate.ra, decDeg: equatorialDate.dec,
      j2000: {raHours: equatorialJ.ra, decDeg: equatorialJ.dec}, topocentric: !!site
    };
  }

  function project(lonDeg, latDeg, g) {
    const vector = surfaceVector(lonDeg, latDeg);
    if (!vector) return null;
    const z = dot(vector, g.view);
    return {x: dot(vector, g.east), y: dot(vector, g.north), z, visible: z >= 0,
      sunAltitudeDeg: Math.asin(clamp(dot(vector, g.sun), -1, 1)) * RAD};
  }
  function unproject(x, y, g) {
    const r2 = x*x + y*y;
    if (!Number.isFinite(r2) || r2 > 1 + 1e-12) return null;
    const z = Math.sqrt(Math.max(0, 1 - r2));
    const vector = add(add(scale(g.east, x), scale(g.north, y)), scale(g.view, z));
    return {...surfaceCoordinates(vector), vector};
  }
  function rotationDegrees(g, mode = 'north', offsetDeg = 0) {
    const offset = Number(offsetDeg);
    if (!Number.isFinite(offset)) throw new RangeError('Map rotation must be a number.');
    let angle;
    switch (mode) {
      case 'north': case 'manual': angle = 0; break;
      case 'sky': angle = -g.polePositionAngleDeg; break;
      case 'horizon': angle = g.horizonRotationDeg; break;
      case 'dob': case 'telescope': angle = g.horizonRotationDeg == null ? null : g.horizonRotationDeg + 180; break;
      default: throw new RangeError('Unknown Moon Map orientation.');
    }
    return angle == null ? null : signed(angle + offset);
  }

  root.noctemMoonCore = Object.freeze({
    geometry, surfaceVector, surfaceCoordinates, project, unproject, rotationDegrees,
    dot, cross, unit, signedDegrees: signed, radiusKm: MOON_RADIUS_KM,
    model: 'Astronomy Engine 2.1.19; IAU 2015 lunar frame; spherical orthographic surface'
  });
})(typeof window !== 'undefined' ? window : globalThis);
