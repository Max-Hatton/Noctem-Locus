(() => {
  if(window.__NL_CATALOG_UI_011__)return;window.__NL_CATALOG_UI_011__=true;
  const C=window.noctemCatalogV011;if(!C)return;
  const plannerLimit=()=>{const ap=equipmentCapability();return ap>=250?12.5:ap>=180?11.7:ap>=120?10.8:ap>=80?10:9.2;};
  const plannerDsos=()=>C.dsos.filter(o=>Number.isFinite(o.mag)&&o.mag<=plannerLimit()&&!['GGroup','GPair','GTrpl'].includes(o.type)).sort((a,b)=>(a.mag??99)-(b.mag??99)).slice(0,900);
  if(typeof categoryLabel==='function'){const old=categoryLabel;categoryLabel=o=>o?.category==='dso'?o.kind:old(o);}
  if(typeof ensureV010Data==='function'){
    const old=ensureV010Data;ensureV010Data=()=>{old();if(typeof settings.planner.categories.dso!=='boolean')settings.planner.categories.dso=true;};
  }
  if(typeof candidateObjects==='function'){
    const old=candidateObjects;candidateObjects=()=>{const base=old();return settings.planner?.categories?.dso===false?base:[...base,...plannerDsos()];};
  }
  const oldFinder=renderFinder;renderFinder=()=>{
    oldFinder();const s=document.getElementById('searchCategory');
    if(s&&!s.querySelector('option[value="dso"]')){const o=document.createElement('option');o.value='dso';o.textContent='NGC / IC deep sky';s.appendChild(o);s.value=searchCategory;}
    const h=document.querySelector('.searchBox span');if(h)h.textContent='Search planets, stars, Messier, NGC, IC, Caldwell aliases or common names';
    const i=document.getElementById('objectSearch');if(i)i.placeholder='Try NGC 7000, IC 434, C14, Albireo, Saturn';
    const n=document.querySelector('.notePanel p:last-of-type');if(n)n.textContent='Stars and fixed deep-sky objects use J2000 catalog coordinates precessed to the current date. Observe Now is a planning estimate; sky brightness, transparency and object surface brightness still matter.';
  };
  if(typeof renderPlanner==='function'){
    const old=renderPlanner;renderPlanner=()=>{
      ensureV010Data();old();const r=document.querySelector('.v10CategoryRow');
      if(r&&!r.querySelector('[data-planner-cat="dso"]')){const l=document.createElement('label');l.innerHTML=`<input type="checkbox" data-planner-cat="dso" ${settings.planner.categories.dso!==false?'checked':''}> NGC / IC deep sky`;r.insertBefore(l,r.querySelector('.mutedText'));l.querySelector('input').onchange=e=>{settings.planner.categories.dso=e.target.checked;saveSettings();renderPlanner();};}
      const p=document.querySelector('.v10PlannerHero p:not(.eyebrow)');if(p&&!p.textContent.includes('expanded deep-sky'))p.innerHTML=p.innerHTML.replace('custom horizon','custom horizon and expanded deep-sky catalog');
    };
  }
  window.noctemCatalogV011.plannerMagnitudeLimit=plannerLimit;
})();
