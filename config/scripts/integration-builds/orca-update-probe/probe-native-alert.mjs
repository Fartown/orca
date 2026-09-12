import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { assertHostedMac } from '../signing-probe/probe-policy.mjs'
import { writeJson } from '../signing-probe/probe-command.mjs'

export const nativeWindowInventoryScript = `function run(argv) {
  ObjC.import('CoreGraphics');
  var windows = ObjC.deepUnwrap($.CGWindowListCopyWindowInfo($.kCGWindowListOptionAll, $.kCGNullWindowID));
  return JSON.stringify(windows.filter(function (window) {
    return window.kCGWindowOwnerPID === Number(argv[0]);
  }).map(function (window) {
    return { id: window.kCGWindowNumber, title: window.kCGWindowName, bounds: window.kCGWindowBounds };
  }));
}`

export const nativeAlertTextScript = `on run argv
  set targetPid to (item 1 of argv) as integer
  set collected to ""
  tell application "System Events"
    set matches to (every application process whose unix id is targetPid)
    if (count of matches) is 0 then return "Own process not found"
    set targetProcess to item 1 of matches
    repeat with targetWindow in (every window of targetProcess)
      set collected to collected & "Window: " & (name of targetWindow) & linefeed
      repeat with element in (entire contents of targetWindow)
        try
          if (role of element) is "AXStaticText" then
            set collected to collected & ((value of element) as text) & linefeed
          end if
        end try
      end repeat
    end repeat
  end tell
  return collected
end run`

export function captureNativeAlert(pid, output, execute = spawnSync, guard = assertHostedMac) {
  guard()
  if (!Number.isSafeInteger(pid) || pid <= 1) {
    throw new Error('Native alert capture requires the observed own B PID')
  }
  const evidence = {
    pid,
    scope: 'CI-only own PID; read-only, no activation or input.',
    screenshots: []
  }
  const record = () => writeJson(join(output, `native-alert-${pid}.json`), evidence)
  const inventory = execute(
    '/usr/bin/osascript',
    ['-l', 'JavaScript', '-e', nativeWindowInventoryScript, String(pid)],
    {
      encoding: 'utf8',
      timeout: 8_000
    }
  )
  evidence.inventoryStatus = inventory.status
  evidence.inventoryError = String(inventory.error ?? inventory.stderr ?? '')
  let windows = []
  try {
    windows = JSON.parse(inventory.stdout || '[]')
    evidence.windows = windows
  } catch (error) {
    evidence.inventoryError = String(error)
  }
  record()
  for (const window of windows.slice(0, 3)) {
    if (!Number.isSafeInteger(window.id)) {
      continue
    }
    const path = `screenshots/native-alert-${pid}-${window.id}.png`
    const result = execute(
      '/usr/sbin/screencapture',
      ['-x', '-l', String(window.id), join(output, path)],
      { timeout: 8_000 }
    )
    evidence.screenshots.push({
      path,
      status: result.status,
      exists: existsSync(join(output, path)),
      error: String(result.error ?? result.stderr ?? '')
    })
    record()
  }
  const text = execute('/usr/bin/osascript', ['-e', nativeAlertTextScript, String(pid)], {
    encoding: 'utf8',
    timeout: 8_000
  })
  writeFileSync(
    join(output, `native-alert-${pid}-text.txt`),
    text.stdout || text.stderr || String(text.error ?? 'No accessible alert text')
  )
  evidence.textStatus = text.status
  evidence.textError = String(text.error ?? text.stderr ?? '')
  record()
  return evidence
}
