from pathlib import Path
import urllib.request

URL = (
    "https://storage.googleapis.com/mediapipe-models/"
    "face_landmarker/face_landmarker/float16/1/face_landmarker.task"
)


def main() -> None:
    dest = Path(__file__).resolve().parents[1] / "models" / "face_landmarker.task"
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 1000:
        print(f"Model already present: {dest}")
        return
    print(f"Downloading {URL}")
    urllib.request.urlretrieve(URL, dest)
    print(f"Wrote {dest} ({dest.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
