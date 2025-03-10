// src/components/CustomerList.jsx
import React, { useState, useEffect } from 'react';

function CustomerList() {
  const [customers, setCustomers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'ascending' });

  // Refetch function to load customers
  const fetchCustomers = () => {
    setIsLoading(true);
    fetch('/api/customers', {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
    })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        return res.json();
      })
      .then(data => {
        setCustomers(data || []);
        setError(null); // Clear any previous errors on successful fetch
        setIsLoading(false);
      })
      .catch(err => {
        console.error(err);
        setError('Failed to load customers');
        setCustomers([]);
        setIsLoading(false);
      });
  };

  useEffect(() => {
    fetchCustomers(); // Initial fetch on component mount
  }, []);

  const handleSearch = (e) => setSearchTerm(e.target.value);

  const handleSort = (key) => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  const filteredCustomers = customers.filter(customer => {
    return (
      customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.orders.toString().includes(searchTerm.toLowerCase()) ||
      customer.queries.toString().includes(searchTerm.toLowerCase())
    );
  });

  const sortedCustomers = React.useMemo(() => {
    const sortableCustomers = [...filteredCustomers];
    if (sortConfig.key) {
      sortableCustomers.sort((a, b) => {
        let aValue = a[sortConfig.key];
        let bValue = b[sortConfig.key];
        if (aValue == null) aValue = '';
        if (bValue == null) bValue = '';
        if (aValue < bValue) return sortConfig.direction === 'ascending' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'ascending' ? 1 : -1;
        return 0;
      });
    }
    return sortableCustomers;
  }, [filteredCustomers, sortConfig]);

  if (isLoading && !customers.length) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8 flex items-center justify-center">
        <div className="text-gray-600 text-xl animate-pulse">Loading customers...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8 flex items-center justify-center">
        <div className="bg-red-100 border border-red-400 text-red-700 px-6 py-4 rounded-lg shadow-md text-lg">
          {error}
          <button
            onClick={fetchCustomers}
            className="ml-4 px-4 py-1 bg-amber-500 text-white rounded hover:bg-amber-600 transition-all duration-300"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8">
      <h1 className="text-4xl font-bold text-gray-800 mb-10 text-center tracking-tight">Customers</h1>
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center mb-8 gap-4">
          <input
            type="text"
            placeholder="Search Customers..."
            value={searchTerm}
            onChange={handleSearch}
            className="flex-1 min-w-0 p-4 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300 text-lg bg-white shadow-md transition-all duration-300"
          />
          {/* Refresh Button - Parallel to Search */}
          <button
            onClick={fetchCustomers}
            className="p-4 bg-amber-400 text-gray-900 rounded-lg hover:bg-amber-500 transition-all duration-300 shadow-md text-lg w-32"
            title="Refresh customers"
            disabled={isLoading}
          >
            Refresh
          </button>
        </div>

        {/* Optional: Show refreshing message */}
        {isLoading && customers.length > 0 && (
          <div className="text-gray-600 text-lg mb-4 text-center">Refreshing data...</div>
        )}

        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gradient-to-r from-amber-100 to-amber-50">
              <tr>
                <th 
                  className="px-6 py-4 text-gray-700 text-lg font-semibold cursor-pointer hover:bg-amber-200 transition-all duration-200"
                  onClick={() => handleSort('name')}
                >
                  <div className="flex items-center">
                    Customer Name
                    {sortConfig.key === 'name' && (
                      <span className="ml-1">{sortConfig.direction === 'ascending' ? '▲' : '▼'}</span>
                    )}
                  </div>
                </th>
                <th 
                  className="px-6 py-4 text-gray-700 text-lg font-semibold cursor-pointer hover:bg-amber-200 transition-all duration-200"
                  onClick={() => handleSort('email')}
                >
                  <div className="flex items-center">
                    Email
                    {sortConfig.key === 'email' && (
                      <span className="ml-1">{sortConfig.direction === 'ascending' ? '▲' : '▼'}</span>
                    )}
                  </div>
                </th>
                <th 
                  className="px-6 py-4 text-gray-700 text-lg font-semibold cursor-pointer hover:bg-amber-200 transition-all duration-200"
                  onClick={() => handleSort('orders')}
                >
                  <div className="flex items-center">
                    Orders
                    {sortConfig.key === 'orders' && (
                      <span className="ml-1">{sortConfig.direction === 'ascending' ? '▲' : '▼'}</span>
                    )}
                  </div>
                </th>
                <th 
                  className="px-6 py-4 text-gray-700 text-lg font-semibold cursor-pointer hover:bg-amber-200 transition-all duration-200"
                  onClick={() => handleSort('queries')}
                >
                  <div className="flex items-center">
                    Queries
                    {sortConfig.key === 'queries' && (
                      <span className="ml-1">{sortConfig.direction === 'ascending' ? '▲' : '▼'}</span>
                    )}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {sortedCustomers.map((customer) => (
                <tr key={customer.id} className="hover:bg-amber-50 transition-all duration-200">
                  <td className="px-6 py-4 text-gray-600 text-lg">{customer.name}</td>
                  <td className="px-6 py-4 text-gray-600 text-lg">{customer.email}</td>
                  <td className="px-6 py-4 text-gray-600 text-lg">{customer.orders}</td>
                  <td className="px-6 py-4 text-gray-600 text-lg">{customer.queries}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {sortedCustomers.length === 0 && (
            <div className="text-center py-12 text-gray-500 text-xl">No customers found.</div>
          )}
        </div>
      </div>
    </div>
  );
}

export default CustomerList;