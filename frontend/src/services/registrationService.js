import api from "./api";

/**
 * Public: departments and branches the signup form offers. Names and ids only.
 */
export async function fetchRegistrationOptions() {
  const res = await api.get("/auth/registration-options");
  return res.data.data;
}

/**
 * Public. Records a request — it grants nothing and creates no account. The
 * response is identical whether or not the email is already known, so the
 * form cannot be used to discover who works here.
 */
export async function register(payload) {
  const res = await api.post("/auth/register", payload);
  return res.data;
}

/** Admin: the review queue. */
export async function fetchRegistrations(status = "pending") {
  const res = await api.get("/auth/registrations", { params: { status } });
  return res.data.data;
}

/** Admin: creates the account and its role profile in one transaction. */
export async function approveRegistration(id, payload = {}) {
  const res = await api.post(`/auth/registrations/${id}/approve`, payload);
  return res.data.data;
}

export async function rejectRegistration(id, payload = {}) {
  const res = await api.post(`/auth/registrations/${id}/reject`, payload);
  return res.data.data;
}
