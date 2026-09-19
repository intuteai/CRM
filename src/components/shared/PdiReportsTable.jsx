// CRM/src/components/shared/PdiReportsTable.jsx
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowDownUp, Search, Eye, Pencil, Trash2, Copy, ClipboardList } from 'lucide-react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { io } from 'socket.io-client';
import { useNotify } from '../../hooks/useNotify';
import { debounce } from 'lodash';
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

// Single source of truth for status -> color treatment, shared by the pill
// badge and the accent border, in both the desktop table and the mobile
// card list added in Task 3. Same four statuses the table has always had.
const STATUS_STYLES = {
  Completed: { pill: 'bg-green-100 text-green-700', border: 'border-l-green-500' },
  'In Progress': { pill: 'bg-yellow-100 text-yellow-700', border: 'border-l-yellow-500' },
  Failed: { pill: 'bg-red-100 text-red-700', border: 'border-l-red-500' },
  Pending: { pill: 'bg-gray-100 text-gray-600', border: 'border-l-gray-300' },
};
const DEFAULT_STATUS_STYLE = { pill: 'bg-gray-100 text-gray-600', border: 'border-l-gray-300' };

function getStatusStyle(status) {
  return STATUS_STYLES[status] || DEFAULT_STATUS_STYLE;
}

const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'Pending', label: 'Pending' },
  { value: 'In Progress', label: 'In Progress' },
  { value: 'Completed', label: 'Completed' },
  { value: 'Failed', label: 'Failed' },
];

// Per-row template badge (next to PDI No.) -- General/AutoNXT get fixed
// colors since they're the two known hardcoded templates; any admin-authored
// custom template shares one color rather than assigning one per template
// (an unbounded, admin-created set).
const TEMPLATE_BADGE_STYLES = {
  general: 'bg-indigo-50 text-indigo-700',
  autonxt: 'bg-pink-50 text-pink-700',
};
const DEFAULT_TEMPLATE_BADGE_STYLE = 'bg-teal-50 text-teal-700';

function getTemplateBadgeStyle(templateId) {
  return TEMPLATE_BADGE_STYLES[templateId] || DEFAULT_TEMPLATE_BADGE_STYLE;
}

// Shared by both the desktop table's Actions cell and the mobile card's
// action row (Task 3) -- identical buttons, conditions, and handlers in
// both places, so this is the one spot that needs editing if that ever
// changes.
function ReportActions({ report, canManage, duplicatingIds, onResume, onViewDownload, onDuplicate, onDelete }) {
  return (
    <div className="flex items-center gap-1">
      {canManage && (
        <button onClick={() => onResume(report)} className="p-2 hover:bg-navy-50 rounded-full text-navy-800 transition-colors" title="Resume in Generator" aria-label={`Resume PDI report ${report.pdi_no || report.report_id}`}>
          <Pencil size={18} />
        </button>
      )}
      <button onClick={() => onViewDownload(report)} className="p-2 hover:bg-navy-50 rounded-full text-navy-800 transition-colors" title="View / Download PDF" aria-label={`View PDI report ${report.pdi_no || report.report_id}`}>
        <Eye size={18} />
      </button>
      {canManage && (
        <button
          onClick={() => onDuplicate(report)}
          disabled={duplicatingIds.has(report.report_id)}
          className="p-2 hover:bg-navy-50 rounded-full text-navy-800 transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
          title="Duplicate as New PDI"
          aria-label={`Duplicate PDI report ${report.pdi_no || report.report_id}`}
        >
          <Copy size={18} />
        </button>
      )}
      {canManage && (
        <button onClick={() => onDelete(report)} className="p-2 hover:bg-red-50 rounded-full text-red-500" title="Delete" aria-label={`Delete PDI report ${report.pdi_no || report.report_id}`}>
          <Trash2 size={18} />
        </button>
      )}
    </div>
  );
}

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
  // searchInput is what's bound to the <input> (updates every keystroke, for
  // a responsive-feeling textbox); searchTerm is the debounced value that
  // actually drives the server query -- same split InventoryPage.jsx already
  // uses elsewhere in this app for the same reason (one network request per
  // pause in typing, not one per keystroke).
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  // { key, direction } | null. Unlike before this change, this now drives a
  // real server-side ORDER BY across the whole dataset (not just the loaded
  // page) -- see the offset-pagination branch in fetchPdiReports below.
  const [sortConfig, setSortConfig] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [templateFilter, setTemplateFilter] = useState('');
  const [templateOptions, setTemplateOptions] = useState([]);
  // `cursor` is the token for the NEXT page in the DEFAULT (unsorted) view;
  // `cursorHistory` holds the cursor used to reach each PRIOR page (most
  // recent last); `currentCursor` is whichever cursor produced the page on
  // screen now (null = first page). Only meaningful when sortConfig is null.
  const [cursor, setCursor] = useState(null);
  const [cursorHistory, setCursorHistory] = useState([]);
  const [currentCursor, setCurrentCursor] = useState(null);
  // Offset-pagination equivalents, only meaningful when sortConfig is set
  // (an explicit sort uses OFFSET/LIMIT server-side -- see Task 2).
  const [sortOffset, setSortOffset] = useState(0);
  const [nextOffset, setNextOffset] = useState(null);
  const [limit] = useState(10);
  // Report ids with a Duplicate POST currently in flight — unlike Delete
  // (gated by a blocking window.confirm) or View (idempotent), a double-click
  // here would silently create two duplicate reports server-side, so the
  // button disables itself per-row while its own request is outstanding.
  const [duplicatingIds, setDuplicatingIds] = useState(() => new Set());
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
  // pagination state (handleNextPage/handlePrevPage) use this to only commit
  // that bookkeeping once the new page has actually loaded, so a failed
  // fetch leaves pagination state exactly as it was for a clean retry.
  const fetchPdiReports = useCallback(
    async ({ cursorToUse = null, offsetToUse = 0, statusToUse, templateToUse, searchToUse, sortByToUse, sortDirToUse } = {}) => {
      // Known limitation (predates this file's server-side search/sort/
      // template-filter work -- it already existed for the old status-only
      // filter): if a call arrives while one is already in flight, it's
      // dropped here with no retry/re-queue. In quick succession (e.g. two
      // filter changes before the first request resolves), the UI can settle
      // on stale results reflecting only the first change. Now that
      // sortConfig/templateFilter/searchTerm all route through this same
      // guard (not just status), the practical surface is broader than
      // before. Left as-is rather than adding request-superseding/AbortController
      // logic: this table is an internal admin tool with realistically one
      // user at a time clicking through it, not a high-concurrency surface,
      // and a stale result here is corrected by the next fetch (Refresh,
      // another filter change, or Prev/Next).
      if (isFetching.current) return false;
      isFetching.current = true;
      setIsLoading(true);
      setError(null);

      try {
        const token = localStorage.getItem('token');
        const params = new URLSearchParams({ limit: String(limit) });
        if (sortByToUse) {
          params.set('sortBy', sortByToUse);
          params.set('sortDir', sortDirToUse || 'desc');
          params.set('offset', String(offsetToUse));
        } else if (cursorToUse) {
          params.set('cursor', cursorToUse);
        }
        if (statusToUse) params.set('status', statusToUse);
        if (templateToUse) params.set('template_id', templateToUse);
        if (searchToUse) params.set('search', searchToUse);
        const url = `${BASE_URL}/api/pdi/reports?${params.toString()}`;

        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        });

        if (!response.ok) {
          const errorBody = await response.json().catch(() => ({}));
          throw new Error(errorBody.error || `Server responded with status: ${response.status}`);
        }

        const responseData = await response.json();
        if (!responseData.data || !Array.isArray(responseData.data)) {
          throw new Error('Invalid data format');
        }

        setPdiReports(responseData.data);
        setTotalItems(responseData.total || 0);
        setCursor(responseData.cursor || null);
        setNextOffset(responseData.offset ?? null);
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

  // Shared by the mount effect, Refresh, and every filter/sort/search change
  // below -- resets BOTH pagination modes' state (only one is ever "live" at
  // a time, based on whether sortConfig is set) and refetches from page 1
  // with the current filters.
  const fetchFirstPage = useCallback(() => {
    setCursorHistory([]);
    setCurrentCursor(null);
    setSortOffset(0);
    if (sortConfig) {
      return fetchPdiReports({
        offsetToUse: 0,
        statusToUse: statusFilter,
        templateToUse: templateFilter,
        searchToUse: searchTerm,
        sortByToUse: sortConfig.key,
        sortDirToUse: sortConfig.direction,
      });
    }
    return fetchPdiReports({
      cursorToUse: null,
      statusToUse: statusFilter,
      templateToUse: templateFilter,
      searchToUse: searchTerm,
    });
  }, [sortConfig, statusFilter, templateFilter, searchTerm, fetchPdiReports]);

  useEffect(() => {
    if (!hasFetched.current) {
      fetchPdiReports({});
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

  // Central "something that changes the RESULT SET changed" handler. Any of
  // these four changing means the current page is stale, so: reset to page
  // 1 (both pagination modes) and refetch. Runs after the mount effect's own
  // first fetch (hasFetched guards that), and after every subsequent change
  // to any of the four.
  //
  // Ordering note: on initial mount, THIS effect and the mount effect above
  // both technically fire in the same commit (React runs effects in
  // declaration order), and the mount effect sets hasFetched.current = true
  // synchronously -- so the `!hasFetched.current` guard here does NOT stop
  // this effect from also calling fetchFirstPage() on mount. What actually
  // prevents a duplicate HTTP request is that fetchPdiReports sets
  // isFetching.current = true synchronously before its first `await`
  // (guaranteed by JS async-function semantics: everything before the first
  // await runs before control returns to the caller), so this effect's call
  // bails out via that guard instead. That's an implicit ordering
  // guarantee, not an explicit one -- if fetchPdiReports's synchronous
  // prologue ever grows an early `await` (e.g. an `await` added before the
  // isFetching.current = true line), this would silently start firing two
  // requests on mount. Flagged in code review; left as a documented
  // invariant rather than an explicit guard/rewrite, since it holds today
  // and this table's usage doesn't warrant more defensive machinery.
  useEffect(() => {
    if (!hasFetched.current) return;
    fetchFirstPage();
  }, [statusFilter, templateFilter, searchTerm, sortConfig, fetchFirstPage]);

  // Populates the Template filter dropdown (added by a later task). Reuses
  // the same endpoint PdiTemplatePicker.jsx already calls (GET
  // /api/pdi/templates -- code templates + every active admin-authored one,
  // [{id, name, version}]). Non-critical: if it fails, the dropdown just
  // stays at "All templates" only -- the reports table itself doesn't
  // depend on this list.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${BASE_URL}/api/pdi/templates`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok || cancelled) return;
        const list = await response.json();
        if (!cancelled) setTemplateOptions(list);
      } catch (err) {
        console.error('Error loading PDI template list:', err);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Unchanged from before this task -- the new central useEffect (Step 3) is
  // what now reacts to sortConfig changing and triggers the server refetch;
  // this handler just toggles the state.
  const handleSort = useCallback((key) => {
    setSortConfig((prev) => ({
      key,
      direction: prev?.key === key && prev.direction === 'desc' ? 'asc' : 'desc',
    }));
  }, []);

  // No handleStatusFilterChange here -- the status filter will render as pill
  // buttons in a later task (not a <select>), so its JSX will call
  // setStatusFilter(value) directly with the pill's own value, no event
  // object to unwrap. The template filter stays a <select>, which does need
  // an onChange wrapper.
  const handleTemplateFilterChange = useCallback((e) => {
    setTemplateFilter(e.target.value);
  }, []);

  // Same debounce pattern already used in CRM/src/components/admin/InventoryPage.jsx:
  // debounce the STATE UPDATE itself (not a fetch call directly), so it never
  // holds a stale closure over the other filters -- the central useEffect
  // above reacts to searchTerm changing with whatever the other filter values
  // currently are.
  const debouncedSetSearchTerm = useCallback(debounce((value) => setSearchTerm(value), 400), []);

  const handleSearchChange = useCallback(
    (e) => {
      const value = e.target.value;
      setSearchInput(value);
      debouncedSetSearchTerm(value);
    },
    [debouncedSetSearchTerm]
  );

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      setSearchInput('');
      setSearchTerm('');
      searchInputRef.current?.focus();
    }
  }, []);

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

  const handleDuplicate = useCallback(
    async (report) => {
      if (duplicatingIds.has(report.report_id)) return; // already in flight for this row
      const label = report.pdi_no || `#${report.report_id}`;
      setDuplicatingIds((prev) => new Set(prev).add(report.report_id));
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${BASE_URL}/api/pdi/reports/${report.report_id}/duplicate`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error('Duplicate failed');
        const newReport = await response.json();
        notifySuccess(`Duplicated ${label} — opening the new PDI.`, { autoClose: 2000 });
        navigate(`/pdi-generator/${newReport.template_id || 'general'}?report=${newReport.report_id}`);
      } catch (err) {
        console.error('Duplicate error:', err);
        notifyError('Failed to duplicate PDI report.', { autoClose: 3000 });
      } finally {
        setDuplicatingIds((prev) => {
          const next = new Set(prev);
          next.delete(report.report_id);
          return next;
        });
      }
    },
    [duplicatingIds, navigate, notifySuccess, notifyError]
  );

  const handlePrevPage = useCallback(async () => {
    if (sortConfig) {
      const prevOffset = Math.max(0, sortOffset - limit);
      const succeeded = await fetchPdiReports({
        offsetToUse: prevOffset,
        statusToUse: statusFilter,
        templateToUse: templateFilter,
        searchToUse: searchTerm,
        sortByToUse: sortConfig.key,
        sortDirToUse: sortConfig.direction,
      });
      if (succeeded) setSortOffset(prevOffset);
      return;
    }
    if (cursorHistory.length === 0) return;
    const prevCursor = cursorHistory[cursorHistory.length - 1];
    const succeeded = await fetchPdiReports({
      cursorToUse: prevCursor,
      statusToUse: statusFilter,
      templateToUse: templateFilter,
      searchToUse: searchTerm,
    });
    if (!succeeded) return; // leave cursorHistory/currentCursor untouched so retry/Prev stay correct
    setCursorHistory((h) => h.slice(0, -1));
    setCurrentCursor(prevCursor);
  }, [sortConfig, sortOffset, limit, cursorHistory, fetchPdiReports, statusFilter, templateFilter, searchTerm]);

  const handleNextPage = useCallback(async () => {
    if (sortConfig) {
      if (nextOffset == null || isLoading) return;
      const succeeded = await fetchPdiReports({
        offsetToUse: nextOffset,
        statusToUse: statusFilter,
        templateToUse: templateFilter,
        searchToUse: searchTerm,
        sortByToUse: sortConfig.key,
        sortDirToUse: sortConfig.direction,
      });
      if (succeeded) setSortOffset(nextOffset);
      return;
    }
    if (!cursor || isLoading) return;
    const targetCursor = cursor;
    const previousCursor = currentCursor;
    const succeeded = await fetchPdiReports({
      cursorToUse: targetCursor,
      statusToUse: statusFilter,
      templateToUse: templateFilter,
      searchToUse: searchTerm,
    });
    if (!succeeded) return; // leave cursorHistory/currentCursor untouched so retry/Prev stay correct
    setCursorHistory((h) => [...h, previousCursor]);
    setCurrentCursor(targetCursor);
  }, [sortConfig, nextOffset, isLoading, cursor, currentCursor, fetchPdiReports, statusFilter, templateFilter, searchTerm]);

  const handleRefresh = useCallback(() => {
    fetchFirstPage();
  }, [fetchFirstPage]);

  if (isLoading && !pdiReports.length) {
    return (
      <div className="flex items-center justify-center py-24" aria-live="polite">
        <div className="text-gray-500 text-lg animate-pulse">Loading PDI Reports...</div>
      </div>
    );
  }

  if (error && !pdiReports.length) return <ConnectionError onRetry={fetchFirstPage} />;

  return (
    <div>
      <div className="max-w-7xl mx-auto mb-4 flex items-center gap-2 text-gray-500 text-sm">
        <ClipboardList size={16} className="text-gold-500 shrink-0" aria-hidden="true" />
        <span className="sr-only">{title}</span>
        <p>Pre-dispatch inspection records across all customers and templates</p>
      </div>
      <div className="max-w-7xl mx-auto">
        <div className="flex gap-3 mb-4">
          <div className="relative flex-grow">
            <label htmlFor="search-pdi" className="sr-only">Search PDI Reports</label>
            <input
              id="search-pdi"
              ref={searchInputRef}
              type="text"
              placeholder="Search by PDI No., Customer, Status, Prepared By, or Approved By..."
              value={searchInput}
              onChange={handleSearchChange}
              onKeyDown={handleKeyDown}
              className="w-full p-3 pl-11 border border-navy-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-400 bg-white shadow-sm transition-colors"
            />
            <Search size={17} className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-gray-400" />
          </div>
          <button
            onClick={handleRefresh}
            className="px-4 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors disabled:opacity-50"
            disabled={isLoading}
            aria-label="Refresh PDI reports"
          >
            {isLoading && pdiReports.length > 0 ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-8" role="group" aria-label="Filter by status">
          <span className="text-xs uppercase font-bold text-gray-400 tracking-wide mr-1">Status</span>
          {STATUS_FILTER_OPTIONS.map(({ value, label }) => (
            <button
              key={value || 'all'}
              type="button"
              onClick={() => setStatusFilter(value)}
              aria-pressed={statusFilter === value}
              disabled={isLoading}
              className={`px-3.5 py-2 sm:py-1.5 rounded-full text-xs font-semibold border transition-colors focus:outline-none focus:ring-2 focus:ring-gold-400 ${
                statusFilter === value
                  ? 'bg-navy-800 text-white border-navy-800'
                  : 'bg-white text-gray-600 border-navy-100 hover:border-gold-400'
              }`}
            >
              {label}
            </button>
          ))}
          <div className="flex items-center gap-2">
          <div className="w-px h-5 bg-gray-200 mx-1 hidden sm:block" aria-hidden="true" />
          <label htmlFor="template-filter-pdi" className="text-xs uppercase font-bold text-gray-400 tracking-wide mr-1">Template</label>
          <select
            id="template-filter-pdi"
            value={templateFilter}
            onChange={handleTemplateFilterChange}
            disabled={isLoading}
            className="px-3 py-2 sm:py-1.5 rounded-full text-xs font-semibold border border-navy-100 bg-white text-gray-600 focus:outline-none focus:ring-2 focus:ring-gold-400"
          >
            <option value="">All templates</option>
            {templateOptions.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          </div>
        </div>

        {isLoading && pdiReports.length > 0 && (
          <div className="text-gray-600 text-lg mb-4 text-center" aria-live="polite">Refreshing data...</div>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-navy-100 overflow-hidden">
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full text-left border-collapse" role="grid" aria-label="PDI Reports table" ref={tableRef} tabIndex={0}>
              <thead>
                <tr className="bg-navy-50" role="row">
                  {[
                    { key: 'sr_no', label: 'Sr. No.' },
                    { key: 'pdi_no', label: 'PDI No.' },
                    { key: 'customer_name', label: 'Customer' },
                    { key: 'status', label: 'Status' },
                    { key: 'prepared_by', label: 'Prepared By' },
                    { key: 'approved_by', label: 'Approved By' },
                    { key: 'inspection_date', label: 'Inspection Date' },
                    { key: 'actions', label: 'Actions' },
                  ].map(({ key, label }) => (
                    <th
                      key={key}
                      className={`py-3 px-3 text-navy-800 text-sm font-semibold border-b border-navy-100 whitespace-nowrap ${key !== 'actions' ? 'cursor-pointer hover:bg-navy-100' : ''} transition-colors`}
                      onClick={() => key !== 'actions' && handleSort(key)}
                      aria-sort={sortConfig?.key === key ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                      scope="col"
                    >
                      <div className="flex items-center justify-between">
                        <span>{label}</span>
                        {key !== 'actions' && (
                          <ArrowDownUp size={14} className={`ml-2 ${sortConfig?.key === key ? 'text-gold-500' : 'text-navy-400/50'}`} aria-hidden="true" />
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* Field fallbacks ('—'/'N/A') here must match the lg:hidden card list below -- kept as two plain JSX blocks per the CSS-only breakpoint-switch design, not a shared render function. */}
                {pdiReports.map((report) => (
                  <tr key={report.report_id} className={`border-t border-l-4 ${getStatusStyle(report.status).border} hover:bg-navy-50/60 transition-colors`} role="row">
                    <td className="py-4 px-3 text-gray-600 text-base">{report.sr_no}</td>
                    <td className="py-4 px-3 text-gray-600 text-base">
                      {report.pdi_no || '—'}
                      <span className={`ml-2 inline-block px-2 py-0.5 rounded text-[10px] font-bold align-middle ${getTemplateBadgeStyle(report.template_id)}`}>
                        {report.template_name}
                      </span>
                    </td>
                    <td className="py-4 px-3 text-gray-600 text-base">{report.customer_name || '—'}</td>
                    <td className="py-4 px-3 text-base">
                      <span className={`inline-block px-3 py-1 rounded-full text-sm font-semibold ${getStatusStyle(report.status).pill}`}>
                        {report.status}
                      </span>
                    </td>
                    <td className="py-4 px-3 text-gray-600 text-base">{report.prepared_by || 'N/A'}</td>
                    <td className="py-4 px-3 text-gray-600 text-base">{report.approved_by || 'N/A'}</td>
                    <td className="py-4 px-3 text-gray-600 text-base">{report.inspection_date ? formatDate(report.inspection_date) : 'N/A'}</td>
                    <td className="py-4 px-3 text-gray-600 text-base">
                      <ReportActions
                        report={report}
                        canManage={canManage}
                        duplicatingIds={duplicatingIds}
                        onResume={handleResume}
                        onViewDownload={handleViewDownload}
                        onDuplicate={handleDuplicate}
                        onDelete={handleDelete}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="lg:hidden divide-y">
            {/* Field fallbacks ('—'/'N/A') here must match the desktop table above. */}
            {/* divide-gray-100 (instead of the plain border-t-gray-100 used here) would set the
                border-color shorthand on all four sides via a higher-specificity selector, silently
                overriding the per-status border-l-* accent color below -- confirmed live, every card
                rendered the divider's gray instead of its status color regardless of border-l-*. */}
            {pdiReports.map((report) => (
              <div key={report.report_id} className={`p-4 border-t-gray-100 border-l-4 ${getStatusStyle(report.status).border}`}>
                <div className="flex items-center justify-between gap-3">
                  <span className="font-bold text-gray-800 text-base">
                    {report.pdi_no || '—'}
                    <span className={`ml-2 inline-block px-2 py-0.5 rounded text-[10px] font-bold align-middle ${getTemplateBadgeStyle(report.template_id)}`}>
                      {report.template_name}
                    </span>
                  </span>
                  <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${getStatusStyle(report.status).pill}`}>
                    {report.status}
                  </span>
                </div>
                <div className="text-sm text-gray-500 mt-1">
                  {report.customer_name || '—'} — {report.inspection_date ? formatDate(report.inspection_date) : 'N/A'}
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 mt-2 text-xs text-gray-500">
                  <div><span className="font-semibold text-gray-600">Prepared:</span> {report.prepared_by || 'N/A'}</div>
                  <div><span className="font-semibold text-gray-600">Approved:</span> {report.approved_by || 'N/A'}</div>
                </div>
                <div className="mt-3">
                  <ReportActions
                    report={report}
                    canManage={canManage}
                    duplicatingIds={duplicatingIds}
                    onResume={handleResume}
                    onViewDownload={handleViewDownload}
                    onDuplicate={handleDuplicate}
                    onDelete={handleDelete}
                  />
                </div>
              </div>
            ))}
          </div>

          {totalItems > 0 && (
            <div className="flex flex-wrap justify-between items-center gap-3 p-4 bg-gray-50">
              <div className="text-gray-600">Showing {pdiReports.length} of {totalItems} PDI reports</div>
              <div className="flex space-x-2">
                <button
                  onClick={handlePrevPage}
                  disabled={sortConfig ? sortOffset === 0 : cursorHistory.length === 0}
                  className="p-2 bg-white border border-navy-100 rounded-lg disabled:opacity-50 hover:bg-navy-100 transition-colors focus:outline-none focus:ring-2 focus:ring-gold-400"
                  aria-label="Previous page"
                >
                  <ChevronLeft size={20} />
                </button>
                <button
                  onClick={handleNextPage}
                  disabled={sortConfig ? nextOffset == null || isLoading : !cursor || isLoading}
                  className="p-2 bg-white border border-navy-100 rounded-lg disabled:opacity-50 hover:bg-navy-100 transition-colors focus:outline-none focus:ring-2 focus:ring-gold-400"
                  aria-label="Next page"
                >
                  <ChevronRight size={20} />
                </button>
              </div>
            </div>
          )}

          {!isLoading && pdiReports.length === 0 && (
            <div className="text-center py-12 text-gray-500 flex flex-col items-center" role="status">
              <Search className="mb-4 text-gray-400" size={48} />
              <p className="text-lg">
                {totalItems === 0 && !statusFilter && !templateFilter && !searchTerm
                  ? 'No PDI reports yet.'
                  : 'No PDI reports match your search and filters.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
