import { GLOBAL_FLAGS, type CommandSpec } from '../args'

const LIBRARY_NOTE =
  "Reads the task library of the Orca this CLI talks to: this computer's, or the paired server named by --environment / --pairing-code."

export const LOCAL_TASK_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['task', 'list'],
    summary: 'List local tasks, title first',
    usage: 'orca task list [--project <name-or-prefix>] [--status <status-or-category>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'project', 'status'],
    notes: [
      LIBRARY_NOTE,
      '--status takes a status name in any case, or a category: backlog, unstarted, started, review, completed, canceled.'
    ],
    examples: ['orca task list --project SHOP --status started']
  },
  {
    path: ['task', 'show'],
    summary: 'Show one local task with its description and done criteria',
    usage: 'orca task show <ref> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'ref'],
    positionalArgs: ['ref'],
    notes: [
      LIBRARY_NOTE,
      'A ref written with an earlier prefix, zero-padded, or from before a move still finds the task.'
    ],
    examples: ['orca task show SHOP-12']
  },
  {
    path: ['task', 'current'],
    summary: 'Show the local task the current workspace belongs to',
    usage: 'orca task current [--worktree <selector>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'worktree'],
    notes: [
      'Resolves the Orca-managed workspace that contains the current directory; on a paired host pass --worktree.',
      'A workspace belongs to at most one task; an unlinked workspace prints that it has none.'
    ],
    examples: ['orca task current', 'orca task current --worktree name:checkout --json']
  },
  {
    path: ['task', 'comment'],
    summary: 'Add a comment to a local task',
    usage: 'orca task comment <ref> <text> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'ref', 'body'],
    positionalArgs: ['ref', 'body'],
    variadicPositional: true,
    repeatableFlags: ['body'],
    notes: ['Words after the ref form the comment; quote it to keep spacing and shell characters.'],
    examples: ['orca task comment SHOP-12 "Tests pass; ready for review"']
  },
  {
    path: ['task', 'status'],
    summary: "Set a local task's status",
    usage: 'orca task status <ref> <status> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'ref', 'status'],
    positionalArgs: ['ref', 'status'],
    variadicPositional: true,
    repeatableFlags: ['status'],
    notes: [
      "Takes a status name of the task's project in any case, or a category such as completed.",
      'Setting the status the task already has changes nothing.'
    ],
    examples: ['orca task status SHOP-12 "In Review"', 'orca task status SHOP-12 completed']
  }
]
