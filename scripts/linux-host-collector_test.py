import importlib.util
import io
import json
from pathlib import Path
import subprocess
import sys
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from types import SimpleNamespace
from unittest.mock import patch

source = Path(__file__).with_name("linux-host-collector.py")
spec = importlib.util.spec_from_file_location("collector", source)
collector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collector)
endpoint = "/api/v1/real-integrations/00000000-0000-4000-8000-000000000001/receive"


def environment(url="https://commandry.site" + endpoint):
    return {"COMMANDRY_HOST_RECEIVER_URL": url,
            "COMMANDRY_HOST_RECEIVER_TOKEN": "cmdry_host_" + "a" * 43}


class CollectorTests(unittest.TestCase):
    def test_exact_counter_interpretation(self):
        def read(path):
            return {"/proc/meminfo": "MemTotal: 1000 kB\nMemAvailable: 500 kB\n",
                    "/proc/uptime": "10.8 5", "/proc/loadavg": "0.125 0 0"}[str(path)]
        with patch.object(Path, "read_text", read), patch.object(collector.os, "statvfs", return_value=SimpleNamespace(
                f_blocks=100, f_frsize=1024, f_bavail=25)), patch.object(collector.socket, "gethostname", return_value="pleiades"):
            sample = collector.collect_linux_host()
        self.assertEqual(sample["memory"], {"totalBytes": 1024000, "availableBytes": 512000})
        self.assertEqual(sample["disk"], {"totalBytes": 102400, "availableBytes": 25600})
        self.assertEqual(sample["load1Milli"], 125)
        self.assertEqual(sample["uptimeSeconds"], 10)
        self.assertEqual(sample["hostname"], "pleiades")

    def test_invalid_capacity(self):
        with patch.object(collector.os, "statvfs", return_value=SimpleNamespace(
                f_blocks=10, f_frsize=1024, f_bavail=11)):
            with self.assertRaises(ValueError):
                collector.collect_linux_host()

    def test_configuration_rejected_before_request(self):
        invalid = ["http://example.com" + endpoint, "https://user:secret@example.com" + endpoint,
                   "https://example.com" + endpoint + "?token=secret", "https://example.com" + endpoint + "#x",
                   "https://example.com/wrong", "https://example.com" + endpoint.replace("00000000-", "--------", 1),
                   "https://exam\nple.com" + endpoint, "https://example.com\\@localhost" + endpoint]
        for url in invalid:
            with self.subTest(url=url), self.assertRaises(ValueError):
                collector.send_linux_host({}, environment(url), opener=SimpleNamespace(open=lambda *_a, **_k: self.fail("Network request")))
        config = environment()
        config["COMMANDRY_HOST_RECEIVER_TOKEN"] = "invalid"
        with self.assertRaises(ValueError):
            collector.send_linux_host({}, config)

    def test_receipt_validation(self):
        for status, body, accepted in [(202, b'{"accepted":true,"isSynthetic":false}', True),
                                      (200, b'{"accepted":true,"isSynthetic":false}', False),
                                      (202, b'{"accepted":true,"isSynthetic":true}', False),
                                      (202, b'{"accepted":1,"isSynthetic":0}', False),
                                      (202, b'{}', False), (202, b'x' * 16385, False)]:
            response = io.BytesIO(body)
            response.status = status
            def open_request(request, timeout):
                self.assertEqual(timeout, 15)
                self.assertEqual(request.get_header("Authorization"), "Bearer cmdry_host_" + "a" * 43)
                return response
            opener = SimpleNamespace(open=open_request)
            if accepted:
                collector.send_linux_host({}, environment(), opener)
            else:
                with self.assertRaises(ValueError):
                    collector.send_linux_host({}, environment(), opener)

    def test_actual_http_delivery_and_redirect_refusal(self):
        received = []
        class Handler(BaseHTTPRequestHandler):
            redirect = False
            def do_POST(self):
                received.append((self.path, self.headers.get("Authorization"), json.loads(self.rfile.read(int(self.headers["Content-Length"])))))
                self.send_response(307 if self.redirect else 202)
                self.send_header("Location", "/redirect-target")
                self.end_headers()
                self.wfile.write(b'{"accepted":true,"isSynthetic":false}')
            def log_message(self, *_args):
                pass
        server = HTTPServer(("127.0.0.1", 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            config = environment("http://127.0.0.1:" + str(server.server_port) + endpoint)
            collector.send_linux_host({"hostname": "pleiades"}, config)
            self.assertEqual(received[0][2], {"hostname": "pleiades"})
            Handler.redirect = True
            with self.assertRaises(ValueError):
                collector.send_linux_host({}, config)
            self.assertEqual(len(received), 2, "Redirect must not forward the host token")
        finally:
            server.shutdown()
            server.server_close()
            thread.join()

    def test_cli_error_does_not_log_configuration(self):
        config = environment("https://secret-url.example/wrong")
        result = subprocess.run([sys.executable, "-B", str(source), "--send"], env=config, capture_output=True, text=True)
        self.assertEqual(result.returncode, 1)
        self.assertEqual(result.stdout, "")
        self.assertEqual(result.stderr, "Linux host collection or scoped delivery failed\n")


if __name__ == "__main__":
    unittest.main()
