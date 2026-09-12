import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { writeJson } from './probe-command.mjs'

export function writeProbeReport(output, { startedAt, environment, results, error }) {
  const passed = !error && results.length > 0 && results.every((result) => result.status === 'PASS')
  const verdict = passed ? 'PASS' : results.length ? 'FAIL' : 'BLOCKED'
  const report = {
    goal: '验证固定自签身份在移除客户端信任后通过 Squirrel 原生替换，并拒绝错证书和篡改更新',
    verdict,
    summary: passed
      ? '所有所选原生正反例通过；正例实际替换并重启，反例保留原包可启动。'
      : `探针未通过：${
          error ??
          results
            .filter((result) => result.status !== 'PASS')
            .map((result) => result.error)
            .join('; ')
        }`,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    environment,
    scope: {
      covered: results.map((result) => result.name),
      out_of_scope: ['真实 Orca 业务包与终端恢复', 'Apple Developer ID、公证和 Gatekeeper 首次安装']
    },
    actions: results.map((result, index) => ({
      step: index + 1,
      action: result.name,
      expected:
        result.name === 'same-certificate'
          ? 'update-downloaded → quitAndInstall → 磁盘 1.0.1 → 不同 PID 的 1.0.1 进程就绪'
          : '原生签名拒绝，磁盘保留 1.0.0，原包重新启动 1.0.0',
      observed: JSON.stringify(
        Object.fromEntries(
          Object.entries(result).filter(([key]) => !['events', 'screenshots'].includes(key))
        )
      ),
      status: result.status,
      core: result.screenshots.length > 0,
      screenshots: result.screenshots,
      evidence: [`${result.name}/result.json`, `${result.name}/client-codesign.json`]
    })),
    screenshots: results.flatMap((result) =>
      result.screenshots.map((screenshot) => ({
        id: screenshot,
        path: screenshot,
        title: `${result.name} — ${screenshot.split('/').at(-1)}`,
        after_action: result.name,
        expected: '原生阶段、版本与 PID 可见',
        observed: '真实隐藏 Electron renderer 的 CDP 截图',
        status: result.status
      }))
    ),
    issues: error
      ? [{ id: 'PROBE-ERROR', kind: 'environment', title: String(error), affects_verdict: true }]
      : [],
    checks: {
      notes:
        '没有关闭签名检查，没有自定义或弱化指定要求。PEM-only rcodesign 全程不写 keychain、trust 或 authorizationdb；私钥在客户端运行前删除。'
    },
    not_covered: ['真实 Orca 完整包 P2', '首次手动迁移与 Gatekeeper'],
    evidence: [
      { label: '身份清理', path: 'identity-cleanup.json' },
      { label: '完整机器结果', path: 'result.json' }
    ],
    cleanup: {
      status: '详见 identity-cleanup.json 与各 case/cleanup.json',
      path: 'identity-cleanup.json'
    }
  }
  writeJson(join(output, 'test-result.json'), report)
  writeJson(join(output, 'result.json'), { verdict, environment, results, error: error ?? null })
  const sections = results.map(
    (result) =>
      `## ${result.name}: ${result.status}\n\n${JSON.stringify(Object.fromEntries(Object.entries(result).filter(([key]) => !['events', 'screenshots'].includes(key))), null, 2)}\n\n${result.screenshots.map((screenshot) => `![${result.name} native updater state](${screenshot})`).join('\n\n')}`
  )
  writeFileSync(
    join(output, 'final-report.md'),
    `# macOS 自签原生更新探针\n\n结论：${verdict}\n\n${report.summary}\n\n${sections.join('\n\n')}\n\n未覆盖真实 Orca 业务包、终端恢复、公证或首次 Gatekeeper 安装。\n`
  )
  return verdict
}
