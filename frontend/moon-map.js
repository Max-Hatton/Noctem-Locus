/* Moon Map: offline lunar observing atlas. Geometry and rendering have separate owners. */
(() => {
  'use strict';
  if (window.noctemMoonMap) return;
  const core = window.noctemMoonCore;
  const features = window.noctemMoonFeatures;
  if (!core || !Array.isArray(features) || !window.noctemMoonRenderer) throw new Error('Moon Map assets did not load');
  const DEG = Math.PI / 180;
  const norm = x => ((Number(x) % 360) + 360) % 360;
  const limit = (x, a, b) => Math.max(a, Math.min(b, Number(x)));
  const byId = new Map(features.map(f => [String(f.id), f]));
  const vectors = new Map(features.map(f => [String(f.id), core.surfaceVector(f.longitude, f.latitude)]));
  const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
  let session = null, renderer = null, observerResize = null, timer = null, frame = null, drag = null;
  let geometry = null, screen = null, hits = [], loadError = '', generation = 0, lastStableRotation = 0;
  const sizeText = f => f.diameterKm == null ? 'Unknown size' : Number(f.diameterKm).toLocaleString() + ' km';

  function data() {
    const telescopes = settings.equipment.telescopes;
    let xt8 = telescopes.find(s => s.id==='scope-xt8i' || /xt8|8.*intelliscope/i.test(s.name));
    if (!xt8) {
      xt8 = {id:'scope-xt8i',name:'Orion XT8 IntelliScope',apertureMm:'203',focalLengthMm:'1200',type:'Dobsonian'};
      telescopes.push(xt8);
    }
    const d = settings.moonMap ||= {};
    if (!['north','horizon','dobsonian','manual'].includes(d.orientation)) d.orientation = 'dobsonian';
    if (!telescopes.some(s => s.id === d.telescopeId)) d.telescopeId = xt8.id;
    if (typeof d.eyepieceId !== 'string') d.eyepieceId = '';
    if (d.eyepieceId && d.eyepieceId !== 'custom' && !settings.equipment.eyepieces.some(e => e.id === d.eyepieceId)) d.eyepieceId = '';
    d.calibrations ||= {};
    d.calibrations[d.telescopeId] ||= {offsetDeg:0,mirror:false,calibratedAt:null};
    d.phase = d.phase !== false;
    d.labels = d.labels !== false;
    d.grid = d.grid === true;
    d.showDark = d.showDark === true;
    d.manualRotation = Number.isFinite(Number(d.manualRotation)) ? norm(d.manualRotation) : 0;
    d.customEyepiece ||= {focalLengthMm:'32',apparentFovDeg:''};
    return d;
  }
  const scope = () => settings.equipment.telescopes.find(s => s.id === data().telescopeId);
  const calibration = () => data().calibrations[data().telescopeId];
  const dobsonianBase = () => (calibration().mirror ? -lastStableRotation : lastStableRotation) + 180;
  const date = () => session?.fixedTime ? new Date(session.fixedTime) : new Date();
  const selected = () => byId.get(String(session?.selectedId));
  const optical = () => {
    const d = data(), ep = d.eyepieceId === 'custom' ? d.customEyepiece : settings.equipment.eyepieces.find(e => e.id === d.eyepieceId);
    return ep ? eyepieceMath(scope(), ep) : null;
  };
  function rotation() {
    const d = data();
    if (d.orientation === 'north') return 0;
    if (d.orientation === 'manual') return norm(d.manualRotation);
    const horizon = lastStableRotation;
    return norm(d.orientation === 'dobsonian' ? dobsonianBase() + Number(calibration().offsetDeg || 0) : horizon);
  }
  const mirror = () => ['dobsonian','manual'].includes(data().orientation) && calibration().mirror === true;
  function displayPoint(p) {
    const t = rotation() * DEG, x = mirror() ? -p.x : p.x;
    return {x:screen.cx + screen.radius*(Math.cos(t)*x + Math.sin(t)*p.y),y:screen.cy + screen.radius*(Math.sin(t)*x - Math.cos(t)*p.y),z:p.z};
  }
  function projectFeature(f) { return core.project(f.longitude, f.latitude, geometry); }
  function coords(f) { return `${Math.abs(f.latitude).toFixed(2)}° ${f.latitude<0?'S':'N'} · ${Math.abs(f.longitude).toFixed(2)}° ${f.longitude<0?'W':'E'}`; }
  function dispose() {
    generation++;
    clearInterval(timer); timer = null;
    if (frame !== null) cancelAnimationFrame(frame); frame = null;
    observerResize?.disconnect(); observerResize = null;
    renderer?.dispose(); renderer = null;
    drag = null;
  }
  function queueDraw() {
    if (frame !== null || page !== 'Moon Map') return;
    frame = requestAnimationFrame(() => { frame = null; draw(); });
  }
  function updateGeometry() { geometry = core.geometry(date(), parseObserver()); if (geometry.orientationStable && Number.isFinite(geometry.horizonRotationDeg)) lastStableRotation = geometry.horizonRotationDeg; }
  function persist() { saveSettings(); }
  function commit(redetail = true) {
    persist(); updateStatus(); if (redetail) details(); queueDraw();
  }
  function rotateBy(value) {
    const d = data();
    if (d.orientation === 'dobsonian') calibration().offsetDeg = norm(Number(calibration().offsetDeg || 0) + value);
    else { d.manualRotation = norm(rotation() + value); d.orientation = 'manual'; document.getElementById('moonOrientation').value = 'manual'; }
    commit();
  }
  function centerFeature() {
    const f = selected(); if (!f) return;
    const p = projectFeature(f); if (p.z <= 0) return;
    session.zoom = Math.max(2, session.zoom);
    session.anchor = {longitude:f.longitude,latitude:f.latitude};
    session.panX = 0; session.panY = 0;
    queueDraw();
  }
  function fitMoon() { session.zoom = 1; session.panX = 0; session.panY = 0; session.anchor = null; queueDraw(); }
  function zoomCenter(factor) {
    const next=limit(session.zoom*factor,.15,24), actual=next/session.zoom;
    if(!session.anchor){session.panX*=actual;session.panY*=actual;}
    session.zoom=next;queueDraw();
  }
  function selectFeature(id) {
    if (!byId.has(String(id))) return;
    session.selectedId = String(id);
    session.showResults=false;document.getElementById('moonResults').hidden=true;
    details(); queueDraw();
    document.querySelectorAll('[data-moon-feature]').forEach(b => b.classList.toggle('active',b.dataset.moonFeature === session.selectedId));
  }
  function featuresList() {
    const el = document.getElementById('moonResults'); if (!el || !geometry) return;
    const q = (session.query || '').trim().toLocaleLowerCase();
    const group = session.type || '';
    el.hidden=(!q&&!group)||session.showResults===false;
    const list = features.filter(f => {
      if (q && !f.name.toLocaleLowerCase().includes(q)) return false;
      if (group) { const type=f.type.toLowerCase(); const match=group==='crater' ? type.includes('crater') || type==='satellite feature' : group==='mons' ? /mons|montes/.test(type) : group==='rima' ? /rima|rimae/.test(type) : group==='vallis' ? /vallis|valles/.test(type) : type.includes(group); if(!match)return false; }
      if (!q && projectFeature(f).z <= .03) return false;
      return true;
    }).sort((a,b) => q ? (Number(b.name.toLowerCase()===q)-Number(a.name.toLowerCase()===q) || a.name.localeCompare(b.name)) : Number(b.diameterKm)-Number(a.diameterKm));
    el.innerHTML = `<div class="moonResultCount">${list.length.toLocaleString()} ${q?'matches':'features on the visible hemisphere'}${list.length>18?' · first 18 shown':''}</div>` + (list.slice(0,18).map(f => `<button class="moonResult ${String(f.id)===session.selectedId?'active':''}" data-moon-feature="${esc(f.id)}"><span>${esc(f.name)}<small>${esc(f.type)} · ${sizeText(f)}</small></span><small>${projectFeature(f).z<=0?'Far side':'Select'}</small></button>`).join('') || '<p class="mutedText">No matching features.</p>');
    el.querySelectorAll('[data-moon-feature]').forEach(b => b.onclick = () => selectFeature(b.dataset.moonFeature));
  }
  function details() {
    const el = document.getElementById('moonDetail'); if (!el || !geometry) return;
    const expanded=el.querySelector('.moonHelp')?.open;
    const f = selected(), m = optical(), d = data();
    const p = f ? projectFeature(f) : null;
    const sunAlt = f ? Math.asin(limit(dot(vectors.get(String(f.id)),geometry.sun),-1,1))/DEG : null;
    el.innerHTML = `<p class="eyebrow">${f?'SELECTED · '+esc(f.type):'LUNAR SURFACE'}</p><h3>${f?esc(f.name):'Select a feature'}</h3>
      <p class="skyDetailMeta">${f?coords(f):'Click a named feature on the map, or search the lunar catalog.'}</p>
      ${f?`<div class="moonFeatureState">${p.z<=0?'On the far side at this time':sunAlt>0?'Sunlit surface':'Unlit surface'}${p.z>0&&p.z<.15?' · near the limb':''}</div><div class="skyDetailGrid"><div class="skyMini"><span>DIAMETER</span><strong>${sizeText(f)}</strong></div><div class="skyMini"><span>SUN ALTITUDE</span><strong>${sunAlt.toFixed(1)}°</strong></div></div><button class="secondaryButton" id="moonCenterFeature" ${p.z<=0?'disabled':''}>Center on feature</button>`:''}
      <div class="moonDivider"></div><p class="eyebrow">EYEPIECE VIEW</p>
      <label class="moonField">Telescope<select id="moonScope">${settings.equipment.telescopes.map(s=>`<option value="${esc(s.id)}" ${s.id===d.telescopeId?'selected':''}>${esc(s.name)}</option>`).join('')}</select></label>
      <div class="moonEquipmentReadout">${Number(scope().apertureMm)||'—'} mm aperture · ${Number(scope().focalLengthMm)||'—'} mm focal length${m?`<br>${m.mag.toFixed(0)}× magnification · ${m.trueFov?m.trueFov.toFixed(2)+'° field':'enter AFOV to show field'}`:''}</div>
      ${d.eyepieceId==='custom'?`<div class="moonTwoFields"><label class="moonField">Eyepiece mm<input id="moonEpMm" type="number" min="1" max="100" step="0.1" value="${esc(d.customEyepiece.focalLengthMm)}"></label><label class="moonField">AFOV °<input id="moonEpAfov" type="number" min="10" max="150" step="0.1" placeholder="From eyepiece specs" value="${esc(d.customEyepiece.apparentFovDeg)}"></label></div>`:''}
      <button class="secondaryButton" id="moonFitFov" ${m?.trueFov?'':'disabled'}>Fit eyepiece field</button>
      <details class="moonHelp" ${expanded?'open':''}><summary>Match my eyepiece</summary><p>Choose Dobsonian view. Rotate until the crater pattern matches your eyepiece, then save the match. The map follows the Moon’s changing sky angle with your saved offset.</p><p>Your head position at the focuser can change the apparent angle. Adjust again when needed.</p><div class="moonCalibrationButtons"><button class="secondaryButton" id="moonSaveMatch">Save match</button><button class="secondaryButton" id="moonClearMatch">Clear match</button></div></details>
      <p class="moonCalibrationState">${calibration().calibratedAt?'Eyepiece match saved for this telescope.':'Default Dobsonian angle · match your eyepiece to calibrate.'}</p>`;
    document.getElementById('moonCenterFeature')?.addEventListener('click',centerFeature);
    document.getElementById('moonScope').onchange = e => { d.telescopeId=e.target.value; data(); commit(); };
    document.getElementById('moonSaveMatch').onclick = () => {
      if (d.orientation !== 'dobsonian') {
        const current = rotation(), currentMirror = mirror();
        calibration().mirror = currentMirror;
        calibration().offsetDeg = norm(current-dobsonianBase());
        d.orientation = 'dobsonian'; document.getElementById('moonOrientation').value='dobsonian';
      }
      calibration().calibratedAt = new Date().toISOString(); commit(); toast('Eyepiece match saved');
    };
    document.getElementById('moonClearMatch').onclick = () => { calibration().offsetDeg=0; calibration().mirror=false; calibration().calibratedAt=null; document.getElementById('moonMirror').checked=false; commit(); };
    for (const [id,key] of [['moonEpMm','focalLengthMm'],['moonEpAfov','apparentFovDeg']]) {
      document.getElementById(id)?.addEventListener('change',e => {
        const value = Number(e.target.value), max=key==='focalLengthMm'?100:150, min=key==='focalLengthMm'?1:10;
        if (!Number.isFinite(value)||value<min||value>max) { e.target.value=d.customEyepiece[key]; toast(`Enter ${min}–${max}`); return; }
        d.customEyepiece[key]=String(value); commit();
      });
    }
    document.getElementById('moonFitFov').onclick = () => {
      const field = optical()?.trueFov; if (!field || !screen) return;
      session.zoom=limit(geometry.angularDiameterDeg/field,.15,24);
      session.panX=0;session.panY=0;session.anchor=null; queueDraw();
    };
  }
  function updateStatus() {
    if (!geometry) return;
    const t = date(), d = data();
    document.getElementById('moonTime').value = localDateTimeInputValue(t);
    document.getElementById('moonLive').textContent=session.fixedTime?'FIXED TIME':'LIVE';
    document.getElementById('moonPhaseReadout').textContent=`${Math.round(geometry.phase.illuminatedFraction*100)}% illuminated · ${geometry.phase.name}`;
    document.getElementById('moonPosition').textContent=`${geometry.altitudeDeg.toFixed(1)}° altitude · ${geometry.azimuthDeg.toFixed(1)}° azimuth${geometry.altitudeDeg<0?' · Below horizon':''}`;
    document.getElementById('moonRotationReadout').textContent=`${rotation().toFixed(1)}°${d.orientation==='dobsonian'||d.orientation==='horizon'?(geometry.orientationStable?' · automatic':' · held at zenith'):''}`;
    document.getElementById('moonRotation').value=rotation();
    document.getElementById('moonMirror').checked=mirror();
    document.getElementById('moonRenderMessage').textContent=loadError;
    document.getElementById('moonDark').disabled=!d.phase;
  }
  function draw() {
    const overlay = document.getElementById('moonOverlay');
    if (!overlay || !geometry || !renderer || page !== 'Moon Map') return;
    const rect=overlay.parentElement.getBoundingClientRect(), ratio=Math.min(window.devicePixelRatio||1,2);
    const w=Math.max(1,Math.round(rect.width*ratio)), h=Math.max(1,Math.round(rect.height*ratio));
    overlay.width=w;overlay.height=h;
    const radius=Math.min(w,h)*.43*session.zoom;
    screen={w,h,radius,ratio,cx:w/2+session.panX*ratio,cy:h/2+session.panY*ratio};
    if (session.anchor) {
      const p=core.project(session.anchor.longitude,session.anchor.latitude,geometry);
      if (p.z>0) { const anchor=displayPoint(p); screen.cx += w/2-anchor.x; screen.cy += h/2-anchor.y; }
      else session.anchor=null;
    }
    const d=data(), colors=skyCanvasColors();
    renderer.draw({geometry,width:w,height:h,centerX:screen.cx,centerY:screen.cy,radius,rotationDeg:rotation(),mirror:mirror(),phase:d.phase,nightTerrain:d.showDark ? .18 : 0,nightMode:settings.theme==='night',background:colors.bg});
    const ctx=overlay.getContext('2d');ctx.clearRect(0,0,w,h);ctx.lineWidth=ratio;
    hits=[];
    if (d.grid) drawGrid(ctx,colors);
    const used=[];
    const fselected=selected();
    const labelPriority=f=>Number(f.diameterKm)*(f.type.toLowerCase().includes('crater')?5:1);
    const visible=features.map(f=>({f,p:projectFeature(f)})).filter(x=>x.p.z>0).sort((a,b)=>labelPriority(b.f)-labelPriority(a.f));
    if (fselected) { const i=visible.findIndex(x=>String(x.f.id)===String(fselected.id)); if(i>=0)visible.unshift(...visible.splice(i,1)); }
    for (const {f,p} of visible) {
      const s=displayPoint(p), isSelected=String(f.id)===String(session.selectedId);
      if(s.x<0||s.y<0||s.x>w||s.y>h)continue;
      const lit=dot(vectors.get(String(f.id)),geometry.sun)>0;
      if(d.phase&&!d.showDark&&!lit&&!isSelected)continue;
      const size=Number(f.diameterKm)/1737.4*radius;
      if(size<7*ratio&&!isSelected)continue;
      hits.push({f,x:s.x,y:s.y,size:Math.min(24*ratio,Math.max(8*ratio,size/2))});
      if(isSelected) {
        ctx.strokeStyle=colors.accent;ctx.lineWidth=1.7*ratio;ctx.beginPath();ctx.arc(s.x,s.y,Math.max(9*ratio,Math.min(size/2,45*ratio)),0,2*Math.PI);ctx.stroke();
        ctx.beginPath();ctx.moveTo(s.x-5*ratio,s.y);ctx.lineTo(s.x+5*ratio,s.y);ctx.moveTo(s.x,s.y-5*ratio);ctx.lineTo(s.x,s.y+5*ratio);ctx.stroke();
      }
      if(!d.labels&&!isSelected)continue;
      if(size<(f.type.toLowerCase().includes('crater')?10:14)*ratio&&!isSelected)continue;
      ctx.font=`${isSelected?'600':'400'} ${11*ratio}px system-ui`;
      const text=f.name, tw=ctx.measureText(text).width, x=s.x+7*ratio,y=s.y-7*ratio, box={x:x-3*ratio,y:y-11*ratio,w:tw+6*ratio,h:15*ratio};
      if(box.x+box.w>w||box.y<0)continue;
      if(!isSelected&&used.some(b=>box.x<b.x+b.w&&box.x+box.w>b.x&&box.y<b.y+b.h&&box.y+box.h>b.y))continue;
      if(!isSelected&&used.length>Math.min(65,22+session.zoom*8))continue;
      used.push(box);hits.push({f,x:s.x,y:s.y,size:0,box});ctx.fillStyle=colors.bg;ctx.globalAlpha=.84;ctx.fillRect(box.x,box.y,box.w,box.h);ctx.globalAlpha=1;
      ctx.fillStyle=isSelected?colors.accent:colors.text;ctx.fillText(text,x,y);
    }
    drawCompass(ctx,colors);
    const fov=optical()?.trueFov;
    if(fov) {
      const r=radius*fov/geometry.angularDiameterDeg;
      ctx.strokeStyle=colors.accent;ctx.lineWidth=1.4*ratio;ctx.setLineDash([6*ratio,4*ratio]);ctx.beginPath();ctx.arc(w/2,h/2,r,0,2*Math.PI);ctx.stroke();ctx.setLineDash([]);
      ctx.fillStyle=colors.accent;ctx.font=`${11*ratio}px system-ui`;ctx.fillText(`${fov.toFixed(2)}° eyepiece field`,12*ratio,h-14*ratio);
    }
    document.getElementById('moonZoomReadout').textContent=`${session.zoom.toFixed(1)}× map zoom`;
  }
  function drawCompass(ctx,c) {
    ctx.font=`600 ${12*screen.ratio}px system-ui`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=c.accent;
    for(const [name,x,y] of [['N',0,1.07],['S',0,-1.07],['E',1.07,0],['W',-1.07,0]]) {
      const p=displayPoint({x,y,z:0});if(p.x>8&&p.x<screen.w-8&&p.y>8&&p.y<screen.h-8)ctx.fillText(name,p.x,p.y);
    }
    ctx.textAlign='left';ctx.textBaseline='alphabetic';
  }
  function drawGrid(ctx,c) {
    ctx.strokeStyle=c.muted;ctx.globalAlpha=.36;ctx.lineWidth=screen.ratio*.7;
    const line=points=>{ctx.beginPath();let pen=false;for(const [lon,lat] of points){const p=core.project(lon,lat,geometry);if(p.z<0){pen=false;continue;}const s=displayPoint(p);if(pen)ctx.lineTo(s.x,s.y);else ctx.moveTo(s.x,s.y);pen=true;}ctx.stroke();};
    for(let lon=-180;lon<180;lon+=30)line(Array.from({length:181},(_,i)=>[lon,i-90]));
    for(let lat=-60;lat<=60;lat+=30)line(Array.from({length:361},(_,i)=>[i-180,lat]));
    ctx.globalAlpha=1;
  }
  function bindCanvas() {
    const canvas=document.getElementById('moonOverlay');
    const xy=e=>{const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)*screen.ratio,y:(e.clientY-r.top)*screen.ratio};};
    const hitAt=p=>hits.filter(h=>h.box ? p.x>=h.box.x&&p.x<=h.box.x+h.box.w&&p.y>=h.box.y&&p.y<=h.box.y+h.box.h : Math.hypot(h.x-p.x,h.y-p.y)<h.size).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0];
    canvas.onpointerdown=e=>{if(e.button!==0)return;drag={x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,moved:false};canvas.setPointerCapture(e.pointerId);};
    canvas.onpointermove=e=>{
      if(!screen)return;
      if(drag){const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)>4)drag.moved=true;if(drag.moved){if(session.anchor){session.panX=(screen.cx-screen.w/2)/screen.ratio;session.panY=(screen.cy-screen.h/2)/screen.ratio;session.anchor=null;}session.panX+=dx;session.panY+=dy;queueDraw();}drag.x=e.clientX;drag.y=e.clientY;return;}
      const p=xy(e), hit=hitAt(p);
      canvas.style.cursor=hit?'pointer':'grab';
      document.getElementById('moonHover').textContent=hit?`${hit.f.name} · ${sizeText(hit.f)}`:'';
    };
    canvas.onpointerup=e=>{if(!drag)return;const moved=drag.moved;drag=null;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);if(!moved&&screen){const hit=hitAt(xy(e));if(hit)selectFeature(hit.f.id);}};
    canvas.onpointercancel=()=>{drag=null;};
    canvas.onwheel=e=>{e.preventDefault();if(!screen)return;const p=xy(e),old=session.zoom,next=limit(old*Math.exp(-e.deltaY*.0015),.15,24),factor=next/old;session.anchor=null;session.panX=(p.x-screen.w/2+(screen.cx-p.x)*factor)/screen.ratio;session.panY=(p.y-screen.h/2+(screen.cy-p.y)*factor)/screen.ratio;session.zoom=next;queueDraw();};
    canvas.onkeydown=e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','0'].includes(e.key)){e.preventDefault();e.stopPropagation();if(e.key.startsWith('Arrow')&&session.anchor&&screen){session.panX=(screen.cx-screen.w/2)/screen.ratio;session.panY=(screen.cy-screen.h/2)/screen.ratio;session.anchor=null;}if(e.key==='ArrowLeft')session.panX-=35;if(e.key==='ArrowRight')session.panX+=35;if(e.key==='ArrowUp')session.panY-=35;if(e.key==='ArrowDown')session.panY+=35;if(e.key==='+'||e.key==='=')zoomCenter(1.25);if(e.key==='-')zoomCenter(1/1.25);if(e.key==='0')fitMoon();queueDraw();}};
  }
  function renderMoonMap() {
    dispose(); const epoch=generation;
    const d=data();persist();
    if(!parseObserver())return locationRequired();
    session ||= {fixedTime:null,zoom:1,panX:0,panY:0,anchor:null,selectedId:'',query:'',type:''};
    updateGeometry();loadError='Loading lunar surface…';
    document.getElementById('page').innerHTML=`<section class="pageStack moonPage">
      <div class="moonToolbar"><div class="moonTimeGroup"><label class="moonField">Observing time<input id="moonTime" type="datetime-local" min="1900-01-01T00:00" max="2100-12-31T23:59" aria-label="Moon map observing time"></label><span id="moonLive" class="moonLive"></span><button class="skyButton" data-moon-step="-1440">−1 d</button><button class="skyButton" data-moon-step="-60">−1 h</button><button class="skyButton" id="moonNow">Now</button><button class="skyButton" data-moon-step="60">+1 h</button><button class="skyButton" data-moon-step="1440">+1 d</button></div><div class="moonSummary"><strong id="moonPhaseReadout"></strong><span id="moonPosition"></span></div></div>
      <div class="moonToolbar"><label class="moonField">View orientation<select id="moonOrientation"><option value="dobsonian">Dobsonian · automatic</option><option value="horizon">Sky · horizon up</option><option value="north">Moon · north up</option><option value="manual">Manual rotation</option></select></label><div class="moonRotate"><button class="skyButton" id="moonRotateLeft" aria-label="Rotate moon left 5 degrees">↶ 5°</button><input id="moonRotation" type="range" min="0" max="359.9" step="0.1" aria-label="Moon rotation"><button class="skyButton" id="moonRotateRight" aria-label="Rotate moon right 5 degrees">5° ↷</button><span id="moonRotationReadout"></span></div><label class="moonCheck"><input type="checkbox" id="moonMirror">Mirror</label><label class="moonField">Eyepiece FOV<select id="moonEyepiece"><option value="">Off</option>${settings.equipment.eyepieces.map(e=>`<option value="${esc(e.id)}">${esc(e.name)}</option>`).join('')}<option value="custom">Custom eyepiece</option></select></label></div>
      <div class="moonToolbar moonLayers"><label class="moonCheck"><input type="checkbox" id="moonPhase" ${d.phase?'checked':''}>Phase shading</label><label class="moonCheck"><input type="checkbox" id="moonDark" ${d.showDark?'checked':''}>Reveal unlit terrain</label><label class="moonCheck"><input type="checkbox" id="moonLabels" ${d.labels?'checked':''}>Feature names</label><label class="moonCheck"><input type="checkbox" id="moonGrid" ${d.grid?'checked':''}>Coordinate grid</label><div class="moonZoom"><button class="skyButton" id="moonZoomOut" aria-label="Zoom out">−</button><span id="moonZoomReadout"></span><button class="skyButton" id="moonZoomIn" aria-label="Zoom in">+</button><button class="skyButton" id="moonFit">Fit Moon</button></div></div>
      <div class="moonLayout"><section class="skyCanvasPanel"><div class="moonCanvasWrap"><canvas id="moonSurface" aria-hidden="true"></canvas><canvas id="moonOverlay" tabindex="0" aria-label="Lunar surface map. Drag to pan, scroll to zoom, click features. Arrow keys pan, plus and minus zoom, zero fits the Moon."></canvas><div id="moonHover" class="moonHover"></div><div id="moonRenderMessage" class="moonRenderMessage" role="status"></div></div><div class="skyLegend"><span>Drag to pan · Scroll to zoom · Click a feature</span><span>N / E / S / W = lunar directions</span></div></section><aside class="moonSidebar"><section class="moonSearchPanel"><div class="moonSearchBar"><label class="moonField">Find a lunar feature<input id="moonSearch" type="search" placeholder="Copernicus, Tycho, Mare Imbrium…" value="${esc(session.query)}"></label><label class="moonField">Feature type<select id="moonType"><option value="">All features</option><option value="crater">Craters</option><option value="mare">Maria</option><option value="mons">Mountains</option><option value="rima">Rilles</option><option value="vallis">Valleys</option></select></label></div><div id="moonResults" class="moonResults"></div></section><section class="skyDetail moonDetail" id="moonDetail"></section></aside></div>
      <div class="moonFootnote">Offline lunar atlas · Terrain texture is a reference mosaic; phase shading shows the day/night boundary, not individual crater shadows. <a href="data/MOON_DATA.md" target="_blank" rel="noopener">Map data & credits</a></div></section>`;
    document.getElementById('moonOrientation').value=d.orientation;document.getElementById('moonEyepiece').value=d.eyepieceId;document.getElementById('moonType').value=session.type;
    renderer=window.noctemMoonRenderer.create(document.getElementById('moonSurface'),{textureUrl:new URL('data/moon-surface.jpg',document.baseURI).href});
    renderer.ready.then(()=>{if(epoch!==generation)return;loadError='';updateStatus();queueDraw();}).catch(error=>{if(epoch!==generation)return;loadError='Could not load lunar surface. Reopen Moon Map to retry.';updateStatus();console.error(error);});
    observerResize=new ResizeObserver(queueDraw);observerResize.observe(document.getElementById('moonOverlay').parentElement);
    details();featuresList();updateStatus();bindCanvas();queueDraw();
    document.getElementById('moonOrientation').onchange=e=>{const r=rotation();d.orientation=e.target.value;if(d.orientation==='manual')d.manualRotation=r;commit();};
    document.getElementById('moonRotation').oninput=e=>{const desired=Number(e.target.value);if(d.orientation==='dobsonian')calibration().offsetDeg=norm(desired-dobsonianBase());else{d.manualRotation=desired;d.orientation='manual';document.getElementById('moonOrientation').value='manual';}updateStatus();queueDraw();};
    document.getElementById('moonRotation').onchange=()=>commit(false);
    document.getElementById('moonRotateLeft').onclick=()=>rotateBy(-5);document.getElementById('moonRotateRight').onclick=()=>rotateBy(5);
    document.getElementById('moonMirror').onchange=e=>{if(!['manual','dobsonian'].includes(d.orientation)){d.manualRotation=rotation();d.orientation='manual';document.getElementById('moonOrientation').value='manual';}calibration().mirror=e.target.checked;commit();};
    document.getElementById('moonEyepiece').onchange=e=>{d.eyepieceId=e.target.value;commit();};
    for(const [id,key] of [['moonPhase','phase'],['moonDark','showDark'],['moonLabels','labels'],['moonGrid','grid']])document.getElementById(id).onchange=e=>{d[key]=e.target.checked;commit(false);};
    const setTime=t=>{if(t&&(t.getFullYear()<1900||t.getFullYear()>2100||!Number.isFinite(t.getTime()))){toast('Choose a date from 1900–2100');return;}session.fixedTime=t?t.toISOString():null;updateGeometry();updateStatus();details();featuresList();queueDraw();};
    document.getElementById('moonNow').onclick=()=>setTime(null);
    document.getElementById('moonTime').onchange=e=>{if(!e.target.value)return;setTime(new Date(e.target.value));};
    document.querySelectorAll('[data-moon-step]').forEach(b=>b.onclick=()=>setTime(new Date(date().getTime()+Number(b.dataset.moonStep)*60000)));
    document.getElementById('moonFit').onclick=fitMoon;
    document.getElementById('moonZoomIn').onclick=()=>zoomCenter(1.4);document.getElementById('moonZoomOut').onclick=()=>zoomCenter(1/1.4);
    document.getElementById('moonSearch').oninput=e=>{session.query=e.target.value;session.showResults=true;featuresList();};document.getElementById('moonSearch').onfocus=()=>{session.showResults=true;featuresList();};document.getElementById('moonType').onchange=e=>{session.type=e.target.value;session.showResults=true;featuresList();};
    timer=setInterval(()=>{if(page!=='Moon Map')return dispose();if(session.fixedTime)return;updateGeometry();if(document.activeElement?.id!=='moonTime')updateStatus();if(!document.getElementById('moonDetail')?.contains(document.activeElement))details();queueDraw();},10000);
  }

  const style=document.createElement('style');style.textContent=`
    .moonToolbar{display:flex;align-items:end;gap:12px;flex-wrap:wrap;padding:12px;border:1px solid var(--border);border-radius:14px;background:var(--panel)}.moonTimeGroup{display:flex;gap:7px;align-items:end;flex-wrap:wrap}.moonField{display:grid;gap:5px;min-width:0;color:var(--muted);font-size:10px}.moonField input,.moonField select{min-width:0;width:100%;border:1px solid var(--border);border-radius:9px;background:var(--bg);color:var(--text);padding:8px 9px}.moonTimeGroup input{width:195px}.moonLive{font-size:9px;color:var(--accent);padding:9px 0;letter-spacing:.08em}.moonSummary{display:grid;gap:5px;margin-left:auto;font-size:11px}.moonSummary span{color:var(--muted);font-size:10px}.moonRotate{display:flex;align-items:center;gap:7px;flex:1;min-width:260px}.moonRotate input{width:auto;flex:1;min-width:70px}.moonRotate span{min-width:102px;font-size:10px;color:var(--muted)}.moonCheck{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--muted);min-height:32px}.moonCheck input{accent-color:var(--accent)}.moonZoom{display:flex;align-items:center;gap:8px;margin-left:auto}.moonZoom span{font-size:10px;color:var(--muted);min-width:85px}.moonLayout{display:grid;grid-template-columns:minmax(0,1fr) 270px;gap:16px;align-items:start}.moonCanvasWrap{position:relative;height:min(67vh,760px);min-height:440px;background:var(--bg);border-radius:12px;overflow:hidden}.moonCanvasWrap canvas{position:absolute;inset:0;width:100%;height:100%;display:block}.moonCanvasWrap #moonOverlay{touch-action:none;cursor:grab;outline-offset:-3px}.moonCanvasWrap #moonOverlay:focus-visible{outline:1px solid var(--accent)}.moonHover{position:absolute;left:12px;top:12px;font-size:11px;color:var(--text);background:var(--panel);padding:5px 8px;border-radius:5px;pointer-events:none}.moonHover:empty{display:none}.moonRenderMessage{position:absolute;inset:45% 15% auto;text-align:center;font-size:12px;color:var(--text);background:var(--panel);padding:10px;border-radius:8px;pointer-events:none}.moonRenderMessage:empty{display:none}.moonDetail{gap:12px;padding:18px;position:static}.moonDetail h3{font-size:25px;overflow-wrap:anywhere}.moonDetail p{margin:0}.moonFeatureState{font-size:11px;color:var(--accent);line-height:1.4}.moonDivider{border-top:1px solid var(--border);margin:3px 0}.moonEquipmentReadout,.moonCalibrationState{font-size:10px;color:var(--muted);line-height:1.5}.moonHelp{font-size:11px;color:var(--muted);line-height:1.5}.moonHelp summary{cursor:pointer;color:var(--text)}.moonHelp p{margin:9px 0}.moonCalibrationButtons{display:flex;gap:7px}.moonTwoFields{display:grid;grid-template-columns:1fr 1fr;gap:8px}.moonPage button:disabled{opacity:.45;cursor:default}.moonSidebar{display:grid;gap:12px;min-width:0}.moonSearchPanel{position:relative;padding:15px;border:1px solid var(--border);background:var(--panel);border-radius:14px}.moonSearchBar{display:grid;grid-template-columns:1fr;gap:12px}.moonResults{display:grid;grid-template-columns:1fr;gap:7px;margin-top:12px;position:absolute;z-index:4;left:0;right:0;top:100%;max-height:310px;overflow:auto;padding:10px;border:1px solid var(--border);border-radius:10px;background:var(--panel);box-shadow:0 8px 20px #0008}.moonResults[hidden]{display:none}.moonResultCount{grid-column:1/-1;color:var(--muted);font-size:10px;margin-bottom:4px}.moonResult{display:flex;justify-content:space-between;gap:9px;align-items:center;text-align:left;border:1px solid var(--border);background:var(--panel2);color:var(--text);border-radius:8px;padding:9px;font-size:12px}.moonResult.active,.moonResult:hover{background:var(--glow)}.moonResult span{min-width:0}.moonResult small{display:block;color:var(--muted);font-size:9px;margin-top:4px}.moonFootnote{font-size:10px;color:var(--muted);line-height:1.5}.moonFootnote a{color:var(--accent)}
    @media(max-width:1200px){.moonLayout{grid-template-columns:minmax(0,1fr) 235px}.moonRotate{min-width:230px}.moonSummary{margin-left:0}.moonResults{grid-template-columns:1fr}.moonCanvasWrap{min-height:390px}}@media(max-width:1050px){.moonLayout{grid-template-columns:1fr}.moonDetail{display:grid;grid-template-columns:1fr 1fr}.moonDetail h3,.moonDetail>.eyebrow,.moonDetail>.moonDivider,.moonDetail>.skyDetailMeta,.moonDetail>.moonHelp,.moonDetail>.moonCalibrationState{grid-column:1/-1}.moonCanvasWrap{height:60vh}.moonLayers{gap:9px}.moonZoom{margin-left:0}}@media(max-width:700px){.moonResults{grid-template-columns:1fr}.moonSearchBar{grid-template-columns:1fr}.moonRotate{flex-wrap:wrap}.moonCanvasWrap{min-height:340px}.moonToolbar{padding:10px}}`;
  document.head.appendChild(style);
  const index=PAGES.indexOf('Sky Map');if(!PAGES.includes('Moon Map'))PAGES.splice(index+1,0,'Moon Map');
  const baseRenderPage=renderPage;
  renderPage=function moonRenderPage(){if(page==='Moon Map'){clearInterval(tickTimer);if(skyMapResizeObserver){skyMapResizeObserver.disconnect();skyMapResizeObserver=null;}renderMoonMap();return;}dispose();baseRenderPage();};
  // Outer shell wrapper also cleans up when Planner/Weather intercept renderPage.
  const baseRenderShell=renderShell;
  renderShell=function moonRenderShell(){if(page!=='Moon Map')dispose();baseRenderShell();const brand=document.querySelector('.brand p');if(brand)brand.textContent='Offline astronomy v0.14.0';document.title='Noctem Locus v0.14.0';};
  window.noctemMoonMap={render:renderMoonMap,dispose,version:'0.14.0',open:({time}={})=>{if(session)session.fixedTime=time?new Date(time).toISOString():null;else session={fixedTime:time?new Date(time).toISOString():null,zoom:1,panX:0,panY:0,anchor:null,selectedId:'',query:'',type:''};page='Moon Map';renderShell();}};
  data();persist();
})();
