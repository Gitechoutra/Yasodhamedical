import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchConsultations } from "../services/consultationService";

const STATUS_STYLES = {
  scheduled: "bg-slate-100 text-slate-600",
  in_progress: "bg-amber-100 text-amber-700",
  completed: "bg-emerald-100 text-emerald-700",
};

function StatusBadge({ status }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${STATUS_STYLES[status] || "bg-slate-100 text-slate-600"}`}
    >
      {status.replace("_", " ")}
    </span>
  );
}

export default function Consultations() {
  const navigate = useNavigate();
  const [consultations, setConsultations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchConsultations()
      .then(setConsultations)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Consultations</h1>
      <p className="mt-1 text-sm text-slate-500">
        {consultations.length} consultation{consultations.length === 1 ? "" : "s"}
      </p>

      <div className="mt-6 rounded-2xl border border-slate-100 bg-white shadow-sm">
        {loading ? (
          <div className="space-y-2 p-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-slate-100" />
            ))}
          </div>
        ) : consultations.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-400">
            No consultations yet. Start one from the Patients page.
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                <th className="px-6 py-3 font-medium">Patient</th>
                <th className="px-6 py-3 font-medium">Doctor</th>
                <th className="px-6 py-3 font-medium">Started</th>
                <th className="px-6 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {consultations.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => navigate(`/dashboard/consultations/${c.id}`)}
                  className="cursor-pointer border-b border-slate-50 last:border-0 hover:bg-slate-50"
                >
                  <td className="px-6 py-3 font-medium text-slate-800">{c.patient}</td>
                  <td className="px-6 py-3 text-slate-500">{c.doctor}</td>
                  <td className="px-6 py-3 text-slate-500">
                    {c.started_at ? new Date(c.started_at).toLocaleString() : "—"}
                  </td>
                  <td className="px-6 py-3">
                    <StatusBadge status={c.status} />
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
