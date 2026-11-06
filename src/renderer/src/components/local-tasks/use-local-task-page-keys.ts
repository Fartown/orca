import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import {
  claimLocalTaskPageKeys,
  pushLocalTaskEscapeLayer,
  type LocalTaskPageKeyAction
} from '@/local-tasks/local-task-page-keys'
import { localTaskPageStore } from '@/local-tasks/local-task-page-store'
import {
  localTaskCreateWriteReason,
  localTaskRowsWriteReason
} from '@/local-tasks/local-task-write-reason'
import {
  currentLocalTaskNeedsYouRows,
  runLocalTaskNeedsYouKey
} from '@/local-tasks/local-task-needs-you-actions'
import { runLocalTaskWorkKey } from '@/local-tasks/local-task-work-actions'
import type { LocalTaskListModel } from './use-local-task-list-model'

function step(ids: readonly string[], from: string | null, delta: 1 | -1): string | null {
  if (ids.length === 0) {
    return null
  }
  const index = from ? ids.indexOf(from) : -1
  if (index === -1) {
    return delta === 1 ? ids[0] : (ids.at(-1) ?? null)
  }
  return ids[Math.min(Math.max(index + delta, 0), ids.length - 1)] ?? null
}

function runAction(action: LocalTaskPageKeyAction, model: LocalTaskListModel): void {
  const page = localTaskPageStore.getState()
  const needsYou = page.view === 'needs-you' && page.detailTaskId === null
  const ids = needsYou
    ? currentLocalTaskNeedsYouRows().map((row) => row.task.id)
    : model.orderedTaskIds
  const cursor = page.cursorTaskId && ids.includes(page.cursorTaskId) ? page.cursorTaskId : null
  if (needsYou && runLocalTaskNeedsYouKey(action, cursor)) {
    return
  }
  const inDetail = page.detailTaskId !== null
  const current = page.detailTaskId ?? cursor
  switch (action) {
    case 'create': {
      // Why a toast: a single key past a greyed button would otherwise do nothing visible.
      const reason = localTaskCreateWriteReason(model.scopeProjectId)
      if (reason) {
        toast.error(reason)
      } else {
        page.openCreate({ projectId: model.scopeProjectId })
      }
      return
    }
    case 'next':
    case 'previous': {
      const next = step(ids, current, action === 'next' ? 1 : -1)
      page.setCursor(next)
      if (inDetail && next) {
        page.openDetail(next)
      }
      return
    }
    case 'open':
      if (cursor && !inDetail) {
        page.openDetail(cursor)
      }
      return
    case 'preview':
      if (cursor && !inDetail) {
        page.setPreviewOpen(!page.previewOpen)
      }
      return
    case 'select':
      if (cursor && !inDetail) {
        page.toggleSelected(cursor)
      }
      return
    case 'status':
    case 'priority':
    case 'labels': {
      const targets =
        !inDetail && page.selectedTaskIds.length > 0
          ? page.selectedTaskIds
          : current
            ? [current]
            : []
      if (targets.length === 0) {
        return
      }
      // Why per row: the page lists several libraries, and each takes writes on its own.
      const reason = localTaskRowsWriteReason(targets)
      if (reason) {
        toast.error(reason)
      } else {
        page.openPicker(action, targets)
      }
      return
    }
    case 'toggle-layout':
      if (!inDetail) {
        page.setLayout(page.layout === 'list' ? 'board' : 'list')
      }
      return
    case 'filter':
      if (!inDetail) {
        page.setFilterOpen(true)
      }
      break
    case 'acknowledge':
    case 'snooze':
      // Only items in Needs you take these.
      break
    case 'start-work':
    case 'open-session': {
      if (!current) {
        break
      }
      const reason = localTaskRowsWriteReason([current])
      if (reason) {
        toast.error(reason)
      } else {
        runLocalTaskWorkKey(action, current, model.index)
      }
      break
    }
    case 'search':
      page.openDetail(null)
      page.requestSearchFocus()
  }
}

/** Claims the page's single keys while it is mounted; Esc closes preview and selection first. */
export function useLocalTaskPageKeys(model: LocalTaskListModel, enabled: boolean): void {
  const modelRef = useRef(model)
  useEffect(() => {
    modelRef.current = model
  })
  useEffect(() => {
    if (!enabled) {
      return
    }
    return claimLocalTaskPageKeys((action) => runAction(action, modelRef.current))
  }, [enabled])
}

/** Registers an Esc layer while `active`; `close` may change between renders. */
export function useLocalTaskEscapeLayer(
  kind: 'dialog' | 'panel',
  active: boolean,
  close: () => void
): void {
  const closeRef = useRef(close)
  useEffect(() => {
    closeRef.current = close
  })
  useEffect(() => {
    if (!active) {
      return
    }
    return pushLocalTaskEscapeLayer(kind, () => closeRef.current())
  }, [active, kind])
}
