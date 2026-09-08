import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, RiskPill, ColorSwatch, Button, Eyebrow } from '../components/Primitives';
import { loadHistory } from '../calibration/calibrationStore';
import { fmt, pct, timeAgo } from '../utils/format';

export default function Dashboard() {
  const [history, setHistory] = useState([]);

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  const latest = history[0];
  const critHighCount = history.filter((h) => h.risk === 'HIGH RISK' || h.risk === 'CRITICAL RISK').length;

  return (
    <div className="max-w-6xl mx-auto px-5 md:px-8 py-8">
      <div className="mb-7">
        <Eyebrow>Passive Colorimetric Dosimetry</Eyebrow>
        <h1 className="text-[23px] font-semibold mt-1.5" style={{ color: 'var(--text)' }}>H₂S Dosimeter Analysis</h1>
        <p className="text-[13.5px] mt-1.5 max-w-xl" style={{ color: 'var(--text-faint)' }}>
          Photograph a passive colorimetric dosimeter wristband and get an evidence-based
          exposure-category estimate — extracted from the real image, not simulated.
        </p>
      </div>

      <div className="grid sm:grid-cols-3 gap-4 mb-7">
        <StatCard label="Analyses recorded" value={history.length} />
        <StatCard label="High / Critical flags" value={critHighCount} accent={critHighCount > 0 ? 'var(--high)' : undefined} />
        <StatCard label="Last analysis" value={latest ? timeAgo(latest.timestamp) : '—'} />
      </div>

      <div className="grid lg:grid-cols-5 gap-5">
        <Card className="lg:col-span-3 p-6 flex flex-col justify-between">
          <div>
            <div className="text-[15px] font-semibold mb-1.5">Upload Badge Image</div>
            <p className="text-[13px] mb-5" style={{ color: 'var(--text-faint)' }}>
              Start a new analysis — upload a photo, use your camera, or try a demo badge. The
              pipeline detects the badge, isolates the sensing patch, and compares its color
              against the calibration reference scale.
            </p>
          </div>
          <Link to="/analyze">
            <Button variant="primary" size="lg">
              Analyze a badge
              <ArrowIcon />
            </Button>
          </Link>
        </Card>

        <Card className="lg:col-span-2 p-5">
          <div className="text-[13px] font-semibold mb-3">Recent analysis</div>
          {!latest && (
            <div className="text-[12.5px]" style={{ color: 'var(--text-faint)' }}>
              No analyses yet. Results will appear here after you analyze a badge.
            </div>
          )}
          {latest && (
            <div className="flex items-center gap-4">
              <ColorSwatch rgb={latest.color} size={44} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[13px] font-medium">{latest.category}</span>
                  <RiskPill risk={latest.risk} />
                </div>
                <div className="text-[11.5px]" style={{ color: 'var(--text-faint)' }}>
                  Confidence {pct(latest.confidence)} · ΔE {fmt(latest.deltaE)} · {timeAgo(latest.timestamp)}
                </div>
              </div>
            </div>
          )}
          <Link to="/history" className="text-[12px] mt-4 inline-block font-medium" style={{ color: 'var(--accent)' }}>
            View full history →
          </Link>
        </Card>
      </div>

      <div className="mt-8 text-[11.5px] leading-relaxed px-1" style={{ color: 'var(--text-faint)' }}>
        This prototype provides a color-based exposure indication for demonstration purposes and
        is not a replacement for certified H₂S gas detection equipment.
      </div>
    </div>
  );
}

function StatCard({ label, value, accent }) {
  return (
    <Card className="p-4">
      <div className="text-[11px] uppercase tracking-wide mb-1.5" style={{ color: 'var(--text-faint)' }}>{label}</div>
      <div className="text-[22px] font-semibold font-mono-data" style={{ color: accent || 'var(--text)' }}>{value}</div>
    </Card>
  );
}

function ArrowIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg>;
}
