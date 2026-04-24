import React, { useState, useEffect, useMemo, useRef } from 'react';
import io from 'socket.io-client';
import { 
  Search, Filter, PlusCircle, XCircle, ChevronDown, ChevronUp 
} from 'lucide-react';
import { useQueries } from '../../hooks/useQueries';
import { formatDate } from '../../utils/helpers';
import { useNotify } from '../../hooks/useNotify';

// Use the environment variable for the backend URL
const BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

function CustomerQueriesPage() {
  const { queries, setQueries, isLoading, error, fetchQueries, setError } = useQueries();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('All');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingCloseId, setPendingCloseId] = useState(null);
  const [newQuery, setNewQuery] = useState({ description: '' });
  const [sortConfig, setSortConfig] = useState({ key: 'createdAt', direction: 'descending' });
  const [formIsLoading, setFormIsLoading] = useState(false);
  const [expandedResponses, setExpandedResponses] = useState(null);
  const tableRef = useRef(null);
  const { notifySuccess, notifyError, notifyInfo } = useNotify();

  useEffect(() => {
    const socket = io(BASE_URL, {
      reconnection: true, // Enable reconnection attempts
      reconnectionAttempts: 5, // Number of reconnection attempts
      reconnectionDelay: 1000, // Delay between reconnection attempts (ms)
    });

    socket.on('newQuery', (query) => {
      setQueries(prev => {
        if (prev.some(q => q.queryId === query.queryId)) return prev;
        notifyInfo('New query has been added', { autoClose: 3000 });
        return [...prev, query];
      });
      if (tableRef.current) tableRef.current.focus();
    });

    socket.on('queryUpdate', (updatedQuery) => {
      setQueries(prev => {
        const updatedQueries = prev.map(q => 
          q.queryId === updatedQuery.queryId ? updatedQuery : q
        );
        notifyInfo(`Your query #${updatedQuery.queryId} updated`, { autoClose: 3000 });
        return updatedQueries;
      });
      if (tableRef.current) tableRef.current.focus();
    });

    fetchQueries();

    return () => {
      socket.disconnect();
      console.log('Socket.IO disconnected');
    };
  }, [fetchQueries, setQueries]);

  const handleCreateQuery = async (e) => {
    e.preventDefault();
    if (!newQuery.description.trim()) {
      notifyError('Description is required', { autoClose: 3000 });
      return;
    }

    setFormIsLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${BASE_URL}/api/queries`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(newQuery),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create query');

      setQueries(prev => {
        if (prev.some(q => q.queryId === data.queryId)) return prev;
        return [...prev, data];
      });
      setShowCreateForm(false);
      setNewQuery({ description: '' });
      setError(null);
      notifySuccess('Query created successfully', { autoClose: 3000 });
    } catch (err) {
      console.error('Error creating query:', err);
      notifyError(err.message || 'Network error. Please try again.', { autoClose: 3000 });
    } finally {
      setFormIsLoading(false);
    }
  };

  const initiateClose = (queryId) => {
    setPendingCloseId(queryId);
    setShowConfirmDialog(true);
  };

  const handleClose = async () => {
    if (!pendingCloseId) return;

    setShowConfirmDialog(false);
    setFormIsLoading(true);

    setQueries(prev => prev.map(q => 
      q.queryId === pendingCloseId ? { ...q, status: 'Closed' } : q
    ));

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${BASE_URL}/api/queries/${pendingCloseId}/close`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` },
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to close query');

      setQueries(prev => prev.map(q => 
        q.queryId === data.queryId ? data : q
      ));
      setError(null);
      notifySuccess('Query closed successfully', { autoClose: 3000 });
    } catch (err) {
      console.error('Error closing query:', err);
      await fetchQueries();
      notifyError(err.message || 'Network error. Please try again.', { autoClose: 3000 });
    } finally {
      setPendingCloseId(null);
      setFormIsLoading(false);
    }
  };

  const cancelClose = () => {
    setShowConfirmDialog(false);
    setPendingCloseId(null);
  };

  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'ascending' ? 'descending' : 'ascending'
    }));
  };

  const toggleResponses = (queryId) => {
    setExpandedResponses(expandedResponses === queryId ? null : queryId);
  };

  const filteredQueries = queries.filter(query => {
    const queryId = String(query.queryId || '');
    const description = (query.description || '').toLowerCase();
    const status = query.status || '';
    const matchesSearch = 
      queryId.includes(searchTerm.toLowerCase()) ||
      description.includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'All' || status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const sortedQueries = useMemo(() => {
    const sortableQueries = [...filteredQueries];
    if (sortConfig.key) {
      sortableQueries.sort((a, b) => {
        let aValue = a[sortConfig.key] ?? '';
        let bValue = b[sortConfig.key] ?? '';
        if (sortConfig.key === 'createdAt') { // Handle date sorting
          aValue = new Date(aValue || 0);
          bValue = new Date(bValue || 0);
        }
        return aValue < bValue 
          ? (sortConfig.direction === 'ascending' ? -1 : 1) 
          : aValue > bValue 
            ? (sortConfig.direction === 'ascending' ? 1 : -1) 
            : 0;
      });
    }
    return sortableQueries;
  }, [filteredQueries, sortConfig]);

  if (isLoading && !queries.length) return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8 flex items-center justify-center" aria-live="polite">
      <div className="text-gray-600 text-xl animate-pulse">Loading queries...</div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8">
      <h1 className="text-4xl font-bold text-gray-800 mb-10 text-center tracking-tight">My Queries</h1>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-6 py-4 rounded-lg mb-6 max-w-4xl mx-auto shadow-md flex items-center" role="alert">
          {error}
          <button 
            onClick={() => setError(null)}
            className="ml-4 text-red-700 hover:text-red-900 focus:outline-none focus:ring-2 focus:ring-red-300"
            aria-label="Dismiss error"
          >
            <XCircle size={20} />
          </button>
        </div>
      )}

      <div className="flex mb-8 gap-4 max-w-4xl mx-auto flex-wrap">
        <div className="relative flex-1 min-w-0">
          <label htmlFor="search-queries" className="sr-only">Search Queries</label>
          <input
            id="search-queries"
            type="text"
            placeholder="Search by Query ID or Description..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full p-4 pl-12 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300 text-lg bg-white shadow-md transition-all duration-300"
          />
          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" />
        </div>
        <div>
          <label htmlFor="status-filter" className="sr-only">Filter by Status</label>
          <select
            id="status-filter"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="p-4 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300 text-lg bg-white shadow-md w-40"
          >
            <option value="All">All Queries</option>
            <option value="Open">Open</option>
            <option value="In Progress">In Progress</option>
            <option value="Closed">Closed</option>
          </select>
        </div>
        <button 
          onClick={fetchQueries}
          className="p-4 bg-amber-400 text-gray-900 rounded-lg hover:bg-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-300 transition-all duration-300 shadow-md text-lg w-32"
          disabled={isLoading}
          aria-label="Refresh queries"
        >
          {isLoading && queries.length > 0 ? 'Refreshing...' : 'Refresh'}
        </button>
        <button
          onClick={() => setShowCreateForm(true)}
          className="p-4 bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-lg hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-300 transition-all duration-300 shadow-md hover:shadow-lg text-lg font-semibold flex items-center w-44"
          disabled={formIsLoading}
          aria-label="Create new query"
        >
          <PlusCircle className="mr-2" /> Create Query
        </button>
      </div>

      {isLoading && queries.length > 0 && (
        <div className="text-gray-600 text-lg mb-4 text-center" aria-live="polite">Refreshing data...</div>
      )}

      {sortedQueries.length === 0 ? (
        <div className="text-center py-12 text-gray-500 flex flex-col items-center max-w-4xl mx-auto" role="alert">
          <Filter className="mb-4 text-gray-400" size={48} />
          <p className="text-lg">No queries found matching your filters.</p>
        </div>
      ) : (
        <div className="max-w-6xl mx-auto overflow-x-auto">
          <table 
            className="w-full text-left border-collapse bg-white rounded-2xl shadow-lg" 
            role="grid" 
            aria-label="Customer queries table"
            ref={tableRef}
            tabIndex={0}
          >
            <thead>
              <tr className="bg-gradient-to-r from-amber-200 via-amber-100 to-amber-50" role="row">
                {[
                  { key: 'queryId', label: 'Query ID' },
                  { key: 'description', label: 'Description' },
                  { key: 'status', label: 'Status' },
                  { key: 'createdAt', label: 'Created At' },
                  { key: null, label: 'Admin Responses' },
                  { key: null, label: 'Actions' },
                ].map(({ key, label }) => (
                  <th
                    key={label}
                    onClick={() => key && handleSort(key)}
                    className={`py-3 px-4 text-gray-800 text-base font-semibold ${key ? 'cursor-pointer hover:bg-amber-300' : ''} transition-all duration-200`}
                    aria-sort={sortConfig.key === key ? (sortConfig.direction === 'ascending' ? 'ascending' : 'descending') : 'none'}
                    scope="col"
                  >
                    <div className="flex items-center justify-between">
                      <span>{label}</span>
                      {key && (
                        <span className={`ml-2 ${sortConfig.key === key ? 'text-gray-900' : 'text-gray-600 opacity-50'}`}>
                          {sortConfig.key === key && sortConfig.direction === 'ascending' ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </span>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedQueries.map((query) => (
                <React.Fragment key={query.queryId}>
                  <tr className="border-t hover:bg-amber-50 transition-all duration-200" role="row">
                    <td className="py-3 px-4 text-gray-600 text-base">{query.queryId}</td>
                    <td className="py-3 px-4 text-gray-600 text-base">{query.description}</td>
                    <td className="py-3 px-4 text-gray-600 text-base">
                      <span 
                        className={`px-3 py-1 rounded-full text-white text-sm font-medium ${
                          query.status === 'Open' ? 'bg-amber-500' :
                          query.status === 'In Progress' ? 'bg-yellow-600' :
                          query.status === 'Closed' ? 'bg-gray-500' : 'bg-gray-400'
                        }`}
                      >
                        {query.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-gray-600 text-base">
                      {query.createdAt ? formatDate(query.createdAt) : 'N/A'}
                    </td>
                    <td className="py-3 px-4 text-gray-600 text-base">
                      {Array.isArray(query.adminResponses) && query.adminResponses.length > 0 ? (
                        <button
                          onClick={() => toggleResponses(query.queryId)}
                          className="bg-blue-50 hover:bg-blue-100 text-blue-700 font-medium px-4 py-2 rounded-md border border-blue-200 shadow-sm transition-all duration-200 flex items-center space-x-1 focus:outline-none focus:ring-2 focus:ring-amber-300"
                          aria-label={`Toggle ${query.adminResponses.length} admin responses for query ${query.queryId}`}
                        >
                          <span className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold">
                            {query.adminResponses.length}
                          </span>
                          <span>{query.adminResponses.length === 1 ? 'Response' : 'Responses'}</span>
                        </button>
                      ) : (
                        <span className="text-gray-400 text-sm">No responses yet</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-gray-600 text-base">
                      {query.status !== 'Closed' && (
                        <button
                          onClick={() => initiateClose(query.queryId)}
                          className="bg-gradient-to-r from-gray-500 to-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-300 transition-all duration-300 shadow-md disabled:bg-gray-300 disabled:cursor-not-allowed text-base font-medium"
                          disabled={formIsLoading}
                          aria-label={`Close query ${query.queryId}`}
                        >
                          Close
                        </button>
                      )}
                    </td>
                  </tr>
                  {expandedResponses === query.queryId && Array.isArray(query.adminResponses) && query.adminResponses.length > 0 && (
                    <tr className="bg-blue-50">
                      <td colSpan="6" className="py-4 px-6">
                        <div className="border-l-4 border-blue-400 pl-4 space-y-3">
                          <div className="text-sm font-medium text-blue-700 mb-2">Admin Responses:</div>
                          {query.adminResponses.map((resp, idx) => (
                            <div key={idx} className="border-b border-blue-100 pb-3 last:border-b-0">
                              <div className="text-gray-700">{resp.response}</div>
                              <div className="text-xs text-gray-500 mt-1">{formatDate(resp.response_date)}</div>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreateForm && (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-60 flex items-center justify-center z-50" role="dialog" aria-labelledby="create-query-title">
          <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-2xl transform transition-all duration-300">
            <button
              onClick={() => setShowCreateForm(false)}
              className="absolute top-4 right-4 text-gray-500 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-300"
              aria-label="Close create query form"
            >
              <XCircle size={24} />
            </button>
            <h2 id="create-query-title" className="text-2xl font-bold text-gray-800 mb-6">Create New Query</h2>
            <form onSubmit={handleCreateQuery} className="space-y-6">
              <div>
                <label htmlFor="query-description" className="sr-only">Query Description</label>
                <textarea
                  id="query-description"
                  value={newQuery.description}
                  onChange={(e) => setNewQuery({ ...newQuery, description: e.target.value })}
                  required
                  className="w-full p-4 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300 text-lg bg-gray-50 shadow-md transition-all duration-200 disabled:bg-gray-200"
                  placeholder="Describe your query here..."
                  rows="6"
                  disabled={formIsLoading}
                  aria-label="Enter query description"
                />
              </div>
              <div className="flex justify-end space-x-4">
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="px-6 py-3 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-amber-300 transition-all duration-300 shadow-md disabled:bg-gray-400 disabled:cursor-not-allowed"
                  disabled={formIsLoading}
                  aria-label="Cancel query creation"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-3 bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-lg hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-300 transition-all duration-300 shadow-md hover:shadow-lg disabled:bg-gray-400 disabled:shadow-none disabled:cursor-not-allowed"
                  disabled={formIsLoading}
                  aria-label="Submit query"
                >
                  {formIsLoading ? 'Creating...' : 'Create Query'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showConfirmDialog && (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-60 flex items-center justify-center z-50" role="dialog" aria-labelledby="confirm-close-title">
          <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-2xl transform transition-all duration-300">
            <h2 id="confirm-close-title" className="text-2xl font-bold text-gray-800 mb-6">Confirm Close</h2>
            <p className="text-gray-600 text-lg mb-6">Are you sure you want to close this query? This action cannot be undone.</p>
            <div className="flex justify-end space-x-4">
              <button
                onClick={cancelClose}
                className="px-6 py-3 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-amber-300 transition-all duration-300 shadow-md disabled:bg-gray-400 disabled:cursor-not-allowed"
                disabled={formIsLoading}
                aria-label="Cancel closing query"
              >
                Cancel
              </button>
              <button
                onClick={handleClose}
                className="px-6 py-3 bg-gradient-to-r from-gray-600 to-gray-700 text-white rounded-lg hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-amber-300 transition-all duration-300 shadow-md disabled:bg-gray-400 disabled:shadow-none disabled:cursor-not-allowed"
                disabled={formIsLoading}
                aria-label="Confirm close query"
              >
                {formIsLoading ? 'Closing...' : 'Close Query'}
              </button>
            </div>
          </div>
        </div>
      )}

</div>
  );
}

export default CustomerQueriesPage;