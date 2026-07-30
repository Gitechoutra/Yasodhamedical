import api from "./api";

export async function fetchPatients() {
  const res = await api.get("/patients");
  return res.data.data;
}

export async function createPatient(payload) {
  const res = await api.post("/patients", payload);
  return res.data.data;
}

export async function uploadPatientPhoto(patientId, file) {
  const form = new FormData();
  form.append("photo", file);
  const res = await api.post(`/patients/${patientId}/photo`, form);
  return res.data.data;
}

export async function removePatientPhoto(patientId) {
  const res = await api.delete(`/patients/${patientId}/photo`);
  return res.data.data;
}
