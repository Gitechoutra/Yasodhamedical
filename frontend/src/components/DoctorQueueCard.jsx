import { useState } from "react";
import { HiOutlineMagnifyingGlass, HiOutlineUserGroup } from "react-icons/hi2";
import AppointmentCard from "./AppointmentCard";
import Modal from "./Modal";
import {
  Badge,
  RecordCard,
  RecordCardBadges,
  RecordCardBody,
  RecordCardFooter,
  RecordCardHeader,
  RecordDetail,
  RecordGrid,
  cardPrimaryClass,
} from "./RecordCard";

function noop() {}

/**
 * One doctor's queue, summarised for reception.
 *
 * `current` is this doctor's in-progress appointment, if any; `waiting` is
 * everyone else in their queue, already in the order the API returns them
 * (oldest first — the same ordering the flat queue uses, just split per
 * doctor here instead of shown as one combined list).
 *
 * Position numbers (1, 2, 3…) are computed locally per doctor rather than
 * read off the appointment's own `queue_number` — that one counts across
 * every doctor's queue combined, which is right for the flat view but not
 * for "this doctor's 3rd patient".
 */
export default function DoctorQueueCard({ doctor, current, waiting, periodCount, periodLabel }) {
  const [showPatients, setShowPatients] = useState(false);
  const [search, setSearch] = useState("");

  const next = waiting[0];
  const rest = waiting.slice(1);
  // Position numbers continue across current -> next -> rest, matching how
  // the desk actually counts "who's after next" — 1 is whoever is being
  // seen, 2 is next, 3 onward is everyone behind them.
  const nextNumber = current ? 2 : 1;
  const restNumbers = rest.map((_, i) => nextNumber + 1 + i);

  // One flat, ordered list to render and filter — building it here rather
  // than treating current/next/rest as three separate render branches means
  // a search match doesn't have to special-case which section it fell in.
  const entries = [
    ...(current ? [{ appointment: current, queueNumber: 1, isNext: false }] : []),
    ...(next ? [{ appointment: next, queueNumber: nextNumber, isNext: true }] : []),
    ...rest.map((appointment, i) => ({
      appointment,
      queueNumber: restNumbers[i],
      isNext: false,
    })),
  ];

  const query = search.trim().toLowerCase();
  const visibleEntries = query
    ? entries.filter(({ appointment }) => {
        const name = appointment.patient || "";
        const code = appointment.patient_detail?.code || "";
        return name.toLowerCase().includes(query) || code.toLowerCase().includes(query);
      })
    : entries;

  return (
    <>
      <RecordCard accent={current ? "emerald" : undefined}>
        <RecordCardBody>
          <RecordCardHeader
            name={doctor.name}
            lines={[doctor.department, doctor.specialization].filter(Boolean)}
          />

          <RecordCardBadges>
            <Badge tone={current ? "emeraldSolid" : "slate"}>
              {current ? "Consulting" : "Free"}
            </Badge>
          </RecordCardBadges>

          <div className="mt-4">
            <RecordDetail label={`Patients (${periodLabel})`} value={periodCount} />
          </div>

          <div className="mt-4 space-y-1 text-sm text-slate-700">
            <p>
              <span className="font-semibold text-slate-800">Currently Consulting:</span>{" "}
              {current ? current.patient : "Nobody right now"}
            </p>
            <p>
              <span className="font-semibold text-slate-800">Next:</span>{" "}
              {next ? next.patient : "Nobody waiting"}
            </p>
            <p>
              <span className="font-semibold text-slate-800">Queue:</span>{" "}
              {restNumbers.length > 0 ? restNumbers.join(", ") : "—"}
            </p>
          </div>
        </RecordCardBody>

        <RecordCardFooter>
          <button onClick={() => setShowPatients(true)} className={cardPrimaryClass}>
            <HiOutlineUserGroup className="h-4 w-4" />
            View Patients
          </button>
        </RecordCardFooter>
      </RecordCard>

      {showPatients && (
        <Modal title={`${doctor.name} — Queue`} onClose={() => setShowPatients(false)} wide="xl">
          {entries.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">
              Nobody in this doctor's queue right now.
            </p>
          ) : (
            <>
              <div className="mb-5 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100 sm:max-w-md">
                <HiOutlineMagnifyingGlass className="h-4 w-4 shrink-0 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="Search this doctor's queue"
                  placeholder="Search by patient name or ID…"
                  className="w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
                />
              </div>

              {visibleEntries.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">
                  No patient in this queue matches “{search.trim()}”.
                </p>
              ) : (
                // Same card the flat queue uses, one per patient, in this
                // doctor's own queue order -- just re-numbered per doctor
                // instead of the appointment's global position. Reception
                // never consults from here (canConsult is always false for
                // this view), so every card falls back to its plain status
                // label rather than offering Start/Resume.
                <RecordGrid>
                  {visibleEntries.map(({ appointment, queueNumber, isNext }) => (
                    <AppointmentCard
                      key={appointment.id}
                      appointment={{ ...appointment, queue_number: queueNumber }}
                      isNext={isNext}
                      canConsult={false}
                      onStart={noop}
                      onResume={noop}
                    />
                  ))}
                </RecordGrid>
              )}
            </>
          )}
        </Modal>
      )}
    </>
  );
}
