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

export async function updateProfile(fields) {
  // Only the keys present are touched server-side, so callers can send a
  // partial patch (e.g. just { name }).
  const res = await api.patch("/auth/me", fields);
  return res.data.data; // updated user
}

export async function uploadAvatar(file) {
  const form = new FormData();
  form.append("avatar", file);
  const res = await api.post("/auth/me/avatar", form);
  return res.data.data; // updated user
}

export async function removeAvatar() {
  const res = await api.delete("/auth/me/avatar");
  return res.data.data; // updated user
}

export async function changePassword(currentPassword, newPassword) {
  await api.post("/auth/password", {
    current_password: currentPassword,
    new_password: newPassword,
  });
}
