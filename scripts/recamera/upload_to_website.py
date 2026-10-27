#!/usr/bin/env python3
"""On-device cat capture with durable HTTP upload. No GPIO or model changes."""
import argparse
import asyncio
from datetime import datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from camera_collect import Camera, AppearanceGate, cat_score


def atomic_json(file, data):
    temporary = file.with_suffix(file.suffix + '.tmp')
    with temporary.open('w') as stream:
        json.dump(data, stream)
        stream.flush()
        os.fsync(stream.fileno())
    temporary.replace(file)


class UploadClient:
    def __init__(self, config):
        self.base = config['website_url'].rstrip('/')
        url = urllib.parse.urlsplit(self.base)
        if url.scheme not in ('https', 'http') or not url.netloc or url.username or url.password or url.query or url.fragment or url.path:
            raise ValueError('website_url must be an HTTPS origin without path')
        if url.scheme == 'http' and not config.get('allow_http_lan', False):
            raise ValueError('HTTPS required; allow_http_lan is only for explicit LAN tests')
        self.token = config['token']
        self.device_id = config['device_id']
        self.max_upload_bytes = config.get('max_upload_bytes', 900 * 1024)
        if not isinstance(self.max_upload_bytes, int) or not 1024 <= self.max_upload_bytes <= 30 * 1024 * 1024:
            raise ValueError('max_upload_bytes must be between 1024 and 30 MiB')
        self.ctx = ssl.create_default_context(cafile=config.get('ca_file'))
        # Do not follow redirects with an Authorization header to another host.
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, *args, **kwargs):
                return None
        self.opener = urllib.request.build_opener(NoRedirect(), urllib.request.HTTPSHandler(context=self.ctx), urllib.request.ProxyHandler({}))

    def request(self, route, body, headers):
        request = urllib.request.Request(self.base + route, data=body, headers={**headers, 'User-Agent': 'CatApp-reCamera/1.0', 'Authorization': 'Bearer ' + self.token}, method='POST')
        with self.opener.open(request, timeout=30) as response:
            return json.load(response)

    def upload(self, file, metadata):
        prepare_upload(file, self.max_upload_bytes)
        result = self.request('/api/device/photos', file.read_bytes(), {'Content-Type': 'image/jpeg', 'X-Catapp-Photo-Id': metadata['photo_id'], 'X-Catapp-Captured-At': metadata['captured_at']})
        if result.get('accepted') is not True or not result.get('photoId'):
            raise RuntimeError('Server did not acknowledge the photo')
        return result

    def heartbeat(self, watching):
        return self.request('/api/device/heartbeat', b'', {'X-Catapp-State': 'watching' if watching else 'connected'})


def prepare_upload(file, limit):
    """Persist bounded JPEG bytes before sending; retries reuse identical bytes."""
    if file.stat().st_size <= limit:
        return
    # Firmware Pillow JPEG codecs may fail on hardware frames. Use the
    # device's OpenCV codec for both decoding and encoding.
    import cv2
    image = cv2.imread(str(file))
    if image is None:
        raise ValueError('Cannot decode camera JPEG')
    while True:
        for quality in (90, 80, 70, 60, 50):
            encoded, output = cv2.imencode('.jpg', image, [cv2.IMWRITE_JPEG_QUALITY, quality])
            if not encoded:
                raise ValueError('Cannot encode camera JPEG')
            data = output.tobytes()
            if len(data) <= limit:
                temporary = file.with_suffix(file.suffix + '.upload.tmp')
                try:
                    with temporary.open('wb') as stream:
                        stream.write(data)
                        stream.flush()
                        os.fsync(stream.fileno())
                    temporary.replace(file)
                finally:
                    temporary.unlink(missing_ok=True)
                return
        height, width = image.shape[:2]
        if (width, height) == (1, 1):
            raise ValueError('Cannot fit JPEG within upload limit')
        image = cv2.resize(image, (max(1, width * 3 // 4), max(1, height * 3 // 4)), interpolation=cv2.INTER_AREA)


async def run(config, snapshot=False):
    import websockets
    directory = Path(config.get('spool_dir', '/mnt/rc_mmcblk0p8/catapp_upload'))
    directory.mkdir(parents=True, exist_ok=True)
    client = UploadClient(config)
    camera = Camera()
    gate = AppearanceGate(config.get('interval', 5), config.get('absence', 2), config.get('periodic', 30))
    last_frame = [0.0]
    stop = asyncio.Event()
    def note(state):
        print(json.dumps({'state': state}), flush=True)

    async def send_pending():
        while not stop.is_set():
            try:
                await asyncio.to_thread(client.heartbeat, time.monotonic() - last_frame[0] < 15)
                for record in sorted(directory.glob('*.json')):
                    metadata = json.loads(record.read_text())
                    file = directory / metadata['filename']
                    if file.resolve().parent != directory.resolve():
                        raise ValueError('Invalid queued photo path')
                    await asyncio.to_thread(client.upload, file, metadata)
                    # Retain ACK before deleting our own spool image; restart won't re-upload a missing file.
                    acknowledged = record.with_suffix('.acked')
                    record.replace(acknowledged)
                    file.unlink(missing_ok=True)
                    acknowledged.unlink(missing_ok=True)
                    note('uploaded')
            except urllib.error.HTTPError as error:
                note('authentication_failed' if error.code in (401, 403) else 'upload_error_' + str(error.code))
                if error.code in (401, 403):
                    stop.set()
                    return
            except Exception:
                note('upload_waiting_for_connection')
            await asyncio.sleep(5)

    def save_capture(score):
        file = camera.capture(directory)
        photo_id = uuid.uuid4().hex
        metadata = {'photo_id': photo_id, 'filename': file.name, 'captured_at': datetime.now().astimezone().isoformat(), 'score': score}
        record = directory / (photo_id + '.json')
        atomic_json(record, metadata)
        return file, record, metadata

    if snapshot:
        file, record, metadata = await asyncio.to_thread(save_capture, None)
        await asyncio.to_thread(client.upload, file, metadata)
        acknowledged = record.with_suffix('.acked')
        record.replace(acknowledged)
        file.unlink(missing_ok=True)
        acknowledged.unlink(missing_ok=True)
        note('snapshot_uploaded')
        return
    # A crash while removing an acknowledged item must not cause a missing-file retry loop.
    for record in directory.glob('*.acked'):
        metadata = json.loads(record.read_text())
        file = directory / metadata['filename']
        if file.resolve().parent == directory.resolve():
            file.unlink(missing_ok=True)
        record.unlink()
    sender = asyncio.create_task(send_pending())
    try:
        while not stop.is_set():
            try:
                async with websockets.connect('wss://127.0.0.1/ws/inference/results', ssl=camera.ctx, extra_headers={'Authorization': 'Bearer ' + camera.token}, ping_interval=20, ping_timeout=20) as ws:
                    note('watching')
                    while not stop.is_set():
                        try:
                            raw = await asyncio.wait_for(ws.recv(), timeout=5)
                        except asyncio.TimeoutError:
                            continue
                        try:
                            payload = json.loads(raw)
                            if not isinstance(payload, dict) or not ('detection' in payload or 'detection' in (payload.get('data') or {})):
                                continue
                            score = cat_score(payload, config.get('threshold', .3))
                        except (ValueError, TypeError, AttributeError):
                            continue
                        now = time.monotonic()
                        last_frame[0] = now
                        if not gate.observe(score is not None, now):
                            continue
                        if len(list(directory.glob('*.json'))) >= config.get('max_pending', 100):
                            note('queue_full')
                            continue
                        try:
                            await asyncio.to_thread(save_capture, score)
                        except Exception:
                            note('capture_error')
                            await asyncio.sleep(3)
                            break
                        gate.captured(time.monotonic())
                        note('captured')
                        break  # reconnect to discard stale buffered inference frames
            except Exception:
                note('detection_connection_error')
                await asyncio.sleep(3)
            gate.disconnected()
    finally:
        sender.cancel()
        try:
            await sender
        except asyncio.CancelledError:
            pass


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', type=Path, required=True)
    parser.add_argument('--snapshot', action='store_true', help='One explicit unconditional capture for isolated transport validation')
    args = parser.parse_args()
    config = json.loads(args.config.read_text())
    interval, absence, periodic = config.get('interval', 5), config.get('absence', 2), config.get('periodic', 30)
    if not 0 < config.get('threshold', .3) <= 1 or interval < 5 or absence <= 0 or periodic < interval or not 1 <= config.get('max_pending', 100) <= 1000:
        parser.error('Invalid capture configuration')
    # Share the existing capture-owner lock, while keeping photos and credentials separate.
    with open('/userdata/recamera-cat-observation/collector.lock', 'w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        asyncio.run(run(config, args.snapshot))


if __name__ == '__main__':
    main()
