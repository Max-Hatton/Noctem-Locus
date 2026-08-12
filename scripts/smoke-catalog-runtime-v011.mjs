import fs from 'node:fs';
import vm from 'node:vm';

const sandbox={
  window:{},
  console,
  OBJECT_CATALOG:[{key:'star:Sirius',category:'star',kind:'Bright star',id:'Sirius',name:'Sirius',raHours:6.75,decDeg:-16.7,mag:-1.46,constellation:'Canis Major'}],
  TYPE_ICONS:{},
  settings:{skyDetail:{}},
  saveSettings(){},
  catalogObject(key){return sandbox.OBJECT_CATALOG.find(o=>o.key===key)||sandbox.OBJECT_CATALOG[0];},
  objectDisplayName(o){return o.name;},
  objectSubtitle(o){return o.kind;},
  observeRating(o){return{label:'Good',className:'good',score:50,reason:o.category};},
  searchObjects(query,category){const q=String(query).toLowerCase();return sandbox.OBJECT_CATALOG.filter(o=>(category==='all'||o.category===category)&&o.name.toLowerCase().includes(q));},
  observationObjectLabel(key,name){return name||key;},
  observationObjectFromText(){return null;}
};
vm.createContext(sandbox);
for(const file of ['frontend/catalog-v011.js','frontend/catalog-core-v011.js']) vm.runInContext(fs.readFileSync(file,'utf8'),sandbox,{filename:file});
const C=sandbox.window.noctemCatalogV011;
if(!C)throw new Error('catalog core did not initialize');
if(C.stars.length<15000)throw new Error('expanded star layer missing');
if(C.ngcDsos.length<13000)throw new Error('expanded NGC/IC layer missing');
for(const id of ['C9','C14','C41','C99']){
  const hit=sandbox.searchObjects(id,'all')[0];
  if(!hit||hit.id!==id)throw new Error(`${id} supplemental search failed`);
  if(!Number.isFinite(hit.raHours)||!Number.isFinite(hit.decDeg))throw new Error(`${id} has invalid coordinates`);
}
const ngc=sandbox.searchObjects('NGC 7000','all')[0];
if(!ngc||!String(ngc.id).includes('NGC'))throw new Error('NGC search failed');
const loader=fs.readFileSync('frontend/native-bridge.js','utf8');
const order=['planner.js','catalog-v011.js','catalog-core-v011.js','catalog-ui-v011.js','sky-render-v011.js','sky-ui-v011.js'].map(x=>loader.indexOf(x));
if(order.some(x=>x<0)||order.some((x,i)=>i&&x<=order[i-1]))throw new Error('v0.11 feature loader order is invalid');
const planner=fs.readFileSync('frontend/planner.js','utf8');
if(!planner.includes('plannerCandidates')||!planner.includes('data-planner-cat="dso"'))throw new Error('planner deep-sky integration missing');
console.log(`runtime smoke ok: ${C.stars.length} added stars, ${C.ngcDsos.length} NGC/IC, complete Caldwell supplements`);
