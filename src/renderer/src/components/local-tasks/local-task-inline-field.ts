// Why ImeInput/ImeTextarea with this recipe: edit-in-place text reads as content until hovered or
// focused, which the bordered Input primitive cannot do (precedent: linear-issue-sub-issues).
export const LOCAL_TASK_INLINE_FIELD =
  'w-full min-w-0 rounded-md border border-transparent bg-transparent px-1.5 outline-none transition-colors placeholder:text-muted-foreground/60 hover:border-border/60 focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50'
