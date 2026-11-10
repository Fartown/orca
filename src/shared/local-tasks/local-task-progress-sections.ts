export type LocalTaskProgressSection = { label: string; text: string }

/** A short heading, then a colon (full or half width), then what it says: `下一步：写回归测试`. */
const SECTION_LINE = /^\s*([^\s:：]{1,12})\s*[:：]\s*(\S.*)$/

/**
 * A writeback written as labelled lines (what was done, the finding, next step, self-check, where
 * to accept) read as rows; an unlabelled opening becomes a row with an empty label. A body with no
 * label at all stays one block of text. Labels are the agent's own words.
 */
export function parseLocalTaskProgressSections(body: string): LocalTaskProgressSection[] | null {
  const lines = body.split('\n').filter((line) => line.trim().length > 0)
  const sections: LocalTaskProgressSection[] = []
  for (const line of lines) {
    const match = SECTION_LINE.exec(line)
    const last = sections.at(-1)
    if (match) {
      sections.push({ label: match[1], text: match[2].trim() })
    } else if (last) {
      last.text = `${last.text}\n${line.trim()}`
    } else {
      sections.push({ label: '', text: line.trim() })
    }
  }
  return sections.some((section) => section.label !== '') ? sections : null
}
