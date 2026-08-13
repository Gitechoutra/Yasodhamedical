import { HiOutlineUserGroup } from "react-icons/hi2";
import {
  Badge,
  RecordCard,
  RecordCardBadges,
  RecordCardBody,
  RecordCardFooter,
  RecordCardHeader,
  RecordDetail,
  cardPrimaryClass,
} from "./RecordCard";

/**
 * This doctor's queue as a flat, ordered list — one entry per current/next/
 * rest patient, each carrying the position number (1, 2, 3…) the desk
 * actually counts by: 1 is whoever is being seen, 2 is next, 3 onward is
 * everyone behind them. Computed locally per doctor rather than read off the
 * appointment's own `queue_number`, which counts across every doctor's queue
 * combined.
 *
 * Shared by the card's own summary text and the patient-queue section
 * Appointments renders for whichever doctor is selected.
 */
export function buildQueueEntries(current, waiting) {
  const next = waiting[0];
  const rest = waiting.slice(1);
  const nextNumber = current ? 2 : 1;
  const restNumbers = rest.map((_, i) => nextNumber + 1 + i);

  const entries = [
    ...(current ? [{ appointment: current, queueNumber: 1, isNext: false }] : []),
    ...(next ? [{ appointment: next, queueNumber: nextNumber, isNext: true }] : []),
    ...rest.map((appointment, i) => ({
      appointment,
      queueNumber: restNumbers[i],
      isNext: false,
    })),
  ];

  return { entries, next, restNumbers };
}

/**
 * One doctor's queue, summarised for reception.
 *
 * `current` is this doctor's in-progress appointment, if any; `waiting` is
 * everyone else in their queue, already in the order the API returns them
 * (oldest first — the same ordering the flat queue uses, just split per
 * doctor here instead of shown as one combined list).
 *
 * `selected` highlights the card whose patients are currently shown in the
 * queue section below; `onViewPatients` tells Appointments to switch that
 * section to this doctor.
 */
export default function DoctorQueueCard({
  doctor,
  current,
  waiting,
  periodCount,
  periodLabel,
  selected,
  onViewPatients,
}) {
  const { next, restNumbers } = buildQueueEntries(current, waiting);

  return (
    <RecordCard accent={current ? "emerald" : selected ? "brand" : undefined}>
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
        <button onClick={() => onViewPatients(doctor)} className={cardPrimaryClass}>
          <HiOutlineUserGroup className="h-4 w-4" />
          View Patients
        </button>
      </RecordCardFooter>
    </RecordCard>
  );
}
