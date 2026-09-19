import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Search, Download, Loader2, Phone, MapPin, Calendar, Hash } from 'lucide-react';
import axios from 'axios';
import { useNotify } from '../../hooks/useNotify';
import PeoplePage from '../shared/PeoplePage';

const formatDisplayDate = (s) => {
  if (!s) return '-';
  const dateStr = s.split('T')[0];
  const [year, month, day] = dateStr.split('-').map(Number);
  if (!year || !month || !day) return '-';
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('en-GB', { 
    day: '2-digit', 
    month: 'short', 
    year: 'numeric' 
  });
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

  // Full Address Modal State
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [fullAddressEmployee, setFullAddressEmployee] = useState(null);

  const abortRef = useRef(null);
  const { notifySuccess, notifyError } = useNotify();

  // Fetch employees
  const fetchAll = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setData([]);

    const token = localStorage.getItem('token');
    if (!token) {
      notifyError('Please log in again');
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
      notifyError(err.response?.data?.error || 'Failed to load employee details');
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }, [search, employeeIdFilter]);

  useEffect(() => {
    fetchAll();
    return () => { if (abortRef.current) abortRef.current.abort(); };
  }, [search, employeeIdFilter]);

  // Edit Modal
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
      notifySuccess('Employee updated successfully');
      closeModal();
      fetchAll();
    } catch (err) {
      notifyError(err.response?.data?.error || 'Update failed');
    } finally {
      setSubmitting(false);
    }
  };

  // Address Modal
  const openAddressModal = (emp) => {
    if (!emp?.address) return;
    setFullAddressEmployee(emp);
    setShowAddressModal(true);
  };

  const closeAddressModal = () => {
    setShowAddressModal(false);
    setFullAddressEmployee(null);
  };

  // CSV Export
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
    <PeoplePage
      title="Employee Details"
      subtitle={data.length > 0 && `${data.length} employee${data.length > 1 ? 's' : ''}`}
    >
        {/* Controls */}
        <div className="mb-5 flex flex-col sm:flex-row gap-3 flex-wrap">
          <div className="flex-1 relative min-w-[200px]">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-[17px] h-[17px]" />
            <input
              type="text"
              placeholder="Search name, email, ID..."
              className="w-full pl-11 pr-4 py-3 rounded-lg border border-navy-100 focus:ring-2 focus:ring-gold-400 focus:outline-none transition-colors bg-white shadow-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="relative min-w-[180px]">
            <Hash className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Filter by Emp ID"
              className="w-full pl-9 pr-4 py-3 rounded-lg border border-navy-100 focus:ring-2 focus:ring-gold-400 focus:outline-none transition-colors bg-white shadow-sm"
              value={employeeIdFilter}
              onChange={(e) => setEmployeeIdFilter(e.target.value)}
            />
          </div>
          <button
            onClick={exportCSV}
            disabled={data.length === 0}
            className="px-5 py-3 bg-navy-800 text-white font-medium rounded-lg hover:bg-navy-700 flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" /> Export CSV
          </button>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl shadow-sm border border-navy-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px]">
              <thead className="bg-navy-50">
                <tr>
                  <th className="px-5 py-3 text-left text-sm font-semibold text-navy-800 whitespace-nowrap w-20">Emp ID</th>
                  <th className="px-5 py-3 text-left text-sm font-semibold text-navy-800 whitespace-nowrap">Name</th>
                  <th className="px-5 py-3 text-left text-sm font-semibold text-navy-800 whitespace-nowrap">Email</th>
                  <th className="px-5 py-3 text-left text-sm font-semibold text-navy-800 whitespace-nowrap w-28">Role</th>
                  <th className="px-5 py-3 text-left text-sm font-semibold text-navy-800 whitespace-nowrap w-32">Phone</th>
                  <th className="px-5 py-3 text-left text-sm font-semibold text-navy-800 whitespace-nowrap w-40">Date of Joining</th>
                  <th className="px-5 py-3 text-left text-sm font-semibold text-navy-800 whitespace-nowrap">Address</th>
                  <th className="px-5 py-3 text-left text-sm font-semibold text-navy-800 whitespace-nowrap w-24">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-100">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-16 text-center">
                      <Loader2 className="w-8 h-8 animate-spin text-gold-500 mx-auto" />
                    </td>
                  </tr>
                ) : data.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-14 text-center text-gray-400">
                      {search || employeeIdFilter ? 'No employees match your filter' : 'No employee details found'}
                    </td>
                  </tr>
                ) : (
                  data.map((emp) => (
                    <tr key={emp.employee_id} className="hover:bg-navy-50/60 transition-colors">
                      <td className="px-5 py-3.5 font-mono text-navy-800">{emp.employee_id || '-'}</td>
                      <td className="px-5 py-3.5 font-medium text-navy-800">{emp.name}</td>
                      <td className="px-5 py-3.5 text-gray-600">{emp.email}</td>
                      <td className="px-5 py-3.5">
                        <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-semibold bg-gold-400/25 text-gold-600 capitalize">
                          {emp.role_name || '-'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-gray-600">
                        <div className="flex items-center gap-1">
                          <Phone className="w-3.5 h-3.5 text-gray-400" />
                          {emp.phone_number || '-'}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-gray-600">
                        <div className="flex items-center gap-1 whitespace-nowrap">
                          <Calendar className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                          <span>{formatDisplayDate(emp.date_of_joining)}</span>
                        </div>
                      </td>
                      {/* Clickable Address */}
                      <td className="px-5 py-3.5 text-gray-600">
                        <div 
                          className="flex items-center gap-1 cursor-pointer group"
                          onClick={() => openAddressModal(emp)}
                          title={emp.address || '-'}
                        >
                          <MapPin className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                          <span className="truncate max-w-[220px] group-hover:text-gold-600 transition-colors">
                            {emp.address || '-'}
                          </span>
                          {emp.address && (
                            <span className="text-gold-600 text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                              ↗
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <button
                          onClick={() => openEditModal(emp)}
                          className="px-4 py-1.5 text-xs font-semibold text-navy-800 bg-navy-50 rounded-lg hover:bg-navy-100 transition-colors"
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

      {/* Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/50 px-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 relative max-h-[90vh] overflow-y-auto">
            <button onClick={closeModal} className="absolute top-2 right-2 p-2 text-gray-400 hover:text-gray-600 text-xl font-bold transition-colors">×</button>
            <h2 className="font-display text-xl font-bold text-navy-800 mb-5 pr-8">Edit Employee Detail</h2>

            <div className="bg-gold-400/15 border border-gold-400/40 rounded-lg px-4 py-3 mb-4">
              <p className="text-sm text-navy-800 font-medium">
                Editing: <span className="font-bold">{selectedEmployee?.name}</span>
                <span className="ml-2 font-mono text-xs text-gold-600">({selectedEmployee?.employee_id})</span>
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-navy-800 mb-1">Phone Number</label>
                <input
                  type="text"
                  className="w-full px-4 py-2.5 border border-navy-100 rounded-lg focus:ring-2 focus:ring-gold-400 focus:outline-none transition-colors"
                  placeholder="Enter phone number"
                  value={formData.phone_number}
                  onChange={(e) => setFormData((p) => ({ ...p, phone_number: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-navy-800 mb-1">Date of Joining</label>
                <input
                  type="date"
                  className="w-full px-4 py-2.5 border border-navy-100 rounded-lg focus:ring-2 focus:ring-gold-400 focus:outline-none transition-colors"
                  value={formData.date_of_joining}
                  onChange={(e) => setFormData((p) => ({ ...p, date_of_joining: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-navy-800 mb-1">Address</label>
                <textarea
                  className="w-full px-4 py-2.5 border border-navy-100 rounded-lg focus:ring-2 focus:ring-gold-400 focus:outline-none transition-colors resize-none"
                  placeholder="Enter address"
                  rows={3}
                  value={formData.address}
                  onChange={(e) => setFormData((p) => ({ ...p, address: e.target.value }))}
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={closeModal} className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium">
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-1 py-2.5 bg-navy-800 text-white rounded-lg hover:bg-navy-700 transition-colors font-medium disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full Address Modal */}
      {showAddressModal && fullAddressEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/50 px-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 relative max-h-[90vh] overflow-y-auto">
            <button 
              onClick={closeAddressModal} 
              className="absolute top-2 right-2 p-2 text-gray-400 hover:text-gray-600 text-2xl font-bold transition-colors"
            >
              ×
            </button>

            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-gold-400/25 rounded-xl">
                <MapPin className="w-6 h-6 text-gold-600" />
              </div>
              <div>
                <h2 className="font-display text-xl font-bold text-navy-800">Full Address</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  {fullAddressEmployee.name} • {fullAddressEmployee.employee_id}
                </p>
              </div>
            </div>

            <div className="bg-navy-50/60 border border-navy-100 rounded-lg p-5 text-gray-700 leading-relaxed whitespace-pre-wrap break-words">
              {fullAddressEmployee.address}
            </div>

            <button
              onClick={closeAddressModal}
              className="mt-6 w-full py-3 bg-navy-800 hover:bg-navy-700 text-white rounded-lg font-medium transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}

    </PeoplePage>
  );
}

export default EmployeeDetailsPage;