import { rgbCss } from '../utils/format';

/**
 * Renders the calibration states left-to-right and places a marker at the
 * position implied by the classifier's nearest/second-nearest result — the
 * scale is generated directly from the same `calibration` array and
 * `classification` object the classifier used, not decorative placeholders.
 */
export default function CalibrationScale({ calibration, classification }) {
  const sorted = [...calibration].sort((a, b) => a.order - b.order);
  const nearestOrder = classification?.nearest?.order ?? 0;
  const secondOrder = classification?.secondNearest?.order ?? nearestOrder;
  const dNear = classification?.nearestDeltaE ?? 0;
  const dSecond = classification?.secondNearestDeltaE ?? 1;

  // Position marker between nearest and second-nearest, weighted by their
  // relative Delta E distances (closer to whichever is perceptually nearer).
  let markerPos = nearestOrder;
  if (secondOrder !== nearestOrder && dNear + dSecond > 0) {
    const frac = dNear / (dNear + dSecond);
    markerPos = nearestOrder + (secondOrder - nearestOrder) * frac;
  }
  const markerPct = (markerPos / (sorted.length - 1)) * 100;

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10.5px] uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>
          Exposure scale
        </span>
        {classification && (
          <span className="text-[10.5px] font-mono-data" style={{ color: 'var(--text-faint)' }}>
            Nearest: <span style={{ color: 'var(--text-dim)' }}>{classification.nearest.label}</span>
          </span>
        )}
      </div>
      <div className="relative pt-4">
        {classification && (
          <div
            className="absolute -top-0.5 flex flex-col items-center"
            style={{ left: `${markerPct}%`, transform: 'translateX(-50%)' }}
          >
            <span
              className="text-[10px] font-mono-data px-1.5 py-0.5 rounded whitespace-nowrap mb-1"
              style={{ background: 'var(--panel-raised)', color: 'var(--text)', border: '1px solid var(--border)' }}
            >
              ΔE {classification.nearestDeltaE.toFixed(1)}
            </span>
            <span
              className="w-0 h-0"
              style={{
                borderLeft: '4px solid transparent',
                borderRight: '4px solid transparent',
                borderTop: '5px solid var(--text)',
              }}
            />
          </div>
        )}
        <div
          className="h-3.5 rounded-full relative overflow-hidden border"
          style={{
            borderColor: 'var(--border-strong)',
            background: `linear-gradient(to right, ${sorted.map((s) => rgbCss(s.color)).join(', ')})`,
          }}
        >
          {sorted.slice(1, -1).map((s) => (
            <div
              key={s.id}
              className="absolute top-0 bottom-0 w-px"
              style={{ left: `${(s.order / (sorted.length - 1)) * 100}%`, background: 'rgba(0,0,0,0.25)' }}
            />
          ))}
          {classification && (
            <div
              className="absolute top-1/2 rounded-full border-2"
              style={{
                left: `calc(${markerPct}% - 8px)`,
                width: 16,
                height: 16,
                transform: 'translateY(-50%)',
                background: rgbCss(classification.nearest.color),
                borderColor: '#fff',
                boxShadow: '0 0 0 1.5px rgba(0,0,0,0.55), 0 0 0 4px rgba(255,255,255,0.08)',
              }}
              title={`Nearest: ${classification.nearest.label}`}
            />
          )}
        </div>
      </div>
      <div className="flex justify-between mt-2">
        {sorted.map((s) => {
          const isNearest = classification?.nearest?.id === s.id;
          return (
            <div
              key={s.id}
              className="text-[10.5px] text-center font-medium"
              style={{
                color: isNearest ? 'var(--text)' : 'var(--text-faint)',
                width: `${100 / sorted.length}%`,
              }}
            >
              {s.label}
            </div>
          );
        })}
      </div>
    </div>
  );
}
