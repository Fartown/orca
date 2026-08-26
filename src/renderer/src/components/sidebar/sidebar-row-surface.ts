// 侧栏行的表面语言。Workspaces 的 worktree 卡片和 Issues 的 Issue 行必须长一样,
// 否则切换根模式时选中态、圆角和 hover 会换一套语言。具体色值只在 main.css 里存一份,
// 两族 data 属性共用同一条规则。
export const SIDEBAR_ROW_SURFACE_CLASS =
  'relative ml-1 rounded-lg border border-transparent transition-[background-color,border-color,box-shadow] duration-200'

/** 行自身的 hover;嵌套子行用 SIDEBAR_NESTED_ROW_HOVER_CLASS,要比父行安静。 */
export const SIDEBAR_ROW_HOVER_CLASS = 'worktree-sidebar-card-hover'
export const SIDEBAR_NESTED_ROW_HOVER_CLASS = 'worktree-agent-row-hover'

export function sidebarRowSurfaceAttributes(active: boolean): {
  'data-sidebar-row-surface': 'true'
  'data-sidebar-row-active'?: 'primary'
} {
  return {
    'data-sidebar-row-surface': 'true',
    ...(active ? { 'data-sidebar-row-active': 'primary' as const } : {})
  }
}
