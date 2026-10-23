import { defineConfig } from 'vite'

// 对齐发布约束（PRD §5.1）：
// - build 用相对路径 base './'，静态发布到任意子路径都能正确加载资源
// - dev 必须用 '/'：否则资源请求会被 SPA fallback 成 index.html，页面直接白屏
// - dev/preview 绑 0.0.0.0 并放行宿主，否则外部访问报 Blocked request
export default defineConfig(({ command }) => ({
  base: command === 'build' ? './' : '/',
  server: {
    host: '0.0.0.0',
    allowedHosts: true
  },
  preview: {
    host: '0.0.0.0'
  }
}))
