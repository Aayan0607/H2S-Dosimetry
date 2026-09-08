import { useEffect, useState } from 'react';
import { Card, Button, Eyebrow } from '../components/Primitives';
import { rgbToLab } from '../vision/colorSpace';
import { rgbHex, fmt } from '../utils/format';
import { loadCalibration, saveCalibration, resetCalibration } from '../calibration/calibrationStore';

export default function Calibration() {
  const [calibration, setCalibration] = useState([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setCalibration(loadCalibration());
  }, []);

  function updateColor(id, hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    if ([r, g, b].some((v) => Number.isNaN(v))) return;
    setCalibration((prev) => prev.map((c) => (c.id === id ? { ...c, color: { r, g, b } } : c)));
    setSaved(false);
  }

  function handleSave() {
    saveCalibration(calibration);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  }

  function handleReset() {
    setCalibration(resetCalibration());
    setSaved(false);
  }

  return (
    <div className="max-w-4xl mx-auto px-5 md:px-8 py-8">
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <Eyebrow>Reference Colors</Eyebrow>
          <h1 className="text-[20px] font-semibold mt-1.5">Calibration</h1>
          <p className="text-[13px] mt-1 max-w-lg" style={{ color: 'var(--text-faint)' }}>
            These reference colors drive the classifier's ΔE2000 comparison. Recalibrate them
            using real photographed badges at known exposure states, then save.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="ghost" onClick={handleReset}>Reset to defaults</Button>
          <Button variant="primary" onClick={handleSave}>{saved ? 'Saved ✓' : 'Save calibration'}</Button>
        </div>
      </div>

      <div className="space-y-3">
        {calibration.map((state) => {
          const lab = rgbToLab(state.color.r, state.color.g, state.color.b);
          return (
            <Card key={state.id} className="p-4 flex items-center gap-4">
              <div
                className="w-14 h-14 rounded-md border shrink-0"
                style={{ background: `rgb(${state.color.r},${state.color.g},${state.color.b})`, borderColor: 'var(--border-strong)', boxShadow: 'var(--shadow-sm)' }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[13.5px] font-medium">{state.label}</span>
                  <span className="text-[11px] px-1.5 py-0.5 rounded font-mono-data" style={{ background: 'var(--panel-raised)', color: 'var(--text-faint)' }}>
                    {state.risk}
                  </span>
                </div>
                <p className="text-[12px] mt-0.5" style={{ color: 'var(--text-faint)' }}>{state.description}</p>
                <div className="text-[11px] font-mono-data mt-1" style={{ color: 'var(--text-faint)' }}>
                  Lab: L {fmt(lab.l)} · a {fmt(lab.a)} · b {fmt(lab.b)}
                </div>
              </div>
              <label className="shrink-0 flex items-center gap-2">
                <span className="text-[11px] font-mono-data" style={{ color: 'var(--text-faint)' }}>{rgbHex(state.color)}</span>
                <input
                  type="color"
                  value={rgbHex(state.color)}
                  onChange={(e) => updateColor(state.id, e.target.value)}
                  className="w-9 h-9 rounded cursor-pointer border-0 bg-transparent"
                />
              </label>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
