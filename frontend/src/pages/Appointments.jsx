import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { HiOutlinePlus } from "react-icons/hi2";
import AppointmentCard from "../components/AppointmentCard";
import FilterChip from "../components/FilterChip";
import Modal from "../components/Modal";
import OpStatusBadge from "../components/OpStatusBadge";
import { useAuth } from "../context/AuthContext";
import useLiveRefresh from "../hooks/useLiveRefresh";
import { fetchAppointments, createAppointment, startAppointment } from "../services/appointmentService";
import { fetchDepartments } from "../services/departmentService";
import { fetchPatients } from "../services/patientService";

<<<<<<< HEAD
const STATUS_STYLES = {
  waiting: "bg-amber-100 text-amber-700",
  in_progress: "bg-blue-100 text-blue-700",
  completed: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-slate-100 text-slate-500",
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

function CreateOpModal({ patients, departments, preselectedPatientId, onClose, onCreated }) {
=======
function NewAppointmentModal({ patients, departments, preselectedPatientId, onClose, onCreated }) {
>>>>>>> 553ef01768a8ed935bd963ab73f95e52a4cae980
  const [patientId, setPatientId] = useState(preselectedPatientId || "");
  const [departmentId, setDepartmentId] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const inputClass =
    "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setErrorMsg("");
    try {
      const appointment = await createAppointment({
        patient_id: Number(patientId),
        department_id: Number(departmentId),
        reason: reason || undefined,
      });
      onCreated(appointment);
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Could not create OP.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Create OP" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600">Patient *</label>
          <select
            required
            className={inputClass}
            value={patientId}
            onChange={(e) => setPatientId(e.target.value)}
          >
            <option value="">Select a patient</option>
            {patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600">Department *</label>
          <select
            required
            className={inputClass}
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
          >
            <option value="">Select a department</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600">
            Reason for visit
          </label>
          <textarea
            rows={2}
            className={inputClass}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Follow-up on stomach pain"
          />
        </div>

        {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}

        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-xl bg-gradient-to-r from-brand-500 to-brand-700 py-2.5 text-sm font-semibold text-white shadow-md transition hover:shadow-lg disabled:opacity-60"
        >
          {saving ? "Creating…" : "Create OP"}
        </button>
      </form>
    </Modal>
  );
}

export default function Appointments() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  // Scheduling (assigning a patient to a department) is front-desk/admin
  // work, not something a doctor does for themselves — see appointment_routes.py.
  const canScheduleAppointments = user?.role !== "doctor";

  const [appointments, setAppointments] = useState([]);
  const [patients, setPatients] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(
    canScheduleAppointments && Boolean(searchParams.get("patient_id"))
  );
  const [startingId, setStartingId] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  // Set by the dashboard's "Today's Appointments" card: today's queue that
  // still needs someone (waiting or in progress).
  const todayOnly = searchParams.get("filter") === "today";
  // Set by the "Active Consultations" card: only the patients in a room now.
  const ongoingOnly = searchParams.get("status") === "in_progress";

  // The server orders ongoing first, then the queue oldest-first, so the
  // first waiting row is the patient to call in next.
  const ongoingCount = appointments.filter((a) => a.status === "in_progress").length;
  const nextInQueueId = appointments.find((a) => a.status === "waiting")?.id;

  // `silent` skips the skeleton: a live refresh should update the queue in
  // place, not blank it out while a doctor is looking at it.
  const load = useCallback(
    (silent = false) => {
      if (!silent) setLoading(true);
      const listParams = {};
      if (todayOnly) listParams.filter = "today";
      if (ongoingOnly) listParams.status = "in_progress";
      const requests = canScheduleAppointments
        ? [fetchAppointments(listParams), fetchPatients(), fetchDepartments()]
        : [fetchAppointments(listParams)];
      return Promise.all(requests)
        .then(([a, p, d]) => {
          setAppointments(a);
          if (p) setPatients(p);
          if (d) setDepartments(d);
          setErrorMsg("");
        })
        .catch(() => setErrorMsg("Could not load the appointment queue."))
        .finally(() => setLoading(false));
    },
    [todayOnly, ongoingOnly, canScheduleAppointments]
  );

  // Re-runs when a filter changes, so clearing a chip refetches the
  // unfiltered list rather than just relabelling the same rows.
  useEffect(() => {
    load();
  }, [load]);

  // A patient being called in or finishing elsewhere changes this queue.
  useLiveRefresh(load);

  function clearFilter(key) {
    const next = new URLSearchParams(searchParams);
    next.delete(key);
    setSearchParams(next, { replace: true });
  }

  async function handleStart(appointmentId) {
    setStartingId(appointmentId);
    setErrorMsg("");
    try {
      const consultation = await startAppointment(appointmentId);
      navigate(`/dashboard/consultations/${consultation.id}`);
    } catch (err) {
      // 409 when someone else already picked the patient up, 403 when it's
      // another department's queue — both are worth showing rather than
      // leaving the button silently stuck.
      setErrorMsg(err.response?.data?.message || "Could not start that consultation.");
      load();
    } finally {
      setStartingId(null);
    }
  }

  function closeModal() {
    setShowModal(false);
    if (searchParams.get("patient_id")) {
      searchParams.delete("patient_id");
      setSearchParams(searchParams, { replace: true });
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Appointments</h1>
<<<<<<< HEAD
          <p className="mt-1 text-sm text-slate-500">
            {user?.department ? `${user.department} queue` : "All departments"} ·{" "}
            {appointments.length} OP{appointments.length === 1 ? "" : "s"}
          </p>
=======
          <div className="mt-1 flex items-center gap-2">
            <p className="text-sm text-slate-500">
              {user?.department ? `${user.department} queue` : "All departments"} ·{" "}
              {ongoingCount} in consultation · {appointments.length - ongoingCount} waiting
            </p>
            {todayOnly && <FilterChip label="Today only" onClear={() => clearFilter("filter")} />}
            {ongoingOnly && (
              <FilterChip label="In consultation" onClear={() => clearFilter("status")} />
            )}
          </div>
>>>>>>> 553ef01768a8ed935bd963ab73f95e52a4cae980
        </div>
        {canScheduleAppointments && (
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-500 to-brand-700 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:shadow-lg"
          >
            <HiOutlinePlus className="h-4 w-4" />
            Create OP
          </button>
        )}
      </div>

      {errorMsg && (
        <p className="mt-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{errorMsg}</p>
      )}

      <div className="mt-6">
        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-36 animate-pulse rounded-2xl bg-slate-100" />
            ))}
          </div>
        ) : appointments.length === 0 ? (
          <div className="rounded-2xl border border-slate-100 bg-white py-16 text-center shadow-sm">
            <p className="text-sm text-slate-400">
              {ongoingOnly
                ? "No consultations are in progress right now."
                : todayOnly
                  ? "No patients pending or in consultation today."
                  : `The ${user?.department || "hospital"} queue is empty — nobody is waiting.`}
            </p>
          </div>
        ) : (
<<<<<<< HEAD
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                <th className="px-6 py-3 font-medium">Patient</th>
                <th className="px-6 py-3 font-medium">Department</th>
                <th className="px-6 py-3 font-medium">Reason</th>
                <th className="px-6 py-3 font-medium">OP Status</th>
                <th className="px-6 py-3 font-medium">Doctor</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {appointments.map((a) => (
                <tr key={a.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-6 py-3 font-medium text-slate-800">{a.patient}</td>
                  <td className="px-6 py-3 text-slate-500">{a.department}</td>
                  <td className="px-6 py-3 text-slate-500">{a.reason || "—"}</td>
                  <td className="px-6 py-3">
                    <OpStatusBadge status={a.patient_op_status} />
                  </td>
                  <td className="px-6 py-3 text-slate-500">{a.doctor || "—"}</td>
                  <td className="px-6 py-3">
                    <StatusBadge status={a.status} />
                  </td>
                  <td className="px-6 py-3 text-right">
                    {a.status === "waiting" && (
                      <button
                        onClick={() => handleStart(a.id)}
                        disabled={startingId === a.id}
                        className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 transition hover:bg-brand-100 disabled:opacity-60"
                      >
                        <HiOutlinePlay className="h-3.5 w-3.5" />
                        {startingId === a.id ? "Starting…" : "Start Consultation"}
                      </button>
                    )}
                    {a.consultation_id && a.status !== "waiting" && (
                      <button
                        onClick={() => navigate(`/dashboard/consultations/${a.consultation_id}`)}
                        className="text-xs font-semibold text-brand-600 hover:text-brand-700"
                      >
                        View
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
=======
          <div className="space-y-4">
            {appointments.map((a) => (
              <AppointmentCard
                key={a.id}
                appointment={a}
                isNext={a.id === nextInQueueId}
                busy={startingId === a.id}
                onStart={(appt) => handleStart(appt.id)}
                onResume={(appt) => navigate(`/dashboard/consultations/${appt.consultation_id}`)}
              />
            ))}
          </div>
>>>>>>> 553ef01768a8ed935bd963ab73f95e52a4cae980
        )}
      </div>

      {showModal && canScheduleAppointments && (
        <CreateOpModal
          patients={patients}
          departments={departments}
          preselectedPatientId={searchParams.get("patient_id")}
          onClose={closeModal}
          onCreated={() => {
            closeModal();
            load();
          }}
        />
      )}
    </div>
  );
}
