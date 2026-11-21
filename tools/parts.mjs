// Turns an open 3D model into an explodable Library hologram: geometry only, one node per part.
//
// Many source files fuse a whole spacecraft into one mesh, or split it into hundreds of tiny ones.
// Either way explode reads badly. This tool:
//   1. drops textures and materials (the hologram ignores them; it also removes logos),
//   2. bakes every mesh into world space,
//   3. picks units: the source's own mesh nodes when there are at least 8, else the separate
//      shells (connected pieces) inside its meshes,
//   4. groups units into K parts by position (k-means), so each part is a physical region,
//   5. simplifies to a triangle budget, welds, quantizes and meshopt-compresses.
// Parts come out as nodes p01..pK, numbered by height then size, ready for a names map.
//
// Usage: node tools/parts.mjs <in.glb> <out.glb> [--k 14] [--tris 120000] [--nodes] [--split]
//   --nodes  always group the source's mesh nodes;  --split  always split into shells
//   --solo f  any unit at least f x the largest unit's size gets a part of its own (frames, chassis)
//   --up z   the source is z-up (rotates it to y-up)

import { NodeIO, Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dequantize, weld, simplify, quantize, meshopt, prune, dedup } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import draco3d from 'draco3dgltf';

const args = process.argv.slice(2);
const [input, output] = args;
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i < 0 ? d : args[i + 1]; };
const K = Number(opt('k', 14));
const BUDGET = Number(opt('tris', 120000));
const FORCE_NODES = args.includes('--nodes');
const FORCE_SPLIT = args.includes('--split');
const SOLO = args.includes('--solo') ? Number(args[args.indexOf('--solo') + 1]) : 0;
const UP = opt('up', 'y');

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
  'meshopt.encoder': MeshoptEncoder,
});

const src = await io.read(input);
await src.transform(dequantize());
const root = src.getRoot();

// ---------- 1-2. world-space triangles per mesh node ----------
const mul = (m, x, y, z) => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
const meshNodes = root.listNodes().filter((n) => n.getMesh());
const nodeUnits = [];
for (const node of meshNodes) {
  const m = node.getWorldMatrix();
  const pos = [];
  for (const prim of node.getMesh().listPrimitives()) {
    if (prim.getMode() !== 4) continue; // triangles only
    const P = prim.getAttribute('POSITION');
    if (!P) continue;
    const idx = prim.getIndices();
    const n = idx ? idx.getCount() : P.getCount();
    const v = [0, 0, 0];
    for (let i = 0; i < n; i++) {
      P.getElement(idx ? idx.getScalar(i) : i, v);
      let [x, y, z] = mul(m, v[0], v[1], v[2]);
      if (UP === 'z') [y, z] = [z, -y];
      pos.push(x, y, z);
    }
  }
  if (pos.length) nodeUnits.push({ name: node.getName(), pos: Float32Array.from(pos) });
}

// ---------- 3. units: nodes, or the separate shells inside them ----------
function shells(pos) {
  // Weld by position, then union-find over triangles.
  const key = new Map(); const vid = new Int32Array(pos.length / 3);
  let bb = [Infinity, -Infinity];
  for (let i = 0; i < pos.length; i++) { bb[0] = Math.min(bb[0], pos[i]); bb[1] = Math.max(bb[1], pos[i]); }
  const q = (bb[1] - bb[0]) * 1e-5 || 1e-6;
  for (let i = 0; i < vid.length; i++) {
    const k = `${Math.round(pos[i * 3] / q)},${Math.round(pos[i * 3 + 1] / q)},${Math.round(pos[i * 3 + 2] / q)}`;
    let id = key.get(k); if (id === undefined) { id = key.size; key.set(k, id); } vid[i] = id;
  }
  const parent = new Int32Array(key.size).map((_, i) => i);
  const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  for (let t = 0; t < vid.length; t += 3) { const a = find(vid[t]), b = find(vid[t + 1]), c = find(vid[t + 2]); parent[b] = a; parent[c] = a; }
  const groups = new Map();
  for (let t = 0; t < vid.length; t += 3) {
    const r = find(vid[t]); let g = groups.get(r); if (!g) { g = []; groups.set(r, g); }
    for (let k = 0; k < 9; k++) g.push(pos[t * 3 + k]);
  }
  return [...groups.values()].map((g) => Float32Array.from(g));
}

let units;
const useNodes = FORCE_NODES || (!FORCE_SPLIT && nodeUnits.length >= 8);
if (useNodes) units = nodeUnits;
else units = nodeUnits.flatMap((u) => shells(u.pos).map((pos) => ({ name: u.name, pos })));

// Stats per unit: centre, size, triangle count.
for (const u of units) {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < u.pos.length; i += 3) for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], u.pos[i + a]); mx[a] = Math.max(mx[a], u.pos[i + a]); }
  u.c = [0, 1, 2].map((a) => (mn[a] + mx[a]) / 2);
  u.size = Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]);
  u.tris = u.pos.length / 9;
}

// Big shells that share a centre with what they hold (a frame round an engine) never separate
// under k-means, so --solo gives each of them its own part first.
const maxSize = Math.max(...units.map((u) => u.size));
const solo = SOLO ? units.filter((u) => u.size >= SOLO * maxSize) : [];
const allUnits = units;
units = units.filter((u) => !solo.includes(u));

// ---------- 4. k-means on unit centres, weighted by size ----------
const k = Math.min(K - solo.length, units.length);
const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
const bySize = [...units].sort((a, b) => b.size - a.size);
const centres = [bySize[0].c.slice()];
while (centres.length < k) {
  let best = null, bd = -1;
  for (const u of units) { const d = Math.min(...centres.map((c) => d2(c, u.c))) * Math.sqrt(u.size + 1e-9); if (d > bd) { bd = d; best = u; } }
  centres.push(best.c.slice());
}
let assign = new Array(units.length).fill(0);
for (let it = 0; it < 12; it++) {
  assign = units.map((u) => { let b = 0, bd = Infinity; centres.forEach((c, j) => { const d = d2(c, u.c); if (d < bd) { bd = d; b = j; } }); return b; });
  centres.forEach((c, j) => {
    let w = 0; const s = [0, 0, 0];
    units.forEach((u, i) => { if (assign[i] === j) { const ww = u.size + 1e-9; w += ww; for (let a = 0; a < 3; a++) s[a] += u.c[a] * ww; } });
    if (w) for (let a = 0; a < 3; a++) c[a] = s[a] / w;
  });
}
let parts = centres.map((c, j) => ({ units: units.filter((_, i) => assign[i] === j) })).filter((p) => p.units.length);
for (const u of solo) parts.push({ units: [u] });
units = allUnits;
for (const p of parts) {
  p.tris = p.units.reduce((a, u) => a + u.tris, 0);
  p.y = p.units.reduce((a, u) => a + u.c[1] * u.size, 0) / p.units.reduce((a, u) => a + u.size, 1e-9);
  p.size = Math.max(...p.units.map((u) => u.size));
  const counts = new Map(); for (const u of p.units) counts.set(u.name, (counts.get(u.name) || 0) + u.tris);
  p.source = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n]) => n);
}
// Drop specks (under 0.2% of the triangles) into their nearest part.
const total = parts.reduce((a, p) => a + p.tris, 0);
parts.sort((a, b) => b.y - a.y || b.size - a.size);

// ---------- 5. write one node per part, then simplify and compress ----------
const doc = new Document();
const buf = doc.createBuffer();
const scene = doc.createScene('scene');
const mat = doc.createMaterial('holo');
parts.forEach((p, i) => {
  const n = p.units.reduce((a, u) => a + u.pos.length, 0);
  const arr = new Float32Array(n); let o = 0;
  for (const u of p.units) { arr.set(u.pos, o); o += u.pos.length; }
  const acc = doc.createAccessor().setType('VEC3').setArray(arr).setBuffer(buf);
  const prim = doc.createPrimitive().setAttribute('POSITION', acc).setMaterial(mat);
  const id = `p${String(i + 1).padStart(2, '0')}`;
  const mesh = doc.createMesh(id).addPrimitive(prim);
  scene.addChild(doc.createNode(id).setMesh(mesh));
});
const ratio = Math.min(1, BUDGET / total);
const steps = [weld()];
if (ratio < 0.98) steps.push(simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.004 }));
steps.push(dedup(), prune(), quantize(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
await doc.transform(...steps);
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
await io.write(output, doc);

let after = 0; for (const m of doc.getRoot().listMeshes()) for (const pr of m.listPrimitives()) after += (pr.getIndices()?.getCount() ?? 0) / 3;
console.log(JSON.stringify({ file: output.split('/').pop(), mode: useNodes ? 'nodes' : 'shells', sourceMeshes: nodeUnits.length, units: units.length, parts: parts.length, trisIn: total, trisOut: Math.round(after),
  parts: parts.map((p, i) => `p${String(i + 1).padStart(2, '0')}:${p.units.length}u:${p.source.join('/').slice(0, 40)}`) }));
