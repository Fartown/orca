import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { SearchableSetting } from '@/components/settings/SearchableSetting'
import { translate } from '@/i18n/i18n'
import {
  replaceSidebarProjectMerge,
  type SidebarProjectMerge
} from '../../../shared/sidebar-project-merge/sidebar-project-merges'
import { SidebarProjectMergeEditor } from './SidebarProjectMergeEditor'
import {
  saveSidebarProjectMerges,
  useSidebarProjectMergeStore
} from './sidebar-project-merge-store'

export function SidebarProjectMergesSetting(): React.JSX.Element {
  const merges = useSidebarProjectMergeStore((state) => state.merges)
  const supported = useSidebarProjectMergeStore((state) => state.supported)
  const saving = useSidebarProjectMergeStore((state) => state.saving)
  const error = useSidebarProjectMergeStore((state) => state.error)
  const [editor, setEditor] = useState<{ merge: SidebarProjectMerge | null } | null>(null)
  const save = (merge: SidebarProjectMerge) =>
    saveSidebarProjectMerges(
      replaceSidebarProjectMerge(useSidebarProjectMergeStore.getState().merges, merge)
    )
  const unmerge = async (id: string) => {
    try {
      await saveSidebarProjectMerges(
        useSidebarProjectMergeStore.getState().merges.filter((entry) => entry.id !== id)
      )
    } catch {
      // The persisted error remains visible beside the action.
    }
  }
  return (
    <SearchableSetting
      title={translate('sidebarProjectMerge.title', 'Sidebar project merges')}
      description={translate(
        'sidebarProjectMerge.description',
        'Show selected projects and their workspaces under one project title.'
      )}
      keywords={['merge', 'project', 'sidebar', 'folder', 'host']}
    >
      <div className="space-y-3">
        <div className="space-y-1">
          <p className="text-sm font-medium">
            {translate('sidebarProjectMerge.title', 'Sidebar project merges')}
          </p>
          <p className="text-xs text-muted-foreground">
            {translate(
              'sidebarProjectMerge.description',
              'Show selected projects and their workspaces under one project title.'
            )}
          </p>
        </div>
        {merges.map((merge) => (
          <div key={merge.id} className="flex items-center justify-between gap-3 text-sm">
            <span className="truncate">
              {merge.name}{' '}
              <span className="text-xs text-muted-foreground">({merge.members.length})</span>
            </span>
            <div className="flex shrink-0 gap-1">
              <Button
                variant="ghost"
                size="sm"
                disabled={saving || !supported}
                onClick={() => setEditor({ merge })}
              >
                {translate('sidebarProjectMerge.edit', 'Edit')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={saving || !supported}
                onClick={() => void unmerge(merge.id)}
              >
                {translate('sidebarProjectMerge.unmerge', 'Unmerge')}
              </Button>
            </div>
          </div>
        ))}
        <Button
          variant="outline"
          size="sm"
          disabled={saving || !supported}
          onClick={() => setEditor({ merge: null })}
        >
          {translate('sidebarProjectMerge.add', 'Merge projects')}
        </Button>
        {!supported ? (
          <p className="text-xs text-muted-foreground">
            {translate(
              'sidebarProjectMerge.unsupported',
              'Project display merges are unavailable on this Orca host.'
            )}
          </p>
        ) : null}
        {error && !editor ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
      {editor ? (
        <SidebarProjectMergeEditor
          merge={editor.merge}
          onClose={() => setEditor(null)}
          onSave={save}
        />
      ) : null}
    </SearchableSetting>
  )
}
