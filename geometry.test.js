/* Tests voor geometry.js — puur Node, geen framework/dependency.
   Uitvoeren: node geometry.test.js */
const assert = require('assert');
const G = require('./geometry.js');

let pass=0, fail=0;
function test(name, fn){
  try{ fn(); pass++; }
  catch(e){ fail++; console.error(`FAIL: ${name}\n  ${e.message}`); }
}
function close(a,b,eps){ eps = eps===undefined?1e-6:eps; assert.ok(Math.abs(a-b)<eps, `${a} !~= ${b}`); }

/* ── segSeg ── */
test('segSeg: loodrechte kruising op middenpunt', ()=>{
  const p = G.segSeg({x:0,y:0},{x:10,y:0},{x:5,y:-5},{x:5,y:5});
  assert.ok(p); close(p.x,5); close(p.y,0); close(p.t,0.5); close(p.u,0.5);
});
test('segSeg: parallelle lijnen geven null', ()=>{
  const p = G.segSeg({x:0,y:0},{x:10,y:0},{x:0,y:5},{x:10,y:5});
  assert.strictEqual(p, null);
});
test('segSeg: geen snijpunt binnen de segmentgrenzen (zonder extend)', ()=>{
  const p = G.segSeg({x:0,y:0},{x:1,y:0},{x:5,y:-5},{x:5,y:5});
  assert.strictEqual(p, null);
});
test('segSeg: met extend1 vindt het snijpunt buiten segment 1', ()=>{
  const p = G.segSeg({x:0,y:0},{x:1,y:0},{x:5,y:-5},{x:5,y:5}, true, false);
  assert.ok(p); close(p.x,5); close(p.y,0); close(p.t,5);
});
test('segSeg: T-splitsing (raakpunt op eindpunt)', ()=>{
  const p = G.segSeg({x:0,y:0},{x:10,y:0},{x:10,y:0},{x:10,y:10});
  assert.ok(p); close(p.t,1); close(p.u,0);
});

/* ── segEllipse / segCircle ── */
test('segCircle: lijn door het midden van een cirkel geeft 2 punten', ()=>{
  const pts = G.segCircle({x:-10,y:0},{x:10,y:0}, 0,0,5);
  assert.strictEqual(pts.length, 2);
  const xs = pts.map(p=>p.x).sort((a,b)=>a-b);
  close(xs[0],-5); close(xs[1],5);
});
test('segCircle: lijn die de cirkel mist geeft 0 punten', ()=>{
  const pts = G.segCircle({x:-10,y:10},{x:10,y:10}, 0,0,5);
  assert.strictEqual(pts.length, 0);
});
test('segCircle: raaklijn geeft 1 punt', ()=>{
  const pts = G.segCircle({x:-10,y:5},{x:10,y:5}, 0,0,5);
  assert.strictEqual(pts.length, 1);
  close(pts[0].x, 0); close(pts[0].y, 5);
});
test('segCircle: buiten segment zonder extend geeft niets, met extend wel', ()=>{
  const noExt = G.segCircle({x:-10,y:0},{x:-6,y:0}, 0,0,5);
  assert.strictEqual(noExt.length, 0);
  const ext = G.segCircle({x:-10,y:0},{x:-6,y:0}, 0,0,5, true);
  assert.strictEqual(ext.length, 2);
});
test('segEllipse: niet-cirkelvormige ellips (rx != ry)', ()=>{
  const pts = G.segEllipse({x:-20,y:0},{x:20,y:0}, 0,0, 10, 4);
  assert.strictEqual(pts.length, 2);
  const xs = pts.map(p=>p.x).sort((a,b)=>a-b);
  close(xs[0],-10); close(xs[1],10);
});

/* ── circleCircle ── */
test('circleCircle: twee overlappende cirkels geven 2 punten', ()=>{
  const pts = G.circleCircle(0,0,5, 6,0,5);
  assert.strictEqual(pts.length, 2);
  pts.forEach(p=>{
    close(Math.hypot(p.x-0,p.y-0),5,1e-4);
    close(Math.hypot(p.x-6,p.y-0),5,1e-4);
  });
});
test('circleCircle: disjuncte cirkels geven 0 punten', ()=>{
  assert.strictEqual(G.circleCircle(0,0,5, 100,0,5).length, 0);
});
test('circleCircle: rakende cirkels geven 1 punt', ()=>{
  const pts = G.circleCircle(0,0,5, 10,0,5);
  assert.strictEqual(pts.length, 1);
  close(pts[0].x,5); close(pts[0].y,0);
});
test('circleCircle: concentrische cirkels geven niets (geen zinvol snijpunt)', ()=>{
  assert.strictEqual(G.circleCircle(0,0,5, 0,0,8).length, 0);
});

/* ── paramOnSeg / angleOnEllipse ── */
test('paramOnSeg: midden geeft t=0.5, voorbij eindpunt geeft t>1', ()=>{
  close(G.paramOnSeg({x:5,y:0},{x:0,y:0},{x:10,y:0}), 0.5);
  close(G.paramOnSeg({x:15,y:0},{x:0,y:0},{x:10,y:0}), 1.5);
});
test('angleOnEllipse: oost=0, zuid(canvas-down)=π/2', ()=>{
  close(G.angleOnEllipse({x:5,y:0},0,0,5,5), 0);
  close(G.angleOnEllipse({x:0,y:5},0,0,5,5), Math.PI/2);
});

/* ── bracketLinear (segment-trim: welk stuk verdwijnt rond het klikpunt) ── */
test('bracketLinear: klik tussen twee snijpunten geeft beide bracket-waarden', ()=>{
  const b = G.bracketLinear(0.5, [0.2,0.2,0.8]); // dubbele 0.2 mag geen probleem zijn
  close(b.lo,0.2); close(b.hi,0.8);
});
test('bracketLinear: klik vóór het eerste snijpunt geeft alleen hi (inkorten vanaf start)', ()=>{
  const b = G.bracketLinear(0.1, [0.4,0.8]);
  assert.strictEqual(b.lo, undefined); close(b.hi,0.4);
});
test('bracketLinear: klik ná het laatste snijpunt geeft alleen lo (inkorten vanaf einde)', ()=>{
  const b = G.bracketLinear(0.9, [0.2,0.6]);
  close(b.lo,0.6); assert.strictEqual(b.hi, undefined);
});
test('bracketLinear: geen snijpunten geeft niets', ()=>{
  const b = G.bracketLinear(0.5, []);
  assert.strictEqual(b.lo, undefined); assert.strictEqual(b.hi, undefined);
});

/* ── bracketCircular (cirkel-trim: welke boog verdwijnt) ── */
test('bracketCircular: 2 snijpunten, klik ertussen (korte kant)', ()=>{
  const b = G.bracketCircular(Math.PI/2, [0, Math.PI]); // klik op π/2, snijpunten op 0 en π
  close(b.lo,0); close(b.hi,Math.PI);
});
test('bracketCircular: klik aan de andere kant vindt het andere paar (wrap-around)', ()=>{
  const b = G.bracketCircular(Math.PI*1.5, [0, Math.PI]);
  close(b.lo,Math.PI); close(b.hiAdj, Math.PI*2);
});
test('bracketCircular: minder dan 2 snijpunten geeft null', ()=>{
  assert.strictEqual(G.bracketCircular(0, [1.2]), null);
  assert.strictEqual(G.bracketCircular(0, []), null);
});
test('bracketCircular: 3 snijpunten kiest het juiste omsluitende paar', ()=>{
  const b = G.bracketCircular(1.0, [0, 0.5, 2.0]);
  close(b.lo,0.5); close(b.hi,2.0);
});

/* ── angleInRange ── */
test('angleInRange: eenvoudige boog zonder wrap', ()=>{
  assert.ok(G.angleInRange(1.0, 0.5, 1.0)); // span 0.5..1.5
  assert.ok(!G.angleInRange(2.0, 0.5, 1.0));
});
test('angleInRange: boog die over 0/2π heen wrapt', ()=>{
  assert.ok(G.angleInRange(0.1, Math.PI*1.8, Math.PI*0.6)); // van 1.8π tot 2.4π(=0.4π)
  assert.ok(!G.angleInRange(Math.PI, Math.PI*1.8, Math.PI*0.6));
});

console.log(`\n${pass} geslaagd, ${fail} gefaald.`);
if(fail>0) process.exit(1);
