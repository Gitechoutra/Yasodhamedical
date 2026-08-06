import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { HiOutlinePlus } from "react-icons/hi2";
import AppointmentCard from "../components/AppointmentCard";
import FilterChip from "../components/FilterChip";
import Modal from "../components/Modal";
import { useAuth } from "../context/AuthContext";
import useLiveRefresh from "../hooks/useLiveRefresh";
import { fetchAppointments, createAppointment, startAppointment } from "../services/appointmentService";
import { fetchPatients } from "../services/patientService";

function CreateOpModal({ patients, preselectedPatientId, onClose, onCreated }) {
  const [patientId, setPatientId] = useState(preselectedPatientId || "");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const inputClass =
    "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

  const patient = patients.find((p) => String(p.id) === String(patientId));
  // The OP always goes to the assigned doctor's own department — a
  // receptionist picking a different one would create an OP nobody could
  // ever start (start_appointment requires both a department match and
  // that the doctor is this exact patient's assigned_doctor).
  const assignedDoctor = patient?.assigned_doctor;
  const departmentId = assignedDoctor?.department_id;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!departmentId) return;
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
          <label className="mb-1 block text-xs font-semibold text-slate-600">Department</label>
          {!patientId ? (
            <p className={`${inputClass} bg-slate-50 text-slate-400`}>Select a patient first</p>
          ) : assignedDoctor?.department_id ? (
            <p className={`${inputClass} bg-slate-50 text-slate-700`}>
              {assignedDoctor.department} — Dr. {assignedDoctor.name}
              {assignedDoctor.specialization ? ` (${assignedDoctor.specialization})` : ""}
            </p>
          ) : (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
              {assignedDoctor
                ? "This patient's assigned doctor has no department set — contact admin."
                : "No doctor assigned to this patient yet — assign one from the Patients page first."}
            </p>
          )}
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
          disabled={saving || !departmentId}
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
        ? [fetchAppointments(listParams), fetchPatients("all")]
        : [fetchAppointments(listParams)];
      return Promise.all(requests)
        .then(([a, p]) => {
          setAppointments(a);
          if (p) setPatients(p);
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
      // 409 when someone else already picked the patient up or the patient
      // was already seen today, 403 when it's another department's queue —
      // all worth showing rather than leaving the button silently stuck.
      //
      // A same-day 409 carries the consultation to carry on with, so the
      // doctor lands in the right room instead of having to hunt for it.
      const existingId = err.response?.data?.errors?.consultation_id;
      if (existingId) {
        navigate(`/dashboard/consultations/${existingId}`);
        return;
      }
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
          {/* flex-wrap: the counts line plus both filter chips overflow a
              narrow viewport if they are forced onto one row. */}
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <p className="text-sm text-slate-500">
              {user?.department ? `${user.department} queue` : "All departments"} ·{" "}
              {appointments.length} OP{appointments.length === 1 ? "" : "s"} ·{" "}
              {ongoingCount} in consultation · {appointments.length - ongoingCount} waiting
            </p>
            {todayOnly && <FilterChip label="Today only" onClear={() => clearFilter("filter")} />}
            {ongoingOnly && (
              <FilterChip label="In consultation" onClear={() => clearFilter("status")} />
            )}
          </div>
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
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-64 animate-pulse rounded-2xl bg-slate-100" />
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
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
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
        )}
      </div>

      {showModal && canScheduleAppointments && (
        <CreateOpModal
          patients={patients}
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
