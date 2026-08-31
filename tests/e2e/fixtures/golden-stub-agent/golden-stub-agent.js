#!/usr/bin/env node

const { randomUUID } = require('node:crypto')
const path = require('node:path')

const READY_MARKER = 'GOLDEN_STUB_AGENT_READY'
const EXIT_MARKER = 'GOLDEN_STUB_AGENT_EXITED'

const ESC = '\x1b'
const keyboardProtocolMode = process.argv.includes('--keyboard-protocol')
// Both match the bytes after ESC, so the control character stays out of the
// pattern: a CSI/SS3 introducer still missing its final byte, and a complete
// CSI/SS3 sequence. Shift+Enter is matched before either is consulted.
const INCOMPLETE_ESCAPE_TAIL_RE = /^(?:\[[0-9;?]*|O)?$/
const ESCAPE_TAIL_RE = /^(?:\[[0-9;?]*[ -/]*[@-~]|O[@-~])/
const resumeArgIndex = process.argv.indexOf('resume')
const resumedSessionId = resumeArgIndex !== -1 ? process.argv[resumeArgIndex + 1]?.trim() : ''
const issueJourneySessionId = resumedSessionId || randomUUID()
const issueJourneyTranscriptPath = process.env.ORCA_E2E_GOLDEN_STUB_TRANSCRIPT_ROOT
  ? path.join(
      process.env.ORCA_E2E_GOLDEN_STUB_TRANSCRIPT_ROOT,
      `rollout-2026-08-25T00-00-00-${issueJourneySessionId}.jsonl`
    )
  : ''

function postIssueJourneyHook(hookEventName, fields = {}) {
  if (
    process.env.ORCA_E2E_ISSUES_HOOK !== '1' ||
    !process.env.ORCA_AGENT_HOOK_PORT ||
    !process.env.ORCA_AGENT_HOOK_TOKEN ||
    !process.env.ORCA_PANE_KEY
  ) {
    return
  }
  const payload = new URLSearchParams({
    paneKey: process.env.ORCA_PANE_KEY,
    tabId: process.env.ORCA_TAB_ID || '',
    worktreeId: process.env.ORCA_WORKTREE_ID || '',
    launchToken: process.env.ORCA_AGENT_LAUNCH_TOKEN || '',
    env: process.env.ORCA_AGENT_HOOK_ENV || 'test',
    version: process.env.ORCA_AGENT_HOOK_VERSION || '1',
    payload: JSON.stringify({
      hook_event_name: hookEventName,
      session_id: issueJourneySessionId,
      turn_id: 'issues-e2e-turn',
      ...(issueJourneyTranscriptPath ? { transcript_path: issueJourneyTranscriptPath } : {}),
      ...fields
    })
  }).toString()
  const request = require('node:http').request({
    host: '127.0.0.1',
    port: Number(process.env.ORCA_AGENT_HOOK_PORT),
    path: '/hook/codex',
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'content-length': Buffer.byteLength(payload),
      'x-orca-agent-hook-token': process.env.ORCA_AGENT_HOOK_TOKEN
    }
  })
  request.on('error', () => {})
  request.end(payload)
}

let composer = ''
let lastSubmission = ''
let pendingInput = ''
let exiting = false

function render() {
  const lines = composer.split('\n')
  const renderedComposer = lines.map((line, index) => `${index === 0 ? '> ' : '  '}${line}`)
  process.stdout.write(
    `${keyboardProtocolMode ? '\x1b]0;\u280b Codex is thinking\x07\x1b[>1u' : '\x1b]0;Golden Stub Agent\x07'}${[
      '\x1b[H\x1b[2JGolden Stub Agent',
      `[${READY_MARKER}]`,
      '',
      ...renderedComposer,
      '',
      'Shift+Enter inserts a newline. Type exit then Enter to quit.',
      ...(lastSubmission ? [`[GOLDEN_STUB_AGENT_SUBMITTED] ${lastSubmission}`] : [])
    ].join('\r\n')}`
  )
}

function exitCleanly() {
  if (exiting) {
    return
  }
  exiting = true
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false)
  }
  const idleTitle = keyboardProtocolMode ? '\x1b]0;Codex\x07' : ''
  process.stdout.write(`${idleTitle}\x1b[?1049l[${EXIT_MARKER}]\r\n`, () => process.exit(0))
}

function submit() {
  if (composer.trim() === 'exit') {
    exitCleanly()
    return
  }
  lastSubmission = composer
  composer = ''
  render()
}

function consumeInput() {
  while (pendingInput.length > 0 && !exiting) {
    const enter = ['\x1b[13u', '\x1b[13;1u'].find((sequence) => pendingInput.startsWith(sequence))
    if (enter) {
      pendingInput = pendingInput.slice(enter.length)
      submit()
      continue
    }
    const shiftEnter = ['\x1b[13;2u', '\x1b[13;2~', '\x1b\r'].find((sequence) =>
      pendingInput.startsWith(sequence)
    )
    if (shiftEnter) {
      pendingInput = pendingInput.slice(shiftEnter.length)
      composer += '\n'
      render()
      continue
    }
    if (pendingInput.startsWith(ESC)) {
      const tail = pendingInput.slice(ESC.length)
      // Wait for the rest of a sequence that is still arriving.
      if (INCOMPLETE_ESCAPE_TAIL_RE.test(tail)) {
        return
      }
      // Why: without this, an unhandled sequence loses its ESC to the sub-space
      // filter below and types its tail ("[A") into the composer, so a stray key
      // report surfaces as a baffling render diff instead of being ignored.
      const escape = ESCAPE_TAIL_RE.exec(tail)
      if (escape) {
        pendingInput = pendingInput.slice(ESC.length + escape[0].length)
        continue
      }
    }

    const char = pendingInput[0]
    pendingInput = pendingInput.slice(1)
    if (char === '\r' || char === '\n') {
      submit()
    } else if (char === '\x04' || char === '\x03') {
      // Raw mode delivers Ctrl+C as \x03 instead of raising SIGINT.
      exitCleanly()
    } else if (char === '\x7f' || char === '\b') {
      composer = composer.slice(0, -1)
      render()
    } else if (char >= ' ') {
      composer += char
      render()
    }
  }
}

if (process.stdin.isTTY) {
  process.stdin.setRawMode(true)
}
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
  pendingInput += typeof chunk === 'string' ? chunk : chunk.toString()
  consumeInput()
})
process.stdin.resume()

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, exitCleanly)
}

process.stdout.write('\x1b[?1049h')
render()
postIssueJourneyHook('SessionStart')
setTimeout(() => {
  postIssueJourneyHook('Stop', {
    prompt: 'Verify the Issues journey',
    last_assistant_message: 'Issues journey hook completed'
  })
}, 250).unref()
