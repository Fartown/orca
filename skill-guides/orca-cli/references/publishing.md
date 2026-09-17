# Artifact and skill publishing commands

The publish gate and its recovery are in the guide body. This is the command surface behind it.

## Artifacts

```text
ORCA artifacts share <file> --json
ORCA artifacts unshare <file> --json
ORCA artifacts list --json
ORCA artifacts delete <link-or-token> --json
ORCA artifacts service status --json
```

- Run `share` in an Orca terminal on the computer that holds the file. In a terminal on an SSH
  host the host's Orca app serves the link; the file never passes through the client.
- `share` accepts any file. It shares the terminal's Orca workspace when that holds the file;
  otherwise an already-shared folder holding it, or else only the file's folder.
- The link reads the saved file on every request, so there is no `update`.
- The first share of a workspace mints its token; later shares in the same workspace reuse it.
  Relative links, images, and scripts in shared HTML or Markdown resolve under the same token.
- `unshare <file>` and `delete <link-or-token>` revoke the whole workspace token: every link to that
  workspace stops working. Sharing again mints a new token.
- `list` groups shared workspaces by computer; computers that are not connected show as not connected.
- `service status` reports whether that computer is serving and on which IP and port.
- `--api-url`, `ORCA_ARTIFACTS_API_URL`, and `ORCA_CLOUD_AUTH_TOKEN` do not apply to artifacts.

## Skill sharing

Agents can publish one or more installed skills behind one unlisted link through the
signed-in Orca account. The user must first grant the separate, default-off permission in
Settings → Share Skills ("Allow agents and the Orca CLI to publish skill links"). There is
no CLI or RPC way to grant it. Manual publishing from the reviewed desktop flow remains
available without this agent permission.

```text
ORCA skills installed --json
ORCA skills share --skill <selector> [--skill <selector> ...] --bundle-name <name> --json
```

- `skills installed` returns safe discovery IDs and names. It does not expose local skill
  paths in CLI output. Sharing then verifies that each `SKILL.md` declares a portable
  lowercase name containing only letters, numbers, and hyphens.
- Each `--skill` must be an exact discovery ID or an unambiguous installed-skill name.
  Use IDs when names collide.
- Multiple `--skill` flags create one bundle and one link. `--all` and arbitrary paths are
  intentionally unsupported; name every skill the user asked to publish.
- Skill folders can contain scripts, configuration, or credentials. The permission is
  authority, not intent: publish only the skills the user named and never widen the set.
- A denied command fails with `agent_skill_sharing_disabled`. Do not retry; ask the user to
  enable the switch in the desktop app if they want this action.
- Orca stages one agent-published bundle at a time per host. If another publish is active,
  wait for it to finish before retrying `agent_skill_sharing_busy`.
- Run the command in an Orca terminal on the machine that stores the skills. Forwarded WSL,
  SSH, and paired-runtime invocations fail before discovery so Orca cannot read from the
  wrong filesystem.
- The JSON result contains the unlisted URL and public share/package/version IDs. It never
  includes cloud authentication tokens.
