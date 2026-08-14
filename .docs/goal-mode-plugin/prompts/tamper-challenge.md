You reported the goal as complete and the acceptance checks passed. The completion is not
accepted yet, for one specific reason.

The watchdog diffs the working tree between turns, independently of anything you say. Over
the course of this goal it recorded the following changes to the checks themselves, or to
the configuration that decides how the checks run:

{{tamperList}}

A green check proves the current checks pass. It does not prove the checks still test what
they tested before. Those two are only the same thing if the checks were not weakened.

Do not treat this as an accusation, and do not undo work reflexively. Some of these changes
are legitimate: a goal can legitimately require rewriting tests, deleting obsolete cases, or
changing build configuration. What is not legitimate is making a failing check pass by
making it check less.

For each item listed above, go look at the actual diff and decide which one it is:

- It made the check weaker — an assertion that still matters was dropped, a case that still
  matters was deleted or skipped, a config change loosened what runs or how strictly. Then
  restore the strength of that check and make the real code satisfy it. This is the whole
  remaining work of the goal.
- It was required by the objective, and the check still covers the same requirement at the
  same strength. Then leave it as it is.

Verify each one against the current file contents, not against your memory of why you
changed it.

When you are done, re-run the acceptance checks yourself and write
`complete: ONE_LINE_SUMMARY` into {{claimPath}} again. State in that summary whether you
restored anything. The watchdog re-runs the checks and will accept the completion this time
even if you changed nothing, so answer honestly rather than defensively — but if it later
records further weakening, the loop stops instead of asking again.

<objective>
{{objective}}
</objective>
