import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { writeJson } from '../signing-probe/probe-command.mjs'

export function beginReport(output) {
  writeFileSync(
    join(output, 'test-plan.md'),
    `# Real Orca native update acceptance\n\n- Hosted macOS only; isolated profile and hidden windows.\n- Build actual source once, package A/B normally, preserve asar integrity and signing requirements.\n- Check default fork feed through exact HTTP fixtures; no localBuild override.\n- Create a real folder-workspace terminal, execute a marker, download B and invoke the normal restart action.\n- Expect native replacement on disk and a new process at the same installed path.\n- Instrumented reopen is recorded separately if native relaunch does not preserve CDP.\n- Expect the same workspace/tab and a working terminal after update.\n- No real provider session, production release, Android install or Gatekeeper first-install acceptance is in scope.\n`
  )
  return { started: new Date().toISOString(), actions: [], screenshots: [] }
}

export function recordCheckpoint(report, action, observed, screenshot, evidence = []) {
  const id = `S${report.screenshots.length + 1}`
  report.actions.push({
    step: report.actions.length + 1,
    action,
    expected: action,
    observed,
    status: 'PASS',
    screenshots: [id],
    evidence
  })
  report.screenshots.push({
    id,
    title: action,
    path: screenshot,
    after_action: action,
    expected: action,
    observed,
    status: 'PASS'
  })
}

export function finishReport(output, report, error, cleanup) {
  const verdict = error ? 'BLOCKED' : 'PASS'
  const result = {
    goal: 'Real Orca default fork update, native replacement/relaunch, terminal continuity',
    verdict,
    summary: error
      ? String(error.stack ?? error)
      : 'Default fork update installed B; the installed bundle relaunched and its saved terminal remained usable.',
    started_at: report.started,
    finished_at: new Date().toISOString(),
    scope: {
      covered: report.actions.map((step) => step.action),
      out_of_scope: [
        'Gatekeeper first install',
        'public GitHub asset delivery',
        'Android',
        'provider sessions'
      ]
    },
    environment: {
      platform: process.platform,
      arch: process.arch,
      browser: report.runtime ?? 'not launched',
      githubRun: process.env.GITHUB_RUN_ID,
      isolation: 'disposable profile; hidden windows'
    },
    actions: report.actions,
    screenshots: report.screenshots,
    issues: error
      ? [
          {
            id: 'P2-FAILURE',
            title: String(error.message ?? error),
            kind: 'automation',
            severity: 'P1',
            status: '原因待日志确认',
            affects_verdict: true,
            evidence: ['failure.txt']
          }
        ]
      : [],
    checks: {
      notes: 'Network fixtures replace transport only; updater/signature/install/PTY are real.'
    },
    not_covered: [
      'Public release delivery',
      'Gatekeeper first installation',
      'Native-relaunch renderer CDP if LaunchServices omits debugging arguments'
    ],
    evidence: [{ label: 'Cleanup', path: 'cleanup-result.json' }],
    cleanup: { status: cleanup.errors.length ? '清理失败' : '已关闭', path: 'cleanup-result.json' }
  }
  writeJson(join(output, 'test-result.json'), result)
  writeJson(join(output, 'cleanup-result.json'), cleanup)
  if (error) {
    writeFileSync(join(output, 'failure.txt'), String(error.stack ?? error))
  }
  const lines = [
    `# Real Orca native update: ${verdict}`,
    '',
    result.summary,
    '',
    '| Checkpoint | Actual result |',
    '| --- | --- |',
    ...report.actions.map((step) => `| ${step.action} | ${step.observed} |`),
    '',
    ...report.screenshots.map((shot) => `![${shot.title}](${shot.path})`),
    '',
    'Transport is a local fixture for the exact fork endpoints. No installer, signature validation, or PTY operation is stubbed.',
    '',
    'See test-result.json, network.json, native-relaunch.json and cleanup-result.json for raw evidence.'
  ]
  writeFileSync(join(output, 'final-report.md'), `${lines.join('\n')}\n`)
}
