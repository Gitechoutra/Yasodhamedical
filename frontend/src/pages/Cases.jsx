import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  HiOutlineArrowDownTray,
  HiOutlineCheckBadge,
  HiOutlineDocumentText,
  HiOutlineMagnifyingGlass,
  HiOutlineXMark,
} from "react-icons/hi2";
import Avatar from "../components/Avatar";
import useLiveRefresh from "../hooks/useLiveRefresh";
import { fetchCases } from "../services/caseService";
import { downloadReport } from "../services/reportService";

const STATUSES = [
  { value: "all", label: "All cases" },
  { value: "open", label: "In treatment" },
  { value: "closed", label: "Closed" },
];

function CaseRow({ caseRecord, onDownloadReport, downloading }) {
  const isOpen = caseRecord.status === "open";
  const sessions = caseRecord.session_count;
  const when = caseRecord.closed_at || caseRecord.opened_at;

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start gap-4">
        <Avatar name={caseRecord.patient} size="lg" />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-semibold text-slate-900">{caseRecord.patient}</p>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                isOpen ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-700"
              }`}
            >
              {isOpen ? "In treatment" : "Treatment closed"}
            </span>
            {caseRecord.has_open_session && (
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                Session recording now
              </span>
            )}
            {caseRecord.consolidated && (
              <span
                title={
                  caseRecord.final_verified
                    ? `Final prescription verified by ${caseRecord.final_verified_by || "the treating doctor"}`
                    : "The consolidated prescription has not been signed off yet"
                }
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                  caseRecord.final_verified
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-amber-100 text-amber-700"
                }`}
              >
                <HiOutlineCheckBadge className="h-3.5 w-3.5" />
                {caseRecord.final_verified ? "Final Rx verified" : "Final Rx unverified"}
              </span>
            )}
            {caseRecord.report && (
              <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700">
                <HiOutlineDocumentText className="h-3.5 w-3.5" />
                Full report ready
              </span>
            )}
          </div>

          <p className="mt-0.5 text-xs text-slate-400">
            {caseRecord.code}
            {caseRecord.doctor && ` · ${caseRecord.doctor}`}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-slate-500">
            <span className="font-medium text-slate-700">
              {sessions} session{sessions === 1 ? "" : "s"}
            </span>
            <span>
              {isOpen ? "Opened" : "Closed"} {when ? new Date(when).toLocaleDateString() : "—"}
            </span>
          </div>

          {caseRecord.reason && (
            <p className="mt-2 text-sm text-slate-500">
              <span className="font-medium text-slate-600">Reason:</span> {caseRecord.reason}
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <Link
            to={`/dashboard/cases/${caseRecord.id}`}
            className="rounded-xl bg-gradient-to-r from-brand-500 to-brand-700 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:shadow-lg"
          >
            Open case
          </Link>
          {caseRecord.report && (
            <button
              onClick={() => onDownloadReport(caseRecord)}
              disabled={downloading}
              className="flex items-center gap-2 rounded-xl bg-brand-50 px-3.5 py-2 text-xs font-semibold text-brand-700 transition hover:bg-brand-100 disabled:opacity-60"
            >
              <HiOutlineArrowDownTray className="h-4 w-4" />
              {downloading ? "Downloading…" : "Full report"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Courses of treatment, each holding one or more consultation sessions.
 *
 * Separate from the Consultations page on purpose: that one is the history of
 * individual visits, this one is where a doctor picks up an ongoing treatment
 * to add a session to, and where a finished treatment gets its single
 * consolidated report.
 */
export default function Cases() {
  const [searchParams, setSearchParams] = useSearchParams();

  const status = searchParams.get("status") || "all";
  const searchTerm = searchParams.get("search") || "";

  const [searchInput, setSearchInput] = useState(searchTerm);
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [downloadingId, setDownloadingId] = useState(null);

  useEffect(() => setSearchInput(searchTerm), [searchTerm]);

  const load = useCallback(
    (silent = false) => {
      if (!silent) setLoading(true);
      setErrorMsg("");
      const params = {};
      if (status !== "all") params.status = status;
      if (searchTerm) params.search = searchTerm;
      return fetchCases(params)
        .then(setCases)
        .catch(() => setErrorMsg("Could not load cases."))
        .finally(() => setLoading(false));
    },
    [status, searchTerm]
  );

  useEffect(() => {
    load();
  }, [load]);

  // A session starting or ending anywhere changes this list.
  useLiveRefresh(load);

  function setParam(key, value, defaultValue) {
    const next = new URLSearchParams(searchParams);
    if (!value || value === defaultValue) next.delete(key);
    else next.set(key, value);
    setSearchParams(next, { replace: true });
  }

  async function handleDownloadReport(caseRecord) {
    setDownloadingId(caseRecord.id);
    try {
      const name = (caseRecord.patient || "patient").replace(/\s+/g, "_");
      await downloadReport(caseRecord.report.id, `${name}_full_medical_report.pdf`);
    } catch {
      setErrorMsg("Could not download that report.");
    } finally {
      setDownloadingId(null);
    }
  }

  const openCount = cases.filter((c) => c.status === "open").length;
  const hasFilters = status !== "all" || Boolean(searchTerm);

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Cases</h1>
      <p className="mt-1 text-sm text-slate-500">
        {cases.length} case{cases.length === 1 ? "" : "s"} · {openCount} still in treatment
        {hasFilters && " matching your filters"}
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setParam("search", searchInput.trim(), "");
          }}
          className="flex flex-1 items-center gap-2"
        >
          <div className="flex min-w-64 flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100">
            <HiOutlineMagnifyingGlass className="h-4 w-4 shrink-0 text-slate-400" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search patient, ID or reason…"
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
          value={status}
          onChange={(e) => setParam("status", e.target.value, "all")}
          aria-label="Filter by status"
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
        >
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
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
              <div key={i} className="h-36 animate-pulse rounded-2xl bg-slate-100" />
            ))}
          </div>
        ) : cases.length === 0 ? (
          <div className="rounded-2xl border border-slate-100 bg-white py-16 text-center shadow-sm">
            <p className="mx-auto max-w-lg text-sm text-slate-400">
              {hasFilters
                ? "No cases match those filters."
                : "No cases yet. One opens automatically the first time you start a consultation with a patient, and every follow-up session joins it."}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {cases.map((c) => (
              <CaseRow
                key={c.id}
                caseRecord={c}
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
