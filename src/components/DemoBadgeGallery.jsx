import { useEffect, useState } from 'react';
import { getDemoImages } from '../data/demoImages';
import { DEFAULT_CALIBRATION } from '../calibration/calibrationData';
import { Button, RiskPill } from './Primitives';
import { rgbCss } from '../utils/format';

const CAL_BY_ID = Object.fromEntries(DEFAULT_CALIBRATION.map((c) => [c.id, c]));

/**
 * Polished "Try Demo Badge" section. Images are the project's existing
 * synthetic-but-realistic sample badges (generated once by data/demoImages.js
 * and cached) — nothing here is new artwork. Clicking "Analyze" hands the
 * exact same <img> element to the same runAnalysis() pipeline used for a
 * real upload; no result is ever pre-computed or hardcoded per badge.
 */
export default function DemoBadgeGallery({ onAnalyze, analyzingId }) {
  const [demos, setDemos] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getDemoImages()
      .then((d) => { if (!cancelled) setDemos(d); })
      .catch(() => { if (!cancelled) setError('Could not generate demo badges.'); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <div className="text-[13.5px] font-semibold" style={{ color: 'var(--text)' }}>Try a demo badge</div>
          <p className="text-[12px] mt-0.5" style={{ color: 'var(--text-faint)' }}>
            Five sample wristbands spanning the exposure scale. Each runs through the exact same
            detection → color-extraction → calibration pipeline as an uploaded photo.
          </p>
        </div>
      </div>

      {error && (
        <div
          className="rounded-md border px-3.5 py-2.5 text-[12px]"
          style={{ borderColor: 'var(--high)', color: 'var(--high)', background: 'var(--high-soft)' }}
        >
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {(demos || Array.from({ length: 5 })).map((d, i) => (
          <DemoCard
            key={d?.id ?? i}
            demo={d}
            busy={analyzingId != null && analyzingId === d?.id}
            disabled={analyzingId != null && analyzingId !== d?.id}
            onAnalyze={onAnalyze}
          />
        ))}
      </div>
    </div>
  );
}

function DemoCard({ demo, busy, disabled, onAnalyze }) {
  if (!demo) {
    return (
      <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--border)', background: 'var(--panel)' }}>
        <div className="w-full aspect-[4/3] skeleton" />
        <div className="px-2.5 py-2.5 space-y-1.5">
          <div className="h-2.5 w-16 rounded skeleton" />
          <div className="h-2 w-10 rounded skeleton" />
        </div>
      </div>
    );
  }

  const cal = CAL_BY_ID[demo.calibrationId];

  return (
    <div
      className="group rounded-lg border overflow-hidden flex flex-col transition-colors"
      style={{ borderColor: 'var(--border)', background: 'var(--panel)', opacity: disabled ? 0.55 : 1 }}
    >
      <div className="relative">
        <img src={demo.dataUrl} alt={`${demo.label} demo badge`} className="w-full aspect-[4/3] object-cover" draggable={false} />
        <div
          className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center pb-2"
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.55), transparent 55%)' }}
        >
          <span className="text-[10px] font-mono-data text-white/85">Sample photo</span>
        </div>
        <span
          className="absolute top-1.5 left-1.5 w-2.5 h-2.5 rounded-full border"
          style={{ background: rgbCss(cal?.color ?? { r: 128, g: 128, b: 128 }), borderColor: 'rgba(255,255,255,0.35)' }}
          title={cal?.label}
        />
      </div>

      <div className="px-2.5 pt-2 pb-2.5 flex-1 flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-1">
          <span className="text-[12px] font-medium truncate" style={{ color: 'var(--text)' }}>{demo.label}</span>
        </div>
        {cal && <RiskPill risk={cal.risk} size="sm" />}
        <Button
          variant="accentGhost"
          size="sm"
          className="mt-1 w-full"
          disabled={disabled || busy}
          onClick={() => onAnalyze(demo)}
        >
          {busy ? (
            <>
              <Spinner /> Analyzing…
            </>
          ) : (
            <>
              <PlayIcon /> Analyze
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function PlayIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
  );
}

function Spinner() {
  return (
    <span
      className="w-2.5 h-2.5 rounded-full border-2 animate-spin shrink-0"
      style={{ borderColor: 'currentColor', borderTopColor: 'transparent' }}
    />
  );
}
