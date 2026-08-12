import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { HiOutlineCalendarDays, HiOutlineClock, HiOutlinePlus } from "react-icons/hi2";
import AppointmentCard from "../components/AppointmentCard";
import FilterChip from "../components/FilterChip";
import Modal from "../components/Modal";
import {
  EmptyState,
  PageHeader,
  RecordGrid,
  RecordGridSkeleton,
} from "../components/RecordCard";
import { useAuth } from "../context/AuthContext";
import useLiveRefresh from "../hooks/useLiveRefresh";
import { fetchAppointments, createAppointment, startAppointment } from "../services/appointmentService";
import { fetchDoctorAvailability } from "../services/doctorService";
import { fetchPatients } from "../services/patientService";
import { canCreateOp, canRunConsultation } from "../utils/permissions";

/**
 * Whether the doctor this OP will go to is actually in today.
 *
 * A warning, never a block: a walk-in still gets queued, and the front desk
 * decides whether to book them for another day. Silence would be worse — the
 * OP would sit in a queue nobody is there to call from.
 */
function DoctorTodayNote({ doctor }) {
  if (!doctor) return null;

  const [text, tone] =
    doctor.status === "on_duty"
      ? [
          doctor.available_until
            ? `On duty now, until ${doctor.available_until}.`
            : "On duty now.",
          "bg-emerald-50 text-emerald-700",
        ]
      : doctor.status === "upcoming"
        ? [`Not in yet — starts at ${doctor.available_from} today.`, "bg-brand-50 text-brand-700"]
        : doctor.status === "finished"
          ? ["Today's shift has finished.", "bg-amber-50 text-amber-700"]
          : ["Not rostered today.", "bg-amber-50 text-amber-700"];

  return (
    <p className={`mt-1 flex flex-wrap items-center gap-x-2 rounded-lg px-3 py-2 text-xs font-semibold ${tone}`}>
      <HiOutlineClock className="h-4 w-4 shrink-0" />
      {text}
      <Link
        to="/dashboard/doctors/availability"
        className="font-semibold underline underline-offset-2"
      >
        See the week
      </Link>
    </p>
  );
}

function CreateOpModal({ patients, preselectedPatientId, onClose, onCreated }) {
  const [patientId, setPatientId] = useState(preselectedPatientId || "");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  // Today's rota for every doctor, fetched once when the modal opens rather
  // than per patient selection — the list is small and the receptionist
  // changes the patient dropdown far more often than the rota changes.
  const [availability, setAvailability] = useState([]);

  useEffect(() => {
    fetchDoctorAvailability()
      .then((data) => setAvailability(data.items || []))
      .catch(() => {
        /* Advisory only. A failure here must not stop an OP being raised. */
      });
  }, []);

  const inputClass =
    "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

  const patient = patients.find((p) => String(p.id) === String(patientId));
  // The OP always goes to the assigned doctor's own department — a
  // receptionist picking a different one would create an OP nobody could
  // ever start (start_appointment requires both a department match and
  // that the doctor is this exact patient's assigned_doctor).
  const assignedDoctor = patient?.assigned_doctor;
  const departmentId = assignedDoctor?.department_id;
  const doctorToday = assignedDoctor
    ? availability.find((d) => d.id === assignedDoctor.id)
    : null;

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
            <>
              <p className={`${inputClass} bg-slate-50 text-slate-700`}>
                {assignedDoctor.department} — Dr. {assignedDoctor.name}
                {assignedDoctor.specialization ? ` (${assignedDoctor.specialization})` : ""}
              </p>
              <DoctorTodayNote doctor={doctorToday} />
            </>
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

  // Raising an OP is front-desk work only. Not doctors (they would be
  // queueing their own patients), and not admins — admin monitors the queue
  // rather than calling patients in. `POST /appointments` enforces the same
  // rule, so this only decides whether the control is worth drawing.
  const canScheduleAppointments = canCreateOp(user?.role);

  // Starting or resuming a consultation is the doctor's, and the server
  // narrows it further to the doctor the appointment belongs to.
  const canConsult = canRunConsultation(user?.role);

  const [appointments, setAppointments] = useState([]);
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(
    canScheduleAppointments && Boolean(searchParams.get("patient_id"))
  );
  const [startingId, setStartingId] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

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
    [ongoingOnly, canScheduleAppointments]
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
      <PageHeader
        icon={HiOutlineCalendarDays}
        title="Appointments"
        description="The outpatient queue, in the order patients should be called in. A card moves to Consultations once the doctor ends the visit."
        action={
          canScheduleAppointments && (
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-500 to-brand-700 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:shadow-lg"
            >
              <HiOutlinePlus className="h-4 w-4" />
              Create OP
            </button>
          )
        }
      />

      {/* flex-wrap: the counts line plus both filter chips overflow a
          narrow viewport if they are forced onto one row. */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <p className="text-sm text-slate-500">
          {user?.department ? `${user.department} queue` : "All departments"} ·{" "}
          {appointments.length} OP{appointments.length === 1 ? "" : "s"} · {ongoingCount} in
          consultation · {appointments.length - ongoingCount} waiting
        </p>
        {ongoingOnly && (
          <FilterChip label="In consultation" onClear={() => clearFilter("status")} />
        )}
      </div>

      {errorMsg && (
        <p className="mt-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{errorMsg}</p>
      )}

      <div className="mt-6">
        {loading ? (
          <RecordGridSkeleton count={3} />
        ) : appointments.length === 0 ? (
          <EmptyState icon={HiOutlineCalendarDays}>
            {ongoingOnly
              ? "No consultations are in progress right now."
              : `The ${user?.department || "hospital"} queue is empty — nobody is waiting.`}
          </EmptyState>
        ) : (
          <RecordGrid>
            {appointments.map((a) => (
              <AppointmentCard
                key={a.id}
                appointment={a}
                isNext={a.id === nextInQueueId}
                busy={startingId === a.id}
                canConsult={canConsult}
                onStart={(appt) => handleStart(appt.id)}
                onResume={(appt) => navigate(`/dashboard/consultations/${appt.consultation_id}`)}
              />
            ))}
          </RecordGrid>
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
