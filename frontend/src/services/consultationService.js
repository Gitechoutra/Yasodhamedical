import api from "./api";

export async function fetchConsultations() {
  const res = await api.get("/consultations");
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
