import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import { formatDate } from '../utils/helpers';
import { useQueries } from '../hooks/useQueries';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { ArrowDownUp } from 'lucide-react';

// Use the environment variable for the backend URL
const BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

function QueriesPage() {
  const { queries, setQueries, isLoading: queriesLoading, error: queryError, fetchQueries, setError } = useQueries();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('All');
  const [showRespondForm, setShowRespondForm] = useState(false);
  const [respondingQuery, setRespondingQuery] = useState(null);
  const [responseText, setResponseText] = useState('');
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingCloseId, setPendingCloseId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedResponses, setExpandedResponses] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: 'createdAt', direction: 'desc' }); // Default to sorting by createdAt descending
  const tableRef = useRef(null);

  useEffect(() => {
    const socket = io(BASE_URL, {
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      withCredentials: true,
      transports: ['websocket'],
    });

    socket.on('connect', () => {
      console.log('Connected to Socket.IO');
      toast.success('Connected to real-time updates!', { autoClose: 2000 });
    });

    socket.on('connect_error', (err) => {
      console.error('Socket connection error:', err);
      toast.error('Failed to connect to real-time updates.', { autoClose: 3000 });
    });

    socket.on('newQuery', (query) => {
      setQueries(prev => {
        if (prev.some(q => q.queryId === query.queryId)) return prev;
        toast.info('New query has been added', { autoClose: 2000 });
        return [...prev, query];
      });
      if (tableRef.current) tableRef.current.focus();
    });

    socket.on('queryUpdate', (updatedQuery) => {
      setQueries(prev => {
        const updatedQueries = prev.map(q => 
          q.queryId === updatedQuery.queryId ? updatedQuery : q
        );
        toast.info(`Query #${updatedQuery.queryId} updated in real-time`, { autoClose: 2000 });
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

  const sortData = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });

    setQueries(prev => {
      const sorted = [...prev].sort((a, b) => {
        let aValue = a[key] ?? '';
        let bValue = b[key] ?? '';
        if (key === 'queryId') {
          aValue = Number(aValue);
          bValue = Number(bValue);
        } else if (key === 'createdAt') {
          aValue = new Date(aValue || 0);
          bValue = new Date(bValue || 0);
        } else {
          aValue = String(aValue).toLowerCase();
          bValue = String(bValue).toLowerCase();
        }
        return aValue < bValue ? (direction === 'asc' ? -1 : 1) : aValue > bValue ? (direction === 'asc' ? 1 : -1) : 0;
      });
      return sorted;
    });
  };

  const filteredQueries = queries.filter(query => {
    const customerName = (query.customerName || '').toLowerCase();
    const queryId = String(query.queryId || '');
    const description = (query.description || '').toLowerCase();
    const status = query.status || '';
    const searchTermLower = searchTerm.toLowerCase();
    const matchesSearch = 
      customerName.includes(searchTermLower) ||
      queryId.includes(searchTermLower) ||
      description.includes(searchTermLower);
    const matchesStatus = filterStatus === 'All' || status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const handleRespond = (query) => {
    setRespondingQuery(query);
    setResponseText('');
    setShowRespondForm(true);
  };

  const handleSubmitResponse = async (e) => {
    e.preventDefault();
    if (!responseText.trim()) {
      toast.error('Response text is required', { autoClose: 3000 });
      return;
    }
    setIsLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${BASE_URL}/api/queries/${respondingQuery.queryId}/respond`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ response: responseText }),
      });
      const data = await res.json();
      if (res.ok) {
        setQueries(prev => prev.map(q => 
          q.queryId === data.queryId ? data : q
        ));
        setShowRespondForm(false);
        setRespondingQuery(null);
        setResponseText('');
        setError(null);
        toast.success('Response submitted successfully', { autoClose: 3000 });
      } else {
        throw new Error(data.error || 'Failed to submit response');
      }
    } catch (err) {
      console.error('Error submitting response:', err);
      toast.error(err.message || 'Network error. Please try again.', { autoClose: 3000 });
    } finally {
      setIsLoading(false);
    }
  };

  const handleInProgress = async (queryId) => {
    setQueries(prev => prev.map(q => 
      q.queryId === queryId ? { ...q, status: 'In Progress' } : q
    ));
    setIsLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${BASE_URL}/api/queries/${queryId}/in-progress`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setQueries(prev => prev.map(q => 
          q.queryId === data.queryId ? data : q
        ));
        setError(null);
        toast.success('Query set to In Progress', { autoClose: 3000 });
      } else {
        throw new Error(data.error || 'Failed to update query status');
      }
    } catch (err) {
      console.error('Error updating query status:', err);
      await fetchQueries();
      toast.error(err.message || 'Network error. Please try again.', { autoClose: 3000 });
    } finally {
      setIsLoading(false);
    }
  };

  const initiateClose = (queryId) => {
    setPendingCloseId(queryId);
    setShowConfirmDialog(true);
  };

  const handleClose = async () => {
    if (!pendingCloseId) return;
    setShowConfirmDialog(false);
    setQueries(prev => prev.map(q => 
      q.queryId === pendingCloseId ? { ...q, status: 'Closed' } : q
    ));
    setIsLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${BASE_URL}/api/queries/${pendingCloseId}/close`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setQueries(prev => prev.map(q => 
          q.queryId === data.queryId ? data : q
        ));
        setError(null);
        toast.success('Query closed successfully', { autoClose: 3000 });
      } else {
        throw new Error(data.error || 'Failed to close query');
      }
    } catch (err) {
      console.error('Error closing query:', err);
      await fetchQueries();
      toast.error(err.message || 'Network error. Please try again.', { autoClose: 3000 });
    } finally {
      setPendingCloseId(null);
      setIsLoading(false);
    }
  };

  const cancelClose = () => {
    setShowConfirmDialog(false);
    setPendingCloseId(null);
  };

  const toggleResponses = (queryId) => {
    setExpandedResponses(expandedResponses === queryId ? null : queryId);
  };

  if (queriesLoading && !queries.length) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8 flex items-center justify-center" aria-live="polite">
        <div className="text-gray-600 text-xl animate-pulse">Loading queries...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8">
      <h1 className="text-4xl font-bold text-gray-800 mb-10 text-center tracking-tight">Queries</h1>
      
      {queryError && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-6 py-4 rounded-lg mb-6 max-w-4xl mx-auto shadow-md flex items-center" role="alert">
          {queryError}
          <button 
            onClick={() => setError(null)}
            className="ml-4 text-red-700 hover:text-red-900 focus:outline-none focus:ring-2 focus:ring-red-300"
            aria-label="Dismiss error"
          >
            <span aria-hidden="true">&times;</span>
          </button>
        </div>
      )}
      
      <div className="flex mb-8 gap-6 max-w-4xl mx-auto flex-wrap">
        <div className="relative flex-1 min-w-0">
          <label htmlFor="search-queries" className="sr-only">Search Queries</label>
          <input
            id="search-queries"
            type="text"
            placeholder="Search by Query ID, Customer Name, or Description..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full p-4 pl-12 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300 text-lg bg-white shadow-md transition-all duration-300"
          />
          <ArrowDownUp className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
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
          disabled={isLoading || queriesLoading}
          aria-label="Refresh queries"
        >
          {isLoading || (queriesLoading && queries.length > 0) ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>
      
      {isLoading && queries.length > 0 && (
        <div className="text-gray-600 text-lg mb-4 text-center" aria-live="polite">Refreshing data...</div>
      )}
      
      {filteredQueries.length === 0 ? (
        <div className="text-center py-12 text-gray-500 text-xl max-w-4xl mx-auto" role="alert">
          No queries found matching your filters.
        </div>
      ) : (
        <div className="max-w-6xl mx-auto overflow-x-auto">
          <table 
            className="w-full text-left border-collapse bg-white rounded-2xl shadow-lg" 
            role="grid" 
            aria-label="Queries table"
            ref={tableRef}
            tabIndex={0}
          >
            <thead>
              <tr className="bg-gradient-to-r from-amber-200 via-amber-100 to-amber-50" role="row">
                {[
                  { label: 'Query ID', key: 'queryId' },
                  { label: 'Customer Name', key: 'customerName' },
                  { label: 'Description', key: 'description' },
                  { label: 'Status', key: 'status' },
                  { label: 'Created At', key: 'createdAt' }, // Added Created At column
                  { label: 'Admin Responses', key: null },
                  { label: 'Actions', key: null },
                ].map((header, idx) => (
                  <th 
                    key={idx}
                    className={`py-4 px-4 text-gray-800 text-base font-semibold ${header.key ? 'cursor-pointer hover:bg-amber-300' : ''} transition-all duration-200`}
                    scope="col"
                    onClick={header.key ? () => sortData(header.key) : undefined}
                    aria-sort={sortConfig.key === header.key ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                  >
                    <div className="flex items-center justify-between">
                      <span>{header.label}</span>
                      {header.key && (
                        <ArrowDownUp 
                          size={16} 
                          className={`ml-2 text-gray-600 ${sortConfig.key === header.key ? 'text-gray-900' : 'opacity-50'}`} 
                          aria-hidden="true" 
                        />
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredQueries.map((query) => (
                <React.Fragment key={query.queryId}>
                  <tr className="border-t hover:bg-amber-50 transition-all duration-200" role="row">
                    <td className="py-3 px-4 text-gray-600 text-base">{query.queryId}</td>
                    <td className="py-3 px-4 text-gray-600 text-base">{query.customerName || 'N/A'}</td>
                    <td className="py-3 px-4 text-gray-600 text-base">{query.description}</td>
                    <td className="py-3 px-4 text-gray-600 text-base">
                      <span 
                        className={`px-2 py-1 rounded-full text-white text-sm font-medium ${
                          query.status === 'Open' ? 'bg-amber-400' :
                          query.status === 'In Progress' ? 'bg-yellow-500' :
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
                          className="bg-blue-50 hover:bg-blue-100 text-blue-600 font-medium px-4 py-2 rounded-md border border-blue-200 shadow-sm transition-all duration-200 flex items-center space-x-1 focus:outline-none focus:ring-2 focus:ring-blue-300"
                          onClick={() => toggleResponses(query.queryId)}
                          aria-label={`Toggle ${query.adminResponses.length} response(s) for query ${query.queryId}`}
                          aria-expanded={expandedResponses === query.queryId}
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
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleRespond(query)}
                          className="bg-gradient-to-r from-amber-400 to-amber-500 text-gray-900 px-4 py-2 rounded-md hover:from-amber-500 hover:to-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-300 transition-all duration-300 shadow-md disabled:bg-gray-300 disabled:cursor-not-allowed text-base font-medium"
                          disabled={query.status === 'Closed' || isLoading}
                          aria-label={`Respond to query ${query.queryId}`}
                        >
                          Respond
                        </button>
                        {query.status !== 'Closed' && (
                          <>
                            <button
                              onClick={() => handleInProgress(query.queryId)}
                              className="bg-gradient-to-r from-yellow-400 to-yellow-500 text-white px-4 py-2 rounded-md hover:from-yellow-500 hover:to-yellow-600 focus:outline-none focus:ring-2 focus:ring-yellow-300 transition-all duration-300 shadow-md disabled:bg-gray-300 disabled:cursor-not-allowed text-base font-medium"
                              disabled={query.status === 'In Progress' || isLoading}
                              aria-label={`Set query ${query.queryId} to In Progress`}
                            >
                              In Progress
                            </button>
                            <button
                              onClick={() => initiateClose(query.queryId)}
                              className="bg-gradient-to-r from-gray-500 to-gray-600 text-white px-4 py-2 rounded-md hover:from-gray-600 hover:to-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-300 transition-all duration-300 shadow-md disabled:bg-gray-300 disabled:cursor-not-allowed text-base font-medium"
                              disabled={isLoading}
                              aria-label={`Close query ${query.queryId}`}
                            >
                              Close
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                  {expandedResponses === query.queryId && Array.isArray(query.adminResponses) && query.adminResponses.length > 0 && (
                    <tr className="bg-blue-50" role="row">
                      <td colSpan="7" className="py-4 px-6">
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
      
      {showRespondForm && respondingQuery && (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-60 flex items-center justify-center z-50" role="dialog" aria-labelledby="respond-form-title">
          <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-2xl transform transition-all duration-300">
            <h2 id="respond-form-title" className="text-2xl font-bold text-gray-800 mb-6">
              Respond to Query #{respondingQuery.queryId}
            </h2>
            <form onSubmit={handleSubmitResponse} className="space-y-6">
              <label htmlFor="response-text" className="sr-only">Response</label>
              <textarea
                id="response-text"
                value={responseText}
                onChange={(e) => setResponseText(e.target.value)}
                required
                className="w-full p-4 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300 text-lg bg-gray-50 shadow-md transition-all duration-200 disabled:bg-gray-200"
                placeholder="Enter your response here..."
                rows="6"
                disabled={isLoading}
              />
              <div className="flex justify-end space-x-4">
                <button
                  type="button"
                  onClick={() => setShowRespondForm(false)}
                  className="px-6 py-3 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-300 transition-all duration-300 shadow-md disabled:bg-gray-400 disabled:cursor-not-allowed"
                  disabled={isLoading}
                  aria-label="Cancel response"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-3 bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-lg hover:from-amber-600 hover:to-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-300 transition-all duration-300 shadow-md disabled:bg-gray-400 disabled:cursor-not-allowed"
                  disabled={isLoading}
                  aria-label="Submit response"
                >
                  {isLoading ? 'Submitting...' : 'Submit Response'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      
      {showConfirmDialog && (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-60 flex items-center justify-center z-50" role="dialog" aria-labelledby="confirm-dialog-title">
          <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-2xl transform transition-all duration-300">
            <h2 id="confirm-dialog-title" className="text-2xl font-bold text-gray-800 mb-6">Confirm Close</h2>
            <p className="text-gray-600 text-lg mb-6">Are you sure you want to close this query? This action cannot be undone.</p>
            <div className="flex justify-end space-x-4">
              <button
                onClick={cancelClose}
                className="px-6 py-3 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-300 transition-all duration-300 shadow-md disabled:bg-gray-400 disabled:cursor-not-allowed"
                disabled={isLoading}
                aria-label="Cancel close action"
              >
                Cancel
              </button>
              <button
                onClick={handleClose}
                className="px-6 py-3 bg-gradient-to-r from-gray-600 to-gray-700 text-white rounded-lg hover:from-gray-700 hover:to-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-300 transition-all duration-300 shadow-md disabled:bg-gray-400 disabled:cursor-not-allowed"
                disabled={isLoading}
                aria-label="Confirm close action"
              >
                {isLoading ? 'Closing...' : 'Close Query'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ToastContainer position="top-right" autoClose={3000} hideProgressBar={false} closeOnClick pauseOnHover draggable />
    </div>
  );
}

export default QueriesPage;