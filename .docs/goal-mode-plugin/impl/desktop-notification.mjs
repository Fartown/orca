// 后台跑完了给个桌面通知。Orca 的 notifications.show 只对插件开放,CLI 拿不到,
// 所以走各平台自带的命令。通知失败永远不该影响目标本身的结果,所以全部吞掉错误。
import { execFile } from 'node:child_process'

export function notifyDesktop(title, body) {
  const [command, args] = buildCommand(title, body)
  if (!command) {
    return
  }
  try {
    execFile(command, args, { timeout: 5000 }, () => {})
  } catch {
    // 没装 notify-send 之类的情况,静默跳过
  }
}

export function buildCommand(title, body) {
  const t = String(title).slice(0, 120)
  const b = String(body).replace(/\s+/g, ' ').slice(0, 240)
  switch (process.platform) {
    case 'darwin':
      // 走 argv 传参,不拼 shell;AppleScript 字符串里只需转义反斜杠和双引号。
      return [
        'osascript',
        ['-e', `display notification ${osaString(b)} with title ${osaString(t)}`]
      ]
    case 'linux':
      return ['notify-send', [t, b]]
    case 'win32':
      return [
        'powershell',
        [
          '-NoProfile',
          '-Command',
          `[void][System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms');` +
            `$n=New-Object System.Windows.Forms.NotifyIcon;` +
            `$n.Icon=[System.Drawing.SystemIcons]::Information;$n.Visible=$true;` +
            `$n.ShowBalloonTip(5000,${psString(t)},${psString(b)},'Info')`
        ]
      ]
    default:
      return [null, null]
  }
}

const osaString = (s) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
const psString = (s) => `'${s.replace(/'/g, "''")}'`
