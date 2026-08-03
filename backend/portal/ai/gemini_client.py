import json
import os
import subprocess
import tempfile

from google import genai
from google.genai import types

from portal.ai import ffmpeg_setup  # noqa: F401  (puts ffmpeg on PATH)

_client = None

SYSTEM_INSTRUCTION = """You are a clinical documentation assistant embedded in a hospital's \
consultation system. You are NOT a doctor and must never present a diagnosis as final \
or certain — all diagnosis output is assistive only, for the treating doctor to review.

The transcript you receive is captured from a single continuous recording of the whole visit \
with no speaker tags — the doctor did not manually mark who was talking. Your first job is to \
read the raw transcript segments and reconstruct who most likely said each part, using context \
(clinical questions and instructions are almost always the doctor; symptom descriptions and \
answers are almost always the patient). This reconstruction is a best-effort inference, not a \
verified transcript.

Rules:
- Only suggest medicines that appear in the provided hospital formulary list. Never invent \
a medicine name that is not in that list.
- Base the summary strictly on what was actually said in the transcript. Do not invent \
symptoms, history, or details not present in the conversation.
- When reconstructing speaker turns, preserve the original wording — do not paraphrase.
- Write every field in English, even if a stray non-English word or phrase remains in the \
transcript (the audio may mix English with Hindi, Telugu, Tamil, or other Indian languages) —
translate anything non-English into clear clinical English rather than copying it verbatim.
- Respond with ONLY valid JSON matching the exact schema requested. No markdown, no prose \
outside the JSON.
"""

RESPONSE_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "labeled_transcript": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "speaker": {"type": "STRING", "enum": ["doctor", "patient"]},
                    "text": {"type": "STRING"},
                },
                "required": ["speaker", "text"],
            },
        },
        "summary": {"type": "STRING"},
        "symptoms": {"type": "STRING"},
        "possible_diagnosis": {"type": "STRING"},
        "follow_up_advice": {"type": "ARRAY", "items": {"type": "STRING"}},
        "lifestyle_advice": {"type": "ARRAY", "items": {"type": "STRING"}},
        "prescriptions": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "medicine_name": {"type": "STRING"},
                    "dose": {"type": "STRING"},
                    "frequency": {"type": "STRING"},
                    "duration": {"type": "STRING"},
                },
                "required": ["medicine_name"],
            },
        },
    },
    "required": [
        "labeled_transcript",
        "summary",
        "symptoms",
        "possible_diagnosis",
        "follow_up_advice",
        "lifestyle_advice",
        "prescriptions",
    ],
}


def _get_client():
    global _client
    if _client is None:
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise RuntimeError("GEMINI_API_KEY is not set in the environment")
        _client = genai.Client(api_key=api_key)
    return _client


TRANSCRIBE_INSTRUCTION = """Transcribe this audio recording of a doctor-patient consultation, \
word for word. Speakers may switch between English and Indian languages (Hindi, Telugu, Tamil, \
or others) within the same sentence — translate everything into clear English. Output ONLY the \
transcribed text: no speaker labels, no timestamps, no commentary, no markdown.

CRITICAL: This is a clinical recording — never invent, guess, or fabricate any dialogue, \
symptoms, or diagnosis that isn't clearly and actually spoken in the audio. If the recording is \
silent, contains no intelligible speech, or is just background/mic noise, output exactly this \
literal token and nothing else: [NO_SPEECH]"""

NO_SPEECH_TOKEN = "[NO_SPEECH]"


def _webm_to_wav(audio_bytes):
    # Gemini's documented audio formats don't include webm/opus (what
    # MediaRecorder produces in the browser); converting to WAV first avoids
    # depending on undocumented format leniency.
    with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as src:
        src.write(audio_bytes)
        src_path = src.name
    dst_path = src_path + ".wav"
    try:
        subprocess.run(
            ["ffmpeg", "-y", "-i", src_path, "-ar", "16000", "-ac", "1", dst_path],
            check=True,
            capture_output=True,
        )
        with open(dst_path, "rb") as f:
            return f.read()
    finally:
        os.remove(src_path)
        if os.path.exists(dst_path):
            os.remove(dst_path)


def transcribe_audio(audio_bytes):
    """Transcribes+translates a recorded consultation clip via Gemini's native
    audio understanding, instead of a local CPU-bound Whisper pass. A
    multi-minute recording that took ~2 minutes on local "small" Whisper comes
    back in a few seconds from Gemini's hosted inference — the doctor isn't
    waiting on this laptop's CPU anymore.
    """
    wav_bytes = _webm_to_wav(audio_bytes)
    model_name = os.getenv("GEMINI_MODEL", "gemini-flash-latest")
    client = _get_client()
    response = client.models.generate_content(
        model=model_name,
        contents=[
            TRANSCRIBE_INSTRUCTION,
            types.Part.from_bytes(data=wav_bytes, mime_type="audio/wav"),
        ],
    )
    text = (response.text or "").strip()
    if NO_SPEECH_TOKEN in text:
        return ""
    return text


def _build_prompt(patient, messages, formulary):
    # Segments are numbered in recording order but deliberately unlabeled —
    # Gemini infers doctor/patient from content, not from any tag we provide.
    transcript = "\n".join(f"[{i + 1}] {m['message']}" for i, m in enumerate(messages))
    formulary_list = "\n".join(f"- {m['name']} (usual dose: {m.get('default_dose') or 'n/a'})" for m in formulary)

    return f"""Patient: {patient.get('name')}, {patient.get('gender') or 'unknown gender'}, \
blood group {patient.get('blood_group') or 'unknown'}.
Known allergies: {patient.get('allergies') or 'none recorded'}.
Medical history: {patient.get('medical_history') or 'none recorded'}.

Raw consultation transcript segments (unlabeled, in chronological order):
{transcript}

Hospital formulary (ONLY suggest medicines from this list):
{formulary_list}

First reconstruct labeled_transcript (who most likely said each part), then generate the \
clinical summary, assistive diagnosis, prescription suggestions, and advice — all as JSON \
matching the required schema."""


def generate_consultation_summary(patient, messages, formulary):
    model_name = os.getenv("GEMINI_MODEL", "gemini-flash-latest")
    prompt = _build_prompt(patient, messages, formulary)

    client = _get_client()
    config = types.GenerateContentConfig(
        system_instruction=SYSTEM_INSTRUCTION,
        response_mime_type="application/json",
        response_schema=RESPONSE_SCHEMA,
    )

    last_error = None
    for _attempt in range(2):
        response = client.models.generate_content(
            model=model_name, contents=prompt, config=config
        )
        try:
            return json.loads(response.text)
        except (json.JSONDecodeError, TypeError) as exc:
            last_error = exc
            continue

    raise ValueError(f"Gemini did not return valid JSON after retry: {last_error}")
