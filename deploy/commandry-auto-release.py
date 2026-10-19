#!/usr/bin/env python3
"""Pull public qualification evidence; invoke only the fixed deployment command."""

import fcntl
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
from datetime import datetime, timedelta, timezone
from urllib.request import Request, urlopen

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("commandry_rolling", Path(__file__).with_name("commandry-rolling.py"))
rolling = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rolling)

GATES = {"Source and contracts", "Unit and local tests", "Populated upgrades and governed owner workflows",
         "Build and qualify exact image", "Verify complete release coverage", "Publish qualified main image",
         *(f"Browser shard {number}/6" for number in range(1, 7))}


def qualified(run, jobs, head, minimum):
    rolling.require(run["head_sha"] == head and run["head_branch"] == "main" and
                    run["head_repository"]["full_name"] == "iurman/commandry" and
                    run["repository"]["full_name"] == "iurman/commandry" and
                    run["path"] == ".github/workflows/release-candidate.yml" and
                    run["event"] in ("push", "workflow_dispatch") and
                    run["status"] == "completed" and run["conclusion"] == "success" and
                    run["id"] >= minimum and run["run_attempt"] >= 1,
                    "main qualification incomplete")
    rolling.require(jobs["total_count"] == len(GATES) and len(jobs["jobs"]) == len(GATES) and
                    {job["name"] for job in jobs["jobs"]} == GATES and
                    all(job["conclusion"] == "success" and job["head_sha"] == head and
                        job["run_id"] == run["id"] and job["run_attempt"] == run["run_attempt"]
                        for job in jobs["jobs"]), "qualification gates are missing, skipped or failed")
    return f"{head}-{run['id']}-{run['run_attempt']}"


def api(path):
    request = Request("https://api.github.com/repos/iurman/commandry/" + path,
                      headers={"Accept": "application/vnd.github+json", "User-Agent": "commandry-release-controller",
                               "X-GitHub-Api-Version": "2022-11-28"})
    with urlopen(request, timeout=20) as response:
        content = response.read(2_000_001)
        rolling.require(len(content) <= 2_000_000, "oversized qualification response")
        return json.loads(content)


def locked(rollout, operation):
    lock = rollout.state / "deploy.lock"
    rolling.require(not lock.is_symlink(), "symlinked deployment lock")
    with lock.open("a") as descriptor:
        fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        return operation()


def watchdog(rollout):
    rollout.recover()
    if not rollout.active.exists():
        return
    active = json.loads(rollout.active.read_text())
    try:
        rollout.verify_database(rolling.assignments(rollout.marker))
        rollout.health(active["slot"], active["image"], active["revision"], True)
        rollout.health(active["slot"], active["image"], active["revision"])
        rollout.healthy_worker()
        (rollout.state / "rolling-unhealthy.json").unlink(missing_ok=True)
    except (rolling.Rejected, subprocess.TimeoutExpired):
        counter = rollout.state / "rolling-unhealthy.json"
        prior = json.loads(counter.read_text()) if counter.exists() else {"revision": active["revision"], "count": 0}
        count = prior["count"] + 1 if prior["revision"] == active["revision"] else 1
        rolling.json_write(counter, {"revision": active["revision"], "count": count})
        if count >= 2 and active.get("previous"):
            # Persist a recovery journal before changing anything. Identity
            # failure is deliberately not bypassed by the rollback operation.
            rolling.json_write(rollout.journal, active["previous"])
            rollout.rollback(active["previous"])
            rolling.json_write(rollout.state / "automatic-rejected.json", {"revision": active["revision"]})


def tick(rollout):
    rollout.preflight()
    locked(rollout, lambda: watchdog(rollout))
    if rollout.policy.get("enabled") is not True:
        return
    head = rolling.main_head(rollout.run)
    current = rolling.assignments(rollout.marker)
    if head == current["REVISION"]:
        return
    rejected = rollout.state / "automatic-rejected.json"
    if rejected.exists() and json.loads(rejected.read_text())["revision"] == head:
        return
    state_file = rollout.state / "automatic-poll.json"
    state = json.loads(state_file.read_text()) if state_file.exists() else {}
    if state.get("head") == head and time.time() - state.get("checkedAt", 0) < 60:
        return
    rolling.json_write(state_file, {"head": head, "checkedAt": time.time()})
    runs = api("actions/workflows/release-candidate.yml/runs?branch=main&per_page=20")["workflow_runs"]
    selected = next((run for run in runs if run["head_sha"] == head), None)
    if selected is None or selected["status"] != "completed" or selected["conclusion"] != "success":
        return
    jobs = api(f"actions/runs/{selected['id']}/attempts/{selected['run_attempt']}/jobs?per_page=100")
    tag = qualified(selected, jobs, head, rollout.policy["minimumRunId"])
    image_tag = "ghcr.io/iurman/commandry:" + tag
    rollout.step = "automatic_candidate_pull"
    rollout.docker("pull", image_tag, timeout=180)
    metadata = json.loads(rollout.docker("image", "inspect", image_tag))[0]
    digests = [value for value in metadata["RepoDigests"]
               if re.fullmatch(r"ghcr.io/iurman/commandry@sha256:[0-9a-f]{64}", value)]
    rolling.require(len(digests) == 1 and metadata["Config"]["Labels"]["org.opencontainers.image.revision"] == head and
                    metadata["Config"]["Labels"]["org.commandry.source.clean"] == "true", "published provenance differs")
    rolling.require(rolling.main_head(rollout.run) == head, "main advanced while selecting release")
    # Every approval and deployment write shares the same host lock. The child
    # inherits fd 9, avoiding the gap between approval creation and consumption.
    lock = rollout.state / "deploy.lock"
    with lock.open("a") as descriptor:
        fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        owner_file = rollout.config / "deploy-owner.input"
        rollout.trusted(owner_file, True)
        owner_input = owner_file.read_bytes()
        rolling.require(len(owner_input) <= 513, "owner input too large")
        approval = {"TARGET": "production", "IMAGE": digests[0], "REVISION": head,
                    "BUILD_TIME": metadata["Created"][:19] + "Z", "APPROVAL_ID": "main-" + str(selected["id"]) + "-" + str(selected["run_attempt"]),
                    "APPROVED_BY": "automatic-main",
                    "EXPIRES_AT": (datetime.now(timezone.utc) + timedelta(minutes=30)).strftime("%Y-%m-%dT%H:%M:%SZ")}
        rolling.atomic(rollout.config / "approved-release", "".join(key + "=" + value + "\n" for key, value in approval.items()))
        # The same root-owned rollout function handles manual and automatic
        # callers. Keep this lock held through approval, confirmation/rollback.
        try:
            rollout.deploy(owner_input)
        except rolling.Deferred:
            rollout.event("automatic_candidate_deferred", revision=head, runId=selected["id"])
        except (rolling.Rejected, OSError, ValueError, KeyError, subprocess.TimeoutExpired) as error:
            rolling.json_write(rejected, {"revision": head, "runId": selected["id"], "attempt": selected["run_attempt"]})
            rollout.event("automatic_candidate_rejected", revision=head, runId=selected["id"],
                          reason=str(error) if isinstance(error, rolling.Rejected) else type(error).__name__)
        else:
            rollout.event("automatic_candidate_confirmed", revision=head, runId=selected["id"])


def entry():
    os.umask(0o077)
    rolling.require(os.geteuid() == 0 and len(sys.argv) == 1, "installed root controller required")
    rollout = rolling.Rollout()
    lock = rollout.state / "automatic-controller.lock"
    rolling.require(not lock.is_symlink(), "symlinked controller lock")
    with lock.open("a") as descriptor:
        fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        tick(rollout)


if __name__ == "__main__":
    try:
        entry()
    except (rolling.Rejected, OSError, ValueError, KeyError, subprocess.TimeoutExpired):
        print("Commandry automatic release held; existing release remains selected. Inspect private host evidence.", file=sys.stderr)
        sys.exit(1)
