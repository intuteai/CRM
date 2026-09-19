import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { FileText } from "lucide-react";
import { useNotify } from '../../hooks/useNotify';
import ConnectionError from '../pages/ConnectionError.jsx';

/* 🔹 Status → Badge Style Mapper */
const STATUS_BADGE_STYLES = {
  Delivered:              "bg-green-100 text-green-700",
  "Partially Delivered":  "bg-indigo-100 text-indigo-700",
  Shipped:                "bg-blue-100 text-blue-700",
  "Ready for Shipment":   "bg-teal-100 text-teal-700",
  Testing:                "bg-purple-100 text-purple-700",
  Processing:             "bg-gold-400/25 text-gold-600",
  Pending:                "bg-orange-100 text-orange-700",
  Cancelled:              "bg-red-100 text-red-700",
};

const STATUS_DOT_STYLES = {
  Delivered:              "bg-green-600",
  "Partially Delivered":  "bg-indigo-500",
  Shipped:                "bg-blue-500",
  "Ready for Shipment":   "bg-teal-600",
  Testing:                "bg-purple-600",
  Processing:             "bg-gold-500",
  Pending:                "bg-orange-500",
  Cancelled:              "bg-red-600",
};

const getStatusBadge = (status) => STATUS_BADGE_STYLES[status] || "bg-gray-100 text-gray-500";
const getStatusDot = (status) => STATUS_DOT_STYLES[status] || "bg-gray-300";

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

  if (error) return <ConnectionError onRetry={fetchOrders} />;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Status Legend */}
      <div className="bg-white rounded-xl p-4 border border-navy-100 shadow-sm">
        <div className="flex flex-wrap gap-4 items-center text-sm">
          {Object.keys(STATUS_DOT_STYLES).map((status) => (
            <div key={status} className="flex items-center gap-2">
              <span className={`w-3 h-3 rounded-full ${getStatusDot(status)}`}></span>
              <span className="text-gray-600 font-medium">{status}</span>
            </div>
          ))}
        </div>
      </div>

      {loading && <p className="text-gray-500 animate-pulse">Loading orders...</p>}

      {!loading && orders.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {orders.map((order) => (
            <Link
              key={order.orderId}
              to={`/select-component/${order.orderId}/${selectedAction}`}
              className="w-full p-5 rounded-xl bg-white border border-navy-100 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-start">
                <FileText className="w-5 h-5 text-navy-400 mr-3 mt-1 shrink-0" />

                <div className="space-y-1.5 min-w-0">
                  <p className="font-semibold text-navy-800">
                    Order #{order.orderId}
                  </p>

                  <p className="text-sm text-gray-600">
                    Customer: {order.customerName || "Unknown"}
                  </p>

                  <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${getStatusBadge(order.status)}`}>
                    {order.status}
                  </span>
                  {order.statusReason && (
                    <p className="text-xs text-gray-400 italic">
                      {order.statusReason}
                    </p>
                  )}

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
  );
}

export default WorkOrderPage;
