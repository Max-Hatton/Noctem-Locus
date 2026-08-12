(() => {
  if(window.__NL_SKY_UI_011__)return;window.__NL_SKY_UI_011__=true;
  const C=window.noctemCatalogV011;if(!C)return;
  const style=document.createElement('style');style.textContent=`.v11SkyControls{display:flex;gap:10px;align-items:end;flex-wrap:wrap;border:1px solid var(--border);background:var(--panel);border-radius:14px;padding:10px 12px}.v11SkyControls label{display:grid;gap:5px;color:var(--muted);font-size:10px}.v11SkyControls select{min-width:120px;padding:7px 9px}.v11SkyCheck{display:flex!important;grid-auto-flow:column;align-items:center;gap:6px!important;padding:7px 8px;border:1px solid var(--border);border-radius:8px;background:var(--panel2)}.v11CatalogStats{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.v11CatalogStats span{border:1px solid var(--border);border-radius:999px;padding:5px 8px;font-size:10px;color:var(--muted)}@media(max-width:800px){.v11SkyControls{align-items:stretch}.v11SkyControls label{flex:1 1 140px}}`;document.head.appendChild(style);
  settings.skyDetail ||= {};if(typeof settings.skyDetail.showFinderFov!=='boolean')settings.skyDetail.showFinderFov=true;if(typeof settings.skyDetail.eyepieceId!=='string')settings.skyDetail.eyepieceId='';
  function controls(observer){
    if(document.getElementById('v11SkyControls'))return;const bar=document.querySelector('.skyToolbar');if(!bar)return;
    const eps=settings.equipment?.eyepieces||[],el=document.createElement('div');el.id='v11SkyControls';el.className='v11SkyControls';el.innerHTML=`
      <label>Star depth<select id="v11StarDepth">${[5.5,6,6.5,7].map(v=>`<option value="${v}" ${Number(settings.skyDetail.starMagnitudeLimit)===v?'selected':''}>mag ${v.toFixed(1)}</option>`).join('')}</select></label>
      <label>Eyepiece FOV<select id="v11Eyepiece"><option value="">Off</option>${eps.map(e=>`<option value="${esc(e.id)}" ${settings.skyDetail.eyepieceId===e.id?'selected':''}>${esc(e.name)}</option>`).join('')}</select></label>
      <label class="v11SkyCheck"><input id="v11DeepSky" type="checkbox" ${settings.skyDetail.showDeepSky!==false?'checked':''}>Deep sky</label>
      <label class="v11SkyCheck"><input id="v11Milky" type="checkbox" ${settings.skyDetail.showMilkyWay!==false?'checked':''}>Milky Way</label>
      <label class="v11SkyCheck"><input id="v11ConstNames" type="checkbox" ${settings.skyDetail.showConstellationNames!==false?'checked':''}>Constellation names</label>
      <label class="v11SkyCheck"><input id="v11Finder" type="checkbox" ${settings.skyDetail.showFinderFov!==false?'checked':''}>Finder FOV</label>`;
    bar.insertAdjacentElement('afterend',el);
    const redraw=()=>{saveSettings();window.noctemSkyV011?.redraw();};
    document.getElementById('v11StarDepth').onchange=e=>{settings.skyDetail.starMagnitudeLimit=Number(e.target.value);redraw();};
    document.getElementById('v11Eyepiece').onchange=e=>{settings.skyDetail.eyepieceId=e.target.value;redraw();};
    document.getElementById('v11DeepSky').onchange=e=>{settings.skyDetail.showDeepSky=e.target.checked;redraw();};
    document.getElementById('v11Milky').onchange=e=>{settings.skyDetail.showMilkyWay=e.target.checked;redraw();};
    document.getElementById('v11ConstNames').onchange=e=>{settings.skyDetail.showConstellationNames=e.target.checked;redraw();};
    document.getElementById('v11Finder').onchange=e=>{settings.skyDetail.showFinderFov=e.target.checked;redraw();};
  }
  const oldSky=renderSkyMap;renderSkyMap=()=>{oldSky();const o=parseObserver();if(o){controls(o);window.noctemSkyV011?.redraw();}};
  const oldSettings=renderSettings;renderSettings=()=>{oldSettings();const card=document.querySelector('.settingsCard');if(!card||document.getElementById('v11CatalogCard'))return;const m=C.meta||{},d=document.createElement('div');d.id='v11CatalogCard';d.innerHTML=`<div class="settingsDivider"></div><div class="settingsHeading"><div><h3>Expanded offline sky catalog</h3><p>v0.11 adds a deeper HYG star field plus the OpenNGC NGC/IC deep-sky catalog. The data is bundled with the app, so Finder and Sky Map remain offline.</p></div><span class="validationBadge valid">Catalog loaded</span></div><div class="v11CatalogStats"><span>${Number(m.starCount||C.stars.length).toLocaleString()} source stars</span><span>${Number(m.dsoCount||C.dsos.length).toLocaleString()} NGC / IC objects</span><span>Stars to mag ${Number(settings.skyDetail.starMagnitudeLimit||6.5).toFixed(1)}</span></div><p class="mutedText">Catalog data attribution and CC BY-SA 4.0 terms are documented in THIRD_PARTY_DATA.md. Application code remains separately licensed.</p>`;const native=document.getElementById('nativeDataCard');native?card.insertBefore(d,native):card.appendChild(d);};
  const oldFinder=renderFinder;renderFinder=()=>{oldFinder();const star=document.querySelector('#searchCategory option[value="star"]');if(star)star.textContent='Stars (expanded)';};
  saveSettings();
})();
