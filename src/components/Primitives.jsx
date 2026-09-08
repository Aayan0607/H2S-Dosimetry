import { rgbCss, rgbHex, riskColorVar, qualityColorVar } from '../utils/format';

export function Card({ children, className = '', style = {} }) {
  return (
    <div
      className={`rounded-[var(--radius-card)] border ${className}`}
      style={{ background: 'var(--panel)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-sm)', ...style }}
    >
      {children}
    </div>
  );
}

export function CardHeader({ title, sub, icon }) {
  return (
    <div className="px-4 pt-4 pb-3 flex items-start gap-2.5">
      {icon && <span className="shrink-0 mt-0.5" style={{ color: 'var(--accent)' }}>{icon}</span>}
      <div>
        <div className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>{title}</div>
        {sub && <div className="text-[12px] mt-0.5" style={{ color: 'var(--text-faint)' }}>{sub}</div>}
      </div>
    </div>
  );
}

/** Small uppercase label used above section titles — industrial/technical feel. */
export function Eyebrow({ children, color = 'var(--accent)' }) {
  return (
    <div
      className="text-[10.5px] font-semibold uppercase tracking-[0.11em] flex items-center gap-1.5"
      style={{ color }}
    >
      <span className="w-3 h-[2px] rounded-full" style={{ background: color }} />
      {children}
    </div>
  );
}

export function Divider({ className = '' }) {
  return <div className={`border-t ${className}`} style={{ borderColor: 'var(--border-soft)' }} />;
}

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-1.5 font-medium rounded-md transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed select-none';

const BUTTON_SIZES = {
  sm: 'text-[12px] px-3 py-1.5',
  md: 'text-[12.5px] px-3.5 py-2',
  lg: 'text-[13.5px] px-5 py-2.5',
};

/**
 * Shared button primitive so nav actions, CTAs, and secondary actions look
 * consistent across every page instead of one-off inline styles.
 */
export function Button({
  children,
  variant = 'secondary',
  size = 'md',
  className = '',
  style = {},
  ...rest
}) {
  const variants = {
    primary: {
      background: 'var(--accent)',
      color: '#062825',
      border: '1px solid var(--accent)',
    },
    secondary: {
      background: 'var(--panel-raised)',
      color: 'var(--text)',
      border: '1px solid var(--border)',
    },
    ghost: {
      background: 'transparent',
      color: 'var(--text-dim)',
      border: '1px solid var(--border)',
    },
    accentGhost: {
      background: 'var(--accent-soft)',
      color: 'var(--accent)',
      border: '1px solid var(--accent-border)',
    },
    danger: {
      background: 'transparent',
      color: 'var(--high)',
      border: '1px solid var(--border)',
    },
  };
  return (
    <button
      className={`${BUTTON_BASE} ${BUTTON_SIZES[size]} ${className}`}
      style={{ ...variants[variant], ...style }}
      {...rest}
    >
      {children}
    </button>
  );
}

export function ColorSwatch({ rgb, label, size = 56 }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className="rounded-md border shrink-0"
        style={{
          width: size,
          height: size,
          background: rgbCss(rgb),
          borderColor: 'var(--border-strong)',
          boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.15), var(--shadow-sm)',
        }}
      />
      {label && <div className="text-[11px]" style={{ color: 'var(--text-dim)' }}>{label}</div>}
      <div className="font-mono-data text-[10.5px]" style={{ color: 'var(--text-faint)' }}>{rgbHex(rgb)}</div>
    </div>
  );
}

export function RiskPill({ risk, size = 'md' }) {
  const color = riskColorVar(risk);
  const pad = size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-[12px]';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium border ${pad}`}
      style={{ color, borderColor: color, background: `color-mix(in srgb, ${color} 12%, transparent)` }}
    >
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
      {risk}
    </span>
  );
}

/** Small dot + label chip for exposure category, matched to calibration color. */
export function ExposureChip({ label, rgb }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10.5px] font-medium border"
      style={{ borderColor: 'var(--border)', color: 'var(--text-dim)', background: 'var(--panel-raised)' }}
    >
      <span
        className="w-2 h-2 rounded-full shrink-0 border"
        style={{ background: rgbCss(rgb), borderColor: 'rgba(255,255,255,0.15)' }}
      />
      {label}
    </span>
  );
}

export function QualityBadge({ label, score }) {
  const color = qualityColorVar(label);
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border capitalize"
      style={{ color, borderColor: color, background: `color-mix(in srgb, ${color} 10%, transparent)` }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      {label}{typeof score === 'number' ? ` · ${Math.round(score * 100)}%` : ''}
    </span>
  );
}

export function DataRow({ label, value, mono = true }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-[12.5px] gap-3">
      <span style={{ color: 'var(--text-faint)' }}>{label}</span>
      <span className={`text-right ${mono ? 'font-mono-data' : ''}`} style={{ color: 'var(--text)' }}>{value}</span>
    </div>
  );
}

/** Compact stat tile for grids of confidence/quality/detection metrics. */
export function StatTile({ label, value, valueColor, sub }) {
  return (
    <div
      className="rounded-md border px-3 py-2.5"
      style={{ borderColor: 'var(--border-soft)', background: 'var(--panel-sunken)' }}
    >
      <div className="text-[10px] uppercase tracking-wide mb-1" style={{ color: 'var(--text-faint)' }}>{label}</div>
      <div className="text-[14px] font-semibold font-mono-data" style={{ color: valueColor || 'var(--text)' }}>{value}</div>
      {sub && <div className="text-[10.5px] mt-0.5" style={{ color: 'var(--text-faint)' }}>{sub}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, sub }) {
  return (
    <div className="flex flex-col items-center text-center py-10 px-4">
      {icon && (
        <div
          className="w-11 h-11 rounded-full flex items-center justify-center mb-3"
          style={{ background: 'var(--panel-raised)', color: 'var(--text-faint)' }}
        >
          {icon}
        </div>
      )}
      <div className="text-[13px] font-medium" style={{ color: 'var(--text-dim)' }}>{title}</div>
      {sub && <div className="text-[12px] mt-1 max-w-xs" style={{ color: 'var(--text-faint)' }}>{sub}</div>}
    </div>
  );
}
