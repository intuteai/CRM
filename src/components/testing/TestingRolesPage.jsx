// Testing roles per user (testing_admin only). Roles are independent of the ERP role.
import { useCallback, useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { testingRequest, errorText } from './testingApi';
import { useNotify } from '../../hooks/useNotify';
import { Loading, ErrorNote, EmptyState } from './TestingUi';
import { CARD, TH, TD, TESTING_ROLE_LABELS } from './testingFormat';

const ROLE_ORDER = ['operator', 'viewer', 'testing_head', 'testing_admin'];
const ROLE_HELP = {
  operator: 'Runs tests on the bench; adds corrections',
  viewer: 'Reads results and configuration; CSV export',
  testing_head: 'Manages motor types, profiles, criteria, operators; approves',
  testing_admin: 'Everything, plus who has which testing role',
};

function RoleToggle({ checked, disabled, busy, onChange, label, title }) {
  return (
    <label className={`inline-flex items-center gap-2 ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`} title={title}>
      <input
        type="checkbox"
        className="h-4 w-4 accent-navy-800"
        checked={checked}
        disabled={disabled || busy}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={label}
      />
      <span className="text-xs text-gray-600 md:hidden">{label}</span>
    </label>
  );
}

export default function TestingRolesPage({ selfId }) {
  const { notifySuccess, notifyError } = useNotify();
  const [q, setQ] = useState('');
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [busyUser, setBusyUser] = useState(null);

  const search = useCallback(async (term, signal) => {
    setError(null);
    try {
      const data = await testingRequest('/admin/users', { query: { q: term, limit: 50 }, signal });
      setItems(data?.items || []);
    } catch (err) {
      if (err?.name === 'AbortError') return;
      setError(err);
      setItems((p) => p || []);
    }
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(() => search(q.trim(), ctrl.signal), 300);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q, search]);

  const setRole = async (user, role, on) => {
    const roles = on ? [...new Set([...(user.testing_roles || []), role])] : (user.testing_roles || []).filter((r) => r !== role);
    setBusyUser(user.user_id);
    try {
      const res = await testingRequest(`/admin/users/${user.user_id}/testing-roles`, { method: 'PUT', body: { roles } });
      const saved = res?.testing_roles || roles;
      setItems((list) => list.map((u) => (u.user_id === user.user_id ? { ...u, testing_roles: saved } : u)));
      notifySuccess(`${user.name}: ${on ? 'added' : 'removed'} ${TESTING_ROLE_LABELS[role]}.`);
    } catch (err) {
      notifyError(errorText(err));
    } finally {
      setBusyUser(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          className="w-full p-3 pl-10 border border-navy-100 rounded-lg bg-white shadow-sm text-navy-800 focus:outline-none focus:ring-2 focus:ring-gold-400"
          placeholder="Search Compage staff by name or email…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search users"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        {ROLE_ORDER.map((r) => (
          <div key={r} className="text-xs bg-white border border-navy-100 rounded-lg px-3 py-2">
            <div className="font-semibold text-navy-800">{TESTING_ROLE_LABELS[r]}</div>
            <div className="text-gray-500">{ROLE_HELP[r]}</div>
          </div>
        ))}
      </div>

      <ErrorNote error={error} onRetry={() => search(q.trim())} />

      <div className={`${CARD} overflow-hidden`}>
        {items === null ? (
          <Loading />
        ) : items.length === 0 ? (
          <EmptyState>No users found.</EmptyState>
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-navy-50 text-navy-800">
                    <th className={TH}>User</th>
                    <th className={TH}>ERP role</th>
                    {ROLE_ORDER.map((r) => <th key={r} className={`${TH} text-center`}>{TESTING_ROLE_LABELS[r]}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy-100">
                  {items.map((u) => (
                    <tr key={u.user_id} className="hover:bg-navy-50/60 transition-colors">
                      <td className={TD}>
                        <div className="font-medium text-navy-800">{u.name}</div>
                        <div className="text-xs text-gray-400">{u.email}</div>
                      </td>
                      <td className={`${TD} text-gray-600`}>{u.erp_role || '—'}</td>
                      {ROLE_ORDER.map((r) => {
                        const self = r === 'testing_admin' && Number(u.user_id) === Number(selfId) && (u.testing_roles || []).includes(r);
                        return (
                          <td key={r} className={`${TD} text-center`}>
                            <RoleToggle
                              checked={(u.testing_roles || []).includes(r)}
                              disabled={self}
                              title={self ? 'You cannot remove your own testing admin role' : undefined}
                              busy={busyUser === u.user_id}
                              label={TESTING_ROLE_LABELS[r]}
                              onChange={(on) => setRole(u, r, on)}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="md:hidden divide-y divide-navy-100">
              {items.map((u) => (
                <li key={u.user_id} className="px-4 py-3 space-y-2">
                  <div>
                    <div className="font-medium text-navy-800">{u.name}</div>
                    <div className="text-xs text-gray-400 break-all">{u.email} · {u.erp_role || '—'}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {ROLE_ORDER.map((r) => {
                      const self = r === 'testing_admin' && Number(u.user_id) === Number(selfId) && (u.testing_roles || []).includes(r);
                      return (
                        <RoleToggle
                          key={r}
                          checked={(u.testing_roles || []).includes(r)}
                          disabled={self}
                          busy={busyUser === u.user_id}
                          label={TESTING_ROLE_LABELS[r]}
                          onChange={(on) => setRole(u, r, on)}
                        />
                      );
                    })}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      <p className="text-xs text-gray-400">ERP Admins always act as testing admin, even without a role here.</p>
    </div>
  );
}
