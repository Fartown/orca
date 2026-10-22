---
title: Linux x64 出包与旧版更新兼容合同
status: completed
created: 2026-10-22
updated: 2026-10-22
---

关联需求：REQ-413。关联用例：TC-414。

本记录只确认合同、类型与静态门禁；真实安装和CI产物验收另记，不把本地通过视为安装完成。

- 桌面发布/清单/更新相关：12个文件，148通过、1个平台探针跳过；Linux包缺失/空文件拒绝发布，SHA512清单、旧assets兼容、新linuxAssets校验与Linux完整发布选择通过。
- 移动端集成功能：3个文件21项通过。
- 完整pnpm tc：4个项目通过；Electron net.fetch不接受URL对象，已使用类型安全的URL字符串适配，不增加断言。
- pnpm check:fork-features、check:fork-docs通过；完整check:architecture-policies共16组通过。
- 三个本地化门禁通过，定向oxlint通过。
- 本机Node24与仓库指定pnpm放在忽略的验证目录，没有修改全局Node/pnpm。
- Docker基础镜像直连超时；通过用户指定代理取回官方Ubuntu20.04 amd64清单/层，校验digest后导入Docker。容器bridge无法解析代理，改以host网络准备同一Dockerfile的构建缓存，未修改系统Docker配置或降低glibc要求。
- 真实Linux构建、CLI/headless/SSH与安装验证仍待完成。原工作树未提交的其他需求文档未动。

首轮真实CI已运行Linux原生helper且glibc门槛通过；之后verify-computer-native的Python导入报Namespace Atspi not available。工作流补装python3-gi、gir1.2-gtk-3.0、gir1.2-atspi-2.0，保持原验证执行。JavaScript实际发布构建已在本机通过，包括CLI、主进程/renderer、Web投影、技能闭包与mobile-web校验；Linux实际打包/安装仍待验。

实际本地AppImage打包确认electron-builder将Linux架构宏展开为x86_64，已将CI收集、发布清单和客户端资产名统一为orca-integration-linux-x86_64.AppImage，避免仅模拟配置测试通过而实际文件漏收。19个随包原生二进制的glibc门槛、打包Node PTY与daemon入口校验已通过。

实际打包随后验证到上游static-appimage-package-contract只接受orca-linux.AppImage/orca-linux-arm64.AppImage。最终保留上游标准orca-linux.AppImage名称，fork身份由下载仓库、版本、渠道和SHA确定；同步统一CI、发布、清单和客户端资产名，不放宽或跳过静态AppImage契约。
