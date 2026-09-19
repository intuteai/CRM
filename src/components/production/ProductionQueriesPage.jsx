import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import { formatDate } from '../../utils/helpers';
import { useQueries } from '../../hooks/useQueries';
import { ArrowDownUp, X } from 'lucide-react';
import { useNotify } from '../../hooks/useNotify';
import ConnectionError from '../pages/ConnectionError.jsx';

const BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

function ProductionQueriesPage() {
  const { queries, setQueries, isLoading: queriesLoading, error: queryError, fetchQueries, setError } = useQueries();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('All');
  const [showRespondForm, setShowRespondForm] = useState(false);
  const [respondingQuery, setRespondingQuery] = useState(null);
  const [responseText, setResponseText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [expandedResponses, setExpandedResponses] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: 'createdAt', direction: 'desc' });
  const tableRef = useRef(null); 
  const { notifySuccess, notifyError, notifyInfo } = useNotify();

  useEffect(() => {
    const socket = io(BASE_URL, {
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      withCredentials: true,
      transports: ['websocket'],
    });

    socket.on('newQuery', (query) => {
      setQueries(prev => {
        if (prev.some(q => q.queryId === query.queryId)) return prev;
        notifyInfo('New query added!', { autoClose: 2000 });
        return [...prev, query];
      });
      if (tableRef.current) tableRef.current.focus();
    });

    socket.on('queryUpdate', (updatedQuery) => {
      setQueries(prev => {
        const updatedQueries = prev.map(q => q.queryId === updatedQuery.queryId ? updatedQuery : q);
        notifyInfo(`Query #${updatedQuery.queryId} updated`, { autoClose: 2000 });
        return updatedQueries;
      });
      if (tableRef.current) tableRef.current.focus();
    });

    fetchQueries();

    return () => socket.disconnect();
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
        return direction === 'asc' ? (aValue < bValue ? -1 : 1) : (aValue > bValue ? 1 : -1);
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
    return (
      (customerName.includes(searchTermLower) || queryId.includes(searchTermLower) || description.includes(searchTermLower)) &&
      (filterStatus === 'All' || status === filterStatus)
    );
  });

  const handleRespond = (query) => {
    setRespondingQuery(query);
    setResponseText('');
    setShowRespondForm(true);
  };

  const handleSubmitResponse = async (e) => {
    e.preventDefault();
    if (!responseText.trim()) {
      notifyError('Response text is required');
      return;
    }
    setIsLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${BASE_URL}/api/queries/${respondingQuery.queryId}/respond`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ response: responseText }),
      });
      const data = await res.json();
      if (res.ok) {
        setQueries(prev => prev.map(q => q.queryId === data.queryId ? data : q));
        setShowRespondForm(false);
        setRespondingQuery(null);
        setResponseText('');
        setError(null);
        notifySuccess('Response submitted successfully!');
      } else {
        throw new Error(data.error || 'Failed to submit response');
      }
    } catch (err) {
      console.error('Error submitting response:', err);
      notifyError(err.message || 'Network error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleInProgress = async (queryId) => {
    setQueries(prev => prev.map(q => q.queryId === queryId ? { ...q, status: 'In Progress' } : q));
    setIsLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${BASE_URL}/api/queries/${queryId}/in-progress`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setQueries(prev => prev.map(q => q.queryId === data.queryId ? data : q));
        setError(null);
        notifySuccess('Query set to In Progress');
      } else {
        throw new Error(data.error || 'Failed to update status');
      } 
    } catch (err) {
      console.error('Error updating status:', err);
      await fetchQueries();
      notifyError(err.message || 'Network error');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleResponses = (queryId) => {
    setExpandedResponses(expandedResponses === queryId ? null : queryId);
  };

  if (queriesLoading && !queries.length) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex items-center gap-3 text-gray-500 text-lg">
          <svg className="animate-spin h-6 w-6 text-gold-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading Queries...
        </div>
      </div>
    );
  }

  if (queryError) return <ConnectionError />;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {queryError && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-6 py-4 rounded-xl mb-8 max-w-4xl mx-auto shadow-lg flex items-center">
          {queryError}
          <button onClick={() => setError(null)} className="ml-4 text-red-700 hover:text-red-900">
            <X size={20} />
          </button>
        </div>
      )}

      <div className="flex gap-4 flex-col sm:flex-row">
        <div className="relative flex-1 min-w-0">
          <input
            id="search-queries"
            type="text"
            placeholder="Search by Query ID, Customer Name, or Description..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full p-3 pl-11 border border-navy-100 rounded-lg bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-gold-400 transition-colors"
          />
          <svg className="absolute left-3.5 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <select
          id="status-filter"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="p-3 border border-navy-100 rounded-lg bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-gold-400 w-full sm:w-40 transition-colors"
        >
          <option value="All">All Queries</option>
          <option value="Open">Open</option>
          <option value="In Progress">In Progress</option>
          <option value="Closed">Closed</option>
        </select>
        <button
          onClick={fetchQueries}
          className="flex items-center justify-center gap-2 px-5 py-3 bg-navy-800 text-white rounded-lg font-medium hover:bg-navy-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto"
          disabled={isLoading || queriesLoading}
        >
          {isLoading || (queriesLoading && queries.length > 0) ? (
            <>
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Refreshing...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </>
          )}
        </button>
      </div>

      {filteredQueries.length === 0 ? (
        <div className="text-center py-12 text-gray-400 bg-white rounded-xl shadow-sm">
          No queries found matching your filters.
        </div>
      ) : (
        <div className="overflow-x-auto bg-white rounded-xl shadow-sm border border-navy-100">
          <table className="w-full text-left border-collapse" ref={tableRef} tabIndex={0}>
              <thead>
                <tr className="bg-navy-50 text-navy-800">
                  {[
                    { label: 'Query ID', key: 'queryId' },
                    { label: 'Customer Name', key: 'customerName' },
                    { label: 'Description', key: 'description' },
                    { label: 'Status', key: 'status' },
                    { label: 'Created At', key: 'createdAt' },
                    { label: 'Admin Responses', key: null },
                    { label: 'Actions', key: null },
                  ].map(({ label, key }) => (
                    <th
                      key={label}
                      onClick={key ? () => sortData(key) : undefined}
                      className={`px-5 py-3 text-sm font-semibold ${key ? 'cursor-pointer hover:bg-navy-100' : 'cursor-default'} transition-colors whitespace-nowrap border-b border-navy-100`}
                    >
                      <div className="flex justify-between items-center">
                        {label}
                        {key && (
                          <ArrowDownUp size={15} className={`ml-2 ${sortConfig.key === key ? 'text-gold-500' : 'text-navy-400/50'}`} />
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-100">
                {filteredQueries.map((query) => (
                  <React.Fragment key={query.queryId}>
                    <tr className="hover:bg-navy-50/60 transition-colors">
                      <td className="px-5 py-3.5 text-navy-800 font-medium">{query.queryId}</td>
                      <td className="px-5 py-3.5 text-gray-600">{query.customerName || 'N/A'}</td>
                      <td className="px-5 py-3.5 text-gray-600 min-w-[220px]">{query.description}</td>
                      <td className="px-5 py-3.5">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                          query.status === 'Open' ? 'bg-gold-400/25 text-gold-600' :
                          query.status === 'In Progress' ? 'bg-blue-100 text-blue-700' :
                          query.status === 'Closed' ? 'bg-gray-100 text-gray-500' : 'bg-gray-100 text-gray-500'
                        }`}>
                          {query.status}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-gray-600">{query.createdAt ? formatDate(query.createdAt) : 'N/A'}</td>
                      <td className="px-5 py-3.5 text-gray-600">
                        {Array.isArray(query.adminResponses) && query.adminResponses.length > 0 ? (
                          <button
                            onClick={() => toggleResponses(query.queryId)}
                            className="flex items-center gap-2 bg-blue-50 text-blue-700 font-medium px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors text-sm"
                          >
                            <span className="bg-blue-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold">
                              {query.adminResponses.length}
                            </span>
                            {query.adminResponses.length === 1 ? 'Response' : 'Responses'}
                          </button>
                        ) : (
                          <span className="text-gray-400 text-sm">No responses yet</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex gap-2 flex-wrap">
                          <button
                            onClick={() => handleRespond(query)}
                            className="px-3.5 py-1.5 bg-navy-800 text-white text-sm rounded-lg font-medium hover:bg-navy-700 transition-colors disabled:opacity-50"
                            disabled={query.status === 'Closed' || isLoading}
                          >
                            Respond
                          </button>
                          {query.status !== 'Closed' && (
                              <button
                                onClick={() => handleInProgress(query.queryId)}
                                className="px-3.5 py-1.5 bg-blue-600 text-white text-sm rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
                                disabled={query.status === 'In Progress' || isLoading}
                              >
                                In Progress
                              </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {expandedResponses === query.queryId && Array.isArray(query.adminResponses) && query.adminResponses.length > 0 && (
                      <tr className="bg-blue-50/60">
                        <td colSpan="7" className="px-5 py-4">
                          <div className="border-l-4 border-blue-400 pl-4 space-y-4">
                            <div className="text-sm font-semibold text-blue-700">Admin Responses:</div>
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
        <div className="fixed inset-0 bg-navy-900/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-xl shadow-2xl w-full max-w-2xl relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setShowRespondForm(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-navy-800 transition-colors"
              aria-label="Close"
            >
              <X size={18} />
            </button>
            <h2 className="font-display text-xl font-bold text-navy-800 mb-5">
              Respond to Query #{respondingQuery.queryId}
            </h2>
            <form onSubmit={handleSubmitResponse} className="space-y-5">
              <textarea
                id="response-text"
                value={responseText}
                onChange={(e) => setResponseText(e.target.value)}
                required
                className="w-full p-3.5 border border-navy-100 rounded-lg bg-white text-navy-800 focus:outline-none focus:ring-2 focus:ring-gold-400 placeholder-gray-400 disabled:bg-gray-100"
                placeholder="Enter your response here..."
                rows="6"
                disabled={isLoading}
              />
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowRespondForm(false)}
                  className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors disabled:opacity-50"
                  disabled={isLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-navy-800 text-white rounded-lg font-medium hover:bg-navy-700 transition-colors disabled:opacity-50"
                  disabled={isLoading}
                >
                  {isLoading ? 'Submitting...' : 'Submit Response'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default ProductionQueriesPage;
