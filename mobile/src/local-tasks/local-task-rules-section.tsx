import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import type {
  LocalTaskProject,
  LocalTaskProjectRules
} from '../../../src/shared/local-tasks/local-task-types'
import { MobileSwitch } from '../components/MobileSwitch'
import { spacing } from '../theme/mobile-theme'
import type { LocalTasksApi } from './local-tasks-api'
import { localTasksCopy } from './local-tasks-copy'
import { localTaskWriteMessage } from './local-task-failure-message'
import { createLocalTaskOperationIds, sendLocalTaskWrite } from './local-task-operation-ids'
import { localTaskStyles } from './local-tasks-styles'

type RuleKey = keyof LocalTaskProjectRules

/** The project's two automatic rules, each its own switch and its own write. */
export function LocalTaskRulesSection(props: {
  project: LocalTaskProject
  api: LocalTasksApi
  readOnly: boolean
  onChanged: () => void
}) {
  const copy = localTasksCopy()
  const work = copy.work
  const [ids] = useState(() => ({
    startMovesToInProgress: createLocalTaskOperationIds(),
    prMergedCompletes: createLocalTaskOperationIds()
  }))
  const [error, setError] = useState<string | null>(null)
  const set = async (rule: RuleKey, value: boolean) => {
    const outcome = await sendLocalTaskWrite(
      ids[rule],
      { projectId: props.project.id, rules: { [rule]: value } },
      props.api.updateProject
    )
    setError(localTaskWriteMessage(copy, outcome))
    props.onChanged()
  }
  const rows: { rule: RuleKey; label: string; hint: string }[] = [
    { rule: 'startMovesToInProgress', label: work.ruleStart, hint: work.ruleStartHint },
    { rule: 'prMergedCompletes', label: work.rulePrMerged, hint: work.rulePrMergedHint }
  ]
  return (
    <>
      <Text style={localTaskStyles.sectionLabel}>{work.rulesSection}</Text>
      <View style={localTaskStyles.card}>
        {rows.map((row, index) => (
          <View
            key={row.rule}
            style={[localTaskStyles.cardRow, index === 0 && localTaskStyles.cardRowFirst]}
          >
            <View style={styles.text}>
              <Text style={localTaskStyles.rowValue}>{row.label}</Text>
              <Text style={localTaskStyles.hint}>{row.hint}</Text>
            </View>
            <MobileSwitch
              testID={`local-task-rule-${row.rule}`}
              value={props.project.rules[row.rule]}
              disabled={props.readOnly}
              accessibilityLabel={row.label}
              onValueChange={(value) => void set(row.rule, value)}
            />
          </View>
        ))}
      </View>
      {error ? <Text style={[localTaskStyles.errorText, styles.below]}>{error}</Text> : null}
    </>
  )
}

const styles = StyleSheet.create({
  text: { flex: 1, gap: 2 },
  below: { marginTop: spacing.sm }
})
