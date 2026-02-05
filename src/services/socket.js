import { io } from "socket.io-client";

let socket = null;

export function connectSocket(token) {
  if (socket) return socket;

  const backendUrl = import.meta.env.VITE_BACKEND_URL;

  socket = io(backendUrl, {
    withCredentials: true,
    path: "/socket.io",
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 2000,
    auth: { token },
  });

  socket.on("connect", () => {
    console.log("Socket connected");
  });

  socket.on("disconnect", (reason) => {
    console.log("Socket disconnected:", reason);
  });

  return socket;
}

export function getSocket() {
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
