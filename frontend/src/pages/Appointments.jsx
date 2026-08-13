import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  HiOutlineCalendarDays,
  HiOutlineMagnifyingGlass,
  HiOutlineUserGroup,
} from "react-icons/hi2";
import AppointmentCard from "../components/AppointmentCard";
import DoctorQueueCard, { buildQueueEntries } from "../components/DoctorQueueCard";
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

  // Which doctor's patients are shown in the queue section below the doctor
  // cards, and the search filter within that section.
  const [selectedDoctorId, setSelectedDoctorId] = useState(null);
  const [patientSearch, setPatientSearch] = useState("");

  function handleViewPatients(doctor) {
    setSelectedDoctorId(doctor.id);
    setPatientSearch("");
  }

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

  const selectedDoctor = doctors.find((d) => d.id === selectedDoctorId) || null;
  const selectedBucket = selectedDoctor
    ? queueByDoctor.get(selectedDoctor.id) || { current: null, waiting: [] }
    : null;
  const selectedEntries = selectedBucket
    ? buildQueueEntries(selectedBucket.current, selectedBucket.waiting).entries
    : [];
  const patientQuery = patientSearch.trim().toLowerCase();
  const visiblePatientEntries = patientQuery
    ? selectedEntries.filter(({ appointment }) => {
        const name = appointment.patient || "";
        const code = appointment.patient_detail?.code || "";
        return name.toLowerCase().includes(patientQuery) || code.toLowerCase().includes(patientQuery);
      })
    : selectedEntries;

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
                  selected={doctor.id === selectedDoctorId}
                  onViewPatients={handleViewPatients}
                />
              );
            })}
          </RecordGrid>
        )}
      </div>

      {/* A separate section, not a continuation of the doctor-card grid above
          — its own divider and heading, so it reads as an independent part
          of the page rather than more rows appended to Appointments. It
          stays mounted (rather than only appearing once a doctor is picked)
          so the page doesn't jump around as reception clicks between
          doctors — the same section just swaps its heading and contents. */}
      {!isDoctorView && (
        <div className="mt-10 border-t border-slate-200 pt-8">
          <PageHeader
            icon={HiOutlineUserGroup}
            title={selectedDoctor ? `${selectedDoctor.name} — Patient Queue` : "Patient Queue"}
            description={
              selectedDoctor
                ? "This doctor's patients, in queue order."
                : "Select a doctor above to view their patient queue."
            }
            action={
              selectedDoctor && (
                <button
                  onClick={() => setSelectedDoctorId(null)}
                  className="text-xs font-semibold text-slate-500 transition hover:text-slate-700"
                >
                  Clear selection
                </button>
              )
            }
          />

          {!selectedDoctor ? (
            <div className="mt-6">
              <EmptyState icon={HiOutlineUserGroup}>
                Select a doctor to view their patient queue.
              </EmptyState>
            </div>
          ) : (
            <>
              <div className="mt-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100 sm:max-w-md">
                <HiOutlineMagnifyingGlass className="h-4 w-4 shrink-0 text-slate-400" />
                <input
                  value={patientSearch}
                  onChange={(e) => setPatientSearch(e.target.value)}
                  aria-label="Search this doctor's queue"
                  placeholder="Search by patient name or ID…"
                  className="w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
                />
              </div>

              <div className="mt-5">
                {selectedEntries.length === 0 ? (
                  <p className="py-8 text-center text-sm text-slate-400">
                    Nobody in this doctor's queue right now.
                  </p>
                ) : visiblePatientEntries.length === 0 ? (
                  <p className="py-8 text-center text-sm text-slate-400">
                    No patient in this queue matches “{patientSearch.trim()}”.
                  </p>
                ) : (
                  // Same card the flat queue uses, one per patient, in this
                  // doctor's own queue order — just re-numbered per doctor
                  // instead of the appointment's global position. Reception
                  // never consults from here (canConsult is always false for
                  // this view), so every card falls back to its plain status
                  // label rather than offering Start/Resume.
                  <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                    {visiblePatientEntries.map(({ appointment, queueNumber, isNext }) => (
                      <AppointmentCard
                        key={appointment.id}
                        appointment={{ ...appointment, queue_number: queueNumber }}
                        isNext={isNext}
                        canConsult={false}
                        onStart={() => {}}
                        onResume={() => {}}
                      />
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
