import api from "./api";

export async function fetchNotifications(limit = 20) {
  const res = await api.get("/notifications", { params: { limit } });
  return res.data.data; // { items, unread_count }
}

export async function markNotificationRead(id) {
  const res = await api.post(`/notifications/${id}/read`);
  return res.data.data; // { notification, unread_count }
}

export async function markAllNotificationsRead() {
  const res = await api.post("/notifications/read-all");
  return res.data.data; // { updated, unread_count }
}
