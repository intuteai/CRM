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
      <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8 flex items-center justify-center">
        <div className="flex items-center gap-3 text-gray-600 text-xl">
          <svg className="animate-spin h-6 w-6 text-amber-400" fill="none" viewBox="0 0 24 24">
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
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-6 md:p-10">
      <h1 className="text-4xl md:text-5xl font-extrabold text-gray-800 mb-12 text-center tracking-tight drop-shadow-md animate-fade-in">
        Production Queries
      </h1>

      {queryError && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-6 py-4 rounded-xl mb-8 max-w-4xl mx-auto shadow-lg flex items-center">
          {queryError}
          <button onClick={() => setError(null)} className="ml-4 text-red-700 hover:text-red-900">
            <X size={20} />
          </button>
        </div>
      )}

      <div className="flex mb-10 gap-6 max-w-4xl mx-auto flex-col sm:flex-row">
        <div className="relative flex-1 min-w-0 group">
          <input
            id="search-queries"
            type="text"
            placeholder="Search by Query ID, Customer Name, or Description..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full p-4 pl-12 border border-gray-200 rounded-xl bg-white shadow-md focus:outline-none focus:ring-2 focus:ring-amber-300 text-lg transition-all duration-300 group-hover:shadow-lg group-hover:border-amber-300"
          />
          <svg className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 group-hover:text-amber-500 transition-colors duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <select
          id="status-filter"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="p-4 border border-gray-200 rounded-xl bg-white shadow-md focus:outline-none focus:ring-2 focus:ring-amber-300 text-lg w-full sm:w-40 transition-all duration-300 hover:shadow-lg"
        >
          <option value="All">All Queries</option>
          <option value="Open">Open</option>
          <option value="In Progress">In Progress</option>
          <option value="Closed">Closed</option>
        </select>
        <button 
          onClick={fetchQueries}
          className="group relative px-6 py-3 bg-amber-400 text-gray-900 rounded-xl font-semibold shadow-md hover:shadow-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden w-full sm:w-auto"
          disabled={isLoading || queriesLoading}
        >
          <span className="relative z-10 flex items-center justify-center gap-2">
            {isLoading || (queriesLoading && queries.length > 0) ? (
              <>
                <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Refreshing...
              </>
            ) : (
              <>
                <svg className="w-5 h-5 group-hover:animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh
              </>
            )}
          </span>
          <span className="absolute inset-0 bg-amber-500 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left"></span>
        </button>
      </div>

      {filteredQueries.length === 0 ? (
        <div className="text-center py-12 text-gray-500 text-xl font-medium animate-pulse max-w-4xl mx-auto bg-amber-50 rounded-xl shadow-md">
          No queries found matching your filters.
        </div>
      ) : (
        <div className="max-w-[95vw] mx-auto overflow-x-auto">
          <div className="bg-gradient-to-br from-white to-amber-50 rounded-3xl shadow-2xl border border-amber-100 animate-table-pop">
            <table className="w-full text-left border-collapse" ref={tableRef} tabIndex={0}>
              <thead>
                <tr className="bg-gradient-to-r from-amber-300 via-amber-200 to-amber-100 text-gray-800">
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
                      className={`px-6 md:px-8 py-4 text-lg font-bold ${key ? 'cursor-pointer hover:bg-amber-400' : 'cursor-default'} transition-all duration-300 whitespace-nowrap border-b border-amber-200 shadow-sm`}
                    >
                      <div className="flex justify-between items-center">
                        {label}
                        {key && (
                          <ArrowDownUp size={18} className={`ml-2 text-gray-700 ${sortConfig.key === key ? 'text-amber-600 animate-pulse' : 'opacity-60'} hover:text-amber-800 transition-colors duration-200`} />
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-100">
                {filteredQueries.map((query, index) => (
                  <React.Fragment key={query.queryId}>
                    <tr 
                      className="bg-white hover:bg-amber-50 transition-all duration-300 hover:shadow-md transform hover:-translate-y-1"
                      style={{ animation: `tableRowFade 0.4s ease-in ${index * 0.05}s both` }}
                    >
                      <td className="px-6 md:px-8 py-4 text-gray-700 font-semibold">{query.queryId}</td>
                      <td className="px-6 md:px-8 py-4 text-gray-600">{query.customerName || 'N/A'}</td>
                      <td className="px-6 md:px-8 py-4 text-gray-600">{query.description}</td>
                      <td className="px-6 md:px-8 py-4 text-gray-600">
                        <span className={`px-3 py-1 rounded-full text-white text-sm font-medium shadow-sm ${
                          query.status === 'Open' ? 'bg-amber-400' :
                          query.status === 'In Progress' ? 'bg-yellow-500' :
                          query.status === 'Closed' ? 'bg-gray-500' : 'bg-gray-400'
                        }`}>
                          {query.status}
                        </span>
                      </td>
                      <td className="px-6 md:px-8 py-4 text-gray-600">{query.createdAt ? formatDate(query.createdAt) : 'N/A'}</td>
                      <td className="px-6 md:px-8 py-4 text-gray-600">
                        {Array.isArray(query.adminResponses) && query.adminResponses.length > 0 ? (
                          <button
                            onClick={() => toggleResponses(query.queryId)}
                            className="group relative bg-blue-100 text-blue-700 font-semibold px-4 py-2 rounded-xl shadow-md hover:shadow-lg transition-all duration-300 overflow-hidden transform hover:scale-105"
                          >
                            <span className="relative z-10 flex items-center gap-2">
                              <span className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold">
                                {query.adminResponses.length}
                              </span>
                              {query.adminResponses.length === 1 ? 'Response' : 'Responses'}
                            </span>
                            <span className="absolute inset-0 bg-blue-200 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-center"></span>
                          </button>
                        ) : (
                          <span className="text-gray-400 text-sm">No responses yet</span>
                        )}
                      </td>
                      <td className="px-6 md:px-8 py-4 text-gray-600">
                        <div className="flex gap-2 flex-wrap">
                          <button
                            onClick={() => handleRespond(query)}
                            className="group relative px-4 py-2 bg-amber-400 text-gray-900 rounded-xl font-semibold shadow-md hover:shadow-xl transition-all duration-300 overflow-hidden disabled:opacity-50 transform hover:scale-105"
                            disabled={query.status === 'Closed' || isLoading}
                          >
                            <span className="relative z-10">Respond</span>
                            <span className="absolute inset-0 bg-amber-500 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left"></span>
                          </button>
                          {query.status !== 'Closed' && (
                            <button
                              onClick={() => handleInProgress(query.queryId)}
                              className="group relative px-4 py-2 bg-yellow-500 text-white rounded-xl font-semibold shadow-md hover:shadow-xl transition-all duration-300 overflow-hidden disabled:opacity-50 transform hover:scale-105"
                              disabled={query.status === 'In Progress' || isLoading}
                            >
                              <span className="relative z-10">In Progress</span>
                              <span className="absolute inset-0 bg-yellow-600 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left"></span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {expandedResponses === query.queryId && Array.isArray(query.adminResponses) && query.adminResponses.length > 0 && (
                      <tr className="bg-blue-50">
                        <td colSpan="7" className="px-6 md:px-8 py-4">
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
        </div>
      )}

      {showRespondForm && respondingQuery && (
        <div className="fixed inset-0 bg-gray-800 bg-opacity-60 flex items-center justify-center z-50 transition-opacity duration-500">
          <div className="bg-gradient-to-br from-white to-amber-50 p-8 rounded-3xl shadow-2xl w-full max-w-2xl animate-form-pop relative">
            <button
              onClick={() => setShowRespondForm(false)}
              className="absolute top-4 right-4 p-2 bg-red-500 text-white rounded-full hover:bg-red-600 transition-all duration-300 shadow-md hover:shadow-lg transform hover:rotate-90"
            >
              <X size={20} />
            </button>
            <h2 className="text-3xl font-extrabold text-gray-800 mb-6 text-center bg-gradient-to-r from-amber-400 to-green-500 bg-clip-text text-transparent">
              Respond to Query #{respondingQuery.queryId}
            </h2>
            <form onSubmit={handleSubmitResponse} className="space-y-6">
              <div className="relative group">
                <svg className="absolute left-3 top-5 w-5 h-5 text-amber-400 group-hover:text-amber-500 transition-colors duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                </svg>
                <textarea
                  id="response-text"
                  value={responseText}
                  onChange={(e) => setResponseText(e.target.value)}
                  required
                  className="w-full pl-10 p-4 border border-gray-200 rounded-xl bg-white text-gray-800 focus:outline-none focus:ring-4 focus:ring-amber-200 focus:border-amber-400 shadow-md hover:shadow-lg transition-all duration-300 placeholder-gray-400 disabled:bg-gray-200"
                  placeholder="Enter your response here..."
                  rows="6"
                  disabled={isLoading}
                />
              </div>
              <div className="flex justify-end gap-4">
                <button
                  type="button"
                  onClick={() => setShowRespondForm(false)}
                  className="group relative px-6 py-3 bg-gradient-to-r from-gray-300 to-gray-400 text-gray-800 rounded-xl font-semibold shadow-md hover:shadow-xl transition-all duration-300 overflow-hidden disabled:opacity-50 transform hover:scale-105"
                  disabled={isLoading}
                >
                  <span className="relative z-10">Cancel</span>
                  <span className="absolute inset-0 bg-gray-500 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left"></span>
                </button>
                <button
                  type="submit"
                  className="group relative px-6 py-3 bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-xl font-semibold shadow-md hover:shadow-xl transition-all duration-300 overflow-hidden disabled:opacity-50 transform hover:scale-105"
                  disabled={isLoading}
                >
                  <span className="relative z-10 flex items-center gap-2">
                    {isLoading ? 'Submitting...' : (
                      <>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                        </svg>
                        Submit Response
                      </>
                    )}
                  </span>
                  <span className="absolute inset-0 bg-amber-700 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-right"></span>
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