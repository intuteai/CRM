// Motor Testing module: one route (/motor-testing/*) open to every logged-in ERP role; who sees
// what is decided by the user's testing roles from GET /api/testing/me (useTestingAccess).
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { useTestingAccess } from './useTestingAccess';
import { testingNavItems, testingPaths } from './testingNav';
import { Loading, ErrorNote } from './TestingUi';
import { CARD } from './testingFormat';
import SerialLookupPage from './SerialLookupPage';
import RunDetailPage from './RunDetailPage';
import VariantsPage from './VariantsPage';
import OperatorsPage from './OperatorsPage';
import TestingRolesPage from './TestingRolesPage';
import PendingCorrectionsPage from './PendingCorrectionsPage';

function NoAccess({ message }) {
  return (
    <div className={`${CARD} max-w-lg mx-auto p-6 sm:p-8 text-center`}>
      <Lock size={28} className="mx-auto text-gold-500 mb-3" />
      <h1 className="font-display text-lg font-bold text-navy-800 mb-1">No access to Motor Testing</h1>
      <p className="text-sm text-gray-500">
        {message || 'Your account has no testing role. Ask a testing admin to grant you one.'}
      </p>
    </div>
  );
}

function SubNav({ items }) {
  if (items.length < 2) return null;
  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-navy-100 -mx-1 px-1" aria-label="Motor Testing">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === testingPaths.lookup}
          className={({ isActive }) =>
            `flex items-center gap-1.5 px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors ${
              isActive ? 'border-gold-500 text-navy-800 font-semibold' : 'border-transparent text-gray-500 hover:text-navy-800'
            }`
          }
        >
          <item.icon size={15} />
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

export default function MotorTestingModule() {
  const access = useTestingAccess();
  const { can, roles } = access;

  if (access.loading) return <Loading label="Checking your testing roles…" />;
  if (access.error) {
    return (
      <div className="max-w-lg mx-auto">
        <ErrorNote error={access.error} onRetry={access.reload} />
      </div>
    );
  }
  if (!can.any) return <NoAccess />;

  const items = testingNavItems(roles);
  const home = can.readResults ? testingPaths.lookup : testingPaths.variants;
  const sub = (path) => path.replace(`${testingPaths.lookup}/`, '');

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <SubNav items={items} />
      <Routes>
        <Route index element={can.readResults ? <SerialLookupPage /> : <Navigate to={home} replace />} />
        {/* Operators can't read results, but may arrive here from a link to add a correction; the server decides. */}
        <Route path="runs/:testId" element={<RunDetailPage can={can} />} />
        <Route path={sub(testingPaths.variants)} element={<VariantsPage can={can} />} />
        <Route
          path={sub(testingPaths.corrections)}
          element={can.decideCorrection ? <PendingCorrectionsPage /> : <NoAccess message="Only a testing head or testing admin can decide corrections." />}
        />
        <Route
          path={sub(testingPaths.operators)}
          element={can.manageOperators ? <OperatorsPage /> : <NoAccess message="Only a testing head or testing admin can manage operators." />}
        />
        <Route
          path={sub(testingPaths.roles)}
          element={can.manageRoles ? <TestingRolesPage selfId={access.me?.user_id} /> : <NoAccess message="Only a testing admin can manage testing roles." />}
        />
        <Route path="*" element={<Navigate to={home} replace />} />
      </Routes>
    </div>
  );
}
