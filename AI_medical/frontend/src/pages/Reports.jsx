import { useEffect, useState } from "react";
import { HiOutlineArrowDownTray } from "react-icons/hi2";
import { fetchReports, downloadReport } from "../services/reportService";

export default function Reports() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState(null);

  useEffect(() => {
    fetchReports()
      .then(setReports)
      .finally(() => setLoading(false));
  }, []);

  async function handleDownload(report) {
    setDownloadingId(report.id);
    try {
      const filename = `${(report.patient || "patient").replace(/\s+/g, "_")}_consultation_report.pdf`;
      await downloadReport(report.id, filename);
    } finally {
      setDownloadingId(null);
    }
  }

  // The dashboard card shows both numbers, so the page it links to has to
  // agree. Counted from the same rows on screen rather than a second request.
  const todayKey = new Date().toDateString();
  const todaysReports = reports.filter(
    (r) => r.generated_at && new Date(r.generated_at).toDateString() === todayKey
  ).length;

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Reports</h1>
      <p className="mt-1 text-sm text-slate-500">
        {todaysReports} generated today · {reports.length} total
      </p>

      <div className="mt-6 rounded-2xl border border-slate-100 bg-white shadow-sm">
        {loading ? (
          <div className="space-y-2 p-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-slate-100" />
            ))}
          </div>
        ) : reports.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-400">
            No reports generated yet. Reports appear here once a doctor clicks "Generate PDF"
            on a completed consultation.
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                <th className="px-6 py-3 font-medium">Patient</th>
                <th className="px-6 py-3 font-medium">Doctor</th>
                <th className="px-6 py-3 font-medium">Generated</th>
                <th className="px-6 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-6 py-3 font-medium text-slate-800">{r.patient}</td>
                  <td className="px-6 py-3 text-slate-500">{r.doctor}</td>
                  <td className="px-6 py-3 text-slate-500">
                    {new Date(r.generated_at).toLocaleString()}
                  </td>
                  <td className="px-6 py-3 text-right">
                    <button
                      onClick={() => handleDownload(r)}
                      disabled={downloadingId === r.id}
                      className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 transition hover:bg-brand-100 disabled:opacity-60"
                    >
                      <HiOutlineArrowDownTray className="h-3.5 w-3.5" />
                      {downloadingId === r.id ? "Downloading…" : "Download"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
