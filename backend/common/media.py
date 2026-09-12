import os
from pathlib import Path
import shutil
import subprocess
import uuid

from fastapi import HTTPException, UploadFile

from backend.common.config import ROOT, artifacts_dir


def ffmpeg_path():
    configured = os.getenv("FFMPEG_PATH")
    if configured:
        return configured
    installed = shutil.which("ffmpeg")
    if installed:
        return installed
    bundled = next((str(p) for p in (ROOT / ".tools/imageio_ffmpeg/binaries").glob("ffmpeg-*") if p.is_file()), None)
    if bundled:
        return bundled
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


def run_media_command(args):
    try:
        subprocess.run([ffmpeg_path(), "-hide_banner", "-loglevel", "error", "-nostdin", *args],
                       check=True, capture_output=True, text=True, timeout=180)
    except subprocess.CalledProcessError as exc:
        raise ValueError("Could not decode the recording with FFmpeg") from exc


def save_upload(upload: UploadFile, allowed):
    suffix = Path(upload.filename or "").suffix.lower()
    if suffix not in allowed:
        raise HTTPException(415, f"Supported file extensions: {', '.join(sorted(allowed))}")
    run_id = uuid.uuid4().hex
    directory = artifacts_dir() / "runs" / run_id
    for name in ("inputs", "intermediates", "outputs", "logs"):
        (directory / name).mkdir(parents=True, exist_ok=True)
    target = directory / "inputs" / f"recording{suffix}"
    limit = int(os.getenv("MAX_UPLOAD_MB", "100")) * 1024 * 1024
    size = 0
    with target.open("wb") as stream:
        while chunk := upload.file.read(1024*1024):
            size += len(chunk)
            if size > limit:
                stream.close()
                target.unlink(missing_ok=True)
                raise HTTPException(413, "Recording exceeds MAX_UPLOAD_MB")
            stream.write(chunk)
    if not size:
        target.unlink(missing_ok=True)
        raise HTTPException(400, "Recording is empty")
    return run_id, target


def prepare_video(source, destination):
    run_media_command(["-y", "-i", str(source), "-map", "0:v:0", "-map", "0:a:0",
                       "-vf", "scale=1280:720:force_original_aspect_ratio=decrease:force_divisible_by=2",
                       "-c:v", "libx264", "-crf", "23", "-preset", "fast", "-pix_fmt", "yuv420p",
                       "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", "-map_metadata", "-1", str(destination)])
    if Path(destination).stat().st_size > 18*1024*1024:
        raise ValueError("Compressed video exceeds the demo's 18 MiB inline limit; use a shorter recording")
    return destination
