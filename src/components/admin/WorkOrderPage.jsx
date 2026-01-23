// import React, { useState, useEffect } from 'react';
// import { Link } from 'react-router-dom';
// import { FileText } from 'lucide-react';
// import { toast, ToastContainer } from 'react-toastify';
// import 'react-toastify/dist/ReactToastify.css';

// function WorkOrderPage() {
//   const [selectedAction] = useState('view'); // default to 'view'
//   const [orders, setOrders] = useState([]);
//   const [loading, setLoading] = useState(false);
//   const [error, setError] = useState(null);

//   const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';

//   const fetchOrders = async () => {
//     setLoading(true);
//     setError(null);
//     try {
//       const token = localStorage.getItem('token');
//       if (!token) throw new Error('Authentication token missing. Please log in again.');

//       const response = await fetch(`${backendUrl}/api/process/orders`, {
//         headers: {
//           Authorization: `Bearer ${token}`,
//           'Content-Type': 'application/json',
//         },
//         credentials: 'include',
//       });

//       if (!response.ok) {
//         const text = await response.text();
//         throw new Error(`HTTP error! status: ${response.status} - ${text.slice(0, 50)}...`);
//       }

//       const data = await response.json();
//       setOrders(data);
//     } catch (err) {
//       setError(`Failed to load orders: ${err.message}`);
//       toast.error(`Failed to load orders: ${err.message}`, { autoClose: 5000 });
//       console.error('Fetch error:', err);
//     } finally {
//       setLoading(false);
//     }
//   };

//   // Fetch immediately on page load
//   useEffect(() => {
//     fetchOrders();
//   }, []);

//   return (
//     <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-6">
//       <div className="max-w-7xl mx-auto space-y-12">
//         <div>
//           <h3 className="text-xl font-bold text-gray-700 mb-4">Production Management</h3>

//           {/* Directly show orders */}
//           <div className="mb-8">
//             <h4 className="text-lg font-semibold text-gray-700 mb-3">
//               Select an Order to View/Edit Work Orders
//             </h4>

//             {loading && <p className="text-gray-600">Loading orders...</p>}

//             {error && (
//               <div className="bg-red-100 border border-red-400 text-red-700 px-6 py-4 rounded-lg shadow-md text-lg">
//                 {error}
//                 <button
//                   onClick={fetchOrders}
//                   className="ml-4 px-4 py-2 bg-amber-500 text-white rounded hover:bg-amber-600 transition-all duration-300"
//                 >
//                   Retry
//                 </button>
//               </div>
//             )}

//             {!loading && !error && orders.length === 0 && (
//               <p className="text-gray-600">No orders found.</p>
//             )}

//             {!loading && !error && orders.length > 0 && (
//               <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
//                 {orders.map((order) => (
//                   <Link
//                     key={order.orderId}
//                     to={`/select-component/${order.orderId}/${selectedAction}`}
//                     className="p-4 rounded-lg border bg-white hover:bg-amber-100 border-gray-200 transition-colors duration-200"
//                     aria-label={`Select order ${order.orderId} for ${selectedAction}`}
//                   >
//                     <div className="flex items-center">
//                       <FileText className="w-6 h-6 text-gray-600 mr-3" />
//                       <div>
//                         <p className="font-medium text-gray-800">Order #{order.orderId}</p>
//                          <p className="text-sm text-gray-800">Customer: {order.customerName || 'Unknown'}</p>
//                         <p className="text-sm text-gray-600">Status: {order.status}</p>
//                         <p className="text-sm text-gray-600">
//                           Delivery: {order.targetDeliveryDate ? new Date(order.targetDeliveryDate).toLocaleDateString('en-IN') : 'N/A'}
//                         </p>
//                         <p className="text-sm text-gray-600">
//                           Created: {new Date(order.createdAt).toLocaleDateString('en-IN')}
//                         </p>
//                       </div>
//                     </div>
//                   </Link>
//                 ))}
//               </div>
//             )}
//           </div>
//         </div>
//       </div>

//       <ToastContainer position="top-right" autoClose={3000} hideProgressBar={false} closeOnClick pauseOnHover draggable />
//     </div>
//   );
// }

// export default WorkOrderPage;
// import React, { useState, useEffect } from "react";
// import { Link } from "react-router-dom";
// import { FileText } from "lucide-react";
// import { toast, ToastContainer } from "react-toastify";
// import "react-toastify/dist/ReactToastify.css";

// /* 🔹 Status → Card Style Mapper */
// const getStatusStyles = (status) => {
//   switch (status) {
//     case "Delivered":
//       return "border-green-700 border-l-4 text-green-800";

//     case "Processing":
//       return "border-yellow-600 border-l-4 text-yellow-800";

//     case "Pending":
//       return "border-blue-700 border-l-4 text-blue-800";

//     case "Cancelled":
//       return "border-red-700 border-l-4 text-red-800";

//     default:
//       return "border-gray-300 text-gray-800";
//   }
// };

// const getStatusTextColor = (status) => {
//   switch (status) {
//     case "Delivered":
//       return "text-green-700";
//     case "Processing":
//       return "text-yellow-700";
//     case "Pending":
//       return "text-blue-700";
//     case "Cancelled":
//       return "text-red-700";
//     default:
//       return "text-gray-700";
//   }
// };

// function WorkOrderPage() {
//   const [selectedAction] = useState("view");
//   const [orders, setOrders] = useState([]);
//   const [loading, setLoading] = useState(false);
//   const [error, setError] = useState(null);

//   const backendUrl =
//     import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

//   const fetchOrders = async () => {
//     setLoading(true);
//     setError(null);
//     try {
//       const token = localStorage.getItem("token");
//       if (!token)
//         throw new Error("Authentication token missing. Please log in again.");

//       const response = await fetch(`${backendUrl}/api/process/orders`, {
//         headers: {
//           Authorization: `Bearer ${token}`,
//           "Content-Type": "application/json",
//         },
//         credentials: "include",
//       });

//       if (!response.ok) {
//         const text = await response.text();
//         throw new Error(
//           `HTTP error! status: ${response.status} - ${text.slice(0, 50)}...`,
//         );
//       }

//       const data = await response.json();
//       setOrders(data);
//     } catch (err) {
//       setError(`Failed to load orders: ${err.message}`);
//       toast.error(`Failed to load orders: ${err.message}`, {
//         autoClose: 5000,
//       });
//       console.error("Fetch error:", err);
//     } finally {
//       setLoading(false);
//     }
//   };

//   useEffect(() => {
//     fetchOrders();
//   }, []);

//   return (
//     <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-6">
//       <div className="max-w-7xl mx-auto space-y-12">
//         <div>
//           <h3 className="text-xl font-bold text-gray-700 mb-4">
//             Production Management
//           </h3>

//           <div className="mb-8">
//             <h4 className="text-lg font-semibold text-gray-700 mb-3">
//               Select an Order to View/Edit Work Orders
//             </h4>

//             {loading && <p className="text-gray-600">Loading orders...</p>}

//             {error && (
//               <div className="bg-red-100 border border-red-400 text-red-700 px-6 py-4 rounded-lg shadow-md text-lg">
//                 {error}
//                 <button
//                   onClick={fetchOrders}
//                   className="ml-4 px-4 py-2 bg-amber-500 text-white rounded hover:bg-amber-600 transition-all duration-300"
//                 >
//                   Retry
//                 </button>
//               </div>
//             )}

//             {!loading && !error && orders.length === 0 && (
//               <p className="text-gray-600">No orders found.</p>
//             )}

//             {!loading && !error && orders.length > 0 && (
//               <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
//                 {orders.map((order) => (
//                   <Link
//                     to={`/orders/${order.orderId}`}
//                     key={order.orderId}
//                     className={`p-4 rounded-lg border bg-white hover:shadow-md transition-all duration-200
//     ${getStatusStyles(order.status)}
//   `}
//                   >
//                     <div className="flex justify-between items-start">
//                       <div>
//                         <h3 className="font-semibold text-lg text-gray-900">
//                           Order #{order.orderId}
//                         </h3>

//                         <p className="text-sm text-gray-600">
//                           Product: {order.productName}
//                         </p>

//                         <p className="text-sm font-medium">
//                           Status: <span>{order.status}</span>
//                         </p>
//                       </div>

//                       <p className="text-sm text-gray-500">₹{order.amount}</p>
//                     </div>
//                   </Link>
//                 ))}
//               </div>
//             )}
//           </div>
//         </div>
//       </div>

//       <ToastContainer
//         position="top-right"
//         autoClose={3000}
//         hideProgressBar={false}
//         closeOnClick
//         pauseOnHover
//         draggable
//       />
//     </div>
//   );
// }

// export default WorkOrderPage;
import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { FileText } from "lucide-react";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

/* 🔹 Status → Card Style Mapper */
const getStatusStyles = (status) => {
  switch (status) {
    case "Delivered":
      return "border-l-4 border-green-700";
    case "Processing":
      return "border-l-4 border-yellow-700";
    case "Pending":
      return "border-l-4 border-blue-700";
    case "Cancelled":
      return "border-l-4 border-red-700";
    default:
      return "border-gray-300";
  }
};

const getStatusTextColor = (status) => {
  switch (status) {
    case "Delivered":
      return "text-green-700";
    case "Processing":
      return "text-yellow-700";
    case "Pending":
      return "text-blue-700";
    case "Cancelled":
      return "text-red-700";
    default:
      return "text-gray-700";
  }
};

function WorkOrderPage() {
  const [selectedAction] = useState("view");
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const backendUrl =
    import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

  const fetchOrders = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem("token");
      if (!token) throw new Error("Authentication token missing");

      const response = await fetch(`${backendUrl}/api/process/orders`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        credentials: "include",
      });

      if (!response.ok) throw new Error("Failed to fetch orders");

      const data = await response.json();
      setOrders(data);
    } catch (err) {
      setError(err.message);
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-6">
      <div className="max-w-7xl mx-auto space-y-10">
        <h3 className="text-xl font-bold text-gray-700">
          Production Management
        </h3>

        {loading && <p className="text-gray-600">Loading orders...</p>}
        {error && <p className="text-red-600">{error}</p>}

        {!loading && orders.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {orders.map((order) => (
              <Link
                key={order.orderId}
                to={`/select-component/${order.orderId}/${selectedAction}`}
                className={`p-4 rounded-lg border bg-white transition-all duration-200 hover:shadow-md
  text-base sm:text-lg
  ${getStatusStyles(order.status)}
`}
              >
                <div className="flex items-start">
                  <FileText className="w-6 h-6 text-gray-700 mr-3 mt-1" />

                  <div className="space-y-1">
                    <p className="font-medium text-gray-900">
                      Order #{order.orderId}
                    </p>

                    <p className="text-sm text-gray-800">
                      Customer: {order.customerName || "Unknown"}
                    </p>

                    <p
                      className={`text-sm font-medium ${getStatusTextColor(
                        order.status,
                      )}`}
                    >
                      Status: {order.status}
                    </p>

                    <p className="text-sm text-gray-600">
                      Delivery:{" "}
                      {order.targetDeliveryDate
                        ? new Date(order.targetDeliveryDate).toLocaleDateString(
                            "en-IN",
                          )
                        : "N/A"}
                    </p>

                    <p className="text-sm text-gray-600">
                      Created:{" "}
                      {new Date(order.createdAt).toLocaleDateString("en-IN")}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <ToastContainer position="top-right" autoClose={3000} />
    </div>
  );
}

export default WorkOrderPage;
