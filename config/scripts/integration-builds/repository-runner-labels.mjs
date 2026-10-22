/** Only a literal repository choice is statically decidable; unknown expressions stay unknown. */
export function repositoryRunnerLabels(expression) {
  if (typeof expression !== 'string') {
    return null
  }
  const match = expression.match(
    /^\$\{\{\s*github\.repository\s*==\s*'[^']+'\s*&&\s*'([^']+)'\s*\|\|\s*'([^']+)'\s*\}\}$/
  )
  return match ? [match[1], match[2]] : null
}
