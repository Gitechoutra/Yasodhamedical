import { io } from "socket.io-client";

const SOCKET_URL = import.meta.env.VITE_API_BASE_URL.replace(/\/api\/?$/, "");

let socket = null;

export function getSocket() {
  if (!socket) {
    socket = io(SOCKET_URL, { autoConnect: true, transports: ["websocket", "polling"] });
  }
  return socket;
}

export function joinConsultationRoom(consultationId) {
  getSocket().emit("join_consultation", { consultation_id: consultationId });
}

/**
 * Subscribes to the server's "your dashboard counts may be stale" ping.
 * Returns an unsubscribe function for the caller's cleanup.
 */
export function onDashboardChanged(handler) {
  const s = getSocket();
  s.on("dashboard_changed", handler);
  return () => s.off("dashboard_changed", handler);
}
