import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  HiOutlineMicrophone,
  HiOutlineStop,
  HiArrowLeft,
  HiOutlineChevronDown,
  HiOutlineClipboardDocumentList,
  HiOutlineFolderOpen,
  HiOutlineHeart,
} from "react-icons/hi2";
import PatientInfoPanel from "../components/PatientInfoPanel";
import SummaryPanel from "../components/SummaryPanel";
import AssignNurseModal from "../components/nursing/AssignNurseModal";
import CaseSessionCard from "../components/CaseSessionCard";
import ConfirmDialog from "../components/ConfirmDialog";
import {
  continueConsultation,
  endConsultation,
  fetchConsultation,
  startConsultation,
  transcribeTurn,
} from "../services/consultationService";
import { getSocket, joinConsultationRoom } from "../services/socket";

function formatElapsed(startedAt) {
  if (!startedAt) return "00:00";
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
  const m = String(Math.floor(seconds / 60)).padStart(2, "0");
  const s = String(seconds % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function TranscriptLine({ message }) {
  return (
    <div className="rounded-2xl bg-slate-100 px-4 py-2.5 text-sm text-slate-700">
      {message.message}
    </div>
  );
}

export default function ConsultationRoom() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [consultation, setConsultation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [assigningNurse, setAssigningNurse] = useState(false);
  const [isStartingNext, setIsStartingNext] = useState(false);
  const [isContinuing, setIsContinuing] = useState(false);
  const [confirmingNextSession, setConfirmingNextSession] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [, forceTick] = useState(0);

  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);

  function addMessageIfNew(message) {
    setConsultation((c) => {
      if (!c) return c;
      if (c.messages.some((m) => m.id === message.id)) return c;
      return { ...c, messages: [...c.messages, message] };
    });
  }

  useEffect(() => {
    fetchConsultation(id)
      .then(setConsultation)
      .finally(() => setLoading(false));

    joinConsultationRoom(id);
    const socket = getSocket();
    const onNewMessage = (msg) => addMessageIfNew(msg);
    const onCompleted = (data) => setConsultation(data);
    // Reopened from another device or tab — this one has to drop back out of
    // the completed view or it would keep showing a summary that is about to
    // be regenerated.
    const onResumed = (data) => setConsultation(data);
    socket.on("new_message", onNewMessage);
    socket.on("consultation_completed", onCompleted);
    socket.on("consultation_resumed", onResumed);

    return () => {
      socket.off("new_message", onNewMessage);
      socket.off("consultation_completed", onCompleted);
      socket.off("consultation_resumed", onResumed);
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.onstop = null; // leaving the page cancels any in-flight segment
        recorderRef.current.stop();
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!consultation || consultation.status !== "in_progress") return;
    const interval = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(interval);
  }, [consultation]);

  // One MediaRecorder runs for as long as the doctor leaves the mic on —
  // no auto-chopping into fixed-length chunks. Short, arbitrarily-cut clips
  // are exactly what makes Whisper hallucinate ("Hi Gemini, how can I help
  // you today?"); a single take of real speech transcribes far more
  // reliably, and Gemini reconstructs who-said-what from the full text at
  // end_consultation anyway, so nothing is lost by not tagging speakers live.
  async function startRecording() {
    setErrorMsg("");
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    chunksRef.current = [];

    const recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorderRef.current = recorder;
    recorder.start();
    setIsRecording(true);
  }

  // Stops the recorder and transcribes the whole take as one clip. Returns
  // a promise so callers (End Consultation) can wait for the last bit of
  // audio to land before generating the summary.
  function stopRecording() {
    return new Promise((resolve) => {
      const recorder = recorderRef.current;
      if (!recorder || recorder.state === "inactive") {
        resolve();
        return;
      }
      recorder.onstop = async () => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        setIsRecording(false);

        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        chunksRef.current = [];
        if (blob.size > 0) {
          setIsProcessing(true);
          try {
            const message = await transcribeTurn(id, "unknown", blob);
            addMessageIfNew(message);
          } catch (err) {
            setErrorMsg(err.response?.data?.message || "Could not transcribe that recording.");
          } finally {
            setIsProcessing(false);
          }
        }
        resolve();
      };
      recorder.stop();
    });
  }

  async function handleEndConsultation() {
    await stopRecording();
    setIsEnding(true);
    setErrorMsg("");
    try {
      const result = await endConsultation(id);
      setConsultation(result);
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Could not end this consultation.");
    } finally {
      setIsEnding(false);
    }
  }

  /**
   * Carries on with THIS consultation after it was ended.
   *
   * The patient is still in the room, so what they say next belongs to the
   * visit already under way — recording reopens on the same transcript, and
   * ending again rewrites this session's summary and prescription over the
   * whole conversation. No new session is created.
   */
  async function handleContinue() {
    setIsContinuing(true);
    setErrorMsg("");
    try {
      setConsultation(await continueConsultation(id));
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Could not reopen this consultation.");
    } finally {
      setIsContinuing(false);
    }
  }

  /**
   * Begins the next session of this same course of treatment — for a patient
   * returning on a later day.
   *
   * This creates a *new* consultation on the same case and navigates to it —
   * the session on screen keeps its transcript, summary and prescription
   * exactly as they are. Nothing here writes back to the finished session.
   */
  async function handleStartNextSession() {
    setIsStartingNext(true);
    setErrorMsg("");
    try {
      const next = await startConsultation(consultation.patient_id);
      navigate(`/dashboard/consultations/${next.id}`);
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Could not start the next session.");
      setIsStartingNext(false);
    }
  }

  if (loading) {
    return <div className="h-64 animate-pulse rounded-2xl bg-slate-100" />;
  }

  if (!consultation) {
    return <p className="text-sm text-slate-400">Consultation not found.</p>;
  }

  const isCompleted = consultation.status === "completed";
  // Only the doctor this consultation belongs to can record/end it — enforced
  // server-side too, this just keeps the UI from offering controls that
  // would 403 (e.g. admin oversight, or another doctor opening the link).
  const canManage = Boolean(consultation.can_manage);

  const caseInfo = consultation.case;
  const sessionNumber = consultation.session_number;
  const previousSessions = consultation.previous_sessions || [];
  const latestPrevious = previousSessions[previousSessions.length - 1];
  // Only worth showing once a case actually has more than one session —
  // "Session 1 of 1" is noise on a routine single-visit consultation.
  const showSessionLabel = Boolean(caseInfo && sessionNumber && caseInfo.session_count > 1);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => navigate("/dashboard/consultations")}
            className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700"
          >
            <HiArrowLeft className="h-4 w-4" />
            Back to consultations
          </button>

          {showSessionLabel && (
            <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700">
              Session {sessionNumber} of {caseInfo.session_count}
            </span>
          )}

          {caseInfo && (
            <Link
              to={`/dashboard/cases/${caseInfo.id}`}
              className="flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-brand-700"
            >
              <HiOutlineFolderOpen className="h-4 w-4" />
              View full case
            </Link>
          )}
        </div>

        {!isCompleted && (
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-sm text-slate-500">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Live Consultation · {formatElapsed(consultation.started_at)}
            </span>
            {canManage ? (
              <button
                onClick={handleEndConsultation}
                disabled={isEnding || isProcessing}
                className="rounded-full border border-red-200 px-4 py-1.5 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-60"
              >
                {isEnding ? "Generating summary…" : isProcessing ? "Wrapping up…" : "End Consultation"}
              </button>
            ) : (
              <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-500">
                View only
              </span>
            )}
          </div>
        )}

        {isCompleted && canManage && (
          <div className="flex flex-wrap items-center gap-3">
            {/* Exactly one of these two, decided by the server from the date:
                the patient is still here (carry on with this same
                conversation) or they have come back another day (a new
                session). Offering both would invite one visit to be split
                across two records. */}
            {consultation.can_continue ? (
              <button
                onClick={handleContinue}
                disabled={isContinuing}
                title="The patient has more to say — reopen recording on this same consultation"
                className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-brand-500 to-brand-700 px-4 py-1.5 text-sm font-semibold text-white shadow-md transition hover:shadow-lg disabled:opacity-60"
              >
                <HiOutlineMicrophone className="h-4 w-4" />
                {isContinuing ? "Reopening…" : "Continue consultation"}
              </button>
            ) : consultation.continue_blocked_by_verification ? (
              // Continuing rewrites the prescription, so a signed one has to
              // be unlocked first — say so here rather than letting the
              // button 409.
              <span
                title="Unlock the prescription below to add more to this consultation"
                className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700"
              >
                Unlock the prescription to continue this consultation
              </span>
            ) : (
              caseInfo?.status === "open" && (
                <button
                  onClick={() => setConfirmingNextSession(true)}
                  disabled={isStartingNext}
                  title="The patient has returned on a later day — record a new session on this case"
                  className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-brand-500 to-brand-700 px-4 py-1.5 text-sm font-semibold text-white shadow-md transition hover:shadow-lg disabled:opacity-60"
                >
                  <HiOutlineMicrophone className="h-4 w-4" />
                  {isStartingNext ? "Starting…" : "Start next session"}
                </button>
              )
            )}

            {/* Handing the patient to a nurse only makes sense once the visit
                is over and there's a prescription to carry across. */}
            <button
              onClick={() => setAssigningNurse(true)}
              className="flex items-center gap-1.5 rounded-full bg-teal-600 px-4 py-1.5 text-sm font-semibold text-white shadow-md transition hover:bg-teal-700"
            >
              <HiOutlineHeart className="h-4 w-4" />
              Assign nurse
            </button>
          </div>
        )}
      </div>

      {errorMsg && (
        <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{errorMsg}</p>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
        <PatientInfoPanel patient={consultation.patient_detail} />

        <div className="space-y-6">
          {/* What happened on this patient's earlier visits, read-only and
              collapsed by default. A doctor recording a follow-up needs last
              time's conversation, diagnosis and medicines in front of them,
              and should not have to leave the room to get them. */}
          {previousSessions.length > 0 && (
            <div className="rounded-2xl border border-slate-100 bg-white shadow-sm">
              <button
                onClick={() => setShowHistory((v) => !v)}
                aria-expanded={showHistory}
                className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
              >
                <span className="flex items-center gap-2">
                  <HiOutlineClipboardDocumentList className="h-5 w-5 text-brand-600" />
                  <span className="text-sm font-semibold text-slate-900">
                    Previous history — {previousSessions.length} earlier session
                    {previousSessions.length === 1 ? "" : "s"}
                  </span>
                  {latestPrevious?.summary?.possible_diagnosis && !showHistory && (
                    <span className="hidden truncate text-sm text-slate-400 sm:inline">
                      · last seen{" "}
                      {latestPrevious.ended_at
                        ? new Date(latestPrevious.ended_at).toLocaleDateString()
                        : "previously"}
                    </span>
                  )}
                </span>
                <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-slate-500">
                  {showHistory ? "Hide" : "Show"}
                  <HiOutlineChevronDown
                    className={`h-4 w-4 transition ${showHistory ? "rotate-180" : ""}`}
                  />
                </span>
              </button>

              {showHistory && (
                <div className="space-y-4 border-t border-slate-100 bg-slate-50/60 px-5 py-5">
                  {previousSessions.map((session) => (
                    <CaseSessionCard key={session.id} session={session} />
                  ))}
                </div>
              )}
            </div>
          )}

          {!isCompleted && (
            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <div className="max-h-[420px] space-y-3 overflow-y-auto pb-2">
                {consultation.messages.length === 0 && !isProcessing ? (
                  <p className="py-10 text-center text-sm text-slate-400">
                    {canManage
                      ? "Nothing recorded yet. Press the mic, have the whole consultation normally, then press stop — the AI will sort out who said what."
                      : "Nothing recorded yet."}
                  </p>
                ) : (
                  consultation.messages.map((m) => <TranscriptLine key={m.id} message={m} />)
                )}
                {isProcessing && (
                  <p className="py-2 text-center text-sm text-slate-400">
                    Listening back and writing up the conversation…
                  </p>
                )}
              </div>

              {canManage ? (
                <div className="mt-4 flex flex-col items-center gap-3 border-t border-slate-100 pt-4">
                  <p className="text-sm text-slate-400">
                    {isProcessing
                      ? "Processing what was just recorded…"
                      : isRecording
                        ? "Recording… just talk normally, the AI will sort out who said what."
                        : "Press the mic, have the whole consultation, then press stop."}
                  </p>

                  <button
                    onClick={isRecording ? stopRecording : startRecording}
                    disabled={isProcessing}
                    aria-label={isRecording ? "Stop recording" : "Start recording"}
                    className={`grid h-14 w-14 place-items-center rounded-full text-white shadow-lg transition disabled:opacity-60 ${
                      isRecording
                        ? "animate-pulse bg-red-500 shadow-red-500/40"
                        : "bg-gradient-to-br from-brand-500 to-brand-700 shadow-brand-500/40"
                    }`}
                  >
                    {isRecording ? (
                      <HiOutlineStop className="h-6 w-6" />
                    ) : (
                      <HiOutlineMicrophone className="h-6 w-6" />
                    )}
                  </button>
                </div>
              ) : (
                <p className="mt-4 border-t border-slate-100 pt-4 text-center text-sm text-slate-400">
                  Only {consultation.doctor} can record or end this consultation.
                </p>
              )}
            </div>
          )}

          {isCompleted && (
            <SummaryPanel
              summary={consultation.summary}
              prescriptions={consultation.prescriptions}
              consultationId={consultation.id}
              patientName={consultation.patient}
              verified={consultation.prescription_verified}
              verifiedBy={consultation.prescription_verified_by}
              verifiedAt={consultation.prescription_verified_at}
              canManage={canManage}
              // Verifying or editing returns the whole updated consultation,
              // so the panel re-renders from the server's copy.
              onConsultationUpdated={setConsultation}
            />
          )}

          {/* The bridge from "this visit is documented" to "this treatment is
              documented" — the consolidated report lives on the case, not
              here, and a doctor finishing a session needs to know that. */}
          {isCompleted && caseInfo && (
            <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-5">
              <p className="text-sm font-medium text-slate-700">
                {caseInfo.status === "open"
                  ? "This session is part of an ongoing course of treatment."
                  : "This session is part of a closed course of treatment."}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                {caseInfo.status === "open"
                  ? "The summary and prescription above cover this session only. When the patient's treatment is finished, end it on the case to get one report covering every session with a single final prescription."
                  : "The consolidated report covering every session is on the case."}
              </p>
              {/* Spelling out the rule where the decision is actually made,
                  so nobody has to learn it by hitting a 409. */}
              {caseInfo.status === "open" && (
                <p className="mt-2 text-xs text-slate-400">
                  {consultation.can_continue
                    ? "Still with the patient? Use Continue consultation — today's visit stays one record. A new session is for when they come back another day."
                    : "This visit is closed. If the patient returns on another day, start a new session — it gets its own summary and prescription, and this one is left untouched."}
                </p>
              )}
              <Link
                to={`/dashboard/cases/${caseInfo.id}`}
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 transition hover:text-brand-700"
              >
                <HiOutlineFolderOpen className="h-4 w-4" />
                Open case {caseInfo.code} ({caseInfo.session_count} session
                {caseInfo.session_count === 1 ? "" : "s"}) →
              </Link>
            </div>
          )}
        </div>
      </div>

      {confirmingNextSession && (
        <ConfirmDialog
          title="Start a new session?"
          message={
            "A new session is for a visit on a different day — it gets its own summary and " +
            "prescription, and this one stays exactly as it is. If the patient is still with " +
            "you and simply has more to say, close this and continue the current consultation " +
            "instead so today's visit stays one record."
          }
          confirmLabel="Start new session"
          cancelLabel="Cancel"
          busy={isStartingNext}
          onCancel={() => setConfirmingNextSession(false)}
          onConfirm={() => {
            setConfirmingNextSession(false);
            handleStartNextSession();
          }}
        />
      )}

      {assigningNurse && (
        <AssignNurseModal
          patientId={consultation.patient_id}
          patientName={consultation.patient}
          consultationId={consultation.id}
          defaultPlan={consultation.summary?.possible_diagnosis || ""}
          onClose={() => setAssigningNurse(false)}
          onAssigned={(assignment) => {
            setAssigningNurse(false);
            navigate(`/dashboard/nursing/${assignment.id}`);
          }}
        />
      )}
    </div>
  );
}
