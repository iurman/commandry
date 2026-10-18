"""Dependency-free Linux collector for hosts without the Commandry Node runtime."""

import json
import math
import os
from pathlib import Path
import re
import socket
import sys
from datetime import datetime, timezone
import urllib.request
from urllib.parse import urlsplit
from uuid import uuid4

OS_RELEASE_PATHS = ("/etc/os-release", "/usr/lib/os-release")
OS_IDENTIFIER = re.compile(r"[a-z0-9._-]{1,64}")


def parse_os_release(text):
    """Shell-style KEY=value assignments, as os-release(5) defines them."""
    values = {}
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        if not re.fullmatch(r"[A-Z][A-Z0-9_]*", key):
            continue
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            quote, value = value[0], value[1:-1]
            if quote == '"':
                value = re.sub(r'\\([\\$"`])', r"\1", value)
        values[key] = value
    return values


def collect_linux_os():
    """Operating system identity, or None when os-release cannot be read.
    Values are clamped to the receiver contract so they never cost a sample."""
    for path in OS_RELEASE_PATHS:
        try:
            values = parse_os_release(Path(path).read_bytes().decode("utf-8", "replace"))
            break
        except OSError:
            continue
    else:
        return None
    identifier = values.get("ID", "").strip().lower()
    like = [item for item in values.get("ID_LIKE", "").lower().split() if OS_IDENTIFIER.fullmatch(item)]
    # Drop control characters and stop at the receiver's 200 UTF-16 units.
    pretty, units = "", 0
    for char in values.get("PRETTY_NAME", "").strip():
        if ord(char) < 32 or ord(char) == 127:
            continue
        width = 2 if ord(char) > 0xFFFF else 1
        if units + width > 200:
            break
        pretty, units = pretty + char, units + width
    # Proxmox VE reports ID=debian; its management tooling identifies it.
    proxmox = os.path.isfile("/usr/bin/pveversion") or os.path.isdir("/etc/pve")
    return {
        "id": identifier if OS_IDENTIFIER.fullmatch(identifier) else "linux",
        "idLike": list(dict.fromkeys(like))[:8],
        "prettyName": pretty.strip() or "Linux",
        "platform": "proxmox-ve" if proxmox else None,
    }


def collect_linux_host():
    memory = Path("/proc/meminfo").read_text()
    total = int(re.search(r"^MemTotal:\s+(\d+) kB$", memory, re.M)[1]) * 1024
    available = int(re.search(r"^MemAvailable:\s+(\d+) kB$", memory, re.M)[1]) * 1024
    disk = os.statvfs("/")
    sample = {
        "hostname": socket.gethostname(),
        "sampleId": str(uuid4()),
        "observedAt": datetime.now(timezone.utc).isoformat(),
        "memory": {"totalBytes": total, "availableBytes": available},
        "disk": {
            "totalBytes": disk.f_blocks * disk.f_frsize,
            "availableBytes": disk.f_bavail * disk.f_frsize,
        },
        "uptimeSeconds": math.floor(float(Path("/proc/uptime").read_text().split()[0])),
        "load1Milli": math.floor(float(Path("/proc/loadavg").read_text().split()[0]) * 1000 + 0.5),
    }
    counters = [*sample["memory"].values(), *sample["disk"].values(),
                sample["uptimeSeconds"], sample["load1Milli"]]
    if any(not isinstance(n, int) or n < 0 or n > 2**53 - 1 for n in counters):
        raise ValueError("Invalid Linux host counters")
    for capacity in (sample["memory"], sample["disk"]):
        if capacity["totalBytes"] <= 0 or capacity["availableBytes"] > capacity["totalBytes"]:
            raise ValueError("Invalid Linux host capacity")
    if sample["uptimeSeconds"] > 2147483647 or sample["load1Milli"] > 2147483647:
        raise ValueError("Invalid Linux host counters")
    system = collect_linux_os()
    if system is not None:
        sample["os"] = system
    return sample


class RefuseRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, new_url):
        raise ValueError("Host receiver redirects are refused")


def send_linux_host(sample, environment=None, opener=None):
    environment = os.environ if environment is None else environment
    address = environment.get("COMMANDRY_HOST_RECEIVER_URL", "")
    endpoint = urlsplit(address)
    token = environment.get("COMMANDRY_HOST_RECEIVER_TOKEN", "")
    if (re.search(r"[\x00-\x20\\]", address)
            or endpoint.scheme not in ("http", "https") or not endpoint.hostname
            or (endpoint.scheme == "http" and endpoint.hostname not in ("localhost", "127.0.0.1", "::1"))
            or endpoint.username is not None or endpoint.password is not None
            or "?" in address or "#" in address
            or not re.fullmatch(r"/api/v1/real-integrations/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}/receive", endpoint.path)
            or not re.fullmatch(r"cmdry_host_[A-Za-z0-9_-]{43}", token)):
        raise ValueError("Invalid scoped receiver configuration")
    request = urllib.request.Request(address, data=json.dumps(sample).encode(), method="POST",
                                     headers={"Content-Type": "application/json", "Authorization": "Bearer " + token,
                                              "User-Agent": "Commandry-Linux-Host-Collector/1.0"})
    if opener is None:
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), RefuseRedirects())
    with opener.open(request, timeout=15) as response:
        if response.status != 202:
            raise ValueError("Host receiver rejected sample")
        body = response.read(16385)
        if len(body) > 16384:
            raise ValueError("Host receiver receipt exceeds limit")
        receipt = json.loads(body)
        if receipt.get("accepted") is not True or receipt.get("isSynthetic") is not False:
            raise ValueError("Invalid host receiver receipt")


def main():
    try:
        if sys.argv[1:] not in ([], ["--send"]):
            raise ValueError("Use no arguments to sample or --send to submit")
        sample = collect_linux_host()
        if sys.argv[1:]:
            send_linux_host(sample)
            print(json.dumps({"accepted": True, "observedAt": sample["observedAt"]}))
        else:
            print(json.dumps(sample))
        return 0
    except Exception:
        print("Linux host collection or scoped delivery failed", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
