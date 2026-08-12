import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { HiOutlineCalendarDays } from "react-icons/hi2";
import AppointmentCard from "../components/AppointmentCard";
import DoctorQueueCard from "../components/DoctorQueueCard";
import FilterChip from "../components/FilterChip";
import {
  EmptyState,
  PageHeader,
  RecordGrid,
  RecordGridSkeleton,
} from "../components/RecordCard";
import { useAuth } from "../context/AuthContext";
import useLiveRefresh from "../hooks/useLiveRefresh";
import { fetchAppointments, startAppointment } from "../services/appointmentService";
import { fetchDoctors } from "../services/doctorService";
import { canRunConsultation } from "../utils/permissions";

const DATE_FILTERS = [
  { key: "today", label: "Today" },
  { key: "week", label: "This Week" },
  { key: "month", label: "This Month" },
];

function pad(n) {
  return String(n).padStart(2, "0");
}

// Local calendar date, not `toISOString()` — that converts to UTC first,
// which shifts the date near midnight in any timezone ahead of UTC.
function dateStr(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The {date_from, date_to} bounds for a period filter, today's date as the anchor. */
function dateRangeFor(filter) {
  const now = new Date();
  if (filter === "week") {
    const day = now.getDay(); // 0 = Sunday
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((day + 6) % 7));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { date_from: dateStr(monday), date_to: dateStr(sunday) };
  }
  if (filter === "month") {
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { date_from: dateStr(first), date_to: dateStr(last) };
  }
  const today = dateStr(now);
  return { date_from: today, date_to: today };
}

/** This doctor's current patient (if any) and waiting list, in queue order. */
function groupByDoctor(appointments) {
  const byDoctor = new Map();
  for (const appointment of appointments) {
    const doctor = appointment.patient_detail?.assigned_doctor;
    if (!doctor) continue;
    if (!byDoctor.has(doctor.id)) byDoctor.set(doctor.id, { current: null, waiting: [] });
    const bucket = byDoctor.get(doctor.id);
    if (appointment.status === "in_progress") bucket.current = appointment;
    else if (appointment.status === "waiting") bucket.waiting.push(appointment);
  }
  return byDoctor;
}

export default function Appointments() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  // A doctor's own queue is one department, already narrowed server-side —
  // the flat card grid still fits that. Reception and admin see every
  // department mixed together, which is what the doctor-grouped view below
  // exists to sort back out; both already shared this "All departments"
  // branch before the grouping existed; see the `description` text.
  const isDoctorView = Boolean(user?.department);

  // Starting or resuming a consultation is the doctor's, and the server
  // narrows it further to the doctor the appointment belongs to.
  const canConsult = canRunConsultation(user?.role);

  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
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
      return fetchAppointments(listParams)
        .then((a) => {
          setAppointments(a);
          setErrorMsg("");
        })
        .catch(() => setErrorMsg("Could not load the appointment queue."))
        .finally(() => setLoading(false));
    },
    [ongoingOnly]
  );

  // Re-runs when a filter changes, so clearing a chip refetches the
  // unfiltered list rather than just relabelling the same rows.
  useEffect(() => {
    load();
  }, [load]);

  // A patient being called in or finishing elsewhere changes this queue.
  useLiveRefresh(load);

  // --- Doctor-grouped view (reception/admin only) ---------------------------

  const [doctors, setDoctors] = useState([]);
  const [dateFilter, setDateFilter] = useState("today");
  const [periodAppointments, setPeriodAppointments] = useState([]);

  useEffect(() => {
    if (isDoctorView) return;
    fetchDoctors()
      .then(setDoctors)
      .catch(() => setDoctors([]));
  }, [isDoctorView]);

  const loadPeriod = useCallback(() => {
    if (isDoctorView) return undefined;
    return fetchAppointments(dateRangeFor(dateFilter))
      .then(setPeriodAppointments)
      .catch(() => setPeriodAppointments([]));
  }, [isDoctorView, dateFilter]);

  useEffect(() => {
    loadPeriod();
  }, [loadPeriod]);

  useLiveRefresh(loadPeriod);

  const queueByDoctor = useMemo(() => groupByDoctor(appointments), [appointments]);
  const periodCountByDoctor = useMemo(() => {
    const counts = new Map();
    for (const appointment of periodAppointments) {
      const id = appointment.patient_detail?.assigned_doctor?.id;
      if (id == null) continue;
      counts.set(id, (counts.get(id) || 0) + 1);
    }
    return counts;
  }, [periodAppointments]);

  const periodLabel = DATE_FILTERS.find((f) => f.key === dateFilter)?.label.toLowerCase();

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

  return (
    <div>
      <PageHeader
        icon={HiOutlineCalendarDays}
        title="Appointments"
        description="The outpatient queue, in the order patients should be called in. A card moves to Consultations once the doctor ends the visit."
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

      {!isDoctorView && (
        <div className="mt-4 flex flex-wrap gap-2">
          {DATE_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setDateFilter(f.key)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                dateFilter === f.key
                  ? "bg-brand-600 text-white shadow-md"
                  : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {errorMsg && (
        <p className="mt-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{errorMsg}</p>
      )}

      <div className="mt-6">
        {isDoctorView ? (
          loading ? (
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
          )
        ) : loading ? (
          <RecordGridSkeleton count={3} />
        ) : doctors.length === 0 ? (
          <EmptyState icon={HiOutlineCalendarDays}>No doctors are set up yet.</EmptyState>
        ) : (
          <RecordGrid>
            {doctors.map((doctor) => {
              const bucket = queueByDoctor.get(doctor.id) || { current: null, waiting: [] };
              return (
                <DoctorQueueCard
                  key={doctor.id}
                  doctor={doctor}
                  current={bucket.current}
                  waiting={bucket.waiting}
                  periodCount={periodCountByDoctor.get(doctor.id) || 0}
                  periodLabel={periodLabel}
                />
              );
            })}
          </RecordGrid>
        )}
      </div>
    </div>
  );
}
