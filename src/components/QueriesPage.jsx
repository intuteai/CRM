import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import { formatDate, showNotification } from '../utils/helpers';
import { useQueries } from '../hooks/useQueries';

function QueriesPage() {
  const { queries, setQueries, isLoading: queriesLoading, error: queryError, fetchQueries, setError } = useQueries();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('All');
  const [showRespondForm, setShowRespondForm] = useState(false);
  const [respondingQuery, setRespondingQuery] = useState(null);
  const [responseText, setResponseText] = useState('');
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingCloseId, setPendingCloseId] = useState(null);
  const [notification, setNotification] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedResponses, setExpandedResponses] = useState(null);

  useEffect(() => {
    let socket;
    try {
      socket = io('http://localhost:5000');
      socket.on('connect', () => console.log('Connected to Socket.IO'));
      socket.on('connect_error', (err) => {
        console.error('Socket connection error:', err);
        setError('Failed to connect to real-time updates.');
      });
      socket.on('newQuery', (query) => {
        setQueries(prev => {
          if (prev.some(q => q.queryId === query.queryId)) return prev;
          return [...prev, query];
        });
        showNotification(setNotification, 'New query has been added');
      });
      socket.on('queryUpdate', (updatedQuery) => {
        setQueries(prev => {
          const updatedQueries = prev.map(q => 
            q.queryId === updatedQuery.queryId ? updatedQuery : q
          );
          return updatedQueries;
        });
        showNotification(setNotification, `Query #${updatedQuery.queryId} updated`);
      });
      fetchQueries();
    } catch (err) {
      console.error('Socket initialization error:', err);
      setError('Failed to initialize real-time updates.');
      fetchQueries();
    }
    return () => {
      if (socket) socket.disconnect();
    };
  }, [fetchQueries, setQueries, setError]);

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
      setError('Response text is required');
      return;
    }
    setIsLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/queries/${respondingQuery.queryId}/respond`, {
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
        showNotification(setNotification, 'Response submitted successfully');
      } else {
        setError(data.error || 'Failed to submit response. Please try again.');
      }
    } catch (err) {
      console.error('Error submitting response:', err);
      setError('Network error. Please check your connection and try again.');
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
      const res = await fetch(`/api/queries/${queryId}/in-progress`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setQueries(prev => prev.map(q => 
          q.queryId === data.queryId ? data : q
        ));
        setError(null);
        showNotification(setNotification, 'Query set to In Progress');
      } else {
        await fetchQueries();
        setError(data.error || 'Failed to update query status.');
      }
    } catch (err) {
      console.error('Error updating query status:', err);
      await fetchQueries();
      setError('Network error. Please check your connection and try again.');
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
      const res = await fetch(`/api/queries/${pendingCloseId}/close`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setQueries(prev => prev.map(q => 
          q.queryId === data.queryId ? data : q
        ));
        setError(null);
        showNotification(setNotification, 'Query closed successfully');
      } else {
        await fetchQueries();
        setError(data.error || 'Failed to close query.');
      }
    } catch (err) {
      console.error('Error closing query:', err);
      await fetchQueries();
      setError('Network error. Please check your connection and try again.');
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
      <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8">
        <div className="flex justify-center items-center h-64">
          <div className="text-gray-600 text-xl">Loading queries...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8">
      <h1 className="text-4xl font-bold text-gray-800 mb-10 text-center tracking-tight">Queries</h1>
      
      {queryError && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-6 py-4 rounded-lg mb-6 max-w-4xl mx-auto shadow-md">
          {queryError}
          <button 
            className="float-right text-red-700 hover:text-red-900"
            onClick={() => setError(null)}
          >
            ×
          </button>
        </div>
      )}
      
      {notification && (
        <div className="bg-amber-100 border border-amber-400 text-amber-800 px-6 py-4 rounded-lg mb-6 fixed top-8 right-8 z-50 shadow-lg transform transition-all duration-300">
          {notification}
        </div>
      )}
      
      <div className="flex mb-8 gap-6 max-w-4xl mx-auto">
        <input
          type="text"
          placeholder="Search Queries..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full p-4 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300 text-lg bg-white shadow-md"
        />
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="p-4 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300 text-lg bg-white shadow-md"
        >
          <option value="All">All Queries</option>
          <option value="Open">Open</option>
          <option value="In Progress">In Progress</option>
          <option value="Closed">Closed</option>
        </select>
        <button 
          onClick={fetchQueries}
          className="p-4 bg-amber-400 text-gray-900 rounded-lg hover:bg-amber-500 transition-all duration-300 shadow-md text-lg"
          title="Refresh queries"
        >
          Refresh
        </button>
      </div>
      
      {isLoading && queries.length > 0 && (
        <div className="text-gray-600 text-lg mb-4 text-center">Refreshing data...</div>
      )}
      
      {filteredQueries.length === 0 ? (
        <div className="text-center py-12 text-gray-500 text-xl max-w-4xl mx-auto">
          No queries found matching your filters.
        </div>
      ) : (
        <div className="max-w-6xl mx-auto overflow-x-auto">
          <table className="w-full text-left border-collapse bg-white rounded-2xl shadow-lg">
            <thead>
              <tr className="bg-gradient-to-r from-amber-100 to-amber-50">
                <th className="py-3 px-4 text-gray-700 text-base font-semibold">Query ID</th>
                <th className="py-3 px-4 text-gray-700 text-base font-semibold">Customer Name</th>
                <th className="py-3 px-4 text-gray-700 text-base font-semibold">Description</th>
                <th className="py-3 px-4 text-gray-700 text-base font-semibold">Status</th>
                <th className="py-3 px-4 text-gray-700 text-base font-semibold">Admin Responses</th>
                <th className="py-3 px-4 text-gray-700 text-base font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredQueries.map((query) => (
                <React.Fragment key={query.queryId}>
                  <tr className="border-t hover:bg-amber-50 transition-all duration-200">
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
                      {Array.isArray(query.adminResponses) && query.adminResponses.length > 0 ? (
                        <button
                          className="bg-blue-50 hover:bg-blue-100 text-blue-600 font-medium px-4 py-2 rounded-md border border-blue-200 shadow-sm transition-all duration-200 flex items-center space-x-1"
                          onClick={() => toggleResponses(query.queryId)}
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
                          className="bg-gradient-to-r from-amber-400 to-amber-500 text-gray-900 px-4 py-2 rounded-md hover:from-amber-500 hover:to-amber-600 transition-all duration-300 shadow-md disabled:bg-gray-300 disabled:cursor-not-allowed text-base font-medium"
                          disabled={query.status === 'Closed' || isLoading}
                        >
                          Respond
                        </button>
                        {query.status !== 'Closed' && (
                          <>
                            <button
                              onClick={() => handleInProgress(query.queryId)}
                              className="bg-gradient-to-r from-yellow-400 to-yellow-500 text-white px-4 py-2 rounded-md hover:from-yellow-500 hover:to-yellow-600 transition-all duration-300 shadow-md disabled:bg-gray-300 disabled:cursor-not-allowed text-base font-medium"
                              disabled={query.status === 'In Progress' || isLoading}
                            >
                              In Progress
                            </button>
                            <button
                              onClick={() => initiateClose(query.queryId)}
                              className="bg-gradient-to-r from-gray-500 to-gray-600 text-white px-4 py-2 rounded-md hover:from-gray-600 hover:to-gray-700 transition-all duration-300 shadow-md disabled:bg-gray-300 disabled:cursor-not-allowed text-base font-medium"
                              disabled={isLoading}
                            >
                              Close
                            </button>
                          </>
                        )}
                      </div>
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
      
      {showRespondForm && respondingQuery && (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-60 flex items-center justify-center z-50">
          <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-2xl transform transition-all duration-300">
            <h2 className="text-2xl font-bold text-gray-800 mb-6">
              Respond to Query #{respondingQuery.queryId}
            </h2>
            <form onSubmit={handleSubmitResponse} className="space-y-6">
              <textarea
                value={responseText}
                onChange={(e) => setResponseText(e.target.value)}
                required
                className="w-full p-4 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300 text-lg bg-gray-50 shadow-md"
                placeholder="Enter your response here..."
                rows="6"
                disabled={isLoading}
              />
              <div className="flex justify-end space-x-4">
                <button
                  type="button"
                  onClick={() => setShowRespondForm(false)}
                  className="px-6 py-3 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-all duration-300 shadow-md disabled:bg-gray-300 disabled:cursor-not-allowed"
                  disabled={isLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-3 bg-amber-400 text-gray-900 rounded-lg hover:bg-amber-500 transition-all duration-300 shadow-md disabled:bg-gray-300 disabled:cursor-not-allowed"
                  disabled={isLoading}
                >
                  {isLoading ? 'Submitting...' : 'Submit Response'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      
      {showConfirmDialog && (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-60 flex items-center justify-center z-50">
          <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-2xl transform transition-all duration-300">
            <h2 className="text-2xl font-bold text-gray-800 mb-6">Confirm Close</h2>
            <p className="text-gray-600 text-lg mb-6">Are you sure you want to close this query? This action cannot be undone.</p>
            <div className="flex justify-end space-x-4">
              <button
                onClick={cancelClose}
                className="px-6 py-3 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-all duration-300 shadow-md disabled:bg-gray-300 disabled:cursor-not-allowed"
                disabled={isLoading}
              >
                Cancel
              </button>
              <button
                onClick={handleClose}
                className="px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-all duration-300 shadow-md disabled:bg-gray-300 disabled:cursor-not-allowed"
                disabled={isLoading}
              >
                {isLoading ? 'Closing...' : 'Close Query'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default QueriesPage;