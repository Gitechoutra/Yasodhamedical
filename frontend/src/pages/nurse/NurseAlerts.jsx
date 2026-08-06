import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { HiOutlineCheckCircle } from "react-icons/hi2";
import {
  AlertStatusBadge,
  SeverityBadge,
  formatWhen,
} from "../../components/nursing/NursingBadges";
import { useAuth } from "../../context/AuthContext";
import useLiveNursing from "../../hooks/useLiveNursing";
import { fetchAlerts } from "../../services/nursingService";

const FILTERS = [
  { key: "open", label: "Open" },
  { key: "acknowledged", label: "Acknowledged" },
  { key: "resolved", label: "Resolved" },
  { key: "all", label: "All" },
];

/**
 * Every escalation the caller can see, across all their patients.
 *
 * Shared by both modules — a nurse sees what they raised and whether the
 * doctor has answered; a doctor sees what is waiting on them. `basePath` is
 * the only difference, because the two link into different record routes.
 */
export default function NurseAlerts({ basePath = "/nurse/patients", title = "Alerts" }) {
  const { user } = useAuth();
  const [status, setStatus] = useState("open");
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const isNurse = user?.role === "nurse";

  const load = useCallback(
    (silent = false) => {
      if (!silent) setLoading(true);
      return fetchAlerts(status)
        .then((rows) => {
          setAlerts(rows);
          setErrorMsg("");
        })
        .catch(() => setErrorMsg("Could not load alerts."))
        .finally(() => setLoading(false));
    },
    [status]
  );

  useEffect(() => {
    load();
  }, [load]);

  useLiveNursing(load);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">{title}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {isNurse
              ? "What you've flagged, and what the doctor said back"
              : "Raised by the nurses looking after your patients"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setStatus(f.key)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                status === f.key
                  ? "bg-slate-900 text-white shadow-md"
                  : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
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
      ) : alerts.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-center">
          <HiOutlineCheckCircle className="mx-auto h-8 w-8 text-emerald-400" />
          <p className="mt-2 text-sm font-medium text-slate-600">
            {status === "open" ? "Nothing needs attention." : "No alerts in this view."}
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {alerts.map((alert) => (
            <Link
              key={alert.id}
              to={`${basePath}/${alert.assignment_id}`}
              className={`block rounded-2xl border p-5 shadow-sm transition hover:shadow-md ${
                alert.status === "open" && alert.severity === "critical"
                  ? "border-red-300 bg-red-50/60"
                  : alert.status === "open"
                    ? "border-amber-200 bg-amber-50/40"
                    : "border-slate-100 bg-white"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <SeverityBadge severity={alert.severity}>{alert.category_label}</SeverityBadge>
                  <AlertStatusBadge status={alert.status} />
                  <span className="text-sm font-semibold text-slate-800">
                    {alert.patient}
                    {alert.patient_code && (
                      <span className="ml-1.5 font-normal text-slate-400">
                        {alert.patient_code}
                      </span>
                    )}
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  {alert.nurse} · {formatWhen(alert.created_at)}
                </p>
              </div>

              <p className="mt-2 text-sm leading-relaxed text-slate-700">{alert.message}</p>

              {alert.doctor_response && (
                <p className="mt-2 rounded-lg bg-white px-3 py-2 text-sm text-slate-700">
                  <span className="font-semibold text-emerald-700">Doctor&apos;s reply: </span>
                  {alert.doctor_response}
                </p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
