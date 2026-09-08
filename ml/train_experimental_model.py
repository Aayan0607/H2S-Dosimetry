"""Train a browser-exportable synthetic cumulative H2S dose regressor.

Only the 0, 1-5 and 5-15 ppm.h anchors come from the supplied reference image.
Higher-dose anchors are declared synthetic extrapolations toward brown/black.
"""
from __future__ import annotations
import csv, json
from pathlib import Path
import cv2, joblib, numpy as np
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import train_test_split

ROOT=Path(__file__).resolve().parents[1]; RAW=ROOT/"ml/data/raw"; OUT=ROOT/"ml/artifacts"; WEB=ROOT/"src/ml/exposureRegressor.json"
FEATURES=["lab_l","lab_a","lab_b","hsv_s","hsv_v","uniformity","image_quality","detection_confidence"]
PHOTO_BOXES=[(70,250,270,470),(315,265,520,485),(570,255,790,485)]
EMPIRICAL_DOSES=[0.0,3.0,10.0]
SYNTHETIC_ANCHORS=[(20.0,(160,120,80)),(37.5,(82,58,38)),(60.0,(28,27,24))]

def features(px,uniformity=.9,quality=.9,detection=.9):
    px=px.reshape(-1,1,3).astype(np.uint8); lab=cv2.cvtColor(px,cv2.COLOR_RGB2LAB).reshape(-1,3).astype(float); hsv=cv2.cvtColor(px,cv2.COLOR_RGB2HSV).reshape(-1,3).astype(float)
    return [float(np.median(lab[:,0])*100/255),float(np.median(lab[:,1])-128),float(np.median(lab[:,2])-128),float(np.median(hsv[:,1])/255),float(np.median(hsv[:,2])/255),uniformity,quality,detection]

def photo_anchors():
    im=cv2.cvtColor(cv2.imread(str(RAW/"reference_scale_first3.png")),cv2.COLOR_BGR2RGB); result=[]
    for box,dose in zip(PHOTO_BOXES,EMPIRICAL_DOSES):
        x0,y0,x1,y1=box; px=im[y0:y1,x0:x1].reshape(-1,3); lum=px.mean(1); px=px[(lum<245)&(lum>20)]
        result.append((dose,tuple(int(value) for value in np.median(px,axis=0)),px))
    return result

def build_rows(rng):
    rows=[]; empirical=photo_anchors(); anchors=[(d,rgb,"supplied_photo_first_three") for d,rgb,_ in empirical]+[(d,rgb,"synthetic_extrapolation") for d,rgb in SYNTHETIC_ANCHORS]
    for dose,rgb,source in anchors:
        source_pixels=next((px for d,_,px in empirical if d==dose),None)
        for _ in range(650):
            if source_pixels is not None: px=source_pixels[rng.integers(0,len(source_pixels),768)].astype(float)
            else: px=np.tile(np.asarray(rgb,float),(768,1))+rng.normal(0,10,(768,3))
            gain=rng.normal(1,.07); channel=rng.normal(0,5,3); px=np.clip(px*gain+channel,0,255)
            target=max(0,dose+rng.normal(0,max(.35,dose*.09))); u,q,det=rng.uniform(.58,1,3)
            rows.append((features(px.astype(np.uint8),u,q,det),target,source))
    # Fill dose continuum by physically simple interpolation between adjacent anchors.
    for (d0,c0,_),(d1,c1,_) in zip(anchors[:-1],anchors[1:]):
        for _ in range(500):
            t=rng.uniform(); dose=d0+(d1-d0)*t; rgb=np.asarray(c0)*(1-t)+np.asarray(c1)*t
            px=np.clip(rgb+rng.normal(0,9,(768,3)),0,255); u,q,det=rng.uniform(.58,1,3)
            rows.append((features(px.astype(np.uint8),u,q,det),dose,"synthetic_interpolation"))
    return rows,anchors

def export_tree(est):
    t=est.tree_; return {"l":t.children_left.tolist(),"r":t.children_right.tolist(),"f":t.feature.tolist(),"t":t.threshold.tolist(),"v":t.value[:,0,0].tolist()}

def main():
    rows,anchors=build_rows(np.random.default_rng(26118)); x=np.asarray([r[0] for r in rows]); y=np.asarray([r[1] for r in rows]); xt,xv,yt,yv=train_test_split(x,y,test_size=.25,random_state=42)
    model=RandomForestRegressor(n_estimators=28,max_depth=7,min_samples_leaf=6,max_features=.8,random_state=42,n_jobs=-1); model.fit(xt,yt); pred=model.predict(xv)
    artifact={"modelVersion":"rf-dose-v2","algorithm":"RandomForestRegressor","featureNames":FEATURES,"trees":[export_tree(t) for t in model.estimators_],
      "doseUnit":"ppm.h","empiricalAnchors":[{"dosePpmH":d,"rgb":list(rgb)} for d,rgb,_ in anchors[:3]],"syntheticAnchors":[{"dosePpmH":d,"rgb":list(rgb)} for d,rgb,_ in anchors[3:]],
      "riskBands":[{"max":.75,"category":"UNEXPOSED","risk":"SAFE"},{"max":5,"category":"LOW","risk":"LOW RISK"},{"max":15,"category":"MODERATE","risk":"MODERATE RISK"},{"max":25,"category":"HIGH","risk":"HIGH RISK"},{"max":999,"category":"CRITICAL","risk":"CRITICAL RISK"}],
      "trainingRows":len(rows),"validation":{"maePpmH":float(mean_absolute_error(yv,pred)),"rmsePpmH":float(mean_squared_error(yv,pred)**.5),"r2":float(r2_score(yv,pred))},
      "provenance":"first_three_photo_swatches_plus_declared_synthetic_extension","warning":"Prototype estimate, not validated dosimetry."}
    OUT.mkdir(parents=True,exist_ok=True); WEB.parent.mkdir(parents=True,exist_ok=True); joblib.dump(model,OUT/"rf_dose_model.joblib"); WEB.write_text(json.dumps(artifact,separators=(",",":")))
    (OUT/"rf_dose_metadata.json").write_text(json.dumps({k:v for k,v in artifact.items() if k!="trees"},indent=2))
    with (OUT/"dose_training_features.csv").open("w",newline="",encoding="utf-8") as f:
        w=csv.writer(f);w.writerow(FEATURES+["dose_ppm_h","source"]);[w.writerow(vals+[dose,source]) for vals,dose,source in rows]
    print((OUT/"rf_dose_metadata.json").read_text())
if __name__=="__main__":main()
