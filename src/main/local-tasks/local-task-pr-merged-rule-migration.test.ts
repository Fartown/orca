import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import '../sqlite/sync-database'
import { LocalTasksDatabase } from './local-tasks-database'
import { LocalTasksService } from './local-tasks-service'

it('migrates old enabled rules once and keeps later explicit completed choices', () => {
  const directory = mkdtempSync(join(tmpdir(), 'local-task-pr-rule-'))
  const open = () => LocalTasksDatabase.open('profile', directory)
  try {
    let db = open()
    let service = new LocalTasksService(db, () => 1_000)
    const enabled = service.createProject({
      clientOperationId: 'enabled',
      name: 'Enabled',
      prefix: 'EN'
    })
    const disabled = service.createProject({
      clientOperationId: 'disabled',
      name: 'Disabled',
      prefix: 'DIS'
    })
    if (!enabled.ok || !disabled.ok) {
      throw new Error('could not create migration fixtures')
    }
    expect(enabled.project.rules).toMatchObject({
      prMergedMode: 'review',
      prMergedCompletes: false
    })
    db.prepare('UPDATE local_task_projects SET rule_pr_merged_completes = 1 WHERE id = ?').run(
      enabled.project.id
    )
    db.prepare('UPDATE local_task_projects SET rule_pr_merged_completes = 0 WHERE id = ?').run(
      disabled.project.id
    )
    db.prepare(
      "DELETE FROM local_task_preferences WHERE key = 'prMergedReviewDefaultApplied'"
    ).run()
    const revisionBefore = db.revision()
    db.close()

    db = open()
    service = new LocalTasksService(db, () => 2_000)
    const projects = service.listProjects().projects
    expect(projects.find((project) => project.id === enabled.project.id)?.rules).toMatchObject({
      prMergedMode: 'review',
      prMergedCompletes: false
    })
    expect(projects.find((project) => project.id === disabled.project.id)?.rules).toMatchObject({
      prMergedMode: 'none',
      prMergedCompletes: false
    })
    expect(db.revision()).toBe(revisionBefore + 1)
    const migratedRevision = projects.find((project) => project.id === enabled.project.id)?.revision
    expect(migratedRevision).toBe(enabled.project.revision + 1)
    expect(projects.find((project) => project.id === disabled.project.id)?.revision).toBe(
      disabled.project.revision
    )
    const chosenCompleted = service.updateProject({
      clientOperationId: 'choose-completed',
      projectId: enabled.project.id,
      rules: { prMergedCompletes: true }
    })
    expect(chosenCompleted).toMatchObject({
      ok: true,
      project: { rules: { prMergedMode: 'completed', prMergedCompletes: true } }
    })
    const afterChoice = db.revision()
    db.close()

    db = open()
    const reopened = new LocalTasksService(db, () => 3_000).listProjects().projects
    expect(reopened.find((project) => project.id === enabled.project.id)?.rules).toMatchObject({
      prMergedMode: 'completed',
      prMergedCompletes: true
    })
    expect(db.revision()).toBe(afterChoice)
    db.close()
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
