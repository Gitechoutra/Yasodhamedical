import api from "./api";

export async function fetchConsultations(params = {}) {
  // Defaults to completed consultations server-side. Accepts { search },
  // { period: today|week|month|year|all } and { status }.
  const res = await api.get("/consultations", { params });
  return res.data.data;
}

export async function fetchConsultation(id) {
  const res = await api.get(`/consultations/${id}`);
  return res.data.data;
}

export async function transcribeTurn(consultationId, speaker, audioBlob) {
  const formData = new FormData();
  formData.append("speaker", speaker);
  formData.append("audio", audioBlob, "turn.webm");

  const res = await api.post(`/consultations/${consultationId}/transcribe`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data.data;
}

export async function endConsultation(consultationId) {
  const res = await api.post(`/consultations/${consultationId}/end`);
  return res.data.data;
}

// Sends the whole edited list; the server replaces the prescription with it.
export async function savePrescriptions(consultationId, prescriptions) {
  const res = await api.put(`/consultations/${consultationId}/prescriptions`, { prescriptions });
  return res.data.data; // updated consultation
}

export async function verifyPrescription(consultationId) {
  const res = await api.post(`/consultations/${consultationId}/prescriptions/verify`);
  return res.data.data;
}

export async function unverifyPrescription(consultationId) {
  const res = await api.delete(`/consultations/${consultationId}/prescriptions/verify`);
  return res.data.data;
}
