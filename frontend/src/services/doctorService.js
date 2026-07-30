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
