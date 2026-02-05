import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { removeNotification } from "../../features/notifications/notificationSlice.js";

export default function NotificationCenter() {
  const notifications = useSelector((state) => state.notifications);
  const dispatch = useDispatch();

  return (
    <div className="fixed top-5 right-5 flex flex-col space-y-4 z-50">
      {notifications.map((n) => (
        <NotificationItem
          key={n.id}
          notification={n}
          onClose={() => dispatch(removeNotification(n.id))}
        />
      ))}
    </div>
  );
}

function NotificationItem({ notification, onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const colorMap = {
    success: "from-green-500 to-green-600 border-green-700",
    error: "from-red-500 to-red-600 border-red-700",
    warning: "from-yellow-400 to-yellow-500 border-yellow-600",
    info: "from-blue-500 to-blue-600 border-blue-700",
  };

  return (
    <div
      className={`
        flex items-center justify-between
        bg-gradient-to-r ${colorMap[notification.type] || "from-gray-700 to-gray-800"} 
        border-l-4 border-opacity-90
        text-white px-6 py-3 rounded-xl shadow-xl min-w-[280px] 
        animate-slide-in hover:scale-105 transform transition-all duration-300
      `}
    >
      <div className="flex items-center space-x-3">
        {notification.type === "success" && (
          <svg
            className="w-5 h-5 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={3}
              d="M5 13l4 4L19 7"
            />
          </svg>
        )}
        {notification.type === "error" && (
          <svg
            className="w-5 h-5 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={3}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        )}
        <span className="text-sm font-medium">{notification.message}</span>
      </div>

      <button
        onClick={onClose}
        className="ml-4 text-white opacity-70 hover:opacity-100 transition-opacity duration-200"
      >
        &times;
      </button>
    </div>
  );
}
