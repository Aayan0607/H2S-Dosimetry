/**
 * Standard Application Roles for H₂S Safestrip Dosimeter Portal
 * 
 * 1. admin: Full Dashboard, DGMS calibration control, system admin
 * 2. safety_officer: Safety Dashboard, plant-wide compliance, exposure logs, inspection audits
 * 3. supervisor: Team Dashboard, shift roster, crew gas exposure monitoring
 * 4. worker: Personal Dashboard, personal dosimeter status, immediate badge scan CTA
 */

export const ROLES = {
  ADMIN: 'admin',
  SAFETY_OFFICER: 'safety_officer',
  SUPERVISOR: 'supervisor',
  WORKER: 'worker',
};

export const PREDEFINED_ADMIN_EMAIL = 'admin@refinery.com';

export const ROLE_CONFIG = {
  [ROLES.ADMIN]: {
    id: ROLES.ADMIN,
    label: 'Admin',
    subtitle: 'Refinery Management / IT',
    icon: '🛡️',
    homeRoute: '/dashboard',
    badgeClass: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40',
    color: '#06b6d4',
    border: 'rgba(6, 182, 212, 0.35)',
    softBg: 'rgba(6, 182, 212, 0.10)',
    dashboardTitle: 'Full Admin Dashboard',
    description: 'Refinery Management / IT',
  },
  [ROLES.SAFETY_OFFICER]: {
    id: ROLES.SAFETY_OFFICER,
    label: 'Safety Officer',
    subtitle: 'EHS / DGMS Compliance',
    icon: '🦺',
    homeRoute: '/safety-dashboard',
    badgeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
    color: '#10b981',
    border: 'rgba(16, 185, 129, 0.35)',
    softBg: 'rgba(16, 185, 129, 0.10)',
    dashboardTitle: 'Safety Compliance Dashboard',
    description: 'Plant-wide H₂S exposure alerts, regulatory compliance, and incident logging.',
  },
  [ROLES.SUPERVISOR]: {
    id: ROLES.SUPERVISOR,
    label: 'Supervisor',
    subtitle: 'Shift In-Charge / Foreman',
    icon: '📋',
    homeRoute: '/team-dashboard',
    badgeClass: 'bg-blue-500/15 text-blue-300 border-blue-500/40',
    color: '#3b82f6',
    border: 'rgba(59, 130, 246, 0.35)',
    softBg: 'rgba(59, 130, 246, 0.10)',
    dashboardTitle: 'Shift Team Dashboard',
    description: 'Shift crew roster, team exposure tracking, and active worker safety status.',
  },
  [ROLES.WORKER]: {
    id: ROLES.WORKER,
    label: 'Worker',
    subtitle: 'Plant Operator / Miner',
    icon: '👷',
    homeRoute: '/personal-dashboard',
    badgeClass: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
    color: '#f59e0b',
    border: 'rgba(245, 158, 11, 0.35)',
    softBg: 'rgba(245, 158, 11, 0.10)',
    dashboardTitle: 'Personal Dosimeter Dashboard',
    description: 'Plant Operator / Miner',
  },
};

/**
 * Exactly 2 login access profiles permitted on the login page: Worker and Admin
 */
export const LOGIN_PROFILES = [
  ROLE_CONFIG[ROLES.WORKER],
  ROLE_CONFIG[ROLES.ADMIN],
];

export const ALL_ROLES = [
  ROLES.ADMIN,
  ROLES.SAFETY_OFFICER,
  ROLES.SUPERVISOR,
  ROLES.WORKER,
];

export const ELEVATED_ROLES = [
  ROLES.ADMIN,
  ROLES.SAFETY_OFFICER,
  ROLES.SUPERVISOR,
];

export function isValidRole(role) {
  return typeof role === 'string' && ALL_ROLES.includes(role);
}

export function isElevatedRole(role) {
  return typeof role === 'string' && ELEVATED_ROLES.includes(role);
}

export function getRoleMetadata(role) {
  return ROLE_CONFIG[role] || ROLE_CONFIG[ROLES.WORKER];
}

export function getHomeRouteForRole(role) {
  return ROLE_CONFIG[role]?.homeRoute || '/personal-dashboard';
}
