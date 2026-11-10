// Who may use the Motor Testing module. Loads GET /api/testing/me once per login (shared by the
// nav and every testing page) and turns `testing_roles` into the permission matrix of admin-api.md.
// The server enforces the same rules; this only hides actions a user can't take.
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useSelector } from 'react-redux';
import { testingRequest, errorText } from './testingApi';

// Testing roles are only granted to Compage staff, so these ERP roles never ask.
const ROLES_WITHOUT_TESTING = new Set(['customer', 'ia_employee', 'ia_hr']);

let snapshot = { token: null, status: 'idle', roles: [], me: null, error: null };
const listeners = new Set();

function setSnapshot(next) {
  snapshot = next;
  listeners.forEach((l) => l());
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getSnapshot = () => snapshot;

async function load(token) {
  setSnapshot({ token, status: 'loading', roles: [], me: null, error: null });
  try {
    const me = await testingRequest('/me');
    if (snapshot.token !== token) return; // a newer login replaced this one
    const roles = Array.isArray(me?.testing_roles) ? me.testing_roles : [];
    setSnapshot({ token, status: 'ready', roles, me, error: null });
  } catch (err) {
    if (snapshot.token !== token) return;
    setSnapshot({ token, status: 'error', roles: [], me: null, error: errorText(err, 'Could not load your testing roles.') });
  }
}

export function testingPermissions(roles) {
  const has = (...r) => r.some((x) => roles.includes(x));
  return {
    any: roles.length > 0,
    // Operators read results so they can find a run to correct (server allows it since 2026-11-10).
    readResults: has('operator', 'viewer', 'testing_head', 'testing_admin'),
    readConfig: roles.length > 0,
    manageConfig: has('testing_head', 'testing_admin'),
    manageOperators: has('testing_head', 'testing_admin'),
    manageRoles: has('testing_admin'),
    addCorrection: has('operator'),
    decideCorrection: has('testing_head', 'testing_admin'),
    exportCsv: has('viewer', 'testing_head', 'testing_admin'),
  };
}

export function useTestingAccess() {
  const token = useSelector((state) => state.auth.token);
  const userRole = useSelector((state) => state.auth.userRole);
  const snap = useSyncExternalStore(subscribe, getSnapshot);
  const eligible = !!token && !ROLES_WITHOUT_TESTING.has(userRole);

  useEffect(() => {
    if (eligible && snap.token !== token) load(token);
  }, [eligible, token, snap.token]);

  const reload = useCallback(() => {
    if (eligible) load(token);
  }, [eligible, token]);

  const current = eligible && snap.token === token;
  const roles = current ? snap.roles : [];
  return {
    roles,
    me: current ? snap.me : null,
    loading: eligible && (!current || snap.status === 'loading'),
    error: current ? snap.error : null,
    can: testingPermissions(roles),
    reload,
  };
}
