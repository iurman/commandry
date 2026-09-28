#!/usr/bin/env python3
"""Validate a private, current deployment smoke receipt without printing it."""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID


def valid(path: Path, image: str, revision: str) -> bool:
    if path.stat().st_size > 8192:
        return False
    with path.open(encoding="utf-8") as file:
        evidence = json.load(file)
    completed = datetime.fromisoformat(evidence["completedAt"].replace("Z", "+00:00"))
    age = (datetime.now(timezone.utc) - completed).total_seconds()
    UUID(evidence["workerJobId"])
    UUID(evidence["workerId"])
    return (
        -60 <= age <= 120
        and evidence["kind"] == "commandry_deployment_smoke"
        and evidence["outcome"] == "passed"
        and evidence["environment"] == "production"
        and evidence["imageDigest"] == image
        and evidence["releaseSha"] == revision
        and evidence["authenticatedRead"] is True
        and evidence["probeSessionRevoked"] is True
        and isinstance(evidence["bootstrapCreated"], bool)
    )


if __name__ == "__main__":
    try:
        if len(sys.argv) != 4 or not valid(Path(sys.argv[1]), sys.argv[2], sys.argv[3]):
            sys.exit(1)
    except (KeyError, TypeError, ValueError, OSError, json.JSONDecodeError):
        sys.exit(1)
