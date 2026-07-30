import api from "./api";

export async function fetchReports() {
  const res = await api.get("/reports");
  return res.data.data;
}

export async function generateReport(consultationId) {
  const res = await api.post("/reports", { consultation_id: consultationId });
  return res.data.data;
}

// The download endpoint requires the JWT auth header, so a plain <a href>
// won't carry it — fetch the PDF as a blob (through the authenticated axios
// instance) and trigger the browser's save dialog manually.
export async function downloadReport(reportId, suggestedName = "consultation_report.pdf") {
  const res = await api.get(`/reports/${reportId}/download`, { responseType: "blob" });
  const url = window.URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = suggestedName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}
