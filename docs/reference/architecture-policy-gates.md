# Architecture policy gates

Architecture policies turn review decisions into repository checks. The checker is domain-neutral:
feature names, ownership boundaries, and reuse contracts live in
`config/architecture-policies.jsonc`, not in its implementation.

## Run the gate

```bash
pnpm run check:architecture-policies
pnpm run check:architecture-policies -- --base <git-ref>
pnpm run check:architecture-policies -- --policy <policy-id>
pnpm run check:architecture-policies -- --json
```

Pull requests pass their target SHA through `--base`. Local runs use `defaultBaseRef` from the
manifest.

## Rule model

Every policy contains independent declarative rules. `whenChanged` can limit any rule to changes in
a declared path set. For `change-scope`, it uses that rule's `comparison`; other rules use the
selected base diff plus worktree changes.

| Rule                  | Contract                                                               |
| --------------------- | ---------------------------------------------------------------------- |
| `change-scope`        | A base diff or worktree change stays inside reviewed paths.            |
| `reference-parity`    | Selected reused files remain identical to a Git reference.             |
| `dependency-boundary` | Imports from one path set must not target another path set.            |
| `forbidden-path`      | Removed or prohibited files must remain absent.                        |
| `forbidden-content`   | Selected sources must not contain prohibited state, APIs, or patterns. |

Rules use repository-relative glob patterns. `**` crosses directories, while `*` and `?` stay
inside one path segment. `exceptPaths` declares explicit composition roots, tests, or other reviewed
exceptions.

`dependency-boundary` resolves relative imports, repository-root imports, and aliases declared in
the manifest. `importTextHints` is only a performance prefilter; when supplied, it must include every
text fragment that can identify a forbidden import.

## Add a policy

Add data to the manifest; do not add domain branches to the checker. A policy for another feature
can combine the same primitives without changing JavaScript:

```jsonc
{
  "id": "example-adapter-boundary",
  "rules": [
    {
      "id": "core-does-not-import-adapter",
      "type": "dependency-boundary",
      "sourceFiles": ["src/core/**"],
      "forbiddenTargets": ["src/adapters/example/**"]
    },
    {
      "id": "removed-cache-stays-absent",
      "type": "forbidden-path",
      "paths": ["src/adapters/example/parallel-cache.ts"]
    }
  ]
}
```

Keep policy rules architectural rather than incidental: encode ownership, dependency direction,
reuse parity, and lifecycle boundaries. Avoid assertions about UI copy, temporary line numbers, or
one test fixture unless those details are themselves part of the reviewed contract.

## Implementation boundary

- `architecture-policy-manifest.mjs` parses and validates the declarative schema.
- `architecture-policy-matching.mjs` provides repository globs and TypeScript AST import-edge matching.
- `check-architecture-policies.mjs` evaluates rules and emits local or GitHub annotations.
- `check-architecture-policies.test.mjs` verifies the engine against isolated temporary repositories.

The first repository policy protects the Issue conversation design. Its Issue-specific paths and
terms belong only to the manifest; the engine and tests remain reusable for other domains.
