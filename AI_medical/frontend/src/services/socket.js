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
