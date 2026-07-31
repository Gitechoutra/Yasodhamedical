import { HiOutlineArrowRightCircle, HiOutlineClock, HiOutlinePlay } from "react-icons/hi2";
import Avatar from "./Avatar";

const STATUS_META = {
  in_progress: { label: "Ongoing consultation", className: "bg-emerald-100 text-emerald-700" },
  waiting: { label: "Pending consultation", className: "bg-amber-100 text-amber-700" },
};

function Detail({ label, value }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm font-medium capitalize text-slate-700">{value ?? "—"}</p>
    </div>
  );
}

/**
 * One patient in the department queue.
 *
 * `isNext` highlights the top waiting card — the person the doctor should
 * call in once the current consultation ends.
 */
export default function AppointmentCard({ appointment, isNext, onStart, onResume, busy }) {
  const patient = appointment.patient_detail || {};
  const ongoing = appointment.status === "in_progress";
  const status = STATUS_META[appointment.status] || {
    label: appointment.status.replace("_", " "),
    className: "bg-slate-100 text-slate-600",
  };

  const appointmentTime = appointment.created_at
    ? new Date(appointment.created_at).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

  return (
    <div
      className={`rounded-2xl border bg-white p-5 shadow-sm transition ${
        ongoing
          ? "border-emerald-200 ring-1 ring-emerald-100"
          : isNext
            ? "border-brand-200 ring-1 ring-brand-100"
            : "border-slate-100"
      }`}
    >
      <div className="flex items-start gap-4">
        <div className="relative">
          <Avatar name={patient.name || appointment.patient} imageUrl={patient.photo_url} size="lg" />
          {appointment.queue_number != null && (
            <span
              title={`Queue position ${appointment.queue_number}`}
              className="absolute -bottom-1 -right-1 grid h-6 w-6 place-items-center rounded-full bg-slate-900 text-[11px] font-bold text-white ring-2 ring-white"
            >
              {appointment.queue_number}
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-semibold text-slate-900">
              {patient.name || appointment.patient}
            </p>
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${status.className}`}>
              {status.label}
            </span>
            {isNext && (
              <span className="rounded-full bg-brand-100 px-2.5 py-1 text-xs font-semibold text-brand-700">
                Next up
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-slate-400">{patient.code || `PAT${appointment.patient_id}`}</p>

          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Detail label="Age" value={patient.age != null ? `${patient.age} yrs` : null} />
            <Detail label="Gender" value={patient.gender} />
            <Detail label="Appointment" value={appointmentTime} />
            <Detail
              label="Queue"
              value={appointment.queue_number != null ? `#${appointment.queue_number}` : "In room"}
            />
          </div>

          {appointment.reason && (
            <p className="mt-3 text-sm text-slate-500">
              <span className="font-medium text-slate-600">Reason:</span> {appointment.reason}
            </p>
          )}
        </div>

        <div className="shrink-0">
          {ongoing ? (
            <button
              onClick={() => onResume(appointment)}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:shadow-lg"
            >
              <HiOutlineArrowRightCircle className="h-4.5 w-4.5" />
              Resume Consultation
            </button>
          ) : (
            <button
              onClick={() => onStart(appointment)}
              disabled={busy}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-500 to-brand-700 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:shadow-lg disabled:opacity-60"
            >
              {busy ? (
                <>
                  <HiOutlineClock className="h-4.5 w-4.5" />
                  Starting…
                </>
              ) : (
                <>
                  <HiOutlinePlay className="h-4.5 w-4.5" />
                  Start Consultation
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
