#!/usr/bin/env python3
"""Build an immutable host-controls bundle from one clean Git commit."""

import argparse
import gzip
import hashlib
import io
import os
from pathlib import Path, PurePosixPath
import re
import stat
import subprocess
import sys
import tarfile


LIST_PATH = "deploy/controls-files.txt"
REVIEWED_LIST_SHA256 = "d8b2d74c7dc3ecfbd0bb753fff95e486e84f1b2a5f45b8e625c01c55e0efe483"
MAX_MEMBER_BYTES = 10 * 1024 * 1024
MAX_ARCHIVE_BYTES = 50 * 1024 * 1024
PATH_PATTERN = re.compile(r"[A-Za-z0-9._/-]+\Z")
REVISION_PATTERN = re.compile(r"[0-9a-f]{40}\Z")


class BundleError(Exception):
    """A source or output failed a release bundle gate."""


def git(repository: Path, *arguments: str) -> bytes:
    environment = {key: value for key, value in os.environ.items() if not key.startswith("GIT_")}
    environment["GIT_NO_REPLACE_OBJECTS"] = "1"
    result = subprocess.run(
        ["git", "--no-replace-objects", *arguments],
        cwd=repository,
        env=environment,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
        timeout=30,
    )
    if result.returncode != 0:
        message = result.stderr.decode("utf-8", errors="replace").strip()
        raise BundleError(f"git {' '.join(arguments[:2])} failed: {message}")
    return result.stdout


def checked_source(repository: Path, revision: str) -> None:
    if not REVISION_PATTERN.fullmatch(revision):
        raise BundleError("revision must be a full lowercase 40-character commit SHA")
    root = Path(git(repository, "rev-parse", "--show-toplevel").decode().strip())
    if root.resolve() != repository.resolve():
        raise BundleError("repository must be the Git worktree root")
    refs = {
        name: git(repository, "rev-parse", "--verify", name).decode().strip()
        for name in ("HEAD", "main", "origin/main")
    }
    if any(value != revision for value in refs.values()):
        raise BundleError("revision, HEAD, main, and origin/main must match exactly")
    if git(repository, "cat-file", "-t", revision).strip() != b"commit":
        raise BundleError("revision does not name a commit")
    if git(repository, "status", "--porcelain", "--untracked-files=normal").strip():
        raise BundleError("working tree must be clean before bundling")


def safe_path(path: str) -> bool:
    parts = PurePosixPath(path).parts
    return bool(
        PATH_PATTERN.fullmatch(path)
        and path == PurePosixPath(path).as_posix()
        and not path.startswith("/")
        and "//" not in path
        and all(part not in ("", ".", "..") for part in parts)
    )


def selected_paths(repository: Path, revision: str) -> list[str]:
    entries = git(repository, "ls-tree", "-z", revision, "--", LIST_PATH).split(b"\0")
    if len(entries) != 2 or entries[1] != b"":
        raise BundleError("controls file list is missing from the commit")
    metadata, name = entries[0].split(b"\t", 1)
    if name != LIST_PATH.encode() or metadata.split(b" ", 2)[:2] != [b"100644", b"blob"]:
        raise BundleError("controls file list must be a regular committed file")
    raw = git(repository, "show", f"{revision}:{LIST_PATH}")
    if hashlib.sha256(raw).hexdigest() != REVIEWED_LIST_SHA256:
        raise BundleError("controls file list differs from the reviewed 40-path selection")
    try:
        value = raw.decode("utf-8")
    except UnicodeDecodeError as error:
        raise BundleError("controls file list is not UTF-8") from error
    if not value.endswith("\n") or "\r" in value:
        raise BundleError("controls file list must use LF-terminated lines")
    paths = value.splitlines()
    if not paths or any(not safe_path(path) for path in paths):
        raise BundleError("controls file list contains an unsafe or empty path")
    if len(paths) != len(set(paths)):
        raise BundleError("controls file list contains duplicate paths")
    return paths


def committed_members(repository: Path, revision: str, paths: list[str]):
    tree = {}
    for row in git(repository, "ls-tree", "-r", "-z", "--full-tree", revision, "--", *paths).split(b"\0"):
        if not row:
            continue
        metadata, name = row.split(b"\t", 1)
        mode, kind, _object_id = metadata.split(b" ", 2)
        tree[name.decode("utf-8")] = (mode, kind)
    members = []
    total = 0
    for path in paths:
        mode, kind = tree.get(path, (None, None))
        if kind != b"blob" or mode not in (b"100644", b"100755"):
            raise BundleError(f"controls path is missing or nonregular at revision: {path}")
        data = git(repository, "show", f"{revision}:{path}")
        if len(data) > MAX_MEMBER_BYTES:
            raise BundleError(f"controls file exceeds per-member limit: {path}")
        total += len(data)
        if total > MAX_ARCHIVE_BYTES:
            raise BundleError("controls files exceed the archive size limit")
        members.append((path, data, 0o755 if mode == b"100755" else 0o644))
    return members


def bundle_bytes(members) -> tuple[bytes, bytes]:
    manifest = "".join(
        f"{hashlib.sha256(data).hexdigest()}  {path}\n" for path, data, _mode in members
    ).encode("utf-8")
    buffer = io.BytesIO()
    with gzip.GzipFile(fileobj=buffer, mode="wb", filename="", mtime=0, compresslevel=9) as compressed:
        with tarfile.open(fileobj=compressed, mode="w", format=tarfile.USTAR_FORMAT) as archive:
            for path, data, mode in members:
                info = tarfile.TarInfo(path)
                info.size = len(data)
                info.mode = mode
                info.mtime = 0
                info.uid = 0
                info.gid = 0
                info.uname = ""
                info.gname = ""
                archive.addfile(info, io.BytesIO(data))
    return manifest, buffer.getvalue()


def private_output_parent(directory: Path) -> Path:
    if ".." in directory.parts:
        raise BundleError("output directory must not contain parent traversal")
    absolute = Path(os.path.abspath(directory))
    for ancestor in reversed(absolute.parents):
        details = ancestor.lstat()
        if not stat.S_ISDIR(details.st_mode):
            raise BundleError(f"output ancestor is not a real directory: {ancestor}")
        if details.st_uid not in (0, os.geteuid()):
            raise BundleError(f"output ancestor is owned by another user: {ancestor}")
        writable = bool(details.st_mode & 0o022)
        root_sticky = details.st_uid == 0 and bool(details.st_mode & stat.S_ISVTX)
        if writable and not root_sticky:
            raise BundleError(f"output ancestor is writable by other users: {ancestor}")
    return absolute


def write_outputs(directory: Path, revision: str, manifest: bytes, archive: bytes) -> tuple[Path, Path]:
    directory = private_output_parent(directory)
    manifest_name = "source.sha256"
    archive_name = f"commandry-controls-{revision[:7]}.tar.gz"
    try:
        os.mkdir(directory, mode=0o700)
    except FileExistsError as error:
        raise BundleError("output directory already exists; use a fresh private directory") from error
    directory_fd = None
    created = []
    try:
        directory_fd = os.open(directory, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        os.fchmod(directory_fd, 0o700)
        details = os.fstat(directory_fd)
        if details.st_uid != os.geteuid() or stat.S_IMODE(details.st_mode) != 0o700:
            raise BundleError("fresh output directory is not privately owned")
        for name, data in ((manifest_name, manifest), (archive_name, archive)):
            file_fd = os.open(
                name,
                os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                0o600,
                dir_fd=directory_fd,
            )
            created.append(name)
            with os.fdopen(file_fd, "wb") as output:
                os.fchmod(output.fileno(), 0o600)
                output.write(data)
    except Exception:
        if directory_fd is not None:
            for name in created:
                os.unlink(name, dir_fd=directory_fd)
        os.rmdir(directory)
        raise
    finally:
        if directory_fd is not None:
            os.close(directory_fd)
    return directory / manifest_name, directory / archive_name


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--revision", required=True, help="full clean source commit SHA")
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--repository", type=Path, default=Path(__file__).resolve().parent.parent)
    arguments = parser.parse_args()
    try:
        repository = arguments.repository.resolve(strict=True)
        checked_source(repository, arguments.revision)
        paths = selected_paths(repository, arguments.revision)
        members = committed_members(repository, arguments.revision, paths)
        manifest, archive = bundle_bytes(members)
        manifest_path, archive_path = write_outputs(arguments.output_dir, arguments.revision, manifest, archive)
    except (BundleError, OSError, subprocess.TimeoutExpired, UnicodeDecodeError, ValueError) as error:
        print(f"controls bundle: {error}", file=sys.stderr)
        return 1
    for path, data in ((manifest_path, manifest), (archive_path, archive)):
        digest = hashlib.sha256(data).hexdigest()
        print(f"{digest}  {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
