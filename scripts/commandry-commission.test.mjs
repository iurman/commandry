import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

const installer = resolve(
  import.meta.dirname,
  "../deploy/commandry-commission.sh",
);
const revision = "a".repeat(40);
const requiredFiles = [
  "compose.production.yaml",
  "deploy/commandry-deploy.sh",
  "deploy/commandry-backup-gate.sh",
  "deploy/commandry-app-smoke.sh",
  "deploy/commandry-owner-recover.sh",
  "deploy/commandry-ssh-dispatch.sh",
  "deploy/commandry-deploy.sudoers",
  "deploy/sshd-commandry-deploy.match.example",
];

function write(path, content, mode = 0o600) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, { mode });
  chmodSync(path, mode);
}

function sha(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function command(binary, args) {
  const result = spawnSync(binary, args, { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result;
}

const fakeTool = String.raw`#!/usr/bin/env bash
set -euo pipefail
root=$(dirname "$(dirname "$0")")
name=$(basename "$0")
printf '%s %s\n' "$name" "$*" >> "$root/tool.calls"
case "$name" in
  getent)
    [[ -f "$root/account.created" ]] || exit 2
    case "$1" in
      passwd) printf 'commandry-deploy:x:999:999::/nonexistent:/bin/sh\n' ;;
      group) printf 'commandry-deploy:x:999:\n' ;;
      shadow)
        if [[ -f "$root/bad-shadow" ]]; then
          printf 'commandry-deploy:unlocked:0:0:99999:7:::\n'
        else
          printf 'commandry-deploy:!:0:0:99999:7:::\n'
        fi
        ;;
      *) exit 2 ;;
    esac
    ;;
  useradd) touch "$root/account.created" ;;
  userdel) rm -f "$root/account.created" ;;
  groupdel) : ;;
  id) printf 'commandry-deploy\n' ;;
  visudo)
    grep -Fq 'NOPASSWD: /usr/local/sbin/commandry-deploy ""' "$2"
    ;;
  sshd)
    config=$3
    grep -Fq 'Match User commandry-deploy' "$config" || exit 22
    if [[ "$1" == -T ]]; then
      [[ ! -f "$root/bad-effective" ]] || { printf 'forcecommand /bin/sh\n'; exit 0; }
      if [[ -f "$root/bad-public-effective" && "$*" == *'addr=203.0.113.55'* ]]; then
        printf 'forcecommand /bin/sh\n'
        exit 0
      fi
      policy=$(cat <<'CONFIG'
forcecommand /usr/local/sbin/commandry-ssh-dispatch
authorizedkeysfile /etc/ssh/authorized_keys/commandry-deploy
authorizedkeyscommand none
trustedusercakeys none
authenticationmethods publickey
passwordauthentication no
kbdinteractiveauthentication no
pubkeyauthentication yes
permittty no
allowtcpforwarding no
allowagentforwarding no
allowstreamlocalforwarding no
x11forwarding no
permittunnel no
disableforwarding yes
permituserrc no
CONFIG
      )
      if [[ -f "$root/bad-key-command" && "$*" == *'addr=203.0.113.55'* ]]; then
        sed 's#^authorizedkeyscommand none$#authorizedkeyscommand /usr/local/bin/another-key-source#' <<< "$policy"
      elif [[ -f "$root/bad-trusted-ca" && "$*" == *'addr=100.67.164.61'* ]]; then
        sed 's#^trustedusercakeys none$#trustedusercakeys /etc/ssh/ca_keys#' <<< "$policy"
      elif [[ -f "$root/bad-numeric-host" && "$*" == *'host=203.0.113.55,addr=203.0.113.55'* ]]; then
        sed 's#^forcecommand /usr/local/sbin/commandry-ssh-dispatch$#forcecommand /bin/sh#' <<< "$policy"
      else
        printf '%s\n' "$policy"
      fi
    fi
    ;;
  systemctl)
    if [[ "$1" == is-active ]]; then exit 0; fi
    if [[ "$1" == reload && -f "$root/fail-every-reload" ]]; then exit 27; fi
    if [[ "$1" == reload && -f "$root/fail-reload-once" ]]; then
      rm "$root/fail-reload-once"
      exit 26
    fi
    ;;
  *) exit 2 ;;
esac
`;

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "commandry-commission-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const host = join(root, "host");
  const incoming = join(root, "incoming");
  const source = join(root, "source");
  for (const path of [
    "opt",
    "etc",
    "etc/ssh",
    "etc/sudoers.d",
    "var/lib",
    "run",
    "usr/local/sbin",
    "tools",
  ]) {
    mkdirSync(join(host, path), { recursive: true });
  }
  mkdirSync(incoming);
  mkdirSync(source);
  write(join(host, "etc/ssh/sshd_config"), "Port 22\n", 0o644);
  for (const name of [
    "useradd",
    "userdel",
    "groupdel",
    "getent",
    "id",
    "visudo",
    "sshd",
    "systemctl",
  ]) {
    write(join(host, "tools", name), fakeTool, 0o755);
  }
  const contents = new Map([
    ["compose.production.yaml", "services: {}\n"],
    [
      "deploy/commandry-deploy.sudoers",
      'commandry-deploy ALL=(root) NOPASSWD: /usr/local/sbin/commandry-deploy ""\n',
    ],
    [
      "deploy/sshd-commandry-deploy.match.example",
      "Match User commandry-deploy\n    ForceCommand /usr/local/sbin/commandry-ssh-dispatch\n    AuthorizedKeysFile /etc/ssh/authorized_keys/commandry-deploy\n    AuthenticationMethods publickey\n    PasswordAuthentication no\n    KbdInteractiveAuthentication no\n    PermitTTY no\n    AllowTcpForwarding no\n    AllowAgentForwarding no\n    X11Forwarding no\n    PermitTunnel no\n    PermitUserRC no\n",
    ],
  ]);
  for (const path of requiredFiles) {
    write(
      join(source, path),
      contents.get(path) ?? "#!/bin/sh\nexit 0\n",
      0o644,
    );
  }
  const manifest = join(incoming, "source.sha256");
  write(
    manifest,
    `${requiredFiles.map((path) => `${sha(join(source, path))}  ${path}`).join("\n")}\n`,
  );
  const archive = join(
    incoming,
    `commandry-controls-${revision.slice(0, 7)}.tar.gz`,
  );
  command("tar", ["-czf", archive, "-C", source, ...requiredFiles]);
  const node = join(incoming, "node");
  const restic = join(incoming, "restic");
  write(node, "#!/bin/sh\nprintf 'v24.20.0\\n'\n", 0o755);
  write(
    restic,
    "#!/bin/sh\nprintf 'restic 0.19.1 compiled with go1.24\\n'\n",
    0o755,
  );
  const key = join(incoming, "commandry-deploy.pub");
  command("ssh-keygen", [
    "-q",
    "-t",
    "ed25519",
    "-N",
    "",
    "-C",
    "commandry-deploy",
    "-f",
    join(incoming, "commandry-deploy"),
  ]);
  write(key, readFileSync(key), 0o600);
  const hashes = {
    archive: sha(archive),
    manifest: sha(manifest),
    node: sha(node),
    restic: sha(restic),
    key: sha(key),
  };
  function run(overrides = {}) {
    const contexts = overrides.omitContexts
      ? []
      : [
          "--tailnet-context",
          "host=kronos.tailnet,addr=100.67.164.61,laddr=100.91.10.6,lport=22",
          "--public-context",
          "host=kronos.example,addr=203.0.113.55,laddr=198.51.100.9,lport=22",
        ];
    const environment = { ...process.env };
    delete environment.BASH_ENV;
    if (overrides.bashEnv) {
      environment.BASH_ENV = overrides.bashEnv;
      environment.COMMANDRY_TEST_ROOT = host;
      environment.COMMANDRY_INTERRUPT_AFTER = overrides.interruptAfter;
    }
    return spawnSync(
      "bash",
      [
        installer,
        "--test-root",
        host,
        "--bundle-dir",
        incoming,
        "--revision",
        revision,
        "--archive-sha",
        overrides.archive ?? hashes.archive,
        "--manifest-sha",
        overrides.manifest ?? hashes.manifest,
        "--node-file",
        node,
        "--node-sha",
        overrides.node ?? hashes.node,
        "--restic-file",
        restic,
        "--restic-sha",
        overrides.restic ?? hashes.restic,
        "--public-key",
        key,
        "--key-sha",
        overrides.key ?? hashes.key,
        ...contexts,
      ],
      { encoding: "utf8", timeout: 15_000, env: environment },
    );
  }
  return { archive, hashes, host, incoming, key, root, run };
}

const interruptingMove = String.raw`mv() {
  command mv "$@"
  target=
  for argument in "$@"; do target=$argument; done
  if [[ "$COMMANDRY_INTERRUPT_AFTER" == base && "$target" == "$COMMANDRY_TEST_ROOT/opt/commandry" ]]; then
    kill -TERM "$BASHPID"
  fi
  if [[ "$COMMANDRY_INTERRUPT_AFTER" == sshd && "$target" == "$COMMANDRY_TEST_ROOT/etc/ssh/sshd_config" ]]; then
    kill -TERM "$BASHPID"
  fi
}
`;

test("commission installs inert controls and a restricted deploy identity", (t) => {
  const { host, run } = fixture(t);
  const originalConfig = readFileSync(
    join(host, "etc/ssh/sshd_config"),
    "utf8",
  );
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /No production service or ingress was started/);
  assert.equal(existsSync(join(host, "account.created")), true);
  assert.equal(existsSync(join(host, "opt/commandry/runtime/node")), true);
  assert.equal(existsSync(join(host, "opt/commandry/runtime/restic")), true);
  assert.equal(existsSync(join(host, "etc/commandry/commandry.env")), false);
  assert.equal(existsSync(join(host, "etc/commandry/approved-release")), false);
  assert.equal(
    readFileSync(
      join(host, "var/lib/commandry/sshd_config.before-commission"),
      "utf8",
    ),
    originalConfig,
  );
  const sshd = readFileSync(join(host, "etc/ssh/sshd_config"), "utf8");
  assert.match(sshd, /Match User commandry-deploy/);
  assert.match(sshd, /DisableForwarding yes/);
  const key = readFileSync(
    join(host, "etc/ssh/authorized_keys/commandry-deploy"),
    "utf8",
  );
  assert.match(
    key,
    /^restrict,command="\/usr\/local\/sbin\/commandry-ssh-dispatch" ssh-ed25519 /,
  );
  const calls = readFileSync(join(host, "tool.calls"), "utf8");
  assert.match(calls, /useradd --system --user-group --no-create-home/);
  assert.match(calls, /systemctl reload ssh/);
  assert.equal((calls.match(/sshd -T -f/g) ?? []).length, 4);
  assert.match(calls, /host=kronos.tailnet,addr=100.67.164.61/);
  assert.match(calls, /host=100.67.164.61,addr=100.67.164.61/);
  assert.match(calls, /host=kronos.example,addr=203.0.113.55/);
  assert.match(calls, /host=203.0.113.55,addr=203.0.113.55/);
  assert.doesNotMatch(calls, /docker|ufw|start|enable|restart/);
});

test("missing real SSH client contexts is rejected before host mutation", (t) => {
  const { host, run } = fixture(t);
  const result = run({ omitContexts: true });
  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /--tailnet-context CONTEXT --public-context CONTEXT/,
  );
  assert.equal(existsSync(join(host, "opt/commandry")), false);
  assert.equal(existsSync(join(host, "tool.calls")), false);
});

test("tampered input fails before creating host paths or deploy identity", (t) => {
  const { archive, host, run } = fixture(t);
  writeFileSync(archive, "tampered", { flag: "a" });
  const result = run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /copied source hash mismatch: archive.tar.gz/);
  assert.equal(existsSync(join(host, "opt/commandry")), false);
  assert.equal(existsSync(join(host, "account.created")), false);
  assert.equal(
    readFileSync(join(host, "etc/ssh/sshd_config"), "utf8"),
    "Port 22\n",
  );
});

test("tampered deploy public key fails before creating the account", (t) => {
  const { host, key, run } = fixture(t);
  writeFileSync(key, "changed", { flag: "a" });
  const result = run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /copied source hash mismatch: deploy.pub/);
  assert.equal(existsSync(join(host, "opt/commandry")), false);
  assert.equal(existsSync(join(host, "account.created")), false);
});

test("existing controlled path is never overwritten", (t) => {
  const { host, run } = fixture(t);
  const existing = join(host, "usr/local/sbin/commandry-deploy");
  write(existing, "existing unrelated command\n");
  const result = run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /refusing an existing host command/);
  assert.equal(readFileSync(existing, "utf8"), "existing unrelated command\n");
  assert.equal(existsSync(join(host, "account.created")), false);
});

test("failed effective SSH check leaves original configuration and no identity", (t) => {
  const { host, run } = fixture(t);
  write(join(host, "bad-effective"), "1");
  const result = run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /sshd effective setting missing/);
  assert.equal(
    readFileSync(join(host, "etc/ssh/sshd_config"), "utf8"),
    "Port 22\n",
  );
  assert.equal(existsSync(join(host, "account.created")), false);
  assert.equal(existsSync(join(host, "opt/commandry")), false);
  assert.equal(existsSync(join(host, "etc/commandry")), false);
  assert.equal(
    existsSync(join(host, "etc/ssh/authorized_keys/commandry-deploy")),
    false,
  );
});

test("address-specific public SSH override is rejected before installing identity", (t) => {
  const { host, run } = fixture(t);
  write(join(host, "bad-public-effective"), "1");
  const result = run();
  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /sshd effective setting missing for host=kronos.example/,
  );
  assert.equal(
    readFileSync(join(host, "etc/ssh/sshd_config"), "utf8"),
    "Port 22\n",
  );
  assert.equal(existsSync(join(host, "account.created")), false);
});

test("alternate public-key command is rejected for the public client", (t) => {
  const { host, run } = fixture(t);
  write(join(host, "bad-key-command"), "1");
  const result = run();
  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /sshd effective setting missing.*authorizedkeyscommand none/,
  );
  assert.equal(existsSync(join(host, "opt/commandry")), false);
  assert.equal(existsSync(join(host, "account.created")), false);
});

test("trusted user CA is rejected for the tailnet client", (t) => {
  const { host, run } = fixture(t);
  write(join(host, "bad-trusted-ca"), "1");
  const result = run();
  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /sshd effective setting missing.*trustedusercakeys none/,
  );
  assert.equal(existsSync(join(host, "opt/commandry")), false);
  assert.equal(existsSync(join(host, "account.created")), false);
});

test("numeric-host Match override is rejected when UseDNS is disabled", (t) => {
  const { host, run } = fixture(t);
  write(join(host, "bad-numeric-host"), "1");
  const result = run();
  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /sshd effective setting missing for host=203.0.113.55/,
  );
  assert.equal(existsSync(join(host, "opt/commandry")), false);
  assert.equal(existsSync(join(host, "account.created")), false);
});

test("unlocked account is removed before SSH configuration changes", (t) => {
  const { host, run } = fixture(t);
  write(join(host, "bad-shadow"), "1");
  const result = run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /deploy password is not locked/);
  assert.equal(
    readFileSync(join(host, "etc/ssh/sshd_config"), "utf8"),
    "Port 22\n",
  );
  assert.equal(existsSync(join(host, "account.created")), false);
  assert.equal(
    existsSync(join(host, "etc/ssh/authorized_keys/commandry-deploy")),
    false,
  );
  assert.equal(existsSync(join(host, "etc/sudoers.d/commandry-deploy")), false);
  const calls = readFileSync(join(host, "tool.calls"), "utf8");
  assert.doesNotMatch(calls, /systemctl reload ssh/);
});

test("failed SSH reload restores original config and removes deploy key and sudo rule", (t) => {
  const { host, run } = fixture(t);
  const otherKey = join(host, "etc/ssh/authorized_keys/other-service");
  write(otherKey, "unrelated key material\n");
  write(join(host, "fail-reload-once"), "1");
  const result = run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /SSH reload failed/);
  assert.equal(
    readFileSync(join(host, "etc/ssh/sshd_config"), "utf8"),
    "Port 22\n",
  );
  assert.equal(existsSync(join(host, "account.created")), false);
  assert.equal(
    existsSync(join(host, "etc/ssh/authorized_keys/commandry-deploy")),
    false,
  );
  assert.equal(readFileSync(otherKey, "utf8"), "unrelated key material\n");
  assert.equal(existsSync(join(host, "etc/sudoers.d/commandry-deploy")), false);
  assert.equal(existsSync(join(host, "opt/commandry")), false);
  assert.equal(existsSync(join(host, "etc/commandry")), false);
  assert.equal(existsSync(join(host, "var/lib/commandry")), false);
  assert.equal(
    existsSync(join(host, "usr/local/sbin/commandry-deploy")),
    false,
  );
  const calls = readFileSync(join(host, "tool.calls"), "utf8");
  assert.equal((calls.match(/systemctl reload ssh/g) ?? []).length, 2);
  const retry = run();
  assert.equal(retry.status, 0, retry.stderr);
});

test("failed SSH restore preserves the private original configuration", (t) => {
  const { host, run } = fixture(t);
  write(join(host, "fail-every-reload"), "1");
  const result = run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /SSH reload of original configuration failed/);
  assert.equal(
    readFileSync(
      join(host, "var/lib/commandry/sshd_config.before-commission"),
      "utf8",
    ),
    "Port 22\n",
  );
  assert.equal(existsSync(join(host, "account.created")), false);
  assert.equal(existsSync(join(host, "opt/commandry")), false);
  assert.equal(existsSync(join(host, "etc/commandry")), false);
  assert.equal(
    existsSync(join(host, "etc/ssh/authorized_keys/commandry-deploy")),
    false,
  );
  assert.equal(existsSync(join(host, "etc/sudoers.d/commandry-deploy")), false);
});

test("TERM immediately after the controls move removes the new base", (t) => {
  const { host, root, run } = fixture(t);
  const bashEnv = join(root, "interrupt-after-move.bash");
  write(bashEnv, interruptingMove);
  const result = run({ bashEnv, interruptAfter: "base" });
  assert.equal(result.status, 143, result.stderr);
  assert.equal(existsSync(join(host, "opt/commandry")), false);
  assert.equal(existsSync(join(host, "account.created")), false);
  assert.equal(
    readFileSync(join(host, "etc/ssh/sshd_config"), "utf8"),
    "Port 22\n",
  );
  assert.equal(existsSync(join(host, "run/commandry-commission.lock")), false);
});

test("TERM immediately after the SSH config move restores the old config", (t) => {
  const { host, root, run } = fixture(t);
  const bashEnv = join(root, "interrupt-after-move.bash");
  write(bashEnv, interruptingMove);
  const result = run({ bashEnv, interruptAfter: "sshd" });
  assert.equal(result.status, 143, result.stderr);
  assert.equal(
    readFileSync(join(host, "etc/ssh/sshd_config"), "utf8"),
    "Port 22\n",
  );
  assert.equal(existsSync(join(host, "account.created")), false);
  assert.equal(
    existsSync(join(host, "etc/ssh/authorized_keys/commandry-deploy")),
    false,
  );
  assert.equal(existsSync(join(host, "etc/sudoers.d/commandry-deploy")), false);
  assert.equal(existsSync(join(host, "opt/commandry")), false);
  assert.equal(existsSync(join(host, "var/lib/commandry")), false);
  assert.equal(existsSync(join(host, "run/commandry-commission.lock")), false);
});
