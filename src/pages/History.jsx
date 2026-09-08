import { useEffect, useState } from 'react';
import { Card, RiskPill, Button, Eyebrow, EmptyState } from '../components/Primitives';
import { loadHistory, clearHistory } from '../calibration/calibrationStore';
import { fetchAnalyses, clearBackendAnalyses } from '../api/backendApi';
import { fmt, pct, timeAgo, rgbCss } from '../utils/format';

export default function History() {
  const [history, setHistory] = useState([]);
  const [storageSource, setStorageSource] = useState('browser fallback');

  useEffect(() => {
    setHistory(loadHistory());
    fetchAnalyses()
      .then((records) => {
        setHistory(records);
        setStorageSource('SQLite backend');
      })
      .catch(() => setStorageSource('browser fallback'));
  }, []);

  async function handleClear() {
    setHistory(clearHistory());
    try {
      await clearBackendAnalyses();
      setStorageSource('SQLite backend');
    } catch {
      setStorageSource('browser fallback');
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-5 md:px-8 py-8">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <Eyebrow>Local Record</Eyebrow>
          <h1 className="text-[20px] font-semibold mt-1.5">Analysis History</h1>
          <p className="text-[13px] mt-1" style={{ color: 'var(--text-faint)' }}>
            Loaded from {storageSource} — {history.length} record{history.length === 1 ? '' : 's'}.
          </p>
        </div>
        {history.length > 0 && (
          <Button variant="ghost" onClick={handleClear} className="shrink-0">
            Clear history
          </Button>
        )}
      </div>

      {history.length === 0 && (
        <Card>
          <EmptyState
            icon={<ClockIcon />}
            title="No analyses yet"
            sub="Results are saved here automatically after each confident classification."
          />
        </Card>
      )}

      <div className="space-y-2.5">
        {history.map((h, i) => (
          <Card key={i} className="p-3.5 flex items-center gap-4">
            <img src={h.thumbnail} alt="" className="w-12 h-12 rounded object-cover border shrink-0" style={{ borderColor: 'var(--border)' }} />
            <div
              className="w-6 h-6 rounded border shrink-0"
              style={{ background: rgbCss(h.color), borderColor: 'var(--border)' }}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[12px] font-mono-data" style={{ color: 'var(--text-faint)' }}>{h.badgeId || 'ID unavailable'}</span>
                <span className="text-[13px] font-medium">{h.category}</span>
                <RiskPill risk={h.risk} size="sm" />
              </div>
              <div className="text-[11.5px] mt-0.5" style={{ color: 'var(--text-faint)' }}>
                {h.estimatedExposurePpm8h != null ? `${h.estimatedExposurePpm8h} ppm/8h · ` : ''}Confidence {pct(h.confidence)} · ΔE {fmt(h.deltaE)}
              </div>
            </div>
            <div className="text-[11.5px] shrink-0" style={{ color: 'var(--text-faint)' }}>{timeAgo(h.timestamp)}</div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function ClockIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>;
}
