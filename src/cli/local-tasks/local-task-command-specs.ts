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
      "Takes a status name of the task's project in any case, or a category such as review.",
      'Setting the status the task already has changes nothing.',
      'A completed status is refused: only the user completes a task, in Orca.'
    ],
    examples: ['orca task status SHOP-12 "In Review"', 'orca task status SHOP-12 review']
  },
  {
    path: ['task', 'progress'],
    summary: 'Write back the result of a round on a local task',
    usage:
      'orca task progress <ref> (--body <text> | --body-file <path|->) [--needs-you <text>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'ref', 'body', 'body-file', 'needs-you'],
    positionalArgs: ['ref'],
    notes: [
      'Three parts: what you did; the conclusion or output; the next step or what you need.',
      'Write the text to a UTF-8 file and pass --body-file; inline multi-line text breaks in shells.',
      'Inside a session started from the task, the writeback is tied to that session.'
    ],
    examples: [
      'orca task progress SHOP-12 --body-file result.md',
      'orca task progress SHOP-12 --body-file result.md --needs-you "Pick the retry timeout"'
    ]
  },
  {
    path: ['task', 'guide'],
    summary: 'Print the rules an agent follows on a local task',
    usage: 'orca task guide [--dispatcher]',
    allowedFlags: [...GLOBAL_FLAGS, 'dispatcher'],
    notes: ['--dispatcher prints the rules for the dispatcher session instead.'],
    examples: ['orca task guide', 'orca task guide --dispatcher']
  },
  {
    path: ['task', 'propose'],
    summary: 'Propose tasks and sessions for the user to confirm (dispatcher only)',
    usage: 'orca task propose (--body <json> | --body-file <path|->) [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'body', 'body-file'],
    notes: [
      'Run inside the dispatcher session. The user confirms or dismisses in Orca, which then executes.',
      'Items: start, subtask, append, stop, link, record. Name tasks by ref. See orca task guide --dispatcher.'
    ],
    examples: ['orca task propose --body-file proposal.json']
  },
  {
    path: ['task', 'inbox'],
    summary: 'Read what changed on the tasks the dispatcher watches',
    usage: 'orca task inbox [--limit <n>] [--ack <cursor>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'limit', 'ack'],
    notes: [
      'Run inside the dispatcher session. Reading changes nothing; pass the printed cursor to --ack once handled.'
    ],
    examples: ['orca task inbox --json', 'orca task inbox --ack <cursor>']
  },
  {
    path: ['task', 'watch'],
    summary: 'Have the dispatcher follow a local task',
    usage: 'orca task watch <ref> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'ref'],
    positionalArgs: ['ref'],
    notes: ['Run inside the dispatcher session. Finished tasks stop being watched on their own.'],
    examples: ['orca task watch SHOP-12']
  },
  {
    path: ['task', 'unwatch'],
    summary: 'Stop the dispatcher following a local task',
    usage: 'orca task unwatch <ref> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'ref'],
    positionalArgs: ['ref'],
    examples: ['orca task unwatch SHOP-12']
  },
  {
    path: ['task', 'needs-you'],
    summary: 'List sessions and tasks waiting for the user',
    usage: 'orca task needs-you [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [LIBRARY_NOTE],
    examples: ['orca task needs-you --json']
  }
]
