import fs from 'node:fs';
import vm from 'node:vm';
const file='frontend/catalog-v011.js';
const source=fs.readFileSync(file,'utf8');
const sandbox={window:{}};
vm.createContext(sandbox);
vm.runInContext(source,sandbox,{filename:file});
const c=sandbox.window.NOCTEM_CATALOG_V011;
if(!c) throw new Error('NOCTEM_CATALOG_V011 was not defined');
if(!Array.isArray(c.stars)||c.stars.length<5000) throw new Error(`Unexpected star count: ${c.stars?.length}`);
if(!Array.isArray(c.dsos)||c.dsos.length<8000) throw new Error(`Unexpected DSO count: ${c.dsos?.length}`);
if(!Array.isArray(c.constellations)||c.constellations.length<70) throw new Error(`Unexpected constellation count: ${c.constellations?.length}`);
for(const s of c.stars.slice(0,100)){if(!Number.isFinite(s[5])||!Number.isFinite(s[6])||!Number.isFinite(s[7])) throw new Error('Invalid star row');}
for(const d of c.dsos.slice(0,100)){if(!d[0]||!Number.isFinite(d[2])||!Number.isFinite(d[3])) throw new Error('Invalid DSO row');}
console.log(`catalog ok: ${c.stars.length} stars, ${c.dsos.length} DSO, ${c.meta?.caldwellAliasCount||0} Caldwell aliases`);
