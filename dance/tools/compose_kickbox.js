// Build the kickboxing combos: 8-count sequences of strikes, each strike's impact landing exactly on a count.
// Input: single strikes already retargeted onto one avatar with retarget.js (one JSON per source clip, see SOURCES).
// Each strike is the part of a source clip from the guard, through the impact, back to the guard. It is time-warped
// so that the impact falls on its count, played at close to its own speed, and the time left over is filled with the
// bouncing guard. Pieces are crossfaded where they meet, and the sequence loops seamlessly.
// Output: clips in the game's format (per-frame bone rotations, hips offset, 2D poses for scoring) plus `counts`,
// one label per count, with {L}/{R} standing for the captured fighter's left and right hand or leg.
// usage: node compose_kickbox.js <dir with source JSONs> <out dir> [strip.png dir]
const fs = require('fs'), path = require('path');
const [SRC, OUT] = process.argv.slice(2);
const FPS = 30, BPM = 100, SPB = 60 / BPM;

// source clips (retarget.js output names) -> Mixamo clip they came from
const SOURCES = {punch_combo: 'Punch Combo', quad_punch: 'Quad Punch', hook_lead: 'Hook', hook_rear: 'Right Hook',
  front_kick: 'Kicking', round_rear: 'Roundhouse Kick', round_lead: 'Mma Kick',
  knee_rear: 'Illegal Knee', knee_lead: 'Knee Kick Lead', guard: 'Bouncing Fight Idle'};
// (a side kick was tried and left out: it turns the body fully side-on to the camera, and the phone's pose model then
// loses an arm and the kicking leg, so it could not be scored)
// strikes: source clip, frames of the guard before (a), the impact (i) and the guard after (b), measured from the
// hand or foot reach curves of each clip; label as spoken to the player
const STRIKES = {
  jab:       {src: 'punch_combo', a: 13, i: 19, b: 27, label: 'ג׳אב', side: 'L'},
  cross:     {src: 'punch_combo', a: 20, i: 26, b: 35, label: 'קרוס', side: 'R'},
  bodyjab:   {src: 'quad_punch',  a: 10, i: 16, b: 24, label: 'ג׳אב לגוף', side: 'L'},
  bodycross: {src: 'quad_punch',  a: 16, i: 22, b: 30, label: 'קרוס לגוף', side: 'R'},
  hookL:     {src: 'hook_lead',   a: 6,  i: 14, b: 24, label: 'הוק', side: 'L'},
  hookR:     {src: 'hook_rear',   a: 7,  i: 13, b: 24, label: 'הוק', side: 'R'},
  front:     {src: 'front_kick',  a: 9,  i: 28, b: 44, label: 'בעיטה קדמית', side: 'R', leg: true},
  roundR:    {src: 'round_rear',  a: 9,  i: 28, b: 46, label: 'בעיטה סיבובית', side: 'R', leg: true},
  roundL:    {src: 'round_lead',  a: 7,  i: 18, b: 34, label: 'בעיטה סיבובית', side: 'L', leg: true},
  kneeR:     {src: 'knee_rear',   a: 8,  i: 23, b: 39, label: 'ברך', side: 'R', leg: true},
  kneeL:     {src: 'knee_lead',   a: 14, i: 27, b: 44, label: 'ברך', side: 'L', leg: true}
};
// the combos: [strike, counts it takes]; 'guard' is a count of bouncing in the guard
const COMBOS = {
  kb_jab:     [['jab', 1], ['jab', 1], ['jab', 1], ['guard', 1], ['jab', 1], ['jab', 1], ['jab', 1], ['guard', 1]],
  kb_onetwo:  [['jab', 1], ['cross', 1], ['jab', 1], ['cross', 1], ['jab', 1], ['cross', 1], ['jab', 1], ['cross', 1]],
  kb_hook:    [['jab', 1], ['cross', 1], ['hookL', 1], ['cross', 1], ['jab', 1], ['cross', 1], ['hookL', 1], ['hookR', 1]],
  kb_body:    [['bodyjab', 1], ['bodycross', 1], ['bodyjab', 1], ['bodycross', 1], ['jab', 1], ['cross', 1], ['jab', 1], ['cross', 1]],
  kb_front:   [['front', 2], ['guard', 1], ['jab', 1], ['front', 2], ['guard', 1], ['cross', 1]],
  kb_round:   [['jab', 1], ['cross', 1], ['roundR', 2], ['jab', 1], ['cross', 1], ['roundR', 2]],
  kb_knee:    [['kneeR', 2], ['kneeR', 2], ['kneeL', 2], ['kneeL', 2]],
  kb_lead:    [['roundL', 2], ['jab', 1], ['cross', 1], ['roundL', 2], ['jab', 1], ['cross', 1]],
  kb_combo1:  [['jab', 1], ['cross', 1], ['roundR', 2], ['jab', 1], ['cross', 1], ['roundL', 2]],
  kb_combo2:  [['hookL', 1], ['hookR', 1], ['kneeR', 2], ['hookL', 1], ['hookR', 1], ['kneeR', 2]],
  kb_combo3:  [['bodyjab', 1], ['bodycross', 1], ['jab', 1], ['cross', 1], ['hookL', 1], ['cross', 1], ['roundR', 2]],
  kb_combo4:  [['jab', 1], ['cross', 1], ['hookL', 1], ['cross', 1], ['front', 2], ['kneeR', 2],
               ['jab', 1], ['cross', 1], ['bodyjab', 1], ['bodycross', 1], ['roundL', 2], ['roundR', 2]]
};

// ---------- clip sampling and blending ----------
const src = {}; for (const k in SOURCES) src[k] = JSON.parse(fs.readFileSync(path.join(SRC, k + '.json'), 'utf8'));
const boneNames = Object.keys(src.guard.bones);
function slerp(a, b, t){
  let [ax, ay, az, aw] = a, [bx, by, bz, bw] = b;
  let d = ax * bx + ay * by + az * bz + aw * bw; if (d < 0){ bx = -bx; by = -by; bz = -bz; bw = -bw; d = -d; }
  if (d > 0.9995){ const o = [ax + (bx - ax) * t, ay + (by - ay) * t, az + (bz - az) * t, aw + (bw - aw) * t]; const n = Math.hypot(...o); return o.map(v => v / n); }
  const th = Math.acos(d), s = Math.sin(th), wa = Math.sin((1 - t) * th) / s, wb = Math.sin(t * th) / s;
  return [ax * wa + bx * wb, ay * wa + by * wb, az * wa + bz * wb, aw * wa + bw * wb];
}
const lerp = (a, b, t) => a + (b - a) * t;
const angLerp = (a, b, t) => { let d = ((b - a + 180) % 360 + 360) % 360 - 180; return a + d * t; };
const ANGLES = ['rUpper', 'rFore', 'lUpper', 'lFore', 'rThigh', 'rShin', 'lThigh', 'lShin', 'lean'];
function blendPose(p, q, t){
  const o = {};
  for (const k in p){
    if (Array.isArray(p[k])) o[k] = p[k].map((v, i) => +lerp(v, q[k][i], t).toFixed(2));
    else if (ANGLES.includes(k)) o[k] = +angLerp(p[k], q[k], t).toFixed(1);
    else o[k] = +lerp(p[k], q[k], t).toFixed(3);
  }
  return o;
}
function frameOf(c, f){ f = Math.max(0, Math.min(c.frames - 1, f)); return f; }
// one sample of a clip at a (fractional) frame: bone rotations, hips offset, 2D pose
function sample(name, f, wrap){
  const c = src[name]; let i0, i1, t;
  if (wrap){ const n = c.frames; f = ((f % n) + n) % n; i0 = Math.floor(f); i1 = (i0 + 1) % n; t = f - i0; }
  else { f = Math.max(0, Math.min(c.frames - 1, f)); i0 = Math.floor(f); i1 = frameOf(c, i0 + 1); t = f - i0; }
  const q = {}; for (const b of boneNames){ const a = c.bones[b]; q[b] = slerp(a.slice(i0 * 4, i0 * 4 + 4), a.slice(i1 * 4, i1 * 4 + 4), t); }
  const h = [0, 1, 2].map(k => lerp(c.hips[i0 * 3 + k], c.hips[i1 * 3 + k], t));
  return {q, h, p: blendPose(c.poses[i0], c.poses[i1], t)};
}
function blend(A, B, t){
  if (t <= 0) return A; if (t >= 1) return B;
  const q = {}; for (const b of boneNames) q[b] = slerp(A.q[b], B.q[b], t);
  return {q, h: A.h.map((v, k) => lerp(v, B.h[k], t)), p: blendPose(A.p, B.p, t)};
}

// ---------- the timeline of one combo ----------
// A piece maps output time [T0, T1] linearly onto source frames [f0, f1] of one clip; the guard runs on the global
// clock so it never jumps. Outside its range a piece holds its end frames.
function build(id, items){
  const counts = items.reduce((n, [, k]) => n + k, 0), total = counts * SPB;
  // impacts (in seconds) and the strikes, with one copy of the last before and the first after, so the loop wraps
  const list = []; let c = 0;
  for (const [s, k] of items){ list.push({s, at: c * SPB, k}); c += k; }
  const ext = [Object.assign({}, list[list.length - 1], {at: list[list.length - 1].at - total}), ...list, Object.assign({}, list[0], {at: list[0].at + total})];
  const pieces = [];
  for (let n = 0; n < ext.length; n++){
    const e = ext[n]; if (e.s === 'guard') continue;
    const S = STRIKES[e.s];
    const wn = (S.i - S.a) / FPS, rn = (S.b - S.i) / FPS;          // natural windup and recovery
    // the time it may take: from the previous count's impact (or half a count) to the next
    const prev = ext[n - 1], next = ext[n + 1];
    const before = prev ? e.at - prev.at : SPB, after = next ? next.at - e.at : e.k * SPB;
    const wBudget = before * (prev && prev.s !== 'guard' ? wn / (wn + (STRIKES[prev.s].b - STRIKES[prev.s].i) / FPS) : 0.6);
    const rBudget = after * (next && next.s !== 'guard' ? rn / (rn + (STRIKES[next.s].i - STRIKES[next.s].a) / FPS) : 0.75);
    // close to natural speed: no slower than 0.8x; faster only when the budget forces it
    const wa = Math.min(wBudget, wn / 0.8), ra = Math.min(rBudget, rn / 0.8);
    pieces.push({clip: S.src, T0: e.at - wa, T1: e.at, f0: S.a, f1: S.i});
    pieces.push({clip: S.src, T0: e.at, T1: e.at + ra, f0: S.i, f1: S.b, tail: true});
  }
  pieces.sort((a, b) => a.T0 - b.T0);
  const at = (p, T) => p.f0 + (p.f1 - p.f0) * Math.max(0, Math.min(1, (T - p.T0) / (p.T1 - p.T0)));
  const guardAt = T => sample('guard', T * FPS, true);
  const H = 0.07;   // crossfade half-width, seconds
  const N = Math.round(total * FPS), out = {bones: {}, hips: [], poses: []};
  for (const b of boneNames) out.bones[b] = [];
  const smooth = x => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
  for (let f = 0; f < N; f++){
    const T = f / FPS;
    // weight of every strike piece pair (windup+recovery is one continuous stretch of its clip)
    // strikes that overlap at a seam share the weight between them; the guard fills whatever is left
    let acc = null, accW = 0;
    for (let k = 0; k < pieces.length; k += 2){
      const w = pieces[k], r = pieces[k + 1];
      const wgt = Math.min(smooth((T - w.T0 + H) / (2 * H)), smooth((r.T1 + H - T) / (2 * H)));
      if (wgt <= 0) continue;
      const p = T < w.T1 ? w : r, x = sample(p.clip, at(p, T));
      acc = acc ? blend(acc, x, wgt / (accW + wgt)) : x; accW += wgt;
    }
    const s = !acc ? guardAt(T) : accW >= 1 ? acc : blend(guardAt(T), acc, accW);
    for (const b of boneNames) out.bones[b].push(...s.q[b].map(v => +v.toFixed(4)));
    out.hips.push(...s.h.map(v => +v.toFixed(4)));
    out.poses.push(s.p);
  }
  // per count: the strike that lands on it, or guard
  const labels = []; for (const [s, k] of items){ const S = STRIKES[s]; labels.push(S ? S.label + (S.leg ? ' · רגל {' + S.side + '}' : ' · יד {' + S.side + '}') : 'גארד'); for (let j = 1; j < k; j++) labels.push(S && S.leg ? 'חוזרים לגארד' : 'גארד'); }
  return {name: id, duration: total, fps: FPS, frames: N, bpm: BPM, beats: counts, mapped: src.guard.mapped,
    source: [...new Set(items.map(([s]) => s === 'guard' ? 'guard' : STRIKES[s].src))].map(k => 'Mixamo: ' + SOURCES[k]),
    counts: labels, bones: out.bones, hips: out.hips, poses: out.poses};
}
fs.mkdirSync(OUT, {recursive: true});
for (const id in COMBOS){
  const j = build(id, COMBOS[id]);
  fs.writeFileSync(path.join(OUT, id + '.json'), JSON.stringify(j));
  console.log(id, 'beats', j.beats, 'frames', j.frames, 'KB', Math.round(fs.statSync(path.join(OUT, id + '.json')).size / 1024), j.counts.join(' | '));
}
