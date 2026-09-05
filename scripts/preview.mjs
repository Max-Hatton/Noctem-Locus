// Local browser preview. The real desktop storage is never read or written.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../frontend');
const fixture=JSON.stringify({theme:'day',brightness:100,locationName:'Chicago (preview)',latitude:'41.8781',longitude:'-87.6298',elevationM:'180',weather:{enabled:false},equipment:{telescopes:[{id:'preview-xt8',name:'Orion XT8 IntelliScope',apertureMm:'203',focalLengthMm:'1200',type:'Dobsonian'}],activeTelescopeId:'preview-xt8',eyepieces:[]}});
const bootstrap=`<script>
  window.__TAURI__={core:{invoke:async function(command,args){
    if(command==='native_load_state')return sessionStorage.getItem('noctem-preview-state')||${JSON.stringify(fixture)};
    if(command==='native_save_state'){sessionStorage.setItem('noctem-preview-state',args.stateJson);return;}
    if(command==='native_info')return {appDataDir:'Browser preview only',photoCount:0,photoBytes:0,stateBytes:0};
    if(command==='native_photo_exists')return false;
    throw new Error('Native desktop action is unavailable in browser preview');
  }}};
</script><script src="native-bridge.js"></script>`;
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.jpg':'image/jpeg','.png':'image/png','.md':'text/plain; charset=utf-8','.json':'application/json'};
const server=http.createServer((req,res)=>{
  try{
    const uri=new URL(req.url,'http://localhost');
    const file=path.resolve(root,'.'+decodeURIComponent(uri.pathname==='/'?'/index.html':uri.pathname));
    if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
    let body=fs.readFileSync(file);
    if(file===path.join(root,'index.html'))body=Buffer.from(body.toString('utf8').replace('</body>',bootstrap+'</body>'));
    res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(body);
  }catch{res.writeHead(404);res.end('Not found');}
});
const port=Number(process.env.NOCTEM_PREVIEW_PORT)||4173;
server.listen(port,'127.0.0.1',()=>console.log(`Noctem Locus preview: http://127.0.0.1:${port}`));
