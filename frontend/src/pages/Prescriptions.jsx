import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  HiOutlineCheckBadge,
  HiOutlineChevronDown,
  HiOutlineClipboardDocumentList,
  HiOutlineMagnifyingGlass,
  HiOutlineXMark,
} from "react-icons/hi2";
import Avatar from "../components/Avatar";
import useLiveRefresh from "../hooks/useLiveRefresh";
import { fetchPrescriptions } from "../services/prescriptionService";

const PERIODS = [
  { value: "all", label: "All time" },
  { value: "today", label: "Today" },
  { value: "week", label: "Last 7 days" },
  { value: "month", label: "Last 30 days" },
  { value: "year", label: "Last year" },
];

const VERIFIED = [
  { value: "", label: "All" },
  { value: "true", label: "Verified" },
  { value: "false", label: "Unverified" },
];

const selectClass =
  "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

function Field({ title, children }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{title}</p>
      <div className="mt-1 text-sm leading-relaxed text-slate-700">{children || "—"}</div>
    </div>
  );
}

function PrescriptionCard({ record }) {
  const [expanded, setExpanded] = useState(false);
  const medicines = record.medicines || [];
  const patient = record.patient || {};

  return (
    <div className="rounded-2xl border border-slate-100 bg-white shadow-sm">
      <div className="flex flex-wrap items-start gap-4 p-5">
        <Avatar name={patient.name} size="lg" />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-semibold text-slate-900">{patient.name}</p>
            <span
              title={
                record.verified
                  ? `Signed off by ${record.verified_by || "the treating doctor"}`
                  : "The treating doctor has not signed this off yet"
              }
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                record.verified
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-amber-100 text-amber-700"
              }`}
            >
              <HiOutlineCheckBadge className="h-3.5 w-3.5" />
              {record.verified ? "Verified" : "Unverified"}
            </span>
            {record.session_number > 1 && (
              <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700">
                Session {record.session_number}
              </span>
            )}
          </div>

          <p className="mt-0.5 text-xs text-slate-400">
            {patient.code}
            {patient.age != null && ` · ${patient.age} yrs`}
            {patient.gender && ` · ${patient.gender}`}
            {record.doctor && ` · ${record.doctor}`}
            {record.department && ` · ${record.department}`}
          </p>

          <p className="mt-2 text-sm text-slate-500">
            {record.consulted_at
              ? new Date(record.consulted_at).toLocaleString()
              : "Date not recorded"}
            {" · "}
            {medicines.length} medicine{medicines.length === 1 ? "" : "s"}
          </p>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field title="Symptoms">{record.symptoms}</Field>
            <Field title="Diagnosis">{record.diagnosis}</Field>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <Link
            to={`/dashboard/consultations/${record.consultation_id}`}
            className="rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            Open consultation
          </Link>
          <button
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="flex items-center gap-1 text-xs font-semibold text-slate-500 transition hover:text-slate-700"
          >
            {expanded ? "Less" : "Medicines"}
            <HiOutlineChevronDown
              className={`h-4 w-4 transition ${expanded ? "rotate-180" : ""}`}
            />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-5">
          {medicines.length === 0 ? (
            <p className="text-sm text-slate-400">No medicines on this prescription.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-100 bg-white">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-4 py-2 font-medium">Medicine</th>
                    <th className="px-4 py-2 font-medium">Dose</th>
                    <th className="px-4 py-2 font-medium">Frequency</th>
                    <th className="px-4 py-2 font-medium">Duration</th>
                    <th className="px-4 py-2 font-medium">Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {medicines.map((m, i) => (
                    <tr key={i} className="border-b border-slate-50 last:border-0 align-top">
                      <td className="px-4 py-2 font-medium text-slate-800">
                        {m.medicine_name}
                        {m.instructions && (
                          <span className="mt-0.5 block text-xs font-normal text-slate-500">
                            {m.instructions}
                          </span>
                        )}
                        {m.notes && (
                          <span className="mt-0.5 block text-xs font-normal italic text-slate-400">
                            Note: {m.notes}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-slate-500">{m.dose || "—"}</td>
                      <td className="px-4 py-2 text-slate-500">{m.frequency || "—"}</td>
                      <td className="px-4 py-2 text-slate-500">{m.duration || "—"}</td>
                      <td className="px-4 py-2 text-slate-500">{m.quantity || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {record.case_id && (
            <Link
              to={`/dashboard/cases/${record.case_id}`}
              className="mt-4 inline-block text-xs font-semibold text-brand-600 transition hover:text-brand-700"
            >
              View the whole course of treatment →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Every prescription written, with the symptoms and diagnosis behind it.
 *
 * Read-only. A prescription is created by ending a consultation and changed
 * only by the treating doctor in the consultation room — editing one from a
 * history page would put it out of step with the visit it belongs to.
 */
export default function Prescriptions() {
  const [searchParams, setSearchParams] = useSearchParams();

  const search = searchParams.get("search") || "";
  const period = searchParams.get("period") || "all";
  const verified = searchParams.get("verified") || "";
  const page = Number(searchParams.get("page") || 1);

  const [searchInput, setSearchInput] = useState(search);
  const [records, setRecords] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => setSearchInput(search), [search]);

  const load = useCallback(
    (silent = false) => {
      if (!silent) setLoading(true);
      const params = { page, page_size: 20 };
      if (search) params.search = search;
      if (period !== "all") params.period = period;
      if (verified) params.verified = verified;
      return fetchPrescriptions(params)
        .then((data) => {
          setRecords(data.items || []);
          setMeta(data.meta || null);
          setErrorMsg("");
        })
        .catch((err) =>
          setErrorMsg(err.response?.data?.message || "Could not load prescriptions.")
        )
        .finally(() => setLoading(false));
    },
    [search, period, verified, page]
  );

  useEffect(() => {
    load();
  }, [load]);

  // A consultation finishing anywhere adds a prescription here.
  useLiveRefresh(load);

  function setParam(key, value, defaultValue = "") {
    const next = new URLSearchParams(searchParams);
    if (!value || value === defaultValue) next.delete(key);
    else next.set(key, value);
    if (key !== "page") next.delete("page");
    setSearchParams(next, { replace: true });
  }

  const hasFilters = Boolean(search || period !== "all" || verified);

  return (
    <div>
      <div className="flex items-center gap-2">
        <HiOutlineClipboardDocumentList className="h-6 w-6 text-brand-600" />
        <h1 className="text-2xl font-bold text-slate-900">Prescriptions</h1>
      </div>
      <p className="mt-1 max-w-3xl text-sm text-slate-500">
        Every prescription written, with the symptoms and diagnosis behind it. Saved
        automatically when a consultation ends, and available for future consultations,
        reporting and AI-assisted suggestions.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setParam("search", searchInput.trim());
          }}
          className="flex flex-1 items-center gap-2"
        >
          <div className="flex min-w-64 flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100">
            <HiOutlineMagnifyingGlass className="h-4 w-4 shrink-0 text-slate-400" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Patient, symptoms, diagnosis or medicine…"
              className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => {
                  setSearchInput("");
                  setParam("search", "");
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
          value={verified}
          onChange={(e) => setParam("verified", e.target.value)}
          aria-label="Filter by verification"
          className={selectClass}
        >
          {VERIFIED.map((v) => (
            <option key={v.value} value={v.value}>
              {v.label}
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

      <p className="mt-5 text-sm text-slate-500">
        {meta ? `${meta.total} prescription${meta.total === 1 ? "" : "s"}` : "Loading…"}
        {hasFilters && " matching your filters"}
      </p>

      <div className="mt-3">
        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-44 animate-pulse rounded-2xl bg-slate-100" />
            ))}
          </div>
        ) : records.length === 0 ? (
          <div className="rounded-2xl border border-slate-100 bg-white py-16 text-center shadow-sm">
            <HiOutlineClipboardDocumentList className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mx-auto mt-2 max-w-lg text-sm text-slate-400">
              {hasFilters
                ? "No prescription matches those filters."
                : "No prescriptions yet. One is saved here automatically each time a consultation ends with medicines prescribed."}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {records.map((r) => (
              <PrescriptionCard key={r.consultation_id} record={r} />
            ))}
          </div>
        )}
      </div>

      {meta && meta.pages > 1 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-500">
            Page {meta.page} of {meta.pages}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setParam("page", String(page - 1))}
              disabled={page <= 1}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Previous
            </button>
            <button
              onClick={() => setParam("page", String(page + 1))}
              disabled={page >= meta.pages}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
