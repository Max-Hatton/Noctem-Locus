(() => {
  if (window.__NOCTEM_INSIGHTS_V013__) return;
  window.__NOCTEM_INSIGHTS_V013__ = true;

  const VERSION = '0.13.0-dev';
  const SAMPLE_MINUTES = 30;
  const TIMELINE_HOURS = 12;
  let baseRenderTonight = null;
  let baseRenderFinder = null;
  let lastFinderKey = '';

  const clamp13 = (value, lo, hi) => Math.max(lo, Math.min(hi, Number(value)));
  const esc13 = value => String(value ?? '').replace(/[&<>\"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[ch]));

  function ensureData() {
    settings.insights ||= {};
    if (!Array.isArray(settings.insights.favorites)) settings.insights.favorites = [];
    if (!Array.isArray(settings.insights.recent)) settings.insights.recent = [];
    settings.insights.favorites = [...new Set(settings.insights.favorites.filter(Boolean))].slice(0,80);
    settings.insights.recent = [...new Set(settings.insights.recent.filter(Boolean))].slice(0,12);
    return settings.insights;
  }

  function displayName(obj) {
    if (!obj) return 'Unknown object';
    try { return typeof objectDisplayName === 'function' ? objectDisplayName(obj) : (obj.name || obj.id || obj.key); }
    catch (_) { return obj.name || obj.id || obj.key || 'Object'; }
  }

  function activeSite13() {
    try { return window.noctemLocusPlanner?.activeSite?.() || null; } catch (_) { return null; }
  }

  function horizonAt(azimuthDeg) {
    try { return Number(window.noctemLocusPlanner?.horizonLimit?.(azimuthDeg) || 0); } catch (_) { return 0; }
  }

  function weatherAt(date) {
    try { return window.noctemWeatherV012?.scoreAt?.(date, activeSite13()) || null; } catch (_) { return null; }
  }

  function isWet(hour) {
    try { return !!window.noctemWeatherV012?.isPrecipitating?.(hour); } catch (_) { return false; }
  }

  function timeLabel(date) {
    return date.toLocaleTimeString([], {hour:'numeric', minute:'2-digit'});
  }

  function shortTime(date) {
    return date.toLocaleTimeString([], {hour:'numeric'});
  }

  function sphericalSeparation(a, b) {
    if (!a || !b) return NaN;
    const rad = Math.PI / 180;
    const a1 = Number(a.altitudeDeg) * rad, a2 = Number(b.altitudeDeg) * rad;
    const dz = (Number(a.azimuthDeg) - Number(b.azimuthDeg)) * rad;
    const cos = Math.sin(a1)*Math.sin(a2) + Math.cos(a1)*Math.cos(a2)*Math.cos(dz);
    return Math.acos(clamp13(cos,-1,1)) / rad;
  }

  function currentMoonSeparation(obj, observer, date = new Date()) {
    if (!obj || !observer || obj.key === 'sol:Moon') return null;
    try {
      const target = positionForObject(obj, observer, date);
      const moon = getBodyPosition('Moon', observer, date);
      const sep = sphericalSeparation(target, moon);
      return Number.isFinite(sep) ? sep : null;
    } catch (_) { return null; }
  }

  function trackRecent(key) {
    if (!key || key === lastFinderKey) return;
    lastFinderKey = key;
    const data = ensureData();
    data.recent = [key, ...data.recent.filter(x => x !== key)].slice(0,10);
    saveSettings();
  }

  function toggleFavorite(key) {
    const data = ensureData();
    if (data.favorites.includes(key)) data.favorites = data.favorites.filter(x => x !== key);
    else data.favorites = [key, ...data.favorites].slice(0,80);
    saveSettings();
    try { toast(data.favorites.includes(key) ? 'Added to favorites' : 'Removed from favorites'); } catch (_) {}
  }

  function objectChip(key, kind) {
    let obj = null;
    try { obj = catalogObject(key); } catch (_) {}
    if (!obj) return '';
    return `<button class="v13ObjectChip" data-v13-open="${esc13(key)}"><span>${kind === 'favorite' ? '★' : '↺'}</span>${esc13(displayName(obj))}</button>`;
  }

  function favoritesRecentHtml() {
    const data = ensureData();
    const fav = data.favorites.map(key => objectChip(key,'favorite')).filter(Boolean).join('');
    const recent = data.recent.map(key => objectChip(key,'recent')).filter(Boolean).join('');
    if (!fav && !recent) return '';
    return `<section class="v13QuickObjects">
      ${fav ? `<div><span>Favorites</span><div class="v13ChipRow">${fav}</div></div>` : ''}
      ${recent ? `<div><span>Recent</span><div class="v13ChipRow">${recent}</div></div>` : ''}
    </section>`;
  }

  function sampleTarget(obj, observer, from = new Date(), hours = TIMELINE_HOURS) {
    const rows = [];
    const count = Math.floor(hours * 60 / SAMPLE_MINUTES);
    for (let i=0; i<=count; i++) {
      const date = new Date(from.getTime() + i * SAMPLE_MINUTES * 60000);
      try {
        const p = positionForObject(obj, observer, date);
        const sun = getBodyPosition('Sun', observer, date);
        const moon = getBodyPosition('Moon', observer, date);
        rows.push({date, p, sunAlt:sun.altitudeDeg, moonAlt:moon.altitudeDeg, moonSep:sphericalSeparation(p,moon), horizon:horizonAt(p.azimuthDeg), weather:weatherAt(date)});
      } catch (_) {}
    }
    return rows;
  }

  function graphY(altitude) {
    return 220 - clamp13((Number(altitude) + 10) / 100, 0, 1) * 200;
  }

  function linePath(rows, getter) {
    if (!rows.length) return '';
    return rows.map((row,i) => `${i ? 'L' : 'M'} ${(i/(rows.length-1 || 1))*980+10} ${graphY(getter(row))}`).join(' ');
  }

  function targetVisibilityHtml(obj, observer) {
    const now = new Date();
    const rows = sampleTarget(obj,observer,now,TIMELINE_HOURS);
    if (!rows.length) return '';
    const altitudePath = linePath(rows, r => r.p.altitudeDeg);
    const horizonPath = linePath(rows, r => r.horizon);
    const peak = rows.reduce((best,row) => !best || row.p.altitudeDeg > best.p.altitudeDeg ? row : best, null);
    const currentSep = currentMoonSeparation(obj,observer,now);
    const bestWeather = rows.filter(r => r.weather).reduce((best,row) => !best || row.weather.score > best.weather.score ? row : best, null);
    const ticks = [0,30,60,90].map(a => `<line x1="10" y1="${graphY(a)}" x2="990" y2="${graphY(a)}" class="v13GridLine"/><text x="14" y="${graphY(a)-4}" class="v13SvgLabel">${a}°</text>`).join('');
    const timeTicks = rows.filter((_,i) => i % 4 === 0 || i === rows.length-1).map((r,i,arr) => `<span style="left:${(rows.indexOf(r)/(rows.length-1||1))*100}%">${esc13(shortTime(r.date))}</span>`).join('');
    const blockedCount = rows.filter(r => r.p.altitudeDeg <= r.horizon + 1).length;
    const wetCount = rows.filter(r => isWet(r.weather?.hour)).length;
    return `<section class="panel v13VisibilityPanel">
      <div class="panelHeader"><div><p class="eyebrow">TARGET VISIBILITY</p><h3>${esc13(displayName(obj))} through the next ${TIMELINE_HOURS} hours</h3></div><span class="mutedText">Altitude vs. your local horizon</span></div>
      <div class="v13VisibilityStats">
        <div><span>Highest altitude</span><strong>${peak.p.altitudeDeg.toFixed(0)}°</strong><small>${esc13(timeLabel(peak.date))}</small></div>
        <div><span>Moon separation now</span><strong>${currentSep == null ? '—' : `${currentSep.toFixed(0)}°`}</strong><small>${currentSep == null ? 'Not applicable' : currentSep < 25 ? 'Strong moon interference possible' : currentSep < 50 ? 'Moderate separation' : 'Good separation'}</small></div>
        <div><span>Best forecast sample</span><strong>${bestWeather ? `${bestWeather.weather.score}/100` : '—'}</strong><small>${bestWeather ? esc13(timeLabel(bestWeather.date)) : 'No cached forecast'}</small></div>
        <div><span>Obstructions</span><strong>${blockedCount ? `${blockedCount} samples` : 'Clear'}</strong><small>${wetCount ? `${wetCount} wet sample${wetCount===1?'':'s'}` : 'No sampled precipitation'}</small></div>
      </div>
      <div class="v13GraphWrap"><svg viewBox="0 0 1000 240" role="img" aria-label="Target altitude graph">${ticks}<path d="${horizonPath}" class="v13HorizonPath"/><path d="${altitudePath}" class="v13AltitudePath"/></svg><div class="v13TimeAxis">${timeTicks}</div></div>
      <div class="v13GraphLegend"><span><i class="alt"></i>Target altitude</span><span><i class="horizon"></i>Local horizon</span></div>
    </section>`;
  }

  function darknessState(sunAlt) {
    if (sunAlt >= 0) return {label:'Daylight', cls:'day'};
    if (sunAlt >= -6) return {label:'Civil twilight', cls:'civil'};
    if (sunAlt >= -12) return {label:'Nautical twilight', cls:'nautical'};
    if (sunAlt >= -18) return {label:'Astronomical twilight', cls:'astro'};
    return {label:'Astronomical night', cls:'dark'};
  }

  function sampleNight(observer, from = new Date()) {
    const rows = [];
    const count = Math.floor(TIMELINE_HOURS * 60 / SAMPLE_MINUTES);
    for (let i=0;i<=count;i++) {
      const date = new Date(from.getTime() + i*SAMPLE_MINUTES*60000);
      try {
        const sun = getBodyPosition('Sun',observer,date);
        const moon = getBodyPosition('Moon',observer,date);
        rows.push({date,sunAlt:sun.altitudeDeg,moonAlt:moon.altitudeDeg,weather:weatherAt(date)});
      } catch (_) {}
    }
    return rows;
  }

  function timelineCell(row, type) {
    if (type === 'dark') {
      const d = darknessState(row.sunAlt);
      return `<i class="v13TimeCell ${d.cls}" title="${esc13(timeLabel(row.date))} · ${d.label}"></i>`;
    }
    if (type === 'weather') {
      if (!row.weather) return `<i class="v13TimeCell unknown" title="${esc13(timeLabel(row.date))} · no cached weather"></i>`;
      if (isWet(row.weather.hour)) return `<i class="v13TimeCell wet" title="${esc13(timeLabel(row.date))} · ${esc13(row.weather.hour ? window.noctemWeatherV012.weatherCodeText(row.weather.hour.weatherCode) : 'precipitation')}"></i>`;
      const cls = row.weather.score >= 72 ? 'wxGood' : row.weather.score >= 45 ? 'wxFair' : 'wxPoor';
      return `<i class="v13TimeCell ${cls}" title="${esc13(timeLabel(row.date))} · observing score ${row.weather.score}/100"></i>`;
    }
    const cls = row.moonAlt > 15 ? 'moonHigh' : row.moonAlt > 0 ? 'moonLow' : 'moonDown';
    return `<i class="v13TimeCell ${cls}" title="${esc13(timeLabel(row.date))} · Moon ${row.moonAlt.toFixed(0)}°"></i>`;
  }

  function nightTimelineHtml(observer) {
    const rows = sampleNight(observer);
    if (!rows.length) return '';
    const labels = rows.filter((_,i) => i % 4 === 0 || i === rows.length-1).map(r => `<span style="left:${(rows.indexOf(r)/(rows.length-1||1))*100}%">${esc13(shortTime(r.date))}</span>`).join('');
    const best = rows.filter(r => r.weather && r.sunAlt < -6 && !isWet(r.weather.hour)).reduce((a,b) => !a || b.weather.score > a.weather.score ? b : a, null);
    return `<section class="panel v13TimelinePanel">
      <div class="panelHeader"><div><p class="eyebrow">NIGHT TIMELINE</p><h3>Darkness, weather and Moon at a glance</h3></div><span class="mutedText">Next ${TIMELINE_HOURS} hours · ${SAMPLE_MINUTES}-minute samples</span></div>
      <div class="v13Timeline">
        <div class="v13TimelineRow"><strong>Darkness</strong><div>${rows.map(r=>timelineCell(r,'dark')).join('')}</div></div>
        <div class="v13TimelineRow"><strong>Weather</strong><div>${rows.map(r=>timelineCell(r,'weather')).join('')}</div></div>
        <div class="v13TimelineRow"><strong>Moon</strong><div>${rows.map(r=>timelineCell(r,'moon')).join('')}</div></div>
        <div class="v13TimelineAxis">${labels}</div>
      </div>
      <div class="v13TimelineSummary">${best ? `<strong>Best sampled conditions:</strong> ${esc13(timeLabel(best.date))} · ${best.weather.score}/100 · Moon ${best.moonAlt.toFixed(0)}° high` : '<strong>No strong weather/darkness overlap found in the sampled window.</strong>'}</div>
    </section>`;
  }

  function eyepieceSuggestion(obj) {
    const scope = typeof activeScope === 'function' ? activeScope() : null;
    const eps = Array.isArray(settings.equipment?.eyepieces) ? settings.equipment.eyepieces : [];
    const focal = Number(scope?.focalLengthMm), aperture = Number(scope?.apertureMm);
    if (!scope || !Number.isFinite(focal) || !eps.length) return '';
    const usable = eps.map(ep => ({ep, f:Number(ep.focalLengthMm), mag:Number(ep.focalLengthMm) > 0 ? focal/Number(ep.focalLengthMm) : NaN})).filter(x => Number.isFinite(x.mag));
    if (!usable.length) return '';
    let pick;
    if (obj.category === 'planet' || obj.category === 'star') {
      const ceiling = Number.isFinite(aperture) ? aperture * 1.7 : Infinity;
      pick = usable.filter(x => x.mag <= ceiling).sort((a,b)=>b.mag-a.mag)[0] || usable.sort((a,b)=>b.mag-a.mag)[0];
    } else {
      pick = usable.sort((a,b)=>a.mag-b.mag)[0];
    }
    return pick ? `${pick.ep.name || `${pick.f.toFixed(0)} mm`} · ${pick.mag.toFixed(0)}×` : '';
  }

  function recommendationObjects(observer, now) {
    const list = [];
    const seen = new Set();
    const push = obj => { if (obj?.key && obj.key !== 'sol:Sun' && !seen.has(obj.key)) { seen.add(obj.key); list.push(obj); } };
    try { (OBJECT_CATALOG || []).forEach(push); } catch (_) {}
    try { (window.noctemCatalogV011?.plannerCandidates?.() || []).slice(0,280).forEach(push); } catch (_) {}
    const data = ensureData();
    return list.map(obj => {
      try {
        const p = positionForObject(obj,observer,now);
        const limit = horizonAt(p.azimuthDeg);
        if (p.altitudeDeg < Math.max(10,limit+2)) return null;
        const rating = observeRating(obj,p,observer,now);
        let score = Number(rating.score || 0) + Math.min(12,Math.max(0,(p.altitudeDeg-20)*.18));
        if (data.favorites.includes(obj.key)) score += 5;
        return {obj,p,rating,score,limit,eyepiece:eyepieceSuggestion(obj)};
      } catch (_) { return null; }
    }).filter(Boolean).sort((a,b)=>b.score-a.score).slice(0,5);
  }

  function recommendationsHtml(observer) {
    const now = new Date();
    const items = recommendationObjects(observer,now);
    const wx = weatherAt(now);
    const weatherWarning = wx && (wx.score < 40 || isWet(wx.hour)) ? `<div class="notice v13WeatherStop"><strong>Weather currently limits observing.</strong> These are the strongest astronomical targets, but conditions may make the telescope unusable right now.</div>` : '';
    return `<section class="panel v13NowPanel"><div class="panelHeader"><div><p class="eyebrow">WHAT SHOULD I LOOK AT RIGHT NOW?</p><h3>${items.length ? 'Five targets worth your attention' : 'No strong targets are above your usable horizon'}</h3></div><span class="mutedText">Uses telescope, altitude, Moon, local horizon${wx?' and weather':''}</span></div>${weatherWarning}<div class="v13NowGrid">${items.map((x,i)=>{
      const tag = i===0 ? 'BEST NOW' : x.score >= 62 ? 'GOOD NOW' : 'POSSIBLE';
      return `<button class="v13NowCard" data-v13-open="${esc13(x.obj.key)}"><span class="v13NowTag">${tag}</span><strong>${esc13(displayName(x.obj))}</strong><span>${x.p.altitudeDeg.toFixed(0)}° high · ${esc13(compassDirection(x.p.azimuthDeg))}</span><small>${esc13(x.rating.reason || x.rating.label || 'Visible now')}</small>${x.eyepiece?`<small>Suggested eyepiece: ${esc13(x.eyepiece)}</small>`:''}</button>`;
    }).join('')}</div></section>`;
  }

  function bindOpenTargets(root = document) {
    root.querySelectorAll('[data-v13-open]').forEach(button => {
      button.onclick = () => {
        selectedObjectKey = button.dataset.v13Open;
        searchQuery = '';
        page = 'Finder';
        renderShell();
      };
    });
  }

  function augmentTonight() {
    const stack = document.querySelector('#page .pageStack');
    if (!stack || document.querySelector('.v13TimelinePanel')) return;
    const observer = parseObserver();
    if (!observer) return;
    const timeline = document.createElement('div');
    timeline.innerHTML = nightTimelineHtml(observer);
    if (timeline.firstElementChild) stack.insertBefore(timeline.firstElementChild, stack.children[2] || null);
    const now = document.createElement('div');
    now.innerHTML = recommendationsHtml(observer);
    if (now.firstElementChild) stack.insertBefore(now.firstElementChild, stack.children[3] || null);
    bindOpenTargets(stack);
  }

  function augmentFinder() {
    const stack = document.querySelector('#page .pageStack');
    if (!stack) return;
    const observer = parseObserver();
    let obj = null;
    try { obj = catalogObject(selectedObjectKey); } catch (_) {}
    if (!observer || !obj) return;
    trackRecent(obj.key);

    const hero = stack.querySelector('.objectHero');
    if (hero && !hero.querySelector('#v13FavoriteTarget')) {
      const first = hero.firstElementChild;
      const fav = ensureData().favorites.includes(obj.key);
      const button = document.createElement('button');
      button.id = 'v13FavoriteTarget';
      button.className = 'secondaryButton v13FavoriteButton';
      button.textContent = fav ? '★ Favorited' : '☆ Add to favorites';
      button.onclick = () => { toggleFavorite(obj.key); renderFinder(); };
      first?.appendChild(button);
    }

    if (!stack.querySelector('.v13QuickObjects')) {
      const quickHtml = favoritesRecentHtml();
      if (quickHtml) {
        const wrap = document.createElement('div');
        wrap.innerHTML = quickHtml;
        const finderBar = stack.querySelector('.finderBar');
        if (wrap.firstElementChild && finderBar) finderBar.insertAdjacentElement('afterend',wrap.firstElementChild);
      }
    }

    if (!stack.querySelector('.v13VisibilityPanel')) {
      const wrap = document.createElement('div');
      wrap.innerHTML = targetVisibilityHtml(obj,observer);
      const note = stack.querySelector('.notePanel');
      if (wrap.firstElementChild) note ? note.insertAdjacentElement('beforebegin',wrap.firstElementChild) : stack.appendChild(wrap.firstElementChild);
    }
    bindOpenTargets(stack);
  }

  function installStyles() {
    if (document.getElementById('v13InsightsStyles')) return;
    const style = document.createElement('style');
    style.id = 'v13InsightsStyles';
    style.textContent = `
      .v13TimelinePanel,.v13VisibilityPanel,.v13NowPanel{overflow:hidden}.v13Timeline{margin-top:18px;display:grid;gap:8px}.v13TimelineRow{display:grid;grid-template-columns:80px 1fr;gap:10px;align-items:center}.v13TimelineRow>strong{font-size:10px;color:var(--muted);font-weight:600}.v13TimelineRow>div{height:24px;display:grid;grid-auto-flow:column;grid-auto-columns:1fr;gap:2px}.v13TimeCell{display:block;border-radius:4px;background:var(--panel2);border:1px solid var(--border)}.v13TimeCell.day{opacity:.32}.v13TimeCell.civil{opacity:.48}.v13TimeCell.nautical{opacity:.63}.v13TimeCell.astro{opacity:.78}.v13TimeCell.dark{background:var(--glow);border-color:var(--accent)}.v13TimeCell.wxGood{background:var(--glow);border-color:var(--good)}.v13TimeCell.wxFair{opacity:.7}.v13TimeCell.wxPoor{opacity:.32}.v13TimeCell.wet{border-color:var(--accent);background:repeating-linear-gradient(135deg,var(--panel2),var(--panel2) 4px,var(--glow) 4px,var(--glow) 8px)}.v13TimeCell.moonHigh{background:var(--glow);border-color:var(--accent)}.v13TimeCell.moonLow{opacity:.65}.v13TimeCell.moonDown{opacity:.22}.v13TimelineAxis{position:relative;height:20px;margin-left:90px}.v13TimelineAxis span,.v13TimeAxis span{position:absolute;transform:translateX(-50%);font-size:9px;color:var(--muted);white-space:nowrap}.v13TimelineSummary{margin-top:12px;color:var(--muted);font-size:11px}.v13TimelineSummary strong{color:var(--text)}
      .v13NowGrid{display:grid;grid-template-columns:repeat(5,minmax(150px,1fr));gap:9px;margin-top:18px;overflow-x:auto}.v13NowCard{border:1px solid var(--border);background:var(--panel2);color:var(--text);border-radius:14px;padding:14px;text-align:left;display:grid;gap:7px;min-height:150px}.v13NowCard:hover{background:var(--glow)}.v13NowCard>strong{font-size:17px}.v13NowCard>span:not(.v13NowTag),.v13NowCard small{font-size:10px;color:var(--muted);line-height:1.35}.v13NowTag{font-size:9px;letter-spacing:.12em;color:var(--good)}.v13WeatherStop{margin-top:14px}
      .v13VisibilityStats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin-top:18px}.v13VisibilityStats>div{border:1px solid var(--border);border-radius:11px;background:var(--panel2);padding:12px;display:grid;gap:4px}.v13VisibilityStats span,.v13VisibilityStats small{font-size:9px;color:var(--muted)}.v13VisibilityStats strong{font-size:16px}.v13GraphWrap{margin-top:16px;border:1px solid var(--border);border-radius:14px;background:var(--panel2);padding:8px 10px 26px}.v13GraphWrap svg{display:block;width:100%;height:240px;overflow:visible}.v13GridLine{stroke:var(--border);stroke-width:1}.v13SvgLabel{fill:var(--muted);font-size:13px}.v13AltitudePath{fill:none;stroke:var(--accent);stroke-width:4;stroke-linecap:round;stroke-linejoin:round}.v13HorizonPath{fill:none;stroke:var(--muted);stroke-width:2;stroke-dasharray:8 7}.v13TimeAxis{position:relative;height:1px;margin:0 12px}.v13GraphLegend{display:flex;gap:18px;margin-top:10px;color:var(--muted);font-size:10px}.v13GraphLegend span{display:flex;gap:6px;align-items:center}.v13GraphLegend i{width:18px;height:2px;background:var(--accent)}.v13GraphLegend i.horizon{background:var(--muted)}
      .v13QuickObjects{border:1px solid var(--border);border-radius:13px;background:var(--panel);padding:11px 13px;display:grid;gap:9px}.v13QuickObjects>div{display:flex;align-items:center;gap:10px;min-width:0}.v13QuickObjects>div>span{width:58px;flex:0 0 58px;font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:var(--muted)}.v13ChipRow{display:flex;gap:6px;overflow-x:auto}.v13ObjectChip{white-space:nowrap;border:1px solid var(--border);background:var(--panel2);color:var(--text);border-radius:999px;padding:6px 9px;font-size:10px}.v13ObjectChip:hover{background:var(--glow)}.v13ObjectChip span{margin-right:4px;color:var(--accent)}.v13FavoriteButton{margin-top:12px}
      @media(max-width:1100px){.v13NowGrid{grid-template-columns:repeat(5,180px)}.v13VisibilityStats{grid-template-columns:1fr 1fr}}@media(max-width:760px){.v13TimelineRow{grid-template-columns:58px 1fr}.v13TimelineAxis{margin-left:68px}.v13VisibilityStats{grid-template-columns:1fr}.v13QuickObjects>div{align-items:flex-start;flex-direction:column}.v13QuickObjects>div>span{width:auto;flex:auto}.v13GraphWrap svg{height:190px}}
    `;
    document.head.appendChild(style);
  }

  function install() {
    ensureData();
    installStyles();

    baseRenderTonight = renderTonight;
    renderTonight = function v13RenderTonight() {
      baseRenderTonight();
      augmentTonight();
    };

    baseRenderFinder = renderFinder;
    renderFinder = function v13RenderFinder() {
      baseRenderFinder();
      augmentFinder();
    };

    window.noctemInsightsV013 = {
      version:VERSION,
      favorites:() => [...ensureData().favorites],
      recent:() => [...ensureData().recent],
      sampleTarget,
      recommendations:() => {
        const observer=parseObserver();
        return observer ? recommendationObjects(observer,new Date()) : [];
      }
    };

    saveSettings();
    if (page === 'Tonight') augmentTonight();
    if (page === 'Finder') augmentFinder();
  }

  try { install(); }
  catch (error) {
    console.error('Noctem Locus v0.13 insights layer failed',error);
    try { toast(`v0.13 observing insights could not start: ${error.message || error}`); } catch (_) {}
  }
})();
