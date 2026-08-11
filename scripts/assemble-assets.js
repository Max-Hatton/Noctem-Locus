const fs = require('fs');
const path = require('path');

function assembleBase64Parts(sourceDir, outputPath) {
  const parts = fs.readdirSync(sourceDir)
    .filter(name => name.endsWith('.part'))
    .sort();
  if (!parts.length) throw new Error(`No .part files found in ${sourceDir}`);
  const encoded = parts.map(name => fs.readFileSync(path.join(sourceDir, name), 'utf8')).join('');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, Buffer.from(encoded, 'base64'));
  console.log(`Assembled ${outputPath} from ${parts.length} parts.`);
}

assembleBase64Parts(
  path.join(__dirname, '..', 'frontend', 'encoded'),
  path.join(__dirname, '..', 'frontend', 'index.html')
);

const historyDir = path.join(__dirname, '..', 'archive', 'encoded');
if (fs.existsSync(historyDir)) {
  assembleBase64Parts(
    historyDir,
    path.join(__dirname, '..', 'archive', 'noctem-locus-history-v0.1-v0.9.0.tar.gz')
  );
}
