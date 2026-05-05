import { useState, useEffect, useCallback, useRef } from "react";
export const useFetchData = ({ limit, offset }) => {
  const [orders, setOrders] = useState([]);
  const [totalOrders, setTotalOrders] = useState(0); // total count for pagination
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isEmpty, setIsEmpty] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // useCallback to prevent unnecessary re-creation of function unless limit or offset changes
  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      const token = localStorage.getItem("token");
      if (!token)
        throw new Error("Authentication token missing. Please log in again.");
      const backendUrl =
        import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";
      // console.log("Fetching data from:", backendUrl);
      // Pagination applied below in the API call
      const url = `${backendUrl}/api/orders?limit=${limit}&offset=${offset}&force_refresh=true`;
      // All 3 requests run at the same time
      // headers: {Authorization: `Bearer ${token}` --- to let the backend know who has made the request
      const [ordersRes, productsRes, customersRes] = await Promise.all([
        fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include",
        }).catch(() => ({ ok: false })),
        fetch(`${backendUrl}/api/inventory/available`, {
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include",
        }).catch(() => ({ ok: false })),
        fetch(`${backendUrl}/api/users/customers`, {
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include",
        }).catch(() => ({ ok: false })),
      ]);

      // Convert the responses into JSON
      const [ordersData, productsData, customersData] = await Promise.all([
        ordersRes.ok ? ordersRes.json() : { orders: [], total: 0 },
        productsRes.ok
          ? productsRes.json().then((data) => data.data || [])
          : [],
        customersRes.ok ? customersRes.json() : [],
      ]);

      if (mountedRef.current) {
        const validOrders = (ordersData.orders || [])
          .filter((o) => o && typeof o.id !== "undefined")
          .map((order) => ({
            ...order,
            totalAmount: calculateTotalAmount(order.items),
            createdAt: order.createdAt || new Date().toISOString(),
            targetDeliveryDate: order.targetDeliveryDate || null,
            paymentStatus: order.paymentStatus || "Pending",
            status: order.status || "Pending",
            customerName: order.customerName || "N/A",
            items: Array.isArray(order.items)
              ? order.items
                  .filter(
                    (item) => item && typeof item.product_id !== "undefined",
                  )
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
                  }))
              : [],
          }));
        setOrders(validOrders);
        setTotalOrders(ordersData.total || 0);
        setProducts(
          (productsData || []).filter(
            (p) => p && typeof p.product_id !== "undefined",
          ),
        );
        setCustomers(
          (customersData || []).filter(
            (c) => c && typeof c.user_id !== "undefined",
          ),
        );
        setIsEmpty(
          validOrders.length === 0 &&
            productsData.length === 0 &&
            customersData.length === 0,
        );
        setError(null);
        console.log("Fetched orders:", validOrders);
        console.log("Fetched products:", productsData);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err.message || "Failed to fetch data");
        setIsEmpty(false);
        console.error("Fetch error:", err);
      }
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, [limit, offset]);

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