// The fork's routes on the phone page (local tasks, attachments, continuation) measured 355 KB
// over pure upstream at the 2026-11-20 sync; upstream's fence covers upstream's own page only.
// Lower this as the local tasks page slims down; never raise it to admit unrelated growth.
export const FORK_MOBILE_WEB_BUNDLE_ALLOWANCE_BYTES = 360 * 1024
