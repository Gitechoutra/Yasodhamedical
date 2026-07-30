import os
import shutil
import tempfile

import imageio_ffmpeg

# openai-whisper shells out to the literal command "ffmpeg". imageio-ffmpeg
# ships a static binary so we don't need a system-wide FFmpeg install, but
# its file is named e.g. "ffmpeg-win-x86_64-v7.1.exe" — on Windows, the
# process launcher matches PATH entries by exact filename (no PATHEXT
# guessing like cmd.exe does), so simply adding its directory to PATH isn't
# enough. We copy it once into our own bin dir under the exact name
# "ffmpeg.exe" and put that dir on PATH instead.
_bin_dir = os.path.join(os.path.dirname(__file__), "..", "..", ".bin")
os.makedirs(_bin_dir, exist_ok=True)
_ffmpeg_alias = os.path.join(_bin_dir, "ffmpeg.exe")
if not os.path.exists(_ffmpeg_alias):
    shutil.copy2(imageio_ffmpeg.get_ffmpeg_exe(), _ffmpeg_alias)

os.environ.setdefault("PATH", "")
if _bin_dir not in os.environ["PATH"]:
    os.environ["PATH"] = _bin_dir + os.pathsep + os.environ["PATH"]

import whisper  # noqa: E402  (import after PATH patch above)

_model = None


def _get_model():
    global _model
    if _model is None:
        # "base" is fast but noticeably inaccurate on real speech (accents,
        # mic noise) — "small" is ~3x the compute but meaningfully more
        # accurate, and still runs fine on CPU for short segments.
        model_name = os.getenv("WHISPER_MODEL", "small")
        _model = whisper.load_model(model_name)
    return _model


def transcribe(audio_bytes, suffix=".webm"):
    """Transcribes a recorded audio blob (webm/opus from MediaRecorder) to text."""
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name

    # Indian consultations routinely mix languages (e.g. English with Hindi,
    # Telugu, Tamil) within the same sentence. task="translate" tells Whisper's
    # multilingual model to output English text no matter what language(s)
    # were spoken, instead of transcribing in the source language — so the
    # rest of the pipeline (storage, Gemini) only ever deals with English.
    # WHISPER_LANGUAGE is an optional hint (e.g. "hi") if one language
    # dominates and you want more reliable detection; left unset, Whisper
    # auto-detects per segment, which handles code-switching better.
    language = os.getenv("WHISPER_LANGUAGE") or None

    try:
        result = _get_model().transcribe(
            tmp_path,
            fp16=False,
            language=language,
            task="translate",
            # Stops a bad guess on one segment from biasing the next words in
            # the same clip into a repeated loop (e.g. "Alla da. Alla da.").
            condition_on_previous_text=False,
        )
        return result["text"].strip()
    finally:
        os.remove(tmp_path)
