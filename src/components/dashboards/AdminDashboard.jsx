import { useEffect, useState } from 'react';
import { ShoppingCart, MessageSquare, PackageX, Truck } from 'lucide-react';
import { useNotify } from '../../hooks/useNotify';
import { useAdminStats } from '../../hooks/useAdminStats';
import { adminNavSections } from '../../config/adminNav';
import DashboardGreeting from '../shared/DashboardGreeting';
import StatCard from './admin/StatCard';
import ActivityFeed from './admin/ActivityFeed';
import ActivityRail from './admin/ActivityRail';
import ModuleShowcase from './admin/ModuleShowcase';

const MAX_ACTIVITY_ITEMS = 15;

function AdminDashboard({ socket }) {
  const { notifyInfo } = useNotify();
  const { stats, isLoading, error, fetchStats } = useAdminStats();
  const [activity, setActivity] = useState([]);
  const [activityOpen, setActivityOpen] = useState(false);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const pushActivity = (message) => {
    setActivity((prev) => [
      { id: `${Date.now()}-${Math.random()}`, message, time: new Date().toLocaleTimeString() },
      ...prev,
    ].slice(0, MAX_ACTIVITY_ITEMS));
  };

  useEffect(() => {
    if (!socket) return;

    // Note: no "orderUpdate" listener here — the backend never emits it, so it
    // was dead code in the previous version of this dashboard.
    const onNewQuery = (query) => {
      notifyInfo(`New query #${query.queryId} received`, { autoClose: 3000 });
      pushActivity(`New query #${query.queryId} received`);
    };
    const onQueryUpdate = (updatedQuery) => {
      notifyInfo(`Query #${updatedQuery.queryId} updated`, { autoClose: 3000 });
      pushActivity(`Query #${updatedQuery.queryId} updated`);
    };
    const onStockUpdate = () => {
      notifyInfo('Inventory stock levels updated', { autoClose: 3000 });
      pushActivity('Inventory stock levels updated');
    };
    const onCustomerUpdate = (updatedCustomer) => {
      notifyInfo(`Customer ${updatedCustomer.name} updated`, { autoClose: 3000 });
      pushActivity(`Customer ${updatedCustomer.name} updated`);
    };
    const onProblemCreated = (newProblem) => {
      notifyInfo(`New problem #${newProblem.id} reported`, { autoClose: 3000 });
      pushActivity(`New problem #${newProblem.id} reported`);
    };
    const onSolutionCreated = (data) => {
      notifyInfo(`Solution added to problem #${data.problem_id}`, { autoClose: 3000 });
      pushActivity(`Solution added to problem #${data.problem_id}`);
    };
    const onProcessUpdate = () => {
      notifyInfo('Work orders updated', { autoClose: 3000 });
      pushActivity('Work orders updated');
    };

    socket.on('newQuery', onNewQuery);
    socket.on('queryUpdate', onQueryUpdate);
    socket.on('stockUpdate', onStockUpdate);
    socket.on('customerUpdate', onCustomerUpdate);
    socket.on('problem:created', onProblemCreated);
    socket.on('solution:created', onSolutionCreated);
    socket.on('processUpdate', onProcessUpdate);

    return () => {
      socket.off('newQuery', onNewQuery);
      socket.off('queryUpdate', onQueryUpdate);
      socket.off('stockUpdate', onStockUpdate);
      socket.off('customerUpdate', onCustomerUpdate);
      socket.off('problem:created', onProblemCreated);
      socket.off('solution:created', onSolutionCreated);
      socket.off('processUpdate', onProcessUpdate);
    };
  }, [socket, notifyInfo]);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <DashboardGreeting userRole="admin" className="" />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          to="/orders"
          index={0}
          icon={ShoppingCart}
          label="Open Orders"
          value={stats?.openOrders}
          accent="navy"
          isLoading={isLoading}
          hasError={!!error}
        />
        <StatCard
          to="/queries"
          index={1}
          icon={MessageSquare}
          label="Pending Queries"
          value={stats?.pendingQueries}
          accent="gold"
          isLoading={isLoading}
          hasError={!!error}
        />
        <StatCard
          to="/inventory"
          index={2}
          icon={PackageX}
          label="Low Stock Items"
          value={stats?.lowStockItems}
          accent="red"
          isLoading={isLoading}
          hasError={!!error}
        />
        <StatCard
          to="/dispatch-tracking"
          index={3}
          icon={Truck}
          label="Dispatches Today"
          value={stats?.dispatchesToday}
          accent="green"
          isLoading={isLoading}
          hasError={!!error}
        />
      </div>

      <div className="flex flex-col lg:flex-row gap-6 items-stretch lg:items-start">
        <div className="anim-in flex-1 min-w-0" style={{ '--i': 5 }}>
          <ModuleShowcase sections={adminNavSections} />
        </div>
        {activityOpen ? (
          <div className="w-full lg:w-80 shrink-0">
            <ActivityFeed items={activity} onCollapse={() => setActivityOpen(false)} />
          </div>
        ) : (
          <ActivityRail count={activity.length} onExpand={() => setActivityOpen(true)} />
        )}
      </div>
    </div>
  );
}

export default AdminDashboard;
