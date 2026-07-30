import { useEffect, useState } from "react";
import {
  HiOutlineCalendarDays,
  HiOutlineChatBubbleLeftRight,
  HiOutlineUsers,
  HiOutlineDocumentChartBar,
} from "react-icons/hi2";
import StatCard from "../components/StatCard";
import { useAuth } from "../context/AuthContext";
import { fetchDashboardSummary } from "../services/dashboardService";

const STATUS_STYLES = {
  scheduled: "bg-slate-100 text-slate-600",
  in_progress: "bg-amber-100 text-amber-700",
  completed: "bg-emerald-100 text-emerald-700",
};

function StatusBadge({ status }) {
  const label = status.replace("_", " ");
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${STATUS_STYLES[status] || "bg-slate-100 text-slate-600"}`}
    >
      {label}
    </span>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    let active = true;
    fetchDashboardSummary()
      .then((data) => {
        if (active) setSummary(data);
      })
      .catch(() => {
        if (active) setErrorMsg("Could not load dashboard data.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          Welcome back, {user?.name} 👋
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Here&apos;s what&apos;s happening today
        </p>
      </div>

      {errorMsg && (
        <p className="mt-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
          {errorMsg}
        </p>
      )}

      {loading ? (
        <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      ) : (
        summary && (
          <>
            <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Today's Appointments"
                value={summary.todays_appointments}
                icon={HiOutlineCalendarDays}
              />
              <StatCard
                label="Active Consultations"
                value={summary.active_consultations}
                hint="In progress"
                icon={HiOutlineChatBubbleLeftRight}
              />
              <StatCard
                label="Patients"
                value={summary.total_patients}
                hint="Total patients"
                icon={HiOutlineUsers}
              />
              <StatCard
                label="Reports Generated"
                value={summary.reports_generated}
                icon={HiOutlineDocumentChartBar}
              />
            </div>

            <div className="mt-6 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-semibold text-slate-900">
                  Recent Consultations
                </h2>
              </div>

              {summary.recent_consultations.length === 0 ? (
                <p className="py-10 text-center text-sm text-slate-400">
                  No consultations yet. They&apos;ll appear here once a
                  doctor starts one.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                        <th className="pb-3 font-medium">Patient</th>
                        <th className="pb-3 font-medium">Doctor</th>
                        <th className="pb-3 font-medium">Started</th>
                        <th className="pb-3 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.recent_consultations.map((c) => (
                        <tr key={c.id} className="border-b border-slate-50 last:border-0">
                          <td className="py-3 font-medium text-slate-800">{c.patient}</td>
                          <td className="py-3 text-slate-500">{c.doctor}</td>
                          <td className="py-3 text-slate-500">
                            {c.started_at
                              ? new Date(c.started_at).toLocaleString()
                              : "—"}
                          </td>
                          <td className="py-3">
                            <StatusBadge status={c.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )
      )}
    </div>
  );
}
