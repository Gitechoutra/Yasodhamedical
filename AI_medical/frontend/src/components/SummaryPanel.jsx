import { useState } from "react";
import { HiOutlineSparkles, HiOutlineArrowDownTray } from "react-icons/hi2";
import { generateReport, downloadReport } from "../services/reportService";

function Section({ title, children }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-brand-700">{title}</h3>
      <div className="mt-1.5 text-sm text-slate-600">{children}</div>
    </div>
  );
}

function ConversationBubble({ turn }) {
  const isDoctor = turn.speaker === "doctor";
  return (
    <div className={`flex ${isDoctor ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${
          isDoctor
            ? "rounded-tl-sm bg-slate-100 text-slate-700"
            : "rounded-tr-sm bg-brand-600 text-white"
        }`}
      >
        <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide opacity-60">
          {turn.speaker}
        </p>
        {turn.text}
      </div>
    </div>
  );
}

export default function SummaryPanel({ summary, prescriptions, consultationId, patientName }) {
  const [generating, setGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  if (!summary) return null;

  async function handleGeneratePdf() {
    setGenerating(true);
    setErrorMsg("");
    try {
      const report = await generateReport(consultationId);
      const filename = `${(patientName || "patient").replace(/\s+/g, "_")}_consultation_report.pdf`;
      await downloadReport(report.id, filename);
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Could not generate the PDF report.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <div className="mb-5 flex items-center gap-2">
        <HiOutlineSparkles className="h-5 w-5 text-brand-600" />
        <h2 className="text-base font-semibold text-slate-900">AI Generated Summary</h2>
      </div>

      <div className="space-y-5">
        {summary.labeled_transcript?.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-brand-700">Conversation</h3>
            <p className="mt-0.5 text-xs italic text-slate-400">
              AI-reconstructed from the recording — speakers were not manually tagged, so this
              is an inferred best guess.
            </p>
            <div className="mt-2 max-h-64 space-y-2 overflow-y-auto rounded-xl border border-slate-100 bg-slate-50/50 p-3">
              {summary.labeled_transcript.map((turn, i) => (
                <ConversationBubble key={i} turn={turn} />
              ))}
            </div>
          </div>
        )}

        <Section title="Clinical Summary">{summary.summary}</Section>
        <Section title="Symptoms">{summary.symptoms}</Section>

        <Section title="Possible Diagnosis (Assistive)">
          <p>{summary.possible_diagnosis}</p>
          <p className="mt-1 text-xs italic text-slate-400">
            Assistive only — not a confirmed diagnosis. The treating doctor must verify.
          </p>
        </Section>

        <div>
          <h3 className="text-sm font-semibold text-brand-700">Prescription (Suggested)</h3>
          {prescriptions.length === 0 ? (
            <p className="mt-1.5 text-sm text-slate-400">No medicines suggested.</p>
          ) : (
            <div className="mt-2 overflow-x-auto rounded-xl border border-slate-100">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-4 py-2 font-medium">Medicine</th>
                    <th className="px-4 py-2 font-medium">Dose</th>
                    <th className="px-4 py-2 font-medium">Frequency</th>
                    <th className="px-4 py-2 font-medium">Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {prescriptions.map((p, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="px-4 py-2 font-medium text-slate-800">
                        {p.medicine_name}
                        {!p.matched_formulary && (
                          <span className="ml-1.5 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600">
                            not in formulary
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-slate-600">{p.dose || "—"}</td>
                      <td className="px-4 py-2 text-slate-600">{p.frequency || "—"}</td>
                      <td className="px-4 py-2 text-slate-600">{p.duration || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <Section title="Follow-up Advice">
          <ul className="list-disc space-y-1 pl-5">
            {summary.follow_up_advice.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </Section>

        <Section title="Lifestyle Advice">
          <ul className="list-disc space-y-1 pl-5">
            {summary.lifestyle_advice.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </Section>
      </div>

      {errorMsg && (
        <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{errorMsg}</p>
      )}

      <div className="mt-6 flex justify-end">
        <button
          onClick={handleGeneratePdf}
          disabled={generating}
          className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-500 to-brand-700 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:shadow-lg disabled:opacity-60"
        >
          <HiOutlineArrowDownTray className="h-4 w-4" />
          {generating ? "Generating…" : "Generate PDF"}
        </button>
      </div>
    </div>
  );
}
