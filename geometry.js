/* ═════════════════════════════════════════════════════════════════
   PTGeom — pure, DOM-vrije geometrie-module voor de TRIM-tool.
   Geen canvas/DOM/S-state hier: alleen punten, segmenten, ellipsen en
   parameter-wiskunde. Los te testen (zie geometry.test.js) en los te
   hergebruiken door de UI-laag in index.html.
   ═════════════════════════════════════════════════════════════════ */
(function(root){
  const EPS = 1e-7;
  const TWO_PI = Math.PI*2;

  function normAngle(a){
    a = a % TWO_PI;
    if(a<0) a += TWO_PI;
    return a;
  }

  /* is hoek a onderdeel van de boog [a0, a0+span] (span>0, mag >2π zijn) */
  function angleInRange(a, a0, span){
    const d = normAngle(a - a0);
    return d <= span + EPS || d >= TWO_PI - EPS;
  }

  /* parameter t van punt pt geprojecteerd op lijn p1->p2 (t=0 bij p1, t=1 bij p2) */
  function paramOnSeg(pt, p1, p2){
    const dx=p2.x-p1.x, dy=p2.y-p1.y;
    const L2=dx*dx+dy*dy;
    if(L2<EPS) return 0;
    return ((pt.x-p1.x)*dx + (pt.y-p1.y)*dy)/L2;
  }

  function pointAtParam(p1, p2, t){
    return {x:p1.x+(p2.x-p1.x)*t, y:p1.y+(p2.y-p1.y)*t};
  }

  function angleOnEllipse(pt, cx, cy, rx, ry){
    return normAngle(Math.atan2((pt.y-cy)/ry, (pt.x-cx)/rx));
  }

  /* snijpunt van twee lijnstukken p1-p2 en p3-p4.
     extend1/extend2: behandel het betreffende stuk als oneindige lijn (geen t/u-begrenzing). */
  function segSeg(p1, p2, p3, p4, extend1, extend2){
    const dx1=p2.x-p1.x, dy1=p2.y-p1.y;
    const dx2=p4.x-p3.x, dy2=p4.y-p3.y;
    const denom = dx1*dy2 - dy1*dx2;
    if(Math.abs(denom) < EPS) return null; // parallel (of samenvallend — negeren)
    const t = ((p3.x-p1.x)*dy2 - (p3.y-p1.y)*dx2) / denom;
    const u = ((p3.x-p1.x)*dy1 - (p3.y-p1.y)*dx1) / denom;
    if(!extend1 && (t < -EPS || t > 1+EPS)) return null;
    if(!extend2 && (u < -EPS || u > 1+EPS)) return null;
    return {x:p1.x+t*dx1, y:p1.y+t*dy1, t, u};
  }

  /* snijpunt(en) van lijnstuk p1-p2 met ellips (cx,cy,rx,ry).
     extendLine: lijnstuk als oneindige lijn behandelen (t niet begrensd tot [0,1]). */
  function segEllipse(p1, p2, cx, cy, rx, ry, extendLine){
    rx = Math.max(EPS, Math.abs(rx));
    ry = Math.max(EPS, Math.abs(ry));
    // naar cirkel-ruimte (eenheidscirkel) transformeren
    const ax=(p1.x-cx)/rx, ay=(p1.y-cy)/ry;
    const bx=(p2.x-cx)/rx, by=(p2.y-cy)/ry;
    const dx=bx-ax, dy=by-ay;
    const A=dx*dx+dy*dy;
    if(A<EPS) return [];
    const B=2*(ax*dx+ay*dy);
    const C=ax*ax+ay*ay-1;
    const disc=B*B-4*A*C;
    if(disc < -EPS) return [];
    const sq=Math.sqrt(Math.max(0,disc));
    const t1=(-B-sq)/(2*A), t2=(-B+sq)/(2*A);
    const out=[];
    for(const t of (Math.abs(t1-t2)<EPS ? [t1] : [t1,t2])){
      if(!extendLine && (t < -EPS || t > 1+EPS)) continue;
      out.push({...pointAtParam(p1,p2,t), t});
    }
    return out;
  }

  /* backwards-compat helper: lijnstuk vs echte cirkel */
  function segCircle(p1, p2, cx, cy, r, extendLine){
    return segEllipse(p1, p2, cx, cy, r, r, extendLine);
  }

  /* snijpunt(en) van twee echte cirkels (geen algemene ellips-ellips, bewuste scope-keuze) */
  function circleCircle(cx1, cy1, r1, cx2, cy2, r2){
    const dx=cx2-cx1, dy=cy2-cy1;
    const d=Math.hypot(dx,dy);
    if(d < EPS) return []; // concentrisch (samenvallend of geen snijpunt)
    if(d > r1+r2+EPS) return [];
    if(d < Math.abs(r1-r2)-EPS) return [];
    const a=(r1*r1-r2*r2+d*d)/(2*d);
    const h2=r1*r1-a*a;
    const h=Math.sqrt(Math.max(0,h2));
    const mx=cx1+a*dx/d, my=cy1+a*dy/d;
    if(h<EPS) return [{x:mx,y:my}];
    const ox=-dy*(h/d), oy=dx*(h/d);
    return [{x:mx+ox,y:my+oy},{x:mx-ox,y:my-oy}];
  }

  function dedupeSorted(nums, eps){
    eps = eps===undefined?1e-4:eps;
    const s=[...nums].sort((a,b)=>a-b);
    const out=[];
    for(const v of s) if(!out.length || Math.abs(v-out[out.length-1])>eps) out.push(v);
    return out;
  }

  /* zoekt de twee buurwaarden rond clickT binnen een lineair domein (segment: t 0..1).
     Retourneert {lo, hi} — lo/hi zijn undefined als er aan die kant geen snijpunt is. */
  function bracketLinear(clickT, sortedTs){
    let lo, hi;
    for(const t of sortedTs){
      if(t <= clickT + EPS) lo = (lo===undefined || t>lo) ? t : lo;
      if(t >= clickT - EPS) { if(hi===undefined || t<hi) hi = t; }
    }
    if(lo!==undefined && hi!==undefined && Math.abs(lo-hi)<EPS){
      // klik viel praktisch op een snijpunt zelf — behandel als grens, niet als brackets
      if(sortedTs.length===1) return {lo:undefined, hi:undefined};
    }
    return {lo, hi};
  }

  /* zoekt de twee buurhoeken rond clickAngle op een volledige cirkel (circulair domein).
     Vereist ≥2 hoeken; retourneert {lo, hi, hiAdj} waarbij hiAdj = hi (+2π indien nodig) zodat hiAdj>lo. */
  function bracketCircular(clickAngle, sortedAngles){
    const uniq = dedupeSorted(sortedAngles, 1e-4);
    if(uniq.length < 2) return null;
    const n=uniq.length;
    const c = normAngle(clickAngle);
    for(let i=0;i<n;i++){
      const a=uniq[i], b=uniq[(i+1)%n];
      const bAdj = b>a ? b : b+TWO_PI;
      let cc=c;
      while(cc<a-EPS) cc+=TWO_PI;
      while(cc>=a+TWO_PI-EPS) cc-=TWO_PI;
      if(cc>=a-EPS && cc<=bAdj+EPS) return {lo:a, hi:b, hiAdj:bAdj};
    }
    return {lo:uniq[n-1], hi:uniq[0], hiAdj:uniq[0]+TWO_PI};
  }

  const PTGeom = {
    EPS, TWO_PI, normAngle, angleInRange, paramOnSeg, pointAtParam, angleOnEllipse,
    segSeg, segEllipse, segCircle, circleCircle, dedupeSorted, bracketLinear, bracketCircular,
  };

  if(typeof module !== 'undefined' && module.exports) module.exports = PTGeom;
  else root.PTGeom = PTGeom;
})(typeof window !== 'undefined' ? window : globalThis);
