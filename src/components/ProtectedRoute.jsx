import { Navigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { getRoleMetadata, getHomeRouteForRole } from '../utils/roles';

export default function ProtectedRoute({ children, allowedRoles }) {
  const { currentUser, userProfile, loading } = useAuth();
  const location = useLocation();

  if (loading || (currentUser && !userProfile)) {
    return <AuthLoadingScreen />;
  }

  if (!currentUser) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const currentRole = userProfile?.role || null;

  if (allowedRoles && (!currentRole || !allowedRoles.includes(currentRole))) {
    console.warn('[AUTH DIAGNOSTIC] 7. Route /dashboard BLOCKED by route guard! path:', location.pathname, 'currentRole:', currentRole, 'allowedRoles:', allowedRoles);
    return <AccessDeniedScreen currentRole={currentRole} allowedRoles={allowedRoles} />;
  }

  console.log('[AUTH DIAGNOSTIC] 7. Route access GRANTED for path:', location.pathname, 'currentRole:', currentRole);
  return children;
}

function AuthLoadingScreen() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4 selection:bg-amber-500/20"
      style={{ background: '#0b0f14' }}
    >
      <div className="flex flex-col items-center max-w-sm text-center">
        <div className="relative mb-5">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-xl shadow-amber-500/10">
            <svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="7" width="16" height="11" rx="2" />
              <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              <rect x="9" y="11" width="6" height="4" rx="0.5" />
            </svg>
          </div>
          <div className="absolute -inset-2 rounded-2xl border border-amber-400/20 animate-ping pointer-events-none" />
        </div>

        <div className="text-base font-bold text-slate-100 mb-1">
          H₂S Safestrip Dosimeter
        </div>
        <div className="text-xs font-mono text-amber-400 mb-4 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          <span>VERIFYING REFINERY CREDENTIALS...</span>
        </div>
        <p className="text-[11.5px] text-slate-500 leading-relaxed">
          Establishing encrypted session with Firebase Auth & Cloud Firestore profile.
        </p>
      </div>
    </div>
  );
}

function AccessDeniedScreen({ currentRole, allowedRoles }) {
  const meta = currentRole ? getRoleMetadata(currentRole) : null;
  const targetPortal = currentRole ? getHomeRouteForRole(currentRole) : '/login';
  const targetLabel = currentRole ? `Return to ${meta.label} Dashboard` : 'Return to Login';

  return (
    <div
      className="min-h-[75vh] flex items-center justify-center p-6 selection:bg-amber-500/20"
      style={{ background: 'transparent' }}
    >
      <div className="w-full max-w-md rounded-2xl border border-red-900/60 bg-slate-900/90 backdrop-blur-xl p-6 shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400 text-lg">
            🛡️
          </div>
          <div>
            <div className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <span>Restricted Access Control</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-red-950/80 text-red-300 border border-red-800/70">
                403 FORBIDDEN
              </span>
            </div>
            <div className="text-[11px] text-slate-400">DGMS Security Isolation Protocol</div>
          </div>
        </div>

        <div className="mb-4 p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Your Active Profile:</span>
            {meta ? (
              <span
                className="px-2 py-0.5 rounded text-[11px] font-semibold uppercase flex items-center gap-1"
                style={{ background: meta.softBg, color: meta.color, border: `1px solid ${meta.border}` }}
              >
                <span>{meta.icon}</span>
                <span>{meta.label}</span>
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-red-950 text-red-400 border border-red-800">
                Unassigned Role
              </span>
            )}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Required Role:</span>
            <span className="font-mono text-slate-200 uppercase text-[11px]">
              {allowedRoles.map((r) => getRoleMetadata(r).label).join(' or ')}
            </span>
          </div>
        </div>

        <p className="text-xs text-slate-400 leading-relaxed mb-6">
          Access to this area is restricted to authorized roles. Your authenticated account does not
          have permission to view this module.
        </p>

        <div className="flex justify-end">
          <Link
            to={targetPortal}
            className="w-full py-2.5 px-4 rounded-lg text-xs font-semibold text-center text-slate-950 bg-amber-500 hover:bg-amber-400 transition-colors shadow-md"
          >
            {targetLabel} →
          </Link>
        </div>
      </div>
    </div>
  );
}
