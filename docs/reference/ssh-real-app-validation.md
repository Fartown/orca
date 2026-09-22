# 自己搭 SSH 真机验证

SSH 场景的真机验证由改动者自己搭，不要退回给用户。本机就够：loopback 上有一个 **root 运行的
sshd（`127.0.0.1:2222`）**，配一个隔离的 app 实例即可覆盖「客户端在这台机器、工作区在 SSH 主机上」。

## 为什么必须用 root 的那个 sshd

**不要自己起用户级 sshd。** 非特权 sshd 建立会话的方式不同：Orca 用 `nohup … &` 拉起 relay 时会报
`nohup: can't detach from console: Inappropriate ioctl for device`，relay 起不来；改 `PermitTTY no`
之后变成 `ssh:connect` 挂起。这不是 macOS 通病 —— 用 `pty.fork()` 在普通 PTY 下跑同一条命令，
nohup 正常分离。用户 `~/.ssh/user_sshd/` 下那份（同样监听 2222）也是非特权的，别拿它当主机。

登录方式：向 `~/.ssh/authorized_keys` 临时追加一把专用公钥，跑完把那一行删掉。

## 跑之前

- `pnpm run build:relay` —— e2e 的构建不含 relay，不先构建的话主机侧起不来。
- `unset` 所有 `ORCA_*` 环境变量。agent 会话往往跑在用户自己的 Orca 终端里，环境里带着
  `ORCA_USER_DATA_PATH`、`ORCA_AGENT_HOOK_*`、`ORCA_WORKTREE_ID`；不清掉，测试实例或 CLI 会连上
  用户正在用的那个 Orca。
- `ls ~/.orca-remote` 留一份快照。部署测试版 relay 会触发 Orca 自带的旧版本回收，删掉当时没有
  relay 进程在用的 `~/.orca-remote/relay-*` 目录（用户真实主机的 relay 下次连接要重新上传）。
  跑完删掉测试版 relay 目录，并在报告里写明动过什么。

## 写 spec 时

- Playwright 的页面夹具叫 `orcaPage`，不是 `page`。
- e2e 夹具隔离了 Electron 的 HOME，但经 sshd 起的 relay 用的是**真实 HOME**。两边要读同一个目录时
  （例如 `~/.orca-artifact-share`），给主机实例显式传环境变量指向真实路径。
- 仓库自带 `ORCA_E2E_SSH_LOCALHOST=1` 这条开关，见 `tests/e2e/ssh-localhost.spec.ts`
  与 `tests/e2e/helpers/orca-app.ts`。

## 可复用的夹具

验证产物按惯例落在 `.docs/<主题>-ui-validation/<日期>/`（git 忽略），已有的可直接抄：

- `.docs/remote-workspace-absolute-path-open-ui-validation/2026-09-11/scripts/local-ssh-fixture.sh`
  —— 授权/撤销密钥 + 播种远端 git 仓库；同目录 `run-validation.sh` 是入口。
- `.docs/artifact-lan-share-ui-validation/2026-09-17/scripts/` —— 双实例（客户端 + 主机）脚本。

本机上这些目录若已被清理，按上面几节重建即可。
