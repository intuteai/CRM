import { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-toastify';

const BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

const useProblems = (socket) => {
  const [problems, setProblems] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchProblems = useCallback(async () => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${BASE_URL}/api/problems`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        console.log('Fetched problems:', data.problems);
        setProblems(data.problems);
        setError(null);
      } else {
        throw new Error(data.error || 'Failed to fetch problems');
      }
    } catch (err) {
      console.error('Error fetching problems:', err);
      setError(err.message || 'Network error');
      toast.error(err.message || 'Failed to fetch problems');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProblems();
  }, [fetchProblems]);

  useEffect(() => {
    if (!socket) {
      console.warn('Socket not initialized');
      return;
    }

    socket.on('connect', () => {
      console.log('Socket.IO connected:', socket.id);
    });

    socket.on('disconnect', () => {
      console.warn('Socket.IO disconnected');
    });

    socket.on('problem:created', (newProblem) => {
      console.log('Socket.IO problem:created:', newProblem);
      setProblems((prev) => {
        // Avoid duplicates
        if (prev.some((p) => p.id === newProblem.id)) {
          return prev;
        }
        return [newProblem, ...prev];
      });
      toast.info(`New problem #${newProblem.id} reported`);
    });

    socket.on('solution:created', (data) => {
      console.log('Socket.IO solution:created:', data);
      setProblems((prev) =>
        prev.map((problem) =>
          problem.id === parseInt(data.problem_id)
            ? {
                ...problem,
                solutions: [
                  ...(problem.solutions || []),
                  {
                    solution_id: data.solution.solution_id,
                    solution_description: data.solution.solution_description,
                    is_successful: data.solution.is_successful,
                    attempted_at: data.solution.attempted_at,
                  },
                ],
              }
            : problem
        )
      );
      toast.info(`Solution added to problem #${data.problem_id}`);
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('problem:created');
      socket.off('solution:created');
    };
  }, [socket]);

  return { problems, isLoading, error, fetchProblems };
};

export default useProblems;