<!-- host-capability: artifact-publishing -->

# Artifact commands

The share gate, explicit-intent rule, and denial recovery are in the guide body.

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

<!-- /host-capability -->
