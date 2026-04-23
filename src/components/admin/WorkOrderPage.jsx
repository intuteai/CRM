import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { FileText } from "lucide-react";
import { useNotify } from '../../hooks/useNotify';

/* 🔹 Status → Card Style Mapper */
const getStatusStyles = (status) => {
  switch (status) {
    case "Delivered":
      return "border-4 border-green-700";
    case "Shipped":
      return "border-4 border-blue-500";
    case "Testing":
      return "border-4 border-purple-600";
    case "Processing":
      return "border-4 border-yellow-600";
    case "Pending":
      return "border-4 border-orange-500";
    case "Cancelled":
      return "border-4 border-red-600";
    default:
      return "border-4 border-gray-300";
  }
};

const getStatusTextColor = (status) => {
  switch (status) {
    case "Delivered":
      return "text-green-700";
    case "Shipped":
      return "text-blue-600";
    case "Testing":
      return "text-purple-700";
    case "Processing":
      return "text-yellow-700";
    case "Pending":
      return "text-orange-600";
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
  const { notifyError } = useNotify();

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
      notifyError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-6">
      <div className="w-full max-w-full px-6 space-y-10">
        <h3 className="text-3xl font-bold text-gray-700">
          Production Management
        </h3>
        {/* Status Legend */}
        <div className="bg-white rounded-lg p-4 border shadow-sm">
          <div className="flex flex-wrap gap-4 items-center text-lg">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 border-4 border-green-700 rounded-sm"></span>
              <span className="text-gray-700 text-md font-medium">
                Delivered
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="w-7 h-7 border-4 border-blue-500 rounded-sm"></span>
              <span className="text-gray-700 text-md font-medium">
                Shipped
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="w-7 h-7 border-4 border-purple-600 rounded-sm"></span>
              <span className="text-gray-700 text-md font-medium">
                Testing
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="w-7 h-7 border-4 border-yellow-600 rounded-sm"></span>
              <span className="text-gray-700 text-md font-medium">
                Processing
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="w-7 h-7 border-4 border-orange-500 rounded-sm"></span>
              <span className="text-gray-700 text-md font-medium">
                Pending
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="w-7 h-7 border-4 border-red-600 rounded-sm"></span>
              <span className="text-gray-700 text-md font-medium">
                Cancelled
              </span>
            </div>
          </div>
        </div>

        {loading && <p className="text-gray-600">Loading orders...</p>}
        {error && <p className="text-red-600">{error}</p>}

        {!loading && orders.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {orders.map((order) => (
              <Link
                key={order.orderId}
                to={`/select-component/${order.orderId}/${selectedAction}`}
                className={`w-full p-5 rounded-xl bg-white
  transition-all duration-200 hover:shadow-lg
  ${getStatusStyles(order.status)}`}
              >
                <div className="flex items-start">
                  <FileText className="w-6 h-6 text-gray-900 mr-3 mt-1" />

                  <div className="space-y-1">
                    <p className="font-medium text-md text-gray-900">
                      Order #{order.orderId}
                    </p>

                    <p className="text-md text-gray-800">
                      Customer: {order.customerName || "Unknown"}
                    </p>

                    <p
                      className={`text-md font-medium ${getStatusTextColor(
                        order.status,
                      )}`}
                    >
                      Status: {order.status}
                    </p>

                    <p className="text-md text-gray-800">
                      Delivery:{" "}
                      {order.targetDeliveryDate
                        ? new Date(order.targetDeliveryDate).toLocaleDateString(
                            "en-IN",
                          )
                        : "N/A"}
                    </p>

                    <p className="text-md text-gray-800">
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

</div>
  );
}

export default WorkOrderPage;