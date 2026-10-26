import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  Palette,
  Pencil,
  Plus,
  Trash2
} from 'lucide-react-native'
import {
  LOCAL_TASK_STATUS_CATEGORIES,
  LOCAL_TASK_STATUS_COLORS,
  LOCAL_TASK_STATUS_NAME_MAX,
  type LocalTaskStatusCategory,
  type LocalTaskStatusColor
} from '../../../src/shared/local-tasks/local-task-model'
import type {
  LocalTaskProject,
  LocalTaskStatusDef
} from '../../../src/shared/local-tasks/local-task-types'
import { ActionSheetModal } from '../components/ActionSheetModal'
import { ConfirmModal } from '../components/ConfirmModal'
import { PickerModal } from '../components/PickerModal'
import { TextInputModal } from '../components/TextInputModal'
import { colors } from '../theme/mobile-theme'
import type { LocalTasksApi, LocalTaskWriteOutcome } from './local-tasks-api'
import { localTasksCopy } from './local-tasks-copy'
import { localTaskWriteMessage } from './local-task-failure-message'
import { orderedLocalTaskStatuses } from './local-task-list-projection'
import { createLocalTaskOperationIds, sendLocalTaskWrite } from './local-task-operation-ids'
import { localTaskStyles } from './local-tasks-styles'
import { LOCAL_TASK_STATUS_COLOR_VALUES, LocalTaskStatusIcon } from './local-tasks-visuals'

const NEW_STATUS_COLOR: Record<LocalTaskStatusCategory, LocalTaskStatusColor> = {
  backlog: 'gray',
  unstarted: 'gray',
  started: 'yellow',
  review: 'blue',
  completed: 'green',
  canceled: 'gray'
}

type Dialog =
  | { kind: 'menu'; status: LocalTaskStatusDef }
  | { kind: 'add'; category: LocalTaskStatusCategory }
  | { kind: 'rename'; status: LocalTaskStatusDef }
  | { kind: 'color'; status: LocalTaskStatusDef }
  | { kind: 'remove'; status: LocalTaskStatusDef; taskCount: number }

/** Statuses by category: add, rename, recolor and reorder inside one; never across categories. */
export function LocalTasksStatusSection(props: {
  api: LocalTasksApi
  project: LocalTaskProject
  taskCounts: Map<string, number>
  readOnly: boolean
  onChanged: () => void
}) {
  const copy = localTasksCopy()
  const [ids] = useState(() => ({
    upsert: createLocalTaskOperationIds(),
    reorder: createLocalTaskOperationIds(),
    remove: createLocalTaskOperationIds()
  }))
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [error, setError] = useState<string | null>(null)
  const ordered = orderedLocalTaskStatuses(props.project)
  const projectId = props.project.id

  const settle = (outcome: LocalTaskWriteOutcome<unknown>) => {
    setError(localTaskWriteMessage(copy, outcome))
    props.onChanged()
  }
  const upsert = async (input: {
    statusId?: string
    category?: LocalTaskStatusCategory
    name: string
    color: LocalTaskStatusColor
  }) =>
    settle(await sendLocalTaskWrite(ids.upsert, { projectId, ...input }, props.api.upsertStatus))
  const move = async (status: LocalTaskStatusDef, step: -1 | 1) => {
    const peers = ordered.filter((entry) => entry.category === status.category)
    const at = peers.findIndex((entry) => entry.id === status.id)
    const swap = peers[at + step]
    if (!swap) {
      return
    }
    const orderedStatusIds = ordered.map((entry) =>
      entry.id === status.id ? swap.id : entry.id === swap.id ? status.id : entry.id
    )
    settle(
      await sendLocalTaskWrite(
        ids.reorder,
        { projectId, orderedStatusIds },
        props.api.reorderStatuses
      )
    )
  }
  const remove = async (statusId: string, moveTasksToStatusId?: string) =>
    settle(
      await sendLocalTaskWrite(
        ids.remove,
        { statusId, ...(moveTasksToStatusId ? { moveTasksToStatusId } : {}) },
        props.api.removeStatus
      )
    )

  const menuStatus = dialog?.kind === 'menu' ? dialog.status : null
  const removing = dialog?.kind === 'remove' ? dialog : null
  return (
    <View>
      <Text style={localTaskStyles.sectionLabel}>{copy.statusesSection}</Text>
      <Text style={localTaskStyles.hint}>{copy.statusesHint}</Text>
      {error ? <Text style={localTaskStyles.errorText}>{error}</Text> : null}
      {LOCAL_TASK_STATUS_CATEGORIES.map((category) => (
        <View key={category}>
          <View style={localTaskStyles.sectionHeaderRow}>
            <Text style={localTaskStyles.meta}>{copy.categories[category]}</Text>
            {props.readOnly ? null : (
              <Pressable
                style={localTaskStyles.smallButton}
                onPress={() => setDialog({ kind: 'add', category })}
              >
                <Plus size={12} color={colors.textPrimary} />
                <Text style={localTaskStyles.smallButtonText}>{copy.addStatus}</Text>
              </Pressable>
            )}
          </View>
          <View style={localTaskStyles.card}>
            {ordered
              .filter((status) => status.category === category)
              .map((status, index) => (
                <Pressable
                  key={status.id}
                  style={[localTaskStyles.cardRow, index === 0 && localTaskStyles.cardRowFirst]}
                  disabled={props.readOnly}
                  onPress={() => setDialog({ kind: 'menu', status })}
                  accessibilityRole="button"
                >
                  <LocalTaskStatusIcon category={status.category} color={status.color} />
                  <Text style={localTaskStyles.rowValue}>{status.name}</Text>
                  <Text style={localTaskStyles.meta}>
                    {copy.statusTaskCount(props.taskCounts.get(status.id) ?? 0)}
                  </Text>
                  <ChevronRight size={16} color={colors.textMuted} />
                </Pressable>
              ))}
          </View>
        </View>
      ))}
      <ActionSheetModal
        visible={menuStatus !== null}
        title={menuStatus?.name}
        actions={
          menuStatus
            ? [
                {
                  label: copy.renameStatus,
                  icon: Pencil,
                  onPress: () => setDialog({ kind: 'rename', status: menuStatus })
                },
                {
                  label: copy.statusColor,
                  icon: Palette,
                  onPress: () => setDialog({ kind: 'color', status: menuStatus })
                },
                { label: copy.moveUp, icon: ArrowUp, onPress: () => void move(menuStatus, -1) },
                { label: copy.moveDown, icon: ArrowDown, onPress: () => void move(menuStatus, 1) },
                {
                  label: copy.deleteStatus,
                  icon: Trash2,
                  destructive: true,
                  onPress: () =>
                    setDialog({
                      kind: 'remove',
                      status: menuStatus,
                      taskCount: props.taskCounts.get(menuStatus.id) ?? 0
                    })
                }
              ]
            : []
        }
        onClose={() => setDialog((current) => (current?.kind === 'menu' ? null : current))}
      />
      <TextInputModal
        visible={dialog?.kind === 'add' || dialog?.kind === 'rename'}
        title={dialog?.kind === 'rename' ? copy.renameStatus : copy.addStatus}
        defaultValue={dialog?.kind === 'rename' ? dialog.status.name : ''}
        placeholder={copy.newStatusName}
        submitLabel={copy.save}
        onSubmit={(value) => {
          const name = value.trim().slice(0, LOCAL_TASK_STATUS_NAME_MAX)
          const current = dialog
          setDialog(null)
          if (!name || !current) {
            return
          }
          if (current.kind === 'add') {
            void upsert({
              category: current.category,
              name,
              color: NEW_STATUS_COLOR[current.category]
            })
          } else if (current.kind === 'rename') {
            void upsert({ statusId: current.status.id, name, color: current.status.color })
          }
        }}
        onCancel={() => setDialog(null)}
      />
      <PickerModal
        visible={dialog?.kind === 'color'}
        title={copy.statusColor}
        options={LOCAL_TASK_STATUS_COLORS.map((color) => ({
          value: color,
          label: copy.colors[color],
          renderIcon: () => (
            <View
              style={{
                width: 12,
                height: 12,
                borderRadius: 6,
                backgroundColor: LOCAL_TASK_STATUS_COLOR_VALUES[color]
              }}
            />
          )
        }))}
        selected={dialog?.kind === 'color' ? dialog.status.color : 'gray'}
        onSelect={(color) => {
          if (dialog?.kind === 'color') {
            void upsert({ statusId: dialog.status.id, name: dialog.status.name, color })
          }
        }}
        onClose={() => setDialog(null)}
      />
      <PickerModal
        visible={removing !== null && removing.taskCount > 0}
        title={copy.moveTasksTitle(removing?.taskCount ?? 0)}
        options={ordered
          .filter((status) => status.id !== removing?.status.id)
          .map((status) => ({
            value: status.id,
            label: status.name,
            subtitle: copy.categories[status.category],
            renderIcon: () => (
              <LocalTaskStatusIcon category={status.category} color={status.color} />
            )
          }))}
        selected=""
        onSelect={(targetId) => removing && void remove(removing.status.id, targetId)}
        onClose={() => setDialog(null)}
      />
      <ConfirmModal
        visible={removing !== null && removing.taskCount === 0}
        title={copy.deleteStatus}
        message={removing?.status.name}
        confirmLabel={copy.delete}
        cancelLabel={copy.cancel}
        destructive
        onConfirm={() => {
          const target = removing
          setDialog(null)
          if (target) {
            void remove(target.status.id)
          }
        }}
        onCancel={() => setDialog(null)}
      />
    </View>
  )
}
