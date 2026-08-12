(() => {
  if (window.__NOCTEM_WEATHER_V012__) return;
  window.__NOCTEM_WEATHER_V012__ = true;

  const VERSION = '0.12.0';
  const PROVIDER = 'Open-Meteo';
  const API = 'https://api.open-meteo.com/v1/forecast';
  const CACHE_MAX_AGE_MS = 45 * 60 * 1000;
  const ALERT_POLL_MS = 15 * 60 * 1000;
  const HOURLY = [
    'temperature_2m','relative_humidity_2m','dew_point_2m',
    'precipitation_probability','precipitation','weather_code',
    'cloud_cover','cloud_cover_low','cloud_cover_mid','cloud_cover_high',
    'visibility','wind_speed_10m','wind_gusts_10m'
  ];
  const DAILY = [
    'weather_code','temperature_2m_max','temperature_2m_min',
    'precipitation_probability_max','wind_speed_10m_max'
  ];

  let refreshPromise = null;
  let backgroundTimer = null;
  let baseRenderPage = null;
  let baseRenderShell = null;
  let baseRenderTonight = null;
  let baseRenderSettings = null;

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Number(v)));
  const escWx = value => String(value ?? '').replace(/[&<>\"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[ch]));
  const pad2 = n => String(n).padStart(2, '0');
  const localDayKey = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;

  function ensureWeatherSettings() {
    settings.weather ||= {};
    const w = settings.weather;
    if (typeof w.enabled !== 'boolean') w.enabled = true;
    if (!w.units) w.units = 'auto';
    if (!w.caches || typeof w.caches !== 'object') w.caches = {};
    if (!w.alertHistory || typeof w.alertHistory !== 'object') w.alertHistory = {};
    w.alerts ||= {};
    if (typeof w.alerts.enabled !== 'boolean') w.alerts.enabled = true;
    if (typeof w.alerts.goodWindow !== 'boolean') w.alerts.goodWindow = true;
    if (!Number.isFinite(Number(w.alerts.minScore))) w.alerts.minScore = 72;
    if (!Number.isFinite(Number(w.alerts.minWindowMinutes))) w.alerts.minWindowMinutes = 90;
    if (typeof w.alerts.dewDuringSession !== 'boolean') w.alerts.dewDuringSession = true;
    if (typeof w.alerts.targetEnabled !== 'boolean') w.alerts.targetEnabled = false;
    if (!w.alerts.targetKey) w.alerts.targetKey = 'sol:Saturn';
    if (!Number.isFinite(Number(w.alerts.targetMinAltitude))) w.alerts.targetMinAltitude = 25;
    if (!Number.isFinite(Number(w.alerts.targetMaxCloud))) w.alerts.targetMaxCloud = 20;
    if (!Number.isFinite(Number(w.alerts.cooldownHours))) w.alerts.cooldownHours = 6;
    return w;
  }

  function activeSite() {
    try {
      const s = window.noctemLocusPlanner?.activeSite?.();
      if (s) return s;
    } catch (_) {}
    const lat = Number(settings.latitude), lon = Number(settings.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return {
      id: settings.activeLocationId || `legacy:${lat.toFixed(4)},${lon.toFixed(4)}`,
      name: settings.locationName || 'Current site',
      latitude: String(lat), longitude: String(lon), elevationM: String(settings.elevationM || 0), horizon: []
    };
  }

  function siteKey(site = activeSite()) {
    if (!site) return '';
    const lat = Number(site.latitude), lon = Number(site.longitude);
    return String(site.id || `${lat.toFixed(4)},${lon.toFixed(4)}`);
  }

  function weatherCache(site = activeSite()) {
    const w = ensureWeatherSettings();
    return w.caches[siteKey(site)] || null;
  }

  function cacheAge(cache) {
    return cache?.fetchedAt ? Date.now() - new Date(cache.fetchedAt).getTime() : Infinity;
  }

  function ageText(cache) {
    if (!cache?.fetchedAt) return 'never';
    const mins = Math.max(0, Math.round(cacheAge(cache) / 60000));
    if (mins < 2) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    const hours = Math.floor(mins / 60), rest = mins % 60;
    return `${hours}h${rest ? ` ${rest}m` : ''} ago`;
  }

  function apiUrl(site) {
    const lat = Number(site.latitude), lon = Number(site.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error('Observing site has invalid coordinates');
    const params = new URLSearchParams({
      latitude: String(lat), longitude: String(lon), timezone: 'auto', forecast_days: '8',
      hourly: HOURLY.join(','), daily: DAILY.join(',')
    });
    if (Number.isFinite(Number(site.elevationM))) params.set('elevation', String(Number(site.elevationM)));
    return `${API}?${params}`;
  }

  function normalizeForecast(json, site) {
    if (!json?.hourly?.time?.length) throw new Error('Weather service returned no hourly forecast');
    const cache = {
      provider: PROVIDER,
      fetchedAt: new Date().toISOString(),
      siteId: siteKey(site), siteName: site.name || 'Observing site',
      latitude: Number(json.latitude), longitude: Number(json.longitude), elevation: Number(json.elevation || 0),
      timezone: json.timezone || '', timezoneAbbreviation: json.timezone_abbreviation || '',
      utcOffsetSeconds: Number(json.utc_offset_seconds || 0),
      hourly: json.hourly,
      hourlyUnits: json.hourly_units || {},
      daily: json.daily || {}, dailyUnits: json.daily_units || {}
    };
    cache.hourEpoch = cache.hourly.time.map(t => epochFromForecastLocal(t, cache));
    return cache;
  }

  function epochFromForecastLocal(text, cache) {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(text));
    if (!m) return NaN;
    return Date.UTC(+m[1], +m[2]-1, +m[3], +m[4], +m[5]) - Number(cache?.utcOffsetSeconds || 0) * 1000;
  }

  async function refreshForecast({force = false, site = activeSite(), silent = false} = {}) {
    ensureWeatherSettings();
    if (!site) throw new Error('Add an observing site before loading weather');
    const existing = weatherCache(site);
    if (!force && existing && cacheAge(existing) < CACHE_MAX_AGE_MS) return existing;
    if (refreshPromise) return refreshPromise;
    if (navigator.onLine === false) {
      if (existing) return existing;
      throw new Error('Offline and no cached forecast is available');
    }
    refreshPromise = (async () => {
      try {
        const response = await fetch(apiUrl(site), {headers:{'Accept':'application/json'}, cache:'no-store'});
        if (!response.ok) throw new Error(`Weather service returned HTTP ${response.status}`);
        const cache = normalizeForecast(await response.json(), site);
        settings.weather.caches[siteKey(site)] = cache;
        const allowed = new Set((settings.locations || []).map(s => siteKey(s)).filter(Boolean));
        allowed.add(siteKey(site));
        for (const key of Object.keys(settings.weather.caches)) if (!allowed.has(key)) delete settings.weather.caches[key];
        saveSettings();
        if (!silent) try { toast('Weather forecast updated'); } catch (_) {}
        return cache;
      } catch (error) {
        if (!silent) console.warn('Weather refresh failed', error);
        if (existing) return existing;
        throw error;
      } finally {
        refreshPromise = null;
      }
    })();
    return refreshPromise;
  }

  function nearestHour(cache, date = new Date()) {
    if (!cache?.hourEpoch?.length) return null;
    const target = date.getTime();
    let lo = 0, hi = cache.hourEpoch.length - 1;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (cache.hourEpoch[mid] < target) lo = mid + 1; else hi = mid;
    }
    let i = lo;
    if (i > 0 && Math.abs(cache.hourEpoch[i-1] - target) < Math.abs(cache.hourEpoch[i] - target)) i -= 1;
    if (Math.abs(cache.hourEpoch[i] - target) > 100 * 60 * 1000) return null;
    return hourlyAtIndex(cache, i);
  }

  function hourlyAtIndex(cache, i) {
    const h = cache?.hourly;
    if (!h || !h.time?.[i]) return null;
    const get = key => Number(h[key]?.[i]);
    return {
      index:i, timeText:h.time[i], date:new Date(cache.hourEpoch[i]),
      temperatureC:get('temperature_2m'), humidity:get('relative_humidity_2m'), dewPointC:get('dew_point_2m'),
      precipProbability:get('precipitation_probability'), precipitationMm:get('precipitation'), weatherCode:get('weather_code'),
      cloud:get('cloud_cover'), cloudLow:get('cloud_cover_low'), cloudMid:get('cloud_cover_mid'), cloudHigh:get('cloud_cover_high'),
      visibilityM:get('visibility'), windKmh:get('wind_speed_10m'), gustKmh:get('wind_gusts_10m')
    };
  }

  function weatherCodeText(code) {
    const c = Number(code);
    if (c === 0) return 'Clear';
    if (c === 1) return 'Mostly clear';
    if (c === 2) return 'Partly cloudy';
    if (c === 3) return 'Overcast';
    if ([45,48].includes(c)) return 'Fog';
    if ([51,53,55,56,57].includes(c)) return 'Drizzle';
    if ([61,63,65,66,67].includes(c)) return 'Rain';
    if ([71,73,75,77].includes(c)) return 'Snow';
    if ([80,81,82].includes(c)) return 'Showers';
    if ([85,86].includes(c)) return 'Snow showers';
    if ([95,96,99].includes(c)) return 'Thunderstorms';
    return 'Forecast';
  }

  function useFahrenheit() {
    const u = ensureWeatherSettings().units;
    if (u === 'f') return true;
    if (u === 'c') return false;
    return /(^|[-_])US$/i.test(navigator.language || '') || (navigator.languages || []).some(x => /(^|[-_])US$/i.test(x));
  }
  function tempText(c) { return Number.isFinite(c) ? `${Math.round(useFahrenheit() ? c*9/5+32 : c)}°${useFahrenheit()?'F':'C'}` : '—'; }
  function windMph(kmh) { return Number(kmh) * 0.621371; }
  function windText(kmh) { return Number.isFinite(kmh) ? (useFahrenheit() ? `${Math.round(windMph(kmh))} mph` : `${Math.round(kmh)} km/h`) : '—'; }

  function dewRisk(hour) {
    if (!hour || !Number.isFinite(hour.temperatureC) || !Number.isFinite(hour.dewPointC)) return {level:'Unknown', className:'poor', spreadC:NaN};
    const spread = hour.temperatureC - hour.dewPointC;
    if (spread <= 1.5 || hour.humidity >= 94) return {level:'High', className:'poor', spreadC:spread};
    if (spread <= 3.5 || hour.humidity >= 86) return {level:'Medium', className:'fair', spreadC:spread};
    return {level:'Low', className:'good', spreadC:spread};
  }

  function transparencyEstimate(hour) {
    if (!hour) return 'Unknown';
    const visKm = Number(hour.visibilityM) / 1000;
    let score = 100;
    score -= clamp(hour.cloudHigh,0,100) * .25;
    score -= clamp(hour.cloudMid,0,100) * .35;
    score -= clamp(hour.cloudLow,0,100) * .45;
    score -= Math.max(0, Number(hour.humidity)-72) * .55;
    if (Number.isFinite(visKm)) score -= Math.max(0, 20-visKm) * 2.2;
    if (hour.precipProbability > 10) score -= hour.precipProbability * .25;
    return score >= 78 ? 'Great' : score >= 62 ? 'Good' : score >= 45 ? 'Fair' : 'Poor';
  }

  function observingScore(hour) {
    if (!hour) return {score:0,label:'No forecast',className:'poor',dew:{level:'Unknown'},transparency:'Unknown'};
    let score = 100;
    const cloud = clamp(hour.cloud,0,100);
    score -= cloud * .78;
    score -= clamp(hour.precipProbability,0,100) * .34;
    if (hour.precipitationMm > 0) score -= Math.min(35, 18 + hour.precipitationMm * 12);
    const wind = windMph(hour.windKmh), gust = windMph(hour.gustKmh);
    if (wind > 8) score -= (wind - 8) * 2.1;
    if (gust > 14) score -= (gust - 14) * 1.1;
    if (hour.humidity > 82) score -= (hour.humidity - 82) * .65;
    const visKm = hour.visibilityM / 1000;
    if (Number.isFinite(visKm) && visKm < 16) score -= (16-visKm) * 1.4;
    const dew = dewRisk(hour);
    if (dew.level === 'High') score -= 10;
    else if (dew.level === 'Medium') score -= 4;
    score = Math.round(clamp(score,0,100));
    return {
      score,
      label: score >= 86 ? 'Excellent' : score >= 72 ? 'Very Good' : score >= 58 ? 'Good' : score >= 40 ? 'Fair' : 'Poor',
      className: score >= 58 ? 'good' : score >= 40 ? 'fair' : 'poor',
      dew,
      transparency: transparencyEstimate(hour)
    };
  }

  function hourFor(date, site = activeSite()) { return nearestHour(weatherCache(site), date); }
  function scoreAt(date, site = activeSite()) { const hour = hourFor(date, site); return hour ? {...observingScore(hour), hour} : null; }

  function sunAltitude(date) {
    try {
      const observer = parseObserver();
      return observer ? getBodyPosition('Sun', observer, date).altitudeDeg : -90;
    } catch (_) { return -90; }
  }

  function nightHours(cache, from = new Date(), hoursAhead = 18) {
    if (!cache?.hourEpoch?.length) return [];
    const end = from.getTime() + hoursAhead * 3600000;
    const out = [];
    for (let i=0;i<cache.hourEpoch.length;i++) {
      const t = cache.hourEpoch[i];
      if (t < from.getTime()-30*60000 || t > end) continue;
      const hour = hourlyAtIndex(cache,i), score = observingScore(hour);
      out.push({...hour, observing:score, sunAltitude:sunAltitude(new Date(t))});
    }
    return out;
  }

  function bestWindow(cache = weatherCache(), from = new Date(), hoursAhead = 18, minScore = 58, minMinutes = 60) {
    const rows = nightHours(cache, from, hoursAhead).filter(x => x.sunAltitude < -6);
    let best = null, current = null;
    for (const row of rows) {
      const usable = row.observing.score >= minScore && row.precipProbability < 45;
      if (usable) {
        if (!current) current = {start:row.date,end:new Date(row.date.getTime()+3600000),rows:[]};
        current.end = new Date(row.date.getTime()+3600000); current.rows.push(row);
      } else if (current) { best = chooseWindow(best,current); current = null; }
    }
    if (current) best = chooseWindow(best,current);
    if (!best || best.end-best.start < minMinutes*60000) return null;
    best.score = Math.round(best.rows.reduce((s,r)=>s+r.observing.score,0)/best.rows.length);
    best.maxCloud = Math.max(...best.rows.map(r=>r.cloud));
    best.avgCloud = Math.round(best.rows.reduce((s,r)=>s+r.cloud,0)/best.rows.length);
    best.windKmh = best.rows.reduce((s,r)=>s+r.windKmh,0)/best.rows.length;
    return best;
  }
  function chooseWindow(a,b) {
    if (!a) return b;
    const ad = a.end-a.start, bd=b.end-b.start;
    if (bd !== ad) return bd > ad ? b : a;
    const as = a.rows.reduce((s,r)=>s+r.observing.score,0)/a.rows.length;
    const bs = b.rows.reduce((s,r)=>s+r.observing.score,0)/b.rows.length;
    return bs > as ? b : a;
  }

  function plannerAdjustment(date, site) {
    const wx = scoreAt(date, site);
    if (!wx) return null;
    let delta = Math.round((wx.score - 68) * .72);
    if (wx.hour.cloud >= 80) delta -= 35;
    else if (wx.hour.cloud >= 60) delta -= 20;
    if (wx.hour.precipProbability >= 50 || wx.hour.precipitationMm > 0.1) delta -= 35;
    return {delta, score:wx.score, label:wx.label, cloud:wx.hour.cloud, dew:wx.dew.level, windKmh:wx.hour.windKmh, transparency:wx.transparency};
  }

  function timeShort(date) { return date.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}); }

  function hourlyRowsHtml(cache) {
    const rows = nightHours(cache,new Date(),18).slice(0,18);
    if (!rows.length) return '<div class="v12Empty">No hourly forecast is cached for this period.</div>';
    return `<div class="v12HourlyScroller">${rows.map(r=>`
      <article class="v12Hour ${r.sunAltitude < -18 ? 'dark' : ''}">
        <strong>${escWx(timeShort(r.date))}</strong><span>${escWx(weatherCodeText(r.weatherCode))}</span>
        <div class="v12Score ${r.observing.className}">${r.observing.score}</div>
        <small>Clouds <b>${Math.round(r.cloud)}%</b></small>
        <small>Wind <b>${escWx(windText(r.windKmh))}</b></small>
        <small>Dew <b>${escWx(r.observing.dew.level)}</b></small>
        <small>Trans. <b>${escWx(r.observing.transparency)}</b></small>
      </article>`).join('')}</div>`;
  }

  function dailyOutlook(cache) {
    const d = cache?.daily;
    if (!d?.time?.length) return [];
    return d.time.slice(0,6).map(day => {
      const indices = cache.hourly.time.map((t,i)=>t.startsWith(day)?i:-1).filter(i=>i>=0);
      const night = indices.map(i=>hourlyAtIndex(cache,i)).filter(h => {
        const hh = Number(h.timeText.slice(11,13)); return hh >= 20 || hh <= 4;
      });
      const score = night.length ? Math.round(night.reduce((s,h)=>s+observingScore(h).score,0)/night.length) : 0;
      const i = d.time.indexOf(day);
      return {day,score,code:Number(d.weather_code?.[i]),maxC:Number(d.temperature_2m_max?.[i]),minC:Number(d.temperature_2m_min?.[i]),precip:Number(d.precipitation_probability_max?.[i]),windKmh:Number(d.wind_speed_10m_max?.[i])};
    });
  }

  function outlookHtml(cache) {
    const items = dailyOutlook(cache);
    return `<div class="v12Outlook">${items.map((d,i)=>{
      const date = new Date(`${d.day}T12:00:00`), label=d.score>=80?'Excellent':d.score>=65?'Good':d.score>=45?'Fair':'Poor';
      return `<button class="v12Day" data-weather-plan-date="${escWx(d.day)}"><span>${i===0?'Tonight':escWx(date.toLocaleDateString([],{weekday:'short'}))}</span><strong>${d.score}/100</strong><small>${escWx(label)} · ${Math.round(d.precip)}% precip</small><small>${escWx(tempText(d.minC))}–${escWx(tempText(d.maxC))}</small></button>`;
    }).join('')}</div>`;
  }

  function currentSummary(cache) {
    const h = nearestHour(cache,new Date()), s = observingScore(h), window = bestWindow(cache,new Date(),18,Math.max(50,Number(settings.weather.alerts.minScore)-10),60);
    return {hour:h,score:s,window};
  }

  function cacheStatus(cache) {
    if (!cache) return navigator.onLine === false ? 'Offline · no cached forecast' : 'No forecast loaded';
    const stale = cacheAge(cache) > CACHE_MAX_AGE_MS;
    return `${stale ? 'Cached forecast' : 'Forecast updated'} ${ageText(cache)}${navigator.onLine===false?' · offline':''}`;
  }

  function renderWeatherPage() {
    ensureWeatherSettings();
    const site = activeSite();
    if (!site) {
      document.getElementById('page').innerHTML = `<section class="placeholder"><div class="orbit">☁</div><h3>Add an observing site first</h3><p>Weather forecasts use the latitude and longitude of your active observing site.</p><button class="primaryButton" id="weatherGoSettings">Open Settings</button></section>`;
      document.getElementById('weatherGoSettings').onclick=()=>{page='Settings';renderShell()};
      return;
    }
    const cache = weatherCache(site);
    const summary = currentSummary(cache);
    const h = summary.hour, s = summary.score, win=summary.window;
    const windowText = win ? `${timeShort(win.start)}–${timeShort(win.end)}` : 'No strong window found';
    const heroReason = h ? `${Math.round(h.cloud)}% clouds · ${windText(h.windKmh)} wind · dew risk ${s.dew.level.toLowerCase()} · estimated transparency ${s.transparency.toLowerCase()}` : 'Load a forecast to calculate observing conditions.';
    document.getElementById('page').innerHTML = `<section class="pageStack">
      <section class="v12WeatherHero">
        <div><p class="eyebrow">ASTRONOMY WEATHER · ${escWx(site.name || 'OBSERVING SITE')}</p><h3>${cache ? `${s.label} observing conditions` : 'Weather not loaded yet'}</h3><p>${escWx(heroReason)}</p><div class="inlineActions"><button class="primaryButton" id="weatherRefresh">${cache?'Refresh forecast':'Load forecast'}</button><span class="mutedText" id="weatherCacheStatus">${escWx(cacheStatus(cache))}</span></div></div>
        <div class="v12HeroScore ${s.className}"><strong>${cache?s.score:'—'}</strong><span>OBSERVING SCORE</span></div>
      </section>
      <div class="v12MetricGrid">
        ${metricCard('Best window',windowText,win?`${win.avgCloud}% avg clouds · score ${win.score}`:'Forecast/darkness do not line up well')}
        ${metricCard('Cloud cover',h?`${Math.round(h.cloud)}%`:'—',h?`Low ${Math.round(h.cloudLow)}% · mid ${Math.round(h.cloudMid)}% · high ${Math.round(h.cloudHigh)}%`:'No cached hour')}
        ${metricCard('Dew risk',h?s.dew.level:'—',h?`${tempText(h.temperatureC)} air · ${tempText(h.dewPointC)} dew point`:'No cached hour')}
        ${metricCard('Wind',h?windText(h.windKmh):'—',h?`Gusts ${windText(h.gustKmh)}`:'No cached hour')}
      </div>
      <section class="panel"><div class="panelHeader"><div><p class="eyebrow">NEXT 18 HOURS</p><h3>Observing conditions by hour</h3></div><span class="mutedText">Highlighted borders mark astronomical night</span></div>${hourlyRowsHtml(cache)}</section>
      <section class="panel"><div class="panelHeader"><div><p class="eyebrow">OBSERVING OUTLOOK</p><h3>Which night is worth planning for?</h3></div><span class="mutedText">Click a day to open Planner</span></div>${cache?outlookHtml(cache):'<div class="v12Empty">Load a forecast to see the outlook.</div>'}</section>
      ${alertsHtml()}
      <section class="notice">Weather is an online-enhanced feature. Astronomy calculations, maps, Planner, Push-To, logs and equipment tools still work offline. When the network is unavailable, Noctem Locus uses the last cached forecast and shows its age. Forecast data: Open-Meteo (CC BY 4.0). Transparency and observing scores are Noctem Locus estimates, not measured seeing values.</section>
    </section>`;
    bindWeatherPage(site);
    if (!cache || cacheAge(cache)>CACHE_MAX_AGE_MS) void refreshForecast({site,silent:true}).then(()=>{if(page==='Weather')renderWeatherPage();}).catch(()=>{});
  }

  function metricCard(label,value,detail){return `<article class="v12Metric"><span>${escWx(label)}</span><strong>${escWx(value)}</strong><small>${escWx(detail)}</small></article>`;}

  function alertTargetOptions() {
    const current = settings.weather.alerts.targetKey;
    let objects=[];
    try { objects = searchObjects('', 'all').filter(o=>o.key!=='sol:Sun').slice(0,200); } catch (_) { objects = OBJECT_CATALOG.filter(o=>o.key!=='sol:Sun').slice(0,200); }
    if (!objects.some(o=>o.key===current)) { try { const o=catalogObject(current); if(o)objects.unshift(o); }catch(_){} }
    const seen=new Set();
    return objects.filter(o=>o&&!seen.has(o.key)&&seen.add(o.key)).map(o=>`<option value="${escWx(o.key)}" ${o.key===current?'selected':''}>${escWx(typeof objectDisplayName==='function'?objectDisplayName(o):(o.name||o.id))}</option>`).join('');
  }

  function alertsHtml() {
    const a=settings.weather.alerts;
    const permission = window.__TAURI__?.notification ? 'Native Windows notifications available' : 'In-app alerts available';
    return `<section class="panel"><div class="panelHeader"><div><p class="eyebrow">SMART OBSERVING ALERTS</p><h3>Tell me when the sky becomes worth using.</h3></div><span class="validationBadge ${a.enabled?'valid':''}">${a.enabled?'Alerts on':'Alerts off'}</span></div>
      <div class="v12AlertGrid">
        <label><span>Master alerts</span><input type="checkbox" id="wxAlertEnabled" ${a.enabled?'checked':''}></label>
        <label><span>Good observing window</span><input type="checkbox" id="wxGoodWindow" ${a.goodWindow?'checked':''}></label>
        <label><span>Minimum score</span><input type="number" id="wxMinScore" min="40" max="95" value="${Number(a.minScore)}"></label>
        <label><span>Minimum window (min)</span><input type="number" id="wxMinWindow" min="30" max="360" step="30" value="${Number(a.minWindowMinutes)}"></label>
        <label><span>Dew warning during session</span><input type="checkbox" id="wxDewAlert" ${a.dewDuringSession?'checked':''}></label>
        <label><span>Target alert</span><input type="checkbox" id="wxTargetEnabled" ${a.targetEnabled?'checked':''}></label>
      </div>
      <div class="v12TargetRule">
        <label>Target<select id="wxTargetKey">${alertTargetOptions()}</select></label>
        <label>Minimum altitude<input type="number" id="wxTargetAlt" min="0" max="85" value="${Number(a.targetMinAltitude)}"><small>°</small></label>
        <label>Maximum clouds<input type="number" id="wxTargetCloud" min="0" max="100" value="${Number(a.targetMaxCloud)}"><small>%</small></label>
      </div>
      <div class="inlineActions"><button class="primaryButton" id="wxSaveAlerts">Save alert rules</button><button class="secondaryButton" id="wxEnableNotifications">Enable Windows notifications</button><button class="secondaryButton" id="wxTestNotification">Test alert</button><span class="mutedText">${escWx(permission)} · evaluated while Noctem Locus is running</span></div>
    </section>`;
  }

  function bindWeatherPage(site) {
    document.getElementById('weatherRefresh')?.addEventListener('click',async()=>{
      const b=document.getElementById('weatherRefresh'); if(b)b.disabled=true;
      try { await refreshForecast({force:true,site}); renderWeatherPage(); evaluateAlerts(); }
      catch(e){ try{toast(`Weather refresh failed: ${e.message||e}`)}catch(_){} }
      finally{ if(b)b.disabled=false; }
    });
    document.querySelectorAll('[data-weather-plan-date]').forEach(b=>b.onclick=()=>{
      settings.planner.date=b.dataset.weatherPlanDate; saveSettings(); page='Planner'; renderShell();
    });
    document.getElementById('wxSaveAlerts')?.addEventListener('click',()=>{
      const a=settings.weather.alerts;
      a.enabled=document.getElementById('wxAlertEnabled').checked;
      a.goodWindow=document.getElementById('wxGoodWindow').checked;
      a.minScore=clamp(document.getElementById('wxMinScore').value,40,95);
      a.minWindowMinutes=clamp(document.getElementById('wxMinWindow').value,30,360);
      a.dewDuringSession=document.getElementById('wxDewAlert').checked;
      a.targetEnabled=document.getElementById('wxTargetEnabled').checked;
      a.targetKey=document.getElementById('wxTargetKey').value;
      a.targetMinAltitude=clamp(document.getElementById('wxTargetAlt').value,0,85);
      a.targetMaxCloud=clamp(document.getElementById('wxTargetCloud').value,0,100);
      saveSettings(); try{toast('Weather alert rules saved')}catch(_){}; renderWeatherPage(); evaluateAlerts();
    });
    document.getElementById('wxEnableNotifications')?.addEventListener('click',async()=>{
      const ok=await ensureNotificationPermission(true); try{toast(ok?'Windows notifications enabled':'Notification permission was not granted')}catch(_){};
    });
    document.getElementById('wxTestNotification')?.addEventListener('click',()=>void sendSmartAlert('Noctem Locus weather test','Smart observing alerts are ready.'));
  }

  function tonightWeatherHtml(cache) {
    const site=activeSite(); if(!site)return'';
    const s=currentSummary(cache),h=s.hour,w=s.window;
    return `<section class="panel v12TonightWeather"><div class="panelHeader"><div><p class="eyebrow">ASTRONOMY WEATHER</p><h3>${cache?`${s.score.label} tonight · ${s.score.score}/100`:'Weather forecast not loaded'}</h3></div><button class="miniButton" id="openWeatherPage">Open Weather</button></div>
      <div class="v12TonightGrid">
        <div><span>Clouds</span><strong>${h?`${Math.round(h.cloud)}%`:'—'}</strong></div>
        <div><span>Wind</span><strong>${h?windText(h.windKmh):'—'}</strong></div>
        <div><span>Dew risk</span><strong>${h?s.score.dew.level:'—'}</strong></div>
        <div><span>Best window</span><strong>${w?`${timeShort(w.start)}–${timeShort(w.end)}`:'—'}</strong></div>
      </div><small>${escWx(cacheStatus(cache))}</small></section>`;
  }

  function augmentTonight() {
    const stack=document.querySelector('#page .pageStack'); if(!stack||document.querySelector('.v12TonightWeather'))return;
    const wrap=document.createElement('div'); wrap.innerHTML=tonightWeatherHtml(weatherCache());
    const node=wrap.firstElementChild; if(node)stack.insertBefore(node,stack.children[2]||null);
    document.getElementById('openWeatherPage')?.addEventListener('click',()=>{page='Weather';renderShell()});
    const cache=weatherCache(); if(!cache||cacheAge(cache)>CACHE_MAX_AGE_MS)void refreshForecast({silent:true}).then(()=>{if(page==='Tonight')renderTonight();}).catch(()=>{});
  }

  function augmentSettings() {
    const card=document.querySelector('.settingsCard'); if(!card||document.getElementById('v12WeatherSettings'))return;
    const before=document.getElementById('nativeDataCard'); const el=document.createElement('div'); el.id='v12WeatherSettings';
    el.innerHTML=`<div class="settingsDivider"></div><div class="settingsHeading"><div><h3>Weather & online enhancement</h3><p>Weather is optional. Forecasts are fetched from Open-Meteo for the active observing site and cached inside Noctem Locus so the latest forecast remains visible offline.</p></div><span class="validationBadge ${settings.weather.enabled?'valid':''}">${settings.weather.enabled?'Enabled':'Disabled'}</span></div><div class="inlineActions"><label class="v12InlineLabel">Display units<select id="wxUnits"><option value="auto" ${settings.weather.units==='auto'?'selected':''}>Automatic</option><option value="f" ${settings.weather.units==='f'?'selected':''}>°F / mph</option><option value="c" ${settings.weather.units==='c'?'selected':''}>°C / km/h</option></select></label><label class="v12CheckLabel"><input type="checkbox" id="wxEnabled" ${settings.weather.enabled?'checked':''}> Enable weather features</label><button class="secondaryButton" id="wxSettingsSave">Save weather settings</button></div><p class="mutedText">Forecast data © Open-Meteo contributors, CC BY 4.0. The free endpoint is intended for non-commercial use. Noctem Locus astronomy features remain offline-capable.</p>`;
    if(before)card.insertBefore(el,before);else card.appendChild(el);
    document.getElementById('wxSettingsSave')?.addEventListener('click',()=>{settings.weather.units=document.getElementById('wxUnits').value;settings.weather.enabled=document.getElementById('wxEnabled').checked;saveSettings();try{toast('Weather settings saved')}catch(_){};renderShell();});
  }

  async function ensureNotificationPermission(promptUser=false) {
    const api=window.__TAURI__?.notification; if(!api)return false;
    try {
      let ok=await api.isPermissionGranted();
      if(!ok&&promptUser){const p=await api.requestPermission();ok=p==='granted';}
      return !!ok;
    } catch(e){console.warn('Notification permission check failed',e);return false;}
  }
  async function sendSmartAlert(title,body) {
    let sent=false; const api=window.__TAURI__?.notification;
    if(api&&await ensureNotificationPermission(false)){
      try{api.sendNotification({title,body});sent=true;}catch(e){console.warn('Native notification failed',e);}
    }
    try{toast(`${title}: ${body}`)}catch(_){}
    return sent;
  }

  function canAlert(key,cooldownHours=6) {
    const t=settings.weather.alertHistory[key]; const now=Date.now();
    return !t || now-new Date(t).getTime()>cooldownHours*3600000;
  }
  function markAlert(key){settings.weather.alertHistory[key]=new Date().toISOString();saveSettings();}

  async function evaluateAlerts() {
    ensureWeatherSettings(); const a=settings.weather.alerts; if(!settings.weather.enabled||!a.enabled)return;
    const cache=weatherCache(); if(!cache)return;
    if(a.goodWindow){
      const w=bestWindow(cache,new Date(),18,Number(a.minScore),Number(a.minWindowMinutes));
      if(w){const key=`window:${localDayKey(w.start)}:${w.start.getHours()}`;if(canAlert(key,a.cooldownHours)){markAlert(key);await sendSmartAlert('Good observing window tonight',`${timeShort(w.start)}–${timeShort(w.end)} · score ${w.score}/100 · ${w.avgCloud}% average clouds.`);}}
    }
    if(a.dewDuringSession){
      const session=settings.planner?.session; const now=nearestHour(cache,new Date()),risk=dewRisk(now);
      if(session&&!session.endedAt&&risk.level==='High'&&canAlert('dew-session',2)){markAlert('dew-session');await sendSmartAlert('High dew risk','Temperature is close to the dew point. Telescope optics may begin collecting condensation.');}
    }
    if(a.targetEnabled){
      try{
        const obj=catalogObject(a.targetKey),observer=parseObserver(),hour=nearestHour(cache,new Date());
        if(obj&&observer&&hour){const p=positionForObject(obj,observer,new Date()),limit=window.noctemLocusPlanner?.horizonLimit?.(p.azimuthDeg)||0,sun=getBodyPosition('Sun',observer,new Date());
          if(p.altitudeDeg>=Number(a.targetMinAltitude)&&p.altitudeDeg>limit+1&&hour.cloud<=Number(a.targetMaxCloud)&&hour.precipProbability<30&&sun.altitudeDeg<0){const key=`target:${a.targetKey}`;if(canAlert(key,a.cooldownHours)){markAlert(key);await sendSmartAlert(`${typeof objectDisplayName==='function'?objectDisplayName(obj):(obj.name||obj.id)} is ready`,`${p.altitudeDeg.toFixed(0)}° high · ${Math.round(hour.cloud)}% clouds · ${windText(hour.windKmh)} wind.`);}}}
      }catch(e){console.warn('Target weather alert evaluation failed',e);}
    }
  }

  function installStyles() {
    if(document.getElementById('v12WeatherStyles'))return; const style=document.createElement('style');style.id='v12WeatherStyles';style.textContent=`
      .v12WeatherHero{border:1px solid var(--border);border-radius:22px;background:radial-gradient(circle at 82% 22%,var(--glow),transparent 38%),var(--panel);padding:28px;display:flex;justify-content:space-between;align-items:center;gap:24px}.v12WeatherHero h3{font-size:32px;margin:0 0 10px}.v12WeatherHero p{max-width:760px;color:var(--muted);line-height:1.5;margin:0}.v12HeroScore{min-width:150px;aspect-ratio:1;border:1px solid var(--border);border-radius:50%;display:grid;place-items:center;align-content:center;background:var(--panel2)}.v12HeroScore strong{font-size:46px;font-weight:500}.v12HeroScore span{font-size:9px;color:var(--muted);letter-spacing:.12em}.v12HeroScore.good{box-shadow:0 0 30px var(--glow)}
      .v12MetricGrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.v12Metric{border:1px solid var(--border);border-radius:14px;background:var(--panel);padding:16px;display:grid;gap:7px}.v12Metric span,.v12Metric small{color:var(--muted);font-size:10px}.v12Metric strong{font-size:18px;font-weight:550}.v12HourlyScroller{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(130px,1fr);overflow-x:auto;gap:9px;margin-top:18px;padding-bottom:7px}.v12Hour{border:1px solid var(--border);border-radius:13px;background:var(--panel2);padding:12px;display:grid;gap:6px;min-height:190px}.v12Hour.dark{border-color:var(--accent)}.v12Hour>span,.v12Hour small{color:var(--muted);font-size:10px}.v12Hour small{display:flex;justify-content:space-between;gap:8px}.v12Hour b{color:var(--text);font-weight:550}.v12Score{width:38px;height:38px;border-radius:50%;display:grid;place-items:center;border:1px solid var(--border);font-size:12px}.v12Score.good{background:var(--glow);color:var(--good)}.v12Score.fair{color:var(--text)}.v12Score.poor{color:var(--muted)}
      .v12Outlook{display:grid;grid-template-columns:repeat(6,minmax(120px,1fr));gap:9px;margin-top:18px;overflow-x:auto}.v12Day{border:1px solid var(--border);border-radius:13px;background:var(--panel2);color:var(--text);padding:14px;text-align:left;display:grid;gap:7px}.v12Day:hover{background:var(--glow)}.v12Day span,.v12Day small{color:var(--muted);font-size:10px}.v12Day strong{font-size:20px}.v12AlertGrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:18px}.v12AlertGrid label,.v12TargetRule label,.v12InlineLabel{border:1px solid var(--border);border-radius:11px;background:var(--panel2);padding:11px;display:flex;justify-content:space-between;gap:10px;align-items:center;color:var(--muted);font-size:11px}.v12AlertGrid input[type=number],.v12TargetRule input,.v12TargetRule select,.v12InlineLabel select{min-width:0;border:1px solid var(--border);background:var(--bg);color:var(--text);border-radius:8px;padding:7px}.v12TargetRule{display:grid;grid-template-columns:1.5fr .7fr .7fr;gap:10px;margin-top:10px}.v12TargetRule small{color:var(--muted)}.v12Empty{padding:24px 0;color:var(--muted)}
      .v12TonightWeather{display:grid;gap:14px}.v12TonightGrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.v12TonightGrid>div{border:1px solid var(--border);background:var(--panel2);border-radius:11px;padding:12px;display:grid;gap:5px}.v12TonightGrid span{font-size:10px;color:var(--muted)}.v12TonightGrid strong{font-size:14px}.v12CheckLabel{display:flex;gap:7px;align-items:center;color:var(--muted);font-size:11px}
      @media(max-width:1050px){.v12MetricGrid,.v12TonightGrid{grid-template-columns:1fr 1fr}.v12AlertGrid{grid-template-columns:1fr 1fr}.v12Outlook{grid-template-columns:repeat(6,140px)}}@media(max-width:760px){.v12WeatherHero{flex-direction:column;align-items:flex-start}.v12HeroScore{min-width:115px}.v12MetricGrid,.v12TonightGrid,.v12AlertGrid,.v12TargetRule{grid-template-columns:1fr}}
    `;document.head.appendChild(style);
  }

  async function backgroundCycle() {
    if(!ensureWeatherSettings().enabled)return;
    const site=activeSite();if(!site)return;
    try{await refreshForecast({site,silent:true});await evaluateAlerts();}catch(_){}
  }

  function install() {
    ensureWeatherSettings(); installStyles();
    if(Array.isArray(PAGES)&&!PAGES.includes('Weather')){const i=PAGES.indexOf('Planner');PAGES.splice(i>=0?i+1:1,0,'Weather');}
    baseRenderPage=renderPage; renderPage=function v12RenderPage(){if(page==='Weather'){clearInterval(tickTimer);renderWeatherPage();return;}baseRenderPage();};
    baseRenderShell=renderShell; renderShell=function v12RenderShell(){baseRenderShell();const v=document.querySelector('.brand p');if(v)v.textContent=`Offline astronomy v${VERSION}`;document.title=`Noctem Locus v${VERSION}`;if(page==='Weather')renderWeatherPage();if(page==='Settings')augmentSettings();};
    baseRenderTonight=renderTonight; renderTonight=function v12RenderTonight(){baseRenderTonight();augmentTonight();};
    baseRenderSettings=renderSettings; renderSettings=function v12RenderSettings(){baseRenderSettings();augmentSettings();};
    saveSettings();
    void backgroundCycle();
    backgroundTimer=setInterval(()=>void backgroundCycle(),ALERT_POLL_MS);
    window.addEventListener('online',()=>void backgroundCycle());
    window.noctemWeatherV012={version:VERSION,provider:PROVIDER,refresh:opts=>refreshForecast(opts),cache:()=>weatherCache(),hourFor,scoreAt,bestWindow,plannerAdjustment,dewRisk,observingScore,evaluateAlerts};
    renderShell();
  }

  try{install();}catch(error){console.error('Noctem Locus v0.12 weather layer failed',error);try{toast(`Weather could not start: ${error.message||error}`)}catch(_){}}
})();
