import api from "./api";

export async function fetchPatients() {
  const res = await api.get("/patients");
  return res.data.data;
}

export async function createPatient(payload) {
  const res = await api.post("/patients", payload);
  return res.data.data;
}

// Front-desk only (admin/receptionist): routes a patient to the doctor who
// will treat them, which is also what decides who can see the record.
export async function assignPatientDoctor(patientId, doctorId) {
  const res = await api.patch(`/patients/${patientId}/assignment`, {
    assigned_doctor_id: doctorId,
  });
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

// Corrects registration details. Open to the front desk and the treating
// doctor; the server rejects nurses and ignores any attempt to change the
// assigned doctor through this route.
export async function updatePatient(patientId, payload) {
  const res = await api.patch(`/patients/${patientId}`, payload);
  return res.data.data;
}
