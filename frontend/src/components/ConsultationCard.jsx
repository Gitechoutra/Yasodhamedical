import { useState } from "react";
import { Link } from "react-router-dom";
import {
  HiOutlineArrowDownTray,
  HiOutlineCheckBadge,
  HiOutlineChevronDown,
  HiOutlineClock,
  HiOutlineDocumentText,
} from "react-icons/hi2";
import Avatar from "./Avatar";

function formatDuration(seconds) {
  if (seconds == null) return "—";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function Section({ title, children }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{title}</p>
      <div className="mt-1 text-sm leading-relaxed text-slate-700">{children}</div>
    </div>
  );
}

function TextOrDash({ value }) {
  return value ? <p className="whitespace-pre-line">{value}</p> : <p className="text-slate-400">—</p>;
}

function AdviceList({ items }) {
  if (!items?.length) return <p className="text-slate-400">—</p>;
  return (
    <ul className="list-disc space-y-0.5 pl-4">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

export default function ConsultationCard({ consultation, onDownloadReport, downloading }) {
  const [expanded, setExpanded] = useState(false);
  const patient = consultation.patient_detail || {};
  const summary = consultation.summary;
  const prescriptions = consultation.prescriptions || [];
  const report = consultation.report;

  const when = consultation.ended_at || consultation.started_at;
  const dateLabel = when ? new Date(when).toLocaleString() : "—";

  return (
    <div className="rounded-2xl border border-slate-100 bg-white shadow-sm">
      <div className="flex items-start gap-4 p-5">
        <Avatar name={patient.name || consultation.patient} imageUrl={patient.photo_url} size="lg" />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-semibold text-slate-900">
              {patient.name || consultation.patient}
            </p>
            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
              Completed
            </span>
            {/* Only when the case really has several — a lone "Session 1" tag
                on an ordinary one-visit consultation is just noise. */}
            {consultation.case?.session_count > 1 && consultation.session_number && (
              <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700">
                Session {consultation.session_number} of {consultation.case.session_count}
              </span>
            )}
            {prescriptions.length > 0 && (
              <span
                title={
                  consultation.prescription_verified
                    ? `Verified by ${consultation.prescription_verified_by || "the treating doctor"}`
                    : "The treating doctor has not signed off these medicines yet"
                }
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                  consultation.prescription_verified
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-amber-100 text-amber-700"
                }`}
              >
                <HiOutlineCheckBadge className="h-3.5 w-3.5" />
                {consultation.prescription_verified ? "Rx verified" : "Rx unverified"}
              </span>
            )}
            {report && (
              <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700">
                <HiOutlineDocumentText className="h-3.5 w-3.5" />
                Report ready
              </span>
            )}
          </div>

          <p className="mt-0.5 text-xs text-slate-400">
            {patient.code || `PAT${consultation.patient_id}`}
            {patient.age != null && ` · ${patient.age} yrs`}
            {patient.gender && ` · ${patient.gender}`}
            {consultation.doctor && ` · ${consultation.doctor}`}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-slate-500">
            <span>{dateLabel}</span>
            <span className="inline-flex items-center gap-1">
              <HiOutlineClock className="h-4 w-4 text-slate-400" />
              {formatDuration(consultation.duration_seconds)}
            </span>
          </div>

          {/* The one line a doctor scans for; the rest is behind the toggle. */}
          <div className="mt-3">
            <Section title="Diagnosis">
              <TextOrDash value={summary?.possible_diagnosis} />
            </Section>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          {report ? (
            <button
              onClick={() => onDownloadReport(consultation)}
              disabled={downloading}
              className="flex items-center gap-2 rounded-xl bg-brand-50 px-3.5 py-2 text-xs font-semibold text-brand-700 transition hover:bg-brand-100 disabled:opacity-60"
            >
              <HiOutlineArrowDownTray className="h-4 w-4" />
              {downloading ? "Downloading…" : "Report"}
            </button>
          ) : (
            <Link
              to={`/dashboard/consultations/${consultation.id}`}
              className="rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              Generate report
            </Link>
          )}
          <button
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="flex items-center gap-1 text-xs font-semibold text-slate-500 transition hover:text-slate-700"
          >
            {expanded ? "Less" : "Details"}
            <HiOutlineChevronDown className={`h-4 w-4 transition ${expanded ? "rotate-180" : ""}`} />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-5">
          {!summary ? (
            <p className="text-sm text-slate-400">
              No AI summary was recorded for this consultation.
            </p>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2">
              <Section title="Symptoms">
                <TextOrDash value={summary.symptoms} />
              </Section>
              <Section title="Consultation notes">
                <TextOrDash value={summary.summary} />
              </Section>
              <Section title="Follow-up advice">
                <AdviceList items={summary.follow_up_advice} />
              </Section>
              <Section title="Lifestyle advice">
                <AdviceList items={summary.lifestyle_advice} />
              </Section>
            </div>
          )}

          <div className="mt-5">
            <Section title={`Prescription (${prescriptions.length})`}>
              {prescriptions.length === 0 ? (
                <p className="text-slate-400">No medicines were prescribed.</p>
              ) : (
                <div className="mt-1 overflow-x-auto rounded-xl border border-slate-100 bg-white">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                        <th className="px-4 py-2 font-medium">Medicine</th>
                        <th className="px-4 py-2 font-medium">Dose</th>
                        <th className="px-4 py-2 font-medium">Frequency</th>
                        <th className="px-4 py-2 font-medium">Duration</th>
                      </tr>
                    </thead>
                    <tbody>
                      {prescriptions.map((p, i) => (
                        <tr key={i} className="border-b border-slate-50 last:border-0">
                          <td className="px-4 py-2 font-medium text-slate-800">
                            {p.medicine_name}
                            {!p.matched_formulary && (
                              // Gemini may name something outside the hospital
                              // formulary; the doctor should notice that.
                              <span
                                title="Not in the hospital formulary"
                                className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700"
                              >
                                off-formulary
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-slate-500">{p.dose || "—"}</td>
                          <td className="px-4 py-2 text-slate-500">{p.frequency || "—"}</td>
                          <td className="px-4 py-2 text-slate-500">{p.duration || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-4">
            <Link
              to={`/dashboard/consultations/${consultation.id}`}
              className="text-xs font-semibold text-brand-600 transition hover:text-brand-700"
            >
              Open full consultation & transcript →
            </Link>
            {consultation.case_id && (
              <Link
                to={`/dashboard/cases/${consultation.case_id}`}
                className="text-xs font-semibold text-brand-600 transition hover:text-brand-700"
              >
                View the whole course of treatment →
              </Link>
            )}
            {report?.generated_at && (
              <span className="text-xs text-slate-400">
                Report generated {new Date(report.generated_at).toLocaleString()}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
