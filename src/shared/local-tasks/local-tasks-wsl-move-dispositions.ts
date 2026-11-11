import {
  notApplicableDisposition,
  type WslMoveFieldDisposition
} from '../wsl-move/wsl-move-dispositions'

const LOCAL_TASK_TABLES = [
  'local_task_meta',
  'local_task_projects',
  'local_task_projects_v4',
  'local_task_project_repos',
  'local_task_project_prefixes',
  'local_task_statuses',
  'local_tasks',
  'local_task_aliases',
  'local_task_labels',
  'local_task_events',
  'local_task_workspaces',
  'local_task_sessions',
  'local_task_attention_state',
  'local_task_mutation_receipts',
  'local_task_preferences',
  'local_task_pr_triggers'
]

const STAYS_WITH_DESKTOP = notApplicableDisposition(
  52,
  'Each Orca keeps its own task library in its profile. Workspace links key by host and instance id; a client re-resolves a moved workspace (localTasks.links.resolveWorkspace), so the mover writes nothing.'
)

const DISPATCHER_TABLES = [
  'local_task_conversations',
  'local_task_proposals',
  'local_task_conversation_watches',
  'local_task_conversation_remote_watches',
  'local_task_conversation_facts'
]

const DISPATCHER_RECORDS_STAY = notApplicableDisposition(
  52,
  "The dispatcher's records key by its own pane and by task ids. A proposal naming a moved workspace reports that workspace as missing when run, so the mover writes nothing."
)

/** The task library's tables by `<database>.<table>` for the WSL move census (REQ-018). */
export const LOCAL_TASKS_SQLITE_TABLE_DISPOSITIONS: [string, WslMoveFieldDisposition][] = [
  ...LOCAL_TASK_TABLES.map((name): [string, WslMoveFieldDisposition] => [
    `local-tasks.${name}`,
    STAYS_WITH_DESKTOP
  ]),
  ...DISPATCHER_TABLES.map((name): [string, WslMoveFieldDisposition] => [
    `local-tasks.${name}`,
    DISPATCHER_RECORDS_STAY
  ])
]
