import fs from 'node:fs';

const path = 'frontend/planner.js';
let src = fs.readFileSync(path, 'utf8');

if (!src.includes('function localDateKey(')) {
  const anchor = '  function horizonArray(value) {';
  const helper = `  function localDateKey(date = new Date()) {\n    const y = date.getFullYear();\n    const m = String(date.getMonth() + 1).padStart(2, '0');\n    const d = String(date.getDate()).padStart(2, '0');\n    return \`${'${y}-${m}-${d}'}\`;\n  }\n\n`;
  if (!src.includes(anchor)) throw new Error('Could not find horizon helper anchor');
  src = src.replace(anchor, helper + anchor);
}

src = src.replaceAll("new Date().toISOString().slice(0,10)", "localDateKey()");

fs.writeFileSync(path, src);
console.log('v0.10 planner local-date handling fixed');
