import api from "./api";

export async function fetchDoctors(departmentId) {
  const res = await api.get("/doctors", {
    params: departmentId ? { department_id: departmentId } : undefined,
  });
  return res.data.data;
}

export async function createDoctor(payload) {
  const res = await api.post("/doctors", payload);
  return res.data.data;
}

/**
 * Which doctors are working on a given day, and between what hours.
 *
 * Front desk only — the API 403s every other role. Defaults to today when no
 * date is given. The response carries `items`, `as_of` (the server clock the
 * on-duty flags were computed against) and the counts the header shows.
 */
export async function fetchDoctorAvailability(params = {}) {
  const res = await api.get("/doctors/availability", { params });
  return res.data.data;
}
