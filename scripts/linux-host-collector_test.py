from contextlib import ExitStack
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


def os_release(content, path="/etc/os-release"):
    """Serve one os-release location; every other read_bytes path is missing."""
    def read_bytes(self):
        if content is not None and str(self) == path:
            return content
        raise FileNotFoundError(str(self))
    return patch.object(Path, "read_bytes", read_bytes)


def proxmox(tool=False, cluster=False):
    stack = ExitStack()
    stack.enter_context(patch.object(collector.os.path, "isfile", lambda p: tool and p == "/usr/bin/pveversion"))
    stack.enter_context(patch.object(collector.os.path, "isdir", lambda p: cluster and p == "/etc/pve"))
    return stack


class CollectorTests(unittest.TestCase):
    def test_exact_counter_interpretation(self):
        def read(path):
            return {"/proc/meminfo": "MemTotal: 1000 kB\nMemAvailable: 500 kB\n",
                    "/proc/uptime": "10.8 5", "/proc/loadavg": "0.125 0 0"}[str(path)]
        with patch.object(Path, "read_text", read), patch.object(collector.os, "statvfs", return_value=SimpleNamespace(
                f_blocks=100, f_frsize=1024, f_bavail=25)), patch.object(collector.socket, "gethostname", return_value="pleiades"), \
                os_release(b'PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"\nID=debian\n'), proxmox():
            sample = collector.collect_linux_host()
        self.assertEqual(sample["memory"], {"totalBytes": 1024000, "availableBytes": 512000})
        self.assertEqual(sample["disk"], {"totalBytes": 102400, "availableBytes": 25600})
        self.assertEqual(sample["load1Milli"], 125)
        self.assertEqual(sample["uptimeSeconds"], 10)
        self.assertEqual(sample["hostname"], "pleiades")
        self.assertEqual(sample["os"], {"id": "debian", "idLike": [], "prettyName": "Debian GNU/Linux 12 (bookworm)",
                                        "platform": None})

    def test_os_release_quoting_and_contract_clamps(self):
        self.assertEqual(collector.parse_os_release('# comment\nNAME="Debian \\"GNU\\"/Linux"\nID=\'debian\'\n'
                                                    'lower=ignored\nVERSION_ID=12\n'),
                         {"NAME": 'Debian "GNU"/Linux', "ID": "debian", "VERSION_ID": "12"})
        text = ('ID="Not Valid!"\nID_LIKE="rhel centos fedora rhel BAD!"\nPRETTY_NAME="  \x07Rocky '
                + "x" * 300 + '"\n').encode()
        with os_release(text, path="/usr/lib/os-release"), proxmox():
            system = collector.collect_linux_os()
        self.assertEqual(system["id"], "linux")
        self.assertEqual(system["idLike"], ["rhel", "centos", "fedora"])
        self.assertEqual(len(system["prettyName"]), 200)
        self.assertTrue(system["prettyName"].startswith("Rocky "))
        # The receiver counts UTF-16 code units, so astral characters count twice.
        with os_release(('ID=x\nPRETTY_NAME="' + "\U0001F600" * 150 + '"').encode()), proxmox():
            self.assertEqual(len(collector.collect_linux_os()["prettyName"].encode("utf-16-le")), 400)
        with os_release(b"ID=arch\n"), proxmox():
            self.assertEqual(collector.collect_linux_os()["prettyName"], "Linux")
        # A byte-order mark and CRLF lines read as the Node collector reads them.
        with os_release(b'\xef\xbb\xbfID=ubuntu\r\nPRETTY_NAME="Ubuntu"\r\n'), proxmox():
            self.assertEqual(collector.collect_linux_os()["id"], "ubuntu")
        with os_release(None), proxmox():
            self.assertIsNone(collector.collect_linux_os())

    def test_proxmox_identified_by_tooling_not_debian_base(self):
        text = b'ID=debian\nPRETTY_NAME="Debian GNU/Linux 12 (bookworm)"\n'
        for tool, cluster in [(True, False), (False, True)]:
            with os_release(text), proxmox(tool, cluster):
                system = collector.collect_linux_os()
            self.assertEqual((system["id"], system["platform"]), ("debian", "proxmox-ve"))
        with os_release(text), proxmox():
            self.assertIsNone(collector.collect_linux_os()["platform"])

    def test_unreadable_os_release_keeps_the_sample(self):
        with os_release(None), proxmox():
            sample = collector.collect_linux_host()
        self.assertNotIn("os", sample)

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
                self.assertEqual(request.get_header("User-agent"), "Commandry-Linux-Host-Collector/1.0")
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
