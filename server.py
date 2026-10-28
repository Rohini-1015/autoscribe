import http.server
import socketserver
import json
import urllib.request
import urllib.error
import os
import mimetypes

PORT = int(os.environ.get("PORT", 8000))
SARVAM_API_KEY = os.environ.get("SARVAM_API_KEY", "")

# Load .env file
env_file = os.path.join(os.path.dirname(__file__), ".env")
if os.path.exists(env_file):
    with open(env_file, "r") as f:
        for line in f:
            if line.startswith("SARVAM_API_KEY="):
                SARVAM_API_KEY = line.split("=", 1)[1].strip()

class AutoScribeSarvamHandler(http.server.SimpleHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_POST(self):
        if self.path == '/api/tts':
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            
            try:
                data = json.loads(body or '{}')
                text = data.get('text', '')
                gender = str(data.get('gender', 'male')).lower()
                speed = float(data.get('speed', 1.0))

                if not text:
                    self.send_json_response(400, {'error': 'Text prompt is required.'})
                    return

                if not SARVAM_API_KEY or 'PASTE_YOUR_SARVAM_API_KEY' in SARVAM_API_KEY:
                    self.send_json_response(503, {
                        'error': 'Sarvam API key is not configured in backend .env file.',
                        'setupRequired': True
                    })
                    return

                speaker = 'sumit' if gender == 'male' else 'ritu'

                payload = json.dumps({
                    'inputs': [text],
                    'target_language_code': 'en-IN',
                    'speaker': speaker,
                    'pitch': 0,
                    'pace': speed,
                    'loudness': 1.5,
                    'speech_sample_rate': 8000,
                    'enable_preprocessing': True,
                    'model': 'bulbul:v3'
                }).encode('utf-8')

                sarvam_url = "https://api.sarvam.ai/text-to-speech"
                req = urllib.request.Request(
                    sarvam_url,
                    data=payload,
                    headers={
                        'Content-Type': 'application/json',
                        'api-subscription-key': SARVAM_API_KEY
                    }
                )

                try:
                    with urllib.request.urlopen(req) as response:
                        res_data = response.read().decode('utf-8')
                        parsed = json.loads(res_data)
                        audio_content = ""
                        if 'audios' in parsed and isinstance(parsed['audios'], list) and len(parsed['audios']) > 0:
                            audio_content = parsed['audios'][0]
                        elif 'audioContent' in parsed:
                            audio_content = parsed['audioContent']

                        self.send_json_response(200, {
                            'audioContent': audio_content,
                            'speaker': speaker,
                            'model': 'bulbul:v3',
                            'pace': speed
                        })
                except urllib.error.HTTPError as e:
                    err_msg = e.read().decode('utf-8')
                    self.send_json_response(e.code, {
                        'error': 'Sarvam AI Text-to-Speech API error',
                        'details': err_msg
                    })

            except Exception as e:
                self.send_json_response(500, {'error': str(e)})
            return

        self.send_error(404, "Not Found")

    def send_json_response(self, status, obj):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(obj).encode('utf-8'))

if __name__ == "__main__":
    print(f"AutoScribe Server active at http://localhost:{PORT}")
    print(f"Sarvam AI TTS Endpoint: http://localhost:{PORT}/api/tts")
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), AutoScribeSarvamHandler) as httpd:
        httpd.serve_forever()
