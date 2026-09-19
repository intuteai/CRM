import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotify } from '../../hooks/useNotify';
import { DASHBOARD_ROUTES } from '../../constants';
import { getPeopleDashboard } from '../../config/peopleNav';
import TopHeader from '../layout/TopHeader';

// Top bar for the roles that don't use the sidebar shell (HR / Employee / IA HR / IA Employee).
// It is the same header the sidebar roles get (title, module search, clock, notifications,
// profile, logout), with the brand added at the left because there is no sidebar to carry it,
// in dark navy so it stands out against these pages' warm cream background.
function Navbar({ userRole, userName, token, handleLogout }) {
  const navigate = useNavigate();
  const { notifySuccess, notifyError } = useNotify();

  // The header searches "modules" — for these roles that is the same set of dashboard cards.
  const sections = useMemo(() => {
    const config = getPeopleDashboard(userRole);
    return [{
      title: 'Modules',
      items: (config?.cards || []).map(({ to, icon, title }) => ({ to, icon, label: title })),
    }];
  }, [userRole]);

  const handleLogoutClick = () => {
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
    fetch(`${backendUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      credentials: 'include',
    })
      .then(() => {
        handleLogout();
        navigate('/');
        notifySuccess('Logged out successfully');
      })
      .catch((err) => {
        console.error('Logout error:', err);
        notifyError('Failed to logout. Please try again.');
      });
  };

  return (
    <TopHeader
      showBrand
      dark
      sections={sections}
      dashboardPath={DASHBOARD_ROUTES[userRole] || '/'}
      userName={userName}
      onLogout={handleLogoutClick}
    />
  );
}

export default Navbar;
