#!/usr/bin/env python3
"""Continuously collect cat snapshots to the Mac desktop over SSH/SCP."""
import argparse
from datetime import datetime
import json
import fcntl
import os
from pathlib import Path
import shlex
import shutil
import subprocess
import sys
import signal
import time
import uuid


def atomic_json(path, value):
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")
    temporary.replace(path)


def transport(args, program):
    prefix = ["sshpass", "-e"] if os.environ.get("SSHPASS") else []
    command = prefix + [program, "-o", "ConnectTimeout=5", "-o", "StrictHostKeyChecking=yes",
                        "-o", "ServerAliveInterval=10", "-o", "ServerAliveCountMax=3"]
    if prefix:
        command += ["-o", "PubkeyAuthentication=no", "-o", "NumberOfPasswordPrompts=1"]
    return command


def download(args, event, directory, number):
    remote = Path(event["path"])
    if remote.parent != Path("/mnt/rc_mmcblk0p8/cat_observation") / directory.name:
        raise ValueError("Unexpected remote photo path")
    target = directory / f"{number:02d}_cat.jpg"
    temporary = target.with_suffix(".part")
    try:
        # Camera filenames contain spaces; SSH streaming avoids legacy SCP name checks.
        with temporary.open('wb') as output:
            subprocess.run(transport(args, "ssh") + [f"{args.user}@{args.host}",
                                                    "cat " + shlex.quote(str(remote))],
                           stdout=output, check=True, timeout=60)
        with temporary.open("rb") as image:
            header = image.read(2)
            image.seek(-2,2)
            if header != b"\xff\xd8" or image.read(2) != b"\xff\xd9":
                raise ValueError("Downloaded file is not JPEG")
        temporary.replace(target)
    finally:
        temporary.unlink(missing_ok=True)
    return {**event, "local_path": str(target), "bytes": target.stat().st_size, "camera_id": args.camera_id}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", required=True)
    parser.add_argument("--user", default="root")
    parser.add_argument("--output", type=Path, default=Path.home() / "Desktop" / "reCamera猫观察")
    parser.add_argument("--resume", type=Path)
    parser.add_argument("--count", type=int, default=3)
    parser.add_argument("--threshold", type=float, default=0.3)
    parser.add_argument("--interval", type=float, default=5)
    parser.add_argument("--absence", type=float, default=2)
    parser.add_argument("--camera-id", default="recamera-default")
    parser.add_argument("--continuous", action="store_true")
    parser.add_argument("--periodic", type=float, default=30)
    parser.add_argument("--snapshot", action="store_true")
    args = parser.parse_args()
    signal.signal(signal.SIGTERM, lambda *_: (_ for _ in ()).throw(KeyboardInterrupt()))
    if not 1 <= args.count <= 100 or not 0 < args.threshold <= 1 or args.interval < 0 or args.absence <= 0 or args.periodic < max(5,args.interval):
        parser.error("Invalid capture parameters")
    if os.environ.get("SSHPASS") and not shutil.which("sshpass"):
        parser.error("Install sshpass, or use an existing SSH key without SSHPASS")
    session = ("smoke-" if args.snapshot else "cats-") + datetime.now().strftime("%Y%m%d-%H%M%S-") + uuid.uuid4().hex[:8]
    directory = args.resume.expanduser().resolve() if args.resume else args.output.expanduser().resolve() / session
    directory.mkdir(parents=True, exist_ok=True)
    import hashlib
    camera_lock = (directory.parent / (".camera-" + hashlib.sha256(args.camera_id.encode()).hexdigest()[:16] + ".lock")).open("w")
    fcntl.flock(camera_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    lock = (directory / '.collector.lock').open('w')
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        raise RuntimeError('This batch already has a running collector') from None
    session = directory.name
    if not session.replace("-", "").isalnum():
        parser.error("Invalid resume directory name")
    manifest = directory / "photos.json"
    photos = json.loads(manifest.read_text()) if manifest.exists() else []
    target_count = 1 if args.snapshot else args.count
    status = directory / "status.json"

    def update(state, **extra):
        atomic_json(status, {"state": state, "saved": len(photos), "target": None if args.continuous else target_count,
                             "camera_id": args.camera_id,
                             "session": session, "updated_at": datetime.now().astimezone().isoformat(), **extra})
        print(json.dumps({"state": state, "saved": len(photos), **extra}, ensure_ascii=False), flush=True)

    update("connecting", folder=str(directory))
    helper = Path(__file__).with_name("camera_collect.py")
    remote_helper = "/userdata/recamera-cat-observation/camera_collect_continuous.py"
    destination = f"{args.user}@{args.host}"
    try:
        subprocess.run(transport(args, "ssh") + [destination, "mkdir -p /userdata/recamera-cat-observation"], check=True, timeout=15)
        subprocess.run(transport(args, "scp") + ["-O", str(helper), destination + ":" + remote_helper], check=True, timeout=30)
    except (subprocess.SubprocessError, OSError) as exc:
        update("connection_failed", message=str(exc))
        raise
    command = shlex.join(["python3", "-u", remote_helper, "--session", session, "--count", str(target_count),
                          "--threshold", str(args.threshold), "--interval", str(args.interval), "--absence", str(args.absence)]
                         + (["--snapshot"] if args.snapshot else [])
                         + (["--continuous", "--periodic", str(args.periodic)] if args.continuous else []))
    try:
        while args.continuous or len(photos) < target_count:
            child = subprocess.Popen(transport(args, "ssh") + [destination, command], stdout=subprocess.PIPE, text=True)
            try:
                for line in child.stdout:
                    try:
                        event = json.loads(line)
                    except ValueError:
                        continue
                    kind = event.pop("event", None)
                    if kind == "capture":
                        if any(photo["path"] == event["path"] for photo in photos):
                            continue
                        try:
                            photo = download(args, event, directory, len(photos) + 1)
                        except (subprocess.SubprocessError, OSError, ValueError) as exc:
                            update("download_error", message=str(exc))
                            continue
                        photos.append(photo)
                        atomic_json(manifest, photos)
                        update("collecting", last_photo=photo["local_path"])
                    elif kind == "heartbeat":
                        update("watching")
                    elif kind == "ready":
                        update("waiting_for_cat", threshold=args.threshold)
                    elif kind and kind.endswith("error"):
                        update(kind, **event)
                code = child.wait()
            finally:
                if child.poll() is None:
                    child.terminate()
                    try:
                        child.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        child.kill()
                        child.wait()
            if args.continuous or len(photos) < target_count:
                update("reconnecting", ssh_exit=code)
                time.sleep(3)
        update("ready_for_review", folder=str(directory), message="照片已收齐，等待在当前对话中分析；尚未自动生成行为总结。")
    except KeyboardInterrupt:
        update("stopped")
        return 130
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:
        print(f"Collector failed: {error}", file=sys.stderr, flush=True)
        sys.exit(1)
