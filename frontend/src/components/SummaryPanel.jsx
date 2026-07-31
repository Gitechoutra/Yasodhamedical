import { useState } from "react";
import {
  HiOutlineSparkles,
  HiOutlineArrowDownTray,
  HiOutlineCheckBadge,
  HiOutlineLockClosed,
  HiOutlineLockOpen,
  HiOutlinePencilSquare,
  HiOutlinePrinter,
} from "react-icons/hi2";
import ConfirmDialog from "./ConfirmDialog";
import PrescriptionEditor from "./PrescriptionEditor";
import {
  savePrescriptions,
  unverifyPrescription,
  verifyPrescription,
} from "../services/consultationService";
import { downloadReport, generateReport, openReportForPrint } from "../services/reportService";

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

export default function SummaryPanel({
  summary,
  prescriptions,
  consultationId,
  patientName,
  verified,
  verifiedBy,
  verifiedAt,
  canManage = true,
  onConsultationUpdated,
}) {
  const [busyAction, setBusyAction] = useState(null); // "print" | "download" | "verify" | "unlock"
  const [savingRx, setSavingRx] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmingVerify, setConfirmingVerify] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [noticeMsg, setNoticeMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  if (!summary) return null;

  function fail(err, fallback) {
    setErrorMsg(err.response?.data?.message || fallback);
  }

  const filename = `${(patientName || "patient").replace(/\s+/g, "_")}_consultation_report.pdf`;

  // Regenerated on each use so the PDF always reflects the current
  // prescription and signature, never an older snapshot.
  function clearMessages() {
    setErrorMsg("");
    setNoticeMsg("");
    setSuccessMsg("");
  }

  async function withReport(action, run) {
    setBusyAction(action);
    clearMessages();
    try {
      const report = await generateReport(consultationId);
      await run(report);
    } catch (err) {
      fail(err, "Could not produce the PDF report.");
    } finally {
      setBusyAction(null);
    }
  }

  function handlePrint() {
    return withReport("print", async (report) => {
      const openedInTab = await openReportForPrint(report.id, filename);
      if (!openedInTab) {
        setNoticeMsg("Your browser blocked the print tab, so the PDF was downloaded instead.");
      }
    });
  }

  function handleDownload() {
    return withReport("download", (report) => downloadReport(report.id, filename));
  }

  async function runVerification(action, request, doneMessage) {
    setBusyAction(action);
    clearMessages();
    try {
      onConsultationUpdated?.(await request(consultationId));
      setSuccessMsg(doneMessage);
    } catch (err) {
      fail(err, "Could not update the verification.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleConfirmVerify() {
    setConfirmingVerify(false);
    await runVerification("verify", verifyPrescription, "Prescription Verified Successfully.");
  }

  const handleUnlock = () =>
    runVerification(
      "unlock",
      unverifyPrescription,
      "Prescription unlocked. Verify it again to enable printing."
    );

  const busy = busyAction !== null || savingRx;
  // Printing is gated on the doctor's sign-off: the PDF is what leaves the
  // hospital, so it must not exist until someone has stood behind it. The
  // API enforces the same rule, so a disabled button isn't the only guard.
  const canPrint = verified && !editing;
  const lockedReason = "Only the treating doctor can change this prescription";
  const printBlockedReason = verified
    ? "Finish editing first"
    : "Verify the prescription to enable printing";

  const hint = verified
    ? "Prescription is verified and locked. Unlock it to make further changes."
    : canManage
      ? "Review the medicines, then verify to sign them off — printing unlocks after that."
      : lockedReason;

  async function handleSavePrescription(rows) {
    setSavingRx(true);
    clearMessages();
    try {
      const updated = await savePrescriptions(consultationId, rows);
      onConsultationUpdated?.(updated);
      setEditing(false);
      setSuccessMsg("Prescription saved. Verify it to enable printing.");
    } catch (err) {
      fail(err, "Could not save the prescription.");
    } finally {
      setSavingRx(false);
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
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-brand-700">Prescription</h3>
            {verified ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-emerald-700">
                <HiOutlineLockClosed className="h-3.5 w-3.5" />
                Verified
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-amber-700">
                Unverified
              </span>
            )}
          </div>
          {verified && (verifiedBy || verifiedAt) && (
            <p className="mt-1 text-xs text-slate-400">
              Signed off{verifiedBy ? ` by ${verifiedBy}` : ""}
              {verifiedAt ? ` on ${new Date(verifiedAt).toLocaleString()}` : ""} — locked.
            </p>
          )}

          {editing ? (
            <div className="mt-2">
              <PrescriptionEditor
                prescriptions={prescriptions}
                saving={savingRx}
                onCancel={() => setEditing(false)}
                onSave={handleSavePrescription}
              />
            </div>
          ) : prescriptions.length === 0 ? (
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
      {successMsg && (
        <p
          role="status"
          className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700"
        >
          <HiOutlineCheckBadge className="h-5 w-5 shrink-0" />
          {successMsg}
        </p>
      )}
      {noticeMsg && (
        <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">{noticeMsg}</p>
      )}

      <div className="mt-6 border-t border-slate-100 pt-5">
        <p className="mb-3 text-xs text-slate-400">{hint}</p>

        <div className="flex flex-wrap items-center gap-3">
          {verified ? (
            <button
              onClick={handleUnlock}
              disabled={!canManage || busy}
              title={
                canManage ? "Withdraw the sign-off so the prescription can be edited again" : lockedReason
              }
              className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <HiOutlineLockOpen className="h-4.5 w-4.5" />
              {busyAction === "unlock" ? "Unlocking…" : "Unlock to Edit"}
            </button>
          ) : (
            <>
              <button
                onClick={() => {
                  clearMessages();
                  setConfirmingVerify(true);
                }}
                disabled={!canManage || busy || editing}
                title={canManage ? undefined : lockedReason}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
              >
                <HiOutlineCheckBadge className="h-4.5 w-4.5" />
                {busyAction === "verify" ? "Verifying…" : "Verify Prescription"}
              </button>

              <button
                onClick={() => {
                  setEditing(true);
                  clearMessages();
                }}
                disabled={!canManage || busy || editing}
                title={canManage ? undefined : lockedReason}
                className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <HiOutlinePencilSquare className="h-4.5 w-4.5" />
                Edit Prescription
              </button>
            </>
          )}

          <div className="ml-auto flex flex-wrap items-center gap-3">
            {/* Both stay visible before verification so the workflow is
                discoverable — just inert, with the reason in the tooltip. */}
            <button
              onClick={handlePrint}
              disabled={!canPrint || busy}
              title={canPrint ? "Open the report to print" : printBlockedReason}
              className="flex items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-4 py-2.5 text-sm font-semibold text-brand-700 transition hover:bg-brand-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400"
            >
              <HiOutlinePrinter className="h-4.5 w-4.5" />
              {busyAction === "print" ? "Preparing…" : "Print"}
            </button>

            <button
              onClick={handleDownload}
              disabled={!canPrint || busy}
              title={canPrint ? "Download the report as a PDF" : printBlockedReason}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-500 to-brand-700 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:shadow-lg disabled:cursor-not-allowed disabled:bg-slate-200 disabled:from-slate-200 disabled:to-slate-200 disabled:text-slate-400 disabled:shadow-none"
            >
              <HiOutlineArrowDownTray className="h-4.5 w-4.5" />
              {busyAction === "download" ? "Preparing…" : "Download PDF"}
            </button>
          </div>
        </div>
      </div>

      {confirmingVerify && (
        <ConfirmDialog
          title="Verify Prescription"
          message="Are you sure you have reviewed the prescription? After verification, the prescription will be finalized and ready for printing."
          confirmLabel="Verify"
          cancelLabel="Cancel"
          busy={busyAction === "verify"}
          onCancel={() => setConfirmingVerify(false)}
          onConfirm={handleConfirmVerify}
        />
      )}
    </div>
  );
}
