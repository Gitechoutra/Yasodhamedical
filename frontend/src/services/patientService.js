import api from "./api";

export async function fetchPatients() {
  const res = await api.get("/patients");
  return res.data.data;
}

export async function createPatient(payload) {
  const res = await api.post("/patients", payload);
  return res.data.data;
}
