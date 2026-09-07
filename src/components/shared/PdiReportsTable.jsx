// CRM/src/components/shared/PdiReportsTable.jsx
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowDownUp, Search, Eye, Pencil, Trash2 } from 'lucide-react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { io } from 'socket.io-client';
import { useNotify } from '../../hooks/useNotify';
import ConnectionError from '../pages/ConnectionError.jsx';

const BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

// Roles that can open a report back up in the Generator to keep working on it.
// Everyone else (who can still see this dashboard) gets view/download only —
// matches who already has route access to /pdi-generator today.
const RESUME_ROLES = ['admin', 'production'];

// Date-only on purpose — the dashboard shows the inspection date, not a
// timestamp, so this deliberately doesn't use utils/helpers' formatDate
// (which includes the time).
const formatDate = (dateString) => {
  if (!dateString) return 'N/A';
  try {
    return new Date(dateString).toLocaleDateString();
  } catch (error) {
    console.error('Error formatting date:', error);
    return dateString;
  }
};

export default function PdiReportsTable({ socket: providedSocket, userRole: userRoleProp, title = 'PDI Reports' }) {
  // Prefer a live `userRole` prop (threaded down from App.jsx/routeConfig.jsx
  // via renderRoute) so a logout/login in the same tab — which this app does
  // via SPA nav, no full page reload — is reflected immediately. Fall back to
  // localStorage only when no prop is supplied, so the component still works
  // standalone.
  const userRole = userRoleProp || localStorage.getItem('role');
  const canManage = RESUME_ROLES.includes(userRole);
  const [pdiReports, setPdiReports] = useState([]);
  const [totalItems, setTotalItems] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: 'report_id', direction: 'desc' });
  // `cursor` is the token for the NEXT page, handed back by the last response.
  // `cursorHistory` holds the cursor used to reach each PRIOR page (most recent
  // last), so Prev can pop back through them; `currentCursor` is whichever
  // cursor produced the page currently on screen (null = first page).
  const [cursor, setCursor] = useState(null);
  const [cursorHistory, setCursorHistory] = useState([]);
  const [currentCursor, setCurrentCursor] = useState(null);
  const [limit] = useState(10);
  const tableRef = useRef(null);
  const searchInputRef = useRef(null);
  const hasFetched = useRef(false);
  const isFetching = useRef(false);
  const navigate = useNavigate();
  const { notifySuccess, notifyError, notifyInfo } = useNotify();

  const socket = useMemo(
    () =>
      providedSocket ||
      io(BASE_URL, {
        withCredentials: true,
        transports: ['websocket'],
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      }),
    [providedSocket]
  );

  // Returns true on a successful fetch, false on failure — callers that move
  // cursorHistory/currentCursor (handleNextPage/handlePrevPage) use this to
  // only commit that bookkeeping once the new page has actually loaded, so a
  // failed fetch leaves pagination state exactly as it was for a clean retry.
  const fetchPdiReports = useCallback(
    async (cursorToUse) => {
      if (isFetching.current) return false;
      isFetching.current = true;
      setIsLoading(true);
      setError(null);

      try {
        const token = localStorage.getItem('token');
        const url = cursorToUse
          ? `${BASE_URL}/api/pdi/reports?limit=${limit}&cursor=${encodeURIComponent(cursorToUse)}`
          : `${BASE_URL}/api/pdi/reports?limit=${limit}`;

        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(errorText || `Server responded with status: ${response.status}`);
        }

        const responseData = await response.json();
        if (!responseData.data || !Array.isArray(responseData.data)) {
          throw new Error('Invalid data format');
        }

        setPdiReports(responseData.data);
        setTotalItems(responseData.total || 0);
        setCursor(responseData.cursor || null);
        return true;
      } catch (err) {
        console.error('Error fetching PDI reports:', err);
        const errorMessage = err.message || 'Network error. Please try again later.';
        setError(errorMessage);
        notifyError(errorMessage, { autoClose: 3000 });
        return false;
      } finally {
        setIsLoading(false);
        isFetching.current = false;
      }
    },
    [limit, notifyError]
  );

  useEffect(() => {
    if (!hasFetched.current) {
      fetchPdiReports(null);
      hasFetched.current = true;
    }

    const handlePdiReportUpdate = ({ report_id, status }) => {
      setPdiReports((prev) => {
        if (!Array.isArray(prev)) return prev || [];

        if (status === 'Deleted') {
          notifyInfo(`PDI report #${report_id} deleted`, { autoClose: 2000 });
          return prev.filter((report) => report.report_id !== report_id);
        }

        const idx = prev.findIndex((report) => report.report_id === report_id);
        if (idx === -1 || prev[idx].status === status) return prev;

        const updated = [...prev];
        updated[idx] = { ...updated[idx], status };
        notifyInfo(`PDI report #${report_id} updated`, { autoClose: 2000 });
        return updated;
      });
    };

    socket.on('pdiReportUpdate', handlePdiReportUpdate);

    return () => {
      socket.off('pdiReportUpdate', handlePdiReportUpdate);
      if (!providedSocket) socket.disconnect();
    };
  }, [fetchPdiReports, socket, providedSocket, notifyInfo]);

  const handleSort = useCallback((key) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc',
    }));
  }, []);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      setSearchTerm('');
      searchInputRef.current?.focus();
    }
  }, []);

  const filteredPdiReports = useMemo(() => {
    if (!Array.isArray(pdiReports)) return [];
    return pdiReports.filter((item) => {
      if (!item) return false;
      const searchFields = [
        String(item.report_id || ''),
        String(item.sr_no || ''),
        String(item.pdi_no || ''),
        String(item.customer_name || ''),
        String(item.status || ''),
        String(item.inspected_by || ''),
      ];
      return searchFields.some((field) => field.toLowerCase().includes(searchTerm.toLowerCase()));
    });
  }, [pdiReports, searchTerm]);

  const sortedPdiReports = useMemo(() => {
    if (!filteredPdiReports.length) return [];
    return [...filteredPdiReports].sort((a, b) => {
      const valueA = a[sortConfig.key] ?? '';
      const valueB = b[sortConfig.key] ?? '';
      if (valueA < valueB) return sortConfig.direction === 'asc' ? -1 : 1;
      if (valueA > valueB) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredPdiReports, sortConfig]);

  const handleResume = useCallback(
    (report) => {
      navigate(`/pdi-generator/${report.template_id || 'general'}?report=${report.report_id}`);
    },
    [navigate]
  );

  const handleViewDownload = useCallback(
    async (report) => {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${BASE_URL}${report.report_link}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error('Failed to load PDF');
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        window.open(url, '_blank', 'noopener,noreferrer');
        setTimeout(() => window.URL.revokeObjectURL(url), 60000);
      } catch (err) {
        console.error('View/download error:', err);
        notifyError('Could not open the PDI PDF.', { autoClose: 3000 });
      }
    },
    [notifyError]
  );

  const handleDelete = useCallback(
    async (report) => {
      const label = report.pdi_no || `#${report.report_id}`;
      if (!window.confirm(`Delete PDI report ${label}? This cannot be undone.`)) return;
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${BASE_URL}/api/pdi/reports/${report.report_id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error('Delete failed');
        setPdiReports((prev) => prev.filter((r) => r.report_id !== report.report_id));
        setTotalItems((prev) => Math.max(0, prev - 1));
        notifySuccess(`PDI report ${label} deleted.`, { autoClose: 2000 });
      } catch (err) {
        console.error('Delete error:', err);
        notifyError('Failed to delete PDI report.', { autoClose: 3000 });
      }
    },
    [notifySuccess, notifyError]
  );

  const handlePrevPage = useCallback(async () => {
    if (cursorHistory.length === 0) return;
    const prevCursor = cursorHistory[cursorHistory.length - 1];
    const succeeded = await fetchPdiReports(prevCursor);
    if (!succeeded) return; // leave cursorHistory/currentCursor untouched so retry/Prev stay correct
    setCursorHistory((h) => h.slice(0, -1));
    setCurrentCursor(prevCursor);
  }, [cursorHistory, fetchPdiReports]);

  const handleNextPage = useCallback(async () => {
    if (!cursor || isLoading) return;
    const targetCursor = cursor;
    const previousCursor = currentCursor;
    const succeeded = await fetchPdiReports(targetCursor);
    if (!succeeded) return; // leave cursorHistory/currentCursor untouched so retry/Prev stay correct
    setCursorHistory((h) => [...h, previousCursor]);
    setCurrentCursor(targetCursor);
  }, [cursor, isLoading, currentCursor, fetchPdiReports]);

  const handleRefresh = useCallback(() => {
    setCursorHistory([]);
    setCurrentCursor(null);
    fetchPdiReports(null);
  }, [fetchPdiReports]);

  if (isLoading && !pdiReports.length) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8 flex items-center justify-center" aria-live="polite">
        <div className="text-gray-600 text-xl animate-pulse">Loading PDI Reports...</div>
      </div>
    );
  }

  if (error && !pdiReports.length) return <ConnectionError onRetry={() => fetchPdiReports(null)} />;

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8">
      <h1 className="text-4xl font-bold text-gray-800 mb-10 text-center tracking-tight">{title}</h1>
      <div className="max-w-7xl mx-auto">
        <div className="flex mb-8 gap-6 flex-wrap">
          <div className="relative flex-grow">
            <label htmlFor="search-pdi" className="sr-only">Search PDI Reports</label>
            <input
              id="search-pdi"
              ref={searchInputRef}
              type="text"
              placeholder="Search by PDI No., Customer, Status, or Inspected By..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full p-4 pl-12 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300 text-lg bg-white shadow-md transition-all duration-300"
            />
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" />
          </div>
          <button
            onClick={handleRefresh}
            className="p-4 bg-amber-400 text-gray-900 rounded-lg hover:bg-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-300 transition-all duration-300 shadow-md text-lg"
            disabled={isLoading}
            aria-label="Refresh PDI reports"
          >
            {isLoading && pdiReports.length > 0 ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {isLoading && pdiReports.length > 0 && (
          <div className="text-gray-600 text-lg mb-4 text-center" aria-live="polite">Refreshing data...</div>
        )}

        <div className="bg-white rounded-2xl shadow-lg overflow-x-auto">
          <table className="w-full text-left border-collapse" role="grid" aria-label="PDI Reports table" ref={tableRef} tabIndex={0}>
            <thead>
              <tr className="bg-gradient-to-r from-amber-200 via-amber-100 to-amber-50" role="row">
                {[
                  { key: 'sr_no', label: 'Sr. No.' },
                  { key: 'pdi_no', label: 'PDI No.' },
                  { key: 'customer_name', label: 'Customer' },
                  { key: 'status', label: 'Status' },
                  { key: 'inspected_by', label: 'Inspected By' },
                  { key: 'inspection_date', label: 'Inspection Date' },
                  { key: 'actions', label: 'Actions' },
                ].map(({ key, label }) => (
                  <th
                    key={key}
                    className={`py-5 px-3 text-gray-800 text-base font-semibold ${key !== 'actions' ? 'cursor-pointer hover:bg-amber-300' : ''} transition-all duration-200`}
                    onClick={() => key !== 'actions' && handleSort(key)}
                    aria-sort={sortConfig.key === key ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                    scope="col"
                  >
                    <div className="flex items-center justify-between">
                      <span>{label}</span>
                      {key !== 'actions' && (
                        <ArrowDownUp size={16} className={`ml-2 text-gray-600 ${sortConfig.key === key ? 'text-gray-900' : 'opacity-50'}`} aria-hidden="true" />
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedPdiReports.map((report) => (
                <tr key={report.report_id} className="border-t hover:bg-amber-50 transition-all duration-200" role="row">
                  <td className="py-4 px-3 text-gray-600 text-base">{report.sr_no}</td>
                  <td className="py-4 px-3 text-gray-600 text-base">{report.pdi_no || '—'}</td>
                  <td className="py-4 px-3 text-gray-600 text-base">{report.customer_name || '—'}</td>
                  <td
                    className={`py-4 px-3 text-base ${
                      report.status === 'Completed' ? 'text-green-600' :
                      report.status === 'In Progress' ? 'text-yellow-600' :
                      report.status === 'Failed' ? 'text-red-600' : 'text-gray-600'
                    }`}
                  >
                    {report.status}
                  </td>
                  <td className="py-4 px-3 text-gray-600 text-base">{report.inspected_by || 'N/A'}</td>
                  <td className="py-4 px-3 text-gray-600 text-base">{report.inspection_date ? formatDate(report.inspection_date) : 'N/A'}</td>
                  <td className="py-4 px-3 text-gray-600 text-base">
                    <div className="flex items-center gap-1">
                      {canManage && (
                        <button onClick={() => handleResume(report)} className="p-2 hover:bg-amber-100 rounded-full text-amber-700" title="Resume in Generator" aria-label={`Resume PDI report ${report.pdi_no || report.report_id}`}>
                          <Pencil size={18} />
                        </button>
                      )}
                      <button onClick={() => handleViewDownload(report)} className="p-2 hover:bg-amber-100 rounded-full text-amber-700" title="View / Download PDF" aria-label={`View PDI report ${report.pdi_no || report.report_id}`}>
                        <Eye size={18} />
                      </button>
                      {canManage && (
                        <button onClick={() => handleDelete(report)} className="p-2 hover:bg-red-50 rounded-full text-red-500" title="Delete" aria-label={`Delete PDI report ${report.pdi_no || report.report_id}`}>
                          <Trash2 size={18} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {totalItems > 0 && (
            <div className="flex justify-between items-center p-4 bg-gray-50">
              <div className="text-gray-600">Showing {sortedPdiReports.length} of {totalItems} PDI reports</div>
              <div className="flex space-x-2">
                <button onClick={handlePrevPage} disabled={cursorHistory.length === 0} className="p-2 bg-white border rounded-lg disabled:opacity-50 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-300" aria-label="Previous page">
                  <ChevronLeft size={20} />
                </button>
                <button onClick={handleNextPage} disabled={!cursor || isLoading} className="p-2 bg-white border rounded-lg disabled:opacity-50 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-300" aria-label="Next page">
                  <ChevronRight size={20} />
                </button>
              </div>
            </div>
          )}

          {!isLoading && sortedPdiReports.length === 0 && (
            <div className="text-center py-12 text-gray-500 flex flex-col items-center" role="status">
              <Search className="mb-4 text-gray-400" size={48} />
              <p className="text-lg">{pdiReports.length === 0 ? 'No PDI reports yet.' : 'No PDI reports found matching your search.'}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
