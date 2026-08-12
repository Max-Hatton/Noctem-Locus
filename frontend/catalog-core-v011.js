(() => {
  if (window.__NL_CATALOG_CORE_011__) return;
  window.__NL_CATALOG_CORE_011__ = true;
  const D=window.NOCTEM_CATALOG_V011;
  if(!D){console.error('v0.11 catalog data missing');return;}
  const TYPES={'*':'Star','**':'Double star','*Ass':'Stellar association',OCl:'Open cluster',GCl:'Globular cluster','Cl+N':'Cluster + nebula',G:'Galaxy',GPair:'Galaxy pair',GTrpl:'Galaxy triplet',GGroup:'Galaxy group',PN:'Planetary nebula',HII:'H II region',DrkN:'Dark nebula',EmN:'Emission nebula',Neb:'Nebula',RfN:'Reflection nebula',SNR:'Supernova remnant',Nova:'Nova',Other:'Deep-sky object'};
  const oldNames=new Set(OBJECT_CATALOG.filter(o=>o.category==='star').map(o=>String(o.name).toLowerCase()));
  const stars=D.stars.map(r=>({key:`starx:${r[0]}`,category:'star',kind:'Star',id:r[4]?`HIP ${r[4]}`:`HYG ${r[0]}`,name:r[1],properName:r[2],designation:r[3],hip:r[4],raHours:r[5],decDeg:r[6],mag:r[7],constellation:r[8]||'—',spectrum:r[9]||'',colorIndex:r[10],source:'HYG 4.1'})).filter(o=>!(o.properName&&oldNames.has(o.properName.toLowerCase())));
  const ngcDsos=D.dsos.map(r=>({key:`dso:${String(r[0]).replace(/\s+/g,'')}`,category:'dso',kind:TYPES[r[5]]||'Deep-sky object',id:r[0],name:r[1]||r[0],commonName:r[1]||'',raHours:r[2],decDeg:r[3],mag:r[4],type:r[5],constellation:r[6]||'—',majorArcmin:r[7],minorArcmin:r[8],positionAngleDeg:r[9],aliases:Array.isArray(r[10])?r[10]:[r[0]],source:'OpenNGC'}));
  const caldwellSupplement=[
    {key:'caldwell:C9',category:'dso',kind:'Emission nebula',id:'C9',name:'Cave Nebula',commonName:'Cave Nebula',raHours:22.946667,decDeg:62.61667,mag:8,type:'EmN',constellation:'Cep',majorArcmin:null,minorArcmin:null,positionAngleDeg:null,aliases:['C9','Caldwell 9','Cave Nebula','Sh2-155','Sharpless 155'],source:'Caldwell supplemental'},
    {key:'caldwell:C14',category:'dso',kind:'Double open cluster',id:'C14',name:'Double Cluster',commonName:'Double Cluster',raHours:2.333333,decDeg:57.13333,mag:5.3,type:'OCl',constellation:'Per',majorArcmin:60,minorArcmin:null,positionAngleDeg:null,aliases:['C14','Caldwell 14','Double Cluster','NGC 869','NGC 884'],source:'Caldwell supplemental'},
    {key:'caldwell:C41',category:'dso',kind:'Open cluster',id:'C41',name:'Hyades',commonName:'Hyades',raHours:4.45,decDeg:16,mag:null,type:'OCl',constellation:'Tau',majorArcmin:null,minorArcmin:null,positionAngleDeg:null,aliases:['C41','Caldwell 41','Hyades','Melotte 25'],source:'Caldwell supplemental'},
    {key:'caldwell:C99',category:'dso',kind:'Dark nebula',id:'C99',name:'Coalsack Nebula',commonName:'Coalsack Nebula',raHours:12.883333,decDeg:-63,mag:null,type:'DrkN',constellation:'Cru',majorArcmin:null,minorArcmin:null,positionAngleDeg:null,aliases:['C99','Caldwell 99','Coalsack','Coalsack Nebula'],source:'Caldwell supplemental'}
  ];
  const dsos=[...ngcDsos,...caldwellSupplement];
  const ext=[...stars,...dsos],byKey=new Map(ext.map(o=>[o.key,o]));
  const rows=ext.map(o=>({o,text:[o.name,o.id,o.designation,o.hip?`hip ${o.hip}`:'',o.constellation,o.kind,...(o.aliases||[])].filter(Boolean).join(' ').toLowerCase()}));
  const sizeText=o=>!Number.isFinite(o.majorArcmin)?'':Number.isFinite(o.minorArcmin)&&Math.abs(o.majorArcmin-o.minorArcmin)>.05?`${o.majorArcmin.toFixed(1)}′ × ${o.minorArcmin.toFixed(1)}′`:`${o.majorArcmin.toFixed(1)}′`;
  const oldCatalogObject=catalogObject;catalogObject=key=>byKey.get(key)||oldCatalogObject(key);
  const oldDisplay=objectDisplayName;objectDisplayName=o=>o?.category==='dso'?(o.commonName?`${o.id} · ${o.commonName}`:o.id):oldDisplay(o);
  const oldSubtitle=objectSubtitle;objectSubtitle=o=>{
    if(o?.category==='dso')return[o.kind,o.constellation,Number.isFinite(o.mag)?`mag ${o.mag.toFixed(1)}`:'',sizeText(o),(o.aliases||[]).filter(a=>a!==o.id&&a!==o.commonName).slice(0,2).join(' · ')].filter(Boolean).join(' · ');
    if(o?.category==='star'&&o.key?.startsWith('starx:'))return[o.constellation,Number.isFinite(o.mag)?`mag ${o.mag.toFixed(2)}`:'',o.spectrum?`spectral ${o.spectrum}`:'',o.designation].filter(Boolean).join(' · ');
    return oldSubtitle(o);
  };
  const oldRating=observeRating;observeRating=(o,p,observer,date)=>o?.category==='dso'?oldRating({...o,category:'messier'},p,observer,date):oldRating(o,p,observer,date);
  const oldSearch=searchObjects;searchObjects=(query,category)=>{
    const q=String(query||'').trim().toLowerCase(),base=oldSearch(query,category);if(category==='planet'||category==='messier')return base;
    const found=[];for(const r of rows){if(category!=='all'&&r.o.category!==category)continue;if(q&&!r.text.includes(q))continue;let rank=3;const a=[r.o.id,r.o.name,r.o.designation,...(r.o.aliases||[])].filter(Boolean).map(x=>String(x).toLowerCase());if(q&&a.some(x=>x===q))rank=0;else if(q&&a.some(x=>x.startsWith(q)))rank=1;found.push({o:r.o,rank});if(found.length>300)break;}
    found.sort((a,b)=>a.rank-b.rank||((a.o.mag??99)-(b.o.mag??99)));const seen=new Set(),out=[];for(const o of [...base,...found.map(x=>x.o)]){if(seen.has(o.key))continue;seen.add(o.key);out.push(o);if(out.length>=60)break;}return out;
  };
  const oldObsLabel=observationObjectLabel;observationObjectLabel=(key,name)=>byKey.has(key)?objectDisplayName(byKey.get(key)):oldObsLabel(key,name);
  const oldObsText=observationObjectFromText;observationObjectFromText=text=>searchObjects(String(text||''),'all')[0]||oldObsText(text);
  if(typeof TYPE_ICONS==='object')TYPE_ICONS.dso='DEEP SKY';
  settings.skyDetail ||= {};if(!Number.isFinite(Number(settings.skyDetail.starMagnitudeLimit)))settings.skyDetail.starMagnitudeLimit=6.5;if(typeof settings.skyDetail.showDeepSky!=='boolean')settings.skyDetail.showDeepSky=true;if(typeof settings.skyDetail.showMilkyWay!=='boolean')settings.skyDetail.showMilkyWay=true;if(typeof settings.skyDetail.showConstellationNames!=='boolean')settings.skyDetail.showConstellationNames=true;saveSettings();
  window.noctemCatalogV011={version:D.version,meta:{...D.meta,caldwellSupplementCount:caldwellSupplement.length},stars,dsos,ngcDsos,caldwellSupplement,byKey,constellations:D.constellations,sizeText,typeName:t=>TYPES[t]||'Deep-sky object'};
})();
