import { defineConfig } from 'vitest/config'

// 插件自带的测试配置。仓库主配置的 include 只覆盖 src/,而这个插件住在 .docs/ 下,
// 又需要 import 仓库里真实的 zod schema 来验 manifest —— 单独一个配置最省事。
export default defineConfig({
  test: {
    environment: 'happy-dom', // 面板要在 DOM 里跑
    include: ['**/*.test.mts'],
    root: __dirname
  }
})
