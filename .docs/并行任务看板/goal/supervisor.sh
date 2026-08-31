#!/bin/zsh
# 盯着 orca-goal，被空转熔断掐掉就自动 resume。
# 只对 stalled 自动续；complete / blocked / 验收门失败 都停下等人。
set -u
ROOT=/Users/bytedance/dev/orca
GOAL=/Users/bytedance/.orca-goal/goals/orca-acdbe8fba0.json
LOG="$ROOT/.docs/并行任务看板/goal/supervisor.log"
MAX_RESUME=30
POLL=180
n=0

say() { print -r -- "[$(date '+%m-%d %H:%M:%S')] $*" >> "$LOG" }
say "=== supervisor 启动，每 ${POLL}s 轮询，最多自动 resume ${MAX_RESUME} 次 ==="

while :; do
  sleep $POLL
  [[ -f $GOAL ]] || { say "目标记录消失，退出"; exit 1 }

  read -r state reason turns <<<"$(python3 - "$GOAL" <<'PY'
import json,sys
d=json.load(open(sys.argv[1],encoding='utf-8'))
print(d.get('state') or '-', (d.get('finishReason') or '-').replace(' ','_'), len(d.get('turns') or []))
PY
)"

  alive=$(pgrep -f "orca-goal.*detached|detached-driver" >/dev/null 2>&1 && echo yes || echo no)

  if [[ $state == active && $alive == yes ]]; then
    say "运行中 · 第 ${turns} 轮"
    continue
  fi

  case $reason in
    *stalled*|*空转*)
      if (( n >= MAX_RESUME )); then say "已自动 resume ${n} 次，达上限，停手"; exit 2; fi
      (( n++ ))
      say "被空转熔断掐掉（第 ${turns} 轮）→ 第 ${n} 次自动 resume"
      cd "$ROOT" && node goal-mode/cli/orca-goal.mjs resume \
        --worktree "$ROOT" --detach -y >> "$LOG" 2>&1
      say "resume 已发出"
      ;;
    *complete*)
      say "★ 目标完成（第 ${turns} 轮，验收通过）—— supervisor 退出"; exit 0 ;;
    *blocked*)
      say "! agent 声称受阻，需要人介入 —— 不自动续，supervisor 退出"; exit 3 ;;
    *)
      if [[ $state == active && $alive == no ]]; then
        (( n++ )); say "驱动进程没了但记录仍是 active → 第 ${n} 次 resume"
        cd "$ROOT" && node goal-mode/cli/orca-goal.mjs resume \
          --worktree "$ROOT" --detach -y >> "$LOG" 2>&1
      else
        say "! 结束原因=${reason}（第 ${turns} 轮）—— 不自动续，supervisor 退出"; exit 4
      fi ;;
  esac
done
