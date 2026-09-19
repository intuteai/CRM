import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import { ArrowDownUp, X, MoreVertical } from "lucide-react";
import io from "socket.io-client";
import { useNotify } from '../../hooks/useNotify';
import ConnectionError from '../pages/ConnectionError.jsx';

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
      return "bg-gold-400/25 text-gold-600 border-gold-400";
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
  // const hasFetched = useRef(false);
  const isFetching = useRef(false);

  // Assign modal state
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [assignTargetEnquiry, setAssignTargetEnquiry] = useState(null);
  const [assignUserId, setAssignUserId] = useState("");
  const [assignDueDate, setAssignDueDate] = useState("");
  const [assignMessage, setAssignMessage] = useState("");
  const { notifySuccess, notifyError, notifyInfo } = useNotify();

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
    [providedSocket],
  );

  // const fetchEnquiries = useCallback(
  //   async (forceRefresh = false) => {
  //     if (isFetching.current) return;

  //     isFetching.current = true;
  //     setIsLoading(true);
  //     setError(null);

  //     try {
  //       const token = localStorage.getItem("token");
  //       const offset = page * limit;
  //       const url = `${API_URL}?limit=${limit}&offset=${offset}${
  //         forceRefresh ? "&force_refresh=true" : ""
  //       }`;

  //       const response = await fetch(url, {
  //         headers: {
  //           Authorization: `Bearer ${token}`,
  //           "Content-Type": "application/json",
  //         },
  //       });

  //       if (!response.ok) {
  //         const errorText = await response.text();
  //         throw new Error(
  //           errorText || `Server responded with status: ${response.status}`
  //         );
  //       }

  //       const responseData = await response.json();

  //       if (!responseData.data || !Array.isArray(responseData.data)) {
  //         throw new Error("Invalid data format");
  //       }

  //       setEnquiries(responseData.data);
  //       setTotal(responseData.total || 0);
  //       setError(null);
  //     } catch (err) {
  //       console.error("Error fetching enquiries:", err);
  //       const errorMessage =
  //         err.message || "Network error. Please try again later.";
  //       setError(errorMessage);
  //       notifyError(errorMessage, { autoClose: 3000 });
  //     } finally {
  //       setIsLoading(false);
  //       isFetching.current = false;
  //     }
  //   },
  //   [page]
  // );

  // Fetch detail + activities + templates
  // Helper: sort newest enquiries first (by created_at, fallback to enquiry_id)
const sortNewestFirst = (arr) => {
  return arr.slice().sort((a, b) => {
    const aCreated = a.created_at ? new Date(a.created_at).getTime() : null;
    const bCreated = b.created_at ? new Date(b.created_at).getTime() : null;

    if (aCreated && bCreated) return bCreated - aCreated;
    if (aCreated && !bCreated) return -1;
    if (!aCreated && bCreated) return 1;

    // fallback: sort by enquiry_id string descending
    const aId = String(a.enquiry_id || "");
    const bId = String(b.enquiry_id || "");
    return bId.localeCompare(aId);
  });
};

  const fetchEnquiries = useCallback(
    async (forceRefresh = false, overridePage, overrideSearchTerm) => {
      if (isFetching.current) return;

      isFetching.current = true;
      setIsLoading(true);
      setError(null);

      try {
        const token = localStorage.getItem("token");

        const currentPage = overridePage ?? page;
        const currentSearch = overrideSearchTerm ?? searchTerm;

        const offset = currentPage * limit;

        const params = new URLSearchParams({
          limit: String(limit),
          offset: String(offset),
        });

        if (forceRefresh) params.append("force_refresh", "true");
        if (currentSearch.trim()) params.append("search", currentSearch.trim());

        const url = `${API_URL}?${params.toString()}`;

        const response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
          const errorBody = await response.json().catch(() => ({}));
          throw new Error(
            errorBody.error || `Server responded with status: ${response.status}`,
          );
        }

        const responseData = await response.json();

        if (!responseData.data || !Array.isArray(responseData.data)) {
          throw new Error("Invalid data format");
        }

        const sorted = sortNewestFirst(responseData.data);

        setEnquiries(sorted);
        setTotal(responseData.total || 0);
        setError(null);
      } catch (err) {
        console.error("Error fetching enquiries:", err);
        const errorMessage =
          err.message || "Network error. Please try again later.";
        setError(errorMessage);
        notifyError(errorMessage, { autoClose: 3000 });
      } finally {
        setIsLoading(false);
        isFetching.current = false;
      }
    },
    [page, searchTerm],
  );

  // Fetch whenever page or searchTerm change (including first load)
useEffect(() => {
  fetchEnquiries(false);
}, [page, searchTerm, fetchEnquiries]);


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
        const errorBody = await enqRes.json().catch(() => ({}));
        throw new Error(errorBody.error || `Failed to load enquiry: ${enqRes.status}`);
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
        }).catch(() => {}),
      );
      Promise.all(markPromises);
    } catch (err) {
      console.error("Error fetching enquiry detail:", err);
      notifyError(err.message || "Failed to load enquiry detail");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
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
          notifyInfo(`Enquiry #${enquiry_id} deleted`, {
            className: "bg-gold-400/20 border-gold-400/50",
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
          notifyInfo(`New enquiry #${enquiry_id} added`, {
            className: "bg-gold-400/20 border-gold-400/50",
          });
          return [baseData, ...prev];
        }

        const existing = prev[idx];
        const updated = { ...existing, ...baseData };

        if (JSON.stringify(existing) === JSON.stringify(updated)) return prev;

        const copy = [...prev];
        copy[idx] = updated;
        notifyInfo(`Enquiry #${enquiry_id} updated`, {
          className: "bg-gold-400/20 border-gold-400/50",
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
  }, [socket, providedSocket, detailEnquiry]);

  const handleSort = useCallback((key) => {
    setSortConfig((prev) => ({
      key,
      direction:
        prev.key === key && prev.direction === "ascending"
          ? "descending"
          : "ascending",
    }));
  }, []);

  const validateForm = () => {
    const newErrors = {};
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phoneRegex = /^[0-9]{10}$/;

    if (newEnquiry.enquiry_id && newEnquiry.enquiry_id.length < 3)
      newErrors.enquiry_id =
        "Enquiry ID must be at least 3 characters if provided";
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
      last_discussion: enquiry.last_discussion
        ? new Date(enquiry.last_discussion).toISOString().split("T")[0]
        : "",
      next_interaction: enquiry.next_interaction
        ? new Date(enquiry.next_interaction).toISOString().split("T")[0]
        : "",
      lead: effectiveLead,
      source: enquiry.source || "Website",
      application: enquiry.application || "",
      tagsInput: Array.isArray(enquiry.tags) ? enquiry.tags.join(", ") : "",
      due_date: enquiry.due_date
        ? new Date(enquiry.due_date).toISOString().split("T")[0]
        : "",
    });
    setErrors({});
    setIsModalOpen(true);
  }, []);

  const handleDelete = useCallback(
    async (enquiryId) => {
      if (
        !window.confirm(
          `Are you sure you want to delete enquiry #${enquiryId}?`,
        )
      )
        return;

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
          const errorBody = await response.json().catch(() => ({}));
          throw new Error(
            errorBody.error || `Delete failed with status: ${response.status}`,
          );
        }

        notifySuccess(`Enquiry #${enquiryId} deleted successfully!`, {
          className: "bg-gold-400/20 border-gold-400/50",
        });

        setTimeout(() => {
          fetchEnquiries(true);
        }, 800);
      } catch (err) {
        console.error("Delete error:", err);
        const errorMessage = err.message || "Failed to delete enquiry";
        notifyError(errorMessage, {
          className: "bg-gold-400/20 border-gold-400/50",
        });
      }
    },
    [fetchEnquiries],
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) {
      notifyError("Please fix the form errors", {
        className: "bg-gold-400/20 border-gold-400/50",
      });
      return;
    }
    try {
      const token = localStorage.getItem("token");
      const url = isEditing
        ? `${API_URL}/${selectedEnquiry.enquiry_id}`
        : API_URL;
      const method = isEditing ? "PUT" : "POST";

      const tagsArray = newEnquiry.tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

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
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(
          errorBody.error ||
            `${isEditing ? "Update" : "Create"} failed with status: ${response.status}`,
        );
      }

      const updatedEnquiry = await response.json();
      if (isEditing) {
        setEnquiries((prev) =>
          prev.map((e) =>
            e.enquiry_id === updatedEnquiry.enquiry_id ? updatedEnquiry : e,
          ),
        );
        notifySuccess(
          `Enquiry #${updatedEnquiry.enquiry_id} updated successfully!`,
          {
            className: "bg-gold-400/20 border-gold-400/50",
          },
        );
      } else {
        setEnquiries((prev) => [updatedEnquiry, ...prev]);
        notifySuccess(
          `Enquiry #${updatedEnquiry.enquiry_id} created successfully!`,
          {
            className: "bg-gold-400/20 border-gold-400/50",
          },
        );
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
      notifyError(errorMessage, {
        className: "bg-gold-400/20 border-gold-400/50",
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
        const errorBody = await res.json().catch(() => ({}));
        throw new Error(errorBody.error || "Failed to update follow state");
      }

      setFollowed((prev) => {
        const next = new Set(prev);
        if (isCurrentlyFollowed) next.delete(enquiryId);
        else next.add(enquiryId);
        return next;
      });

      notifySuccess(
        isCurrentlyFollowed
          ? `Unfollowed enquiry #${enquiryId}`
          : `Following enquiry #${enquiryId}`,
        { className: "bg-gold-400/20 border-gold-400/50" },
      );
    } catch (err) {
      console.error("Follow toggle error:", err);
      notifyError(err.message || "Failed to update follow state");
    }
  };

  // OPEN ASSIGN MODAL
  const openAssignModal = (enquiry) => {
    setAssignTargetEnquiry(enquiry);
    setAssignUserId("");
    setAssignDueDate(
      enquiry.due_date
        ? new Date(enquiry.due_date).toISOString().split("T")[0]
        : "",
    );
    setAssignMessage("");
    setIsAssignModalOpen(true);
  };

  // SUBMIT ASSIGN
  const handleAssignSubmit = async (e) => {
    e.preventDefault();
    if (!assignTargetEnquiry) {
      notifyError("No enquiry selected for assignment");
      return;
    }
    if (!assignUserId) {
      notifyError("Assignee user ID is required");
      return;
    }

    try {
      const token = localStorage.getItem("token");
      const res = await fetch(
        `${API_URL}/${assignTargetEnquiry.enquiry_id}/assign`,
        {
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
        },
      );

      if (!res.ok) {
        const errorBody = await res.json().catch(() => ({}));
        throw new Error(errorBody.error || "Failed to assign enquiry");
      }

      const updated = await res.json();

      // Update list locally
      setEnquiries((prev) =>
        prev.map((e) =>
          e.enquiry_id === updated.enquiry_id ? { ...e, ...updated } : e,
        ),
      );

      // Update detail if open
      setDetailEnquiry((prev) =>
        prev && prev.enquiry_id === updated.enquiry_id
          ? { ...prev, ...updated }
          : prev,
      );

      notifySuccess(
        `Enquiry #${updated.enquiry_id} assigned to user ID ${assignUserId}`,
        { className: "bg-gold-400/20 border-gold-400/50" },
      );

      setIsAssignModalOpen(false);
      setAssignTargetEnquiry(null);
      setAssignUserId("");
      setAssignDueDate("");
      setAssignMessage("");
    } catch (err) {
      console.error("Assign error:", err);
      notifyError(err.message || "Failed to assign enquiry", {
        className: "bg-gold-400/20 border-gold-400/50",
      });
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
      ].some((key) =>
        String(item[key] || "")
          .toLowerCase()
          .includes(lowerSearch),
      );

      const leadValue = (item.lead || item.priority || "lead").toLowerCase();
      const matchesLead =
        leadFilter === "all" || leadValue === leadFilter.toLowerCase();

      const matchesSource =
        sourceFilter === "all" ||
        (item.source || "Website").toLowerCase() === sourceFilter.toLowerCase();

      const matchesTag =
        !tagFilterLower ||
        (Array.isArray(item.tags) &&
          item.tags.some((t) =>
            String(t || "")
              .toLowerCase()
              .includes(tagFilterLower),
          ));

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
        const maybeDateKeys = [
          "created_at",
          "due_date",
          "last_discussion",
          "next_interaction",
        ];
        if (maybeDateKeys.includes(sortConfig.key)) {
          const da = a[sortConfig.key]
            ? new Date(a[sortConfig.key]).getTime()
            : 0;
          const db = b[sortConfig.key]
            ? new Date(b[sortConfig.key]).getTime()
            : 0;
          return sortConfig.direction === "ascending" ? da - db : db - da;
        }

        let aValue = a[sortConfig.key] ?? "";
        let bValue = b[sortConfig.key] ?? "";
        aValue = String(aValue).toLowerCase();
        bValue = String(bValue).toLowerCase();
        return sortConfig.direction === "ascending"
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      });
    }
    return sortableEnquiries;
  }, [filteredEnquiries, sortConfig]);

  const lastAssignment = useMemo(
    () =>
      detailActivities
        .filter((act) => act.activity_type === "assignment")
        .slice(-1)[0] || null,
    [detailActivities],
  );

  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") {
        setActionsMenuState((prev) => ({ ...prev, isOpen: false }));
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  if (isLoading && !enquiries.length) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex items-center gap-3 text-gray-500 text-lg">
          <svg
            className="animate-spin h-6 w-6 text-gold-500"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          Loading Enquiries...
        </div>
      </div>
    );
  }

  if (error && !enquiries.length) return <ConnectionError onRetry={() => fetchEnquiries(true)} />;

  return (
    <div className="max-w-7xl mx-auto">
      <div>
        {/* Top controls */}
        <div className="flex flex-col gap-4 mb-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-grow w-full group">
              <input
                type="text"
                placeholder="Search enquiries..."
                value={searchTerm}
                onChange={(e) => {
                  const value = e.target.value;
                  setSearchTerm(value);
                  setPage(0); // always go back to first page on new search
                }}
                className="w-full p-3 pl-11 border border-navy-100 rounded-lg bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-gold-400 transition-colors"
              />
              <svg
                className="absolute left-4 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>

            <button
              onClick={() => fetchEnquiries(true)}
              className="flex items-center justify-center gap-2 whitespace-nowrap px-5 py-3 bg-navy-800 text-white rounded-lg font-medium hover:bg-navy-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isLoading}
            >
              <span className="relative z-10 flex items-center gap-2">
                {isLoading ? (
                  <>
                    <svg
                      className="animate-spin h-5 w-5"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    Refreshing...
                  </>
                ) : (
                  <>
                    <svg
                      className="w-5 h-5 "
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                      />
                    </svg>
                    Refresh
                  </>
                )}
              </span>
            </button>

            <button
              onClick={handleCreate}
              className="flex items-center justify-center gap-2 whitespace-nowrap px-5 py-3 bg-gold-500 text-navy-900 rounded-lg font-semibold hover:bg-gold-400 transition-colors"
            >
              <span className="relative z-10 flex items-center gap-2">
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                Add Enquiry
              </span>
            </button>
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4">
            <select
              value={leadFilter}
              onChange={(e) => setLeadFilter(e.target.value)}
              className="px-4 py-2 rounded-lg border border-navy-100 bg-white shadow-sm focus:ring-2 focus:ring-gold-400 focus:outline-none"
            >
              <option value="all">All Leads</option>
              <option value="hotlead">Hot Lead</option>
              <option value="followup">Follow-up</option>
              <option value="lead">Lead</option>
              <option value="not_interested">Not Interested</option>
              <option value="closed">Closed</option>
            </select>

            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="px-4 py-2 rounded-lg border border-navy-100 bg-white shadow-sm focus:ring-2 focus:ring-gold-400 focus:outline-none"
            >
              <option value="all">All Sources</option>
              <option value="Website">Website</option>
              <option value="Call">Call</option>
              <option value="Email">Email</option>
              <option value="Walk-in">Walk-in</option>
              <option value="Referral">Referral</option>
              <option value="Other">Other</option>
            </select>

            <input
              type="text"
              placeholder="Filter by tag..."
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              className="px-4 py-2 rounded-lg border border-navy-100 bg-white shadow-sm focus:ring-2 focus:ring-gold-400 focus:outline-none flex-1 min-w-0"
            />
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl shadow-sm overflow-x-auto border border-navy-100">
          <table
            className="w-full text-left border-collapse"
            ref={tableRef}
            tabIndex={0}
          >
            <thead>
              <tr className="bg-navy-50 text-navy-800">
                {[
                  { label: "Enquiry ID", key: "enquiry_id" },
                  { label: "Company Name", key: "company_name" },
                  { label: "Contact Person", key: "contact_person" },
                  { label: "Lead Status", key: "lead" },
                  { label: "Status", key: "status" },
                  { label: "Due Date", key: "due_date" },
                  { label: "Actions", key: "actions" },
                ].map(({ label, key }) => (
                  <th
                    key={key}
                    onClick={() => key !== "actions" && handleSort(key)}
                    className={`px-5 py-3 text-sm font-semibold ${
                      key !== "actions" ? "cursor-pointer hover:bg-navy-100" : ""
                    } transition-colors whitespace-nowrap border-b border-navy-100`}
                  >
                    <div className="flex justify-between items-center">
                      <span>{label}</span>
                      {key !== "actions" && (
                        <ArrowDownUp
                          size={15}
                          className={`ml-2 ${
                            sortConfig.key === key
                              ? "text-gold-500"
                              : "text-navy-400/50"
                          }`}
                        />
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-100">
              {sortedEnquiries.map((enquiry) => {
                const stageOrStatus = (
                  enquiry.stage ||
                  enquiry.status ||
                  ""
                ).toLowerCase();
                const isOverdue =
                  enquiry.due_date &&
                  ![
                    "closed_won",
                    "closed_lost",
                    "regret",
                    "closed",
                    "cancelled",
                  ].includes(stageOrStatus) &&
                  new Date(enquiry.due_date) < new Date();

                const leadValue = enquiry.lead || enquiry.priority || "lead";

                const statusClasses =
                  enquiry.status === "Closed"
                    ? "bg-green-100 text-green-700"
                    : enquiry.status === "In Progress"
                      ? "bg-blue-100 text-blue-700"
                      : enquiry.status === "Pending"
                        ? "bg-gold-400/25 text-gold-600"
                        : "bg-red-100 text-red-700";

                return (
                  <tr
                    key={enquiry.enquiry_id}
                    className={`hover:bg-navy-50/60 transition-colors ${
                      isOverdue ? "border-l-4 border-red-400" : ""
                    }`}
                    onDoubleClick={() => fetchEnquiryDetail(enquiry.enquiry_id)}
                  >
                    <td className="px-5 py-3.5 text-navy-800 font-medium">
                      {enquiry.enquiry_id}
                    </td>
                    <td className="px-5 py-3.5 text-gray-600">
                      {enquiry.company_name}
                    </td>
                    <td className="px-5 py-3.5 text-gray-600">
                      {enquiry.contact_person || "N/A"}
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${getLeadClasses(
                          leadValue,
                        )}`}
                      >
                        {formatLeadLabel(leadValue)}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${statusClasses}`}>
                        {enquiry.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-gray-600">
                      {enquiry.due_date ? formatDate(enquiry.due_date) : "N/A"}
                      {isOverdue && (
                        <span className="ml-2 text-xs font-semibold text-red-600 bg-red-100 px-2 py-1 rounded-full">
                          Overdue
                        </span>
                      )}
                    </td>

                    {/* ACTIONS BUTTON (opens global popup) */}
                    <td className="px-5 py-3.5 text-gray-600">
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
                        className="inline-flex items-center justify-center w-9 h-9 rounded-full hover:bg-navy-50 transition-colors"
                      >
                        <MoreVertical size={18} className="text-gray-500" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {sortedEnquiries.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              No enquiries found matching your search.
            </div>
          )}
        </div>

        {/* Global ACTIONS POPUP (portal-style, not clipped by table) */}
        {actionsMenuState.isOpen && actionsMenuState.enquiry && (
          <div
            className="fixed inset-0 z-50"
            onClick={() =>
              setActionsMenuState((prev) => ({ ...prev, isOpen: false }))
            }
          >
            <div
              className="absolute z-50 w-48 bg-white border border-gray-200 rounded-xl shadow-lg py-1 pointer-events-auto"
              style={{
                left: Math.min(Math.max(actionsMenuState.x, 104), window.innerWidth - 104),
                top: Math.max(8, Math.min(actionsMenuState.y, window.innerHeight - 220)),
                transform: "translateX(-50%)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => {
                  setActionsMenuState((prev) => ({ ...prev, isOpen: false }));
                  handleEdit(actionsMenuState.enquiry);
                }}
                className="w-full text-left px-4 py-2 text-sm hover:bg-navy-50 flex items-center gap-2"
              >
                ✏️ Edit
              </button>
              <button
                onClick={() => {
                  setActionsMenuState((prev) => ({ ...prev, isOpen: false }));
                  fetchEnquiryDetail(actionsMenuState.enquiry.enquiry_id);
                }}
                className="w-full text-left px-4 py-2 text-sm hover:bg-navy-50 flex items-center gap-2"
              >
                👁️ View
              </button>
              <button
                onClick={() => {
                  setActionsMenuState((prev) => ({ ...prev, isOpen: false }));
                  openAssignModal(actionsMenuState.enquiry);
                }}
                className="w-full text-left px-4 py-2 text-sm hover:bg-navy-50 flex items-center gap-2"
              >
                📌 Assign
              </button>
              <button
                onClick={() => {
                  setActionsMenuState((prev) => ({ ...prev, isOpen: false }));
                  toggleFollow(actionsMenuState.enquiry.enquiry_id);
                }}
                className="w-full text-left px-4 py-2 text-sm hover:bg-navy-50 flex items-center gap-2"
              >
                {followed.has(actionsMenuState.enquiry.enquiry_id)
                  ? "⭐ Unfollow"
                  : "⭐ Follow"}
              </button>
              <button
                onClick={() => {
                  setActionsMenuState((prev) => ({ ...prev, isOpen: false }));
                  handleDelete(actionsMenuState.enquiry.enquiry_id);
                }}
                className="w-full text-left px-4 py-2 text-sm hover:bg-red-50 text-red-600 flex items-center gap-2 border-t border-gray-100"
              >
                🗑️ Delete
              </button>
            </div>
          </div>
        )}

        {/* Pagination */}
        <div className="flex justify-between mt-6 items-center">
          <button
            onClick={() => setPage((prev) => Math.max(prev - 1, 0))}
            disabled={page === 0 || isLoading}
            className="px-4 py-2 bg-white border border-navy-100 text-navy-800 rounded-lg font-medium hover:bg-navy-100 disabled:opacity-50 transition-colors"
          >
            Previous
          </button>
          <span className="text-gray-600 text-sm">
            Page <span className="text-gold-600">{page + 1}</span> of{" "}
            {Math.ceil(total / limit)}
          </span>
          <button
            onClick={() => setPage((prev) => prev + 1)}
            disabled={(page + 1) * limit >= total || isLoading}
            className="px-4 py-2 bg-white border border-navy-100 text-navy-800 rounded-lg font-medium hover:bg-navy-100 disabled:opacity-50 transition-colors"
          >
            Next
          </button>
        </div>

        {/* CREATE / EDIT MODAL */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 bg-navy-900/50 flex items-center justify-center p-4 transition-opacity duration-500">
            <div className="bg-white p-6 rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto relative">
              <button
                onClick={() => setIsModalOpen(false)}
                className="absolute top-4 right-4 p-2 -m-2 text-gray-400 hover:text-navy-800 transition-colors"
              >
                <X size={20} />
              </button>
              <h2 className="font-display text-xl font-bold text-navy-800 mb-5">
                {isEditing
                  ? `Edit Enquiry #${selectedEnquiry?.enquiry_id}`
                  : "Add New Enquiry"}
              </h2>
              <form onSubmit={handleSubmit}>
                {[
                  {
                    label: "Enquiry ID (Optional)",
                    key: "enquiry_id",
                    required: false,
                    icon: "M3 12h18M3 6h18M3 18h18",
                  },
                  {
                    label: "Company Name",
                    key: "company_name",
                    required: true,
                    icon: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z",
                  },
                  {
                    label: "Contact Person",
                    key: "contact_person",
                    icon: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z",
                  },
                  {
                    label: "Email",
                    key: "mail_id",
                    type: "email",
                    icon: "M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4",
                  },
                  {
                    label: "Phone",
                    key: "phone_no",
                    icon: "M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z",
                  },
                  {
                    label: "Items Required",
                    key: "items_required",
                    type: "textarea",
                    icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
                  },
                  {
                    label: "Status",
                    key: "status",
                    type: "select",
                    icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
                    options: ["Pending", "In Progress", "Closed", "Cancelled"],
                  },
                  {
                    label: "Lead Status",
                    key: "lead",
                    type: "select",
                    icon: "M12 8c-1.657 0-3 1.343-3 3 0 .795.312 1.515.82 2.05L9 17l3-1 3 1-1-3.95A2.99 2.99 0 0015 11c0-1.657-1.343-3-3-3z",
                    options: [
                      "hotlead",
                      "followup",
                      "lead",
                      "not_interested",
                      "closed",
                    ],
                  },
                  {
                    label: "Source",
                    key: "source",
                    type: "select",
                    icon: "M3 7l9-4 9 4-9 4-9-4zm0 6l9 4 9-4",
                    options: [
                      "Website",
                      "Call",
                      "Email",
                      "Walk-in",
                      "Referral",
                      "Other",
                    ],
                  },
                  {
                    label: "Application",
                    key: "application",
                    icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
                  }, // new application field
                  {
                    label: "Tags (comma separated)",
                    key: "tagsInput",
                    icon: "M7 7h10M7 12h8m-8 5h6",
                  },
                  {
                    label: "Due Date",
                    key: "due_date",
                    type: "date",
                    icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
                  },
                  {
                    label: "Last Discussion",
                    key: "last_discussion",
                    type: "date",
                    icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
                  },
                  {
                    label: "Next Interaction",
                    key: "next_interaction",
                    type: "date",
                    icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
                  },
                ].map(
                  ({ label, key, type = "text", required, icon, options }) => (
                    <div key={key} className="mb-5 relative group">
                      <label className="block text-gray-700 font-semibold mb-2 text-lg tracking-wide">
                        {label}
                      </label>
                      <div className="relative">
                        <svg
                          className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gold-500  transition-colors duration-300"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d={icon}
                          />
                        </svg>
                        {type === "textarea" ? (
                          <textarea
                            value={newEnquiry[key]}
                            onChange={(e) =>
                              setNewEnquiry((prev) => ({
                                ...prev,
                                [key]: e.target.value,
                              }))
                            }
                            className="w-full pl-10 pr-4 py-3 border border-navy-100 rounded-lg bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-gold-400 shadow-sm transition-colors placeholder-gray-400"
                            placeholder={`Enter ${label.toLowerCase()}`}
                            rows={4}
                          />
                        ) : type === "select" ? (
                          <select
                            value={newEnquiry[key]}
                            onChange={(e) =>
                              setNewEnquiry((prev) => ({
                                ...prev,
                                [key]: e.target.value,
                              }))
                            }
                            className="w-full pl-10 pr-4 py-3 border border-navy-100 rounded-lg bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-gold-400 shadow-sm transition-colors"
                          >
                            {options.map((option) => (
                              <option key={option} value={option}>
                                {key === "lead"
                                  ? formatLeadLabel(option)
                                  : option}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type={type}
                            value={newEnquiry[key]}
                            onChange={(e) =>
                              setNewEnquiry((prev) => ({
                                ...prev,
                                [key]: e.target.value,
                              }))
                            }
                            className="w-full pl-10 pr-4 py-3 border border-navy-100 rounded-lg bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-gold-400 shadow-sm transition-colors placeholder-gray-400"
                            required={required}
                            placeholder={`Enter ${label.toLowerCase()}`}
                          />
                        )}
                      </div>
                      {errors[key] && (
                        <p className="text-sm text-red-500 mt-1 font-medium">
                          {errors[key]}
                        </p>
                      )}
                    </div>
                  ),
                )}
                <div className="flex justify-end gap-4">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
                  >
                    <span className="relative z-10">Cancel</span>
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-navy-800 text-white rounded-lg font-medium hover:bg-navy-700 transition-colors"
                  >
                    <span className="relative z-10 flex items-center gap-2">
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M5 13l4 4L19 7"
                        />
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
          <div className="fixed inset-0 z-50 bg-navy-900/50 flex items-center justify-center p-4">
            <div className="bg-white p-6 rounded-xl shadow-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto relative">
              <button
                onClick={() => {
                  setIsAssignModalOpen(false);
                  setAssignTargetEnquiry(null);
                }}
                className="absolute top-3 right-3 p-1 text-gray-400 hover:text-navy-800 transition-colors"
              >
                <X size={18} />
              </button>
              <h2 className="text-lg font-bold text-gray-800 mb-4">
                Assign Enquiry #{assignTargetEnquiry.enquiry_id}
              </h2>
              <form onSubmit={handleAssignSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Assignee
                  </label>
                  <select
                    value={assignUserId}
                    onChange={(e) => setAssignUserId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-gold-400"
                    required
                  >
                    <option value="">Select user...</option>
                    <option value="1">1: Admin</option>
                    <option value="7">7: Sales</option>
                    <option value="8">8: Design</option>
                  </select>
                  <p className="text-[11px] text-gray-400 mt-1">
                    Later this can be replaced with a dynamic users dropdown.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Due Date (optional)
                  </label>
                  <input
                    type="date"
                    value={assignDueDate}
                    onChange={(e) => setAssignDueDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-gold-400"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Message (optional)
                  </label>
                  <textarea
                    rows={3}
                    value={assignMessage}
                    onChange={(e) => setAssignMessage(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-gold-400"
                    placeholder="e.g. Please review design and revert."
                  />
                </div>

                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setIsAssignModalOpen(false);
                      setAssignTargetEnquiry(null);
                    }}
                    className="px-4 py-2 rounded-lg bg-gray-200 text-gray-700 text-sm font-semibold hover:bg-gray-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg bg-indigo-500 text-white text-sm font-semibold hover:bg-indigo-600"
                  >
                    Assign
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* DETAIL DRAWER */}
        {isDetailOpen && (
          <div className="fixed inset-0 z-40 flex justify-end bg-navy-900/50">
            <div className="w-full sm:w-[420px] md:w-[460px] bg-white h-full shadow-2xl p-6 overflow-y-auto relative border-l border-navy-100">
              <button
                onClick={() => setIsDetailOpen(false)}
                className="absolute top-4 right-4 p-1 text-gray-400 hover:text-navy-800 transition-colors"
              >
                <X size={18} />
              </button>
              {detailLoading || !detailEnquiry ? (
                <div className="flex justify-center items-center h-full text-gray-500">
                  Loading enquiry details...
                </div>
              ) : (
                <>
                  {/* Header */}
                  <div className="mb-4 border-b pb-4 pr-7 sm:pr-0 flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold tracking-wide text-gray-400 uppercase">
                          Enquiry
                        </span>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] bg-gray-100 text-gray-600 border border-gray-200">
                          #{detailEnquiry.enquiry_id}
                        </span>
                      </div>
                      <h2 className="font-display text-xl font-bold text-navy-800">
                        {detailEnquiry.company_name}
                      </h2>
                      <p className="text-xs text-gray-500 mt-1">
                        Contact:{" "}
                        {detailEnquiry.contact_person || "Not specified"} •
                        Phone: {detailEnquiry.phone_no || "Not specified"} •
                        Email:{" "}
                        {detailEnquiry.mail_id ? (
                          <span className="text-gold-600 ml-1">
                            {detailEnquiry.mail_id}
                          </span>
                        ) : (
                          <span className="text-gray-400 ml-1">
                            Not specified
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span
                        className={`px-3 py-1 rounded-full text-[11px] font-semibold border ${getLeadClasses(detailEnquiry.lead || detailEnquiry.priority)}`}
                      >
                        {formatLeadLabel(
                          detailEnquiry.lead || detailEnquiry.priority,
                        )}
                      </span>
                      <span className="text-[11px] text-gray-500">
                        Source: {detailEnquiry.source || "Website"}
                      </span>
                      <span className="text-[11px] text-gray-500">
                        Application: {detailEnquiry.application || "N/A"}
                      </span>
                    </div>
                  </div>

                  {/* Key summary cards */}
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="rounded-lg border border-navy-100 bg-navy-50/50 px-3 py-2">
                      <p className="text-[11px] text-gray-400 uppercase tracking-wide">
                        Stage
                      </p>
                      <p className="text-sm font-semibold text-gray-800">
                        {(detailEnquiry.stage || "N/A")
                          .replace(/_/g, " ")
                          .replace(/\b\w/g, (c) => c.toUpperCase())}
                      </p>
                      <p className="text-[11px] text-gray-500 mt-1">
                        Assigned to:{" "}
                        <span className="font-medium">
                          {detailEnquiry.assigned_to_name || "Not assigned"}
                        </span>
                      </p>
                    </div>
                    <div className="rounded-lg border border-navy-100 bg-navy-50/50 px-3 py-2">
                      <p className="text-[11px] text-gray-400 uppercase tracking-wide">
                        Status & Due
                      </p>
                      <p className="text-sm font-semibold text-gray-800">
                        {detailEnquiry.status}
                      </p>
                      <p className="text-[11px] text-gray-500 mt-1">
                        Due:{" "}
                        {detailEnquiry.due_date
                          ? formatDate(detailEnquiry.due_date)
                          : "Not set"}
                      </p>
                    </div>
                  </div>

                  {/* Last Discussion / Next Interaction */}
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="rounded-lg border border-navy-100 bg-navy-50/50 px-3 py-2">
                      <p className="text-[11px] text-gray-400 uppercase tracking-wide">
                        Last Discussion
                      </p>
                      <p className="text-sm font-semibold text-navy-800">
                        {detailEnquiry.last_discussion
                          ? formatDate(detailEnquiry.last_discussion)
                          : "N/A"}
                      </p>
                    </div>
                    <div className="rounded-lg border border-navy-100 bg-navy-50/50 px-3 py-2">
                      <p className="text-[11px] text-gray-400 uppercase tracking-wide">
                        Next Interaction
                      </p>
                      <p className="text-sm font-semibold text-navy-800">
                        {detailEnquiry.next_interaction
                          ? formatDate(detailEnquiry.next_interaction)
                          : "N/A"}
                      </p>
                    </div>
                  </div>


                  {/* Items Required */}
                  <div className="mb-4 rounded-lg border border-navy-100 bg-navy-50/50 px-3 py-3">
                    <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">
                      Items Required
                    </h3>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">
                      {detailEnquiry.items_required || "No items specified."}
                    </p>
                  </div>

                  {/* Tags */}
                  <div className="mb-4">
                    <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">
                      Tags
                    </h3>
                    {Array.isArray(detailEnquiry.tags) &&
                    detailEnquiry.tags.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {detailEnquiry.tags.map((tag) => (
                          <span
                            key={tag}
                            className="px-2 py-0.5 text-xs bg-gold-400/25 text-gold-600 rounded-full border border-gold-400/40"
                          >
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
                    <div className="mb-4 rounded-lg border border-indigo-100 bg-indigo-50/80 px-3 py-3">
                      <h3 className="text-xs font-semibold text-indigo-700 uppercase tracking-wide mb-1">
                        Latest Assignment
                      </h3>
                      <p className="text-xs text-gray-600 mb-1">
                        <span className="font-semibold">
                          {lastAssignment.user_name || "System"}
                        </span>{" "}
                        • {formatDate(lastAssignment.created_at)}
                      </p>
                      <p className="text-sm text-gray-800 whitespace-pre-wrap">
                        {lastAssignment.message}
                      </p>
                    </div>
                  )}

                  {/* Activity timeline */}
                  <div className="mt-4 mb-3 border-t pt-3">
                    <h3 className="text-sm font-semibold text-gray-800 mb-2">
                      Activity Timeline
                    </h3>
                    <div className="space-y-3">
                      {detailActivities.length === 0 && (
                        <p className="text-xs text-gray-400">
                          No activity yet.
                        </p>
                      )}
                      {detailActivities.map((act) => {
                        const isAssignment = act.activity_type === "assignment";
                        const isSystem = act.user_name === "System";
                        return (
                          <div
                            key={act.activity_id}
                            className={`p-2 rounded-xl border text-xs ${isAssignment ? "bg-indigo-50 border-indigo-100" : "bg-gray-50 border-gray-100"}`}
                          >
                            <div className="flex justify-between items-center mb-1">
                              <span className="font-semibold text-gray-700 flex items-center gap-1">
                                {isAssignment && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] bg-indigo-100 text-indigo-700">
                                    ASSIGNMENT
                                  </span>
                                )}
                                {isSystem ? "System" : act.user_name}
                              </span>
                              <span className="text-[10px] text-gray-400 flex items-center gap-1">
                                {formatDate(act.created_at)}{" "}
                                {act.read_by_me ||
                                (act.read_receipts &&
                                  act.read_receipts.length > 0) ? (
                                  <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-green-500 text-white text-[9px]">
                                    ✓
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-gray-200 text-gray-500 text-[9px]">
                                    ✓
                                  </span>
                                )}
                              </span>
                            </div>
                            <p className="text-gray-700 whitespace-pre-wrap">
                              {act.message}
                            </p>
                            {act.expected_by && (
                              <p className="text-[10px] text-gray-500 mt-1">
                                Expected by: {formatDate(act.expected_by)}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Comment composer */}
                  <div className="mt-4 border-t pt-3">
                    <h3 className="text-sm font-semibold text-gray-800 mb-2">
                      Add Comment
                    </h3>

                    {/* Auto text buttons for YES / NO */}
                    <div className="flex flex-wrap gap-2 mb-2">
                      <button
                        type="button"
                        onClick={() => {
                          const name =
                            detailEnquiry.company_name || "Sir/Madam";
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
                        }}
                        className="px-3 py-1.5 text-[11px] rounded-full border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 font-semibold"
                      >
                        ✅ Order Confirmation (Yes)
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const name =
                            detailEnquiry.company_name || "Sir/Madam";
                          const text = `Dear ${name},

Thank you very much for considering us and for the time you have spent discussing this enquiry with our team.

After reviewing the current requirements and priorities, we understand that you will not be proceeding further with this order at the moment. We completely respect your decision and are grateful for the opportunity to quote and interact with you.

If your requirements change in the future, or if there is any support we can extend (technical clarification, revised proposal, alternative solutions, etc.), please feel free to reach out to us anytime. We would be glad to re-evaluate and assist you.

Thank you once again for your time and consideration. We hope to work with you in the future.

Warm regards,
[Your Name]
[Your Company]`;
                          setCommentText(text);
                        }}
                        className="px-3 py-1.5 text-[11px] rounded-full border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 font-semibold"
                      >
                        ❌ Regret / Not Proceeding (No)
                      </button>
                    </div>

                    <div className="mb-2">
                      <select
                        value={selectedTemplateId}
                        onChange={(e) => {
                          const id = e.target.value;
                          setSelectedTemplateId(id);
                          const tmpl = commentTemplates.find(
                            (t) => String(t.id) === id,
                          );
                          if (tmpl) setCommentText(tmpl.content);
                        }}
                        className="w-full mb-2 px-3 py-2 rounded-lg border border-gray-200 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-gold-400"
                      >
                        <option value="">Choose a template...</option>
                        {commentTemplates.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.title}
                          </option>
                        ))}
                      </select>
                      <textarea
                        rows={4}
                        value={commentText}
                        onChange={(e) => setCommentText(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-gold-400"
                        placeholder="Write a comment, use @mentions if needed..."
                      />
                    </div>
                    <div className="flex justify-end">
                      <button
                        onClick={async () => {
                          if (!commentText.trim()) {
                            notifyError("Comment message is required");
                            return;
                          }
                          try {
                            const token = localStorage.getItem("token");
                            const res = await fetch(
                              `${API_URL}/${detailEnquiry.enquiry_id}/comment`,
                              {
                                method: "POST",
                                headers: {
                                  Authorization: `Bearer ${token}`,
                                  "Content-Type": "application/json",
                                },
                                body: JSON.stringify({
                                  message: commentText.trim(),
                                  mentions: [],
                                  expected_by: null,
                                  is_internal: false,
                                }),
                              },
                            );
                            if (!res.ok) {
                              const errorBody = await res.json().catch(() => ({}));
                              throw new Error(errorBody.error || "Failed to add comment");
                            }
                            const activity = await res.json();
                            setDetailActivities((prev) => [...prev, activity]);
                            setCommentText("");
                            setSelectedTemplateId("");
                            notifySuccess("Comment added");
                          } catch (err) {
                            console.error("Add comment error:", err);
                            notifyError(err.message || "Failed to add comment");
                          }
                        }}
                        className="px-4 py-2 bg-navy-800 text-white rounded-lg text-xs font-semibold hover:bg-navy-700"
                      >
                        Post Comment
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

    </div>
  );
}

export default SalesEnquiryPage;
