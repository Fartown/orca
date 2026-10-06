// orca-goal 的命令行帮助文本。
import { ROOT } from './goal-state.mjs'

export const USAGE = `orca-goal —— 目标模式 agent 看门狗

目标按**工作区**标识,不按终端 —— 需要独占的是「哪个目录正在被改」。
下面凡是接目录的地方,也可以给 --terminal HANDLE,会换算成它登记的工作区。

  orca-goal start [选项]                     启动目标(省略 --terminal 会让你交互式选)
  orca-goal terminals                        列出终端及其 agent 状态
  orca-goal status [--worktree 路径]         查看目标状态与驱动进程是否还活着
  orca-goal resume --worktree 路径 [选项]    接上一个已有目标继续跑(首轮不注入,先等它手上这轮跑完)
                                             可带 --check / --max-turns / --max-minutes 覆盖原配置
  orca-goal watch --worktree 路径            跟踪后台驱动的输出
  orca-goal stop --worktree 路径             停掉驱动进程(保留记录)
  orca-goal forget --worktree 路径           删除目标记录
  orca-goal rebind --worktree 路径 -t HANDLE 把目标改挂到另一个终端(原标签页关了时用;需先 stop)

start 选项:
  -f, --file 路径       从 JSON 配置文件读取,命令行参数优先级更高
  -t, --terminal HANDLE 目标终端
  --objective 文本      目标描述
  --guard 名字          守卫:claude | codex(必填)。它在每轮结束和每 15 分钟看一次进展,
                        给执行 agent 下一步,确属非人不可才问你,判完成时当场逐条验收
  --check 命令          额外检查命令,可重复。守卫判完成后再跑,全部退出码为 0 才算完成
  --check-timeout 秒    单条检查命令超时,默认 900
  --check-all           检查跑完全部再汇总;默认第一条失败就停
  --max-turns N         轮数预算,默认 20;写 0 表示不限
  --max-minutes N       时长预算,默认 180;写 0 表示不限
  --worktree 路径       取证与验收的目录,默认取终端登记的工作区
  --detach              后台跑,立刻返回;用 watch/status 跟进度
  -y, --yes             跳过检查命令的确认提示

配置文件字段:objective(字符串或字符串数组)、guard、check、checkTimeout、
maxTurns、maxMinutes、worktree、terminal。支持整行 // 注释。

状态目录:${ROOT}
`
