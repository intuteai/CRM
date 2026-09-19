import { useCallback, useState } from 'react';

const BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

export function useAdminStats() {
  const [stats, setStats] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchStats = useCallback(async () => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${BASE_URL}/api/dashboard/admin-stats`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      const text = await res.text();
      if (!res.ok) {
        let parsed;
        try { parsed = JSON.parse(text); } catch { /* non-JSON error body */ }
        throw new Error(parsed?.error || `HTTP error! Status: ${res.status}`);
      }
      setStats(JSON.parse(text));
      setError(null);
    } catch (err) {
      setError(err.message || 'Failed to load dashboard stats.');
      setStats(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { stats, isLoading, error, fetchStats };
}
