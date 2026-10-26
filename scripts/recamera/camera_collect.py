#!/usr/bin/env python3
"""On-device, cat-only capture. No GPIO or model configuration writes."""
import argparse
import asyncio
from datetime import datetime
import json
import fcntl
import math
from pathlib import Path
import shutil
import ssl
import time
import urllib.request


def emit(kind, **fields):
    print(json.dumps({"event": kind, **fields}, ensure_ascii=False), flush=True)


def cat_score(payload, threshold):
    detection = payload.get("detection") or payload.get("data", {}).get("detection", {})
    scores = []
    for entry in detection.get("entries", []):
        if entry.get("class_name") != "cat":
            continue
        try:
            value = float(entry.get("score", 0))
            if math.isfinite(value) and value >= threshold:
                scores.append(value)
        except (ValueError, TypeError):
            continue
    return max(scores, default=None)


class AppearanceGate:
    def __init__(self, interval=5, absence=2, periodic=30):
        self.periodic = periodic
        self.interval = interval
        self.absence = absence
        self.armed = True
        self.absent_since = None
        self.last_capture = -float("inf")

    def observe(self, present, now):
        if not present:
            if self.absent_since is None:
                self.absent_since = now
            if now - self.absent_since >= self.absence:
                self.armed = True
            return False
        self.absent_since = None
        return (self.armed or now - self.last_capture >= self.periodic) and now - self.last_capture >= self.interval

    def captured(self, now):
        self.armed = False
        self.last_capture = now

    def disconnected(self):
        # A network gap is not evidence that the cat left the frame.
        self.absent_since = None


class Camera:
    def __init__(self):
        self.ctx = ssl._create_unverified_context()
        self.token = self.request("/web/setting", authenticated=False).get("sApiKey")
        if not self.token:
            raise RuntimeError("Camera local API key unavailable")

    def request(self, path, data=None, authenticated=True):
        headers = {}
        if authenticated:
            headers["Authorization"] = "Bearer " + self.token
        body = None
        if data is not None:
            body = json.dumps(data).encode()
            headers["Content-Type"] = "application/json"
        request = urllib.request.Request(
            "https://127.0.0.1/cgi-bin/entry.cgi" + path, data=body, headers=headers
        )
        with urllib.request.urlopen(request, context=self.ctx, timeout=8) as response:
            result = json.load(response)
        if result.get("code", 0) != 0:
            raise RuntimeError("Camera API rejected request: " + str(result.get("message", "unknown")))
        return result

    def capture(self, directory):
        if shutil.disk_usage(directory).free < 200 * 1024 * 1024:
            raise RuntimeError("Less than 200 MB free on camera")
        result = self.request("/record/capture/start", {"sOutput": str(directory), "sFormat": "JPG"})
        capture_id = (result.get("dCapture") or {}).get("sID")
        if not capture_id:
            raise RuntimeError("Capture not started (another capture may be running)")
        deadline = time.monotonic() + 20
        while time.monotonic() < deadline:
            capture = self.request("/record/capture/status").get("dLastCapture") or {}
            if capture.get("sID") == capture_id:
                status = capture.get("sStatus")
                if status == "COMPLETED":
                    path = Path(capture.get("sOutputDirectory", directory)) / capture["sFileName"]
                    if path.resolve().parent != directory.resolve() or not path.is_file():
                        raise RuntimeError("Unexpected capture output path")
                    with path.open("rb") as image:
                        if image.read(2) != b"\xff\xd8":
                            raise RuntimeError("Capture is not JPEG")
                    return path
                if status in {"FAILED", "INTERRUPTED", "CANCELED"}:
                    raise RuntimeError("Capture " + status)
            time.sleep(0.3)
        raise RuntimeError("Capture status timed out; image may remain on camera")


async def collect(args):
    import websockets

    if not args.session.replace("-", "").isalnum():
        raise ValueError("Invalid session identifier")
    directory = Path("/mnt/rc_mmcblk0p8/cat_observation") / args.session
    directory.mkdir(parents=True, exist_ok=True)
    manifest = directory / "events.jsonl"
    # Replay committed events when the computer reconnects; never recapture a full batch.
    events = [json.loads(line) for line in manifest.read_text().splitlines()] if manifest.exists() else []
    for event in events:
        emit("capture", **event)
    camera = Camera()
    if args.snapshot:
        if events:
            return
        path = await asyncio.to_thread(camera.capture, directory)
        event = {"path": str(path), "captured_at": datetime.now().astimezone().isoformat(), "score": None}
        with manifest.open("a") as stream:
            stream.write(json.dumps(event) + "\n")
        emit("capture", **event)
        return
    gate = AppearanceGate(args.interval, args.absence, args.periodic)
    if events:
        gate.captured(time.monotonic())
    total = len(events)
    while args.continuous or total < args.count:
        try:
            async with websockets.connect(
                "wss://127.0.0.1/ws/inference/results", ssl=camera.ctx,
                extra_headers={"Authorization": "Bearer " + camera.token},
                ping_interval=20, ping_timeout=20,
            ) as ws:
                emit("ready", saved=total, target=args.count, threshold=args.threshold)
                last_heartbeat = time.monotonic()
                async for raw in ws:
                    if time.monotonic() - last_heartbeat >= 5:
                        emit("heartbeat", saved=total)
                        last_heartbeat = time.monotonic()
                    try:
                        payload = json.loads(raw)
                        # Only actual detection frames can establish cat absence.
                        if not isinstance(payload, dict) or not (
                            "detection" in payload or "detection" in (payload.get("data") or {})
                        ):
                            continue
                        score = cat_score(payload, args.threshold)
                    except (ValueError, TypeError, AttributeError):
                        continue
                    now = time.monotonic()
                    if not gate.observe(score is not None, now):
                        continue
                    try:
                        path = await asyncio.to_thread(camera.capture, directory)
                    except Exception as exc:
                        emit("capture_error", message=str(exc))
                        await asyncio.sleep(3)
                        break  # reconnect to discard buffered, outdated detections
                    gate.captured(time.monotonic())
                    event = {"path": str(path), "captured_at": datetime.now().astimezone().isoformat(), "score": score}
                    with manifest.open("a") as stream:
                        stream.write(json.dumps(event) + "\n")
                        stream.flush()
                    total += 1
                    emit("capture", **event)
                    # Reconnect after capture so buffered detection frames cannot falsely rearm.
                    break
        except Exception as exc:
            emit("connection_error", message=str(exc))
            await asyncio.sleep(3)
        gate.disconnected()
    emit("complete", saved=total)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--session", required=True)
    parser.add_argument("--count", type=int, default=3)
    parser.add_argument("--threshold", type=float, default=0.3)
    parser.add_argument("--interval", type=float, default=5)
    parser.add_argument("--absence", type=float, default=2)
    parser.add_argument("--continuous", action="store_true")
    parser.add_argument("--periodic", type=float, default=30)
    parser.add_argument("--snapshot", action="store_true", help="One unconditional camera smoke-test image")
    args = parser.parse_args()
    if not (1 <= args.count <= 100 and 0 < args.threshold <= 1 and args.interval >= 0 and args.absence > 0 and args.periodic >= max(5,args.interval)):
        parser.error("Invalid capture parameters")
    # One owner of the capture endpoint; a reconnect must not fork a second watcher.
    with open('/userdata/recamera-cat-observation/collector.lock', 'w') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise RuntimeError('Another cat collector is still running') from None
        asyncio.run(collect(args))


if __name__ == "__main__":
    main()
