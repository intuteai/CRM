import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { ArrowDownUp, X, MoreVertical } from "lucide-react";
import io from "socket.io-client";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

const SOCKET_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";
const BASE_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";
const API_URL = `${BASE_URL}/api/enquiry`;

// Fallback formatDate function
const formatDate = (dateString) => {
  if (!dateString) return "N/A";
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString();
  } catch (error) {
    console.error("Error formatting date:", error);
    return dateString;
  }
};

// Lead badge styles
const getLeadClasses = (lead) => {
  const value = (lead || "").toLowerCase();
  switch (value) {
    case "hotlead":
      return "bg-red-100 text-red-700 border-red-300";
    case "followup":
      return "bg-amber-100 text-amber-700 border-amber-300";
    case "lead":
      return "bg-blue-100 text-blue-700 border-blue-300";
    case "not_interested":
      return "bg-gray-100 text-gray-600 border-gray-300";
    case "closed":
      return "bg-green-100 text-green-700 border-green-300";
    default:
      return "bg-gray-100 text-gray-700 border-gray-300";
  }
};

const formatLeadLabel = (lead) => {
  const value = (lead || "").toLowerCase();
  switch (value) {
    case "hotlead":
      return "Hot Lead";
    case "followup":
      return "Follow-up";
    case "lead":
      return "Lead";
    case "not_interested":
      return "Not Interested";
    case "closed":
      return "Closed";
    default:
      return "Lead";
  }
};

function SalesEnquiryPage({ socket: providedSocket }) {
  const [enquiries, setEnquiries] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sortConfig, setSortConfig] = useState({
    key: "enquiry_id",
    direction: "descending", // <- default descending so latest at top
  });
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);

  // Filters
  const [leadFilter, setLeadFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedEnquiry, setSelectedEnquiry] = useState(null);

  const [itemsModalOpen, setItemsModalOpen] = useState(false);
  const [itemsModalText, setItemsModalText] = useState("");
  const [itemsModalTitle, setItemsModalTitle] = useState("");

  // Detail drawer
  const [detailEnquiry, setDetailEnquiry] = useState(null);
  const [detailActivities, setDetailActivities] = useState([]);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [commentTemplates, setCommentTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");

  const [followed, setFollowed] = useState(new Set()); // local cache

  const [newEnquiry, setNewEnquiry] = useState({
    enquiry_id: "",
    company_name: "",
    contact_person: "",
    mail_id: "",
    phone_no: "",
    items_required: "",
    status: "Pending",
    last_discussion: "",
    next_interaction: "",
    lead: "lead", // 🔥 main field
    source: "Website",
    application: "", // <-- NEW application field
    tagsInput: "",
    due_date: "",
  });

  const [errors, setErrors] = useState({});
  const limit = 10;
  const tableRef = useRef(null);
  const hasFetched = useRef(false);
  const isFetching = useRef(false);

  // Assign modal state
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [assignTargetEnquiry, setAssignTargetEnquiry] = useState(null);
  const [assignUserId, setAssignUserId] = useState("");
  const [assignDueDate, setAssignDueDate] = useState("");
  const [assignMessage, setAssignMessage] = useState("");

  // Global actions menu position (portal)
  const [actionsMenuState, setActionsMenuState] = useState({
    isOpen: false,
    enquiry: null,
    x: 0,
    y: 0,
  });

  const socket = useMemo(
    () =>
      providedSocket ||
      io(SOCKET_URL, {
        withCredentials: true,
        transports: ["websocket"],
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      }),
    [providedSocket]
  );

  const fetchEnquiries = useCallback(
    async (forceRefresh = false) => {
      if (isFetching.current) return;

      isFetching.current = true;
      setIsLoading(true);
      setError(null);

      try {
        const token = localStorage.getItem("token");
        const offset = page * limit;
        const url = `${API_URL}?limit=${limit}&offset=${offset}${
          forceRefresh ? "&force_refresh=true" : ""
        }`;

        const response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(
            errorText || `Server responded with status: ${response.status}`
          );
        }

        const responseData = await response.json();

        if (!responseData.data || !Array.isArray(responseData.data)) {
          throw new Error("Invalid data format");
        }

        setEnquiries(responseData.data);
        setTotal(responseData.total || 0);
        setError(null);
      } catch (err) {
        console.error("Error fetching enquiries:", err);
        const errorMessage =
          err.message || "Network error. Please try again later.";
        setError(errorMessage);
        toast.error(errorMessage, { autoClose: 3000 });
      } finally {
        setIsLoading(false);
        isFetching.current = false;
      }
    },
    [page]
  );

  // Fetch detail + activities + templates
  const fetchEnquiryDetail = useCallback(async (enquiryId) => {
    try {
      setDetailLoading(true);
      const token = localStorage.getItem("token");

      const [enqRes, tmplRes] = await Promise.all([
        fetch(`${API_URL}/${enquiryId}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }),
        fetch(`${API_URL}/templates`, {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }),
      ]);

      if (!enqRes.ok) {
        const txt = await enqRes.text();
        throw new Error(txt || `Failed to load enquiry: ${enqRes.status}`);
      }

      let tmplData = [];
      if (!tmplRes.ok) {
        console.warn("Failed to load templates, continuing without them");
      } else {
        const tmplRaw = await tmplRes.json();
        tmplData = Array.isArray(tmplRaw) ? tmplRaw : [];
      }

      const enqData = await enqRes.json();

      setDetailEnquiry(enqData);
      setDetailActivities(enqData.activities || []);
      setCommentTemplates(tmplData || []);
      setIsDetailOpen(true);

      // Mark all activities as read (read receipts)
      const token2 = localStorage.getItem("token");
      const markPromises = (enqData.activities || []).map((act) =>
        fetch(`${API_URL}/${enquiryId}/activity/${act.activity_id}/read`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token2}`,
            "Content-Type": "application/json",
          },
        }).catch(() => {})
      );
      Promise.all(markPromises);
    } catch (err) {
      console.error("Error fetching enquiry detail:", err);
      toast.error(err.message || "Failed to load enquiry detail");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!hasFetched.current) {
      fetchEnquiries(false);
      hasFetched.current = true;
    }

    socket.on("connect", () => {
      console.log("Connected to Socket.IO in EnquiryPage");
      toast.success("Connected to real-time updates!", { autoClose: 2000 });
    });

    socket.on("connect_error", (err) => {
      console.error("Socket connection error:", err);
      toast.error("Failed to connect to real-time updates.", {
        autoClose: 3000,
      });
    });

    socket.on("enquiryUpdate", (payload) => {
      const {
        type,
        enquiry_id,
        company_name,
        contact_person,
        mail_id,
        phone_no,
        items_required,
        status,
        last_discussion,
        next_interaction,
        lead,
        priority,
        source,
        tags,
        stage,
        due_date,
        assigned_to_name,
        application, // may come in payload
      } = payload;

      const effectiveLead = lead || priority || "lead";
      const effectivePriority = priority || lead || "lead";

      setEnquiries((prev) => {
        if (!Array.isArray(prev)) return prev || [];

        // Deleted
        if (type === "deleted" || status === "Deleted") {
          toast.info(`Enquiry #${enquiry_id} deleted`, {
            className: "bg-amber-100 border-amber-300",
          });
          return prev.filter((e) => e.enquiry_id !== enquiry_id);
        }

        const idx = prev.findIndex((e) => e.enquiry_id === enquiry_id);
        const baseData = {
          enquiry_id,
          company_name,
          contact_person,
          mail_id,
          phone_no,
          items_required,
          status,
          last_discussion,
          next_interaction,
          lead: effectiveLead,
          priority: effectivePriority,
          source,
          tags,
          stage,
          due_date,
          assigned_to_name,
          application, // keep application in list
        };

        if (idx === -1) {
          toast.info(`New enquiry #${enquiry_id} added`, {
            className: "bg-amber-100 border-amber-300",
          });
          return [baseData, ...prev];
        }

        const existing = prev[idx];
        const updated = { ...existing, ...baseData };

        if (JSON.stringify(existing) === JSON.stringify(updated)) return prev;

        const copy = [...prev];
        copy[idx] = updated;
        toast.info(`Enquiry #${enquiry_id} updated`, {
          className: "bg-amber-100 border-amber-300",
        });
        return copy;
      });

      // If detail drawer is open for this enquiry, update it too
      setDetailEnquiry((prev) => {
        if (!prev || prev.enquiry_id !== enquiry_id) return prev;
        return {
          ...prev,
          company_name,
          contact_person,
          mail_id,
          phone_no,
          items_required,
          status,
          last_discussion,
          next_interaction,
          lead: effectiveLead,
          priority: effectivePriority,
          source,
          tags,
          stage,
          due_date,
          assigned_to_name,
          application,
        };
      });
    });

    socket.on("enquiryActivity", ({ enquiryId, activity }) => {
      setDetailActivities((prev) => {
        if (!detailEnquiry || detailEnquiry.enquiry_id !== enquiryId)
          return prev;
        return [...prev, activity];
      });
    });

    return () => {
      socket.off("connect");
      socket.off("connect_error");
      socket.off("enquiryUpdate");
      socket.off("enquiryActivity");
      if (!providedSocket) socket.disconnect();
    };
  }, [fetchEnquiries, socket, providedSocket, detailEnquiry]);

  const handleSort = useCallback((key) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "ascending" ? "descending" : "ascending",
    }));
  }, []);

  const validateForm = () => {
    const newErrors = {};
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phoneRegex = /^[0-9]{10}$/;

    if (newEnquiry.enquiry_id && newEnquiry.enquiry_id.length < 3)
      newErrors.enquiry_id = "Enquiry ID must be at least 3 characters if provided";
    if (!newEnquiry.company_name || newEnquiry.company_name.length < 3)
      newErrors.company_name = "Company name must be at least 3 characters";
    if (newEnquiry.contact_person && newEnquiry.contact_person.length < 3)
      newErrors.contact_person = "Contact person must be at least 3 characters";
    if (newEnquiry.mail_id && !emailRegex.test(newEnquiry.mail_id))
      newErrors.mail_id = "Enter a valid email address";
    if (newEnquiry.phone_no && !phoneRegex.test(newEnquiry.phone_no))
      newErrors.phone_no = "Phone must be a valid 10-digit number";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const resetForm = () => {
    setNewEnquiry({
      enquiry_id: "",
      company_name: "",
      contact_person: "",
      mail_id: "",
      phone_no: "",
      items_required: "",
      status: "Pending",
      last_discussion: "",
      next_interaction: "",
      lead: "lead",
      source: "Website",
      application: "",
      tagsInput: "",
      due_date: "",
    });
    setErrors({});
  };

  const handleCreate = useCallback(() => {
    setIsEditing(false);
    setSelectedEnquiry(null);
    resetForm();
    setIsModalOpen(true);
  }, []);

  const handleEdit = useCallback((enquiry) => {
    const effectiveLead = enquiry.lead || enquiry.priority || "lead";
    setIsEditing(true);
    setSelectedEnquiry(enquiry);
    setNewEnquiry({
      enquiry_id: enquiry.enquiry_id || "",
      company_name: enquiry.company_name || "",
      contact_person: enquiry.contact_person || "",
      mail_id: enquiry.mail_id || "",
      phone_no: enquiry.phone_no || "",
      items_required: enquiry.items_required || "",
      status: enquiry.status || "Pending",
      last_discussion: enquiry.last_discussion ? new Date(enquiry.last_discussion).toISOString().split("T")[0] : "",
      next_interaction: enquiry.next_interaction ? new Date(enquiry.next_interaction).toISOString().split("T")[0] : "",
      lead: effectiveLead,
      source: enquiry.source || "Website",
      application: enquiry.application || "",
      tagsInput: Array.isArray(enquiry.tags) ? enquiry.tags.join(", ") : "",
      due_date: enquiry.due_date ? new Date(enquiry.due_date).toISOString().split("T")[0] : "",
    });
    setErrors({});
    setIsModalOpen(true);
  }, []);

  const handleDelete = useCallback(async (enquiryId) => {
    if (!window.confirm(`Are you sure you want to delete enquiry #${enquiryId}?`)) return;

    try {
      const token = localStorage.getItem("token");
      const url = `${API_URL}/${enquiryId}`;

      const response = await fetch(url, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `Delete failed with status: ${response.status}`);
      }

      toast.success(`Enquiry #${enquiryId} deleted successfully!`, {
        className: "bg-amber-100 border-amber-300",
      });

      setTimeout(() => {
        fetchEnquiries(true);
      }, 800);
    } catch (err) {
      console.error("Delete error:", err);
      const errorMessage = err.message || "Failed to delete enquiry";
      toast.error(errorMessage, {
        className: "bg-amber-100 border-amber-300",
      });
    }
  }, [fetchEnquiries]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) {
      toast.error("Please fix the form errors", {
        className: "bg-amber-100 border-amber-300",
      });
      return;
    }
    try {
      const token = localStorage.getItem("token");
      const url = isEditing ? `${API_URL}/${selectedEnquiry.enquiry_id}` : API_URL;
      const method = isEditing ? "PUT" : "POST";

      const tagsArray = newEnquiry.tagsInput.split(",").map((t) => t.trim()).filter(Boolean);

      const body = {
        company_name: newEnquiry.company_name,
        contact_person: newEnquiry.contact_person || null,
        mail_id: newEnquiry.mail_id || null,
        phone_no: newEnquiry.phone_no || null,
        items_required: newEnquiry.items_required || null,
        status: newEnquiry.status,
        last_discussion: newEnquiry.last_discussion || null,
        next_interaction: newEnquiry.next_interaction || null,
        lead: newEnquiry.lead,
        source: newEnquiry.source,
        application: newEnquiry.application || null, // <-- include application
        tags: tagsArray,
        due_date: newEnquiry.due_date || null,
      };
      if (newEnquiry.enquiry_id) body.enquiry_id = newEnquiry.enquiry_id;

      const response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `${isEditing ? "Update" : "Create"} failed with status: ${response.status}`);
      }

      const updatedEnquiry = await response.json();
      if (isEditing) {
        setEnquiries((prev) => prev.map((e) => (e.enquiry_id === updatedEnquiry.enquiry_id ? updatedEnquiry : e)));
        toast.success(`Enquiry #${updatedEnquiry.enquiry_id} updated successfully!`, {
          className: "bg-amber-100 border-amber-300",
        });
      } else {
        setEnquiries((prev) => [updatedEnquiry, ...prev]);
        toast.success(`Enquiry #${updatedEnquiry.enquiry_id} created successfully!`, {
          className: "bg-amber-100 border-amber-300",
        });
      }
      setIsModalOpen(false);
      resetForm();
      fetchEnquiries(true);
    } catch (err) {
      console.error(`${isEditing ? "Update" : "Create"} error:`, err);
      const errorMessage =
        err.message && err.message.includes("Enquiry ID already exists")
          ? "Enquiry ID already exists. Please use a unique ID."
          : err.message || `${isEditing ? "Update" : "Create"} failed`;
      toast.error(errorMessage, {
        className: "bg-amber-100 border-amber-300",
      });
    }
  };

  // Follow / unfollow
  const toggleFollow = async (enquiryId) => {
    const token = localStorage.getItem("token");
    const isCurrentlyFollowed = followed.has(enquiryId);
    try {
      const url = `${API_URL}/${enquiryId}/follow`;
      const method = isCurrentlyFollowed ? "DELETE" : "POST";

      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || "Failed to update follow state");
      }

      setFollowed((prev) => {
        const next = new Set(prev);
        if (isCurrentlyFollowed) next.delete(enquiryId);
        else next.add(enquiryId);
        return next;
      });

      toast.success(
        isCurrentlyFollowed ? `Unfollowed enquiry #${enquiryId}` : `Following enquiry #${enquiryId}`,
        { className: "bg-amber-100 border-amber-300" }
      );
    } catch (err) {
      console.error("Follow toggle error:", err);
      toast.error(err.message || "Failed to update follow state");
    }
  };

  // OPEN ASSIGN MODAL
  const openAssignModal = (enquiry) => {
    setAssignTargetEnquiry(enquiry);
    setAssignUserId("");
    setAssignDueDate(enquiry.due_date ? new Date(enquiry.due_date).toISOString().split("T")[0] : "");
    setAssignMessage("");
    setIsAssignModalOpen(true);
  };

  // SUBMIT ASSIGN
  const handleAssignSubmit = async (e) => {
    e.preventDefault();
    if (!assignTargetEnquiry) {
      toast.error("No enquiry selected for assignment");
      return;
    }
    if (!assignUserId) {
      toast.error("Assignee user ID is required");
      return;
    }

    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/${assignTargetEnquiry.enquiry_id}/assign`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          assigned_to: parseInt(assignUserId, 10),
          due_date: assignDueDate || null,
          message: assignMessage || null,
        }),
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || "Failed to assign enquiry");
      }

      const updated = await res.json();

      // Update list locally
      setEnquiries((prev) => prev.map((e) => (e.enquiry_id === updated.enquiry_id ? { ...e, ...updated } : e)));

      // Update detail if open
      setDetailEnquiry((prev) => (prev && prev.enquiry_id === updated.enquiry_id ? { ...prev, ...updated } : prev));

      toast.success(`Enquiry #${updated.enquiry_id} assigned to user ID ${assignUserId}`, { className: "bg-amber-100 border-amber-300" });

      setIsAssignModalOpen(false);
      setAssignTargetEnquiry(null);
      setAssignUserId("");
      setAssignDueDate("");
      setAssignMessage("");
    } catch (err) {
      console.error("Assign error:", err);
      toast.error(err.message || "Failed to assign enquiry", { className: "bg-amber-100 border-amber-300" });
    }
  };

  const filteredEnquiries = useMemo(() => {
    if (!Array.isArray(enquiries)) return [];

    const lowerSearch = searchTerm.toLowerCase();
    const tagFilterLower = tagFilter.toLowerCase();

    return enquiries.filter((item) => {
      const matchesSearch = [
        "enquiry_id",
        "company_name",
        "contact_person",
        "mail_id",
        "phone_no",
        "items_required",
        "status",
        "application", // include search over application
      ].some((key) => String(item[key] || "").toLowerCase().includes(lowerSearch));

      const leadValue = (item.lead || item.priority || "lead").toLowerCase();
      const matchesLead = leadFilter === "all" || leadValue === leadFilter.toLowerCase();

      const matchesSource = sourceFilter === "all" || (item.source || "Website").toLowerCase() === sourceFilter.toLowerCase();

      const matchesTag =
        !tagFilterLower ||
        (Array.isArray(item.tags) && item.tags.some((t) => String(t || "").toLowerCase().includes(tagFilterLower)));

      return matchesSearch && matchesLead && matchesSource && matchesTag;
    });
  }, [enquiries, searchTerm, leadFilter, sourceFilter, tagFilter]);

  const sortedEnquiries = useMemo(() => {
    const sortableEnquiries = [...filteredEnquiries];
    if (sortConfig.key && sortConfig.key !== "actions") {
      sortableEnquiries.sort((a, b) => {
        // numeric-aware sort for enquiry_id like ENQ2025-001 or ENQ-100
        if (sortConfig.key === "enquiry_id") {
          const extractNumber = (val) => {
            if (!val) return 0;
            const digits = String(val).match(/\d+/g);
            if (!digits) return 0;
            // Join all numeric pieces to form one large number (works for most patterns)
            return parseInt(digits.join(""), 10) || 0;
          };
          const na = extractNumber(a.enquiry_id);
          const nb = extractNumber(b.enquiry_id);
          return sortConfig.direction === "ascending" ? na - nb : nb - na;
        }

        // fallback for dates: if both are ISO-like strings, compare time
        const maybeDateKeys = ["created_at", "due_date", "last_discussion", "next_interaction"];
        if (maybeDateKeys.includes(sortConfig.key)) {
          const da = a[sortConfig.key] ? new Date(a[sortConfig.key]).getTime() : 0;
          const db = b[sortConfig.key] ? new Date(b[sortConfig.key]).getTime() : 0;
          return sortConfig.direction === "ascending" ? da - db : db - da;
        }

        let aValue = a[sortConfig.key] ?? "";
        let bValue = b[sortConfig.key] ?? "";
        aValue = String(aValue).toLowerCase();
        bValue = String(bValue).toLowerCase();
        return sortConfig.direction === "ascending" ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
      });
    }
    return sortableEnquiries;
  }, [filteredEnquiries, sortConfig]);

  const lastAssignment = useMemo(
    () => detailActivities.filter((act) => act.activity_type === "assignment").slice(-1)[0] || null,
    [detailActivities]
  );

  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") {
        setActionsMenuState((prev) => ({ ...prev, isOpen: false }));
        setItemsModalOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  if (isLoading && !enquiries.length) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8 flex items-center justify-center">
        <div className="flex items-center gap-3 text-gray-600 text-xl">
          <svg className="animate-spin h-6 w-6 text-amber-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading Enquiries...
        </div>
      </div>
    );
  }

  if (error && !enquiries.length) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8 flex items-center justify-center">
        <div className="text-red-600 text-xl font-medium bg-red-100 px-6 py-3 rounded-lg shadow">{error}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-6 md:p-10">
      <h1 className="text-4xl md:text-5xl font-extrabold text-gray-800 mb-12 text-center tracking-tight drop-shadow-md animate-fade-in">
        Enquiries
      </h1>

      <div className="max-w-[95vw] mx-auto">
        {/* Top controls */}
        <div className="flex flex-col gap-4 mb-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-grow w-full group">
              <input
                type="text"
                placeholder="Search enquiries..."
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full p-4 pl-12 border border-gray-200 rounded-xl bg-white shadow-md focus:outline-none focus:ring-2 focus:ring-amber-300 text-lg transition-all duration-300 group-hover:shadow-lg group-hover:border-amber-300"
              />
              <svg className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 group-hover:text-amber-500 transition-colors duration-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>

            <button
              onClick={() => fetchEnquiries(true)}
              className="group relative px-6 py-3 bg-amber-400 text-gray-900 rounded-xl font-semibold shadow-md hover:shadow-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden"
              disabled={isLoading}
            >
              <span className="relative z-10 flex items-center gap-2">
                {isLoading ? (
                  <>
                    <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Refreshing...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5 group-hover:animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Refresh
                  </>
                )}
              </span>
              <span className="absolute inset-0 bg-amber-500 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left"></span>
            </button>

            <button onClick={handleCreate} className="group relative px-6 py-3 bg-green-500 text-white rounded-xl font-semibold shadow-md hover:shadow-xl transition-all duration-300 overflow-hidden">
              <span className="relative z-10 flex items-center gap-2">
                <svg className="w-5 h-5 group-hover:animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                </svg>
                Add Enquiry
              </span>
              <span className="absolute inset-0 bg-green-600 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-right"></span>
            </button>
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4">
            <select value={leadFilter} onChange={(e) => setLeadFilter(e.target.value)} className="px-4 py-2 rounded-xl border border-gray-200 bg-white shadow-sm focus:ring-2 focus:ring-amber-300 focus:outline-none">
              <option value="all">All Leads</option>
              <option value="hotlead">Hot Lead</option>
              <option value="followup">Follow-up</option>
              <option value="lead">Lead</option>
              <option value="not_interested">Not Interested</option>
              <option value="closed">Closed</option>
            </select>

            <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} className="px-4 py-2 rounded-xl border border-gray-200 bg-white shadow-sm focus:ring-2 focus:ring-amber-300 focus:outline-none">
              <option value="all">All Sources</option>
              <option value="Website">Website</option>
              <option value="Call">Call</option>
              <option value="Email">Email</option>
              <option value="Walk-in">Walk-in</option>
              <option value="Referral">Referral</option>
              <option value="Other">Other</option>
            </select>

            <input type="text" placeholder="Filter by tag..." value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} className="px-4 py-2 rounded-xl border border-gray-200 bg-white shadow-sm focus:ring-2 focus:ring-amber-300 focus:outline-none flex-1" />
          </div>
        </div>

        {/* Table */}
        <div className="bg-gradient-to-br from-white to-amber-50 rounded-3xl shadow-2xl overflow-x-auto border border-amber-100 animate-table-pop">
          <table className="w-full text-left border-collapse" ref={tableRef} tabIndex={0}>
            <thead>
              <tr className="bg-gradient-to-r from-amber-300 via-amber-200 to-amber-100 text-gray-800">
                {[
                  { label: "Enquiry ID", key: "enquiry_id" },
                  { label: "Company Name", key: "company_name" },
                  { label: "Items Required", key: "items_required" },
                  { label: "Lead Status", key: "lead" },
                  { label: "Source", key: "source" },
                  { label: "Application", key: "application" }, // <-- new column
                  { label: "Contact Person", key: "contact_person" },
                  { label: "Phone", key: "phone_no" },
                  { label: "Status", key: "status" },
                  { label: "Due Date", key: "due_date" },
                  { label: "Last Discussion", key: "last_discussion" },
                  { label: "Next Interaction", key: "next_interaction" },
                  { label: "Tags", key: "tags" },
                  { label: "Actions", key: "actions" },
                ].map(({ label, key }) => (
                  <th
                    key={key}
                    onClick={() => key !== "actions" && handleSort(key)}
                    className={`px-3 md:px-4 py-3 text-xs md:text-sm font-bold ${key !== "actions" ? "cursor-pointer hover:bg-amber-400" : ""} transition-all duration-300 whitespace-nowrap border-b border-amber-200 shadow-sm`}
                  >
                    <div className="flex justify-between items-center">
                      {label}
                      {key !== "actions" && (
                        <ArrowDownUp
                          size={16}
                          className={`ml-2 text-gray-700 ${sortConfig.key === key ? "text-amber-600 animate-pulse" : "opacity-60"} hover:text-amber-800 transition-colors duration-200`}
                        />
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-amber-100">
              {sortedEnquiries.map((enquiry, index) => {
                const stageOrStatus = (enquiry.stage || enquiry.status || "").toLowerCase();
                const isOverdue = enquiry.due_date && !["closed_won", "closed_lost", "regret", "closed", "cancelled"].includes(stageOrStatus) && new Date(enquiry.due_date) < new Date();

                const shortItems = enquiry.items_required && enquiry.items_required.length > 40 ? `${enquiry.items_required.slice(0, 40)}…` : enquiry.items_required || "N/A";

                const leadValue = enquiry.lead || enquiry.priority || "lead";

                return (
                  <tr
                    key={enquiry.enquiry_id}
                    className={`bg-white hover:bg-amber-50 transition-all duration-300 hover:shadow-md transform hover:-translate-y-1 ${isOverdue ? "border-l-4 border-red-400" : ""}`}
                    style={{ animation: `tableRowFade 0.4s ease-in ${index * 0.05}s both` }}
                    onDoubleClick={() => fetchEnquiryDetail(enquiry.enquiry_id)}
                  >
                    <td className="px-6 md:px-8 py-4 text-gray-700 font-semibold">{enquiry.enquiry_id}</td>
                    <td className="px-6 md:px-8 py-4 text-gray-600">{enquiry.company_name}</td>
                    <td className="px-6 md:px-8 py-4 text-gray-500 text-xs md:text-sm">
                      <div className="flex items-center gap-2">
                        <span className="line-clamp-1">{shortItems}</span>
                        {enquiry.items_required && enquiry.items_required.length > 40 && (
                          <button
                            type="button"
                            onClick={() => {
                              setItemsModalText(enquiry.items_required || "");
                              setItemsModalTitle(enquiry.company_name || `Enquiry #${enquiry.enquiry_id}`);
                              setItemsModalOpen(true);
                            }}
                            className="px-2 py-1 text-[11px] rounded-full border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 hover:border-amber-400 font-semibold"
                          >
                            View
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-6 md:px-8 py-4">
                      <span className={`inline-flex items-center px-3 py-1 text-xs font-semibold rounded-full border ${getLeadClasses(leadValue)}`}>{formatLeadLabel(leadValue)}</span>
                    </td>
                    <td className="px-6 md:px-8 py-4 text-gray-600">{enquiry.source || "Website"}</td>
                    <td className="px-6 md:px-8 py-4 text-gray-600">{enquiry.application || "N/A"}</td> {/* application column */}
                    <td className="px-6 md:px-8 py-4 text-gray-600">{enquiry.contact_person || "N/A"}</td>
                    <td className="px-6 md:px-8 py-4 text-gray-600">{enquiry.phone_no || "N/A"}</td>
                    <td className={`px-6 md:px-8 py-4 text-gray-600 font-semibold ${enquiry.status === "Closed" ? "text-green-600" : enquiry.status === "In Progress" ? "text-yellow-600" : enquiry.status === "Pending" ? "text-gray-600" : "text-red-600"}`}>
                      {enquiry.status}
                    </td>
                    <td className="px-6 md:px-8 py-4 text-gray-600">
                      {enquiry.due_date ? formatDate(enquiry.due_date) : "N/A"}
                      {isOverdue && <span className="ml-2 text-xs font-semibold text-red-600 bg-red-100 px-2 py-1 rounded-full">Overdue</span>}
                    </td>
                    <td className="px-6 md:px-8 py-4 text-gray-600">{enquiry.last_discussion ? formatDate(enquiry.last_discussion) : "N/A"}</td>
                    <td className="px-6 md:px-8 py-4 text-gray-600">{enquiry.next_interaction ? formatDate(enquiry.next_interaction) : "N/A"}</td>
                    <td className="px-6 md:px-8 py-4 text-gray-600">
                      {Array.isArray(enquiry.tags) && enquiry.tags.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {enquiry.tags.map((tag) => (
                            <span key={tag} className="px-2 py-0.5 text-xs bg-amber-100 text-amber-700 rounded-full border border-amber-300">
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-400 text-sm">No tags</span>
                      )}
                    </td>

                    {/* ACTIONS BUTTON (opens global popup) */}
                    <td className="px-6 md:px-8 py-4 text-gray-600">
                      <button
                        onClick={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          setActionsMenuState({
                            isOpen: true,
                            enquiry,
                            x: rect.left + rect.width / 2,
                            y: rect.bottom + 4,
                          });
                        }}
                        className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-gray-100 hover:bg-amber-100 border border-gray-200 hover:border-amber-300 shadow-sm hover:shadow-md transition-all duration-200"
                      >
                        <MoreVertical size={18} className="text-gray-700" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {sortedEnquiries.length === 0 && (
            <div className="text-center py-12 text-gray-500 text-lg font-medium animate-pulse bg-amber-50 rounded-b-3xl">No enquiries found matching your search.</div>
          )}
        </div>

        {/* Global ACTIONS POPUP (portal-style, not clipped by table) */}
        {actionsMenuState.isOpen && actionsMenuState.enquiry && (
          <div className="fixed inset-0 z-50" onClick={() => setActionsMenuState((prev) => ({ ...prev, isOpen: false }))}>
            <div
              className="absolute z-50 w-48 bg-white border border-gray-200 rounded-xl shadow-2xl py-1 pointer-events-auto"
              style={{
                left: actionsMenuState.x,
                top: actionsMenuState.y,
                transform: "translateX(-50%)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <button onClick={() => { setActionsMenuState((prev) => ({ ...prev, isOpen: false })); handleEdit(actionsMenuState.enquiry); }} className="w-full text-left px-4 py-2 text-sm hover:bg-amber-50 flex items-center gap-2">✏️ Edit</button>
              <button onClick={() => { setActionsMenuState((prev) => ({ ...prev, isOpen: false })); fetchEnquiryDetail(actionsMenuState.enquiry.enquiry_id); }} className="w-full text-left px-4 py-2 text-sm hover:bg-amber-50 flex items-center gap-2">👁️ View</button>
              <button onClick={() => { setActionsMenuState((prev) => ({ ...prev, isOpen: false })); openAssignModal(actionsMenuState.enquiry); }} className="w-full text-left px-4 py-2 text-sm hover:bg-amber-50 flex items-center gap-2">📌 Assign</button>
              <button onClick={() => { setActionsMenuState((prev) => ({ ...prev, isOpen: false })); toggleFollow(actionsMenuState.enquiry.enquiry_id); }} className="w-full text-left px-4 py-2 text-sm hover:bg-amber-50 flex items-center gap-2">
                {followed.has(actionsMenuState.enquiry.enquiry_id) ? "⭐ Unfollow" : "⭐ Follow"}
              </button>
              <button onClick={() => { setActionsMenuState((prev) => ({ ...prev, isOpen: false })); handleDelete(actionsMenuState.enquiry.enquiry_id); }} className="w-full text-left px-4 py-2 text-sm hover:bg-red-50 text-red-600 flex items-center gap-2 border-t border-gray-100">🗑️ Delete</button>
            </div>
          </div>
        )}

        {/* Pagination */}
        <div className="flex justify-between mt-6 items-center">
          <button onClick={() => setPage((prev) => Math.max(prev - 1, 0))} disabled={page === 0 || isLoading} className="px-5 py-2 bg-amber-400 text-gray-900 rounded-full font-semibold shadow-md hover:bg-amber-500 hover:shadow-lg disabled:opacity-50 transition-all duration-300">Previous</button>
          <span className="text-gray-700 font-medium text-lg">Page <span className="text-amber-600">{page + 1}</span> of {Math.ceil(total / limit)}</span>
          <button onClick={() => setPage((prev) => prev + 1)} disabled={(page + 1) * limit >= total || isLoading} className="px-5 py-2 bg-amber-400 text-gray-900 rounded-full font-semibold shadow-md hover:bg-amber-500 hover:shadow-lg disabled:opacity-50 transition-all duration-300">Next</button>
        </div>

        {/* CREATE / EDIT MODAL */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 bg-gray-800 bg-opacity-60 flex items-center justify-center transition-opacity duration-500">
            <div className="bg-gradient-to-br from-white to-amber-50 p-8 rounded-3xl shadow-2xl w-full max-w-md transform transition-all duration-300 animate-form-pop max-h-[90vh] overflow-y-auto relative">
              <button onClick={() => setIsModalOpen(false)} className="absolute top-4 right-4 p-2 bg-red-500 text-white rounded-full hover:bg-red-600 transition-all duration-300 shadow-md hover:shadow-lg transform hover:rotate-90"><X size={20} /></button>
              <h2 className="text-3xl font-extrabold text-gray-800 mb-6 text-center bg-gradient-to-r from-amber-400 to-green-500 bg-clip-text text-transparent">
                {isEditing ? `Edit Enquiry #${selectedEnquiry?.enquiry_id}` : "Add New Enquiry"}
              </h2>
              <form onSubmit={handleSubmit}>
                {[
                  { label: "Enquiry ID (Optional)", key: "enquiry_id", required: false, icon: "M3 12h18M3 6h18M3 18h18" },
                  { label: "Company Name", key: "company_name", required: true, icon: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" },
                  { label: "Contact Person", key: "contact_person", icon: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" },
                  { label: "Email", key: "mail_id", type: "email", icon: "M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" },
                  { label: "Phone", key: "phone_no", icon: "M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" },
                  { label: "Items Required", key: "items_required", type: "textarea", icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" },
                  { label: "Status", key: "status", type: "select", icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z", options: ["Pending", "In Progress", "Closed", "Cancelled"] },
                  { label: "Lead Status", key: "lead", type: "select", icon: "M12 8c-1.657 0-3 1.343-3 3 0 .795.312 1.515.82 2.05L9 17l3-1 3 1-1-3.95A2.99 2.99 0 0015 11c0-1.657-1.343-3-3-3z", options: ["hotlead", "followup", "lead", "not_interested", "closed"] },
                  { label: "Source", key: "source", type: "select", icon: "M3 7l9-4 9 4-9 4-9-4zm0 6l9 4 9-4", options: ["Website", "Call", "Email", "Walk-in", "Referral", "Other"] },
                  { label: "Application", key: "application", icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" }, // new application field
                  { label: "Tags (comma separated)", key: "tagsInput", icon: "M7 7h10M7 12h8m-8 5h6" },
                  { label: "Due Date", key: "due_date", type: "date", icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" },
                  { label: "Last Discussion", key: "last_discussion", type: "date", icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" },
                  { label: "Next Interaction", key: "next_interaction", type: "date", icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" },
                ].map(({ label, key, type = "text", required, icon, options }) => (
                  <div key={key} className="mb-5 relative group">
                    <label className="block text-gray-700 font-semibold mb-2 text-lg tracking-wide">{label}</label>
                    <div className="relative">
                      <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-amber-400 group-hover:text-amber-500 transition-colors duration-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={icon} />
                      </svg>
                      {type === "textarea" ? (
                        <textarea value={newEnquiry[key]} onChange={(e) => setNewEnquiry((prev) => ({ ...prev, [key]: e.target.value }))} className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl bg-white text-gray-800 focus:outline-none focus:ring-4 focus:ring-amber-200 focus:border-amber-400 shadow-md hover:shadow-lg transition-all duration-300 placeholder-gray-400" placeholder={`Enter ${label.toLowerCase()}`} rows={4} />
                      ) : type === "select" ? (
                        <select value={newEnquiry[key]} onChange={(e) => setNewEnquiry((prev) => ({ ...prev, [key]: e.target.value }))} className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl bg-white text-gray-800 focus:outline-none focus:ring-4 focus:ring-amber-200 focus:border-amber-400 shadow-md hover:shadow-lg transition-all duration-300">
                          {options.map((option) => (
                            <option key={option} value={option}>
                              {key === "lead" ? formatLeadLabel(option) : option}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input type={type} value={newEnquiry[key]} onChange={(e) => setNewEnquiry((prev) => ({ ...prev, [key]: e.target.value }))} className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl bg-white text-gray-800 focus:outline-none focus:ring-4 focus:ring-amber-200 focus:border-amber-400 shadow-md hover:shadow-lg transition-all duration-300 placeholder-gray-400" required={required} placeholder={`Enter ${label.toLowerCase()}`} />
                      )}
                    </div>
                    {errors[key] && <p className="text-sm text-red-500 mt-1 animate-fade-in font-medium">{errors[key]}</p>}
                  </div>
                ))}
                <div className="flex justify-end gap-4">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="relative px-6 py-3 bg-gradient-to-r from-gray-300 to-gray-400 text-gray-800 rounded-xl font-semibold shadow-md hover:shadow-xl transition-all duration-300 overflow-hidden group hover:from-gray-400 hover:to-gray-500 transform hover:scale-105">
                    <span className="relative z-10">Cancel</span>
                  </button>
                  <button type="submit" className="relative px-6 py-3 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-xl font-semibold shadow-md hover:shadow-xl transition-all duration-300 overflow-hidden group hover:from-green-600 hover:to-green-700 transform hover:scale-105">
                    <span className="relative z-10 flex items-center gap-2">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                      </svg>
                      {isEditing ? "Update Enquiry" : "Add Enquiry"}
                    </span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ASSIGN MODAL */}
        {isAssignModalOpen && assignTargetEnquiry && (
          <div className="fixed inset-0 z-50 bg-gray-800 bg-opacity-60 flex items-center justify-center">
            <div className="bg-white p-6 rounded-2xl shadow-2xl w-full max-w-sm relative">
              <button onClick={() => { setIsAssignModalOpen(false); setAssignTargetEnquiry(null); }} className="absolute top-3 right-3 p-2 rounded-full bg-gray-200 hover:bg-gray-300"><X size={18} /></button>
              <h2 className="text-lg font-bold text-gray-800 mb-4">Assign Enquiry #{assignTargetEnquiry.enquiry_id}</h2>
              <form onSubmit={handleAssignSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Assignee</label>
                  <select value={assignUserId} onChange={(e) => setAssignUserId(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" required>
                    <option value="">Select user...</option>
                    <option value="1">1: Admin</option>
                    <option value="7">7: Sales</option>
                    <option value="8">8: Design</option>
                  </select>
                  <p className="text-[11px] text-gray-400 mt-1">Later this can be replaced with a dynamic users dropdown.</p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Due Date (optional)</label>
                  <input type="date" value={assignDueDate} onChange={(e) => setAssignDueDate(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Message (optional)</label>
                  <textarea rows={3} value={assignMessage} onChange={(e) => setAssignMessage(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" placeholder="e.g. Please review design and revert." />
                </div>

                <div className="flex justify-end gap-3">
                  <button type="button" onClick={() => { setIsAssignModalOpen(false); setAssignTargetEnquiry(null); }} className="px-4 py-2 rounded-lg bg-gray-200 text-gray-700 text-sm font-semibold hover:bg-gray-300">Cancel</button>
                  <button type="submit" className="px-4 py-2 rounded-lg bg-indigo-500 text-white text-sm font-semibold hover:bg-indigo-600">Assign</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* DETAIL DRAWER */}
        {isDetailOpen && (
          <div className="fixed inset-0 z-40 flex justify-end bg-black bg-opacity-40">
            <div className="w-full sm:w-[420px] md:w-[460px] bg-gradient-to-b from-white via-amber-50 to-white h-full shadow-2xl p-6 overflow-y-auto relative border-l border-amber-100">
              <button onClick={() => setIsDetailOpen(false)} className="absolute top-4 right-4 p-2 rounded-full bg-gray-200 hover:bg-gray-300"><X size={18} /></button>
              {detailLoading || !detailEnquiry ? (
                <div className="flex justify-center items-center h-full text-gray-500">Loading enquiry details...</div>
              ) : (
                <>
                  {/* Header */}
                  <div className="mb-4 border-b pb-4 flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold tracking-wide text-gray-400 uppercase">Enquiry</span>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] bg-gray-100 text-gray-600 border border-gray-200">#{detailEnquiry.enquiry_id}</span>
                      </div>
                      <h2 className="text-xl font-extrabold text-gray-800">{detailEnquiry.company_name}</h2>
                      <p className="text-xs text-gray-500 mt-1">Contact: {detailEnquiry.contact_person || "Not specified"} • Phone: {detailEnquiry.phone_no || "Not specified"}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className={`px-3 py-1 rounded-full text-[11px] font-semibold border ${getLeadClasses(detailEnquiry.lead || detailEnquiry.priority)}`}>{formatLeadLabel(detailEnquiry.lead || detailEnquiry.priority)}</span>
                      <span className="text-[11px] text-gray-500">Source: {detailEnquiry.source || "Website"}</span>
                      <span className="text-[11px] text-gray-500">Application: {detailEnquiry.application || "N/A"}</span>
                    </div>
                  </div>

                  {/* Key summary cards */}
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="rounded-2xl border border-amber-100 bg-white/70 px-3 py-2 shadow-sm">
                      <p className="text-[11px] text-gray-400 uppercase tracking-wide">Stage</p>
                      <p className="text-sm font-semibold text-gray-800">{(detailEnquiry.stage || "N/A").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</p>
                      <p className="text-[11px] text-gray-500 mt-1">Assigned to: <span className="font-medium">{detailEnquiry.assigned_to_name || "Not assigned"}</span></p>
                    </div>
                    <div className="rounded-2xl border border-amber-100 bg-white/70 px-3 py-2 shadow-sm">
                      <p className="text-[11px] text-gray-400 uppercase tracking-wide">Status & Due</p>
                      <p className="text-sm font-semibold text-gray-800">{detailEnquiry.status}</p>
                      <p className="text-[11px] text-gray-500 mt-1">Due: {detailEnquiry.due_date ? formatDate(detailEnquiry.due_date) : "Not set"}</p>
                    </div>
                  </div>

                  {/* Items Required */}
                  <div className="mb-4 rounded-2xl border border-amber-100 bg-white/80 px-3 py-3 shadow-sm">
                    <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Items Required</h3>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{detailEnquiry.items_required || "No items specified."}</p>
                  </div>

                  {/* Tags */}
                  <div className="mb-4">
                    <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Tags</h3>
                    {Array.isArray(detailEnquiry.tags) && detailEnquiry.tags.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {detailEnquiry.tags.map((tag) => (
                          <span key={tag} className="px-2 py-0.5 text-xs bg-amber-100 text-amber-700 rounded-full border border-amber-300">
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400">No tags added.</p>
                    )}
                  </div>

                  {/* Last assignment highlight */}
                  {lastAssignment && (
                    <div className="mb-4 rounded-2xl border border-indigo-100 bg-indigo-50/80 px-3 py-3 shadow-sm">
                      <h3 className="text-xs font-semibold text-indigo-700 uppercase tracking-wide mb-1">Latest Assignment</h3>
                      <p className="text-xs text-gray-600 mb-1"><span className="font-semibold">{lastAssignment.user_name || "System"}</span> • {formatDate(lastAssignment.created_at)}</p>
                      <p className="text-sm text-gray-800 whitespace-pre-wrap">{lastAssignment.message}</p>
                    </div>
                  )}

                  {/* Activity timeline */}
                  <div className="mt-4 mb-3 border-t pt-3">
                    <h3 className="text-sm font-semibold text-gray-800 mb-2">Activity Timeline</h3>
                    <div className="space-y-3">
                      {detailActivities.length === 0 && <p className="text-xs text-gray-400">No activity yet.</p>}
                      {detailActivities.map((act) => {
                        const isAssignment = act.activity_type === "assignment";
                        const isSystem = act.user_name === "System";
                        return (
                          <div key={act.activity_id} className={`p-2 rounded-xl border text-xs ${isAssignment ? "bg-indigo-50 border-indigo-100" : "bg-gray-50 border-gray-100"}`}>
                            <div className="flex justify-between items-center mb-1">
                              <span className="font-semibold text-gray-700 flex items-center gap-1">
                                {isAssignment && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] bg-indigo-100 text-indigo-700">ASSIGNMENT</span>}
                                {isSystem ? "System" : act.user_name}
                              </span>
                              <span className="text-[10px] text-gray-400 flex items-center gap-1">
                                {formatDate(act.created_at)}{" "}
                                {act.read_by_me || (act.read_receipts && act.read_receipts.length > 0) ? (
                                  <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-green-500 text-white text-[9px]">✓</span>
                                ) : (
                                  <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-gray-200 text-gray-500 text-[9px]">✓</span>
                                )}
                              </span>
                            </div>
                            <p className="text-gray-700 whitespace-pre-wrap">{act.message}</p>
                            {act.expected_by && <p className="text-[10px] text-gray-500 mt-1">Expected by: {formatDate(act.expected_by)}</p>}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Comment composer */}
                  <div className="mt-4 border-t pt-3">
                    <h3 className="text-sm font-semibold text-gray-800 mb-2">Add Comment</h3>

                    {/* Auto text buttons for YES / NO */}
                    <div className="flex flex-wrap gap-2 mb-2">
                      <button type="button" onClick={() => {
                        const name = detailEnquiry.company_name || "Sir/Madam";
                        const text = `Dear ${name},

Thank you for your positive response and confirmation to proceed with the order.

We will now move ahead with the necessary formalities and internal approvals. Our team will:
• Freeze the technical and commercial scope as per the latest discussion
• Share the final order confirmation / PO details for your records
• Coordinate with you on timelines, documentation and dispatch schedule

If you would like any changes in the terms, delivery schedule or documentation, please let us know and we will be happy to accommodate the same wherever possible.

Thank you once again for choosing us. We look forward to a successful execution of this order and a long-term association.

Warm regards,
[Your Name]
[Your Company]`;
                        setCommentText(text);
                      }} className="px-3 py-1.5 text-[11px] rounded-full border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 font-semibold">✅ Order Confirmation (Yes)</button>

                      <button type="button" onClick={() => {
                        const name = detailEnquiry.company_name || "Sir/Madam";
                        const text = `Dear ${name},

Thank you very much for considering us and for the time you have spent discussing this enquiry with our team.

After reviewing the current requirements and priorities, we understand that you will not be proceeding further with this order at the moment. We completely respect your decision and are grateful for the opportunity to quote and interact with you.

If your requirements change in the future, or if there is any support we can extend (technical clarification, revised proposal, alternative solutions, etc.), please feel free to reach out to us anytime. We would be glad to re-evaluate and assist you.

Thank you once again for your time and consideration. We hope to work with you in the future.

Warm regards,
[Your Name]
[Your Company]`;
                        setCommentText(text);
                      }} className="px-3 py-1.5 text-[11px] rounded-full border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 font-semibold">❌ Regret / Not Proceeding (No)</button>
                    </div>

                    <div className="mb-2">
                      <select value={selectedTemplateId} onChange={(e) => {
                        const id = e.target.value;
                        setSelectedTemplateId(id);
                        const tmpl = commentTemplates.find((t) => String(t.id) === id);
                        if (tmpl) setCommentText(tmpl.content);
                      }} className="w-full mb-2 px-3 py-2 rounded-lg border border-gray-200 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-amber-300">
                        <option value="">Choose a template...</option>
                        {commentTemplates.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                      </select>
                      <textarea rows={4} value={commentText} onChange={(e) => setCommentText(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-amber-300" placeholder="Write a comment, use @mentions if needed..." />
                    </div>
                    <div className="flex justify-end">
                      <button onClick={async () => {
                        if (!commentText.trim()) {
                          toast.error("Comment message is required");
                          return;
                        }
                        try {
                          const token = localStorage.getItem("token");
                          const res = await fetch(`${API_URL}/${detailEnquiry.enquiry_id}/comment`, {
                            method: "POST",
                            headers: {
                              Authorization: `Bearer ${token}`,
                              "Content-Type": "application/json",
                            },
                            body: JSON.stringify({ message: commentText.trim(), mentions: [], expected_by: null, is_internal: false }),
                          });
                          if (!res.ok) {
                            const txt = await res.text();
                            throw new Error(txt || "Failed to add comment");
                          }
                          const activity = await res.json();
                          setDetailActivities((prev) => [...prev, activity]);
                          setCommentText("");
                          setSelectedTemplateId("");
                          toast.success("Comment added");
                        } catch (err) {
                          console.error("Add comment error:", err);
                          toast.error(err.message || "Failed to add comment");
                        }
                      }} className="px-4 py-2 bg-amber-500 text-white rounded-lg text-xs font-semibold hover:bg-amber-600">Post Comment</button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ITEMS REQUIRED FULL VIEW MODAL */}
      {itemsModalOpen && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-40 flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden relative">
            <button onClick={() => setItemsModalOpen(false)} className="absolute top-3 right-3 p-2 rounded-full bg-gray-200 hover:bg-gray-300"><X size={18} /></button>
            <div className="px-5 pt-5 pb-3 border-b border-gray-200">
              <h3 className="text-lg font-bold text-gray-800">Items Required</h3>
              {itemsModalTitle && <p className="text-xs text-gray-500 mt-1">{itemsModalTitle}</p>}
            </div>
            <div className="p-5 overflow-y-auto">
              <pre className="whitespace-pre-wrap text-sm text-gray-800">{itemsModalText || "No items specified."}</pre>
            </div>
            <div className="px-5 pb-4 flex justify-end">
              <button type="button" onClick={() => setItemsModalOpen(false)} className="px-4 py-2 rounded-lg bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600">Close</button>
            </div>
          </div>
        </div>
      )}

      <ToastContainer position="top-right" autoClose={3000} />
    </div>
  );
}

export default SalesEnquiryPage;
