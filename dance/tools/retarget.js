// Retarget a Mixamo dance (FBX, without skin) onto the avatar's skeleton (GLB), and write
// a compact JSON clip: per-frame bone quaternions, hips offset, 2D pose data for scoring,
// and an estimated tempo. Also renders a strip of frames for a visual check.
// usage: node retarget.js <scratch> <dance.fbx> <avatar.glb> <out.json> <out.png>
const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const [S, fbxPath, glbPath, outJson, outPng] = process.argv.slice(2);
  const b = await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const p = await (await b.newContext({viewport:{width:1600, height:420}})).newPage();
  p.on('console', m => { if (m.type() === 'error') console.log('[page]', m.text().slice(0, 300)); });
  await p.setContent('<body style="margin:0;background:#1b1f26"><canvas id=c width=1600 height=420></canvas></body>');
  for (const f of ['build/three.min.js', 'examples/js/libs/fflate.min.js', 'examples/js/loaders/FBXLoader.js', 'examples/js/loaders/GLTFLoader.js']) await p.addScriptTag({content: fs.readFileSync(S + '/three/package/' + f, 'utf8')});
  const fbx64 = fs.readFileSync(fbxPath).toString('base64'), glb64 = fs.readFileSync(glbPath).toString('base64');
  const result = await p.evaluate(async ([fbx64, glb64]) => {
    const T = THREE;
    const toBuf = s => Uint8Array.from(atob(s), c => c.charCodeAt(0)).buffer;
    const fbx = new T.FBXLoader().parse(toBuf(fbx64), '');
    const gltf = await new Promise((res, rej) => new T.GLTFLoader().parse(toBuf(glb64), '', res, rej));
    const av = gltf.scene;
    // rest = the bind pose, not whatever pose the file happens to be saved in (the same code as toBindPose in the game)
    {
    av.updateMatrixWorld(true); const groups = new Map(), m = new T.Matrix4(), comp = (a, v, c) => c === 0 ? a.getX(v) : c === 1 ? a.getY(v) : c === 2 ? a.getZ(v) : a.getW(v);
    av.traverse(o => { if (o.isSkinnedMesh){ if (!groups.has(o.skeleton)) groups.set(o.skeleton, []); groups.get(o.skeleton).push(o); } });
    groups.forEach((meshes, sk) => {
      const at = new Map(sk.bones.map((b, i) => [b, i])), used = new Uint8Array(sk.bones.length);
      // only a bone that carries skin, or leads to one that does, has a bind matrix that means something: the end
      // bones of fingers and toes often hold garbage there
      for (const o of meshes){
        const si = o.geometry.attributes.skinIndex, sw = o.geometry.attributes.skinWeight; if (!si || !sw) continue;
        for (let v = 0; v < si.count; v++) for (let c = 0; c < 4; c++) if (comp(sw, v, c) > 0) used[comp(si, v, c)] = 1;
      }
      sk.bones.forEach((b, i) => { if (used[i]) for (let x = b.parent; x && at.has(x); x = x.parent) used[at.get(x)] = 1; });
      const W = sk.boneInverses.map(bi => new T.Matrix4().copy(bi).invert());
      const loc = sk.bones.map((b, i) => { const pi = at.get(b.parent); if (pi === undefined || !used[i]) return null; const L = {p: new T.Vector3(), q: new T.Quaternion(), s: new T.Vector3()}; m.copy(W[pi]).invert().multiply(W[i]).decompose(L.p, L.q, L.s); return L; });
      // a file that already rests in its bind pose is left exactly as it is
      if (!sk.bones.some((b, i) => loc[i] && b.quaternion.angleTo(loc[i].q) > 0.05)) return;
      sk.bones.forEach((b, i) => { if (loc[i]){ b.position.copy(loc[i].p); b.quaternion.copy(loc[i].q); } });
    });
    av.updateMatrixWorld(true);
    }
    // ---- bone maps ----
    const mix = {}; fbx.traverse(o => { if (o.isBone) mix[o.name.replace(/^mixamorig:?/, '')] = o; });
    const ours = {}; av.traverse(o => { if (o.isBone) ours[o.name.replace(/^mixamorig:?/, '').replace(/_\d+$/, '').replace(/\./g, '')] = o; });
    const targetIsMixamo = !!(ours.LeftArm && ours.LeftUpLeg && ours.Hips);
    const MAP = {Hips:'Hips', Spine:'Abdomen', Spine1:'Torso', Spine2:'Chest', Neck:'Neck', Head:'Head',
      LeftShoulder:'Shoulder.L', LeftArm:'UpperArm.L', LeftForeArm:'LowerArm.L', LeftHand:'Wrist.L', LeftUpLeg:'UpperLeg.L', LeftLeg:'LowerLeg.L', LeftFoot:'Foot.L',
      RightShoulder:'Shoulder.R', RightArm:'UpperArm.R', RightForeArm:'LowerArm.R', RightHand:'Wrist.R', RightUpLeg:'UpperLeg.R', RightLeg:'LowerLeg.R', RightFoot:'Foot.R'};
    for (const side of ['Left', 'Right']) for (const [mf, of] of [['Index','Index'],['Middle','Middle'],['Ring','Ring'],['Pinky','Pinky'],['Thumb','Thumb']]) for (const k of [1,2,3]) MAP[side + 'Hand' + mf + k] = of + k + '.' + side[0];
    for (const m in MAP) MAP[m] = MAP[m].replace(/\./g, '');
    if (targetIsMixamo){ for (const m in MAP) delete MAP[m]; for (const m in mix) if (ours[m] && !/HeadTop_End|Eye|4$/.test(m)) MAP[m] = m; }
    const pairs = Object.entries(MAP).filter(([m, o]) => mix[m] && ours[o]);
    // ---- rest poses ----
    fbx.updateMatrixWorld(true); av.updateMatrixWorld(true);
    // Mixamo's rest pose is a T-pose; if our rig rests in an A-pose (arms down at an angle), straighten the upper
    // arms to horizontal first, otherwise every arm motion would come out that much too low
    const restInfo = {};
    for (const [up, lo, sign] of (targetIsMixamo ? [['LeftArm', 'LeftForeArm', 1], ['RightArm', 'RightForeArm', -1]] : [['UpperArmL', 'LowerArmL', 1], ['UpperArmR', 'LowerArmR', -1]])){
      const U = ours[up], L = ours[lo]; if (!U || !L) continue;
      const a = U.getWorldPosition(new T.Vector3()), b = L.getWorldPosition(new T.Vector3()), dir = b.sub(a).normalize();
      const sx = Math.sign(dir.x) || sign, want = new T.Vector3(sx, 0, 0);
      restInfo[up] = +(Math.asin(-dir.y) * 180 / Math.PI).toFixed(1);
      const fix = new T.Quaternion().setFromUnitVectors(dir, want);
      const wq = U.getWorldQuaternion(new T.Quaternion()), pq = U.parent.getWorldQuaternion(new T.Quaternion());
      U.quaternion.copy(pq.invert().multiply(fix.multiply(wq))); U.updateMatrixWorld(true);
    }
    av.updateMatrixWorld(true);
    const Wm0 = {}, Wq0 = {}, restQ = {};
    for (const [m, o] of pairs){ Wm0[m] = mix[m].getWorldQuaternion(new T.Quaternion()); Wq0[o] = ours[o].getWorldQuaternion(new T.Quaternion()); }
    av.traverse(o => { if (o.isBone) restQ[o.name] = o.quaternion.clone(); });
    const mixHips0 = mix.Hips.getWorldPosition(new T.Vector3()).clone();
    const ourHipsRest = ours.Hips.position.clone(); const ourHipsY = ours.Hips.getWorldPosition(new T.Vector3()).y;
    // cm of the Mixamo rig -> our units, by the hips' height above the floor. A model that floats above its origin
    // inside its file (a Sketchfab export may sit more than a metre up) must not count that gap as leg length.
    const toeY = Math.min(...['LeftToeBase', 'RightToeBase', 'LeftFoot', 'RightFoot', 'FootL', 'FootR'].filter(n => ours[n]).map(n => ours[n].getWorldPosition(new T.Vector3()).y));
    const floorY = toeY - 0.03 * (ourHipsY - toeY);
    const k = (floorY > 0.15 * ourHipsY ? ourHipsY - floorY : ourHipsY) / mixHips0.y;
    // our bones in parent-first order, mapped only
    const sane = o => o.name.replace(/^mixamorig:?/, '').replace(/_\d+$/, '').replace(/\./g, '');
    const order = []; av.traverse(o => { if (o.isBone && pairs.some(([m, oo]) => oo === sane(o))) order.push(sane(o)); });
    const inv = {}; for (const [m, o] of pairs) inv[o] = m;
    // ---- animation ----
    const clip = fbx.animations.find(c => c.duration > 0.5) || fbx.animations[0];
    const mixer = new T.AnimationMixer(fbx); const action = mixer.clipAction(clip); action.play();
    const fps = 30, N = Math.round(clip.duration * fps);
    const bones = {}; order.forEach(n => bones[n] = []); const hips = []; const poses = []; const hipsY = [];
    const q1 = new T.Quaternion(), q2 = new T.Quaternion(), v = new T.Vector3();
    const Q = targetIsMixamo ? {UpperArmL:'LeftArm', LowerArmL:'LeftForeArm', WristL:'LeftHand', UpperArmR:'RightArm', LowerArmR:'RightForeArm', WristR:'RightHand', UpperLegL:'LeftUpLeg', LowerLegL:'LeftLeg', FootL:'LeftFoot', UpperLegR:'RightUpLeg', LowerLegR:'RightLeg', FootR:'RightFoot'} : {};
    const N_ = n => Q[n] || n;
    const SEGS = {rUpper:['UpperArmL','LowerArmL'], rFore:['LowerArmL','WristL'], lUpper:['UpperArmR','LowerArmR'], lFore:['LowerArmR','WristR'],
                  rThigh:['UpperLegL','LowerLegL'], rShin:['LowerLegL','FootL'], lThigh:['UpperLegR','LowerLegR'], lShin:['LowerLegR','FootR']};
    for (const k in SEGS) SEGS[k] = SEGS[k].map(N_);
    const wp = n => ours[n].getWorldPosition(new T.Vector3());
    // feet that are not children of the shin (this rig): remember the shin length so they can be placed at its end
    const isDesc = (c, b) => { for (let x = c.parent; x; x = x.parent) if (x === b) return true; return false; };
    const loose = {};
    for (const [leg, foot] of [['LowerLegL', 'FootL'], ['LowerLegR', 'FootR']].map(a => a.map(N_))){
      const f = ours[foot], l = ours[leg];
      if (f && l && !isDesc(f, l)){ const lp = f.parent.worldToLocal(l.getWorldPosition(new T.Vector3())); loose[foot] = {leg: l, len: lp.distanceTo(f.position), rest: f.position.clone()}; }
    }
    const placeFeet = () => { for (const foot in loose){ const L = loose[foot], f = ours[foot]; L.leg.updateMatrixWorld(true);
      const start = L.leg.getWorldPosition(new T.Vector3()), dirW = new T.Vector3(0, 1, 0).applyQuaternion(L.leg.getWorldQuaternion(new T.Quaternion()));
      const p0 = f.parent.worldToLocal(start.clone()), p1 = f.parent.worldToLocal(start.clone().add(dirW));
      f.position.copy(p0.add(p1.sub(p0).normalize().multiplyScalar(L.len))); f.updateMatrixWorld(true); } };
    console.log('loose feet:', Object.keys(loose).join(',') || 'none');
    for (let f = 0; f < N; f++){
      const t = f / fps; mixer.setTime(t); fbx.updateMatrixWorld(true);
      av.traverse(o => { if (o.isBone) o.quaternion.copy(restQ[o.name]); });
      ours.Hips.position.copy(ourHipsRest); av.updateMatrixWorld(true);
      for (const n of order){
        const m = inv[n], mb = mix[m], ob = ours[n];
        mb.getWorldQuaternion(q1); const delta = q1.clone().multiply(Wm0[m].clone().invert());
        const target = delta.multiply(Wq0[n]);
        ob.parent.getWorldQuaternion(q2); ob.quaternion.copy(q2.invert().multiply(target)); ob.updateMatrixWorld(true);
        const q = ob.quaternion; bones[n].push(+q.x.toFixed(4), +q.y.toFixed(4), +q.z.toFixed(4), +q.w.toFixed(4));
      }
      mix.Hips.getWorldPosition(v); const off = v.sub(mixHips0).multiplyScalar(k);
      ours.Hips.position.copy(ourHipsRest).add(off); av.updateMatrixWorld(true); placeFeet(); av.updateMatrixWorld(true);
      hips.push(+off.x.toFixed(4), +off.y.toFixed(4), +off.z.toFixed(4)); hipsY.push(off.y);
      // 2D pose for scoring and the capsule coach: screen x = world x, y up
      const a = {};
      for (const [k2, [s0, s1]] of Object.entries(SEGS)){ const A = wp(s0), B = wp(s1); a[k2] = +(Math.atan2(B.y - A.y, B.x - A.x) * 180 / Math.PI).toFixed(1); }
      const hc = wp(N_('UpperLegL')).add(wp(N_('UpperLegR'))).multiplyScalar(0.5), sc = wp(N_('UpperArmL')).add(wp(N_('UpperArmR'))).multiplyScalar(0.5);
      a.lean = +((90 - Math.atan2(sc.y - hc.y, sc.x - hc.x) * 180 / Math.PI)).toFixed(1);
      a.sx = +hc.x.toFixed(3);
      const kneeAng = (hp, kn, an) => { const u = hp.clone().sub(kn).normalize(), w = an.clone().sub(kn).normalize(); return Math.acos(Math.max(-1, Math.min(1, u.dot(w)))) * 180 / Math.PI; };
      const ka = Math.min(kneeAng(wp(N_('UpperLegL')), wp(N_('LowerLegL')), wp(N_('FootL'))), kneeAng(wp(N_('UpperLegR')), wp(N_('LowerLegR')), wp(N_('FootR'))));
      a.drop = +Math.max(0, Math.min(1, (175 - ka) / 70)).toFixed(2);
      // 3D cues for the spoken descriptions: hands relative to their shoulder (x screen right, y up, z toward the
      // camera) in arm lengths; knee lift (0 hanging, 1 horizontal); hips drop in leg lengths
      const rel = (sh, el, wr) => { const Sh = wp(sh), El = wp(el), Wr = wp(wr); const L = Sh.distanceTo(El) + El.distanceTo(Wr); const d = Wr.sub(Sh).divideScalar(L); return [+d.x.toFixed(2), +d.y.toFixed(2), +d.z.toFixed(2)]; };
      a.h = [...rel(N_('UpperArmL'), N_('LowerArmL'), N_('WristL')), ...rel(N_('UpperArmR'), N_('LowerArmR'), N_('WristR'))];
      const lift = (hp, kn) => { const Hp = wp(hp), Kn = wp(kn); return +Math.max(0, Math.min(1.5, (Kn.y - Hp.y) / Hp.distanceTo(Kn) + 1)).toFixed(2); };
      a.kl = [lift(N_('UpperLegL'), N_('LowerLegL')), lift(N_('UpperLegR'), N_('LowerLegR'))];
      if (f === 0) var legLen = wp(N_('UpperLegL')).distanceTo(wp(N_('LowerLegL'))) + wp(N_('LowerLegL')).distanceTo(wp(N_('FootL')));
      a.hy = +(off.y / legLen).toFixed(2);
      poses.push(a);
    }
    // ---- tempo from the hips bounce (and from overall motion energy) ----
    const sig = hipsY.map((y, i) => y - hipsY.reduce((s, x) => s + x, 0) / hipsY.length);
    let best = {bpm: 0, score: -1};
    for (let lag = Math.round(fps * 60 / 170); lag <= Math.round(fps * 60 / 60); lag++){
      let s = 0, n = 0; for (let i = 0; i + lag < sig.length; i++){ s += sig[i] * sig[i + lag]; n++; }
      const bpm = 60 * fps / lag, sc = s / n * (bpm > 85 && bpm < 130 ? 1.3 : 1);
      if (sc > best.score) best = {bpm: +bpm.toFixed(1), score: sc};
    }
    // ---- render a strip of frames for a look ----
    const canvas = document.getElementById('c'); const r = new T.WebGLRenderer({canvas, antialias: true}); r.setPixelRatio(1); r.setSize(1600, 420, false); r.outputEncoding = T.sRGBEncoding; r.setScissorTest(true);
    const sc = new T.Scene(); sc.background = new T.Color('#1b1f26'); sc.add(av);
    av.traverse(o => { if (o.isMesh){ o.frustumCulled = false; } });
    sc.add(new T.HemisphereLight(0xdfe8ff, 0x20242c, 0.9)); const key = new T.DirectionalLight(0xffffff, 1.3); key.position.set(-2, 4, 3); sc.add(key);
    const frames = 8;
    for (let i = 0; i < frames; i++){
      const f = Math.floor(i * N / frames);
      av.traverse(o => { const nm = sane(o); if (o.isBone && bones[nm]) o.quaternion.set(bones[nm][f*4], bones[nm][f*4+1], bones[nm][f*4+2], bones[nm][f*4+3]); });
      ours.Hips.position.copy(ourHipsRest).add(new T.Vector3(hips[f*3], hips[f*3+1], hips[f*3+2])); av.updateMatrixWorld(true); placeFeet(); av.updateMatrixWorld(true);
      const cam = new T.PerspectiveCamera(30, 200/420, 0.1, 50); cam.position.set(0.6, 1.1, 5.2); cam.lookAt(0, 0.95, 0);
      r.setViewport(i*200, 0, 200, 420); r.setScissor(i*200, 0, 200, 420); r.render(sc, cam);
    }
    return {name: clip.name, duration: clip.duration, fps, frames: N, bpm: best.bpm, mapped: pairs.length, restArmDown: restInfo, unmapped: Object.keys(mix).filter(m => !MAP[m]).slice(0, 12), bones, hips, poses};
  }, [fbx64, glb64]);
  await p.screenshot({path: outPng, clip: {x: 0, y: 0, width: 1600, height: 420}});
  const {bones, hips, poses, ...meta} = result;
  fs.writeFileSync(outJson, JSON.stringify({...meta, bones, hips, poses}));
  console.log(JSON.stringify(meta), 'json KB', Math.round(fs.statSync(outJson).size / 1024));
  await b.close();
})();
