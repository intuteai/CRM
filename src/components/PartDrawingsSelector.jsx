import React from 'react';
import { FileText } from 'lucide-react';
import { Link } from 'react-router-dom';

const PartDrawingsSelector = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8">
      <h1 className="text-4xl font-bold text-gray-800 mb-12 text-center tracking-tight">Part Drawings</h1>
      <div className="max-w-5xl mx-auto grid grid-cols-1 sm:grid-cols-2 gap-8">
        <Link
          to="/part-drawings/raw"
          className="bg-white p-8 rounded-2xl shadow-md hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 bg-gradient-to-br from-amber-100 to-amber-50 border border-amber-200 text-center"
        >
          <FileText className="w-12 h-12 text-gray-700 mx-auto mb-4" />
          <h2 className="text-2xl font-semibold text-gray-800">Raw Material Drawings</h2>
          <p className="text-gray-600 mt-2">View and manage raw material drawings</p>
        </Link>
        <Link
          to="/part-drawings/finished"
          className="bg-white p-8 rounded-2xl shadow-md hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 bg-gradient-to-br from-amber-100 to-amber-50 border border-amber-200 text-center"
        >
          <FileText className="w-12 h-12 text-gray-700 mx-auto mb-4" />
          <h2 className="text-2xl font-semibold text-gray-800">Finished Goods Drawings</h2>
          <p className="text-gray-600 mt-2">View and manage finished goods drawings</p>
        </Link>
      </div>
    </div>
  );
};

export default PartDrawingsSelector;