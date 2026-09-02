/* Tests voor georeference.js — puur Node, geen framework/dependency.
   Uitvoeren: node georeference.test.js */
const assert = require('assert');
const G = require('./georeference.js');

let pass=0, fail=0;
function test(name, fn){
  try{ fn(); pass++; }
  catch(e){ fail++; console.error(`FAIL: ${name}\n  ${e.message}`); }
}
function close(a,b,eps){ eps = eps===undefined?1e-6:eps; assert.ok(Math.abs(a-b)<eps, `${a} !~= ${b} (verschil ${Math.abs(a-b)})`); }

/* ── fitAffine / worldToRD / rdToWorld: axis-aligned, geen rotatie ──
   50 wereld-px/m, wereld-Y omlaag ↔ RD-Y (noord) omhoog. */
const rectWorld = [{x:0,y:0}, {x:500,y:0}, {x:500,y:-300}, {x:0,y:-300}];
const rectRD_noRot = [
  {rdX:121000.00, rdY:487000.00},
  {rdX:121010.00, rdY:487000.00},
  {rdX:121010.00, rdY:487006.00},
  {rdX:121000.00, rdY:487006.00},
];
const pts_noRot = rectWorld.map((w,i)=>({x:w.x, y:w.y, rdX:rectRD_noRot[i].rdX, rdY:rectRD_noRot[i].rdY}));

test('fitAffine: 4 bekende RD-punten zonder rotatie geeft de exacte transformatie', ()=>{
  const t = G.fitAffine(pts_noRot);
  close(t.a, 0.02, 1e-9); close(t.b, 0, 1e-9); close(t.c, 121000, 1e-6);
  close(t.d, 0, 1e-9); close(t.e, -0.02, 1e-9); close(t.f, 487000, 1e-6);
});
test('worldToRD/rdToWorld: round-trip op alle 4 referentiepunten binnen enkele centimeters', ()=>{
  const t = G.fitAffine(pts_noRot);
  pts_noRot.forEach(p=>{
    const rd = G.worldToRD(t, p.x, p.y);
    close(rd.x, p.rdX, 0.03); close(rd.y, p.rdY, 0.03);
    const w = G.rdToWorld(t, rd.x, rd.y);
    close(w.x, p.x, 0.01); close(w.y, p.y, 0.01);
  });
});
test('residuals: exacte data geeft RMS ~0', ()=>{
  const t = G.fitAffine(pts_noRot);
  const r = G.residuals(pts_noRot, t);
  assert.ok(r.rms < 1e-6, `rms te groot: ${r.rms}`);
  assert.strictEqual(r.perPoint.length, 4);
});
test('scaleAndRotation: onveranderde oriëntatie geeft schaal 50 en rotatie 0°', ()=>{
  const t = G.fitAffine(pts_noRot);
  const sr = G.scaleAndRotation(t);
  close(sr.unitsPerMeter, 50, 0.05);
  close(sr.metersPerUnit, 0.02, 0.00005);
  close(sr.rotationDeg, 0, 0.1);
});

/* ── fitAffine met een gedraaide tekening (30° t.o.v. RD-noorden) ── */
const ang = 30 * Math.PI/180;
const mpu = 0.02; // meters per wereld-eenheid (50 units/m)
const tTrue = {
  a: mpu*Math.sin(ang+Math.PI/2), b: -mpu*Math.sin(ang),
  d: mpu*Math.cos(ang+Math.PI/2), e: -mpu*Math.cos(ang),
  c: 121000, f: 487000,
};
const pts_rot = rectWorld.map(w=>{
  const rd = G.worldToRD(tTrue, w.x, w.y);
  // simuleer handmatige invoer met 2 decimalen (centimeter-afronding)
  return {x:w.x, y:w.y, rdX:Math.round(rd.x*100)/100, rdY:Math.round(rd.y*100)/100};
});

test('fitAffine: 4 bekende RD-punten MET rotatie — resultaat binnen enkele centimeters', ()=>{
  const t = G.fitAffine(pts_rot);
  pts_rot.forEach(p=>{
    const rd = G.worldToRD(t, p.x, p.y);
    close(rd.x, p.rdX, 0.03);
    close(rd.y, p.rdY, 0.03);
  });
  const r = G.residuals(pts_rot, t);
  assert.ok(r.rms < 0.03, `rms te groot voor 2-decimalen-afronding: ${r.rms}`);
});
test('scaleAndRotation: herkent 30° rotatie en 50 units/m schaal uit de fit', ()=>{
  const t = G.fitAffine(pts_rot);
  const sr = G.scaleAndRotation(t);
  close(sr.unitsPerMeter, 50, 0.1);
  close(sr.rotationDeg, 30, 0.5);
});

/* ── fitAffine: te weinig punten / collineaire wereldpunten ── */
test('fitAffine: minder dan 3 punten gooit een fout', ()=>{
  assert.throws(()=> G.fitAffine([{x:0,y:0,rdX:0,rdY:0},{x:1,y:0,rdX:1,rdY:0}]));
});
test('fitAffine: collineaire wereldpunten (singuliere normaalmatrix) gooit een fout', ()=>{
  const collinear = [
    {x:0,y:0,rdX:100000,rdY:400000},
    {x:100,y:0,rdX:100010,rdY:400000},
    {x:200,y:0,rdX:100020,rdY:400000},
    {x:300,y:0,rdX:100030,rdY:400000},
  ];
  assert.throws(()=> G.fitAffine(collinear));
});

/* ── quality: spreiding van de referentiepunten ── */
test('quality: goed gespreide punten geven geen waarschuwingen', ()=>{
  const q = G.quality(rectRD_noRot);
  assert.strictEqual(q.collinear, false);
  assert.strictEqual(q.tooClose, false);
  assert.strictEqual(q.warnings.length, 0);
});
test('quality: (bijna) collineaire RD-punten worden gesignaleerd', ()=>{
  const collinearRD = [
    {rdX:100000, rdY:400000}, {rdX:100010, rdY:400000},
    {rdX:100020, rdY:400000}, {rdX:100030, rdY:400000.001},
  ];
  const q = G.quality(collinearRD);
  assert.strictEqual(q.collinear, true);
  assert.ok(q.warnings.length>=1);
});
test('quality: te dicht bij elkaar liggende punten worden gesignaleerd', ()=>{
  const close4 = [
    {rdX:100000.00, rdY:400000.00}, {rdX:100000.30, rdY:400000.00},
    {rdX:100010.00, rdY:400010.00}, {rdX:100000.00, rdY:400010.30},
  ];
  const q = G.quality(close4);
  assert.strictEqual(q.tooClose, true);
});

/* ── validateRD: RD-bereik ── */
test('validateRD: geldig punt binnen heel Nederland', ()=>{
  assert.strictEqual(G.validateRD(121000, 487000).valid, true);
});
test('validateRD: X buiten bereik (negatief) is ongeldig', ()=>{
  const r = G.validateRD(-5000, 487000);
  assert.strictEqual(r.valid, false);
  assert.ok(r.errors.length>=1);
});
test('validateRD: Y buiten bereik (te laag) is ongeldig', ()=>{
  assert.strictEqual(G.validateRD(121000, 250000).valid, false);
});
test('validateRD: X buiten bereik (te hoog) is ongeldig', ()=>{
  assert.strictEqual(G.validateRD(350000, 487000).valid, false);
});
test('validateRD: grenswaarden zijn inclusief geldig', ()=>{
  assert.strictEqual(G.validateRD(0, 300000).valid, true);
  assert.strictEqual(G.validateRD(300000, 650000).valid, true);
});

console.log(`\n${pass} geslaagd, ${fail} gefaald.`);
if(fail>0) process.exit(1);
