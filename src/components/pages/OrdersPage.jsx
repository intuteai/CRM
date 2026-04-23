import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import {
  ArrowDownUp,
  Filter,
  PlusCircle,
  Search,
  ChevronLeft,
  ChevronRight,
  Edit2,
  CheckCircle,
  MoreVertical,
  Truck,
  ShoppingCart,
  DollarSign,
  XCircle,
  Trash2,
} from "lucide-react";
import { debounce } from "lodash";
import { io } from "socket.io-client";
import CreateOrderForm from "../forms/CreateOrderForm";
import EditOrderForm from "../forms/EditOrderForm";
import { useDispatch } from "react-redux";
import { addNotification } from "../../features/notifications/notificationSlice.js";
import { useNotify } from '../../hooks/useNotify';

const formatDate = (dateString) =>
  dateString ? new Date(dateString).toISOString().split("T")[0] : "";

const formatCurrency = (amount) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(amount);

const calculateTotalAmount = (items) =>
  items.reduce(
    (sum, item) =>
      sum + (parseFloat(item.price) || 0) * (parseInt(item.quantity) || 0),
    0,
  );

const validateOrderItems = (
  items,
  products,
  getAvailableStock,
  editingOrderId = null,
) => {
  const errors = [];
  const productIds = new Set(); // prevents duplicate products in the order

  const isValid = items.every((item) => {
    // checks for missing or duplicate ID
    if (!item.product_id || productIds.has(item.product_id)) {
      errors.push(`Duplicate or invalid product ID: ${item.product_id}`);
      return false;
    }

    productIds.add(item.product_id);

    // checks if product exists in database
    const product = products.find(
      (p) => String(p.product_id) === String(item.product_id),
    );
    const quantity = parseInt(item.quantity, 10) || 0;
    const price = parseFloat(item.price) || 0;

    if (!product || quantity <= 0 || price <= 0) {
      errors.push(
        product
          ? `Invalid quantity or price for ${product.product_name}`
          : `Product not found: ${item.product_id}`,
      );
      return false;
    }
    return true;
  });
  return { isValid, errors };
};

// Custom hook to fetch orders, products & customers
const useFetchData = ({ limit, offset }) => {
  const [orders, setOrders] = useState([]);
  const [totalOrders, setTotalOrders] = useState(0);
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isEmpty, setIsEmpty] = useState(false);

  const backendUrl =
    import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";

  const normalizeItems = (items = [], productsData = []) =>
    items
      .filter((item) => item && item.product_id !== undefined)
      .map((item) => ({
        ...item,
        product_id: String(item.product_id),
        quantity: String(item.quantity),
        price: String(item.price),
        productName:
          item.productName ||
          productsData.find(
            (p) => String(p.product_id) === String(item.product_id),
          )?.product_name ||
          "Unknown",
      }));

  const normalizeOrders = (ordersData = [], productsData = []) =>
    ordersData
      .filter((o) => o && o.id !== undefined)
      .map((order) => ({
        ...order,
        totalAmount: calculateTotalAmount(order.items),
        createdAt: order.createdAt || new Date().toISOString(),
        targetDeliveryDate: order.targetDeliveryDate || null,
        paymentStatus: order.paymentStatus || "Pending",
        status: order.status || "Pending",
        customerName: order.customerName || "N/A",
        items: normalizeItems(order.items, productsData),
      }));

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const token = localStorage.getItem("token");
      if (!token)
        throw new Error("Authentication token missing. Please log in again.");

      const ordersUrl = `${backendUrl}/api/orders?limit=${limit}&offset=${offset}&force_refresh=true`;

      const headers = {
        Authorization: `Bearer ${token}`,
      };

      const [ordersRes, productsRes, customersRes] = await Promise.all([
        fetch(ordersUrl, { headers, credentials: "include" }),
        fetch(`${backendUrl}/api/inventory/available`, {
          headers,
          credentials: "include",
        }),
        fetch(`${backendUrl}/api/users/customers`, {
          headers,
          credentials: "include",
        }),
      ]);

      const ordersData = ordersRes.ok
        ? await ordersRes.json()
        : { orders: [], total: 0 };

      const productsData = productsRes.ok
        ? (await productsRes.json()).data || []
        : [];

      const customersData = customersRes.ok ? await customersRes.json() : [];

      const validOrders = normalizeOrders(ordersData.orders, productsData);

      const validProducts = productsData.filter(
        (p) => p && p.product_id !== undefined,
      );

      const validCustomers = customersData.filter(
        (c) => c && c.user_id !== undefined,
      );

      setOrders(validOrders);
      setTotalOrders(ordersData.total || 0);
      setProducts(validProducts);
      setCustomers(validCustomers);

      setIsEmpty(
        validOrders.length === 0 &&
          validProducts.length === 0 &&
          validCustomers.length === 0,
      );
    } catch (err) {
      console.error("Fetch error:", err);
      setError(err.message || "Failed to fetch data");
      setIsEmpty(false);
    } finally {
      setIsLoading(false);
    }
  }, [limit, offset, backendUrl]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    orders,
    setOrders,
    totalOrders,
    products,
    setProducts,
    customers,
    isLoading,
    error,
    isEmpty,
    refetchData: fetchData,
  };
};

const ActionsDropdown = ({
  order,
  onEdit,
  onStatusChange,
  onCancel,
  isCancelling,
  setSelectedOrder,
  setShowPaymentDetails,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target))
        setIsOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const actionItems = [
    {
      icon: <Edit2 size={16} className="mr-2" />,
      label: "Edit",
      action: () => {
        onEdit(order);
        setIsOpen(false);
      },
      visible: order.status !== "Cancelled" && order.status !== "Delivered",
    },
    {
      icon: <ShoppingCart size={16} className="mr-2" />,
      label: "Move to Processing",
      action: () => {
        onStatusChange(order.id, "Processing");
        setIsOpen(false);
      },
      visible: order.status === "Pending",
    },
    {
      icon: <CheckCircle size={16} className="mr-2" />,
      label: "Move to Testing",
      action: () => {
        onStatusChange(order.id, "Testing");
        setIsOpen(false);
      },
      visible: order.status === "Processing",
    },
    {
      icon: <Truck size={16} className="mr-2" />,
      label: "Move to Shipped",
      action: () => {
        onStatusChange(order.id, "Shipped");
        setIsOpen(false);
      },
      visible: order.status === "Testing",
    },
    {
      icon: <CheckCircle size={16} className="mr-2" />,
      label: "Mark as Delivered",
      action: () => {
        onStatusChange(order.id, "Delivered");
        setIsOpen(false);
      },
      visible: order.status === "Shipped",
    },
    {
      icon: <DollarSign size={16} className="mr-2" />,
      label: "Payment Details",
      action: () => {
        setSelectedOrder(order);
        setShowPaymentDetails(true);
        setIsOpen(false);
      },
      visible: true,
    },
    {
      icon: <Trash2 size={16} className="mr-2 text-red-600" />,
      label: "Cancel Order",
      action: () => {
        onCancel(order.id);
        setIsOpen(false);
      },
      visible: order.status !== "Cancelled" && order.status !== "Delivered",
    },
  ];

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 hover:bg-gray-100 rounded-full"
        aria-label={`Actions for order ${order.id}`}
      >
        <MoreVertical size={20} />
      </button>
      {isOpen && (
        <div className="absolute right-0 z-10 mt-2 w-48 bg-white shadow-lg rounded-lg ring-1 ring-black ring-opacity-5">
          {actionItems
            .filter((item) => item.visible)
            .map((item, index) => (
              <button
                key={index}
                onClick={item.action}
                className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                disabled={item.label === "Cancel Order" && isCancelling}
              >
                {item.icon} {item.label}
              </button>
            ))}
        </div>
      )}
    </div>
  );
};

function OrdersPage() {
  const dispatch = useDispatch();

  const [page, setPage] = useState(0);
  const [ordersPerPage] = useState(10);
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("All");

  const [filterMonth, setFilterMonth] = useState("All");
  const [filterYear, setFilterYear] = useState("All");

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [showPaymentDetails, setShowPaymentDetails] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [sortConfig, setSortConfig] = useState({
    key: "createdAt",
    direction: "desc",
  });
  const [isCancelling, setIsCancelling] = useState(false);
  const tableRef = useRef(null);

  const {
    orders,
    setOrders,
    totalOrders,
    products,
    setProducts,
    customers,
    isLoading,
    error,
    isEmpty,
    refetchData,
  } = useFetchData({
    limit: 5000,
    offset: 0,
  });

  const productsRef = useRef(products);
  const { notifySuccess, notifyError, notifyInfo } = useNotify();
  useEffect(() => {
    productsRef.current = products;
  }, [products]);

  useEffect(() => {
    const backendUrl =
      import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";
    console.log("Socket.IO connecting to:", backendUrl);
    const socket = io(backendUrl, {
      withCredentials: true,
      transports: ["websocket"],
    });
    socket.on("connect", () => console.log("Connected to Socket.IO"));
    socket.on("connect_error", (err) => {
      console.error("Socket connection error:", err);
      notifyError("Failed to connect to real-time updates.", {
        autoClose: 3000,
      });
    });
    socket.on("orderUpdate", (updatedOrder) => {
      setOrders((prev) =>
        prev.map((o) =>
          o.id === updatedOrder.id
            ? {
                ...o,
                ...updatedOrder,
                totalAmount: calculateTotalAmount(updatedOrder.items),
                items: Array.isArray(updatedOrder.items)
                  ? updatedOrder.items
                      .filter(
                        (item) =>
                          item && typeof item.product_id !== "undefined",
                      )
                      .map((item) => ({
                        ...item,
                        product_id: String(item.product_id),
                        quantity: String(item.quantity),
                        price: String(item.price),
                        productName:
                          item.productName ||
                          productsRef.current.find(
                            (p) =>
                              String(p.product_id) === String(item.product_id),
                          )?.product_name ||
                          "Unknown",
                      }))
                  : [],
              }
            : o,
        ),
      );
      notifyInfo(`Order #${updatedOrder.id} updated`, { autoClose: 2000 });
      if (tableRef.current) tableRef.current.focus();
    });
    socket.on("stockUpdate", async ({ product_id, stock_quantity }) => {
      console.log("Received stockUpdate:", { product_id, stock_quantity });
      await refetchData();
      dispatch(
        addNotification({
          type: "info",
          message: `Stock updated for product ID ${product_id}`,
        }),
      );
    });
    return () => socket.disconnect();
  }, [setOrders, refetchData, dispatch]);

  const debouncedSearch = useCallback(
    debounce((value) => setSearchTerm(value), 300),
    [],
  );

  useEffect(() => {
    setPage(0);
  }, [searchTerm, filterStatus, filterMonth, filterYear]);

  const handleSearchChange = (e) => {
    const value = e.target.value.toLowerCase();
    setSearchInput(value);
    debouncedSearch(value);
  };

  const getAvailableStock = useMemo(() => {
    const cache = {};
    return (productId, editingOrderId = null) => {
      const cacheKey = `${productId}-${editingOrderId || "new"}`;
      if (cache[cacheKey] !== undefined) return cache[cacheKey];

      const validProducts = Array.isArray(products)
        ? products.filter((p) => p && typeof p.product_id !== "undefined")
        : [];
      const product = validProducts.find(
        (p) => String(p.product_id) === String(productId),
      );
      if (!product) {
        console.log("Product not found for ID:", productId);
        return (cache[cacheKey] = 0);
      }

      let baseStock = product.stock_quantity || 0;
      if (!editingOrderId) {
        const validOrders = Array.isArray(orders)
          ? orders.filter((o) => o && Array.isArray(o.items))
          : [];
        const reserved =
          validOrders
            .filter((o) => o.status !== "Cancelled" && o.status !== "Delivered")
            .flatMap((o) => o.items)
            .filter(
              (item) => item && String(item.product_id) === String(productId),
            )
            .reduce((sum, item) => sum + (parseInt(item.quantity) || 0), 0) ||
          0;
        console.log(
          "Available stock for",
          product.product_name,
          ": base=",
          baseStock,
          "reserved=",
          reserved,
        );
        return (cache[cacheKey] = Math.max(0, baseStock - reserved));
      }

      const originalOrder = orders.find((o) => o && o.id === editingOrderId);
      const originalQty =
        originalOrder?.items
          ?.filter(
            (item) => item && String(item.product_id) === String(productId),
          )
          .reduce((sum, item) => sum + (parseInt(item.quantity) || 0), 0) || 0;
      const currentQty =
        selectedOrder?.items
          ?.filter(
            (item) => item && String(item.product_id) === String(productId),
          )
          .reduce((sum, item) => sum + (parseInt(item.quantity) || 0), 0) || 0;
      const available = Math.max(0, baseStock + originalQty - currentQty);
      console.log(
        "Editing stock for",
        product.product_name,
        ": base=",
        baseStock,
        "original=",
        originalQty,
        "current=",
        currentQty,
        "available=",
        available,
      );
      return (cache[cacheKey] = available);
    };
  }, [orders, products, selectedOrder]);

  const handleCreateOrder = useCallback(
    async (newOrder) => {
      try {
        const backendUrl =
          import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";
        console.log("Creating order with payload:", newOrder);
        const res = await fetch(`${backendUrl}/api/orders`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
          credentials: "include",
          body: JSON.stringify(newOrder),
        });
        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.error || "Failed to create order");
        }
        setPage(0);
        setSearchInput("");
        setFilterStatus("All");
        await refetchData();
        setShowCreateForm(false);
        dispatch(
          addNotification({
            type: "success",
            message: "Order created successfully",
          }),
        );
      } catch (error) {
        console.error("Create order error:", error);
        dispatch(
          addNotification({
            type: "error",
            message: `Failed to create order: ${error.message}`,
          }),
        );
      }
    },
    [refetchData, dispatch],
  );

  const handleUpdateOrder = useCallback(
    async (orderId, items, paymentStatus, targetDeliveryDate, status) => {
      try {
        const backendUrl =
          import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";
        const payload = {
          items,
          payment_status: paymentStatus,
          targetDeliveryDate,
          status,
        };
        console.log("Updating order", orderId, "with payload:", payload);
        const res = await fetch(`${backendUrl}/api/orders/${orderId}/update`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
          credentials: "include",
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.error || "Failed to update order");
        }
        await refetchData();
        setShowEditForm(false);
        setSelectedOrder(null);
        dispatch(
          addNotification({
            type: "success",
            message: "Order updated successfully",
          }),
        );
      } catch (error) {
        console.error("Update order error:", error);
        dispatch(addNotification({ type: "error", message: error.message }));
      }
    },
    [refetchData, dispatch],
  );

  const handleCancelOrder = useCallback(
    async (orderId) => {
      if (
        !window.confirm(
          "Are you sure you want to cancel this order? This action cannot be undone.",
        )
      )
        return;
      setIsCancelling(true);
      try {
        const backendUrl =
          import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";
        console.log("Cancelling order:", orderId);
        const res = await fetch(`${backendUrl}/api/orders/${orderId}/cancel`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
          credentials: "include",
          body: JSON.stringify({ goods_returned: false }),
        });
        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.error || "Failed to cancel order");
        }
        await refetchData();
        notifySuccess("Order cancelled successfully", { autoClose: 3000 });
      } catch (error) {
        console.error("Cancel order error:", error);
        notifyError(error.message, { autoClose: 5000 });
      } finally {
        setIsCancelling(false);
      }
    },
    [refetchData],
  );

  const handleStatusChange = useCallback(
    async (orderId, newStatus) => {
      if (
        !window.confirm(
          `Are you sure you want to change the status to ${newStatus}?`,
        )
      )
        return;
      try {
        const order = orders.find((o) => o.id === orderId);
        const backendUrl =
          import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";
        console.log("Changing status for order", orderId, "to", newStatus);
        const res = await fetch(`${backendUrl}/api/orders/${orderId}/update`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
          credentials: "include",
          body: JSON.stringify({
            status: newStatus,
          }),
        });
        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.error || "Failed to update status");
        }
        await refetchData();
        notifySuccess(`Order status changed to ${newStatus}`, {
          autoClose: 3000,
        });
      } catch (error) {
        console.error("Status change error:", error);
        notifyError(error.message, { autoClose: 5000 });
      }
    },
    [orders, refetchData],
  );

  const initiateEdit = useCallback((order) => {
    console.log("Initiating edit for order:", order);
    setSelectedOrder(order);
    setShowEditForm(true);
  }, []);

  const sortedOrders = useMemo(() => {
    const sortableOrders = [...orders];
    if (sortConfig.key) {
      sortableOrders.sort((a, b) => {
        let aValue = a[sortConfig.key],
          bValue = b[sortConfig.key];
        if (sortConfig.key === "totalAmount") {
          aValue = calculateTotalAmount(a.items);
          bValue = calculateTotalAmount(b.items);
        } else if (sortConfig.key === "items") {
          aValue = a.items.length;
          bValue = b.items.length;
        } else if (
          sortConfig.key === "createdAt" ||
          sortConfig.key === "targetDeliveryDate"
        ) {
          aValue = new Date(aValue || 0);
          bValue = new Date(bValue || 0);
        }
        return aValue < bValue
          ? sortConfig.direction === "asc"
            ? -1
            : 1
          : aValue > bValue
            ? sortConfig.direction === "asc"
              ? 1
              : -1
            : 0;
      });
    }
    return sortableOrders;
  }, [orders, sortConfig]);

  const filteredOrders = useMemo(() => {
    return sortedOrders.filter((order) => {
      if (!order || !order.id) return false;

      const createdDate = order.createdAt ? new Date(order.createdAt) : null;

      const matchesSearch =
        order.id.toString().includes(searchTerm) ||
        (order.customerName || "")
          .toLowerCase()
          .includes(searchTerm.toLowerCase());

      const matchesStatus =
        filterStatus === "All" || order.status === filterStatus;

      const matchesMonth =
        filterMonth === "All" ||
        (createdDate && createdDate.getMonth() + 1 === Number(filterMonth));

      const matchesYear =
        filterYear === "All" ||
        (createdDate && createdDate.getFullYear() === Number(filterYear));

      return matchesSearch && matchesStatus && matchesMonth && matchesYear;
    });
  }, [sortedOrders, searchTerm, filterStatus, filterMonth, filterYear]);

  const paginatedOrders = useMemo(() => {
    const start = page * ordersPerPage;
    return filteredOrders.slice(start, start + ordersPerPage);
  }, [filteredOrders, page, ordersPerPage]);

  const handleSort = useCallback((key) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "desc" ? "asc" : "desc",
    }));
  }, []);

  const handleCreateButtonClick = useCallback(() => {
    console.log("Create Order button clicked", {
      isLoading,
      productsLength: products.length,
    });
    setShowCreateForm(true);
  }, [isLoading, products.length]);

  if (isLoading && !orders.length)
    return (
      <div
        className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8 flex items-center justify-center"
        aria-live="polite"
      >
        <div className="text-gray-600 text-xl animate-pulse">
          Loading orders...
        </div>
      </div>
    );

  if (isEmpty)
    return (
      <div
        className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8 flex items-center justify-center"
        role="status"
      >
        <div className="bg-white p-8 rounded-2xl shadow-lg text-center">
          <ShoppingCart className="mx-auto mb-4 text-gray-400" size={48} />
          <h2 className="text-2xl font-bold text-gray-800 mb-2">
            No Orders Yet
          </h2>
          <p className="text-gray-600 mb-6">
            Your database is empty. Start by creating a new order!
          </p>
          <button
            onClick={handleCreateButtonClick}
            className="p-3 bg-amber-500 text-white rounded-lg hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-300 transition-all duration-300 flex items-center mx-auto"
          >
            <PlusCircle className="mr-2" /> Create First Order
          </button>
        </div>
      </div>
    );

  if (error && !showCreateForm && !showEditForm && !showPaymentDetails)
    return (
      <div
        className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8 flex items-center justify-center"
        role="alert"
      >
        <div className="bg-red-100 border border-red-400 text-red-700 px-6 py-4 rounded-lg shadow-md text-lg flex flex-col items-center">
          <p className="mb-4">{error}</p>
          <div className="flex gap-4">
            <button
              onClick={() => refetchData()}
              className="px-4 py-2 bg-amber-500 text-white rounded hover:bg-amber-600 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-amber-300"
            >
              Retry
            </button>
            <button
              onClick={handleCreateButtonClick}
              className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-green-300"
            >
              Create New Order
            </button>
          </div>
        </div>
      </div>
    );

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8">
      <h1 className="text-4xl font-bold text-gray-800 mb-10 text-center tracking-tight">
        Orders
      </h1>
      <div className="max-w-7xl mx-auto">
        <div className="flex mb-8 gap-6 flex-wrap">
          <div className="relative flex-grow">
            <label htmlFor="search-orders" className="sr-only">
              Search Orders
            </label>
            <input
              id="search-orders"
              type="text"
              placeholder="Search by Order ID or Customer Name..."
              value={searchInput}
              onChange={handleSearchChange}
              className="w-full p-3 pl-12 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300 text-lg bg-white shadow-md transition-all duration-300"
            />
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" />
          </div>
          <div>
            <label htmlFor="status-filter" className="sr-only">
              Filter by Status
            </label>
            <select
              id="status-filter"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="p-3 mx-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300 text-lg bg-white shadow-md"
            >
              <option value="All">All Status</option>
              <option value="Pending">Pending</option>
              <option value="Processing">Processing</option>
              <option value="Testing">Testing</option>
              <option value="Shipped">Shipped</option>
              <option value="Delivered">Delivered</option>
              <option value="Cancelled">Cancelled</option>
            </select>
            <select
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
              className="p-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300 text-lg bg-white shadow-md"
            >
              <option value="All">All Months</option>
              {[...Array(12)].map((_, i) => (
                <option key={i} value={i + 1}>
                  {new Date(0, i).toLocaleString("en-IN", { month: "long" })}
                </option>
              ))}
            </select>
            <select
              value={filterYear}
              onChange={(e) => setFilterYear(e.target.value)}
              className="p-3 mx-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300 text-lg bg-white shadow-md"
            >
              <option value="All">All Years</option>
              {[
                ...new Set(
                  orders.map((o) =>
                    o.createdAt ? new Date(o.createdAt).getFullYear() : null,
                  ),
                ),
              ]
                .filter(Boolean)
                .sort((a, b) => b - a)
                .map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
            </select>
          </div>
          <button
            onClick={() => refetchData()}
            className="p-3 bg-amber-400 text-gray-900 rounded-lg hover:bg-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-300 transition-all duration-300 shadow-md text-lg"
            disabled={isLoading}
            aria-label="Refresh orders"
          >
            {isLoading && orders.length > 0 ? "Refreshing..." : "Refresh"}
          </button>
          <button
            onClick={handleCreateButtonClick}
            className="p-4 bg-amber-500 text-white rounded-lg hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-300 transition-all duration-300 shadow-md flex items-center"
            disabled={isLoading}
            aria-label="Create new order"
          >
            <PlusCircle className="mr-2" /> Create Order
          </button>
        </div>

        {isLoading && orders.length > 0 && (
          <div
            className="text-gray-600 text-lg mb-4 text-center"
            aria-live="polite"
          >
            Refreshing data...
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-lg overflow-x-auto">
          <table
            className="w-full text-left border-collapse"
            role="grid"
            aria-label="Orders table"
            ref={tableRef}
            tabIndex={0}
          >
            <thead>
              <tr
                className="bg-gradient-to-r from-amber-200 via-amber-100 to-amber-50"
                role="row"
              >
                {[
                  { key: "id", label: "Order ID" },
                  { key: "customerName", label: "Customer Name" },
                  { key: "items", label: "Items" },
                  { key: "totalAmount", label: "Total Amount" },
                  { key: "status", label: "Status" },
                  { key: "targetDeliveryDate", label: "Target Delivery" },
                  { key: "paymentStatus", label: "Payment Status" },
                  { key: "createdAt", label: "Created At (IST)" },
                  { key: "actions", label: "Actions" },
                ].map(({ key, label }) => (
                  <th
                    key={key}
                    className={`py-5 px-3 text-gray-800 text-base font-semibold ${
                      key !== "items" && key !== "actions"
                        ? "cursor-pointer hover:bg-amber-300"
                        : ""
                    } transition-all duration-200`}
                    onClick={() =>
                      key !== "items" && key !== "actions" && handleSort(key)
                    }
                    aria-sort={
                      sortConfig.key === key ? sortConfig.direction : "none"
                    }
                    scope="col"
                  >
                    <div className="flex items-center justify-between">
                      <span>{label}</span>
                      {key !== "items" && key !== "actions" && (
                        <ArrowDownUp
                          size={16}
                          className={`ml-2 text-gray-600 ${
                            sortConfig.key === key
                              ? "text-gray-900"
                              : "opacity-50"
                          }`}
                          aria-hidden="true"
                        />
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginatedOrders.map((order) => (
                <tr
                  key={order.id}
                  className="border-t hover:bg-amber-50 transition-all duration-200"
                  role="row"
                >
                  <td className="py-4 px-3 text-gray-600 text-base">
                    {order.id}
                  </td>
                  <td className="py-4 px-3 text-gray-600 text-base">
                    {order.customerName || "N/A"}
                  </td>
                  <td className="py-4 px-3 text-gray-600 text-base">
                    <ul className="space-y-1">
                      {order.items.map((item, idx) => (
                        <li key={idx} className="text-sm">
                          {item.productName} (Qty: {item.quantity})
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td className="py-4 px-3 text-gray-600 text-base">
                    {formatCurrency(calculateTotalAmount(order.items))}
                  </td>
                  <td className="py-4 px-3 text-gray-600 text-base">
                    <span
                      className={`px-3 py-1 rounded-full text-white text-sm font-medium ${
                        order.status === "Pending"
                          ? "bg-amber-500"
                          : order.status === "Processing"
                            ? "bg-yellow-600"
                            : order.status === "Testing"
                              ? "bg-purple-600"
                              : order.status === "Shipped"
                                ? "bg-blue-600"
                                : order.status === "Delivered"
                                  ? "bg-green-600"
                                  : order.status === "Cancelled"
                                    ? "bg-red-600"
                                    : "bg-gray-500"
                      }`}
                    >
                      {order.status}
                    </span>
                  </td>
                  <td className="py-4 px-3 text-gray-600 text-base">
                    {order.targetDeliveryDate
                      ? formatDate(order.targetDeliveryDate)
                      : "Not Set"}
                  </td>
                  <td className="py-4 px-3 text-gray-600 text-base">
                    {order.paymentStatus || "N/A"}
                  </td>
                  <td className="py-4 px-3 text-gray-600 text-base">
                    <div className="flex flex-col">
                      <span>
                        {new Date(order.createdAt).toLocaleDateString("en-IN")}
                      </span>
                      <span className="text-sm text-gray-500">
                        {new Date(order.createdAt).toLocaleTimeString("en-IN")}
                      </span>
                    </div>
                  </td>
                  <td className="py-4 px-3 text-gray-600 text-base">
                    <ActionsDropdown
                      order={order}
                      onEdit={initiateEdit}
                      onStatusChange={handleStatusChange}
                      onCancel={handleCancelOrder}
                      isCancelling={isCancelling}
                      setSelectedOrder={setSelectedOrder}
                      setShowPaymentDetails={setShowPaymentDetails}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {totalOrders > 0 && (
            <div className="flex justify-between items-center p-4 bg-gray-50">
              <div className="text-gray-600">
                Showing {paginatedOrders.length} of {filteredOrders.length}{" "}
                filtered orders (Total: {totalOrders})
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => setPage((p) => (p > 0 ? p - 1 : 0))}
                  disabled={page === 0}
                  className="p-2 bg-white border rounded-lg disabled:opacity-50 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-300"
                  aria-label="Previous page"
                >
                  <ChevronLeft size={20} />
                </button>
                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={(page + 1) * ordersPerPage >= filteredOrders.length}
                  className="p-2 bg-white border rounded-lg disabled:opacity-50 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-300"
                  aria-label="Next page"
                >
                  <ChevronRight size={20} />
                </button>
              </div>
            </div>
          )}

          {filteredOrders.length === 0 && (
            <div
              className="text-center py-12 text-gray-500 flex flex-col items-center"
              role="alert"
            >
              <Filter className="mb-4 text-gray-400" size={48} />
              <p className="text-lg">
                No orders found matching your search or filter.
              </p>
              <button
                onClick={handleCreateButtonClick}
                className="mt-4 p-3 bg-amber-500 text-white rounded-lg hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-300 flex items-center"
              >
                <PlusCircle className="mr-2" /> Create New Order
              </button>
            </div>
          )}
        </div>
      </div>

      {showCreateForm && (
        <CreateOrderForm
          customers={customers}
          availableProducts={products}
          onClose={() => setShowCreateForm(false)}
          onSubmit={handleCreateOrder}
          validateOrderItems={validateOrderItems}
          getAvailableStock={getAvailableStock}
          formatDate={formatDate}
        />
      )}

      {showEditForm && selectedOrder && (
        <EditOrderForm
          order={selectedOrder}
          availableProducts={products}
          onClose={() => setShowEditForm(false)}
          onSubmit={handleUpdateOrder}
          validateOrderItems={validateOrderItems}
          getAvailableStock={getAvailableStock}
          formatDate={formatDate}
        />
      )}

      {showPaymentDetails && selectedOrder && (
        <div
          className="fixed inset-0 bg-gray-900 bg-opacity-60 flex items-center justify-center z-50"
          role="dialog"
          aria-labelledby="payment-details-title"
        >
          <div className="bg-white p-8 rounded-2xl shadow-2xl w-[500px] relative">
            <button
              onClick={() => setShowPaymentDetails(false)}
              className="absolute top-4 right-4 text-gray-500 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-300"
              aria-label="Close payment details"
            >
              <XCircle size={24} />
            </button>
            <h2
              id="payment-details-title"
              className="text-2xl font-bold text-gray-800 mb-6"
            >
              Payment Details for Order #{selectedOrder.id}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="text-gray-700 font-medium">
                  Payment Status:
                </label>
                <p className="text-gray-600">
                  {selectedOrder.paymentStatus || "N/A"}
                </p>
              </div>
              <div>
                <label className="text-gray-700 font-medium">
                  Total Amount:
                </label>
                <p className="text-gray-600">
                  {formatCurrency(calculateTotalAmount(selectedOrder.items))}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

</div>
  );
}

export default OrdersPage;