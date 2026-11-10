import { Gauge, Cog, UserCheck, ShieldCheck, ClipboardCheck } from 'lucide-react';
import { testingPermissions } from './useTestingAccess';

export const TESTING_BASE = '/motor-testing';

// ERP roles that may hold a testing role (Compage staff). Within these, access is decided by the
// testing roles from GET /api/testing/me, not by the ERP role.
export const TESTING_ERP_ROLES = [
  'admin', 'sales', 'design', 'production', 'store', 'dispatch', 'accounts',
  'employee', 'hr', 'service_repair', 'representative',
];

export const isTestingPath = (pathname) => pathname === TESTING_BASE || pathname.startsWith(`${TESTING_BASE}/`);

export const testingPaths = {
  lookup: TESTING_BASE,
  run: (testId) => `${TESTING_BASE}/runs/${testId}`,
  variants: `${TESTING_BASE}/motor-types`,
  operators: `${TESTING_BASE}/operators`,
  roles: `${TESTING_BASE}/roles`,
  corrections: `${TESTING_BASE}/corrections`,
};

/** Menu items of the Motor Testing module the given testing roles may open. */
export function testingNavItems(roles) {
  const can = testingPermissions(roles || []);
  if (!can.any) return [];
  return [
    can.readResults && { to: testingPaths.lookup, icon: Gauge, label: 'Serial Lookup', desc: 'Every test run of a motor serial' },
    can.readConfig && { to: testingPaths.variants, icon: Cog, label: 'Motor Types & Criteria', desc: 'Variants, ramp profiles and acceptance criteria' },
    can.decideCorrection && { to: testingPaths.corrections, icon: ClipboardCheck, label: 'Pending Corrections', desc: 'Approve or reject run corrections' },
    can.manageOperators && { to: testingPaths.operators, icon: UserCheck, label: 'Test Operators', desc: 'Operator pick-list for the test bench' },
    can.manageRoles && { to: testingPaths.roles, icon: ShieldCheck, label: 'Testing Roles', desc: 'Who can view, test, review and administer' },
  ].filter(Boolean);
}

/** Sidebar section for the Motor Testing module, or null when the user has no testing role. */
export function testingNavSection(roles) {
  const items = testingNavItems(roles);
  if (!items.length) return null;
  return {
    title: 'Motor Testing',
    shortLabel: 'Testing',
    accent: { bg: 'bg-sky-50', text: 'text-sky-600' },
    items,
  };
}

/** Adds the Motor Testing section to a role nav config (config/roleNav.js shape) without mutating it. */
export function withTestingNav(nav, roles) {
  if (!nav) return nav;
  const section = testingNavSection(roles);
  if (!section) return nav;
  return { ...nav, sections: [...nav.sections, section] };
}
