// 篡改扫描:找「把检查改弱」而不是「把代码改对」的痕迹。
//
// 全部基于两个 tree 之间的真实 diff,与 agent 自己的叙述无关。
// 刻意区分两档:challenge=true 的会挡住完成判定,false 的只作为证据写进下一轮提示词。
// 合法改测试(比如目标本来就是补测试)非常常见,所以「本轮只动了测试」不设为挡板。
import { diffText } from './git-snapshot.mjs'

// 门禁定义文件:验收命令跑什么、跑多严,是由这些文件决定的。
// 验收命令本身存在工作区之外改不动,但它依赖的这些改了,门禁一样会被放水。
const GATE_CONFIG = [
  /(^|\/)package\.json$/,
  /(^|\/)(vitest|jest|karma|playwright|cypress|ava|mocha)\.config\.[cm]?[jt]s$/,
  /(^|\/)\.?(eslintrc|oxlintrc)(\.\w+)?$/,
  /(^|\/)eslint\.config\.[cm]?[jt]s$/,
  /(^|\/)tsconfig(\.\w+)?\.json$/,
  /(^|\/)(pytest\.ini|tox\.ini|setup\.cfg|pyproject\.toml)$/,
  /(^|\/)(Makefile|justfile)$/,
  /(^|\/)\.golangci\.ya?ml$/,
  /(^|\/)\.github\/workflows\//
]
const IGNORE_RULES = /(^|\/)\.gitignore$/

const ASSERTION =
  /\b(assert\w*|expect|should|XCTAssert\w*|EXPECT_\w+|ASSERT_\w+)\s*[(.]|\bt\.(Error|Fatal)f?\s*\(|\brequire\.\w+\s*\(/
const SKIP_MARKER =
  /(\.skip\s*\(|\.only\s*\(|\bx(it|describe|test)\s*\(|\bf(it|describe)\s*\(|\btest\.todo\b|@Ignore\b|@Disabled\b|pytest\.mark\.skip|\bt\.Skip\w*\s*\(|#\[ignore\])/
const TEST_DECL = /\b(it|test|describe)\s*\(|^\s*def\s+test_\w+|^\s*func\s+Test[A-Z]|@Test\b/

/**
 * @returns {Array<{kind, label, detail, challenge}>}
 */
export async function scanRound(worktreePath, before, after, changed) {
  if (!changed) {
    return []
  }
  const findings = []
  const all = [...changed.source, ...changed.test]

  const gate = all.filter((f) => GATE_CONFIG.some((re) => re.test(f)))
  if (gate.length > 0) {
    findings.push(
      finding('gate-config-edited', '改动了决定验收怎么跑的配置文件', gate.join(', '), gate)
    )
  }

  const ignores = all.filter((f) => IGNORE_RULES.test(f))
  if (ignores.length > 0) {
    findings.push(
      finding(
        'ignore-rules-edited',
        '改动了忽略规则(会影响看门狗能看见哪些文件)',
        ignores.join(', '),
        ignores
      )
    )
  }
  if (before?.excludeHash !== after?.excludeHash) {
    findings.push(
      finding(
        'ignore-rules-edited',
        '改动了 .git/info/exclude',
        '这条规则不在版本库里,但会让改动从工作区内容指纹中消失',
        ['.git/info/exclude']
      )
    )
  }

  if (changed.test.length > 0) {
    const diff = await diffText(worktreePath, before, after, changed.test)
    findings.push(...scanTestDiff(diff))
    if (changed.source.length === 0) {
      findings.push({
        kind: 'test-only-edit',
        key: 'test-only-edit',
        label: '本轮只改了测试文件,没有改任何源码',
        detail: changed.test.join(', '),
        challenge: false
      })
    }
  }
  return findings
}

/** 逐文件统计断言、跳过标记、用例声明的增删。净减少才算削弱。 */
export function scanTestDiff(diff) {
  const findings = []
  const weakened = []
  const weakenedFiles = []
  const skipped = []
  const skippedFiles = []

  for (const [file, lines] of splitByFile(diff)) {
    let assertDelta = 0
    let declDelta = 0
    let skipAdded = 0
    for (const line of lines) {
      const added = line.startsWith('+') && !line.startsWith('+++')
      const removed = line.startsWith('-') && !line.startsWith('---')
      if (!added && !removed) {
        continue
      }
      const body = line.slice(1)
      if (ASSERTION.test(body)) {
        assertDelta += added ? 1 : -1
      }
      if (TEST_DECL.test(body)) {
        declDelta += added ? 1 : -1
      }
      if (added && SKIP_MARKER.test(body)) {
        skipAdded++
      }
    }
    if (assertDelta < 0 || declDelta < 0) {
      weakened.push(`${file}(断言 ${signed(assertDelta)},用例 ${signed(declDelta)})`)
      weakenedFiles.push(file)
    }
    if (skipAdded > 0) {
      skipped.push(`${file}(新增 ${skipAdded} 处)`)
      skippedFiles.push(file)
    }
  }

  if (weakened.length > 0) {
    findings.push(
      finding(
        'assertions-removed',
        '测试里的断言或用例被净删减',
        weakened.join('; '),
        weakenedFiles
      )
    )
  }
  if (skipped.length > 0) {
    findings.push(
      finding('tests-skipped', '新增了跳过/独占运行标记', skipped.join('; '), skippedFiles)
    )
  }
  return findings
}

const signed = (n) => (n > 0 ? `+${n}` : String(n))

/** key 只按「哪一类问题 + 哪些文件」构成,不含计数 —— 用来识别是不是同一处发现。 */
function finding(kind, label, detail, files) {
  return { kind, key: `${kind}:${[...files].sort().join(',')}`, label, detail, challenge: true }
}

function splitByFile(diff) {
  const files = new Map()
  let current = null
  for (const line of diff.split('\n')) {
    const header = line.match(/^diff --git a\/(.+?) b\//)
    if (header) {
      current = header[1]
      files.set(current, [])
      continue
    }
    if (current) {
      files.get(current).push(line)
    }
  }
  return files
}

/** 渲染进提示词的证据段。 */
export function describeFindings(findings) {
  if (findings.length === 0) {
    return '无'
  }
  return findings.map((f) => `${f.label} —— ${f.detail}`).join(';')
}
