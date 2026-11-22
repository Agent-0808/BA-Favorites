import { defineConfig } from 'vite';

export default defineConfig({
  // 使用相对路径，便于部署到 GitHub Pages 等子路径
  base: './',
  build: {
    outDir: 'dist'
  }
});
