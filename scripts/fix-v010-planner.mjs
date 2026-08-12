import fs from 'node:fs';

const path = 'frontend/planner.js';
let src = fs.readFileSync(path, 'utf8');

// When the final target is marked observed, show the session summary immediately.
const advanceNeedle = "if (s.index >= settings.planner.queue.length) endSession(false);";
const first = src.indexOf(advanceNeedle);
if (first >= 0) {
  src = src.slice(0, first) + "if (s.index >= settings.planner.queue.length) endSession(true);" + src.slice(first + advanceNeedle.length);
}

// Surface the useful local-horizon clear time directly in recommendation cards.
const reasonNeedle = "    const reason = c.rating?.reason || '';";
if (src.includes(reasonNeedle) && !src.includes('const clearNote =')) {
  src = src.replace(reasonNeedle, "    const clearNote = nowBlocked && c.firstClear ? ` · clears local horizon about ${timeLabel(c.firstClear)}` : '';\n    const reason = c.rating?.reason || '';");
  src = src.replace("<small>${esc(status)}${reason ? ` · ${esc(reason)}` : ''}</small>", "<small>${esc(status)}${clearNote}${reason ? ` · ${esc(reason)}` : ''}</small>");
}

fs.writeFileSync(path, src);
console.log('v0.10 planner refinements applied');
