import React from 'react';
import { FileText } from 'lucide-react';
import { Link } from 'react-router-dom';

const PartDrawingsSelector = () => {
  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <Link
          to="/part-drawings/raw"
          className="bg-white p-8 rounded-xl border border-navy-100 hover:border-gold-400 hover:shadow-md transition-all text-center"
        >
          <FileText className="w-12 h-12 text-navy-800 mx-auto mb-4" />
          <h2 className="font-display text-xl font-semibold text-navy-800">Raw Material Drawings</h2>
          <p className="text-gray-500 mt-2">View and manage raw material drawings</p>
        </Link>
        <Link
          to="/part-drawings/finished"
          className="bg-white p-8 rounded-xl border border-navy-100 hover:border-gold-400 hover:shadow-md transition-all text-center"
        >
          <FileText className="w-12 h-12 text-navy-800 mx-auto mb-4" />
          <h2 className="font-display text-xl font-semibold text-navy-800">Finished Goods Drawings</h2>
          <p className="text-gray-500 mt-2">View and manage finished goods drawings</p>
        </Link>
      </div>
    </div>
  );
};

export default PartDrawingsSelector;
