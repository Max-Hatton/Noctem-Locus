import fs from 'node:fs';

// Integrate the v0.11 deep-sky candidates inside the planner's own module scope.
{
  const path='frontend/planner.js';let s=fs.readFileSync(path,'utf8');
  s=s.replace("const VERSION = '0.10.0';","const VERSION = '0.11.0';");
  s=s.replace("star: p.categories?.star !== false\n      },","star: p.categories?.star !== false,\n        dso: p.categories?.dso !== false\n      },");
  s=s.replace("function categoryLabel(obj) {\n    if (obj.category === 'messier') return obj.kind || 'Deep sky';", "function categoryLabel(obj) {\n    if (obj.category === 'dso') return obj.kind || 'Deep sky';\n    if (obj.category === 'messier') return obj.kind || 'Deep sky';");
  const oldCandidate=`  function candidateObjects() {\n    const enabled = settings.planner.categories;\n    return OBJECT_CATALOG.filter(obj => {\n      if (obj.key === 'sol:Sun') return false;\n      if (obj.category === 'planet') return enabled.planet;\n      if (obj.category === 'messier') return enabled.messier;\n      if (obj.category === 'star') return enabled.star;\n      return false;\n    });\n  }`;
  const newCandidate=`  function candidateObjects() {\n    const enabled = settings.planner.categories;\n    const base = OBJECT_CATALOG.filter(obj => {\n      if (obj.key === 'sol:Sun') return false;\n      if (obj.category === 'planet') return enabled.planet;\n      if (obj.category === 'messier') return enabled.messier;\n      if (obj.category === 'star') return enabled.star;\n      return false;\n    });\n    const extra = enabled.dso && window.noctemCatalogV011?.plannerCandidates ? window.noctemCatalogV011.plannerCandidates() : [];\n    return [...base, ...extra];\n  }`;
  if(!s.includes(oldCandidate))throw new Error('planner candidate block not found');s=s.replace(oldCandidate,newCandidate);
  const filter=`        <label><input type="checkbox" data-planner-cat="star" \${settings.planner.categories.star ? 'checked' : ''}> Bright stars</label>`;
  if(!s.includes(filter))throw new Error('planner filter anchor not found');
  s=s.replace(filter,filter+`\n        <label><input type="checkbox" data-planner-cat="dso" \${settings.planner.categories.dso !== false ? 'checked' : ''}> NGC / IC deep sky</label>`);
  fs.writeFileSync(path,s);
}

// Export the magnitude-filtered DSO candidate provider used by the planner.
{
  const path='frontend/catalog-ui-v011.js';let s=fs.readFileSync(path,'utf8');
  s=s.replace('window.noctemCatalogV011.plannerMagnitudeLimit=plannerLimit;','window.noctemCatalogV011.plannerMagnitudeLimit=plannerLimit;\n  window.noctemCatalogV011.plannerCandidates=plannerDsos;');
  fs.writeFileSync(path,s);
}

// Use v0.10's explicit public planner API for the saved-site horizon in sky rendering.
{
  const path='frontend/sky-render-v011.js';let s=fs.readFileSync(path,'utf8');
  s=s.replace("function siteProfile(){try{const s=activeSite();return s&&Array.isArray(s.horizon)?s:null;}catch{return null;}}", "function siteProfile(){try{const s=window.noctemLocusPlanner?.activeSite?.();return s&&Array.isArray(s.horizon)?s:null;}catch{return null;}}");
  s=s.replaceAll('horizonLimit(s,az)', 'window.noctemLocusPlanner?.horizonLimit?.(az) ?? 0');
  // Prevent the local-horizon silhouette from creating the old-style giant zenith streak when looking almost straight up.
  s=s.replace("function drawHorizonObstruction(ctx,w,h,c){const p=horizonPoints(w,h);if(p.length<2)return;", "function drawHorizonObstruction(ctx,w,h,c){if(horizonElevationDeg>74)return;const p=horizonPoints(w,h);if(p.length<2)return;");
  // Normal magnitude-limited pass, then selected faint star separately rather than breaking before it.
  s=s.replaceAll("if(o.mag>magLimit()&&o.key!==skyMapSelectedKey)break;", "if(o.mag>magLimit())break;");
  s=s.replaceAll("if(o.mag>lim&&o.key!==skyMapSelectedKey)break;", "if(o.mag>lim)break;");
  fs.writeFileSync(path,s);
}
console.log('v0.11 integration fixes applied');
