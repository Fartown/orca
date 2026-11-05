import type { CommandSpec } from '../args'
import { LOCAL_COMMAND_FLAGS } from '../args'

// Why kept: `--api-url` is still parsed so the handler can explain that local network sharing has no API URL.
const RETIRED_CLOUD_FLAGS = ['api-url']

export const ARTIFACT_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['artifacts', 'share'],
    summary: 'Share a file on the local network from the computer that holds it',
    usage: 'orca artifacts share <file> [--json]',
    allowedFlags: [...LOCAL_COMMAND_FLAGS, ...RETIRED_CLOUD_FLAGS, 'file'],
    positionalArgs: ['file'],
    examples: ['orca artifacts share ./report.html', 'orca artifacts share ./notes.md --json']
  },
  {
    path: ['artifacts', 'update'],
    summary: 'Not needed: links read the saved file directly',
    usage: 'orca artifacts update <file> [--json]',
    allowedFlags: [...LOCAL_COMMAND_FLAGS, ...RETIRED_CLOUD_FLAGS, 'file'],
    positionalArgs: ['file']
  },
  {
    path: ['artifacts', 'unshare'],
    destructive: true,
    summary: 'Stop sharing the workspace that contains a file',
    usage: 'orca artifacts unshare <file> [--json]',
    allowedFlags: [...LOCAL_COMMAND_FLAGS, ...RETIRED_CLOUD_FLAGS, 'file'],
    positionalArgs: ['file']
  },
  {
    path: ['artifacts', 'list'],
    summary: 'List shared workspaces on this computer and connected computers',
    usage: 'orca artifacts list [--json]',
    allowedFlags: [...LOCAL_COMMAND_FLAGS, ...RETIRED_CLOUD_FLAGS, 'cursor']
  },
  {
    path: ['artifacts', 'delete'],
    aliases: [['artifacts', 'rm']],
    destructive: true,
    summary: 'Stop sharing the workspace a link or token belongs to',
    usage: 'orca artifacts delete <link-or-token> [--json]',
    allowedFlags: [...LOCAL_COMMAND_FLAGS, ...RETIRED_CLOUD_FLAGS, 'id'],
    positionalArgs: ['id']
  },
  {
    path: ['artifacts', 'comments', 'list'],
    summary: 'List reader comments on a shared Markdown file',
    usage: 'orca artifacts comments list <file> [--json]',
    allowedFlags: [...LOCAL_COMMAND_FLAGS, 'file'],
    positionalArgs: ['file'],
    examples: ['orca artifacts comments list ./notes.md --json']
  },
  {
    path: ['artifacts', 'comments', 'delete'],
    aliases: [['artifacts', 'comments', 'rm']],
    destructive: true,
    summary: 'Delete reader comments on a shared file, and the review notes they became here',
    usage: 'orca artifacts comments delete <file> (<comment-id>... | --all) [--json]',
    allowedFlags: [...LOCAL_COMMAND_FLAGS, 'file', 'id', 'all'],
    positionalArgs: ['file', 'id'],
    variadicPositional: true,
    repeatableFlags: ['id'],
    examples: [
      'orca artifacts comments delete ./notes.md Qx3vR0pL8sTy2KmA',
      'orca artifacts comments delete ./notes.md --all'
    ]
  },
  {
    path: ['artifacts', 'service', 'status'],
    summary: 'Show the local network share service on the computer running this command',
    usage: 'orca artifacts service status [--json]',
    allowedFlags: [...LOCAL_COMMAND_FLAGS]
  }
]
