import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { HiOutlineMicrophone, HiOutlineStop, HiArrowLeft } from "react-icons/hi2";
import PatientInfoPanel from "../components/PatientInfoPanel";
import SummaryPanel from "../components/SummaryPanel";
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
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [, forceTick] = useState(0);

  // The mic runs as ONE continuous recording per take — never auto-stopped —
  // so audio capture is never paused waiting on a transcription round-trip.
  // A "take" only ends when the doctor clicks stop (or ends the consultation),
  // which is a visible, deliberate gap rather than a silent automatic one.
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const stopResolverRef = useRef(null);

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
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!consultation || consultation.status !== "in_progress") return;
    const interval = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(interval);
  }, [consultation]);

  async function startRecording() {
    setErrorMsg("");
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    chunksRef.current = [];

    const recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      stopResolverRef.current?.(blob);
      stopResolverRef.current = null;
    };

    recorderRef.current = recorder;
    recorder.start();
    setIsRecording(true);
  }

  // Stops the active recorder and resolves with its complete Blob (or null
  // if nothing was recording). Whisper handles long-form audio natively, so
  // this "take" can span the whole visit with no internal chunking at all.
  function stopRecorderAndGetBlob() {
    return new Promise((resolve) => {
      if (!recorderRef.current || recorderRef.current.state === "inactive") {
        resolve(null);
        return;
      }
      stopResolverRef.current = resolve;
      recorderRef.current.stop();
    });
  }

  async function stopRecording() {
    setIsRecording(false);
    setIsTranscribing(true);
    setErrorMsg("");
    try {
      const blob = await stopRecorderAndGetBlob();
      if (blob && blob.size > 0) {
        const message = await transcribeTurn(id, "unknown", blob);
        addMessageIfNew(message);
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Could not transcribe that recording.");
    } finally {
      setIsTranscribing(false);
    }
  }

  async function handleEndConsultation() {
    if (isRecording) {
      await stopRecording(); // capture and transcribe whatever's still running first
    }
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
                disabled={isEnding || isTranscribing}
                className="rounded-full border border-red-200 px-4 py-1.5 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-60"
              >
                {isEnding
                  ? "Generating summary…"
                  : isTranscribing
                    ? "Finishing up…"
                    : "End Consultation"}
              </button>
            ) : (
              <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-500">
                View only
              </span>
            )}
          </div>
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
                {consultation.messages.length === 0 ? (
                  <p className="py-10 text-center text-sm text-slate-400">
                    {canManage
                      ? "Nothing recorded yet. Press the mic and have the whole consultation normally — no need to tag who's speaking, and no need to pause."
                      : "Nothing recorded yet."}
                  </p>
                ) : (
                  consultation.messages.map((m) => <TranscriptLine key={m.id} message={m} />)
                )}
              </div>

              {canManage ? (
                <div className="mt-4 flex flex-col items-center gap-3 border-t border-slate-100 pt-4">
                  <p className="text-sm text-slate-400">
                    {isTranscribing
                      ? "Transcribing… this can take a little while for longer recordings."
                      : isRecording
                        ? "Recording — keep talking normally, nothing is missed until you stop."
                        : "Press the mic to start recording. Leave it running for the whole visit for best results."}
                  </p>

                  <button
                    onClick={isRecording ? stopRecording : startRecording}
                    disabled={isTranscribing}
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
            />
          )}
        </div>
      </div>
    </div>
  );
}
