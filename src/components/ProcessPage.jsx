import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  ArrowDownUp, Filter, PlusCircle, Search, ChevronLeft, ChevronRight,
  Edit2, MoreVertical, Package, XCircle, Eye, Calendar, User, Hash, Target,
  Clock, CheckCircle2, AlertCircle, Activity, LayoutList, LayoutGrid
} from 'lucide-react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import io from 'socket.io-client';
import { debounce } from 'lodash';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const formatDate = (date) =>
  date ? new Date(date).toLocaleDateString('en-IN') : 'N/A';

const useFetchProcesses = ({ orderId, limit, offset }) => {
  const [processes, setProcesses] = useState([]);
  const [totalItems, setTotalItems] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    let isMounted = true;
    try {
      setIsLoading(true);
      const token = localStorage.getItem('token');
      if (!token) throw new Error("Authentication token missing. Please log in again.");
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
      const url = `${backendUrl}/api/process/${orderId}?limit=${limit}&offset=${offset}&force_refresh=true`;
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` },
        credentials: 'include',
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Process fetch failed: ${response.statusText}`);
      }
      const { workOrders, total } = await response.json();

      if (isMounted) {
        setProcesses(workOrders || []);
        setTotalItems(total || 0);
        setError(null);
      }
    } catch (err) {
      if (isMounted) setError(err.message);
    } finally {
      if (isMounted) setIsLoading(false);
    }
    return () => { isMounted = false; };
  }, [orderId, limit, offset]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { processes, totalItems, isLoading, error, refetchData: fetchData };
};

function ProcessPage({ userRole = 'admin', orderId = 2, socket }) {
  const [page, setPage] = useState(0);
  const [itemsPerPage] = useState(8);
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('All');
  const [quickFilter, setQuickFilter] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [selectedWorkOrder, setSelectedWorkOrder] = useState(null);
  const [showProcessesModal, setShowProcessesModal] = useState(false);
  const [selectedProcesses, setSelectedProcesses] = useState([]);
  const [sortConfig, setSortConfig] = useState({ key: 'createdAt', direction: 'desc' });
  const [viewMode, setViewMode] = useState('list'); // 'list' or 'kanban'
  const tableRef = useRef(null);

  const { processes: allProcesses, totalItems, isLoading, error, refetchData } = useFetchProcesses({ orderId, limit: 5000, offset: 0 });

  useEffect(() => {
    if (!socket) return;
    socket.on('connect', () => console.log('Connected to Socket.IO'));
    socket.on('connect_error', (err) => {
      console.error('Socket connection error:', err);
      toast.error('Failed to connect to real-time updates.', { autoClose: 3000 });
    });
    socket.on('processUpdate', () => {
      refetchData();
      toast.info('Work orders updated in real-time', { autoClose: 2000 });
      if (tableRef.current) tableRef.current.focus();
    });
    return () => {
      socket.off('connect');
      socket.off('connect_error');
      socket.off('processUpdate');
    };
  }, [socket, refetchData]);

  const debouncedSearch = useCallback(debounce((value) => setSearchTerm(value), 300), []);

  useEffect(() => { setPage(0); }, [searchTerm, filterStatus, quickFilter]);

  const handleSearchChange = (e) => {
    const value = e.target.value.toLowerCase();
    setSearchInput(value);
    debouncedSearch(value);
  };

  const sortedProcesses = useMemo(() => {
    const sortableProcesses = [...allProcesses];
    if (sortConfig.key) {
      sortableProcesses.sort((a, b) => {
        let aValue = a[sortConfig.key], bValue = b[sortConfig.key];
        if (sortConfig.key === 'quantity') {
          aValue = Number(aValue);
          bValue = Number(bValue);
        } else if (sortConfig.key === 'createdAt' || sortConfig.key === 'targetDate') {
          aValue = new Date(aValue || 0);
          bValue = new Date(bValue || 0);
        }
        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return sortableProcesses;
  }, [allProcesses, sortConfig]);

  const filteredProcesses = useMemo(() => {
    return sortedProcesses.filter(item => {
      const matchesSearch =
        item.id.toString().includes(searchTerm) ||
        item.componentName.toLowerCase().includes(searchTerm) ||
        item.responsiblePerson.toLowerCase().includes(searchTerm);
      const matchesStatus =
        filterStatus === 'All' ||
        (filterStatus === 'Pending' && item.status === 'Pending') ||
        (filterStatus === 'Completed' && item.status === 'Completed');
      const matchesQuickFilter =
        quickFilter === '' ||
        (quickFilter === 'Overdue' && new Date(item.targetDate) < new Date() && item.status !== 'Completed') ||
        (quickFilter === item.responsiblePerson);
      return matchesSearch && matchesStatus && matchesQuickFilter;
    });
  }, [sortedProcesses, searchTerm, filterStatus, quickFilter]);

  const paginatedProcesses = useMemo(() => {
    if (viewMode === 'kanban') return filteredProcesses;
    const start = page * itemsPerPage;
    return filteredProcesses.slice(start, start + itemsPerPage);
  }, [filteredProcesses, page, itemsPerPage, viewMode]);

  const handleCreateWorkOrder = useCallback(async ({ order_id, component_id, quantity, responsible_person, target_date }) => {
    const token = localStorage.getItem('token');
    try {
      if (!token) throw new Error("Authentication token missing.");
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
      const response = await fetch(`${backendUrl}/api/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ order_id, component_id, quantity, responsible_person, target_date }),
        credentials: 'include',
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create work order');
      }
      setPage(0);
      setSearchInput('');
      setFilterStatus('All');
      setQuickFilter('');
      setTimeout(() => refetchData(), 100);
      setShowCreateForm(false);
      toast.success('Work order created successfully');
    } catch (err) {
      toast.error(err.message);
      throw err;
    }
  }, [refetchData]);

  const handleUpdateProcessStatus = useCallback(async (workOrderId, { process_name, status, completion_date }) => {
    const token = localStorage.getItem('token');
    try {
      if (!token) throw new Error("Authentication token missing.");
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
      const response = await fetch(`${backendUrl}/api/process/${workOrderId}/process-status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ process_name, status, completion_date }),
        credentials: 'include',
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update process status');
      }
      setTimeout(() => refetchData(), 100);
      setShowEditForm(false);
      setSelectedWorkOrder(null);
      toast.success('Process status updated successfully');
    } catch (err) {
      toast.error(err.message);
      throw err;
    }
  }, [refetchData]);

  const handleDragEnd = useCallback(async (result) => {
    if (!result.destination) return;
    const sourceStatus = result.source.droppableId;
    const destStatus = result.destination.droppableId;
    if (sourceStatus === destStatus) return;

    const workOrder = filteredProcesses.find(item => item.id.toString() === result.draggableId);
    if (!workOrder) return;

    const completion_date = destStatus === 'Completed' ? new Date().toISOString().split('T')[0] : '';
    await handleUpdateProcessStatus(workOrder.id, {
      process_name: workOrder.processes[0]?.name || '',
      status: destStatus,
      completion_date,
    });
  }, [filteredProcesses, handleUpdateProcessStatus]);

  const confirmUpdate = useCallback((workOrderId, formData) => {
    if (window.confirm("Are you sure you want to update this process status?")) return handleUpdateProcessStatus(workOrderId, formData);
    return Promise.reject(new Error("Update cancelled."));
  }, [handleUpdateProcessStatus]);

  const initiateEdit = useCallback((workOrder) => {
    setSelectedWorkOrder(workOrder);
    setShowEditForm(true);
  }, []);

  const showProcesses = useCallback((processes) => {
    setSelectedProcesses(processes);
    setShowProcessesModal(true);
  }, []);

  const getProcessProgress = (processes) => {
    const completed = processes.filter(p => p.status === 'Completed').length;
    return { completed, total: processes.length, percentage: (completed / processes.length) * 100 };
  };

  const ActionsDropdown = ({ workOrder, onEdit }) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);

    useEffect(() => {
      const handleClickOutside = (event) => {
        if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
          setIsOpen(false);
        }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
      <div ref={dropdownRef} className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-2 hover:bg-amber-100 rounded-full focus:outline-none focus:ring-2 focus:ring-amber-300"
          aria-label={`Actions for work order ${workOrder.id}`}
          aria-haspopup="true"
          aria-expanded={isOpen}
        >
          <MoreVertical size={18} className="text-gray-600" />
        </button>
        {isOpen && (
          <div className="absolute right-0 z-10 mt-2 w-48 bg-white shadow-xl rounded-lg ring-1 ring-black ring-opacity-5">
            <button
              onClick={() => { onEdit(workOrder); setIsOpen(false); }}
              className="flex items-center w-full px-4 py-3 text-sm text-gray-700 hover:bg-amber-100 focus:outline-none focus:bg-amber-100 transition-colors"
            >
              <Edit2 size={16} className="mr-3 text-amber-600" /> Update Process Status
            </button>
          </div>
        )}
      </div>
    );
  };

  const handleSort = useCallback((key) => {
    setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc' }));
  }, []);

  const responsiblePersons = useMemo(() => {
    const persons = [...new Set(allProcesses.map(item => item.responsiblePerson))];
    return persons.sort();
  }, [allProcesses]);

  if (userRole !== 'admin') return (
    <div className="min-h-screen flex items-center justify-center text-gray-800 text-2xl" role="alert">
      Access Denied
    </div>
  );

  if (isLoading && !allProcesses.length) return (
    <div className="min-h-screen flex items-center justify-center" aria-live="polite">
      <div className="text-gray-600 text-xl animate-pulse">Loading work orders...</div>
    </div>
  );

  if (error && !showEditForm && !showCreateForm) return (
    <div className="min-h-screen flex items-center justify-center text-red-700" role="alert">
      {error}
      <button
        onClick={() => refetchData()}
        className="ml-4 px-4 py-1 bg-amber-500 text-white rounded hover:bg-amber-600 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-amber-300"
      >
        Retry
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8">
      {/* Header */}
      <div className="bg-white rounded-2xl shadow-lg px-8 py-6 mb-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-4xl font-bold text-gray-800">Work Order Board</h1>
              <p className="text-gray-500 text-sm mt-1">Order #{orderId} • {totalItems} work orders</p>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setViewMode(viewMode === 'list' ? 'kanban' : 'list')}
                className="p-2 bg-amber-100 text-gray-700 rounded-lg hover:bg-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-300"
                aria-label={`Switch to ${viewMode === 'list' ? 'Kanban' : 'List'} view`}
              >
                {viewMode === 'list' ? <LayoutGrid size={20} /> : <LayoutList size={20} />}
              </button>
              <button
                onClick={() => setShowCreateForm(true)}
                className="bg-amber-500 text-white px-4 py-2 rounded-lg hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-300 flex items-center font-medium transition-colors"
                disabled={isLoading}
                aria-label="Create new work order"
              >
                <PlusCircle className="mr-2" size={20} /> New Work Order
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto">
        {/* Controls Bar */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-4 mb-8">
          <div className="flex flex-wrap gap-6 items-center">
            <div className="relative flex-grow min-w-64">
              <label htmlFor="search-input" className="sr-only">Search work orders</label>
              <input
                id="search-input"
                type="text"
                placeholder="Search work orders by ID, component, or person..."
                value={searchInput}
                onChange={handleSearchChange}
                className="w-full p-4 pl-12 border rounded-lg focus:ring-2 focus:ring-amber-300 shadow-md"
                aria-label="Search work orders"
              />
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setQuickFilter(quickFilter === 'Overdue' ? '' : 'Overdue')}
                className={`px-3 py-1 text-sm rounded-full ${quickFilter === 'Overdue' ? 'bg-amber-500 text-white' : 'bg-amber-100 text-gray-700 hover:bg-amber-200'}`}
                aria-label="Filter overdue work orders"
              >
                Overdue
              </button>
              {responsiblePersons.map(person => (
                <button
                  key={person}
                  onClick={() => setQuickFilter(quickFilter === person ? '' : person)}
                  className={`px-3 py-1 text-sm rounded-full ${quickFilter === person ? 'bg-amber-500 text-white' : 'bg-amber-100 text-gray-700 hover:bg-amber-200'}`}
                  aria-label={`Filter by ${person}`}
                >
                  {person}
                </button>
              ))}
            </div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="p-4 border rounded-lg focus:ring-2 focus:ring-amber-300 shadow-md"
              aria-label="Filter work orders by status"
            >
              <option value="All">All Statuses</option>
              <option value="Pending">Pending</option>
              <option value="Completed">Completed</option>
            </select>
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-600">Sort:</span>
              <select
                value={sortConfig.key}
                onChange={(e) => handleSort(e.target.value)}
                className="p-4 border rounded-lg focus:ring-2 focus:ring-amber-300 shadow-md text-sm"
                aria-label="Sort work orders"
              >
                <option value="createdAt">Created Date</option>
                <option value="id">Work Order ID</option>
                <option value="componentName">Component Name</option>
                <option value="targetDate">Target Date</option>
                <option value="status">Status</option>
                <option value="quantity">Quantity</option>
              </select>
              <button
                onClick={() => setSortConfig(prev => ({ ...prev, direction: prev.direction === 'asc' ? 'desc' : 'asc' }))}
                className="p-2 border border-gray-300 rounded-lg hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-300"
                aria-label="Toggle sort direction"
              >
                <ArrowDownUp size={16} className="text-gray-600" />
              </button>
            </div>
            <button
              onClick={() => refetchData()}
              className="p-4 bg-amber-400 text-gray-900 rounded-lg hover:bg-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-300 transition-colors shadow-md text-lg"
              disabled={isLoading}
              aria-label="Refresh work orders"
            >
              Refresh
            </button>
          </div>
        </div>

        {isLoading && allProcesses.length > 0 && (
          <div className="text-gray-600 text-lg mb-4 text-center bg-amber-50 py-2 rounded-lg" aria-live="polite">
            Refreshing data...
          </div>
        )}

        {/* Work Orders Display */}
        {viewMode === 'list' ? (
          <div className="space-y-4">
            {paginatedProcesses.map(workOrder => {
              const progress = getProcessProgress(workOrder.processes);
              const isOverdue = new Date(workOrder.targetDate) < new Date() && workOrder.status !== 'Completed';

              return (
                <div key={workOrder.id} className="bg-white rounded-2xl shadow-lg border border-gray-200 hover:shadow-xl transition-shadow" role="region" aria-label={`Work order ${workOrder.id}`}>
                  <div className="p-4">
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center space-x-3">
                        <div className="flex items-center space-x-2">
                          <Hash size={18} className="text-amber-600" />
                          <span className="text-lg font-semibold text-gray-900">WO-{workOrder.id}</span>
                        </div>
                        <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                          workOrder.status === 'Completed'
                            ? 'bg-green-100 text-green-800'
                            : isOverdue
                              ? 'bg-red-100 text-red-800'
                              : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {workOrder.status === 'Completed' ? (
                            <div className="flex items-center">
                              <CheckCircle2 size={12} className="mr-1" />
                              Completed
                            </div>
                          ) : isOverdue ? (
                            <div className="flex items-center">
                              <AlertCircle size={12} className="mr-1" />
                              Overdue
                            </div>
                          ) : (
                            <div className="flex items-center">
                              <Clock size={12} className="mr-1" />
                              In Progress
                            </div>
                          )}
                        </div>
                      </div>
                      <ActionsDropdown workOrder={workOrder} onEdit={initiateEdit} />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                      <div>
                        <h3 className="text-base font-medium text-gray-900">{workOrder.componentName}</h3>
                        <p className="text-gray-500 mt-1">Quantity: {workOrder.quantity} units</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Responsible</p>
                        <p className="font-medium text-gray-900 flex items-center">
                          <User size={14} className="mr-1 text-amber-600" />
                          {workOrder.responsiblePerson}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500">Target Date</p>
                        <p className={`font-medium ${isOverdue ? 'text-red-600' : 'text-gray-900'} flex items-center`}>
                          <Calendar size={14} className="mr-1 text-amber-600" />
                          {formatDate(workOrder.targetDate)}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3">
                      <div className="flex justify-between items-center mb-2">
                        <h4 className="text-sm font-medium text-gray-900 flex items-center">
                          <Activity size={14} className="mr-1 text-amber-600" />
                          Process Status
                        </h4>
                        <button
                          onClick={() => showProcesses(workOrder.processes)}
                          className="text-amber-600 hover:text-amber-800 text-xs font-medium flex items-center"
                          aria-label={`View process details for work order ${workOrder.id}`}
                        >
                          <Eye size={12} className="mr-1" /> Details
                        </button>
                      </div>
                      <div className="flex justify-between text-xs text-gray-600 mb-1">
                        <span>{progress.completed} of {progress.total} completed</span>
                        <span>{Math.round(progress.percentage)}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-1.5">
                        <div
                          className="bg-amber-600 h-1.5 rounded-full transition-all duration-300"
                          style={{ width: `${progress.percentage}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <DragDropContext onDragEnd={handleDragEnd}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {['Pending', 'In Progress', 'Completed'].map(status => (
                <Droppable droppableId={status} key={status}>
                  {(provided) => (
                    <div
                      className="bg-gray-50 rounded-2xl p-4"
                      {...provided.droppableProps}
                      ref={provided.innerRef}
                    >
                      <h3 className="text-lg font-semibold text-gray-900 mb-3">{status}</h3>
                      {filteredProcesses
                        .filter(item => item.status === status || (status === 'In Progress' && new Date(item.targetDate) < new Date() && item.status !== 'Completed'))
                        .map((workOrder, index) => (
                          <Draggable key={workOrder.id} draggableId={workOrder.id.toString()} index={index}>
                            {(provided) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                className="bg-white rounded-2xl shadow-lg border border-gray-200 mb-3 p-3"
                                role="region"
                                aria-label={`Work order ${workOrder.id}`}
                              >
                                <div className="flex justify-between items-start mb-2">
                                  <div className="flex items-center space-x-2">
                                    <Hash size={16} className="text-amber-600" />
                                    <span className="text-base font-semibold text-gray-900">WO-{workOrder.id}</span>
                                  </div>
                                  <ActionsDropdown workOrder={workOrder} onEdit={initiateEdit} />
                                </div>
                                <h4 className="text-sm font-medium text-gray-900">{workOrder.componentName}</h4>
                                <div className="text-xs text-gray-600 mt-1">
                                  <p>Quantity: {workOrder.quantity} units</p>
                                  <p className="flex items-center">
                                    <User size={12} className="mr-1 text-amber-600" />
                                    {workOrder.responsiblePerson}
                                  </p>
                                  <p className={`flex items-center ${new Date(workOrder.targetDate) < new Date() && workOrder.status !== 'Completed' ? 'text-red-600' : ''}`}>
                                    <Calendar size={12} className="mr-1 text-amber-600" />
                                    {formatDate(workOrder.targetDate)}
                                  </p>
                                </div>
                              </div>
                            )}
                          </Draggable>
                        ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              ))}
            </div>
          </DragDropContext>
        )}

        {/* Pagination for List View */}
        {viewMode === 'list' && totalItems > 0 && (
          <div className="flex justify-between items-center mt-6 bg-white rounded-2xl shadow-lg border border-gray-200 p-4">
            <div className="text-gray-600 text-sm">
              Showing {paginatedProcesses.length} of {filteredProcesses.length} filtered work orders
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setPage(p => (p > 0 ? p - 1 : 0))}
                disabled={page === 0}
                className="p-2 bg-white border rounded-lg disabled:opacity-50 hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-300"
                aria-label="Previous page"
              >
                <ChevronLeft size={20} />
              </button>
              <span className="px-4 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm font-medium text-amber-800">
                Page {page + 1} of {Math.ceil(filteredProcesses.length / itemsPerPage)}
              </span>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={(page + 1) * itemsPerPage >= filteredProcesses.length}
                className="p-2 bg-white border rounded-lg disabled:opacity-50 hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-300"
                aria-label="Next page"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          </div>
        )}

        {/* Empty State */}
        {filteredProcesses.length === 0 && (
          <div className="text-center py-12 bg-white rounded-2xl shadow-lg border border-gray-200" role="alert">
            <Package size={48} className="mx-auto mb-4 text-gray-400" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No work orders found</h3>
            {searchTerm || filterStatus !== 'All' || quickFilter ? (
              <p className="text-gray-600 mb-4">Try adjusting your search criteria or filters.</p>
            ) : (
              <p className="text-gray-600 mb-4">Get started by creating your first work order.</p>
            )}
            <button
              onClick={() => setShowCreateForm(true)}
              className="bg-amber-500 text-white px-4 py-2 rounded-lg hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-300 flex items-center mx-auto"
              aria-label="Create new work order"
            >
              <PlusCircle className="mr-2" size={18} /> Create Work Order
            </button>
          </div>
        )}
      </div>

      {/* Create Work Order Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-70 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-8 rounded-2xl shadow-xl w-[500px] relative" role="dialog" aria-labelledby="create-form-title">
            <button
              onClick={() => setShowCreateForm(false)}
              className="absolute top-4 right-4 text-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-300"
              aria-label="Close create form"
            >
              <XCircle size={24} />
            </button>
            <h2 id="create-form-title" className="text-2xl font-bold mb-6 text-gray-800">Create New Work Order</h2>
            <CreateWorkOrderForm orderId={orderId} onSubmit={handleCreateWorkOrder} onClose={() => setShowCreateForm(false)} />
          </div>
        </div>
      )}

      {/* Edit Process Status Modal */}
      {showEditForm && selectedWorkOrder && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-70 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-8 rounded-2xl shadow-xl w-[500px] relative" role="dialog" aria-labelledby="edit-form-title">
            <button
              onClick={() => setShowEditForm(false)}
              className="absolute top-4 right-4 text-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-300"
              aria-label="Close edit form"
            >
              <XCircle size={24} />
            </button>
            <h2 id="edit-form-title" className="text-2xl font-bold mb-6 text-gray-800">Update Process Status</h2>
            <EditProcessStatusForm workOrder={selectedWorkOrder} onSubmit={confirmUpdate} onClose={() => setShowEditForm(false)} />
          </div>
        </div>
      )}

      {/* Processes Detail Modal */}
      {showProcessesModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-70 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden relative" role="dialog" aria-labelledby="processes-modal-title">
            <button
              onClick={() => setShowProcessesModal(false)}
              className="absolute top-4 right-4 text-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-300"
              aria-label="Close processes modal"
            >
              <XCircle size={24} />
            </button>
            <h2 id="processes-modal-title" className="text-2xl font-bold mb-6 text-gray-800 p-4 border-b border-gray-200">Process Timeline</h2>
            <div className="p-4 overflow-y-auto max-h-96">
              <div className="space-y-4">
                {selectedProcesses.map((process, index) => (
                  <div key={process.name} className="relative">
                    {index < selectedProcesses.length - 1 && (
                      <div className="absolute left-5 top-10 w-0.5 h-12 bg-gray-300"></div>
                    )}
                    <div className="flex items-start space-x-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm ${
                        process.status === 'Completed' ? 'bg-green-500' : 'bg-gray-400'
                      }`}>
                        {process.sequence}
                      </div>
                      <div className="flex-1 bg-gray-50 rounded-lg p-3">
                        <div className="flex justify-between items-start mb-2">
                          <h3 className="text-base font-medium text-gray-900">{process.name}</h3>
                          <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                            process.status === 'Completed' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                          }`}>
                            {process.status}
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                          <div>
                            <p className="text-gray-500">Responsible</p>
                            <p className="font-medium text-gray-900">{process.responsible}</p>
                          </div>
                          <div>
                            <p className="text-gray-500">Completion Date</p>
                            <p className="font-medium text-gray-900">{formatDate(process.completion_date)}</p>
                          </div>
                          <div className="md:col-span-2">
                            <p className="text-gray-500">Description</p>
                            <p className="font-medium text-gray-900">{process.description}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <ToastContainer position="top-right" autoClose={3000} hideProgressBar={false} closeOnClick pauseOnHover draggable />
    </div>
  );
}

// CreateWorkOrderForm Component
const CreateWorkOrderForm = ({ orderId, onSubmit, onClose }) => {
  const [formData, setFormData] = useState({
    order_id: orderId,
    component_id: '',
    quantity: 0,
    responsible_person: '',
    target_date: '',
  });
  const [errors, setErrors] = useState({
    component_id: '',
    quantity: '',
    responsible_person: '',
    target_date: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validateField = (name, value) => {
    if (name === 'component_id' && !value) return 'Component ID is required';
    if (name === 'quantity' && value <= 0) return 'Quantity must be greater than 0';
    if (name === 'responsible_person' && !value.trim()) return 'Responsible person is required';
    if (name === 'target_date' && !value) return 'Target date is required';
    return '';
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    const processedValue = name === 'quantity' ? parseInt(value) || 0 : name === 'component_id' ? parseInt(value) || '' : value;
    setFormData(prev => ({ ...prev, [name]: processedValue }));
    setErrors(prev => ({ ...prev, [name]: validateField(name, processedValue) }));
  };

  const handleSave = async () => {
    const fieldErrors = {
      component_id: validateField('component_id', formData.component_id),
      quantity: validateField('quantity', formData.quantity),
      responsible_person: validateField('responsible_person', formData.responsible_person),
      target_date: validateField('target_date', formData.target_date),
    };
    setErrors(fieldErrors);
    if (Object.values(fieldErrors).some(err => err)) return;

    try {
      setIsSubmitting(true);
      await onSubmit(formData);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="space-y-4" onSubmit={e => e.preventDefault()}>
      <div>
        <label htmlFor="create-order-id" className="text-gray-700 font-medium">Order ID</label>
        <input
          id="create-order-id"
          type="number"
          name="order_id"
          value={formData.order_id}
          disabled
          className="w-full p-2 border rounded-lg bg-gray-100 text-sm"
          aria-readonly="true"
        />
      </div>
      <div>
        <label htmlFor="create-component-id" className="text-gray-700 font-medium">Component ID</label>
        <input
          id="create-component-id"
          type="number"
          name="component_id"
          value={formData.component_id}
          onChange={handleChange}
          className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-amber-300"
          aria-invalid={!!errors.component_id}
          aria-describedby={errors.component_id ? "create-component-id-error" : undefined}
          disabled={isSubmitting}
        />
        {errors.component_id && <p id="create-component-id-error" className="text-red-600 text-sm mt-1">{errors.component_id}</p>}
      </div>
      <div>
        <label htmlFor="create-quantity" className="text-gray-700 font-medium">Quantity</label>
        <input
          id="create-quantity"
          type="number"
          name="quantity"
          value={formData.quantity}
          onChange={handleChange}
          min="1"
          className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-amber-300"
          aria-invalid={!!errors.quantity}
          aria-describedby={errors.quantity ? "create-quantity-error" : undefined}
          disabled={isSubmitting}
        />
        {errors.quantity && <p id="create-quantity-error" className="text-red-600 text-sm mt-1">{errors.quantity}</p>}
      </div>
      <div>
        <label htmlFor="create-responsible-person" className="text-gray-700 font-medium">Responsible Person</label>
        <input
          id="create-responsible-person"
          type="text"
          name="responsible_person"
          value={formData.responsible_person}
          onChange={handleChange}
          className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-amber-300"
          aria-invalid={!!errors.responsible_person}
          aria-describedby={errors.responsible_person ? "create-responsible-person-error" : undefined}
          disabled={isSubmitting}
        />
        {errors.responsible_person && <p id="create-responsible-person-error" className="text-red-600 text-sm mt-1">{errors.responsible_person}</p>}
      </div>
      <div>
        <label htmlFor="create-target-date" className="text-gray-700 font-medium">Target Date</label>
        <input
          id="create-target-date"
          type="date"
          name="target_date"
          value={formData.target_date}
          onChange={handleChange}
          className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-amber-300"
          aria-invalid={!!errors.target_date}
          aria-describedby={errors.target_date ? "create-target-date-error" : undefined}
          disabled={isSubmitting}
        />
        {errors.target_date && <p id="create-target-date-error" className="text-red-600 text-sm mt-1">{errors.target_date}</p>}
      </div>
      <div className="flex justify-end space-x-4">
        <button
          type="button"
          onClick={onClose}
          className="p-2 bg-gray-300 text-gray-900 rounded-lg hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-300"
          disabled={isSubmitting}
          aria-label="Cancel"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          className="p-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-300 flex items-center"
          disabled={isSubmitting}
          aria-label={isSubmitting ? 'Creating...' : 'Create'}
        >
          {isSubmitting ? 'Creating...' : 'Create'}
        </button>
      </div>
    </form>
  );
};

// EditProcessStatusForm Component
const EditProcessStatusForm = ({ workOrder, onSubmit, onClose }) => {
  const [formData, setFormData] = useState({
    process_name: workOrder.processes[0]?.name || '',
    status: workOrder.processes[0]?.status || 'Pending',
    completion_date: workOrder.processes[0]?.completion_date || '',
  });
  const [errors, setErrors] = useState({
    process_name: '',
    status: '',
    completion_date: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validateField = (name, value) => {
    if (name === 'process_name' && !value) return 'Process name is required';
    if (name === 'status' && !['Pending', 'Completed'].includes(value)) return 'Status must be Pending or Completed';
    if (name === 'completion_date' && value && isNaN(new Date(value))) return 'Invalid completion date';
    return '';
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setErrors(prev => ({ ...prev, [name]: validateField(name, value) }));
  };

  const handleSave = async () => {
    const fieldErrors = {
      process_name: validateField('process_name', formData.process_name),
      status: validateField('status', formData.status),
      completion_date: validateField('completion_date', formData.completion_date),
    };
    setErrors(fieldErrors);
    if (Object.values(fieldErrors).some(err => err)) return;

    try {
      setIsSubmitting(true);
      await onSubmit(workOrder.id, formData);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="space-y-4" onSubmit={e => e.preventDefault()}>
      <div>
        <label htmlFor="edit-process-name" className="text-gray-700 font-medium">Process Name</label>
        <select
          id="edit-process-name"
          name="process_name"
          value={formData.process_name}
          onChange={handleChange}
          className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-amber-300"
          aria-invalid={!!errors.process_name}
          aria-describedby={errors.process_name ? "edit-process-name-error" : undefined}
          disabled={isSubmitting}
        >
          {workOrder.processes.map(process => (
            <option key={process.name} value={process.name}>{process.name}</option>
          ))}
        </select>
        {errors.process_name && <p id="edit-process-name-error" className="text-red-600 text-sm mt-1">{errors.process_name}</p>}
      </div>
      <div>
        <label htmlFor="edit-status" className="text-gray-700 font-medium">Status</label>
        <select
          id="edit-status"
          name="status"
          value={formData.status}
          onChange={handleChange}
          className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-amber-300"
          aria-invalid={!!errors.status}
          aria-describedby={errors.status ? "edit-status-error" : undefined}
          disabled={isSubmitting}
        >
          <option value="Pending">Pending</option>
          <option value="Completed">Completed</option>
        </select>
        {errors.status && <p id="edit-status-error" className="text-red-600 text-sm mt-1">{errors.status}</p>}
      </div>
      <div>
        <label htmlFor="edit-completion-date" className="text-gray-700 font-medium">Completion Date</label>
        <input
          id="edit-completion-date"
          type="date"
          name="completion_date"
          value={formData.completion_date}
          onChange={handleChange}
          className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-amber-300"
          aria-invalid={!!errors.completion_date}
          aria-describedby={errors.completion_date ? "edit-completion-date-error" : undefined}
          disabled={isSubmitting}
        />
        {errors.completion_date && <p id="edit-completion-date-error" className="text-red-600 text-sm mt-1">{errors.completion_date}</p>}
      </div>
      <div className="flex justify-end space-x-4">
        <button
          type="button"
          onClick={onClose}
          className="p-2 bg-gray-300 text-gray-900 rounded-lg hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-300"
          disabled={isSubmitting}
          aria-label="Cancel"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          className="p-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-300 flex items-center"
          disabled={isSubmitting}
          aria-label={isSubmitting ? 'Saving...' : 'Save'}
        >
          {isSubmitting ? 'Saving...' : 'Save'}
        </button>
      </div>
    </form>
  );
};

export default ProcessPage;