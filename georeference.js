/* ═════════════════════════════════════════════════════════════════
   PTGeoRef — pure, DOM-vrije georeferentie-module.
   Rekent een affiene transformatie (least-squares fit) tussen
   wereld-/documentcoördinaten van de tekening (dezelfde eenheden als
   S.objects — "wereld-px") en RD-coördinaten (EPSG:28992, in meters).
   Geen canvas/DOM/S-state hier: alleen punten en matrix-wiskunde.
   Los te testen (zie georeference.test.js) en los te hergebruiken
   door de UI-laag in index.html.
   ═════════════════════════════════════════════════════════════════ */
(function(root){
  const EPS = 1e-9;

  /* Rijksdriehoeksstelsel: bij benadering geldig bereik voor heel Nederland
     (incl. Caribisch Nederland-marge wordt hier niet meegenomen). */
  const RD_BOUNDS = {xMin:0, xMax:300000, yMin:300000, yMax:650000};

  function det3(m){
    return m[0][0]*(m[1][1]*m[2][2]-m[1][2]*m[2][1])
         - m[0][1]*(m[1][0]*m[2][2]-m[1][2]*m[2][0])
         + m[0][2]*(m[1][0]*m[2][1]-m[1][1]*m[2][0]);
  }

  function invert3(m){
    const det = det3(m);
    if(Math.abs(det) < EPS) return null;
    return [
      [ (m[1][1]*m[2][2]-m[1][2]*m[2][1])/det,
       -(m[0][1]*m[2][2]-m[0][2]*m[2][1])/det,
        (m[0][1]*m[1][2]-m[0][2]*m[1][1])/det ],
      [-(m[1][0]*m[2][2]-m[1][2]*m[2][0])/det,
        (m[0][0]*m[2][2]-m[0][2]*m[2][0])/det,
       -(m[0][0]*m[1][2]-m[0][2]*m[1][0])/det ],
      [ (m[1][0]*m[2][1]-m[1][1]*m[2][0])/det,
       -(m[0][0]*m[2][1]-m[0][1]*m[2][0])/det,
        (m[0][0]*m[1][1]-m[0][1]*m[1][0])/det ],
    ];
  }

  function matVec3(m, v){
    return [
      m[0][0]*v[0]+m[0][1]*v[1]+m[0][2]*v[2],
      m[1][0]*v[0]+m[1][1]*v[1]+m[1][2]*v[2],
      m[2][0]*v[0]+m[2][1]*v[1]+m[2][2]*v[2],
    ];
  }

  /* least-squares affiene fit van wereld(x,y) -> RD(rdX,rdY).
     points: [{x,y,rdX,rdY}, ...], minimaal 3 punten (bij >3 punten
     worden fouten uitgemiddeld — normaalvergelijkingen op een gedeelde
     [x,y,1]-ontwerpmatrix, dus rdX en rdY hergebruiken dezelfde inverse).
     rdX = a*x + b*y + c
     rdY = d*x + e*y + f  */
  function fitAffine(points){
    if(!Array.isArray(points) || points.length < 3)
      throw new Error('fitAffine vereist minimaal 3 referentiepunten.');
    let Sxx=0,Sxy=0,Sx=0,Syy=0,Sy=0,Sn=0;
    const bx=[0,0,0], by=[0,0,0];
    for(const p of points){
      const {x,y,rdX,rdY}=p;
      Sxx+=x*x; Sxy+=x*y; Sx+=x; Syy+=y*y; Sy+=y; Sn+=1;
      bx[0]+=x*rdX; bx[1]+=y*rdX; bx[2]+=rdX;
      by[0]+=x*rdY; by[1]+=y*rdY; by[2]+=rdY;
    }
    const M=[[Sxx,Sxy,Sx],[Sxy,Syy,Sy],[Sx,Sy,Sn]];
    const Minv=invert3(M);
    if(!Minv)
      throw new Error('Referentiepunten zijn (bijna) collineair of vallen samen — geen betrouwbare transformatie mogelijk.');
    const [a,b,c]=matVec3(Minv,bx);
    const [d,e,f]=matVec3(Minv,by);
    return {a,b,c,d,e,f};
  }

  function worldToRD(t, x, y){
    return {x: t.a*x + t.b*y + t.c, y: t.d*x + t.e*y + t.f};
  }

  function rdToWorld(t, rdX, rdY){
    const det = t.a*t.e - t.b*t.d;
    if(Math.abs(det) < EPS) throw new Error('Transformatie is niet inverteerbaar (singuliere matrix).');
    const dx = rdX - t.c, dy = rdY - t.f;
    return {
      x: ( t.e*dx - t.b*dy)/det,
      y: (-t.d*dx + t.a*dy)/det,
    };
  }

  /* residuele fout per punt (in meters, RD-afstand tussen voorspeld en
     opgegeven RD-punt) plus RMS en max over de set. */
  function residuals(points, t){
    const perPoint = points.map(p=>{
      const pred = worldToRD(t, p.x, p.y);
      const dx = pred.x - p.rdX, dy = pred.y - p.rdY;
      return {dx, dy, error: Math.hypot(dx,dy)};
    });
    const errs = perPoint.map(r=>r.error);
    const rms = errs.length ? Math.sqrt(errs.reduce((s,e)=>s+e*e,0)/errs.length) : 0;
    const max = errs.length ? Math.max(...errs) : 0;
    return {perPoint, rms, max};
  }

  /* schaal (meters per wereld-eenheid / wereld-eenheden per meter) en
     rotatie van de "omhoog"-richting van de tekening t.o.v. RD-noorden,
     afgeleid uit het lineaire deel van de affiene transformatie.
     Canvas-conventie: wereld-Y groeit omlaag, dus "omhoog op papier" = -Y. */
  function scaleAndRotation(t){
    const vecX = {x:t.a, y:t.d};   // beeld van wereld-eenheidsvector (1,0)
    const vecY = {x:t.b, y:t.e};   // beeld van wereld-eenheidsvector (0,1)
    const scaleX = Math.hypot(vecX.x, vecX.y);
    const scaleY = Math.hypot(vecY.x, vecY.y);
    const metersPerUnit = (scaleX + scaleY) / 2;
    const unitsPerMeter = metersPerUnit > EPS ? 1/metersPerUnit : 0;
    const nonUniformity = metersPerUnit > EPS ? Math.abs(scaleX-scaleY)/metersPerUnit : 0;
    // "omhoog" op papier = wereld-vector (0,-1) → beeld = -vecY
    const up = {x:-vecY.x, y:-vecY.y};
    let rotationDeg = Math.atan2(up.x, up.y) * 180/Math.PI; // bearing: oost=x, noord=y
    rotationDeg = ((rotationDeg % 360) + 360) % 360;
    return {scaleX, scaleY, metersPerUnit, unitsPerMeter, rotationDeg, nonUniformity};
  }

  /* betrouwbaarheidscheck op de RUIMTELIJKE SPREIDING van de (RD-)punten:
     te dicht bij elkaar of (bijna) collineair maakt de fit onbetrouwbaar. */
  function quality(points, opts){
    opts = opts || {};
    const minDistance = opts.minDistance ?? 2;        // meter
    const collinearRatio = opts.collinearRatio ?? 0.02; // genormaliseerde driehoeksoppervlakte
    const n = points.length;
    let minDist = Infinity, maxDist = 0;
    for(let i=0;i<n;i++) for(let j=i+1;j<n;j++){
      const d=Math.hypot(points[i].rdX-points[j].rdX, points[i].rdY-points[j].rdY);
      minDist=Math.min(minDist,d); maxDist=Math.max(maxDist,d);
    }
    if(n<2){ minDist=0; maxDist=0; }
    let maxArea=0;
    for(let i=0;i<n;i++) for(let j=i+1;j<n;j++) for(let k=j+1;k<n;k++){
      const [p1,p2,p3]=[points[i],points[j],points[k]];
      const area=0.5*Math.abs((p2.rdX-p1.rdX)*(p3.rdY-p1.rdY)-(p3.rdX-p1.rdX)*(p2.rdY-p1.rdY));
      maxArea=Math.max(maxArea,area);
    }
    const normArea = maxDist>EPS ? maxArea/(maxDist*maxDist) : 0;
    const collinear = n>=3 ? normArea < collinearRatio : false;
    const tooClose = n>=2 ? minDist < minDistance : false;
    const warnings=[];
    if(tooClose) warnings.push(`Referentiepunten liggen te dicht bij elkaar (kleinste afstand ${minDist.toFixed(2)} m) — dit maakt de transformatie onnauwkeurig.`);
    if(collinear) warnings.push('Referentiepunten liggen (bijna) op één lijn — de transformatie is hierdoor onbetrouwbaar loodrecht op die lijn.');
    return {minDist, maxDist, collinear, tooClose, warnings};
  }

  function validateRD(x, y, bounds){
    const b = bounds || RD_BOUNDS;
    const errors=[];
    if(!isFinite(x) || x<b.xMin || x>b.xMax) errors.push(`X moet tussen ${b.xMin} en ${b.xMax} liggen.`);
    if(!isFinite(y) || y<b.yMin || y>b.yMax) errors.push(`Y moet tussen ${b.yMin} en ${b.yMax} liggen.`);
    return {valid: errors.length===0, errors};
  }

  const PTGeoRef = {
    RD_BOUNDS, fitAffine, worldToRD, rdToWorld, residuals, scaleAndRotation, quality, validateRD,
  };

  if(typeof module !== 'undefined' && module.exports) module.exports = PTGeoRef;
  else root.PTGeoRef = PTGeoRef;
})(typeof window !== 'undefined' ? window : globalThis);
