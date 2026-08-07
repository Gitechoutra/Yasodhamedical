import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  HiOutlineBellAlert,
  HiOutlineExclamationTriangle,
  HiOutlineInboxArrowDown,
} from "react-icons/hi2";
import Avatar from "../components/Avatar";
import SurgeryStageBadge from "../components/SurgeryStageBadge";
import {
  CareTypeBadge,
  ComplianceBar,
  formatWhen,
} from "../components/nursing/NursingBadges";
import useLiveNursing from "../hooks/useLiveNursing";
import { fetchAssignments, fetchNursingSummary } from "../services/nursingService";

const FILTERS = [
  { key: "active", label: "Under nursing care" },
  { key: "completed", label: "Discharged" },
  { key: "all", label: "All" },
];

function daysLeft(endsAt) {
  if (!endsAt) return null;
  return Math.ceil((new Date(endsAt).getTime() - Date.now()) / 86_400_000);
}

/**
 * The doctor's remote view of every patient they've handed to a nurse:
 * medication compliance, outstanding alerts and how far into the observation
 * period each patient is — without opening a single record.
 */
export default function NursingMonitor() {
  const [status, setStatus] = useState("active");
  const [assignments, setAssignments] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const load = useCallback(
    (silent = false) => {
      if (!silent) setLoading(true);
      return Promise.all([fetchAssignments({ status }), fetchNursingSummary()])
        .then(([rows, stats]) => {
          setAssignments(rows);
          setSummary(stats);
          setErrorMsg("");
        })
        .catch(() => setErrorMsg("Could not load nursing records."))
        .finally(() => setLoading(false));
    },
    [status]
  );

  useEffect(() => {
    load();
  }, [load]);

  // The whole point of this page is watching remotely, so it stays live.
  useLiveNursing(load);

  return (
    <div>
      {/* No manual refresh control — useLiveNursing keeps this page current
          on server pushes, tab focus and a slow poll. */}
      <div className="min-w-0">
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Nursing care</h1>
        <p className="mt-1 text-sm text-slate-500">
          Patients you&apos;ve assigned to a nurse for observation or recovery
        </p>
      </div>

      {summary && (summary.open_alerts > 0 || summary.missed_today > 0) && (
        <Link
          to="/dashboard/nursing/alerts"
          className="mt-6 flex flex-wrap items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-semibold text-red-700 transition hover:bg-red-100"
        >
          <HiOutlineExclamationTriangle className="h-5 w-5" />
          {summary.open_alerts > 0 && (
            <span>
              {summary.open_alerts} alert{summary.open_alerts > 1 ? "s" : ""} waiting on you
              {summary.critical_alerts > 0 && ` (${summary.critical_alerts} urgent)`}
            </span>
          )}
          {summary.open_alerts > 0 && summary.missed_today > 0 && <span aria-hidden>·</span>}
          {summary.missed_today > 0 && (
            <span>
              {summary.missed_today} dose{summary.missed_today > 1 ? "s" : ""} missed today
            </span>
          )}
          <span className="ml-auto text-xs font-semibold underline">Review</span>
        </Link>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <Link
          to="/dashboard/nursing/updates"
          className="mr-1 inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
        >
          <HiOutlineInboxArrowDown className="h-4 w-4" />
          Nursing updates
          {summary?.unreviewed_updates > 0 && (
            <span className="ml-1 rounded-full bg-white/25 px-1.5 text-[10px] font-bold">
              {summary.unreviewed_updates}
            </span>
          )}
        </Link>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setStatus(f.key)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              status === f.key
                ? "bg-brand-600 text-white shadow-md"
                : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {errorMsg && (
        <p className="mt-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{errorMsg}</p>
      )}

      {loading ? (
        <div className="mt-6 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      ) : assignments.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-center">
          <p className="text-sm font-medium text-slate-600">
            You haven&apos;t assigned a nurse to anyone yet.
          </p>
          <p className="mt-1 text-sm text-slate-400">
            Finish a consultation and use <span className="font-semibold">Assign nurse</span> to
            hand the patient over for the observation period.
          </p>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-sm">
          <table className="w-full min-w-[48rem] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                <th className="px-6 py-3 font-medium">Patient</th>
                <th className="px-6 py-3 font-medium">Nurse</th>
                <th className="px-6 py-3 font-medium">Care</th>
                <th className="px-6 py-3 font-medium">Period</th>
                <th className="px-6 py-3 font-medium">Medication</th>
                <th className="px-6 py-3 font-medium">Alerts</th>
                <th className="px-6 py-3 font-medium">New</th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((a) => {
                const remaining = daysLeft(a.ends_at);
                return (
                  <tr
                    key={a.id}
                    className="border-b border-slate-50 transition last:border-0 hover:bg-slate-50/60"
                  >
                    <td className="px-6 py-3">
                      <Link
                        to={`/dashboard/nursing/${a.id}`}
                        className="flex items-center gap-3"
                      >
                        <Avatar name={a.patient} imageUrl={a.patient_photo_url} size="sm" />
                        <div>
                          <p className="font-medium text-slate-800">{a.patient}</p>
                          <p className="text-xs text-slate-400">{a.patient_code}</p>
                        </div>
                      </Link>
                    </td>
                    <td className="px-6 py-3 text-slate-600">{a.nurse}</td>
                    <td className="px-6 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <CareTypeBadge careType={a.care_type} status={a.status} />
                        <SurgeryStageBadge
                          stage={a.surgery_stage}
                          daysLeft={a.observation_days_left}
                        />
                      </div>
                    </td>
                    <td className="px-6 py-3 text-xs">
                      <p className="text-slate-500">{formatWhen(a.starts_at)}</p>
                      <p className="text-slate-400">
                        {a.status !== "active"
                          ? a.status
                          : remaining === null || remaining <= 0
                            ? "Under care"
                            : remaining === 1
                              ? "1 day planned"
                              : `${remaining} days planned`}
                      </p>
                    </td>
                    <td className="px-6 py-3">
                      <ComplianceBar compliance={a.compliance} className="min-w-[10rem]" />
                    </td>
                    <td className="px-6 py-3">
                      {a.open_alerts > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">
                          <HiOutlineBellAlert className="h-3.5 w-3.5" />
                          {a.open_alerts}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-6 py-3">
                      {/* Nursing activity logged since this doctor last opened
                          the record — cleared by opening it, not by the bell. */}
                      {a.unreviewed_updates > 0 ? (
                        <Link
                          to={`/dashboard/nursing/${a.id}`}
                          className="inline-flex items-center gap-1 rounded-full bg-brand-100 px-2.5 py-1 text-xs font-semibold text-brand-700 transition hover:bg-brand-200"
                        >
                          {a.unreviewed_updates} new
                        </Link>
                      ) : (
                        <span className="text-xs text-slate-400">reviewed</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
