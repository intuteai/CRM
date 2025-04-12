import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { ArrowDownUp, X } from 'lucide-react';
import io from 'socket.io-client';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const SOCKET_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
const BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
const API_URL = `${BASE_URL}/api/enquiry`;

// Fallback formatDate function
const formatDate = (dateString) => {
  if (!dateString) return 'N/A';
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString();
  } catch (error) {
    console.error('Error formatting date:', error);
    return dateString;
  }
};

function EnquiryPage({ socket: providedSocket }) {
  const [enquiries, setEnquiries] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sortConfig, setSortConfig] = useState({ key: 'enquiry_id', direction: 'ascending' });
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedEnquiry, setSelectedEnquiry] = useState(null);
  const [newEnquiry, setNewEnquiry] = useState({
    company_name: '',
    contact_person: '',
    mail_id: '',
    phone_no: '',
    items_required: '',
    status: 'Pending',
    last_discussion: '',
    next_interaction: '',
  });
  const [errors, setErrors] = useState({});
  const limit = 10;
  const tableRef = useRef(null);
  const hasFetched = useRef(false);
  const isFetching = useRef(false);

  const socket = useMemo(
    () =>
      providedSocket ||
      io(SOCKET_URL, {
        withCredentials: true,
        transports: ['websocket'],
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      }),
    [providedSocket]
  );

  const fetchEnquiries = useCallback(async () => {
    if (isFetching.current) return;

    isFetching.current = true;
    setIsLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('token');
      const url = `${API_URL}?limit=${limit}&offset=${page * limit}`;

      console.log('Fetching enquiries from:', url);

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `Server responded with status: ${response.status}`);
      }

      const responseData = await response.json();
      console.log('Fetched response:', responseData);

      if (!responseData.data || !Array.isArray(responseData.data)) {
        throw new Error('Invalid data format');
      }

      setEnquiries(responseData.data);
      setTotal(responseData.total || 0);
      setError(null);
    } catch (err) {
      console.error('Error fetching enquiries:', err);
      const errorMessage = err.message || 'Network error. Please try again later.';
      setError(errorMessage);
      toast.error(errorMessage, { autoClose: 3000 });
    } finally {
      setIsLoading(false);
      isFetching.current = false;
    }
  }, [page]);

  useEffect(() => {
    if (!hasFetched.current) {
      fetchEnquiries();
      hasFetched.current = true;
    }

    socket.on('connect', () => {
      console.log('Connected to Socket.IO in EnquiryPage');
      toast.success('Connected to real-time updates!', { autoClose: 2000 });
    });

    socket.on('connect_error', (err) => {
      console.error('Socket connection error:', err);
      toast.error('Failed to connect to real-time updates.', { autoClose: 3000 });
    });

    socket.on('enquiryUpdate', ({
      enquiry_id,
      company_name,
      contact_person,
      mail_id,
      phone_no,
      items_required,
      status,
      last_discussion,
      next_interaction,
    }) => {
      setEnquiries((prev) => {
        if (!Array.isArray(prev)) return prev || [];

        if (status === 'Deleted') {
          toast.info(`Enquiry #${enquiry_id} deleted`, { className: 'bg-amber-100 border-amber-300' });
          return prev.filter((enquiry) => enquiry.enquiry_id !== enquiry_id);
        }

        const enquiryIndex = prev.findIndex((enquiry) => enquiry.enquiry_id === enquiry_id);
        const isNewEnquiry = enquiryIndex === -1;

        if (isNewEnquiry) {
          const newEnquiry = {
            enquiry_id,
            company_name,
            contact_person,
            mail_id,
            phone_no,
            items_required,
            status,
            last_discussion,
            next_interaction,
          };
          toast.info(`New enquiry #${enquiry_id} added`, { className: 'bg-amber-100 border-amber-300' });
          return [newEnquiry, ...prev];
        }

        const enquiryToUpdate = prev[enquiryIndex];
        if (
          enquiryToUpdate.company_name === company_name &&
          enquiryToUpdate.contact_person === contact_person &&
          enquiryToUpdate.mail_id === mail_id &&
          enquiryToUpdate.phone_no === phone_no &&
          enquiryToUpdate.items_required === items_required &&
          enquiryToUpdate.status === status &&
          enquiryToUpdate.last_discussion === last_discussion &&
          enquiryToUpdate.next_interaction === next_interaction
        ) {
          return prev;
        }

        const updatedEnquiries = [...prev];
        updatedEnquiries[enquiryIndex] = {
          ...enquiryToUpdate,
          company_name,
          contact_person,
          mail_id,
          phone_no,
          items_required,
          status,
          last_discussion,
          next_interaction,
        };

        toast.info(`Enquiry #${enquiry_id} updated`, { className: 'bg-amber-100 border-amber-300' });
        return updatedEnquiries;
      });
    });

    return () => {
      socket.off('connect');
      socket.off('connect_error');
      socket.off('enquiryUpdate');
      if (!providedSocket) socket.disconnect();
    };
  }, [fetchEnquiries, socket, providedSocket]);

  const handleSort = useCallback((key) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'ascending' ? 'descending' : 'ascending',
    }));
  }, []);

  const validateForm = () => {
    const newErrors = {};
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phoneRegex = /^[0-9]{10}$/;

    if (!newEnquiry.company_name || newEnquiry.company_name.length < 3)
      newErrors.company_name = 'Company name must be at least 3 characters';
    if (newEnquiry.contact_person && newEnquiry.contact_person.length < 3)
      newErrors.contact_person = 'Contact person must be at least 3 characters';
    if (newEnquiry.mail_id && !emailRegex.test(newEnquiry.mail_id))
      newErrors.mail_id = 'Enter a valid email address';
    if (newEnquiry.phone_no && !phoneRegex.test(newEnquiry.phone_no))
      newErrors.phone_no = 'Phone must be a valid 10-digit number';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const resetForm = () => {
    setNewEnquiry({
      company_name: '',
      contact_person: '',
      mail_id: '',
      phone_no: '',
      items_required: '',
      status: 'Pending',
      last_discussion: '',
      next_interaction: '',
    });
    setErrors({});
  };

  const handleCreate = useCallback(() => {
    setIsEditing(false);
    setSelectedEnquiry(null);
    resetForm();
    setIsModalOpen(true);
  }, []);

  const handleEdit = useCallback((enquiry) => {
    setIsEditing(true);
    setSelectedEnquiry(enquiry);
    setNewEnquiry({
      company_name: enquiry.company_name || '',
      contact_person: enquiry.contact_person || '',
      mail_id: enquiry.mail_id || '',
      phone_no: enquiry.phone_no || '',
      items_required: enquiry.items_required || '',
      status: enquiry.status || 'Pending',
      last_discussion: enquiry.last_discussion
        ? new Date(enquiry.last_discussion).toISOString().split('T')[0]
        : '',
      next_interaction: enquiry.next_interaction
        ? new Date(enquiry.next_interaction).toISOString().split('T')[0]
        : '',
    });
    setErrors({});
    setIsModalOpen(true);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) {
      toast.error('Please fix the form errors', { className: 'bg-amber-100 border-amber-300' });
      return;
    }
    try {
      const token = localStorage.getItem('token');
      const url = isEditing
        ? `${API_URL}/${selectedEnquiry.enquiry_id}`
        : API_URL;
      const method = isEditing ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          company_name: newEnquiry.company_name,
          contact_person: newEnquiry.contact_person || null,
          mail_id: newEnquiry.mail_id || null,
          phone_no: newEnquiry.phone_no || null,
          items_required: newEnquiry.items_required || null,
          status: newEnquiry.status,
          last_discussion: newEnquiry.last_discussion || null,
          next_interaction: newEnquiry.next_interaction || null,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `${isEditing ? 'Update' : 'Create'} failed with status: ${response.status}`);
      }

      const updatedEnquiry = await response.json();
      if (isEditing) {
        setEnquiries((prev) =>
          prev.map((e) => (e.enquiry_id === updatedEnquiry.enquiry_id ? updatedEnquiry : e))
        );
        toast.success(`Enquiry #${updatedEnquiry.enquiry_id} updated successfully!`, {
          className: 'bg-amber-100 border-amber-300',
        });
      } else {
        setEnquiries((prev) => [updatedEnquiry, ...prev]);
        toast.success(`Enquiry #${updatedEnquiry.enquiry_id} created successfully!`, {
          className: 'bg-amber-100 border-amber-300',
        });
      }
      setIsModalOpen(false);
      resetForm();
      fetchEnquiries();
    } catch (err) {
      console.error(`${isEditing ? 'Update' : 'Create'} error:`, err);
      toast.error(err.message || `${isEditing ? 'Update' : 'Create'} failed`, {
        className: 'bg-amber-100 border-amber-300',
      });
    }
  };

  const filteredEnquiries = useMemo(() => {
    if (!Array.isArray(enquiries)) return [];

    return enquiries.filter((item) =>
      [
        'enquiry_id',
        'company_name',
        'contact_person',
        'mail_id',
        'phone_no',
        'items_required',
        'status',
      ].some((key) =>
        String(item[key] || '').toLowerCase().includes(searchTerm.toLowerCase())
      )
    );
  }, [enquiries, searchTerm]);

  const sortedEnquiries = useMemo(() => {
    const sortableEnquiries = [...filteredEnquiries];
    if (sortConfig.key) {
      sortableEnquiries.sort((a, b) => {
        let aValue = a[sortConfig.key] ?? '';
        let bValue = b[sortConfig.key] ?? '';
        aValue = String(aValue).toLowerCase();
        bValue = String(bValue).toLowerCase();
        return sortConfig.direction === 'ascending'
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      });
    }
    return sortableEnquiries;
  }, [filteredEnquiries, sortConfig]);

  if (isLoading && !enquiries.length) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8 flex items-center justify-center">
        <div className="flex items-center gap-3 text-gray-600 text-xl">
          <svg className="animate-spin h-6 w-6 text-amber-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading Enquiries...
        </div>
      </div>
    );
  }

  if (error && !enquiries.length) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 propietario-gray-100 p-8 flex items-center justify-center">
        <div className="text-red-600 text-xl font-medium bg-red-100 px-6 py-3 rounded-lg shadow">{error}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-6 md:p-10">
      <h1 className="text-4xl md:text-5xl font-extrabold text-gray-800 mb-12 text-center tracking-tight drop-shadow-md animate-fade-in">
        Enquiries
      </h1>

      <div className="max-w-[95vw] mx-auto">
        <div className="flex items-center gap-4 flex-col sm:flex-row mb-10">
          <div className="relative flex-grow w-full sm:w-auto group">
            <input
              type="text"
              placeholder="Search enquiries..."
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full p-4 pl-12 border border-gray-200 rounded-xl bg-white shadow-md focus:outline-none focus:ring-2 focus:ring-amber-300 text-lg transition-all duration-300 group-hover:shadow-lg group-hover:border-amber-300"
            />
            <svg className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 group-hover:text-amber-500 transition-colors duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

          <button
            onClick={fetchEnquiries}
            className="group relative px-6 py-3 bg-amber-400 text-gray-900 rounded-xl font-semibold shadow-md hover:shadow-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden"
            disabled={isLoading}
          >
            <span className="relative z-10 flex items-center gap-2">
              {isLoading ? (
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

          <button
            onClick={handleCreate}
            className="group relative px-6 py-3 bg-green-500 text-white rounded-xl font-semibold shadow-md hover:shadow-xl transition-all duration-300 overflow-hidden"
          >
            <span className="relative z-10 flex items-center gap-2">
              <svg className="w-5 h-5 group-hover:animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
              Add Enquiry
            </span>
            <span className="absolute inset-0 bg-green-600 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-right"></span>
          </button>
        </div>

        <div className="bg-gradient-to-br from-white to-amber-50 rounded-3xl shadow-2xl overflow-x-auto border border-amber-100 animate-table-pop">
          <table className="w-full text-left border-collapse" ref={tableRef} tabIndex={0}>
            <thead>
              <tr className="bg-gradient-to-r from-amber-300 via-amber-200 to-amber-100 text-gray-800">
                {[
                  { label: 'Enquiry ID', key: 'enquiry_id' },
                  { label: 'Company Name', key: 'company_name' },
                  { label: 'Contact Person', key: 'contact_person' },
                  { label: 'Email', key: 'mail_id' },
                  { label: 'Phone', key: 'phone_no' },
                  { label: 'Items Required', key: 'items_required' },
                  { label: 'Status', key: 'status' },
                  { label: 'Last Discussion', key: 'last_discussion' },
                  { label: 'Next Interaction', key: 'next_interaction' },
                  { label: 'Actions', key: 'actions' },
                ].map(({ label, key }) => (
                  <th
                    key={key}
                    onClick={() => key !== 'actions' && handleSort(key)}
                    className={`px-6 md:px-8 py-4 text-lg font-bold ${key !== 'actions' ? 'cursor-pointer hover:bg-amber-400' : ''} transition-all duration-300 whitespace-nowrap border-b border-amber-200 shadow-sm`}
                  >
                    <div className="flex justify-between items-center">
                      {label}
                      {key !== 'actions' && (
                        <ArrowDownUp
                          size={18}
                          className={`ml-2 text-gray-700 ${sortConfig.key === key ? 'text-amber-600 animate-pulse' : 'opacity-60'} hover:text-amber-800 transition-colors duration-200`}
                        />
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-amber-100">
              {sortedEnquiries.map((enquiry, index) => (
                <tr
                  key={enquiry.enquiry_id}
                  className="bg-white hover:bg-amber-50 transition-all duration-300 hover:shadow-md transform hover:-translate-y-1"
                  style={{ animation: `tableRowFade 0.4s ease-in ${index * 0.05}s both` }}
                >
                  <td className="px-6 md:px-8 py-4 text-gray-700 font-semibold">{enquiry.enquiry_id}</td>
                  <td className="px-6 md:px-8 py-4 text-gray-600">{enquiry.company_name}</td>
                  <td className="px-6 md:px-8 py-4 text-gray-600">{enquiry.contact_person || 'N/A'}</td>
                  <td className="px-6 md:px-8 py-4 text-gray-600">{enquiry.mail_id || 'N/A'}</td>
                  <td className="px-6 md:px-8 py-4 text-gray-600">{enquiry.phone_no || 'N/A'}</td>
                  <td className="px-6 md:px-8 py-4 text-gray-600 truncate max-w-xs">{enquiry.items_required || 'N/A'}</td>
                  <td className={`px-6 md:px-8 py-4 text-gray-600 font-semibold ${
                    enquiry.status === 'Closed' ? 'text-green-600' :
                    enquiry.status === 'In Progress' ? 'text-yellow-600' :
                    enquiry.status === 'Pending' ? 'text-gray-600' :
                    'text-red-600'
                  }`}>
                    {enquiry.status}
                  </td>
                  <td className="px-6 md:px-8 py-4 text-gray-600">
                    {enquiry.last_discussion ? formatDate(enquiry.last_discussion) : 'N/A'}
                  </td>
                  <td className="px-6 md:px-8 py-4 text-gray-600">
                    {enquiry.next_interaction ? formatDate(enquiry.next_interaction) : 'N/A'}
                  </td>
                  <td className="px-6 md:px-8 py-4 text-gray-600">
                    <button
                      onClick={() => handleEdit(enquiry)}
                      className="px-4 py-2 bg-amber-400 text-gray-900 rounded-full font-semibold hover:bg-amber-500 transition-all duration-300"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {sortedEnquiries.length === 0 && (
            <div className="text-center py-12 text-gray-500 text-lg font-medium animate-pulse bg-amber-50 rounded-b-3xl">
              No enquiries found matching your search.
            </div>
          )}
        </div>

        <div className="flex justify-between mt-6 items-center">
          <button
            onClick={() => setPage((prev) => Math.max(prev - 1, 0))}
            disabled={page === 0 || isLoading}
            className="px-5 py-2 bg-amber-400 text-gray-900 rounded-full font-semibold shadow-md hover:bg-amber-500 hover:shadow-lg disabled:opacity-50 transition-all duration-300"
          >
            Previous
          </button>
          <span className="text-gray-700 font-medium text-lg">
            Page <span className="text-amber-600">{page + 1}</span> of {Math.ceil(total / limit)}
          </span>
          <button
            onClick={() => setPage((prev) => prev + 1)}
            disabled={(page + 1) * limit >= total || isLoading}
            className="px-5 py-2 bg-amber-400 text-gray-900 rounded-full font-semibold shadow-md hover:bg-amber-500 hover:shadow-lg disabled:opacity-50 transition-all duration-300"
          >
            Next
          </button>
        </div>

        {isModalOpen && (
          <div className="fixed inset-0 z-50 bg-gray-800 bg-opacity-60 flex items-center justify-center transition-opacity duration-500">
            <div className="bg-gradient-to-br from-white to-amber-50 p-8 rounded-3xl shadow-2xl w-full max-w-md transform transition-all duration-300 animate-form-pop max-h-[90vh] overflow-y-auto relative">
              <button
                onClick={() => setIsModalOpen(false)}
                className="absolute top-4 right-4 p-2 bg-red-500 text-white rounded-full hover:bg-red-600 transition-all duration-300 shadow-md hover:shadow-lg transform hover:rotate-90"
              >
                <X size={20} />
              </button>
              <h2 className="text-3xl font-extrabold text-gray-800 mb-6 text-center bg-gradient-to-r from-amber-400 to-green-500 bg-clip-text text-transparent">
                {isEditing ? `Edit Enquiry #${selectedEnquiry?.enquiry_id}` : 'Add New Enquiry'}
              </h2>
              <form onSubmit={handleSubmit}>
                {[
                  {
                    label: 'Company Name',
                    key: 'company_name',
                    required: true,
                    icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
                  },
                  {
                    label: 'Contact Person',
                    key: 'contact_person',
                    icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
                  },
                  {
                    label: 'Email',
                    key: 'mail_id',
                    type: 'email',
                    icon: 'M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4',
                  },
                  {
                    label: 'Phone',
                    key: 'phone_no',
                    icon: 'M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z',
                  },
                  {
                    label: 'Items Required',
                    key: 'items_required',
                    type: 'textarea',
                    icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
                  },
                  {
                    label: 'Status',
                    key: 'status',
                    type: 'select',
                    icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
                    options: ['Pending', 'In Progress', 'Closed', 'Cancelled'],
                  },
                  {
                    label: 'Last Discussion',
                    key: 'last_discussion',
                    type: 'date',
                    icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
                  },
                  {
                    label: 'Next Interaction',
                    key: 'next_interaction',
                    type: 'date',
                    icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
                  },
                ].map(({ label, key, type = 'text', required, icon, options }) => (
                  <div key={key} className="mb-5 relative group">
                    <label className="block text-gray-700 font-semibold mb-2 text-lg tracking-wide">{label}</label>
                    <div className="relative">
                      <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-amber-400 group-hover:text-amber-500 transition-colors duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={icon} />
                      </svg>
                      {type === 'textarea' ? (
                        <textarea
                          value={newEnquiry[key]}
                          onChange={(e) => setNewEnquiry({ ...newEnquiry, [key]: e.target.value })}
                          className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl bg-white text-gray-800 focus:outline-none focus:ring-4 focus:ring-amber-200 focus:border-amber-400 shadow-md hover:shadow-lg transition-all duration-300 placeholder-gray-400"
                          placeholder={`Enter ${label.toLowerCase()}`}
                          rows={4}
                        />
                      ) : type === 'select' ? (
                        <select
                          value={newEnquiry[key]}
                          onChange={(e) => setNewEnquiry({ ...newEnquiry, [key]: e.target.value })}
                          className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl bg-white text-gray-800 focus:outline-none focus:ring-4 focus:ring-amber-200 focus:border-amber-400 shadow-md hover:shadow-lg transition-all duration-300"
                        >
                          {options.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type={type}
                          value={newEnquiry[key]}
                          onChange={(e) => setNewEnquiry({ ...newEnquiry, [key]: e.target.value })}
                          className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl bg-white text-gray-800 focus:outline-none focus:ring-4 focus:ring-amber-200 focus:border-amber-400 shadow-md hover:shadow-lg transition-all duration-300 placeholder-gray-400"
                          required={required}
                          placeholder={`Enter ${label.toLowerCase()}`}
                        />
                      )}
                    </div>
                    {errors[key] && <p className="text-sm text-red-500 mt-1 animate-fade-in font-medium">{errors[key]}</p>}
                  </div>
                ))}
                <div className="flex justify-end gap-4">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="relative px-6 py-3 bg-gradient-to-r from-gray-300 to-gray-400 text-gray-800 rounded-xl font-semibold shadow-md hover:shadow-xl transition-all duration-300 overflow-hidden group hover:from-gray-400 hover:to-gray-500 transform hover:scale-105"
                  >
                    <span className="relative z-10">Cancel</span>
                  </button>
                  <button
                    type="submit"
                    className="relative px-6 py-3 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-xl font-semibold shadow-md hover:shadow-xl transition-all duration-300 overflow-hidden group hover:from-green-600 hover:to-green-700 transform hover:scale-105"
                  >
                    <span className="relative z-10 flex items-center gap-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                      </svg>
                      {isEditing ? 'Update Enquiry' : 'Add Enquiry'}
                    </span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
      <ToastContainer position="top-right" autoClose={3000} />
    </div>
  );
}

export default EnquiryPage;