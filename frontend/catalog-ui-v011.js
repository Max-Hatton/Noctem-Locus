(() => {
  if(window.__NL_CATALOG_UI_011__)return;window.__NL_CATALOG_UI_011__=true;
  const C=window.noctemCatalogV011;if(!C)return;
  const plannerLimit=()=>{const ap=equipmentCapability();return ap>=250?12.5:ap>=180?11.7:ap>=120?10.8:ap>=80?10:9.2;};
  const sortedDsos=[...C.dsos].filter(o=>Number.isFinite(o.mag)).sort((a,b)=>a.mag-b.mag);
  const plannerDsos=()=>{const limit=plannerLimit(),out=[];for(const o of sortedDsos){if(o.mag>limit)break;if(['GGroup','GPair','GTrpl'].includes(o.type))continue;out.push(o);if(out.length>=600)break;}return out;};
  C.dsosByMag=sortedDsos;

  const oldFinder=renderFinder;renderFinder=()=>{
    oldFinder();const s=document.getElementById('searchCategory');
    if(s&&!s.querySelector('option[value="dso"]')){const o=document.createElement('option');o.value='dso';o.textContent='NGC / IC deep sky';s.appendChild(o);s.value=searchCategory;}
    const h=document.querySelector('.searchBox span');if(h)h.textContent='Search planets, stars, Messier, NGC, IC, Caldwell aliases or common names';
    const i=document.getElementById('objectSearch');if(i)i.placeholder='Try NGC 7000, IC 434, C14, Albireo, Saturn';
    const n=document.querySelector('.notePanel p:last-of-type');if(n)n.textContent='Stars and fixed deep-sky objects use J2000 catalog coordinates precessed to the current date. Observe Now is a planning estimate; sky brightness, transparency and object surface brightness still matter.';
  };

  const oldPush=renderPushTo;renderPushTo=()=>{
    oldPush();const sel=document.getElementById('pushTarget'),target=catalogObject(pushTargetKey);
    if(sel&&target&&!sel.querySelector(`option[value="${CSS.escape(target.key)}"]`)){
      const op=document.createElement('option');op.value=target.key;op.textContent=objectOptionLabel(target);op.selected=true;sel.prepend(op);
    }
  };

  const oldBest=bestDeepSky;bestDeepSky=(observer,date)=>{
    const legacy=oldBest(observer,date),extra=plannerDsos().slice(0,260).map(o=>{const p=positionForObject(o,observer,date),r=observeRating(o,p,observer,date);return{o,p,r};}).filter(x=>x.p.altitudeDeg>5);
    const seen=new Set(),all=[...legacy,...extra].sort((a,b)=>b.r.score-a.r.score),out=[];
    for(const x of all){if(seen.has(x.o.key))continue;seen.add(x.o.key);out.push(x);if(out.length>=6)break;}return out;
  };
  const oldTonight=renderTonight;renderTonight=()=>{
    oldTonight();const heads=[...document.querySelectorAll('.panelHeader h3')],deep=heads.find(h=>h.textContent.includes('Messier targets'));
    if(deep)deep.textContent='Best deep-sky targets right now';
    const stats=document.querySelector('.catalogStats');if(stats){const spans=stats.querySelectorAll('span');if(spans[0])spans[0].textContent='Messier + NGC / IC';if(spans[1])spans[1].textContent=`${C.meta?.starCount||C.stars.length} catalog stars`;}
    const hero=document.querySelector('.heroBody');if(hero)hero.textContent='Solar-system positions, expanded star and deep-sky catalogs, equipment calculations, observing plans, and both interactive sky views run locally on this computer.';
  };

  C.plannerMagnitudeLimit=plannerLimit;
  C.plannerCandidates=plannerDsos;
})();
