// src/hooks/useQueries.js
import { useState, useCallback } from 'react';

export const useQueries = () => {
  const [queries, setQueries] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchQueries = useCallback(async () => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/queries', { // Use proxy path
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const data = await res.json();
      setQueries(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err) {
      console.error('Error fetching queries:', err);
      setError('Failed to load queries. Please try again later.');
      setQueries([]); // Reset on error to avoid stale data
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { queries, setQueries, isLoading, error, fetchQueries, setError };
};