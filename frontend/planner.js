(() => {
  if (window.__NOCTEM_LOCUS_V010__) return;
  window.__NOCTEM_LOCUS_V010__ = true;

  const VERSION = '0.11.0';
  const DIRECTIONS = [
    ['N',0],['NE',45],['E',90],['SE',135],
    ['S',180],['SW',225],['W',270],['NW',315]
  ];

  function waitForNativeBridge(timeoutMs = 5000) {
    return new Promise(resolve => {
      const started = Date.now();
      const timer = setInterval(() => {
        if (window.noctemLocusNative || Date.now() - started > timeoutMs) {
          clearInterval(timer);
          resolve();
        }
      }, 40);
    });
  }

  function uid(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  }

  function localDateKey(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function horizonArray(value) {
    const src = Array.isArray(value) ? value : [];
    return DIRECTIONS.map((_, i) => {
      const n = Number(src[i]);
      return Number.isFinite(n) ? Math.max(0, Math.min(60, n)) : 0;
    });
  }

  function locationFromLegacy() {
    const lat = Number(settings.latitude);
    const lon = Number(settings.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || String(settings.latitude).trim() === '' || String(settings.longitude).trim() === '') return null;
    return {
      id: uid('site'),
      name: String(settings.locationName || 'Current site').trim() || 'Current site',
      latitude: String(settings.latitude),
      longitude: String(settings.longitude),
      elevationM: String(settings.elevationM || '0'),
      horizon: horizonArray()
    };
  }

  function ensureV010Data() {
    if (!Array.isArray(settings.locations)) settings.locations = [];
    settings.locations = settings.locations.map(site => ({
      id: String(site.id || uid('site')),
      name: String(site.name || 'Observing site'),
      latitude: String(site.latitude ?? ''),
      longitude: String(site.longitude ?? ''),
      elevationM: String(site.elevationM ?? '0'),
      horizon: horizonArray(site.horizon)
    }));
    if (!settings.locations.length) {
      const migrated = locationFromLegacy();
      if (migrated) settings.locations.push(migrated);
    }
    if (!settings.activeLocationId || !settings.locations.some(s => s.id === settings.activeLocationId)) {
      settings.activeLocationId = settings.locations[0]?.id || '';
    }
    const p = settings.planner && typeof settings.planner === 'object' ? settings.planner : {};
    settings.planner = {
      date: p.date || localDateKey(),
      hoursAhead: Math.max(2, Math.min(12, Number(p.hoursAhead || 8))),
      targetCount: Math.max(1, Math.min(15, Number(p.targetCount || 8))),
      categories: {
        planet: p.categories?.planet !== false,
        messier: p.categories?.messier !== false,
        star: p.categories?.star !== false,
        dso: p.categories?.dso !== false
      },
      queue: Array.isArray(p.queue) ? p.queue.filter(Boolean) : [],
      session: p.session && typeof p.session === 'object' ? p.session : null,
      sessions: Array.isArray(p.sessions) ? p.sessions : []
    };
  }

  function activeSite() {
    return settings.locations.find(s => s.id === settings.activeLocationId) || null;
  }

  function syncLegacyFromSite(site) {
    if (!site) return;
    settings.activeLocationId = site.id;
    settings.locationName = site.name;
    settings.latitude = site.latitude;
    settings.longitude = site.longitude;
    settings.elevationM = site.elevationM;
  }

  function currentObserverMatchesSite(observer, site) {
    if (!observer || !site) return false;
    const lat = Number(site.latitude), lon = Number(site.longitude);
    return Number.isFinite(lat) && Number.isFinite(lon)
      && Math.abs(observer.latitude - lat) < 0.002
      && Math.abs(observer.longitude - lon) < 0.002;
  }

  function horizonLimit(site, azimuthDeg) {
    if (!site) return 0;
    const h = horizonArray(site.horizon);
    const az = ((Number(azimuthDeg) % 360) + 360) % 360;
    const scaled = az / 45;
    const i = Math.floor(scaled) % 8;
    const t = scaled - Math.floor(scaled);
    return h[i] * (1 - t) + h[(i + 1) % 8] * t;
  }

  function applySite(siteId) {
    const site = settings.locations.find(s => s.id === siteId);
    if (!site) return;
    syncLegacyFromSite(site);
    saveSettings();
    if (typeof toast === 'function') toast(`Observing site: ${site.name}`);
    renderShell();
  }

  function categoryLabel(obj) {
    if (obj.category === 'dso') return obj.kind || 'Deep sky';
    if (obj.category === 'messier') return obj.kind || 'Deep sky';
    if (obj.category === 'star') return 'Bright star';
    return obj.kind || 'Solar system';
  }

  function objectMinutes(obj) {
    if (obj.category === 'planet') return 20;
    if (obj.category === 'messier') return 15;
    return 10;
  }

  function localDateTime(dateString) {
    const today = localDateKey();
    if (dateString === today) return new Date();
    const d = new Date(`${dateString}T18:00:00`);
    return Number.isNaN(d.getTime()) ? new Date() : d;
  }

  function candidateObjects() {
    const enabled = settings.planner.categories;
    const base = OBJECT_CATALOG.filter(obj => {
      if (obj.key === 'sol:Sun') return false;
      if (obj.category === 'planet') return enabled.planet;
      if (obj.category === 'messier') return enabled.messier;
      if (obj.category === 'star') return enabled.star;
      return false;
    });
    const extra = enabled.dso && window.noctemCatalogV011?.plannerCandidates ? window.noctemCatalogV011.plannerCandidates() : [];
    return [...base, ...extra];
  }

  function evaluateCandidate(obj, observer, start) {
    const site = activeSite();
    const stepMinutes = 20;
    const totalSteps = Math.ceil(settings.planner.hoursAhead * 60 / stepMinutes);
    let best = null;
    let firstClear = null;

    for (let i = 0; i <= totalSteps; i += 1) {
      const date = new Date(start.getTime() + i * stepMinutes * 60000);
      const p = positionForObject(obj, observer, date);
      const base = baseObserveRating(obj, p, observer, date);
      const limit = horizonLimit(site, p.azimuthDeg);
      const clear = p.altitudeDeg > Math.max(0, limit + 1);
      let score = base.score;
      if (!clear) score -= 90;
      else if (p.altitudeDeg < limit + 7) score -= 8;
      if (clear && !firstClear) firstClear = date;
      const sample = { obj, p, date, rating: base, score, limit, clear };
      if (!best || sample.score > best.score) best = sample;
    }

    const nowP = positionForObject(obj, observer, start);
    const nowLimit = horizonLimit(site, nowP.azimuthDeg);
    return {
      ...best,
      nowP,
      nowLimit,
      nowClear: nowP.altitudeDeg > Math.max(0, nowLimit + 1),
      firstClear
    };
  }

  function buildCandidates(observer) {
    const start = localDateTime(settings.planner.date);
    return candidateObjects()
      .map(obj => evaluateCandidate(obj, observer, start))
      .filter(x => x.p)
      .sort((a,b) => b.score - a.score);
  }

  function displayObject(obj) {
    return typeof objectDisplayName === 'function' ? objectDisplayName(obj) : (obj.name || obj.id);
  }

  function timeLabel(date) {
    try { return fmtTime(date); } catch (_) {
      return date.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'});
    }
  }

  function plannerSummary(queue) {
    const minutes = queue.reduce((sum,key) => {
      const obj = catalogObject(key);
      return sum + (obj ? objectMinutes(obj) : 12);
    }, 0);
    const h = Math.floor(minutes / 60), m = minutes % 60;
    return `${queue.length} target${queue.length === 1 ? '' : 's'} · ${h ? `${h}h ` : ''}${m}m estimated`;
  }

  function savePlannerAndRender() {
    saveSettings();
    renderPlanner();
  }

  function autoBuild(candidates) {
    const chosen = [];
    for (const c of candidates) {
      if (!c.clear || c.score < 15) continue;
      if (chosen.includes(c.obj.key)) continue;
      chosen.push(c.obj.key);
      if (chosen.length >= settings.planner.targetCount) break;
    }
    settings.planner.queue = chosen;
    savePlannerAndRender();
    if (typeof toast === 'function') toast(chosen.length ? `Built a ${chosen.length}-target plan` : 'No good targets found in this window');
  }

  function sessionCurrent() {
    const s = settings.planner.session;
    if (!s || s.endedAt) return null;
    return settings.planner.queue[s.index] || null;
  }

  function advanceSession(status) {
    const s = settings.planner.session;
    if (!s || s.endedAt) return;
    const key = settings.planner.queue[s.index];
    if (key) {
      if (status === 'observed') s.completed = [...new Set([...(s.completed || []), key])];
      if (status === 'skipped') s.skipped = [...new Set([...(s.skipped || []), key])];
    }
    s.index += 1;
    if (s.index >= settings.planner.queue.length) endSession(true);
    else savePlannerAndRender();
  }

  function endSession(render = true) {
    const s = settings.planner.session;
    if (!s || s.endedAt) return;
    s.endedAt = new Date().toISOString();
    settings.planner.sessions.push({
      id: s.id,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      completed: [...(s.completed || [])],
      skipped: [...(s.skipped || [])],
      locationId: settings.activeLocationId
    });
    saveSettings();
    if (render) renderPlanner();
  }

  function sessionPanel(observer) {
    const s = settings.planner.session;
    if (!s) return '';
    if (s.endedAt) {
      return `<section class="v10SessionCard">
        <div><p class="eyebrow">SESSION COMPLETE</p><h3>${(s.completed || []).length} observed · ${(s.skipped || []).length} skipped</h3>
        <p class="mutedText">Started ${new Date(s.startedAt).toLocaleString()} · finished ${new Date(s.endedAt).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}</p></div>
        <button class="secondaryButton" id="plannerClearSession">Close summary</button>
      </section>`;
    }
    const key = sessionCurrent();
    const obj = key ? catalogObject(key) : null;
    if (!obj) return '';
    const p = positionForObject(obj, observer, new Date());
    const limit = horizonLimit(activeSite(), p.azimuthDeg);
    const number = Math.min(s.index + 1, settings.planner.queue.length);
    return `<section class="v10SessionCard">
      <div class="v10SessionMain">
        <p class="eyebrow">OBSERVING SESSION · TARGET ${number} OF ${settings.planner.queue.length}</p>
        <h3>${esc(displayObject(obj))}</h3>
        <div class="v10SessionMetrics">
          <span>ALT <strong>${p.altitudeDeg.toFixed(1)}°</strong></span>
          <span>AZ <strong>${p.azimuthDeg.toFixed(1)}° ${compassDirection(p.azimuthDeg)}</strong></span>
          <span>LOCAL HORIZON <strong>${limit.toFixed(0)}°</strong></span>
        </div>
      </div>
      <div class="v10SessionActions">
        <button class="primaryButton" id="plannerPushCurrent">Open Push-To</button>
        <button class="secondaryButton" id="plannerObservedCurrent">Observed</button>
        <button class="secondaryButton" id="plannerLogCurrent">Observed + log</button>
        <button class="secondaryButton" id="plannerSkipCurrent">Skip</button>
        <button class="secondaryButton" id="plannerEndSession">End session</button>
      </div>
    </section>`;
  }

  function recommendationCard(c) {
    const nowBlocked = c.nowP.altitudeDeg > 0 && !c.nowClear;
    const status = c.nowP.altitudeDeg <= 0 ? 'Below horizon'
      : nowBlocked ? `Blocked by local horizon (${c.nowLimit.toFixed(0)}°)`
      : c.nowP.altitudeDeg >= 25 ? 'Well placed now'
      : 'Low now';
    const best = c.clear
      ? `${timeLabel(c.date)} · ${c.p.altitudeDeg.toFixed(0)}° high`
      : 'Not clear of local horizon';
    const clearNote = nowBlocked && c.firstClear ? ` · clears local horizon about ${timeLabel(c.firstClear)}` : '';
    const reason = c.rating?.reason || '';
    return `<article class="v10TargetCard">
      <div class="v10TargetTop">
        <div><strong>${esc(displayObject(c.obj))}</strong><span>${esc(categoryLabel(c.obj))}</span></div>
        <span class="ratingPill ${c.score >= 42 ? 'good' : 'poor'}">${c.score >= 62 ? 'Excellent' : c.score >= 42 ? 'Good' : c.score >= 22 ? 'Fair' : 'Poor'}</span>
      </div>
      <div class="v10TargetMetrics">
        <span>Now <strong>${c.nowP.altitudeDeg.toFixed(0)}° · ${compassDirection(c.nowP.azimuthDeg)}</strong></span>
        <span>Best <strong>${best}</strong></span>
      </div>
      <small>${esc(status)}${clearNote}${reason ? ` · ${esc(reason)}` : ''}</small>
      <button class="miniButton" data-planner-add="${esc(c.obj.key)}">Add to plan</button>
    </article>`;
  }

  function queueRow(key, index, candidatesByKey) {
    const obj = catalogObject(key);
    if (!obj) return '';
    const c = candidatesByKey.get(key);
    const best = c?.clear ? `${timeLabel(c.date)} · ${c.p.altitudeDeg.toFixed(0)}°` : 'No clear window';
    return `<div class="v10QueueRow">
      <div class="v10QueueIndex">${index + 1}</div>
      <div><strong>${esc(displayObject(obj))}</strong><span>${esc(categoryLabel(obj))} · best ${esc(best)}</span></div>
      <div class="v10QueueButtons">
        <button class="miniButton" data-planner-up="${index}" ${index === 0 ? 'disabled' : ''}>↑</button>
        <button class="miniButton" data-planner-down="${index}" ${index === settings.planner.queue.length - 1 ? 'disabled' : ''}>↓</button>
        <button class="miniButton" data-planner-remove="${index}">Remove</button>
      </div>
    </div>`;
  }

  function bindPlanner(observer, candidates) {
    document.getElementById('plannerSite')?.addEventListener('change', e => applySite(e.target.value));
    document.getElementById('plannerDate')?.addEventListener('change', e => {
      settings.planner.date = e.target.value;
      savePlannerAndRender();
    });
    document.getElementById('plannerHours')?.addEventListener('change', e => {
      settings.planner.hoursAhead = Number(e.target.value);
      savePlannerAndRender();
    });
    document.getElementById('plannerTargetCount')?.addEventListener('change', e => {
      settings.planner.targetCount = Number(e.target.value);
      savePlannerAndRender();
    });
    document.querySelectorAll('[data-planner-cat]').forEach(cb => cb.onchange = () => {
      settings.planner.categories[cb.dataset.plannerCat] = cb.checked;
      savePlannerAndRender();
    });
    document.getElementById('plannerAutoBuild')?.addEventListener('click', () => autoBuild(candidates));
    document.getElementById('plannerClear')?.addEventListener('click', () => {
      settings.planner.queue = [];
      settings.planner.session = null;
      savePlannerAndRender();
    });
    document.querySelectorAll('[data-planner-add]').forEach(b => b.onclick = () => {
      const key = b.dataset.plannerAdd;
      if (!settings.planner.queue.includes(key)) settings.planner.queue.push(key);
      savePlannerAndRender();
    });
    document.querySelectorAll('[data-planner-remove]').forEach(b => b.onclick = () => {
      settings.planner.queue.splice(Number(b.dataset.plannerRemove), 1);
      savePlannerAndRender();
    });
    document.querySelectorAll('[data-planner-up]').forEach(b => b.onclick = () => {
      const i = Number(b.dataset.plannerUp);
      if (i > 0) [settings.planner.queue[i - 1], settings.planner.queue[i]] = [settings.planner.queue[i], settings.planner.queue[i - 1]];
      savePlannerAndRender();
    });
    document.querySelectorAll('[data-planner-down]').forEach(b => b.onclick = () => {
      const i = Number(b.dataset.plannerDown);
      if (i < settings.planner.queue.length - 1) [settings.planner.queue[i + 1], settings.planner.queue[i]] = [settings.planner.queue[i], settings.planner.queue[i + 1]];
      savePlannerAndRender();
    });
    document.getElementById('plannerStart')?.addEventListener('click', () => {
      if (!settings.planner.queue.length) return;
      settings.planner.session = {id:uid('session'), startedAt:new Date().toISOString(), endedAt:null, index:0, completed:[], skipped:[]};
      savePlannerAndRender();
    });
    document.getElementById('plannerPushCurrent')?.addEventListener('click', () => {
      const key = sessionCurrent();
      if (!key) return;
      pushTargetKey = key;
      pushReferenceKey = '';
      page = 'Push-To';
      renderShell();
    });
    document.getElementById('plannerObservedCurrent')?.addEventListener('click', () => advanceSession('observed'));
    document.getElementById('plannerLogCurrent')?.addEventListener('click', () => {
      const key = sessionCurrent();
      if (!key) return;
      const s = settings.planner.session;
      s.completed = [...new Set([...(s.completed || []), key])];
      s.index += 1;
      if (s.index >= settings.planner.queue.length) endSession(false);
      else saveSettings();
      observationDraftObjectKey = key;
      page = 'Observations';
      renderShell();
    });
    document.getElementById('plannerSkipCurrent')?.addEventListener('click', () => advanceSession('skipped'));
    document.getElementById('plannerEndSession')?.addEventListener('click', () => endSession(true));
    document.getElementById('plannerClearSession')?.addEventListener('click', () => {
      settings.planner.session = null;
      savePlannerAndRender();
    });
  }

  function renderPlanner() {
    ensureV010Data();
    const observer = parseObserver();
    if (!observer) {
      document.getElementById('page').innerHTML = `<section class="placeholder"><div class="orbit">◎</div><h3>Add an observing site first</h3><p>The planner needs an observing location so it can rank targets and apply your local horizon.</p><button class="primaryButton" id="plannerGoSettings">Open Settings</button></section>`;
      document.getElementById('plannerGoSettings').onclick = () => { page = 'Settings'; renderShell(); };
      return;
    }

    const candidates = buildCandidates(observer);
    const recommended = candidates.filter(c => c.score > -30).slice(0, 18);
    const byKey = new Map(candidates.map(c => [c.obj.key, c]));
    const site = activeSite();
    const queue = settings.planner.queue;

    document.getElementById('page').innerHTML = `<section class="pageStack">
      ${sessionPanel(observer)}
      <section class="v10PlannerHero">
        <div>
          <p class="eyebrow">OBSERVING PLANNER</p>
          <h3>Build tonight around what is actually visible.</h3>
          <p>Targets are ranked across the next ${settings.planner.hoursAhead} hours using altitude, darkness, Moon interference, your selected telescope, and the custom horizon for <strong>${esc(site?.name || settings.locationName || 'this site')}</strong>.</p>
        </div>
        <div class="v10PlannerControls">
          <label>Observing site<select id="plannerSite">${settings.locations.map(s => `<option value="${esc(s.id)}" ${s.id === settings.activeLocationId ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
          <label>Date<input id="plannerDate" type="date" value="${esc(settings.planner.date)}"></label>
          <label>Window<select id="plannerHours">${[4,6,8,10,12].map(h => `<option value="${h}" ${settings.planner.hoursAhead === h ? 'selected' : ''}>${h} hours</option>`).join('')}</select></label>
          <label>Plan size<select id="plannerTargetCount">${[4,6,8,10,12,15].map(n => `<option value="${n}" ${settings.planner.targetCount === n ? 'selected' : ''}>${n} targets</option>`).join('')}</select></label>
        </div>
      </section>

      <div class="v10CategoryRow">
        <label><input type="checkbox" data-planner-cat="planet" ${settings.planner.categories.planet ? 'checked' : ''}> Solar system</label>
        <label><input type="checkbox" data-planner-cat="messier" ${settings.planner.categories.messier ? 'checked' : ''}> Messier</label>
        <label><input type="checkbox" data-planner-cat="star" ${settings.planner.categories.star ? 'checked' : ''}> Bright stars</label>
        <label><input type="checkbox" data-planner-cat="dso" ${settings.planner.categories.dso !== false ? 'checked' : ''}> NGC / IC deep sky</label>
        <span class="mutedText">Local horizon: ${horizonArray(site?.horizon).some(v => v > 0) ? 'custom profile active' : 'flat / 0°'}</span>
      </div>

      <div class="v10PlannerGrid">
        <section class="v10PlannerPanel">
          <div class="panelHeader"><div><p class="eyebrow">RECOMMENDED</p><h3>Best targets in this window</h3></div><span class="mutedText">${recommended.length} shown</span></div>
          <div class="v10TargetList">${recommended.length ? recommended.map(recommendationCard).join('') : '<div class="notice">No useful targets were found with these filters.</div>'}</div>
        </section>

        <section class="v10PlannerPanel">
          <div class="panelHeader"><div><p class="eyebrow">TONIGHT'S PLAN</p><h3>${plannerSummary(queue)}</h3></div></div>
          <div class="inlineActions">
            <button class="primaryButton" id="plannerAutoBuild">Auto-build plan</button>
            <button class="secondaryButton" id="plannerClear">Clear</button>
          </div>
          <div class="v10Queue">${queue.length ? queue.map((key,i) => queueRow(key,i,byKey)).join('') : '<div class="v10Empty">Add targets from the recommendations, or let Noctem Locus build a plan automatically.</div>'}</div>
          ${queue.length && !settings.planner.session ? '<button class="primaryButton v10StartButton" id="plannerStart">Begin observing session</button>' : ''}
        </section>
      </div>
    </section>`;

    bindPlanner(observer, candidates);
  }

  function renderSitesSettings() {
    const card = document.querySelector('.settingsCard');
    if (!card || document.getElementById('v10SitesCard')) return;
    ensureV010Data();
    const site = activeSite();
    const before = document.getElementById('nativeDataCard');
    const wrapper = document.createElement('div');
    wrapper.id = 'v10SitesCard';
    wrapper.innerHTML = `
      <div class="settingsDivider"></div>
      <div class="settingsHeading">
        <div><h3>Observing sites & local horizon</h3><p>Save multiple telescope locations. The active site's custom horizon is used by the planner and object ratings, so a house or tree line can count as a real obstruction instead of an astronomical horizon.</p></div>
        <span class="validationBadge ${site ? 'valid' : ''}">${site ? `${settings.locations.length} saved` : 'No sites'}</span>
      </div>
      <div class="v10SiteToolbar">
        <label>Active site<select id="v10ActiveSite">${settings.locations.map(s => `<option value="${esc(s.id)}" ${s.id === settings.activeLocationId ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
        <button class="secondaryButton" id="v10AddSite">Add site</button>
      </div>
      ${site ? `
      <div class="fieldGrid v10SiteFields">
        <label>Site name<input id="v10SiteName" value="${esc(site.name)}"></label>
        <label>Latitude<input id="v10SiteLat" value="${esc(site.latitude)}"></label>
        <label>Longitude<input id="v10SiteLon" value="${esc(site.longitude)}"></label>
        <label>Elevation (m)<input id="v10SiteElev" value="${esc(site.elevationM)}"></label>
      </div>
      <div class="inlineActions"><button class="primaryButton" id="v10SaveSite">Save site</button><button class="secondaryButton" id="v10CopyCurrent">Use current location fields</button><button class="secondaryButton" id="v10DeleteSite">Delete site</button></div>
      <p class="mutedText" style="margin-top:20px">Minimum clear altitude by direction. Leave values at 0° for an unobstructed horizon.</p>
      <div class="v10HorizonGrid">${DIRECTIONS.map(([label],i) => `<label><span>${label}</span><input data-horizon-index="${i}" type="number" min="0" max="60" step="1" value="${horizonArray(site.horizon)[i]}"><small>°</small></label>`).join('')}</div>
      <button class="secondaryButton" id="v10SaveHorizon">Save horizon profile</button>
      ` : '<div class="notice" style="margin-top:16px">Add a site to begin.</div>'}
    `;
    if (before) card.insertBefore(wrapper, before);
    else card.appendChild(wrapper);

    document.getElementById('v10ActiveSite')?.addEventListener('change', e => applySite(e.target.value));
    document.getElementById('v10AddSite')?.addEventListener('click', () => {
      const siteNew = {id:uid('site'), name:`Site ${settings.locations.length + 1}`, latitude:settings.latitude || '', longitude:settings.longitude || '', elevationM:settings.elevationM || '0', horizon:horizonArray()};
      settings.locations.push(siteNew);
      syncLegacyFromSite(siteNew);
      saveSettings();
      renderShell();
    });
    document.getElementById('v10SaveSite')?.addEventListener('click', () => {
      const s = activeSite();
      if (!s) return;
      s.name = document.getElementById('v10SiteName').value.trim() || 'Observing site';
      s.latitude = document.getElementById('v10SiteLat').value.trim();
      s.longitude = document.getElementById('v10SiteLon').value.trim();
      s.elevationM = document.getElementById('v10SiteElev').value.trim() || '0';
      syncLegacyFromSite(s);
      saveSettings();
      toast('Observing site saved');
      renderShell();
    });
    document.getElementById('v10CopyCurrent')?.addEventListener('click', () => {
      const s = activeSite();
      if (!s) return;
      s.name = settings.locationName || s.name;
      s.latitude = String(settings.latitude ?? '');
      s.longitude = String(settings.longitude ?? '');
      s.elevationM = String(settings.elevationM ?? '0');
      saveSettings();
      renderShell();
    });
    document.getElementById('v10DeleteSite')?.addEventListener('click', () => {
      const s = activeSite();
      if (!s || !confirm(`Delete saved observing site "${s.name}"?`)) return;
      settings.locations = settings.locations.filter(x => x.id !== s.id);
      settings.activeLocationId = settings.locations[0]?.id || '';
      if (settings.locations[0]) syncLegacyFromSite(settings.locations[0]);
      saveSettings();
      renderShell();
    });
    document.getElementById('v10SaveHorizon')?.addEventListener('click', () => {
      const s = activeSite();
      if (!s) return;
      s.horizon = Array.from(document.querySelectorAll('[data-horizon-index]')).map(input => Math.max(0, Math.min(60, Number(input.value) || 0)));
      saveSettings();
      toast('Local horizon saved');
      renderShell();
    });

    const oldSave = document.getElementById('saveLocation');
    if (oldSave && !oldSave.dataset.v10Wrapped) {
      oldSave.dataset.v10Wrapped = '1';
      const handler = oldSave.onclick;
      oldSave.onclick = () => {
        const s = activeSite();
        if (s) {
          s.name = document.getElementById('locName')?.value.trim() || s.name;
          s.latitude = document.getElementById('lat')?.value.trim() || '';
          s.longitude = document.getElementById('lon')?.value.trim() || '';
          s.elevationM = document.getElementById('elev')?.value.trim() || '0';
        }
        handler?.();
      };
    }
  }

  function installStyles() {
    if (document.getElementById('v10Styles')) return;
    const style = document.createElement('style');
    style.id = 'v10Styles';
    style.textContent = `
      .v10PlannerHero,.v10PlannerPanel,.v10SessionCard{border:1px solid var(--border);border-radius:20px;background:var(--panel);padding:24px}
      .v10PlannerHero{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(280px,.8fr);gap:28px;background:radial-gradient(circle at 85% 20%,var(--glow),transparent 38%),var(--panel)}
      .v10PlannerHero h3{font-size:30px;margin:0 0 10px}.v10PlannerHero p{color:var(--muted);line-height:1.55;margin:0}
      .v10PlannerControls{display:grid;grid-template-columns:1fr 1fr;gap:10px}.v10PlannerControls label,.v10SiteToolbar label{display:grid;gap:6px;font-size:11px;color:var(--muted)}
      .v10PlannerControls input,.v10PlannerControls select,.v10SiteToolbar select{min-width:0;width:100%;border:1px solid var(--border);border-radius:9px;background:var(--bg);color:var(--text);padding:9px}
      .v10CategoryRow{display:flex;gap:18px;align-items:center;flex-wrap:wrap;border:1px solid var(--border);border-radius:14px;background:var(--panel2);padding:12px 16px;font-size:12px}.v10CategoryRow label{display:flex;gap:7px;align-items:center}
      .v10PlannerGrid{display:grid;grid-template-columns:1.25fr .9fr;gap:16px}.v10TargetList{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:16px;max-height:660px;overflow:auto;padding-right:3px}
      .v10TargetCard{border:1px solid var(--border);border-radius:14px;background:var(--panel2);padding:14px;display:grid;gap:10px}.v10TargetTop{display:flex;justify-content:space-between;gap:10px}.v10TargetTop>div{display:grid;gap:3px}.v10TargetTop span,.v10TargetCard small{color:var(--muted);font-size:10px;line-height:1.4}
      .v10TargetMetrics{display:grid;grid-template-columns:1fr 1fr;gap:8px}.v10TargetMetrics span{display:grid;gap:2px;color:var(--muted);font-size:10px}.v10TargetMetrics strong{color:var(--text);font-size:12px}
      .v10Queue{display:grid;margin-top:16px}.v10QueueRow{display:grid;grid-template-columns:30px 1fr auto;align-items:center;gap:10px;border-top:1px solid var(--border);padding:11px 0}.v10QueueIndex{width:25px;height:25px;border:1px solid var(--border);border-radius:50%;display:grid;place-items:center;font-size:10px;color:var(--muted)}
      .v10QueueRow>div:nth-child(2){display:grid;gap:3px}.v10QueueRow span{font-size:10px;color:var(--muted)}.v10QueueButtons{display:flex;gap:5px}.v10QueueButtons button:disabled{opacity:.35}.v10Empty{padding:28px 6px;color:var(--muted);line-height:1.5}.v10StartButton{width:100%;margin-top:14px}
      .v10SessionCard{display:flex;justify-content:space-between;gap:20px;align-items:center;background:radial-gradient(circle at 10% 20%,var(--glow),transparent 45%),var(--panel)}.v10SessionCard h3{font-size:28px;margin:0}.v10SessionMetrics{display:flex;gap:18px;margin-top:12px;flex-wrap:wrap}.v10SessionMetrics span{display:grid;gap:3px;color:var(--muted);font-size:9px;letter-spacing:.08em}.v10SessionMetrics strong{color:var(--text);font-size:13px;letter-spacing:0}.v10SessionActions{display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end}
      .v10SiteToolbar{display:flex;gap:10px;align-items:end;margin-top:18px}.v10SiteToolbar label{min-width:240px}.v10SiteFields{margin-top:16px}.v10HorizonGrid{display:grid;grid-template-columns:repeat(8,minmax(70px,1fr));gap:8px;margin:12px 0}.v10HorizonGrid label{display:grid;grid-template-columns:1fr auto;align-items:center;border:1px solid var(--border);border-radius:10px;background:var(--panel2);padding:8px}.v10HorizonGrid label span{grid-column:1/-1;font-size:10px;color:var(--muted)}.v10HorizonGrid input{width:46px;border:0;background:transparent;color:var(--text);font-size:16px}.v10HorizonGrid small{color:var(--muted)}
      @media(max-width:1100px){.v10PlannerGrid,.v10PlannerHero{grid-template-columns:1fr}.v10TargetList{grid-template-columns:1fr}.v10HorizonGrid{grid-template-columns:repeat(4,1fr)}}
      @media(max-width:700px){.v10PlannerControls{grid-template-columns:1fr}.v10SessionCard{align-items:flex-start;flex-direction:column}.v10HorizonGrid{grid-template-columns:repeat(2,1fr)}.v10QueueRow{grid-template-columns:30px 1fr}.v10QueueButtons{grid-column:2}.v10SiteToolbar{align-items:stretch;flex-direction:column}.v10SiteToolbar label{min-width:0;width:100%}}
    `;
    document.head.appendChild(style);
  }

  let baseRenderPage;
  let baseRenderSettings;
  let baseRenderShell;
  let baseObserveRating;

  async function install() {
    await waitForNativeBridge();
    ensureV010Data();
    installStyles();

    if (!PAGES.includes('Planner')) PAGES.splice(1, 0, 'Planner');

    baseObserveRating = observeRating;
    observeRating = function v10ObserveRating(obj, p, observer, date) {
      const r = baseObserveRating(obj, p, observer, date);
      if (!observer || p.altitudeDeg < 0) return r;
      const site = activeSite();
      if (!currentObserverMatchesSite(observer, site)) return r;
      const limit = horizonLimit(site, p.azimuthDeg);
      if (p.altitudeDeg <= limit) {
        return {...r, label:'Blocked', className:'poor', score:r.score - 80, reason:`local horizon ${limit.toFixed(0)}°`};
      }
      if (limit > 0 && p.altitudeDeg < limit + 5) {
        return {...r, score:r.score - 8, reason:`${r.reason} · just above local horizon`};
      }
      return r;
    };

    baseRenderPage = renderPage;
    renderPage = function v10RenderPage() {
      if (page === 'Planner') {
        clearInterval(tickTimer);
        renderPlanner();
        return;
      }
      baseRenderPage();
    };

    baseRenderSettings = renderSettings;
    renderSettings = function v10RenderSettings() {
      baseRenderSettings();
      renderSitesSettings();
    };

    baseRenderShell = renderShell;
    renderShell = function v10RenderShell() {
      baseRenderShell();
      const brandVersion = document.querySelector('.brand p');
      if (brandVersion) brandVersion.textContent = `Offline astronomy v${VERSION}`;
      document.title = `Noctem Locus v${VERSION}`;
      if (page === 'Settings') renderSitesSettings();
    };

    saveSettings();
    renderShell();

    window.noctemLocusPlanner = {
      version: VERSION,
      activeSite,
      horizonLimit: az => horizonLimit(activeSite(), az),
      buildCandidates: () => {
        const observer = parseObserver();
        return observer ? buildCandidates(observer) : [];
      }
    };
  }

  void install().catch(error => {
    console.error('Noctem Locus v0.10 feature layer failed', error);
    try { toast(`Planner could not start: ${error.message || error}`); } catch (_) {}
  });
})();
