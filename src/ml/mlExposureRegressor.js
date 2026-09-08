import model from './exposureRegressor.json';
import { deltaE2000 } from '../vision/colorSpace';
import { withLab } from '../calibration/calibrationData';

function predictTree(tree,features){let n=0;while(tree.l[n]!==-1)n=features[tree.f[n]]<=tree.t[n]?tree.l[n]:tree.r[n];return tree.v[n];}
export function estimateExposureMl(extracted,calibration,factors={}){
  const features=[extracted.lab.l,extracted.lab.a,extracted.lab.b,extracted.hsv.s,extracted.hsv.v,extracted.uniformity,factors.imageQuality??1,factors.detectionConfidence??1];
  const treePredictions=model.trees.map(tree=>predictTree(tree,features));
  const dose=Math.max(0,treePredictions.reduce((a,b)=>a+b,0)/treePredictions.length);
  const variance=treePredictions.reduce((sum,value)=>sum+(value-dose)**2,0)/treePredictions.length;
  const modelSpread=Math.sqrt(variance);const uncertainty=Math.max(1,modelSpread*1.96,dose*.18);
  const band=model.riskBands.find(item=>dose<item.max)||model.riskBands.at(-1);
  const states=withLab(calibration).sort((a,b)=>a.order-b.order);const nearest=states.find(s=>s.exposureCategory===band.category)||states.at(-1);
  const distances=states.map(state=>({state,deltaE:deltaE2000(extracted.lab,state.lab)})).sort((a,b)=>a.deltaE-b.deltaE);
  const secondNearest=distances.find(item=>item.state.id!==nearest.id)?.state||nearest;
  const quality=Math.min(factors.imageQuality??1,extracted.uniformity,factors.detectionConfidence??1);
  const confidence=Math.max(.1,Math.min(.95,quality*(1-Math.min(.55,uncertainty/Math.max(8,dose+8)))));
  const exposurePpm8h=dose/8;
  const exposureIntervalPpm8h=[Math.max(0,dose-uncertainty)/8,(dose+uncertainty)/8];
  return {nearest,secondNearest,nearestDeltaE:deltaE2000(extracted.lab,nearest.lab),secondNearestDeltaE:deltaE2000(extracted.lab,secondNearest.lab),allDistances:distances,
    confidence,isUncertain:confidence<.55,estimatedDosePpmH:Number(dose.toFixed(2)),doseIntervalPpmH:[Number(Math.max(0,dose-uncertainty).toFixed(2)),Number((dose+uncertainty).toFixed(2))],
    estimatedExposurePpm8h:Number(exposurePpm8h.toFixed(2)),exposureIntervalPpm8h:exposureIntervalPpm8h.map(value=>Number(value.toFixed(2))),
    algorithm:model.algorithm,modelVersion:model.modelVersion,dataProvenance:model.provenance,
    breakdown:{closeness:confidence,separation:Math.max(0,1-modelSpread/15),imageQuality:factors.imageQuality??1,roiUniformity:extracted.uniformity,detectionConfidence:factors.detectionConfidence??1}};
}
