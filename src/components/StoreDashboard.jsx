import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Package, Layers } from 'lucide-react';

function StoreDashboard({ socket }) {
  useEffect(() => {
    if (socket) {
      socket.on('inventoryUpdate', (data) => {
        console.log('Inventory update:', data);
      });
      socket.on('stockUpdate', (data) => {
        console.log('Stock update:', data);
      });
      socket.on('bomUpdate', (data) => {
        console.log('BOM update:', data);
      });
      return () => {
        socket.off('inventoryUpdate');
        socket.off('stockUpdate');
        socket.off('bomUpdate');
      };
    }
  }, [socket]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-6">
      <h1 className="text-3xl font-bold text-gray-800 mb-10 text-center tracking-tight">Stores Dashboard</h1>
      <div className="max-w-7xl mx-auto space-y-12">
        <Section title="Inventory Management">
          {/* {StoreInventoryPage- reference from InventoryPage} */}
          {/* {StoreStockPage- reference from StockPage} */}
          <DashboardCard to="/store-inventory" icon={<Package />} title="Inventory" desc="Manage and view stock items" /> 
          <DashboardCard to="/store-stock" icon={<Package />} title="Raw Materials" desc="Monitor raw material levels" />
        </Section>
        <Section title="Bill of Materials">
          <DashboardCard to="/store-bom-unpriced" icon={<Layers />} title="BOM (Unpriced)" desc="View unpriced Bill of Materials" />
        </Section>
      </div>
    </div>
  );
}

function DashboardCard({ to, icon, title, desc }) {
  return (
    <Link
      to={to}
      className="bg-white p-5 rounded-xl shadow-md hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 bg-gradient-to-br from-amber-100 to-amber-50 border border-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-300"
      aria-label={`Navigate to ${title}`}
    >
      <div className="flex items-center justify-center mb-3">
        {React.cloneElement(icon, { className: 'w-9 h-9 text-gray-700' })}
      </div>
      <h2 className="text-xl font-semibold text-gray-800 text-center">{title}</h2>
      <p className="text-gray-600 text-center mt-1 text-base">{desc}</p>
    </Link>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <h3 className="text-xl font-bold text-gray-700 mb-4">{title}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {children}
      </div>
    </div>
  );
}

export default StoreDashboard;