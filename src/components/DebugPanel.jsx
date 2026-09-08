import { useState } from 'react';
import { DataRow, Divider } from './Primitives';
import { fmt, pct, rgbHex } from '../utils/format';

export default function DebugPanel({ result }) {
  const [open, setOpen] = useState(true);
  if (!result || result.status !== 'complete') return null;

  const { extracted, classification, globalQuality, roiQuality, detection, sensingRoi, workingWidth, workingHeight } = result;

  return (
    <div className="rounded-lg border" style={{ background: 'var(--panel)', borderColor: 'var(--border)' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-[13px] font-semibold"
        style={{ color: 'var(--text)' }}
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          <ChevronIcon open={open} />
          Detailed Analysis Overview
        </span>
        <span className="text-[11px] font-normal" style={{ color: 'var(--text-faint)' }}>{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <div className="px-4 pb-4">
          <Divider className="mb-3" />
          <div className="grid sm:grid-cols-2 gap-x-8 gap-y-4">
            <div>
              <SectionLabel>Image</SectionLabel>
              <DataRow label="Working resolution" value={`${workingWidth} × ${workingHeight}`} />
              <DataRow label="Brightness (mean lum.)" value={fmt(globalQuality.meanLuminance, 1)} />
              <DataRow label="Saturation (mean)" value={fmt(globalQuality.meanSaturation, 3)} />
              <DataRow label="Contrast (σ lum.)" value={fmt(globalQuality.contrast, 1)} />
              <DataRow label="Overall quality" value={`${globalQuality.label} (${pct(globalQuality.score)})`} />

              <SectionLabel className="mt-4">Detected ROI</SectionLabel>
              <DataRow label="Detection confidence" value={pct(detection.confidence)} />
              <DataRow label="Region" value={`${Math.round(sensingRoi.x)}, ${Math.round(sensingRoi.y)} · ${Math.round(sensingRoi.w)}×${Math.round(sensingRoi.h)}`} />
              <DataRow label="ROI quality" value={`${roiQuality.label} (${pct(roiQuality.score)})`} />
              <DataRow label="ROI uniformity" value={pct(extracted.uniformity)} />
              <DataRow label="Samples used" value={`${extracted.sampleCount} / ${extracted.totalCandidates}`} />
            </div>

            <div>
              <SectionLabel>Extracted Color</SectionLabel>
              <DataRow label="RGB" value={`${Math.round(extracted.rgb.r)}, ${Math.round(extracted.rgb.g)}, ${Math.round(extracted.rgb.b)} (${rgbHex(extracted.rgb)})`} />
              <DataRow label="HSV" value={`${fmt(extracted.hsv.h,0)}°, ${fmt(extracted.hsv.s*100,0)}%, ${fmt(extracted.hsv.v*100,0)}%`} />
              <DataRow label="Lab" value={`L ${fmt(extracted.lab.l)} a ${fmt(extracted.lab.a)} b ${fmt(extracted.lab.b)}`} />

              <SectionLabel className="mt-4">ΔE2000 vs. Calibration</SectionLabel>
              {classification.allDistances.map((d) => (
                <DataRow key={d.state.id} label={d.state.label} value={fmt(d.deltaE, 2)} />
              ))}

              <SectionLabel className="mt-4">Confidence Breakdown</SectionLabel>
              <DataRow label="Color closeness" value={pct(classification.breakdown.closeness)} />
              <DataRow label="Reference separation" value={pct(classification.breakdown.separation)} />
              <DataRow label="Image quality" value={pct(classification.breakdown.imageQuality)} />
              <DataRow label="ROI uniformity" value={pct(classification.breakdown.roiUniformity)} />
              <DataRow label="Detection confidence" value={pct(classification.breakdown.detectionConfidence)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SectionLabel({ children, className = '' }) {
  return (
    <div className={`text-[10.5px] uppercase tracking-wide mb-1 ${className}`} style={{ color: 'var(--text-faint)' }}>
      {children}
    </div>
  );
}

function ChevronIcon({ open }) {
  return (
    <svg
      width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
      strokeLinecap="round" strokeLinejoin="round"
      style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', color: 'var(--text-faint)' }}
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}
