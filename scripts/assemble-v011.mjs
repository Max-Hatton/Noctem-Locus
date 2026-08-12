import fs from 'node:fs';

function patchNativeBridge(){
  const path='frontend/native-bridge.js';let s=fs.readFileSync(path,'utf8');
  s=s.replace("const VERSION = '0.10.0';","const VERSION = '0.11.0';");
  const a=s.indexOf('  function loadV010Features() {');
  const b=s.indexOf('\n\n  void initialize()',a);
  if(a<0||b<0)throw new Error('Could not locate v0.10 loader');
  const loader=`  function loadFeatureScript(file, tag) {\n    return new Promise((resolve, reject) => {\n      const script = document.createElement('script');\n      script.src = new URL(file, document.baseURI).href;\n      script.async = false;\n      script.dataset.noctemFeature = tag;\n      script.onload = resolve;\n      script.onerror = () => reject(new Error(\`Could not load \${file}\`));\n      document.head.appendChild(script);\n    });\n  }\n\n  async function loadV011Features() {\n    if (window.__NOCTEM_LOCUS_V011_LOADER__) return;\n    window.__NOCTEM_LOCUS_V011_LOADER__ = true;\n    for (const [file, tag] of [\n      ['planner.js','v0.10-planner'],\n      ['catalog-v011.js','v0.11-data'],\n      ['catalog-core-v011.js','v0.11-catalog'],\n      ['catalog-ui-v011.js','v0.11-catalog-ui'],\n      ['sky-render-v011.js','v0.11-sky'],\n      ['sky-ui-v011.js','v0.11-sky-ui']\n    ]) await loadFeatureScript(file, tag);\n    if (typeof renderShell === 'function') renderShell();\n  }`;
  s=s.slice(0,a)+loader+s.slice(b);
  s=s.replace('void initialize().then(loadV010Features).catch(error => {','void initialize().then(loadV011Features).catch(error => {');
  fs.writeFileSync(path,s);
}
function patchVersions(){
  const p=JSON.parse(fs.readFileSync('package.json','utf8'));p.version='0.11.0';fs.writeFileSync('package.json',JSON.stringify(p,null,2)+'\n');
  const t=JSON.parse(fs.readFileSync('src-tauri/tauri.conf.json','utf8'));t.version='0.11.0';fs.writeFileSync('src-tauri/tauri.conf.json',JSON.stringify(t,null,2)+'\n');
  let c=fs.readFileSync('src-tauri/Cargo.toml','utf8');c=c.replace(/version = "0\.10\.0"/,'version = "0.11.0"');fs.writeFileSync('src-tauri/Cargo.toml',c);
}
function patchSky(){
  const p='frontend/sky-render-v011.js';let s=fs.readFileSync(p,'utf8');
  s=s.replace('altitudeDeg:a/RAD,azimuthDeg:normalizeHeading(z/RAD)','altitudeDeg:a*RAD,azimuthDeg:normalizeHeading(z*RAD)');
  fs.writeFileSync(p,s);
}
patchNativeBridge();patchVersions();patchSky();console.log('v0.11 assembly patches applied');
