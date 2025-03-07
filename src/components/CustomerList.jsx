import React, { useState, useEffect } from 'react';

function CustomerList() {
  const [customers, setCustomers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'ascending' });

  useEffect(() => {
    fetch('/api/customers', {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
    })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        return res.json();
      })
      .then(data => {
        setCustomers(data || []);
        setIsLoading(false);
      })
      .catch(err => {
        console.error(err);
        setError('Failed to load customers');
        setCustomers([]);
        setIsLoading(false);
      });
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

  if (isLoading) {
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
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8">
      <h1 className="text-4xl font-bold text-gray-800 mb-10 text-center tracking-tight">Customers</h1>
      <div className="max-w-6xl mx-auto">
        <input
          type="text"
          placeholder="Search Customers..."
          value={searchTerm}
          onChange={handleSearch}
          className="w-full p-4 mb-8 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300 text-lg bg-white shadow-md transition-all duration-300"
        />
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