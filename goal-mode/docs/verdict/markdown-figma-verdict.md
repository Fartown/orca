FAIL

## 1. Design System 与基础变量

- **背景变量不一致**：Figma `34:2` 的 `bg/body = #0d0d0d`；[tailwind-theme.css](/Users/bytedance/dev/markdown/client/src/tailwind-theme.css:37) 实际为 `--bg-body: #0a0a0a`。创建页、移动端全屏评论等使用该变量的页面底色错误。
- **文本选区缺少规定的圆角覆盖层**：Figma `251:2` 要求 `#979590 32% / 白字 / r4`，并明确使用 `Range.getClientRects()`。实现只有 [tailwind-theme.css](/Users/bytedance/dev/markdown/client/src/tailwind-theme.css:260) 的原生 `::selection`，注释也承认无法实现圆角；[useTextSelection.ts](/Users/bytedance/dev/markdown/client/src/hooks/useTextSelection.ts:97) 仅调用 `getBoundingClientRect()`。
- **滚动条规格错误**：Figma `251:2` 为轨道 10px、thumb 6px、white 16%、r42、2px 透明留白且仅 hover 显形；[tailwind-theme.css](/Users/bytedance/dev/markdown/client/src/tailwind-theme.css:268) 实际是全局宽 6px、thumb 默认 white 30%、hover white 50%，没有 10px 轨道和 `background-clip` 留白。
- **Tabs 组件错误**：Figma `34:279` 为外层 h36/r12/white 4%/padding 2，激活项 h32/r8/white 8%，并有竖分隔线；[tabs.tsx](/Users/bytedance/dev/markdown/client/src/components/ui/tabs.tsx:21) 实际为 `rounded-lg`、`p-[3px]`、`bg-muted`，激活态带 border，字号 14px，且没有中间分隔线。
- **确认弹窗错误**：Figma `253:2` 为 `w350 / r24 / #161616 / 1px white12`，按钮 h42/r20 等分；[alert-dialog.tsx](/Users/bytedance/dev/markdown/client/src/components/ui/alert-dialog.tsx:48) 实际 `max-w-lg / r16 / #222 / p5`，桌面按钮 h36/r8。
- **按钮按压行为错误**：Figma Motion `250:2` 明确要求 `scale 0.97，弹簧回弹，不改颜色`；[button.tsx](/Users/bytedance/dev/markdown/client/src/components/ui/button.tsx:10) 只有颜色 transition，并在 pressed 时改变背景色。虽然 [motion.ts](/Users/bytedance/dev/markdown/client/src/lib/motion.ts:53) 定义了 `octoTap`，但代码中没有任何使用者。
- **骨架动效错误**：Figma `250:2` 要求 4s linear、背景位移 `-200% → 200%`；[skeleton.tsx](/Users/bytedance/dev/markdown/client/src/components/ui/skeleton.tsx:3) 实际使用 `animate-pulse` 和固定淡蓝白底。

## 2. 桌面阅读页 B3/B4、C1–C3、D1–D4、E1–E4

- **当前定稿 N⑨ 的三列骨架未实现**：Figma C1 `476:276`、B3 `477:1519`、B4 `477:1792` 均为正文 `x=360,w=720`，左栏 `x=40,y=92,w=280`，右栏 `x=1120,y=92,w=280,h=780`。  
  [ViewPage.tsx](/Users/bytedance/dev/markdown/client/src/pages/ViewPage/ViewPage.tsx:1344) 使用 `xl:pl-[300px] xl:pr-[380px]`，1440px 下正文实际从 `x=320` 开始；左栏在 [ViewPage.tsx](/Users/bytedance/dev/markdown/client/src/pages/ViewPage/ViewPage.tsx:1579) 为 `y=40,w=260`，右栏在 [ViewPage.tsx](/Users/bytedance/dev/markdown/client/src/pages/ViewPage/ViewPage.tsx:1656) 为 `y=40,w=340`。
- **浮层视觉错误**：Figma C1 左右栏均为 `#222 @92%`、无描边、背景模糊 40、阴影 `0 8 56 black/55%`；[DesktopUtilityPanel.tsx](/Users/bytedance/dev/markdown/client/src/pages/ViewPage/DesktopUtilityPanel.tsx:92) 使用不透明 `#222`、0.5px 描边、black/24% 阴影且没有 40px backdrop blur。
- **品牌条和动作岛被删掉**：当前 C1、B3、B4、C5、C6、F1 均有品牌条 `x40,y32,w135,h36` 和动作岛 `x1274,y33,w126,h34`。但 [Layout.tsx](/Users/bytedance/dev/markdown/client/src/components/Layout.tsx:39) 对桌面阅读路由设置 `chromeless`，并在 [Layout.tsx](/Users/bytedance/dev/markdown/client/src/components/Layout.tsx:66) 完全不渲染这两项；ViewPage 内也没有替代实现。
- **文档标题排版错误**：Figma C1 标题节点 `476:331` 为 34/44、Bold 700、字距 -2%，且标题下没有分隔线；[ViewPage.tsx](/Users/bytedance/dev/markdown/client/src/pages/ViewPage/ViewPage.tsx:1384) 添加了底部分隔线，[ViewPage.tsx](/Users/bytedance/dev/markdown/client/src/pages/ViewPage/ViewPage.tsx:1389) 使用 `text-xl` 20px、semibold。
- **收起 rail 位置和表面错误**：当前定稿收起态 rail 从 `y=92` 开始、无描边并沿用浮层表面；[ViewPage.tsx](/Users/bytedance/dev/markdown/client/src/pages/ViewPage/ViewPage.tsx:1629) 和 [ViewPage.tsx](/Users/bytedance/dev/markdown/client/src/pages/ViewPage/ViewPage.tsx:1761) 均从父容器 `y=40` 开始，并使用不透明 `bg-card` 和 0.5px 描边。
- **代码仍按废弃探索版实现**：[ViewPage.tsx](/Users/bytedance/dev/markdown/client/src/pages/ViewPage/ViewPage.tsx:1356)、[ViewPage.tsx](/Users/bytedance/dev/markdown/client/src/pages/ViewPage/ViewPage.tsx:1656) 和 [Layout.tsx](/Users/bytedance/dev/markdown/client/src/components/Layout.tsx:63) 明确引用 N⑧/N⑥；这些帧已位于 Figma `474:277 🗄 已废弃`，当前定稿是 `474:276 ✅ 定稿 · 阅读页规范（N⑨）`。

## 3. 选区与评论 C1/C2、M06

- **选区操作条样式错误**：Figma C1 `476:524` 为 `199×44/r12/#222`，首项“发起评论”是 white 8% 底，并有竖分隔线；[FloatingCommentTrigger.tsx](/Users/bytedance/dev/markdown/client/src/pages/ViewPage/FloatingCommentTrigger.tsx:115) 外层 r8、无分隔线，[FloatingCommentTrigger.tsx](/Users/bytedance/dev/markdown/client/src/pages/ViewPage/FloatingCommentTrigger.tsx:127) 首项直接使用品牌青 `variant="brand"`。
- **评论输入框结构错误**：Figma C2 `476:549` 的输入框节点 `234:448` 位于 `x=360,y=484`，宽 720、高 171、r16、white 12% 描边；[CommentDialog.tsx](/Users/bytedance/dev/markdown/client/src/pages/ViewPage/CommentDialog.tsx:257) 实际是贴近选区定位的最大 420px 小浮卡、white 10% 的 0.5px 描边。
- **输入焦点状态错误**：Figma C2 textarea 使用品牌青描边；[textarea.tsx](/Users/bytedance/dev/markdown/client/src/components/ui/textarea.tsx:14) 使用通用灰色 `border-ring` 和三像素 ring。
- **移动评论 Tabs 错误**：Figma M06 `355:156` 为 `351×40/r12`，激活项 `115.67×36/r8/white 8%`；[CommentPanel.tsx](/Users/bytedance/dev/markdown/client/src/pages/ViewPage/CommentPanel.tsx:320) 实际 h50/r8，并在 [CommentPanel.tsx](/Users/bytedance/dev/markdown/client/src/pages/ViewPage/CommentPanel.tsx:331) 把激活态做成透明底加品牌青下划线。

## 4. 创建与编辑 A1–A5、A8

- **页面头部重复且位置错误**：Figma A1/A4/A5/A8 都只有一条 100px Header。`/create` 会先渲染 [Layout.tsx](/Users/bytedance/dev/markdown/client/src/components/Layout.tsx:66) 的固定 72px 全局头，再通过 `pt-[72px]` 下移内容，同时 [CreatePage.tsx](/Users/bytedance/dev/markdown/client/src/pages/CreatePage/CreatePage.tsx:1667) 又渲染自己的页头。
- **创建页标题和边距错误**：Figma A1 标题位于 `x=40,y=38`，16/24 Medium；[CreatePage.tsx](/Users/bytedance/dev/markdown/client/src/pages/CreatePage/CreatePage.tsx:1669) 页头仅 `px-2`，[CreatePage.tsx](/Users/bytedance/dev/markdown/client/src/pages/CreatePage/CreatePage.tsx:1687) 使用 20px semibold。
- **A1 上传区错误**：Figma `287:255` 为 `x360,y272,w720,h300,r20`、1.5px white16 虚线；[CreatePage.tsx](/Users/bytedance/dev/markdown/client/src/pages/CreatePage/CreatePage.tsx:1405) 只有 `max-w-[720px]` 和内容撑高，使用 2px 边框。上传图标在 [CreatePage.tsx](/Users/bytedance/dev/markdown/client/src/pages/CreatePage/CreatePage.tsx:1465) 被包在 40px 圆形底中，而设计稿是裸图标。
- **A4 解析条和预览层级错误**：Figma `286:262` 是全视口宽 `x0,y101,w1440,h44` 的解析条，预览 `286:273` 是单一 `720×722`、#1e1e1e、无描边/阴影的舞台；[CreatePage.tsx](/Users/bytedance/dev/markdown/client/src/pages/CreatePage/CreatePage.tsx:1554) 把解析条嵌进有 margin 和描边的预览容器，[CreatePage.tsx](/Users/bytedance/dev/markdown/client/src/pages/CreatePage/CreatePage.tsx:1646) 又套了一层带描边和 shadow 的卡片。
- **A8 分栏尺寸与层级错误**：Figma `332:165` 的源码 Pane 为 `x40,w660`，预览 Pane 为 `x720,w680`；[CreatePage.tsx](/Users/bytedance/dev/markdown/client/src/pages/CreatePage/CreatePage.tsx:1768) 使用可拖动的默认 50/50 分栏。实现还在 [CreatePage.tsx](/Users/bytedance/dev/markdown/client/src/pages/CreatePage/CreatePage.tsx:1782) 额外增加一个独立底部“源码 dock”，Figma A8 顶层不存在该层。
- **A5 分享弹窗错误**：Figma `311:286` 为 `440×312/r24/#161616/1px white12`，遮罩 black 60%；[dialog.tsx](/Users/bytedance/dev/markdown/client/src/components/ui/dialog.tsx:41) 默认遮罩 black 80%，[dialog.tsx](/Users/bytedance/dev/markdown/client/src/components/ui/dialog.tsx:69) 桌面实际 r8、#222。  
  [ShareResultDialog.tsx](/Users/bytedance/dev/markdown/client/src/pages/CreatePage/ShareResultDialog.tsx:190) 还把宽度限制为 420px；链接框在 [ShareResultDialog.tsx](/Users/bytedance/dev/markdown/client/src/pages/CreatePage/ShareResultDialog.tsx:94) 使用 r16 和描边，而 Figma 为 r12、white 6% 底、无描边。

## 5. ZIP 批量导入 B1/B2

- Figma B1 `313:212` 和 B2 `336:231` 是完整页面：100px Header，加 `x360,y108,w720` 的导入 Card；[BatchImportDialog.tsx](/Users/bytedance/dev/markdown/client/src/pages/CreatePage/BatchImportDialog.tsx:284) 实际实现成带遮罩的居中 `Dialog`，内容最大宽度 672px。页面结构、位置和动线均不一致。

## 6. 我的文档 A6/A7、M02

- **桌面网格几何错误**：Figma A6 `29:2` 卡片从 `x=40` 开始，三列均为 `440×236`，列起点 40/500/960；[MyDocumentsPage.tsx](/Users/bytedance/dev/markdown/client/src/pages/MyDocumentsPage/MyDocumentsPage.tsx:216) 使用左右 60px，[MyDocumentsPage.tsx](/Users/bytedance/dev/markdown/client/src/pages/MyDocumentsPage/MyDocumentsPage.tsx:358) 使用自动网格和 12px gap，卡片最小高度仅 148px。
- **卡片状态错误**：Figma默认卡片 #1e1e1e、无描边，选中/悬停态 #222 加 1px 品牌青；[MyDocumentsPage.tsx](/Users/bytedance/dev/markdown/client/src/pages/MyDocumentsPage/MyDocumentsPage.tsx:371) 所有卡片常驻 0.5px 描边，hover 为 white 20% 描边和白色叠层。
- **卡片排版错误**：Figma标题 13px，摘要 12px white 80%；[MyDocumentsPage.tsx](/Users/bytedance/dev/markdown/client/src/pages/MyDocumentsPage/MyDocumentsPage.tsx:385) 标题 15px 且 hover 变品牌青，[MyDocumentsPage.tsx](/Users/bytedance/dev/markdown/client/src/pages/MyDocumentsPage/MyDocumentsPage.tsx:398) 摘要使用 white 60%。
- **页头错误**：Figma A6 标题 16/24，位于 `x40,y38`，搜索框 h32；[MyDocumentsPage.tsx](/Users/bytedance/dev/markdown/client/src/pages/MyDocumentsPage/MyDocumentsPage.tsx:221) 标题 20px，[MyDocumentsPage.tsx](/Users/bytedance/dev/markdown/client/src/pages/MyDocumentsPage/MyDocumentsPage.tsx:245) 搜索框桌面 h40，且还叠加 Layout 的全局头。
- **M02 底部检索条错误**：Figma `32:242` 为 `x12,y732,w351,h64,r16,#1e1e1e` 的浮卡；[MyDocumentsPage.tsx](/Users/bytedance/dev/markdown/client/src/pages/MyDocumentsPage/MyDocumentsPage.tsx:237) 实际铺满 `inset-x-0,bottom-0`，带整屏顶部边框，没有 12px 外边距和 r16 浮卡。
- **A7 空态字阶错误**：Figma A7 标题“还没有文档”为 20px Medium、white 100%；[PageEmpty.tsx](/Users/bytedance/dev/markdown/client/src/components/PageEmpty.tsx:53) 默认标题为 18px semibold、white 80%。

## 7. 移动阅读 M01、M03–M05、M09–M10

- **正文 Card 缺失**：Figma M03 `40:35` 为 `x12,y160,w351,h300,r16,#1e1e1e`；M09/M10 同样使用 `x12,w351,r16` 文档 Card。[ViewPage.tsx](/Users/bytedance/dev/markdown/client/src/pages/ViewPage/ViewPage.tsx:1377) 的移动文章是透明背景、无圆角、无 Card 容器，并带桌面同款标题分隔线。
- **顶栏与 TOC 结构错误**：Figma M03 有独立 Header `x0,y44,h52`，以及独立 TOC pill `x12,y108,w351,h40`；[ReadingToolbar.tsx](/Users/bytedance/dev/markdown/client/src/pages/ViewPage/ReadingToolbar.tsx:78) 把章节胶囊和更多按钮合并为一条 `top-3,h52` 浮卡，同时 Layout 还另外渲染返回按钮和动作岛。
- **底部阅读条尺寸错误**：Figma M03 `40:58` 为 `x12,y732,w351,h64`，即 bottom 16；[MobileReadingBar.tsx](/Users/bytedance/dev/markdown/client/src/pages/ViewPage/MobileReadingBar.tsx:42) 实际 `bottom-3`、h52。
- **M05 对比页工具层重复**：Figma M05 是一条 TopBar、一条摘要行和底部动作区；[VersionViewerBar.tsx](/Users/bytedance/dev/markdown/client/src/pages/ViewPage/VersionViewerBar.tsx:74) 自己生成完整 diff 顶栏，ViewPage 同时还渲染 ReadingToolbar 和移动底部操作，形成设计稿中不存在的多套工具层。
- **M09 版本弹层错误**：Figma `359:194` 为 `x0,y370,w375,h442,r16,#161616`，遮罩 black 60%；[VersionChip.tsx](/Users/bytedance/dev/markdown/client/src/pages/ViewPage/VersionChip.tsx:298) 使用 `bg-card` 即 #222，[drawer.tsx](/Users/bytedance/dev/markdown/client/src/components/ui/drawer.tsx:32) 默认遮罩 black 80%。
- **M08 分享弹层同样错误**：Figma `359:83` 为 `y472,h340,#161616`、black 60%；[ShareResultDialog.tsx](/Users/bytedance/dev/markdown/client/src/pages/CreatePage/ShareResultDialog.tsx:127) 同样使用 #222 Drawer 和 black 80% 遮罩。
- **M07 移动新建提示错误**：Figma `359:53` 是 `x12,y140,w351,h290,r16` 的提示 Card，且只有“粘贴一段 Markdown”动线；[CreatePage.tsx](/Users/bytedance/dev/markdown/client/src/pages/CreatePage/CreatePage.tsx:1119) 使用无 Card 背景的通用 PageEmpty，并在 [CreatePage.tsx](/Users/bytedance/dev/markdown/client/src/pages/CreatePage/CreatePage.tsx:1143) 额外增加设计稿没有的“查看我的文档”按钮。

## 8. 图片与 Mermaid 查看器 C5–C7

- **C5/C6 全屏舞台错误**：Figma C5 `479:1092`、C6 `479:1365` 都是标题 `x40,y34`、关闭按钮 `x1368,y28,32×32`、舞台 `x280,y140,w880,h540`、工具条 `x610,y726,w220,h36`。  
  [MediaViewerShell.tsx](/Users/bytedance/dev/markdown/client/src/components/MediaViewerShell.tsx:129) 把标题做成 `top16,left16` 的两行毛玻璃 Card，[MediaViewerShell.tsx](/Users/bytedance/dev/markdown/client/src/components/MediaViewerShell.tsx:148) 关闭按钮为带背景/描边的 36px 控件；内容直接占满全屏，没有 880×540 舞台，[MediaViewerShell.tsx](/Users/bytedance/dev/markdown/client/src/components/MediaViewerShell.tsx:165) 工具条固定 bottom24、桌面 h40。
- **C7 Mermaid 评论布局错误**：Figma C7 `334:165` 的画布为 `x40,y100,w980,h680`，评论面板 `x1060,y100,w340,h760`；[MermaidDiagramViewer.tsx](/Users/bytedance/dev/markdown/client/src/components/MermaidDiagramViewer.tsx:227) 复用全屏 MediaViewerShell，[MermaidDiagramViewer.tsx](/Users/bytedance/dev/markdown/client/src/components/MermaidDiagramViewer.tsx:283) 评论面板实际 `top80,right16,bottom96,w260`。

## 9. 异步加载 D5

- Figma D5 `477:2086` 的 Mermaid 占位 `124:444` 为 `720×200/r12`，图片占位 `124:450` 为 `720×300/r12`。  
  [MermaidBlock.tsx](/Users/bytedance/dev/markdown/client/src/components/MermaidBlock.tsx:303) 在占位外额外增加 padding、描边和容器，骨架只是 `min-height:200`；[ImageBlock.tsx](/Users/bytedance/dev/markdown/client/src/components/ImageBlock.tsx:103) 根据自然比例动态预留，拿不到尺寸时仅 160px，不是固定 300px。两者还都使用了与 Figma Motion 不一致的 `animate-pulse`。

## 10. 404 F1

- Figma F1 `75:31` 保留品牌条和动作岛；桌面阅读路由的 [Layout.tsx](/Users/bytedance/dev/markdown/client/src/components/Layout.tsx:39) 会把它们全部隐藏。
- Figma标题“文档不存在”为 20px Medium、white 100%；[PageEmpty.tsx](/Users/bytedance/dev/markdown/client/src/components/PageEmpty.tsx:57) 为 18px semibold、white 80%。
- Figma返回按钮的箭头位于文案之后；[ViewPage.tsx](/Users/bytedance/dev/markdown/client/src/pages/ViewPage/ViewPage.tsx:1087) 使用文案前置的 `ArrowLeft`，按钮形态也走通用 outline，而不是 Figma 当前形态。

真实浏览器任务在形成可用验收结果前被外部中断，因此没有把字体光栅化、实际动画手感和最终截图差异计入上述条目。以上均为已直接读取的当前 Figma 节点数值与真实源码值之间的确定性冲突，已经足以判定整体未达成。