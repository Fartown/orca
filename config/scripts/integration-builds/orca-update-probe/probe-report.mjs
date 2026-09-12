import { appendFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { writeJson } from '../signing-probe/probe-command.mjs'

export function beginReport(output) {
  writeFileSync(
    join(output, 'test-plan.md'),
    `# Real Orca native update acceptance\n\n- Hosted macOS only; isolated profile and hidden windows.\n- Instrumented A/B launches use the repository packaged-test --use-mock-keychain flag; OS Keychain authorization is not under test. Native relaunch argv is recorded separately, without assuming that flag survives.\n- Build actual source once, package A/B normally as ZIP targets, preserve asar integrity and signing requirements.\n- Check default fork feed through exact HTTP fixtures; no localBuild override.\n- Create a real folder-workspace terminal, execute a marker, download B and invoke the normal restart action.\n- Expect native replacement on disk and a new process at the same installed path.\n- Instrumented reopen is recorded separately if native relaunch does not preserve CDP.\n- Expect the same workspace/tab and a working terminal after update.\n- No real provider session, production release, Android install or Gatekeeper first-install acceptance is in scope.\n`
  )
  appendFileSync(
    join(output, 'test-plan.md'),
    '\n- P2-only observability: add an uncaughtExceptionMonitor log banner to generated main before normal signing, never to production source/releases. Validate it first with a real thrown Error under prohibited activation; its default NSAlert must remain.\n'
  )
  appendFileSync(
    join(output, 'test-plan.md'),
    '\n- Seed isolated ui.lastUpdateCheckAt with now so startup does not race routing with a public check. Validate actual net.fetch routing, then make one manual default-fork check. Automatic startup scheduling is not accepted by this probe.\n'
  )
  appendFileSync(
    join(output, 'test-plan.md'),
    '\n- P2-only generated bootstrap verifies this run home/profile bindings, restores disposable HOME before app imports, and adds use-mock-keychain to A/native B equally. First validate via a real hidden LaunchServices tiny fixture with the unchanged production home guard; wrong HOME must still be rejected. Production builds and global launch environment are unchanged.\n'
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
        'automatic startup update scheduling',
        'Android',
        'provider sessions'
      ]
    },
    environment: {
      platform: process.platform,
      arch: process.arch,
      browser: report.runtime ?? 'not launched',
      githubRun: process.env.GITHUB_RUN_ID,
      isolation: 'disposable profile; hidden windows',
      checkTrigger: 'One manual default check; isolated lastUpdateCheckAt defers startup checking.',
      keychain:
        'P2-only bootstrap adds use-mock-keychain for both A and native B; OS Keychain authorization is excluded.',
      instrumentation:
        'VITE_EXPOSE_STORE enables fixture setup. P2 generated main includes an exception monitor and bound disposable HOME/mock-keychain bootstrap before imports. The unchanged production home guard is exercised through LaunchServices first. Updater/signature/install/PTY remain real.'
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
            impact: 'Real Orca acceptance stopped before every required checkpoint completed.',
            status: '原因待日志确认',
            affects_verdict: true,
            evidence: ['failure.txt']
          }
        ]
      : [],
    checks: {
      notes:
        'Exact fork transport fixtures and --use-mock-keychain are test isolation. P2-only exception observer is validated against a real prohibited NSAlert fixture before building; no exception handler is replaced. Native updater/signature/install/PTY are real; native B runtime readiness is not proof of its renderer health.'
    },
    not_covered: [
      'Public release delivery',
      'Automatic startup update scheduling',
      'Gatekeeper first installation',
      'OS Keychain authorization',
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
    'Transport is a local fixture for the exact fork endpoints. Instrumented A/B launches use --use-mock-keychain; native relaunch argv is separate. A P2-only uncaughtExceptionMonitor banner is added before normal signing; it logs without intercepting errors and is not in production source/releases. No installer, signature validation, or PTY operation is stubbed.',
    '',
    'See test-result.json, network.json, native-relaunch.json and cleanup-result.json for raw evidence.'
  ]
  writeFileSync(join(output, 'final-report.md'), `${lines.join('\n')}\n`)
}
