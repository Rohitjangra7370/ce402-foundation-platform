// Dumps engine outputs for fixed inputs to results/engine_dump.json; tests/check.py recomputes them independently.
const G = require('../src/engine.js'), S = require('../data/site.json');
const out = {};
out.icorner = [[0.2,0.2],[1,1],[1,2],[0.5,5],[3,3],[10,0.3],[0.05,0.05]].map(([m,n]) => ({m,n,I:G.Icorner(m,n)}));
out.centre = [[150,2,3,1.5],[100,4,4,3],[200,2.5,2.5,0.5]].map(([q,B,L,z]) => ({q,B,L,z,v:G.dsCentre(q,B,L,z)}));
out.superpos = (() => { const rects=[{x1:-1.25,x2:1.25,y1:-1.25,y2:1.25,q:170},{x1:3.75,x2:6.25,y1:-1.25,y2:1.25,q:170},{x1:-1.25,x2:1.25,y1:3.75,y2:6.25,q:120}];
  return { rects, pts: [[0,0,2],[2.5,0,3],[2.5,2.5,1.5],[10,0,4]].map(([x,y,z]) => ({x,y,z,v:G.dsPoint(rects,x,y,z)})) }; })();
out.U = [0.01,0.05,0.1,0.2,0.3,0.5,0.848,1.0,2.0].map(T => ({Tv:T,U:G.degreeU(T)}));
out.bearing = [[30,0,1.5,2.0,18,'square'],[35,0,1.0,1.5,19,'strip'],[25,15,2.0,3.0,17.5,'rect'],[0,40,1.5,2.0,18,'square'],[30,0,1.5,2.0,18,'circle']].map(([phi,c,Df,B,g,shape]) => {
  const q = g*Df; const r = G.bearing({shape,B,L:shape==='rect'?2*B:B,Df,c,phi,gamma:g,q,zw:Infinity,mode:'general',FS:3});
  return {phi,c,Df,B,g,shape,q,L:shape==='rect'?2*B:B,qnu:r.qnu,Nc:r.gen.N.Nc,Nq:r.gen.N.Nq,Ng:r.gen.N.Ng}; });
const P = S.boreholes['BH-1'];
out.profile_stress = [0.5,1.0,3.0,5.8,8.2,12].map(z => ({z, wt:1.0, ...G.stressAt(P,z,1.0)}));
// consolidation of BH-3 upper clay under a 3x3 m footing, q = 130, Df = 1.5, centre, Boussinesq
const P3 = S.boreholes['BH-3'], L1 = P3.layers[3];
const cr = G.consolidationLayer({profile:P3,wt:0.6,layer:L1,maxSub:0.5,dsFn:z=>G.dsCentre(130,3,3,z-1.5)});
out.consol = { S:cr.S, rows:cr.rows, layer:L1, wt:0.6, q:130, B:3, Df:1.5, layers:P3.layers };
const L2 = P3.layers[3], L3 = P3.layers[4];
out.cvEq = { H:[3.4,3.4], cv:[6.3e-4,2.0e-4], v: G.cvEquivalent([{H:3.4,cv:6.3e-4},{H:3.4,cv:2.0e-4}]) };
const sch = G.schmertmann({B:2.5,L:2.5,Df:1.5,dp:170,profile:P,wt:1.0,t:10,Es:(z,l,lb)=>{const v=l.N.filter(t=>!t.invalid).map(t=>Math.min(100,t.N));return l.qcN*1000*v.reduce((a,c)=>a+c,0)/v.length*(2.5+Math.min(1,Math.max(0,(lb-1)/9)));}});
out.schm = { S:sch.S, C1:sch.C1, C2:sch.C2, Izp:sch.Izp, B:2.5, Df:1.5, dp:170, wt:1.0, layers:P.layers };
out.ds = Object.fromEntries(Object.entries(S.lab.ds).map(([k,v]) => [k,{sigma:v.sigma,tau:v.tau,...G.dsFit(v.sigma,v.tau)}]));
out.oed = { pts:S.lab.oed_kgcm2.map(r=>({p:r.p*G.KGCM2_TO_KPA,e:r.e,stage:r.stage})), ...G.oedAnalyse(S.lab.oed_kgcm2.map(r=>({p:r.p*G.KGCM2_TO_KPA,e:r.e,stage:r.stage}))) };
require('fs').writeFileSync(__dirname+'/../results/engine_dump.json', JSON.stringify(out,null,1)); console.log('dumped');
