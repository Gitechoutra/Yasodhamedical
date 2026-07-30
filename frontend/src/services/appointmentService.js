import api from "./api";

export async function fetchAppointments() {
  const res = await api.get("/appointments");
  return res.data.data;
}

export async function createAppointment(payload) {
  const res = await api.post("/appointments", payload);
  return res.data.data;
}

export async function startAppointment(appointmentId) {
  const res = await api.post(`/appointments/${appointmentId}/start`);
  return res.data.data;
}
