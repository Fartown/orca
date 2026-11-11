import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import type {
  LocalTaskProject,
  LocalTaskProjectRules
} from '../../../src/shared/local-tasks/local-task-types'
import { MobileSwitch } from '../components/MobileSwitch'
import { PickerModal } from '../components/PickerModal'
import { spacing } from '../theme/mobile-theme'
import type { LocalTasksApi } from './local-tasks-api'
import { localTasksCopy } from './local-tasks-copy'
import { localTaskWriteMessage } from './local-task-failure-message'
import { createLocalTaskOperationIds, sendLocalTaskWrite } from './local-task-operation-ids'
import { localTaskStyles } from './local-tasks-styles'

/** Project automation rules, saved independently. */
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
    prMergedCompletes: createLocalTaskOperationIds(),
    prMergedMode: createLocalTaskOperationIds()
  }))
  const [error, setError] = useState<string | null>(null)
  const [modePicker, setModePicker] = useState(false)
  const set = async (rules: Partial<LocalTaskProjectRules>, idsKey: keyof typeof ids) => {
    const outcome = await sendLocalTaskWrite(
      ids[idsKey],
      { projectId: props.project.id, rules },
      props.api.updateProject
    )
    setError(localTaskWriteMessage(copy, outcome))
    props.onChanged()
  }
  const mergedMode = props.project.rules.prMergedMode
  return (
    <>
      <Text style={localTaskStyles.sectionLabel}>{work.rulesSection}</Text>
      <View style={localTaskStyles.card}>
        <View style={[localTaskStyles.cardRow, localTaskStyles.cardRowFirst]}>
          <View style={styles.text}>
            <Text style={localTaskStyles.rowValue}>{work.ruleStart}</Text>
            <Text style={localTaskStyles.hint}>{work.ruleStartHint}</Text>
          </View>
          <MobileSwitch
            testID="local-task-rule-startMovesToInProgress"
            value={props.project.rules.startMovesToInProgress}
            disabled={props.readOnly}
            accessibilityLabel={work.ruleStart}
            onValueChange={(value) =>
              void set({ startMovesToInProgress: value }, 'startMovesToInProgress')
            }
          />
        </View>
        {mergedMode === undefined ? (
          <View style={localTaskStyles.cardRow}>
            <View style={styles.text}>
              <Text style={localTaskStyles.rowValue}>{work.rulePrMerged}</Text>
              <Text style={localTaskStyles.hint}>{work.rulePrMergedHint}</Text>
            </View>
            <MobileSwitch
              testID="local-task-rule-prMergedCompletes"
              value={props.project.rules.prMergedCompletes}
              disabled={props.readOnly}
              accessibilityLabel={work.rulePrMerged}
              onValueChange={(value) => void set({ prMergedCompletes: value }, 'prMergedCompletes')}
            />
          </View>
        ) : (
          <Pressable
            style={localTaskStyles.cardRow}
            onPress={() => setModePicker(true)}
            disabled={props.readOnly}
            accessibilityRole="button"
          >
            <View style={styles.text}>
              <Text style={localTaskStyles.rowValue}>{copy.prMergedRule}</Text>
              <Text style={localTaskStyles.hint}>{copy.prMergedModes[mergedMode]}</Text>
            </View>
          </Pressable>
        )}
      </View>
      <PickerModal
        visible={mergedMode !== undefined && modePicker}
        title={copy.prMergedRule}
        selected={mergedMode ?? (props.project.rules.prMergedCompletes ? 'completed' : 'none')}
        options={(['none', 'review', 'completed'] as const).map((mode) => ({
          value: mode,
          label: copy.prMergedModes[mode]
        }))}
        onSelect={(mode) => {
          setModePicker(false)
          void set({ prMergedMode: mode }, 'prMergedMode')
        }}
        onClose={() => setModePicker(false)}
      />
      {error ? <Text style={[localTaskStyles.errorText, styles.below]}>{error}</Text> : null}
    </>
  )
}

const styles = StyleSheet.create({
  text: { flex: 1, gap: 2 },
  below: { marginTop: spacing.sm }
})
