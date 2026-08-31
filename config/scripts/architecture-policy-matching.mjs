import path from 'node:path'
import ts from 'typescript-api'

const patternCache = new Map()

export function normalizeRepositoryPath(value) {
  const normalized = value.replaceAll('\\', '/').replace(/^\.\//, '')
  const collapsed = path.posix.normalize(normalized)
  return collapsed === '.' ? '' : collapsed
}

export function pathPatternToRegExp(pattern) {
  const normalized = normalizeRepositoryPath(pattern)
  const cached = patternCache.get(normalized)
  if (cached) {
    return cached
  }

  let source = '^'
  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index]
    if (character === '*' && normalized[index + 1] === '*') {
      if (normalized[index + 2] === '/') {
        source += '(?:.*/)?'
        index += 2
      } else {
        source += '.*'
        index += 1
      }
      continue
    }
    if (character === '*') {
      source += '[^/]*'
      continue
    }
    if (character === '?') {
      source += '[^/]'
      continue
    }
    source += /[\\^$+?.()|[\]{}]/.test(character) ? `\\${character}` : character
  }
  const expression = new RegExp(`${source}$`)
  patternCache.set(normalized, expression)
  return expression
}

export function matchesPathPattern(file, pattern) {
  return pathPatternToRegExp(pattern).test(normalizeRepositoryPath(file))
}

export function matchesAnyPathPattern(file, patterns = []) {
  return patterns.some((pattern) => matchesPathPattern(file, pattern))
}

export function extractModuleSpecifiers(sourceText, file) {
  const sourceFile = ts.createSourceFile(
    file,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.getScriptKindFromFileName(file)
  )
  const specifiers = []

  function record(node) {
    const location = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
    specifiers.push({ specifier: node.text, line: location.line + 1 })
  }

  function visit(node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      record(node.moduleSpecifier)
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression &&
      ts.isStringLiteralLike(node.moduleReference.expression)
    ) {
      record(node.moduleReference.expression)
    } else if (ts.isCallExpression(node) && node.arguments.length === 1) {
      const argument = node.arguments[0]
      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === 'require'
      if ((isDynamicImport || isRequire) && ts.isStringLiteralLike(argument)) {
        record(argument)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return specifiers
}

function resolveExistingModulePath(candidate, repositoryFiles) {
  const candidates = [
    candidate,
    `${candidate}.ts`,
    `${candidate}.tsx`,
    `${candidate}.mts`,
    `${candidate}.cts`,
    `${candidate}.js`,
    `${candidate}.jsx`,
    `${candidate}.mjs`,
    `${candidate}.cjs`,
    `${candidate}.json`,
    `${candidate}/index.ts`,
    `${candidate}/index.tsx`,
    `${candidate}/index.js`,
    `${candidate}/index.mjs`
  ]
  return candidates.find((file) => repositoryFiles.has(file)) ?? candidate
}

export function resolveRepositoryImport(specifier, importer, aliases, repositoryFiles) {
  let candidate = null
  if (specifier.startsWith('.')) {
    candidate = path.posix.join(path.posix.dirname(importer), specifier)
  } else {
    for (const alias of aliases) {
      if (specifier.startsWith(alias.prefix)) {
        candidate = `${alias.replacement}${specifier.slice(alias.prefix.length)}`
        break
      }
    }
    if (candidate === null && specifier.startsWith('src/')) {
      candidate = specifier
    }
  }

  if (candidate === null) {
    return null
  }
  return resolveExistingModulePath(normalizeRepositoryPath(candidate), repositoryFiles)
}
