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

const SEGMENT_MS = 8000; // length of each auto-recorded chunk while "live"

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
  const [isEnding, setIsEnding] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [, forceTick] = useState(0);

  // sessionActiveRef drives the segment-record loop; it's a ref (not state)
  // so the async loop always sees the latest value without a stale closure.
  const sessionActiveRef = useRef(false);
  const streamRef = useRef(null);

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
      sessionActiveRef.current = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!consultation || consultation.status !== "in_progress") return;
    const interval = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(interval);
  }, [consultation]);

  // Records one SEGMENT_MS clip and resolves with the completed Blob. Each
  // segment is its own full MediaRecorder start/stop cycle (not a timeslice
  // on one long recorder) so every blob is independently a valid, decodable
  // audio file for Whisper.
  function recordSegment(stream, durationMs) {
    return new Promise((resolve) => {
      const recorder = new MediaRecorder(stream);
      const chunks = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      recorder.onstop = () => {
        resolve(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
      };
      recorder.start();
      setTimeout(() => {
        if (recorder.state !== "inactive") recorder.stop();
      }, durationMs);
    });
  }

  async function recordingLoop(stream) {
    while (sessionActiveRef.current) {
      const blob = await recordSegment(stream, SEGMENT_MS);
      if (!sessionActiveRef.current) break;
      if (blob.size > 0) {
        try {
          const message = await transcribeTurn(id, "unknown", blob);
          addMessageIfNew(message);
        } catch {
          // A single silent/unclear segment shouldn't stop the whole session.
        }
      }
    }
  }

  async function startRecording() {
    setErrorMsg("");
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    sessionActiveRef.current = true;
    setIsRecording(true);
    recordingLoop(stream);
  }

  function stopRecording() {
    sessionActiveRef.current = false;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setIsRecording(false);
  }

  async function handleEndConsultation() {
    stopRecording();
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
                disabled={isEnding}
                className="rounded-full border border-red-200 px-4 py-1.5 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-60"
              >
                {isEnding ? "Generating summary…" : "End Consultation"}
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
                      ? "Nothing recorded yet. Press the mic and have the consultation normally — no need to tag who's speaking."
                      : "Nothing recorded yet."}
                  </p>
                ) : (
                  consultation.messages.map((m) => <TranscriptLine key={m.id} message={m} />)
                )}
              </div>

              {canManage ? (
                <div className="mt-4 flex flex-col items-center gap-3 border-t border-slate-100 pt-4">
                  <p className="text-sm text-slate-400">
                    {isRecording
                      ? "Recording… just talk normally, the AI will sort out who said what."
                      : "Press the mic to start recording the consultation."}
                  </p>

                  <button
                    onClick={isRecording ? stopRecording : startRecording}
                    aria-label={isRecording ? "Stop recording" : "Start recording"}
                    className={`grid h-14 w-14 place-items-center rounded-full text-white shadow-lg transition ${
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
