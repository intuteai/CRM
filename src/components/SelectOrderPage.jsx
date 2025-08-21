// import React from 'react';
// import { Link } from 'react-router-dom';
// import { PlusCircle, Edit } from 'lucide-react';

// function Card({ to, icon, title, desc }) {
//   return (
//     <Link
//       to={to}
//       className="bg-white p-5 rounded-xl shadow-md hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 bg-gradient-to-br from-amber-100 to-amber-50 border border-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-300"
//       aria-label={`Navigate to ${title}`}
//     >
//       <div className="flex items-center justify-center mb-3">
//         {React.cloneElement(icon, { className: 'w-9 h-9 text-gray-700' })}
//       </div>
//       <h2 className="text-xl font-semibold text-gray-800 text-center">{title}</h2>
//       <p className="text-gray-600 text-center mt-1 text-base">{desc}</p>
//     </Link>
//   );
// }

// export default function SelectOrderPage() {
//   return (
//     <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-6">
//       <div className="max-w-7xl mx-auto space-y-12">
//         <div>
//           <h3 className="text-xl font-bold text-gray-700 mb-4">Production Management</h3>
//           <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
//             <Card
//               to="/motor"
//               icon={<PlusCircle />}
//               title="Motor Process"
//               desc="Track the process of motor!"
//             />
//             <Card
//               to="/non-motor"
//               icon={<Edit />}
//               title="Non-Motor Process"
//               desc="Track the process!"
//             />
//           </div>
//         </div>
//       </div>
//     </div>
//   );
// }
import React from 'react';
import { Link } from 'react-router-dom';
import { PlusCircle, Edit } from 'lucide-react';

function Card({ to, icon, title, desc }) {
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

export default function SelectOrderPage() {
  // Placeholder orderId; replace with dynamic data (e.g., from API or props)
  const motorOrderId = 1; // This should be dynamically fetched or passed

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-6">
      <div className="max-w-7xl mx-auto space-y-12">
        <div>
          <h3 className="text-xl font-bold text-gray-700 mb-4">Production Management</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <Card
              to={`/processes/${motorOrderId}`}
              icon={<PlusCircle />}
              title="Motor Process"
              desc="Track the process of motor!"
            />
            <Card
              to="/non-motor"
              icon={<Edit />}
              title="Non-Motor Process"
              desc="Track the process!"
            />
          </div>
        </div>
      </div>
    </div>
  );
}