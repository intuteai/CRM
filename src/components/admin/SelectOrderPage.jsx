import React from "react";
import { Link, useParams } from "react-router-dom";
import { PlusCircle, Edit, Zap, Cog } from "lucide-react";

function SplitSection({ to, icon, title, desc, side, bgPattern, accentColor }) {
  return (
    <Link
      to={to}
      className={`group relative flex-1 h-full overflow-hidden transition-all duration-500 hover:flex-[1.1] ${bgPattern} focus:outline-none focus:ring-4 focus:ring-amber-400 focus:z-10`}
      aria-label={`Navigate to ${title}`}
    >
      {/* Background Pattern */}
      <div className={`absolute inset-0 opacity-5 ${side === 'left' ? 'bg-gradient-to-br from-orange-300 via-amber-200 to-yellow-300' : 'bg-gradient-to-br from-blue-300 via-indigo-200 to-purple-300'}`} />
      
      {/* Animated Background Orbs */}
      <div className="absolute inset-0">
        <div className={`absolute top-10 left-10 w-32 h-32 rounded-full ${accentColor} opacity-10 blur-xl group-hover:scale-150 transition-transform duration-700`} />
        <div className={`absolute bottom-20 right-20 w-24 h-24 rounded-full ${accentColor} opacity-15 blur-lg group-hover:scale-125 transition-transform duration-500 delay-100`} />
        <div className={`absolute top-1/2 left-1/4 w-16 h-16 rounded-full ${accentColor} opacity-20 blur-md group-hover:scale-110 transition-transform duration-400 delay-200`} />
      </div>
      
      {/* Glowing Border Effect */}
      <div className={`absolute inset-0 border-2 border-transparent group-hover:border-amber-300/50 group-hover:shadow-2xl group-hover:shadow-amber-200/25 transition-all duration-300`} />
      
      {/* Main Content */}
      <div className="relative z-10 flex flex-col items-center justify-center h-full p-12 text-center">
        {/* Icon Container with Animation */}
        <div className={`relative mb-8 p-6 rounded-full ${side === 'left' ? 'bg-gradient-to-br from-orange-100 to-amber-100' : 'bg-gradient-to-br from-blue-100 to-indigo-100'} shadow-lg group-hover:scale-110 group-hover:rotate-3 transition-all duration-300`}>
          <div className="absolute inset-0 rounded-full bg-white/40 animate-pulse" />
          {React.cloneElement(icon, { 
            className: `relative z-10 w-12 h-12 ${side === 'left' ? 'text-orange-600' : 'text-indigo-600'} group-hover:scale-110 transition-transform duration-300` 
          })}
          
          {/* Floating particles */}
          <div className="absolute -top-2 -right-2">
            <Zap className="w-4 h-4 text-amber-400 animate-bounce delay-100" />
          </div>
          <div className="absolute -bottom-1 -left-1">
            <Cog className="w-3 h-3 text-gray-400 animate-spin slow-spin" />
          </div>
        </div>
        
        {/* Title with Gradient */}
        <h2 className={`text-4xl font-bold mb-4 bg-gradient-to-r ${side === 'left' ? 'from-orange-600 via-amber-600 to-yellow-600' : 'from-indigo-600 via-blue-600 to-purple-600'} bg-clip-text text-transparent group-hover:scale-105 transition-transform duration-300`}>
          {title}
        </h2>
        
        {/* Description with Enhanced Styling */}
        <p className="text-gray-700 text-lg leading-relaxed max-w-sm font-medium group-hover:text-gray-800 transition-colors duration-300">
          {desc}
        </p>
        
        {/* Subtle Call to Action */}
        <div className="mt-8 opacity-0 group-hover:opacity-100 transition-all duration-500 delay-100">
          <div className={`px-6 py-2 rounded-full text-sm font-semibold ${side === 'left' ? 'bg-orange-200 text-orange-800' : 'bg-indigo-200 text-indigo-800'} shadow-md`}>
            Click to Continue →
          </div>
        </div>
      </div>
      
      {/* Subtle Grid Pattern Overlay */}
      <div className="absolute inset-0 opacity-5">
        <div className="w-full h-full" style={{
          backgroundImage: `radial-gradient(circle at 2px 2px, ${side === 'left' ? '#f59e0b' : '#6366f1'} 1px, transparent 0)`,
          backgroundSize: '40px 40px'
        }} />
      </div>
    </Link>
  );
}

export default function SelectOrderPage() {
  const { orderId } = useParams();
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 relative overflow-hidden">
      {/* Animated Background Elements */}
      <div className="absolute inset-0">
        <div className="absolute top-20 left-1/4 w-96 h-96 bg-gradient-to-r from-amber-200/20 to-orange-200/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-20 right-1/4 w-80 h-80 bg-gradient-to-r from-yellow-200/20 to-amber-200/20 rounded-full blur-3xl animate-pulse delay-1000" />
      </div>
      
      {/* Centered Header with Enhanced Styling */}
      <div className="relative z-10 pt-8 pb-6">
        <div className="text-center">
          <h3 className="text-3xl font-bold bg-gradient-to-r from-amber-700 via-orange-600 to-yellow-600 bg-clip-text text-transparent mb-2">
            Production Management
          </h3>
          <div className="w-24 h-1 bg-gradient-to-r from-amber-400 to-orange-400 mx-auto rounded-full shadow-md" />
        </div>
      </div>
      
      {/* Split Screen Content */}
      <div className="relative z-10 flex h-[calc(100vh-140px)]">
        <SplitSection
          to={`/processes/${orderId}`}
          icon={<PlusCircle />}
          title="Motor Process"
          desc="Track and monitor your motor production process with real-time insights"
          side="left"
          bgPattern="bg-gradient-to-br from-amber-100/80 via-orange-100/80 to-yellow-100/80"
          accentColor="bg-orange-400"
        />
        
        <SplitSection
          to={`/processes/non-motor/${orderId}`}
          icon={<Edit />}
          title="Auxiliary Process"
          desc="Manage auxiliary components and supporting systems efficiently"
          side="right"
          bgPattern="bg-gradient-to-br from-blue-100/80 via-indigo-100/80 to-purple-100/80"
          accentColor="bg-indigo-400"
        />
      </div>
      
      <style jsx>{`
        .slow-spin {
          animation: spin 3s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}