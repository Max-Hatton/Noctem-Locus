import fs from 'node:fs';

const path = 'frontend/native-bridge.js';
let src = fs.readFileSync(path, 'utf8');

src = src.replace("const VERSION = '0.9.1';", "const VERSION = '0.10.0';");

if (!src.includes('__NOCTEM_LOCUS_V010_LOADER__')) {
  const anchor = "  void initialize().catch(error => {";
  if (!src.includes(anchor)) throw new Error('Could not find native bridge initialization anchor');
  const loader = `  function loadV010Features() {\n    if (window.__NOCTEM_LOCUS_V010_LOADER__) return;\n    window.__NOCTEM_LOCUS_V010_LOADER__ = true;\n    const script = document.createElement('script');\n    script.src = new URL('planner.js', document.baseURI).href;\n    script.async = false;\n    script.dataset.noctemFeature = 'v0.10';\n    script.onerror = () => console.error('Noctem Locus v0.10 planner layer could not be loaded');\n    document.head.appendChild(script);\n  }\n\n  void initialize().then(loadV010Features).catch(error => {`;
  src = src.replace(anchor, loader);
}

fs.writeFileSync(path, src);
console.log('v0.10 native bridge patch applied');
