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
    <div className="flex items-center justify-center py-24" aria-live="polite">
      <div className="text-gray-500 text-lg">Loading queries...</div>
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-6 py-4 rounded-lg shadow-sm flex items-center" role="alert">
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-4 text-red-700 hover:text-red-900 focus:outline-none"
            aria-label="Dismiss error"
          >
            <XCircle size={20} />
          </button>
        </div>
      )}

      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-[220px]">
          <label htmlFor="search-queries" className="sr-only">Search Queries</label>
          <input
            id="search-queries"
            type="text"
            placeholder="Search by Query ID or Description..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full p-3 pl-11 border border-navy-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-400 bg-white shadow-sm transition-colors"
          />
          <Search size={17} className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-gray-400" />
        </div>
        <div>
          <label htmlFor="status-filter" className="sr-only">Filter by Status</label>
          <select
            id="status-filter"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="p-3 border border-navy-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-400 bg-white shadow-sm w-40"
          >
            <option value="All">All Queries</option>
            <option value="Open">Open</option>
            <option value="In Progress">In Progress</option>
            <option value="Closed">Closed</option>
          </select>
        </div>
        <button
          onClick={fetchQueries}
          className="px-5 py-3 bg-navy-800 text-white rounded-lg font-medium hover:bg-navy-700 transition-colors disabled:opacity-50"
          disabled={isLoading}
          aria-label="Refresh queries"
        >
          {isLoading && queries.length > 0 ? 'Refreshing...' : 'Refresh'}
        </button>
        <button
          onClick={() => setShowCreateForm(true)}
          className="px-5 py-3 bg-gold-500 text-navy-900 rounded-lg font-semibold hover:bg-gold-400 transition-colors flex items-center disabled:opacity-50"
          disabled={formIsLoading}
          aria-label="Create new query"
        >
          <PlusCircle size={18} className="mr-2" /> Create Query
        </button>
      </div>

      {isLoading && queries.length > 0 && (
        <div className="text-gray-500 text-sm text-center" aria-live="polite">Refreshing data...</div>
      )}

      {sortedQueries.length === 0 ? (
        <div className="text-center py-12 text-gray-400 flex flex-col items-center bg-white rounded-xl shadow-sm border border-navy-100" role="alert">
          <Filter className="mb-4 text-gray-300" size={40} />
          <p>No queries found matching your filters.</p>
        </div>
      ) : (
        <div className="overflow-x-auto bg-white rounded-xl shadow-sm border border-navy-100">
          <table
            className="w-full text-left border-collapse"
            role="grid"
            aria-label="Customer queries table"
            ref={tableRef}
            tabIndex={0}
          >
            <thead>
              <tr className="bg-navy-50" role="row">
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
                    className={`py-3 px-4 text-navy-800 text-sm font-semibold whitespace-nowrap border-b border-navy-100 ${key ? 'cursor-pointer hover:bg-navy-100' : ''} transition-colors`}
                    aria-sort={sortConfig.key === key ? (sortConfig.direction === 'ascending' ? 'ascending' : 'descending') : 'none'}
                    scope="col"
                  >
                    <div className="flex items-center justify-between">
                      <span>{label}</span>
                      {key && (
                        <span className={`ml-2 ${sortConfig.key === key ? 'text-gold-500' : 'text-navy-400/50'}`}>
                          {sortConfig.key === key && sortConfig.direction === 'ascending' ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                        </span>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-100">
              {sortedQueries.map((query) => (
                <React.Fragment key={query.queryId}>
                  <tr className="hover:bg-navy-50/60 transition-colors" role="row">
                    <td className="py-3.5 px-4 text-navy-800 font-medium">{query.queryId}</td>
                    <td className="py-3.5 px-4 text-gray-600 min-w-[220px] lg:min-w-0">{query.description}</td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                          query.status === 'Open' ? 'bg-gold-400/25 text-gold-600' :
                          query.status === 'In Progress' ? 'bg-blue-100 text-blue-700' :
                          'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {query.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-gray-600">
                      {query.createdAt ? formatDate(query.createdAt) : 'N/A'}
                    </td>
                    <td className="py-3.5 px-4 text-gray-600">
                      {Array.isArray(query.adminResponses) && query.adminResponses.length > 0 ? (
                        <button
                          onClick={() => toggleResponses(query.queryId)}
                          className="flex items-center gap-2 bg-blue-50 text-blue-700 font-medium px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors text-sm"
                          aria-label={`Toggle ${query.adminResponses.length} admin responses for query ${query.queryId}`}
                        >
                          <span className="bg-blue-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold">
                            {query.adminResponses.length}
                          </span>
                          <span>{query.adminResponses.length === 1 ? 'Response' : 'Responses'}</span>
                        </button>
                      ) : (
                        <span className="text-gray-400 text-sm">No responses yet</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      {query.status !== 'Closed' && (
                        <button
                          onClick={() => initiateClose(query.queryId)}
                          className="px-3.5 py-1.5 bg-gray-100 text-gray-700 text-sm rounded-lg font-medium hover:bg-gray-200 transition-colors disabled:opacity-50"
                          disabled={formIsLoading}
                          aria-label={`Close query ${query.queryId}`}
                        >
                          Close
                        </button>
                      )}
                    </td>
                  </tr>
                  {expandedResponses === query.queryId && Array.isArray(query.adminResponses) && query.adminResponses.length > 0 && (
                    <tr className="bg-blue-50/60">
                      <td colSpan="6" className="py-4 px-6">
                        <div className="border-l-4 border-blue-400 pl-4 space-y-3">
                          <div className="text-sm font-semibold text-blue-700 mb-2">Admin Responses:</div>
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
        <div className="fixed inset-0 bg-navy-900/50 flex items-center justify-center z-50 p-4" role="dialog" aria-labelledby="create-query-title">
          <div className="bg-white p-6 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto relative">
            <button
              onClick={() => setShowCreateForm(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-navy-800 transition-colors"
              aria-label="Close create query form"
            >
              <XCircle size={20} />
            </button>
            <h2 id="create-query-title" className="font-display text-xl font-bold text-navy-800 mb-5 pr-8">Create New Query</h2>
            <form onSubmit={handleCreateQuery} className="space-y-5">
              <div>
                <label htmlFor="query-description" className="sr-only">Query Description</label>
                <textarea
                  id="query-description"
                  value={newQuery.description}
                  onChange={(e) => setNewQuery({ ...newQuery, description: e.target.value })}
                  required
                  className="w-full p-3.5 border border-navy-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-400 bg-white text-navy-800 placeholder-gray-400 disabled:bg-gray-100"
                  placeholder="Describe your query here..."
                  rows="6"
                  disabled={formIsLoading}
                  aria-label="Enter query description"
                />
              </div>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors disabled:opacity-50"
                  disabled={formIsLoading}
                  aria-label="Cancel query creation"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-gold-500 text-navy-900 rounded-lg font-semibold hover:bg-gold-400 transition-colors disabled:opacity-50"
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
        <div className="fixed inset-0 bg-navy-900/50 flex items-center justify-center z-50 p-4" role="dialog" aria-labelledby="confirm-close-title">
          <div className="bg-white p-6 rounded-xl shadow-2xl w-full max-w-md">
            <h2 id="confirm-close-title" className="font-display text-xl font-bold text-navy-800 mb-4">Confirm Close</h2>
            <p className="text-gray-600 mb-6">Are you sure you want to close this query? This action cannot be undone.</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={cancelClose}
                className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors disabled:opacity-50"
                disabled={formIsLoading}
                aria-label="Cancel closing query"
              >
                Cancel
              </button>
              <button
                onClick={handleClose}
                className="px-5 py-2.5 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
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
