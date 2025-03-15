import { useState, useCallback } from 'react';

const BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

export const useQueries = () => {
  const [queries, setQueries] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchQueries = useCallback(async () => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('token');
      console.log('Fetching queries with token:', token); // Debug token
      const url = `${BASE_URL}/api/queries?limit=10&offset=0`; // Explicit URL with pagination
      console.log('Request URL:', url); // Debug URL
      const res = await fetch(url, {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json', // Ensure JSON expectation
        },
      });
      console.log('Response status:', res.status); // Debug status
      const text = await res.text(); // Get raw response first
      console.log('Raw response:', text); // Debug raw content
      if (!res.ok) {
        throw new Error(`HTTP error! Status: ${res.status}, Response: ${text}`);
      }
      const data = JSON.parse(text); // Manually parse JSON
      setQueries(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err) {
      console.error('Error fetching queries:', err);
      setError(err.message || 'Failed to load queries. Please try again later.');
      setQueries([]); // Reset on error
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { queries, setQueries, isLoading, error, fetchQueries, setError };
};