"""Exercise rollout transactions with faulting transports and real private files."""
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]


def module(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


r = module("rolling_test", "deploy/commandry-rolling.py")
a = module("automatic_test", "deploy/commandry-auto-release.py")
a.rolling = r
OLD = "1" * 40
NEW = "2" * 40
OLD_IMAGE = "ghcr.io/iurman/commandry@sha256:" + "a" * 64
NEW_IMAGE = "ghcr.io/iurman/commandry@sha256:" + "b" * 64
POLICY = {"version": 1, "repository": "iurman/commandry", "controls": "c" * 64,
          "migrations": "d" * 64, "confirmSeconds": 10, "retainSeconds": 300, "enabled": True, "minimumRunId": 12345}


class Fake(r.Rollout):
    def __init__(self, root):
        super().__init__(root)
        self.calls = []
        self.fail = None
        self.failed = False
        self.traffic = "web"
        self.worker_image = OLD_IMAGE
        self.bad_database = False
        self.image_policy = POLICY.copy()
        self.receipt_job = "11111111-1111-4111-8111-111111111111"
        for path in (self.base, self.base / "deploy", self.config, self.state, root / "usr/local/sbin"):
            path.mkdir(parents=True, exist_ok=True)
            path.chmod(0o700)
        for path in (self.base / "compose.production.yaml", self.base / "deploy/compose.rolling.yaml",
                     self.caddyfile, self.base / "deploy/validate-app-smoke-receipt.py",
                     root / "usr/local/sbin/commandry-app-smoke", root / "usr/local/sbin/commandry-backup-gate"):
            path.touch()
            path.chmod(0o600)
        r.json_write(self.policy_path, POLICY)
        r.atomic(self.env, f"# retained owner comment\n\nCOMMANDRY_IMAGE={OLD_IMAGE}\nRELEASE_SHA={OLD}\nRELEASE_BUILD_TIME=2026-10-19T00:00:00Z\nPRESERVED_SECRET=private-synthetic\nPRODUCTION_DB_VOLUME_NAME=commandry-db\nDB_NAME=commandry\nDATABASE_URL=postgresql://commandry_app:synthetic@postgres:5432/commandry\nDATABASE_MIGRATION_URL=postgresql://commandry_migrate:synthetic@postgres:5432/commandry\n")
        r.atomic(self.config / "backup.env", "DB_NAME=commandry\n")
        r.atomic(self.marker, f"IMAGE={OLD_IMAGE}\nREVISION={OLD}\nVOLUME=commandry-db\nDB_NAME=commandry\nBOOTSTRAP_ID={'f'*32}\nCLUSTER_ID=7411111111111111111\n")
        r.atomic(self.config / "approved-release", f"IMAGE={NEW_IMAGE}\nREVISION={NEW}\nTARGET=production\nEXPIRES_AT=2099-01-01T00:00:00Z\nBUILD_TIME=2026-10-19T00:00:00Z\nAPPROVED_BY=owner\n")

    def hit(self, operation):
        self.calls.append((self.step, operation, self.traffic, self.worker_image))
        if self.fail == self.step and not self.failed:
            self.failed = True
            raise r.Rejected("injected failure")

    def docker(self, *args, **kwargs):
        self.hit(tuple(args))
        if args[:2] == ("volume", "inspect"):
            return json.dumps([{"Driver": "local", "Labels": {
                "org.commandry.bootstrap-id": "f" * 32,
                "com.docker.compose.project": "commandry",
                "com.docker.compose.volume": "postgres_data"}}]).encode()
        if args[:2] == ("image", "inspect"):
            return json.dumps([{"RepoDigests": [NEW_IMAGE], "Config": {"Labels": {
                "org.opencontainers.image.revision": NEW, "org.commandry.source.clean": "true"}}}]).encode()
        if args[0] == "run":
            return json.dumps(self.image_policy).encode()
        if args[0] == "inspect":
            return json.dumps([{"State": {"Running": False, "ExitCode": 0, "OOMKilled": False}}]).encode()
        raise AssertionError(args)

    def compose(self, *args, **kwargs):
        self.hit(tuple(args))
        if args[:3] == ("exec", "-T", "postgres"):
            return b"7411111111111111112" if self.bad_database else b"7411111111111111111"
        if args[0] == "ps":
            return b"a" * 64
        if args[0] == "up" and args[-1] == "worker":
            self.worker_image = r.assignments(self.env)["COMMANDRY_IMAGE"]
        return b""

    def route(self, configuration):
        self.hit(("route", configuration))
        self.traffic = "web_next" if "reverse_proxy web_next:3000" in configuration else "web"
        self.caddyfile.write_text(configuration)

    def backup(self, approval, marker_text):
        self.hit(("backup",))
        return "e" * 64

    def smoke(self, slot, image, revision, owner_input):
        self.hit(("smoke", slot))
        assert self.worker_image == NEW_IMAGE
        assert self.traffic == "web"
        r.json_write(self.receipt, {"workerJobId": self.receipt_job})

    def healthy_worker(self):
        self.hit(("healthy_worker",))


class RolloutTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="commandry-rolling-test-")
        self.addCleanup(self.temporary.cleanup)
        self.rollout = Fake(Path(self.temporary.name))
        self.old_env = self.rollout.env.read_text()
        self.old_marker = self.rollout.marker.read_text()
        # Make deterministic clock-based stability/expiry checks instantaneous.
        self.clock = patch.object(r.time, "time", return_value=r.epoch("2098-12-31T23:30:00Z"))
        self.clock.start()
        self.addCleanup(self.clock.stop)
        self.sleep = patch.object(r.time, "sleep")
        self.sleep.start()
        self.addCleanup(self.sleep.stop)
        self.monotonic = patch.object(r.time, "monotonic", side_effect=range(1000, 10000, 5))
        self.monotonic.start()
        self.addCleanup(self.monotonic.stop)

    def assert_old(self):
        self.assertEqual(self.rollout.env.read_text(), self.old_env)
        self.assertEqual(self.rollout.marker.read_text(), self.old_marker)
        self.assertEqual(self.rollout.traffic, "web")
        self.assertEqual(self.rollout.worker_image, OLD_IMAGE)
        self.assertFalse(self.rollout.journal.exists())

    def test_confirmed_candidate_after_real_worker_smoke(self):
        self.rollout.deploy(b"synthetic-input")
        active = json.loads(self.rollout.active.read_text())
        self.assertEqual(active["revision"], NEW)
        self.assertEqual(self.rollout.traffic, "web_next")
        self.assertFalse(self.rollout.journal.exists())
        calls = self.rollout.calls
        smoke = next(i for i, call in enumerate(calls) if call[1][0] == "smoke")
        self.assertTrue(all(call[2] == "web" for call in calls[:smoke+1]))
        self.assertFalse(any(call[1][0] == "stop" and any(name in call[1] for name in ("caddy", "cloudflared", "web")) for call in calls))
        self.assertIn("PRESERVED_SECRET=private-synthetic", self.rollout.env.read_text())
        self.assertTrue(self.rollout.env.read_text().startswith("# retained owner comment\n\n"))
        self.assertNotIn("private-synthetic", (self.rollout.state / "rolling-deployments.jsonl").read_text())

    def test_candidate_worker_and_switch_failures_restore_prior_release(self):
        for phase in ("candidate_start", "candidate_stability", "worker_drain", "candidate_worker",
                      "candidate_owner_read_and_worker_smoke", "traffic_switch", "confirmation"):
            with self.subTest(phase=phase):
                self.rollout.fail, self.rollout.failed = phase, False
                with self.assertRaises(r.Rejected):
                    self.rollout.deploy(b"synthetic-input")
                self.assert_old()

    def test_schema_and_control_changes_hold_before_mutation(self):
        for name in ("controls", "migrations"):
            with self.subTest(name=name):
                self.rollout.image_policy = POLICY.copy()
                self.rollout.image_policy[name] = "0" * 64
                with self.assertRaises(r.Rejected):
                    self.rollout.deploy(b"synthetic-input")
                self.assert_old()

    def test_wrong_database_url_role_volume_and_interpolation_reject_before_mutation(self):
        mutations = [("@postgres:5432/commandry", "@other:5432/commandry"),
                     ("//commandry_app:", "//commandry_migrate:"),
                     ("PRODUCTION_DB_VOLUME_NAME=commandry-db", "PRODUCTION_DB_VOLUME_NAME=commandry-other"),
                     ("DB_NAME=commandry", "DB_NAME=other"),
                     ("PRESERVED_SECRET=private-synthetic", "PRESERVED_SECRET=${UNTRUSTED}")]
        for before, after in mutations:
            with self.subTest(after=after):
                changed = self.old_env.replace(before, after)
                r.atomic(self.rollout.env, changed)
                with self.assertRaises(r.Rejected):
                    self.rollout.deploy(b"synthetic-input")
                self.assertEqual(self.rollout.env.read_text(), changed)
                self.assertEqual(self.rollout.marker.read_text(), self.old_marker)
                self.assertFalse(self.rollout.journal.exists())
        r.atomic(self.rollout.env, self.old_env)

    def test_failed_candidate_creation_with_no_worker_restores_old_worker(self):
        compose = self.rollout.compose
        def without_candidate_worker(*args, **kwargs):
            if args[0] == "ps" and self.rollout.step == "rollback_worker_drain":
                return b""
            return compose(*args, **kwargs)
        self.rollout.fail = "candidate_worker"
        with patch.object(self.rollout, "compose", side_effect=without_candidate_worker):
            with self.assertRaises(r.Rejected):
                self.rollout.deploy(b"synthetic-input")
        self.assert_old()

    def test_failed_confirmation_audit_still_has_recoverable_transaction(self):
        event = self.rollout.event
        def failing_audit(result, **kwargs):
            if result == "succeeded":
                raise OSError("injected audit failure")
            event(result, **kwargs)
        with patch.object(self.rollout, "event", side_effect=failing_audit):
            with self.assertRaises(OSError):
                self.rollout.deploy(b"synthetic-input")
        self.assert_old()

    def test_interrupted_journal_recovers_prior_release(self):
        self.rollout.deploy(b"synthetic-input")
        previous = json.loads(self.rollout.active.read_text())["previous"]
        r.json_write(self.rollout.journal, previous)
        self.rollout.recover()
        self.assert_old()
        self.assertEqual(json.loads((self.rollout.state / "automatic-rejected.json").read_text())["revision"], NEW)

    def test_watchdog_restores_previous_release_and_holds_rejected_source(self):
        self.rollout.deploy(b"synthetic-input")
        with patch.object(self.rollout, "healthy_worker", side_effect=r.Rejected("unhealthy worker")):
            a.watchdog(self.rollout)
            self.assertEqual(self.rollout.traffic, "web_next")
            a.watchdog(self.rollout)
        self.assert_old()
        self.assertEqual(json.loads((self.rollout.state / "automatic-rejected.json").read_text())["revision"], NEW)

    def test_minimum_retention_keeps_old_slot_available(self):
        r.json_write(self.rollout.active, {"slot": "web", "image": OLD_IMAGE, "revision": OLD,
                                         "confirmedAt": "2098-12-31T23:29:50Z"})
        with self.assertRaisesRegex(r.Rejected, "retention"):
            self.rollout.deploy(b"synthetic-input")
        self.assert_old()

    def test_new_main_and_api_outage_never_mutate_application(self):
        with patch.object(r, "main_head", return_value=NEW), patch.object(a, "registry_hint", return_value="sha256:" + "b" * 64), patch.object(a, "api", side_effect=OSError("offline")):
            with self.assertRaises(OSError):
                a.tick(self.rollout)
        self.assert_old()

    def test_build_without_publication_hint_does_not_poll_actions_api(self):
        with patch.object(r, "main_head", return_value=NEW), patch.object(a, "registry_hint", return_value=None), patch.object(a, "api") as api:
            a.tick(self.rollout)
            api.assert_not_called()
        self.assert_old()

    def test_settled_canceled_hint_does_not_repeat_github_api_calls(self):
        hint = "sha256:" + "b" * 64
        r.json_write(self.rollout.state / "automatic-poll.json", {"head": NEW, "hint": hint, "terminal": True, "checkedAt": 0})
        with patch.object(r, "main_head", return_value=NEW), patch.object(a, "registry_hint", return_value=hint), patch.object(a, "api") as api:
            a.tick(self.rollout)
            api.assert_not_called()
        self.assert_old()

    def test_backup_receipts_require_every_recovery_and_release_identity(self):
        marker_text = self.rollout.marker.read_text()
        approval = r.assignments(self.rollout.config / "approved-release")
        import hashlib
        proof = {name: "e" * 64 for name in ("SNAPSHOT", "DUMP_SHA256", "GLOBALS_SNAPSHOT",
                 "GLOBALS_SHA256", "CONFIG_SNAPSHOT", "CONFIG_SHA256")}
        proof.update({name: "true" for name in ("OFFSITE", "VERIFIED", "RESTORE_PASSED", "HOST_RECOVERY_DRILL_PASSED")})
        proof.update(RELEASE_STATE="current-release", RELEASE_MARKER_SHA256=hashlib.sha256(marker_text.encode()).hexdigest(),
                     DB_NAME="commandry", COMPLETED_AT="2098-12-31T23:29:50Z")
        receipt = self.rollout.state / "predeploy-backup.receipt"
        def write_proof(*_args, **_kwargs):
            r.atomic(receipt, "".join(key + "=" + value + "\n" for key, value in proof.items()))
            return b""
        with patch.object(self.rollout, "run", side_effect=write_proof):
            self.assertEqual(r.Rollout.backup(self.rollout, approval, marker_text), "e" * 64)
            for field, value in (("HOST_RECOVERY_DRILL_PASSED", "false"), ("RESTORE_PASSED", "false"),
                                 ("RELEASE_MARKER_SHA256", "0" * 64), ("DB_NAME", "other"),
                                 ("COMPLETED_AT", "2020-01-01T00:00:00Z")):
                with self.subTest(field=field):
                    original = proof[field]
                    proof[field] = value
                    with self.assertRaises(r.Rejected):
                        r.Rollout.backup(self.rollout, approval, marker_text)
                    proof[field] = original

    def test_database_identity_failure_closes_only_commandry_ingress(self):
        self.rollout.bad_database = True
        with self.assertRaisesRegex(r.Rejected, "ingress closed"):
            self.rollout.deploy(b"synthetic-input")
        self.assertTrue(any(call[1] == ("stop", "cloudflared", "caddy", "web", "web_next", "worker") for call in self.rollout.calls))
        self.assertFalse(self.rollout.journal.exists())

    def test_symlinked_policy_rejected(self):
        self.rollout.policy_path.unlink()
        self.rollout.policy_path.symlink_to(self.rollout.env)
        with self.assertRaises(r.Rejected):
            self.rollout.deploy(b"synthetic-input")
        self.assert_old()


class QualificationTests(unittest.TestCase):
    def setUp(self):
        self.run = dict(head_sha=NEW, head_branch="main", head_repository={"full_name": "iurman/commandry"},
                        repository={"full_name": "iurman/commandry"}, path=".github/workflows/release-candidate.yml",
                        event="push", status="completed", conclusion="success", id=12345, run_attempt=1)
        self.jobs = {"total_count": len(a.GATES), "jobs": [dict(name=name, conclusion="success", head_sha=NEW,
                     run_id=12345, run_attempt=1) for name in a.GATES]}

    def test_complete_main_run_is_bound_to_attempt_and_source(self):
        self.assertEqual(a.qualified(self.run, self.jobs, NEW, 12345), f"{NEW}-12345-1")

    def test_failed_skipped_missing_duplicate_wrong_source_and_attempt_reject(self):
        for change in ("failed", "skipped", "missing", "duplicate", "source", "attempt"):
            with self.subTest(change=change):
                jobs = json.loads(json.dumps(self.jobs))
                if change in ("failed", "skipped"):
                    jobs["jobs"][0]["conclusion"] = change
                elif change == "missing":
                    jobs["jobs"].pop()
                elif change == "duplicate":
                    jobs["jobs"][0]["name"] = jobs["jobs"][1]["name"]
                elif change == "source":
                    jobs["jobs"][0]["head_sha"] = OLD
                else:
                    jobs["jobs"][0]["run_attempt"] = 2
                with self.assertRaises(a.rolling.Rejected):
                    a.qualified(self.run, jobs, NEW, 12345)

    def test_branch_stale_and_old_runs_reject(self):
        for key, value in (("head_sha", OLD), ("head_branch", "feature"), ("conclusion", "failure"),
                           ("conclusion", "cancelled"), ("id", 12344)):
            candidate = {**self.run, key: value}
            with self.subTest(key=key), self.assertRaises(a.rolling.Rejected):
                a.qualified(candidate, self.jobs, NEW, 12345)

    def test_digest_receipt_is_bound_to_publisher_and_exact_attempt(self):
        status = dict(context="commandry/qualified-image", state="success", description="sha256:" + "a" * 64,
                      creator={"login": "github-actions[bot]"},
                      target_url="https://github.com/iurman/commandry/actions/runs/12345/attempts/1")
        self.assertEqual(a.published_digest([status], self.run), "sha256:" + "a" * 64)
        mutations = [{**status, "creator": {"login": "other"}}, {**status, "state": "pending"},
                     {**status, "target_url": status["target_url"] + "2"}, {**status, "description": "latest"}]
        for candidate in mutations:
            with self.subTest(candidate=candidate), self.assertRaises(r.Rejected):
                a.published_digest([candidate], self.run)
        with self.assertRaises(r.Rejected):
            a.published_digest([status, {**status, "description": "sha256:" + "b" * 64}], self.run)


if __name__ == "__main__":
    unittest.main(verbosity=2)
