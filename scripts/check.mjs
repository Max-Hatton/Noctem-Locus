import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
process.chdir(root);
// Stop at the first failure on Windows and Linux alike.
function run(args){const result=spawnSync(process.execPath,args,{cwd:root,stdio:'inherit'});if(result.error)throw result.error;if(result.status!==0)process.exit(result.status||1);}
for(const file of fs.readdirSync('frontend').filter(f=>f.endsWith('.js')))run(['--check',path.join('frontend',file)]);
const html=fs.readFileSync('frontend/index.html','utf8');
for(const [i,match] of [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].entries())new vm.Script(match[1],{filename:`index.html:inline-${i+1}`});
for(const test of ['check-catalog-v011.mjs','smoke-catalog-runtime-v011.mjs','smoke-weather-runtime-v012.mjs','test-moon-core.mjs','check-moon-render.mjs','test-moon-map.mjs'])run([path.join('scripts',test)]);
console.log('All Noctem Locus frontend checks passed.');
