import json
from pathlib import Path
import sys
import threading
import tempfile
import unittest
import urllib.error
from http.server import BaseHTTPRequestHandler, HTTPServer
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts' / 'recamera'))
from upload_to_website import UploadClient

class Handler(BaseHTTPRequestHandler):
    code=201
    observed=[]
    def log_message(self, *args):
        pass
    def do_POST(self):
        content=self.rfile.read(int(self.headers.get('Content-Length',0)))
        if self.headers.get('User-Agent','').startswith('Python-urllib/'):
            self.send_response(403)
            self.end_headers()
            return
        type(self).observed.append((self.path,content,self.headers.get('X-Catapp-Photo-Id')))
        self.send_response(type(self).code)
        if type(self).code==302:
            self.send_header('Location','http://127.0.0.1:1/should-not-follow')
        self.end_headers()
        self.wfile.write(json.dumps({'accepted':True,'photoId':'server-id'}).encode())

class UploadTests(unittest.TestCase):
    def setUp(self):
        Handler.code=201
        Handler.observed=[]
        self.server=HTTPServer(('127.0.0.1',0),Handler)
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True)
        self.thread.start()
        self.config={'website_url':f'http://127.0.0.1:{self.server.server_port}','token':'test-token-only','device_id':'camera-test','allow_http_lan':True}
    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
    def test_raw_photo_and_stable_id_are_uploaded(self):
        with tempfile.TemporaryDirectory() as directory:
            image=Path(directory)/'frame.jpg'
            image.write_bytes(b'photo-for-transport-test')
            c=UploadClient(self.config)
            result=c.upload(image,{'photo_id':'same-frame','captured_at':'2026-10-21T10:00:00Z'})
            self.assertTrue(result['accepted'])
            self.assertEqual(Handler.observed[0],('/api/device/photos',image.read_bytes(),'same-frame'))
            self.assertTrue(image.exists())  # transport does not remove input before queue records ACK
    def test_redirect_does_not_forward_device_credential(self):
        Handler.code=302
        with self.assertRaises(urllib.error.HTTPError) as caught:
            UploadClient(self.config).heartbeat(True)
        self.assertEqual(caught.exception.code,302)
        self.assertEqual(len(Handler.observed),1)
    def test_http_requires_explicit_lan_permission_and_url_has_no_embedded_credentials(self):
        with self.assertRaises(ValueError):
            UploadClient({**self.config,'allow_http_lan':False})
        with self.assertRaises(ValueError):
            UploadClient({**self.config,'website_url':'https://user:pass@example.com'})

if __name__=='__main__':
    unittest.main()
