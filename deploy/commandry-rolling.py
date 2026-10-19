#!/usr/bin/env python3
"""Root-controlled two-slot rollout. Never log Docker output or credentials."""

import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone


class Rejected(RuntimeError):
    pass


class Deferred(Rejected):
    pass


def require(condition, reason):
    if not condition:
        raise Rejected(reason)


def utc():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def epoch(value):
    return datetime.strptime(value, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc).timestamp()


def assignments(path):
    result = {}
    for line in path.read_text().splitlines():
        if not line or line.startswith("#"):
            continue
        key, separator, value = line.partition("=")
        require(separator and key not in result, "ambiguous controlled assignments")
        result[key] = value
    return result


def atomic(path, content):
    temporary = path.with_name(path.name + ".rolling-tmp")
    require(not temporary.is_symlink() and not path.is_symlink(), "symlinked state")
    with temporary.open("w") as target:
        os.chmod(temporary, 0o600)
        target.write(content)
        target.flush()
        os.fsync(target.fileno())
    os.replace(temporary, path)
    descriptor = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def json_write(path, value):
    atomic(path, json.dumps(value, sort_keys=True) + "\n")


def proxy_config(active, previous):
    require(active in ("web", "web_next") and previous in ("web", "web_next"), "invalid web slot")
    static = ""
    fallback = ""
    if active != previous:
        fallback = f" {previous}:3000"
        # Only immutable static GET/HEAD requests fall back on a 404. Writes
        # are never retried or replayed against another version.
        static = f"""
    @static {{
        path /_next/static/*
        method GET HEAD
    }}
    handle @static {{
        reverse_proxy {active}:3000 {previous}:3000 {{
            header_up X-Forwarded-Proto https
            lb_policy first
            health_uri /health/ready
            health_interval 2s
            health_timeout 2s
            @missing status 404
            handle_response @missing {{
                reverse_proxy {previous}:3000
            }}
        }}
    }}
"""
    return f"""# Managed by the constrained Commandry rollout controller.
:80 {{
    encode zstd gzip
{static}
    handle {{
        reverse_proxy {active}:3000{fallback} {{
            header_up X-Forwarded-Proto https
            lb_policy first
            health_uri /health/ready
            health_interval 2s
            health_timeout 2s
            health_fails 1
            health_passes 2
            stream_close_delay 5m
        }}
    }}
}}
"""


class Rollout:
    def __init__(self, root=Path("/")):
        self.root = root
        self.base = root / "opt/commandry"
        self.config = root / "etc/commandry"
        self.state = root / "var/lib/commandry"
        self.env = self.config / "commandry.env"
        self.marker = self.state / "current-release"
        self.journal = self.state / "rolling-pending.json"
        self.active = self.state / "rolling-active.json"
        self.receipt = self.state / "app-smoke.latest.json"
        self.caddyfile = self.base / "deploy/Caddyfile"
        self.policy_path = self.config / "rolling-policy.json"
        self.uid = os.geteuid()
        self.safe_env = {"PATH": os.environ["PATH"], "HOME": "/root" if root == Path("/") else str(root)}
        if root != Path("/"):
            self.safe_env["COMMANDRY_TEST_ROOT"] = str(root)
        self.started = time.monotonic()
        self.phase_started = self.started
        self.timings = []
        self._step = "preflight"

    @property
    def step(self):
        return self._step

    @step.setter
    def step(self, value):
        now = time.monotonic()
        self.timings.append({"phase": self._step, "seconds": round(now - self.phase_started, 3)})
        self._step, self.phase_started = value, now

    def trusted(self, path, private=False):
        info = path.lstat()
        require(not path.is_symlink() and info.st_uid == self.uid and not info.st_mode & 0o022,
                "untrusted controlled path")
        if private:
            require(not info.st_mode & 0o077, "non-private controlled path")

    def run(self, args, data=None, timeout=180):
        result = subprocess.run(args, input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                env=self.safe_env, timeout=timeout, check=False)
        require(result.returncode == 0, "controlled command failed at " + self.step)
        return result.stdout

    def docker(self, *args, data=None, timeout=180):
        return self.run(["docker", *args], data, timeout)

    def compose(self, *args, data=None, timeout=180):
        return self.docker("compose", "--project-directory", str(self.base), "--env-file", str(self.env),
                           "-f", str(self.base / "compose.production.yaml"),
                           "-f", str(self.base / "deploy/compose.rolling.yaml"),
                           "-p", "commandry", *args, data=data, timeout=timeout)

    def event(self, result, **details):
        with (self.state / "rolling-deployments.jsonl").open("a") as stream:
            stream.write(json.dumps({"time": utc(), "result": result, "step": self.step,
                                     "elapsedSeconds": round(time.monotonic() - self.started, 3),
                                     "phases": self.timings,
                                     **details}) + "\n")

    def preflight(self):
        require(self.root != Path("/") or self.uid == 0, "root required")
        for path in (self.base, self.base / "deploy", self.config, self.state):
            self.trusted(path, path in (self.config, self.state))
        for path in (self.env, self.marker, self.policy_path):
            self.trusted(path, True)
        for path in (self.base / "compose.production.yaml", self.base / "deploy/compose.rolling.yaml",
                     self.caddyfile, self.base / "deploy/validate-app-smoke-receipt.py",
                     self.root / "usr/local/sbin/commandry-app-smoke",
                     self.root / "usr/local/sbin/commandry-backup-gate"):
            self.trusted(path)
        self.policy = json.loads(self.policy_path.read_text())
        require(self.policy["version"] == 1 and self.policy["repository"] == "iurman/commandry",
                "unsupported rollout policy")
        require(isinstance(self.policy.get("enabled"), bool) and
                type(self.policy.get("minimumRunId")) is int and self.policy["minimumRunId"] > 0,
                "invalid automatic enrollment")
        for name in ("controls", "migrations"):
            require(re.fullmatch(r"[0-9a-f]{64}", self.policy[name]), "invalid policy fingerprint")
        require(10 <= self.policy["confirmSeconds"] <= 300 and
                300 <= self.policy["retainSeconds"] <= 86400, "invalid verification interval")
        if self.active.exists():
            self.trusted(self.active, True)

    def verify_database(self, marker):
        try:
            self._verify_database(marker)
        except (Rejected, OSError, ValueError, KeyError, subprocess.TimeoutExpired):
            # Availability never grants authority to use a replacement cluster.
            self.compose("stop", "cloudflared", "caddy", "web", "web_next", "worker")
            raise Rejected("database identity unverified; Commandry ingress closed") from None

    def _verify_database(self, marker):
        volumes = json.loads(self.docker("volume", "inspect", marker["VOLUME"]))
        require(len(volumes) == 1 and volumes[0]["Driver"] == "local" and
                volumes[0]["Labels"]["org.commandry.bootstrap-id"] == marker["BOOTSTRAP_ID"] and
                volumes[0]["Labels"]["com.docker.compose.project"] == "commandry" and
                volumes[0]["Labels"]["com.docker.compose.volume"] == "postgres_data",
                "database volume identity changed")
        cluster = self.compose("exec", "-T", "postgres", "psql", "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1",
                               "-U", "postgres", "-d", "postgres", "-c",
                               "select system_identifier from pg_control_system()").decode().strip()
        require(cluster == marker["CLUSTER_ID"], "database cluster identity changed")

    def health(self, slot, image, revision, through_proxy=False):
        origin = "http://caddy" if through_proxy else "http://127.0.0.1:3000"
        javascript = """(async()=>{
          for(const p of ['/health/live','/health/ready','/version']){
            const r=await fetch(process.argv[1]+p,{signal:AbortSignal.timeout(5000)});
            if(!r.ok) throw Error('readiness');
            if(p==='/version') {const v=await r.json();
              if(v.sha!==process.argv[2] || v.imageDigest!==process.argv[3] || v.environment!=='production')
                throw Error('identity');}
          }
        })().catch(()=>process.exit(1));"""
        self.compose("exec", "-T", slot, "node", "-e", javascript, origin, revision, image, timeout=25)

    def worker_stop(self, allow_failed=False):
        identifier = self.compose("ps", "-a", "-q", "worker").decode().strip()
        require(re.fullmatch(r"[a-f0-9]{12,64}", identifier), "worker identity unavailable")
        self.compose("stop", "-t", "90", "worker", timeout=105)
        state = json.loads(self.docker("inspect", identifier))[0]["State"]
        require(not state["Running"] and (allow_failed or (state["ExitCode"] == 0 and not state["OOMKilled"])),
                "worker did not drain cleanly")

    def smoke(self, slot, image, revision, owner_input):
        self.receipt.unlink(missing_ok=True)
        self.run([str(self.root / "usr/local/sbin/commandry-app-smoke"), str(self.env), image, revision, slot],
                 owner_input, timeout=100)
        self.trusted(self.receipt, True)
        self.run(["python3", str(self.base / "deploy/validate-app-smoke-receipt.py"),
                  str(self.receipt), image, revision])
        evidence = json.loads(self.receipt.read_text())
        require(evidence["bootstrapCreated"] is False, "rolling release must not bootstrap an owner")

    def route(self, configuration):
        # Preserve the inode of the initial installation's single-file bind
        # mount so a Caddy restart reads the newly validated route too.
        self.compose("exec", "-T", "caddy", "sh", "-c", "cat > /tmp/commandry-rollout.Caddyfile",
                     data=configuration.encode())
        self.compose("exec", "-T", "caddy", "caddy", "validate", "--config",
                     "/tmp/commandry-rollout.Caddyfile", "--adapter", "caddyfile")
        with self.caddyfile.open("w") as stream:
            stream.write(configuration)
            stream.flush()
            os.fsync(stream.fileno())
        self.compose("exec", "-T", "caddy", "caddy", "reload", "--config",
                     "/etc/caddy/Caddyfile", "--adapter", "caddyfile")

    def backup(self, approval, marker_text):
        started = time.monotonic()
        receipt = self.state / "predeploy-backup.receipt"
        receipt.unlink(missing_ok=True)
        self.run([str(self.root / "usr/local/sbin/commandry-backup-gate"), "predeploy", str(receipt),
                  approval["IMAGE"], approval["REVISION"]], timeout=900)
        self.trusted(receipt, True)
        proof = assignments(receipt)
        for name in ("OFFSITE", "VERIFIED", "RESTORE_PASSED", "HOST_RECOVERY_DRILL_PASSED"):
            require(proof[name] == "true", "backup recovery gate did not pass")
        for name in ("SNAPSHOT", "DUMP_SHA256", "GLOBALS_SNAPSHOT", "GLOBALS_SHA256",
                     "CONFIG_SNAPSHOT", "CONFIG_SHA256", "RELEASE_MARKER_SHA256"):
            require(re.fullmatch(r"[0-9a-f]{64}", proof[name]), "invalid backup proof")
        require(proof["RELEASE_STATE"] == "current-release" and
                proof["RELEASE_MARKER_SHA256"] == hashlib.sha256(marker_text.encode()).hexdigest() and
                proof["DB_NAME"] == assignments(self.marker)["DB_NAME"], "backup release identity changed")
        require(-60 <= time.time() - epoch(proof["COMPLETED_AT"]) <= 1800, "stale backup proof")
        self.event("recovery_verified", recoverySeconds=round(time.monotonic() - started, 3))
        return proof["SNAPSHOT"]

    def check_main(self, approval):
        if approval["APPROVED_BY"] == "automatic-main":
            require(main_head(self.run) == approval["REVISION"], "main advanced before promotion")
            require(json.loads(self.policy_path.read_text()).get("enabled") is True, "automatic promotion paused")

    def rollback(self, pending):
        self.step = "rollback_database_identity"
        self.verify_database(dict(line.split("=", 1) for line in pending["marker"].splitlines()))
        self.step = "rollback_route"
        self.route(pending["proxy"])
        if pending["workerTouched"]:
            self.step = "rollback_worker_drain"
            self.worker_stop(allow_failed=True)
        atomic(self.env, pending["environment"])
        atomic(self.marker, pending["marker"])
        if pending["workerTouched"]:
            self.step = "rollback_worker_start"
            self.compose("up", "--no-deps", "-d", "--wait", "--wait-timeout", "120", "worker")
        if pending["active"] is None:
            self.active.unlink(missing_ok=True)
        else:
            json_write(self.active, pending["active"])
        self.step = "rollback_verified"
        marker = assignments(self.marker)
        self.health(pending["oldSlot"], marker["IMAGE"], marker["REVISION"], True)
        self.compose("stop", "-t", "30", pending["newSlot"])
        self.journal.unlink()
        self.event("rolled_back", revision=pending["revision"])

    def recover(self):
        if self.journal.exists():
            self.trusted(self.journal, True)
            pending = json.loads(self.journal.read_text())
            self.rollback(pending)
            json_write(self.state / "automatic-rejected.json", {"revision": pending["revision"]})

    def deploy(self, owner_input):
        self.preflight()
        self.recover()
        approval_file = self.config / "approved-release"
        self.trusted(approval_file, True)
        approval = assignments(approval_file)
        image, revision = approval["IMAGE"], approval["REVISION"]
        require(re.fullmatch(r"ghcr.io/iurman/commandry@sha256:[0-9a-f]{64}", image) and
                re.fullmatch(r"[0-9a-f]{40}", revision) and approval["TARGET"] == "production" and
                0 < epoch(approval["EXPIRES_AT"]) - time.time() <= 86400, "invalid approved release")
        marker = assignments(self.marker)
        environment = assignments(self.env)
        require(marker["IMAGE"] == environment["COMMANDRY_IMAGE"] and
                marker["REVISION"] == environment["RELEASE_SHA"] and image != marker["IMAGE"],
                "current release identity differs")
        self.verify_database(marker)
        self.check_main(approval)
        self.step = "candidate_provenance"
        metadata = json.loads(self.docker("image", "inspect", image))[0]
        require(image in metadata["RepoDigests"] and
                metadata["Config"]["Labels"]["org.opencontainers.image.revision"] == revision and
                metadata["Config"]["Labels"]["org.commandry.source.clean"] == "true", "candidate provenance differs")
        policy = json.loads(self.docker("run", "--rm", "--network", "none", "--read-only", "--cap-drop=ALL",
                                       "--security-opt=no-new-privileges", "--memory=64m", "--cpus=0.5",
                                       "--entrypoint", "cat", image, "/app/release-policy.json"))
        require(policy["version"] == 1 and all(policy[name] == self.policy[name] for name in ("controls", "migrations")),
                "migration or deployment controls require operator review")
        active = json.loads(self.active.read_text()) if self.active.exists() else None
        if active:
            require(active["image"] == marker["IMAGE"] and active["revision"] == marker["REVISION"],
                    "active slot identity differs")
            if time.time() - epoch(active["confirmedAt"]) < self.policy["retainSeconds"]:
                raise Deferred("previous release still within minimum retention")
        old_slot = active["slot"] if active else "web"
        require(old_slot in ("web", "web_next"), "invalid active slot")
        new_slot = "web_next" if old_slot == "web" else "web"
        self.health(old_slot, marker["IMAGE"], marker["REVISION"], True)
        old_env, old_marker = self.env.read_text(), self.marker.read_text()
        pending = {"version": 1, "revision": revision, "environment": old_env, "marker": old_marker,
                   "proxy": proxy_config(old_slot, old_slot),
                   "active": {key: value for key, value in active.items() if key != "previous"} if active else None,
                   "oldSlot": old_slot, "newSlot": new_slot, "workerTouched": False}
        json_write(self.journal, pending)
        try:
            self.step = "retire_previous_fallback"
            self.route(proxy_config(old_slot, old_slot))
            self.step = "candidate_environment"
            changed = {"COMMANDRY_IMAGE": image, "RELEASE_SHA": revision,
                       "RELEASE_BUILD_TIME": approval["BUILD_TIME"]}
            atomic(self.env, "\n".join(key + "=" + changed.get(key, value)
                                      for key, value in environment.items()) + "\n")
            self.compose("config", "--quiet")
            # Independent, read-only candidate startup and fresh recovery
            # verification overlap. Neither may advance the worker or routing.
            with ThreadPoolExecutor(max_workers=1) as executor:
                recovery = executor.submit(self.backup, approval, old_marker)
                self.step = "candidate_start"
                self.compose("up", "--no-deps", "-d", "--wait", "--wait-timeout", "120", new_slot)
                self.step = "candidate_stability"
                for _ in range(5):
                    self.health(new_slot, image, revision)
                    time.sleep(2)
                self.step = "fresh_backup_restore_recovery"
                snapshot = recovery.result()
            self.check_main(approval)
            self.verify_database(marker)
            pending["workerTouched"] = True
            json_write(self.journal, pending)
            self.step = "worker_drain"
            self.worker_stop()
            self.step = "candidate_worker"
            self.compose("up", "--no-deps", "-d", "--wait", "--wait-timeout", "120", "worker")
            self.step = "candidate_owner_read_and_worker_smoke"
            self.smoke(new_slot, image, revision, owner_input)
            self.check_main(approval)
            self.step = "traffic_switch"
            self.route(proxy_config(new_slot, old_slot))
            self.step = "confirmation"
            deadline = time.monotonic() + self.policy["confirmSeconds"]
            while time.monotonic() < deadline:
                self.health(new_slot, image, revision, True)
                self.health(new_slot, image, revision)
                self.healthy_worker()
                time.sleep(2)
            self.check_main(approval)
            updated = old_marker.replace("IMAGE=" + marker["IMAGE"], "IMAGE=" + image).replace(
                "REVISION=" + marker["REVISION"], "REVISION=" + revision)
            atomic(self.marker, updated)
            json_write(self.active, {"version": 1, "slot": new_slot, "image": image, "revision": revision,
                                     "confirmedAt": utc(), "previous": pending})
            self.journal.unlink()
            self.step = "confirmed"
            self.event("succeeded", image=image, revision=revision, slot=new_slot, backupSnapshot=snapshot,
                       workerJobId=json.loads(self.receipt.read_text())["workerJobId"])
        except BaseException:
            failed_step = self.step
            try:
                self.rollback(pending)
            except BaseException:
                self.event("rollback_failed", revision=revision, failedStep=failed_step)
                raise Rejected("rollback needs operator recovery; pending journal retained") from None
            self.event("rejected", revision=revision, failedStep=failed_step)
            raise

    def healthy_worker(self):
        identifier = self.compose("ps", "-q", "worker").decode().strip()
        require(re.fullmatch(r"[a-f0-9]{12,64}", identifier), "worker unavailable")
        state = json.loads(self.docker("inspect", identifier))[0]["State"]
        require(state["Running"] and state["Health"]["Status"] == "healthy", "worker unhealthy")


def main_head(run):
    response = run(["git", "ls-remote", "https://github.com/iurman/commandry.git", "refs/heads/main"], timeout=30)
    head = response.decode().strip().split()
    require(len(head) == 2 and re.fullmatch(r"[0-9a-f]{40}", head[0]) and head[1] == "refs/heads/main",
            "main identity unavailable")
    return head[0]


def entry():
    os.umask(0o077)
    args = sys.argv[1:]
    root = Path("/")
    if len(args) == 3 and args[0] == "--test-root":
        require(Path(__file__).resolve() != Path("/opt/commandry/deploy/commandry-rolling.py"),
                "installed command does not accept a test root")
        root, args = Path(args[1]).resolve(), args[2:]
    require(args in (["deploy"], ["rollback"]), "unsupported rollout operation")
    if args == ["rollback"]:
        require(root != Path("/") or os.geteuid() == 0, "root required")
        rollout = Rollout(root)
        rollout.preflight()
        lock = rollout.state / "deploy.lock"
        require(not lock.is_symlink(), "symlinked deployment lock")
        with lock.open("a") as descriptor:
            fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
            rollout.recover()
            active = json.loads(rollout.active.read_text())
            require(active.get("previous"), "no retained rollback target")
            json_write(rollout.journal, active["previous"])
            rollout.rollback(active["previous"])
            json_write(rollout.state / "automatic-rejected.json", {"revision": active["revision"]})
        print("Retained Commandry release restored; rejected revision held.")
        return
    require(os.fstat(9).st_ino == (root / "var/lib/commandry/deploy.lock").stat().st_ino,
            "inherited deployment lock missing")
    fcntl.flock(9, fcntl.LOCK_EX | fcntl.LOCK_NB)
    def interrupted(_number, _frame):
        raise Rejected("rollout interrupted")
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    rollout = Rollout(root)
    owner_input = sys.stdin.buffer.read(514)
    require(len(owner_input) <= 513, "owner input too large")
    rollout.deploy(owner_input)
    print("Commandry candidate confirmed; previous web retained for rollback.")


if __name__ == "__main__":
    try:
        entry()
    except (Rejected, OSError, ValueError, KeyError, subprocess.TimeoutExpired):
        print("Commandry rolling deployment rejected; inspect the private host journal.", file=sys.stderr)
        sys.exit(1)
