import api from "./api";

export async function login(email, password) {
  const res = await api.post("/auth/login", { email, password });
  return res.data.data; // { access_token, refresh_token, user }
}

export async function fetchCurrentUser() {
  const res = await api.get("/auth/me");
  return res.data.data;
}

export async function logout() {
  try {
    await api.post("/auth/logout");
  } catch {
    // Best-effort: token is discarded client-side regardless.
  }
}

export async function changePassword(currentPassword, newPassword) {
  await api.post("/auth/password", {
    current_password: currentPassword,
    new_password: newPassword,
  });
}
