import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { HiOutlineArrowDownTray } from "react-icons/hi2";
import useLiveRefresh from "../hooks/useLiveRefresh";
import { fetchReports, downloadReport } from "../services/reportService";

export default function Reports() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState(null);

  const load = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    return fetchReports()
      .then(setReports)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // A report generated elsewhere should appear without a page refresh.
  useLiveRefresh(load);

  async function handleDownload(report) {
    setDownloadingId(report.id);
    try {
      const name = (report.patient || "patient").replace(/\s+/g, "_");
      const suffix = report.kind === "case" ? "full_medical_report" : "consultation_report";
      await downloadReport(report.id, `${name}_${suffix}.pdf`);
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
      <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Reports</h1>
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
          <p className="mx-auto max-w-xl py-12 text-center text-sm text-slate-400">
            No reports generated yet. A single-session report appears here once a doctor
            prints or downloads a completed consultation; the full-treatment report appears
            when a case is closed and its final prescription is verified.
          </p>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[46rem] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                <th className="px-6 py-3 font-medium">Patient</th>
                <th className="px-6 py-3 font-medium">Type</th>
                <th className="px-6 py-3 font-medium">Doctor</th>
                <th className="px-6 py-3 font-medium">Generated</th>
                <th className="px-6 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-6 py-3 font-medium text-slate-800">
                    <Link
                      to={
                        r.kind === "case"
                          ? `/dashboard/cases/${r.case_id}`
                          : `/dashboard/consultations/${r.consultation_id}`
                      }
                      className="transition hover:text-brand-700"
                    >
                      {r.patient}
                    </Link>
                  </td>
                  {/* A single visit's report and the consolidated report for a
                      whole course of treatment are very different documents,
                      and both land in this one list. */}
                  <td className="px-6 py-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        r.kind === "case"
                          ? "bg-brand-50 text-brand-700"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {r.kind === "case" ? "Full treatment" : "Single session"}
                    </span>
                    <span className="ml-2 text-xs text-slate-400">{r.label}</span>
                  </td>
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
          </div>
        )}
      </div>
    </div>
  );
}
