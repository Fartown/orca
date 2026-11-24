import type { CommandSpec } from '../discovery/command-spec'
import { CLI_GLOBAL_FLAGS as GLOBAL_FLAGS } from '../../shared/cli/cli-argument-boundary'

const HOST_NOTE =
  'Runs on the Orca this CLI talks to. For a workspace on an SSH host, pass --environment <that host’s Orca Server>: the checklist, the goal record and the driver all live on the host that owns the workspace.'

export const GOAL_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['goal', 'draft'],
    summary: 'Draft the acceptance checklist for a goal; does not start it',
    usage:
      'orca goal draft --terminal <handle> (--objective <text> | --objective-file <path|->) [--guard claude|codex] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'terminal', 'objective', 'objective-file', 'guard'],
    notes: [
      'Pass the user’s words verbatim as the objective. --terminal is the agent session that will do the work.',
      'The guard writes the checklist in the background; read it with `orca goal checklist <draft-id> --wait`, show it to the user, and start only after they confirm.',
      'Default guard: the other model family than the working agent (claude for Codex, codex otherwise).',
      HOST_NOTE
    ],
    examples: ['orca goal draft --terminal term_abc --objective "把 PC 端界面按 Figma 还原"']
  },
  {
    path: ['goal', 'checklist'],
    summary: 'Show a checklist draft: status, file path, and text',
    usage: 'orca goal checklist <draft-id> [--wait] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'draft', 'wait'],
    positionalArgs: ['draft'],
    notes: ['--wait polls until the guard has finished writing (or failed).', HOST_NOTE],
    examples: ['orca goal checklist 1f0c… --wait']
  },
  {
    path: ['goal', 'start'],
    summary: 'Start a goal from a checklist the user has confirmed',
    usage:
      'orca goal start <draft-id> --terminal <handle> [--document <path>] [--max-turns <n>] [--max-minutes <n>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'draft', 'terminal', 'document', 'max-turns', 'max-minutes'],
    positionalArgs: ['draft'],
    notes: [
      'Objective and guard come from the draft. --document uses the user’s edited checklist file instead of the draft’s text.',
      'Refuses a draft that is not ready, or whose workspace is not the terminal’s workspace: draft again after the objective or workspace changes.',
      'Budget defaults: 20 turns, 180 minutes (0 = no limit).',
      HOST_NOTE
    ],
    examples: ['orca goal start 1f0c… --terminal term_abc']
  },
  {
    path: ['goal', 'status'],
    summary: 'Show running goals, or one goal in detail',
    usage: 'orca goal status [<goal-id>] [--all] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'goal', 'all'],
    positionalArgs: ['goal'],
    notes: ['Without a goal id lists running goals; --all includes finished ones.', HOST_NOTE],
    examples: ['orca goal status', 'orca goal status 7d2b… --json']
  },
  {
    path: ['goal', 'stop'],
    summary: 'Stop a goal: no further turns, the round in flight is interrupted',
    usage: 'orca goal stop <goal-id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'goal'],
    positionalArgs: ['goal'],
    notes: [HOST_NOTE],
    examples: ['orca goal stop 7d2b…']
  }
]
