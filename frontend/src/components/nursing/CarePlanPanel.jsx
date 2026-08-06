import {
  HiOutlineClipboardDocumentList,
  HiOutlineDocumentText,
  HiOutlineHeart,
  HiOutlineShieldCheck,
} from "react-icons/hi2";

function Section({ icon: Icon, title, children, empty }) {
  return (
    <div>
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        <Icon className="h-4 w-4" />
        {title}
      </p>
      <div className="mt-2 text-sm leading-relaxed text-slate-700">
        {children || <span className="text-slate-400">{empty}</span>}
      </div>
    </div>
  );
}

/** Preserves the line breaks a doctor typed — instructions are usually a list. */
function MultilineText({ value }) {
  if (!value) return null;
  return <p className="whitespace-pre-wrap">{value}</p>;
}

/**
 * Everything the doctor decided, read-only. The nurse works from this and
 * never edits it: the plan is the doctor's half of the record.
 */
export default function CarePlanPanel({ assignment }) {
  const summary = assignment.consultation?.summary;
  const prescriptions = assignment.consultation?.prescriptions || [];

  return (
    <div className="space-y-6 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-base font-semibold text-slate-900">Doctor&apos;s care plan</h2>
        <p className="text-right text-xs text-slate-400">
          Set by {assignment.doctor || "the treating doctor"}
        </p>
      </div>

      <Section
        icon={HiOutlineClipboardDocumentList}
        title="Treatment plan"
        empty="No treatment plan was written for this assignment."
      >
        <MultilineText value={assignment.treatment_plan} />
      </Section>

      <Section
        icon={HiOutlineHeart}
        title="Care instructions"
        empty="No standing instructions — follow the medication schedule and record observations each round."
      >
        <MultilineText value={assignment.care_instructions} />
      </Section>

      {summary && (
        <Section icon={HiOutlineDocumentText} title="From the consultation" empty="">
          <div className="space-y-2 rounded-xl bg-slate-50 p-4">
            {summary.possible_diagnosis && (
              <p>
                <span className="font-semibold text-slate-800">Diagnosis: </span>
                {summary.possible_diagnosis}
              </p>
            )}
            {summary.symptoms && (
              <p>
                <span className="font-semibold text-slate-800">Symptoms: </span>
                {summary.symptoms}
              </p>
            )}
            {summary.follow_up_advice?.length > 0 && (
              <div>
                <p className="font-semibold text-slate-800">Follow-up advice</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-slate-600">
                  {summary.follow_up_advice.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Section>
      )}

      <Section
        icon={HiOutlineShieldCheck}
        title="Prescription"
        empty="No prescription is attached to this assignment."
      >
        {prescriptions.length > 0 && (
          <div className="overflow-x-auto">
            {assignment.consultation?.prescription_verified ? (
              <p className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                <HiOutlineShieldCheck className="h-3.5 w-3.5" />
                Verified by the doctor
              </p>
            ) : (
              <p className="mb-2 inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                Not yet verified by the doctor
              </p>
            )}
            <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                  <th className="py-2 font-medium">Medicine</th>
                  <th className="py-2 font-medium">Dose</th>
                  <th className="py-2 font-medium">Frequency</th>
                  <th className="py-2 font-medium">Duration</th>
                </tr>
              </thead>
              <tbody>
                {prescriptions.map((p) => (
                  <tr key={p.id} className="border-b border-slate-50 last:border-0">
                    <td className="py-2 font-medium text-slate-800">{p.medicine_name}</td>
                    <td className="py-2 text-slate-500">{p.dose || "—"}</td>
                    <td className="py-2 text-slate-500">{p.frequency || "—"}</td>
                    <td className="py-2 text-slate-500">{p.duration || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        )}
      </Section>
    </div>
  );
}
