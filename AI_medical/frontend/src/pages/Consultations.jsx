import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { HiOutlineMagnifyingGlass, HiOutlineXMark } from "react-icons/hi2";
import ConsultationCard from "../components/ConsultationCard";
import { fetchConsultations } from "../services/consultationService";
import { downloadReport } from "../services/reportService";

const PERIODS = [
  { value: "all", label: "All time" },
  { value: "today", label: "Today" },
  { value: "week", label: "Last 7 days" },
  { value: "month", label: "Last 30 days" },
  { value: "year", label: "Last year" },
];

const REPORT_FILTERS = [
  { value: "all", label: "All" },
  { value: "with", label: "With report" },
  { value: "without", label: "Without report" },
];

export default function Consultations() {
  const [searchParams, setSearchParams] = useSearchParams();

  const period = searchParams.get("period") || "all";
  const reportFilter = searchParams.get("report") || "all";
  const searchTerm = searchParams.get("search") || "";

  // Local mirror so typing stays responsive; the URL only updates on submit.
  const [searchInput, setSearchInput] = useState(searchTerm);
  const [consultations, setConsultations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [downloadingId, setDownloadingId] = useState(null);

  useEffect(() => setSearchInput(searchTerm), [searchTerm]);

  const load = useCallback(() => {
    setLoading(true);
    setErrorMsg("");
    const params = {};
    if (period !== "all") params.period = period;
    if (searchTerm) params.search = searchTerm;
    fetchConsultations(params)
      .then(setConsultations)
      .catch(() => setErrorMsg("Could not load consultations."))
      .finally(() => setLoading(false));
  }, [period, searchTerm]);

  useEffect(load, [load]);

  function setParam(key, value, defaultValue) {
    const next = new URLSearchParams(searchParams);
    if (!value || value === defaultValue) next.delete(key);
    else next.set(key, value);
    setSearchParams(next, { replace: true });
  }

  function handleSearchSubmit(e) {
    e.preventDefault();
    setParam("search", searchInput.trim(), "");
  }

  async function handleDownloadReport(consultation) {
    setDownloadingId(consultation.id);
    try {
      const name = (consultation.patient || "patient").replace(/\s+/g, "_");
      await downloadReport(consultation.report.id, `${name}_consultation_report.pdf`);
    } catch {
      setErrorMsg("Could not download that report.");
    } finally {
      setDownloadingId(null);
    }
  }

  // Report presence is already in the payload, so this filter needs no
  // extra request — unlike search and period, which the server applies.
  const visible = consultations.filter((c) => {
    if (reportFilter === "with") return Boolean(c.report);
    if (reportFilter === "without") return !c.report;
    return true;
  });

  const hasFilters = period !== "all" || reportFilter !== "all" || Boolean(searchTerm);

  const selectClass =
    "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Consultations</h1>
      <p className="mt-1 text-sm text-slate-500">
        {visible.length} completed consultation{visible.length === 1 ? "" : "s"}
        {hasFilters && " matching your filters"}
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <form onSubmit={handleSearchSubmit} className="flex flex-1 items-center gap-2">
          <div className="flex min-w-64 flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100">
            <HiOutlineMagnifyingGlass className="h-4 w-4 shrink-0 text-slate-400" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search patient, ID, diagnosis or symptoms…"
              className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => {
                  setSearchInput("");
                  setParam("search", "", "");
                }}
                aria-label="Clear search"
                className="shrink-0 text-slate-400 transition hover:text-slate-600"
              >
                <HiOutlineXMark className="h-4 w-4" />
              </button>
            )}
          </div>
          <button
            type="submit"
            className="rounded-xl bg-gradient-to-r from-brand-500 to-brand-700 px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:shadow-lg"
          >
            Search
          </button>
        </form>

        <select
          value={period}
          onChange={(e) => setParam("period", e.target.value, "all")}
          aria-label="Filter by date"
          className={selectClass}
        >
          {PERIODS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>

        <select
          value={reportFilter}
          onChange={(e) => setParam("report", e.target.value, "all")}
          aria-label="Filter by report"
          className={selectClass}
        >
          {REPORT_FILTERS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>

        {hasFilters && (
          <button
            onClick={() => setSearchParams({}, { replace: true })}
            className="text-sm font-semibold text-brand-600 transition hover:text-brand-700"
          >
            Clear
          </button>
        )}
      </div>

      {errorMsg && (
        <p className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{errorMsg}</p>
      )}

      <div className="mt-5">
        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-40 animate-pulse rounded-2xl bg-slate-100" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="rounded-2xl border border-slate-100 bg-white py-16 text-center shadow-sm">
            <p className="text-sm text-slate-400">
              {hasFilters
                ? "No completed consultations match those filters."
                : "No completed consultations yet. They appear here once a doctor ends one — consultations still in progress stay in Appointments."}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {visible.map((c) => (
              <ConsultationCard
                key={c.id}
                consultation={c}
                downloading={downloadingId === c.id}
                onDownloadReport={handleDownloadReport}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
