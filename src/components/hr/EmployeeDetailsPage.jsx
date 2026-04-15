import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Search, Download, Loader2, Sparkles, Phone, MapPin, Calendar, Hash } from 'lucide-react';
import { toast, ToastContainer } from 'react-toastify';
import axios from 'axios';

const formatDisplayDate = (s) => {
  if (!s) return '-';
  const dateStr = s.split('T')[0];
  const [year, month, day] = dateStr.split('-').map(Number);
  if (!year || !month || !day) return '-';
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const API_URL = import.meta.env.VITE_BACKEND_URL;

function EmployeeDetailsPage() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [employeeIdFilter, setEmployeeIdFilter] = useState('');

  // Edit modal state
  const [showModal, setShowModal] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [formData, setFormData] = useState({ phone_number: '', date_of_joining: '', address: '' });
  const [submitting, setSubmitting] = useState(false);

  // New: Full Address Modal State
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [fullAddressEmployee, setFullAddressEmployee] = useState(null);

  const abortRef = useRef(null);

  // ── Fetch ALL employees ────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setData([]);

    const token = localStorage.getItem('token');
    if (!token) {
      toast.error('Please log in again');
      setLoading(false);
      return;
    }

    try {
      let allEmployees = [];
      let cursor = null;

      do {
        const params = {
          limit: 100,
          ...(search && { search }),
          ...(employeeIdFilter && { employee_id: employeeIdFilter }),
          ...(cursor && { cursor }),
        };

        const res = await axios.get(`${API_URL}/api/employee-details`, {
          params,
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });

        allEmployees = [...allEmployees, ...(res.data.employees || [])];
        cursor = res.data.nextCursor || null;
      } while (cursor);

      setData(allEmployees);
    } catch (err) {
      if (err.name === 'AbortError' || err.code === 'ERR_CANCELED') return;
      toast.error(err.response?.data?.error || 'Failed to load employee details');
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }, [search, employeeIdFilter]);

  useEffect(() => {
    fetchAll();
    return () => { if (abortRef.current) abortRef.current.abort(); };
  }, [search, employeeIdFilter]);

  // ── Edit modal ─────────────────────────────────────────────────
  const openEditModal = (emp) => {
    setSelectedEmployee(emp);
    setFormData({
      phone_number: emp.phone_number || '',
      date_of_joining: emp.date_of_joining || '',
      address: emp.address || '',
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedEmployee(null);
    setFormData({ phone_number: '', date_of_joining: '', address: '' });
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    const token = localStorage.getItem('token');
    try {
      await axios.patch(
        `${API_URL}/api/employee-details/${selectedEmployee.employee_id}`,
        formData,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('Employee updated successfully');
      closeModal();
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Update failed');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Full Address Modal ─────────────────────────────────────────
  const openAddressModal = (emp) => {
    if (!emp?.address) return;
    setFullAddressEmployee(emp);
    setShowAddressModal(true);
  };

  const closeAddressModal = () => {
    setShowAddressModal(false);
    setFullAddressEmployee(null);
  };

  // ── CSV Export ─────────────────────────────────────────────────
  const exportCSV = useCallback(() => {
    const headers = ['Employee ID', 'Name', 'Email', 'Role', 'Phone', 'Date of Joining', 'Address'];
    const rows = data.map((r) => [
      r.employee_id || '-',
      r.name,
      r.email,
      r.role_name || '-',
      r.phone_number || '-',
      formatDisplayDate(r.date_of_joining),
      (r.address || '-').replace(/,/g, ' '),
    ]);
    const csv = [headers, ...rows].map((row) => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'employee_details.csv';
    a.click();
    URL.revokeObjectURL(url);
  }, [data]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-25 to-gray-100 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-96 h-96 bg-amber-200 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse"></div>
      <div className="absolute top-0 right-0 w-96 h-96 bg-orange-200 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse delay-1000"></div>
      <div className="absolute -bottom-32 left-1/2 transform -translate-x-1/2 w-96 h-96 bg-yellow-200 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse delay-2000"></div>

      <div className="relative z-10 p-6">
        {/* Header */}
        <div className="text-center mb-12 mt-8">
          <div className="inline-flex items-center justify-center mb-4">
            <div className="p-3 bg-gradient-to-r from-amber-400 to-orange-400 rounded-2xl shadow-lg">
              <Sparkles className="w-8 h-8 text-white animate-pulse" />
            </div>
          </div>
          <h1 className="text-5xl font-bold bg-gradient-to-r from-gray-800 via-gray-700 to-amber-700 bg-clip-text text-transparent mb-4 tracking-tight">
            Employee Details
          </h1>
          {data.length > 0 && (
            <p className="text-sm text-gray-500 mt-2">
              {data.length} employee{data.length > 1 ? 's' : ''}
            </p>
          )}
        </div>

        {/* Controls */}
        <div className="max-w-6xl mx-auto mb-8 flex flex-col sm:flex-row gap-4 flex-wrap">
          <div className="flex-1 relative min-w-[200px]">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search name, email, ID..."
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-amber-200 focus:ring-4 focus:ring-amber-300 focus:outline-none transition-all bg-white"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="relative min-w-[180px]">
            <Hash className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Filter by Emp ID"
              className="w-full pl-9 pr-4 py-3 rounded-xl border border-amber-200 focus:ring-4 focus:ring-amber-300 focus:outline-none transition-all bg-white"
              value={employeeIdFilter}
              onChange={(e) => setEmployeeIdFilter(e.target.value)}
            />
          </div>
          <button
            onClick={exportCSV}
            disabled={data.length === 0}
            className="px-5 py-3 bg-white border border-amber-300 text-amber-700 font-medium rounded-xl shadow hover:shadow-md flex items-center gap-2 transition-all hover:bg-amber-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-5 h-5" /> Export CSV
          </button>
        </div>

        {/* Table */}
        <div className="max-w-7xl mx-auto bg-white rounded-2xl shadow-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gradient-to-r from-amber-100 to-orange-50">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Emp ID</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Name</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Email</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Role</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Phone</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Date of Joining</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Address</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-16 text-center">
                      <Loader2 className="w-8 h-8 animate-spin text-amber-500 mx-auto" />
                    </td>
                  </tr>
                ) : data.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-16 text-center text-gray-500 text-lg">
                      {search || employeeIdFilter ? 'No employees match your filter' : 'No employee details found'}
                    </td>
                  </tr>
                ) : (
                  data.map((emp) => (
                    <tr key={emp.employee_id} className="hover:bg-amber-50 transition-colors">
                      <td className="px-6 py-4 text-sm font-mono text-gray-700">{emp.employee_id || '-'}</td>
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">{emp.name}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{emp.email}</td>
                      <td className="px-6 py-4">
                        <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800 capitalize">
                          {emp.role_name || '-'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        <div className="flex items-center gap-1">
                          <Phone className="w-3.5 h-3.5 text-gray-400" />
                          {emp.phone_number || '-'}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-gray-400" />
                          {formatDisplayDate(emp.date_of_joining)}
                        </div>
                      </td>
                      {/* Updated Clickable Address Column */}
                      <td className="px-6 py-4 text-sm text-gray-600">
                        <div 
                          className="flex items-center gap-1 cursor-pointer group"
                          onClick={() => openAddressModal(emp)}
                          title={emp.address || '-'}
                        >
                          <MapPin className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                          <span className="truncate max-w-[200px] group-hover:text-amber-700 transition-colors">
                            {emp.address || '-'}
                          </span>
                          {emp.address && (
                            <span className="text-amber-500 text-xs opacity-0 group-hover:opacity-100 transition-opacity font-medium">
                              ↗
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => openEditModal(emp)}
                          className="px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors"
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-8 relative">
            <button onClick={closeModal} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-xl font-bold transition-colors">×</button>
            <h2 className="text-2xl font-bold text-gray-800 mb-6">Edit Employee Detail</h2>

            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4">
              <p className="text-sm text-amber-800 font-medium">
                Editing: <span className="font-bold">{selectedEmployee?.name}</span>
                <span className="ml-2 font-mono text-xs text-amber-600">({selectedEmployee?.employee_id})</span>
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                <input
                  type="text"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-4 focus:ring-amber-300 focus:outline-none transition-all"
                  placeholder="Enter phone number"
                  value={formData.phone_number}
                  onChange={(e) => setFormData((p) => ({ ...p, phone_number: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date of Joining</label>
                <input
                  type="date"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-4 focus:ring-amber-300 focus:outline-none transition-all"
                  value={formData.date_of_joining}
                  onChange={(e) => setFormData((p) => ({ ...p, date_of_joining: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                <textarea
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-4 focus:ring-amber-300 focus:outline-none transition-all resize-none"
                  placeholder="Enter address"
                  rows={3}
                  value={formData.address}
                  onChange={(e) => setFormData((p) => ({ ...p, address: e.target.value }))}
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={closeModal} className="flex-1 py-2.5 border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 transition-colors font-medium">
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-1 py-2.5 bg-gradient-to-r from-amber-400 to-orange-400 text-white rounded-xl hover:shadow-lg transition-all font-medium disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full Address View Modal */}
      {showAddressModal && fullAddressEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 relative">
            <button 
              onClick={closeAddressModal} 
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-2xl font-bold transition-colors"
            >
              ×
            </button>

            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-amber-100 rounded-2xl">
                <MapPin className="w-7 h-7 text-amber-600" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-800">Full Address</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  {fullAddressEmployee.name} • {fullAddressEmployee.employee_id}
                </p>
              </div>
            </div>

            <div className="bg-gray-50 border border-gray-100 rounded-2xl p-6 text-gray-700 leading-relaxed whitespace-pre-wrap break-words">
              {fullAddressEmployee.address}
            </div>

            <button
              onClick={closeAddressModal}
              className="mt-6 w-full py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-2xl font-medium transition-all"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <ToastContainer position="top-right" theme="light" />
    </div>
  );
}

export default EmployeeDetailsPage;