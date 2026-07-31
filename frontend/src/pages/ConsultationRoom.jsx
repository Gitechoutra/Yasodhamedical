import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  HiOutlineMicrophone,
  HiOutlineStop,
  HiArrowLeft,
  HiOutlineHeart,
} from "react-icons/hi2";
import PatientInfoPanel from "../components/PatientInfoPanel";
import SummaryPanel from "../components/SummaryPanel";
import AssignNurseModal from "../components/nursing/AssignNurseModal";
import {
  endConsultation,
  fetchConsultation,
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
    socket.on("new_message", onNewMessage);
    socket.on("consultation_completed", onCompleted);

    return () => {
      socket.off("new_message", onNewMessage);
      socket.off("consultation_completed", onCompleted);
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

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <button
          onClick={() => navigate("/dashboard/consultations")}
          className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700"
        >
          <HiArrowLeft className="h-4 w-4" />
          Back to consultations
        </button>

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

        {/* Handing the patient to a nurse only makes sense once the visit is
            over and there's a prescription to carry across. */}
        {isCompleted && canManage && (
          <button
            onClick={() => setAssigningNurse(true)}
            className="flex items-center gap-1.5 rounded-full bg-teal-600 px-4 py-1.5 text-sm font-semibold text-white shadow-md transition hover:bg-teal-700"
          >
            <HiOutlineHeart className="h-4 w-4" />
            Assign nurse
          </button>
        )}
      </div>

      {errorMsg && (
        <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{errorMsg}</p>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
        <PatientInfoPanel patient={consultation.patient_detail} />

        <div className="space-y-6">
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
        </div>
      </div>

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
