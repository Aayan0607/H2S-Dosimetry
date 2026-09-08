import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { getRoleMetadata, ROLES } from '../utils/roles';

export default function Layout({ children, currentUser: propUser, onLogout: propLogout }) {
  const { currentUser: authUser, userProfile, signOut } = useAuth();

  const activeUser = userProfile || (propUser ? {
    role: propUser.role || ROLES.WORKER,
    displayName: propUser.name || propUser.displayName || 'Refinery Personnel',
    email: propUser.email || ''
  } : authUser ? {
    role: ROLES.WORKER,
    displayName: authUser.displayName || 'Refinery Personnel',
    email: authUser.email || ''
  } : null);

  const handleLogout = propLogout || signOut;
  const currentRole = activeUser?.role || ROLES.WORKER;
  const userMeta = getRoleMetadata(currentRole);

  // Role-specific navigation conforming to Section 15 specifications
  let navItems = [];
  if (currentRole === ROLES.WORKER) {
    navItems = [
      { to: '/personal-dashboard', label: 'My Dashboard', icon: GridIcon, end: true },
      { to: '/analyze', label: 'Analyze Badge', icon: ScanIcon },
      { to: '/history', label: 'My History', icon: ClockIcon },
      { to: '/about', label: 'About', icon: InfoIcon }
    ];
  } else if (currentRole === ROLES.ADMIN) {
    navItems = [
      { to: '/dashboard', label: 'Admin Dashboard', icon: GridIcon, end: true },
      { to: '/analyze', label: 'Analyze Badge', icon: ScanIcon },
      { to: '/workers', label: 'All Workers', icon: UsersIcon },
      { to: '/history', label: 'Analysis History', icon: ClockIcon },
      { to: '/calibration', label: 'Calibration / Batch Management', icon: SlidersIcon },
      { to: '/about', label: 'About', icon: InfoIcon }
    ];
  } else if (currentRole === ROLES.SAFETY_OFFICER) {
    navItems = [
      { to: '/safety-dashboard', label: 'Safety Dashboard', icon: GridIcon, end: true },
      { to: '/analyze', label: 'Analyze Badge', icon: ScanIcon },
      { to: '/history', label: 'Analysis History', icon: ClockIcon },
      { to: '/about', label: 'About', icon: InfoIcon }
    ];
  } else if (currentRole === ROLES.SUPERVISOR) {
    navItems = [
      { to: '/team-dashboard', label: 'Team Dashboard', icon: GridIcon, end: true },
      { to: '/analyze', label: 'Analyze Badge', icon: ScanIcon },
      { to: '/history', label: 'Analysis History', icon: ClockIcon },
      { to: '/about', label: 'About', icon: InfoIcon }
    ];
  } else {
    navItems = [
      { to: '/personal-dashboard', label: 'My Dashboard', icon: GridIcon, end: true },
      { to: '/analyze', label: 'Analyze Badge', icon: ScanIcon },
      { to: '/history', label: 'My History', icon: ClockIcon },
      { to: '/about', label: 'About', icon: InfoIcon }
    ];
  }

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--bg)' }}>
      {/* Desktop Sidebar */}
      <aside
        className="hidden md:flex w-60 shrink-0 flex-col border-r"
        style={{ borderColor: 'var(--border)', background: 'var(--panel)' }}
      >
        <div className="hazard-stripe" />
        <div className="px-5 py-5 border-b" style={{ borderColor: 'var(--border-soft)' }}>
          <div className="flex items-center gap-2.5">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: 'var(--accent-soft)', color: 'var(--accent)', boxShadow: 'inset 0 0 0 1px var(--accent-border)' }}
            >
              <BadgeIcon />
            </div>
            <div className="min-w-0">
              <div className="text-[13.5px] font-semibold leading-tight truncate">H₂S Dosimeter</div>
              <div className="text-[10.5px] leading-tight uppercase tracking-wide mt-0.5" style={{ color: 'var(--text-faint)' }}>
                Colorimetric Analyzer
              </div>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `relative flex items-center gap-3 px-3 py-2 rounded-md text-[13.5px] transition-colors ${
                  isActive ? 'font-medium' : ''
                }`
              }
              style={({ isActive }) => ({
                color: isActive ? 'var(--text)' : 'var(--text-dim)',
                background: isActive ? 'var(--panel-raised)' : 'transparent',
              })}
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span
                      className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full"
                      style={{ background: 'var(--accent)' }}
                    />
                  )}
                  <span style={{ color: isActive ? 'var(--accent)' : 'var(--text-faint)' }}><Icon /></span>
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* User Profile / Auth Status */}
        <div className="px-3 mb-3">
          {activeUser ? (
            <div
              className="rounded-lg border p-2.5 text-xs"
              style={{
                borderColor: userMeta.border,
                background: userMeta.softBg
              }}
            >
              <div className="flex items-center justify-between mb-1">
                <span
                  className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1 border"
                  style={{
                    background: userMeta.softBg,
                    borderColor: userMeta.border,
                    color: userMeta.color
                  }}
                >
                  <span>{userMeta.icon}</span>
                  <span>{userMeta.label}</span>
                </span>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="text-[10.5px] text-slate-400 hover:text-slate-200 underline"
                  title="Sign out"
                >
                  Sign Out
                </button>
              </div>
              <div className="font-semibold text-slate-200 truncate text-[12px]">
                {activeUser.displayName || activeUser.name || 'Refinery Operator'}
              </div>
              <div className="text-[10px] text-slate-400 truncate">{activeUser.email}</div>
            </div>
          ) : (
            <NavLink
              to="/login"
              className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold text-slate-950 bg-amber-500 hover:bg-amber-400 transition-colors shadow-sm"
            >
              <span>🔑</span>
              <span>Sign In / Select Role</span>
            </NavLink>
          )}
        </div>

        <div
          className="mx-3 mb-4 rounded-md border px-3 py-2.5 text-[10.5px] leading-relaxed flex items-start gap-2"
          style={{ borderColor: 'var(--border-soft)', background: 'var(--panel-sunken)', color: 'var(--text-faint)' }}
        >
          <span className="shrink-0 mt-0.5" style={{ color: 'var(--warn)' }}><NoticeIcon /></span>
          <span>Demonstration prototype — not a certified H₂S gas detector.</span>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="hazard-stripe md:hidden" />
        <header
          className="md:hidden flex items-center justify-between px-4 py-3 border-b"
          style={{ borderColor: 'var(--border)', background: 'var(--panel)' }}
        >
          <div className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
              style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
            >
              <BadgeIcon size={15} />
            </div>
            <div className="text-[13px] font-semibold">H₂S Dosimeter</div>
          </div>

          <div>
            {activeUser ? (
              <div className="flex items-center gap-2">
                <span
                  className="px-2 py-0.5 rounded text-[11px] font-semibold flex items-center gap-1 border"
                  style={{
                    borderColor: userMeta.border,
                    color: userMeta.color,
                    background: userMeta.softBg
                  }}
                >
                  <span>{userMeta.icon}</span>
                  <span>{userMeta.label}</span>
                </span>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="text-[11px] text-slate-400 hover:text-slate-200 underline"
                >
                  Exit
                </button>
              </div>
            ) : (
              <NavLink
                to="/login"
                className="px-2.5 py-1 rounded text-xs font-semibold text-slate-950 bg-amber-500"
              >
                Sign In
              </NavLink>
            )}
          </div>
        </header>

        {/* Mobile Horizontal Navigation */}
        <nav
          className="md:hidden flex overflow-x-auto gap-1 px-3 py-2 border-b"
          style={{ borderColor: 'var(--border)', background: 'var(--panel)' }}
        >
          {navItems.map(({ to, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className="px-3 py-1.5 rounded text-[12.5px] whitespace-nowrap shrink-0"
              style={({ isActive }) => ({
                color: isActive ? 'var(--text)' : 'var(--text-dim)',
                background: isActive ? 'var(--panel-raised)' : 'transparent',
                border: isActive ? '1px solid var(--accent-border)' : '1px solid transparent',
              })}
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}

function iconProps(size = 17) {
  return { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };
}
function GridIcon() { return <svg {...iconProps()}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>; }
function ScanIcon() { return <svg {...iconProps()}><path d="M4 7V4h3M17 4h3v3M20 17v3h-3M7 20H4v-3"/><rect x="7" y="7" width="10" height="10" rx="1"/></svg>; }
function SlidersIcon() { return <svg {...iconProps()}><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h13M21 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="17" cy="18" r="2"/></svg>; }
function ClockIcon() { return <svg {...iconProps()}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>; }
function InfoIcon() { return <svg {...iconProps()}><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h0"/></svg>; }
function NoticeIcon() { return <svg {...iconProps(13)}><path d="M12 9v4M12 17h0"/><path d="M10.3 3.9 1.9 18a2 2 0 0 0 1.7 3h16.8a2 2 0 0 0 1.7-3L14.1 3.9a2 2 0 0 0-3.4 0Z"/></svg>; }
function BadgeIcon({ size = 18 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="7" width="16" height="11" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><rect x="9" y="11" width="6" height="4" rx="0.5"/></svg>; }
function UsersIcon() { return <svg {...iconProps()}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>; }
