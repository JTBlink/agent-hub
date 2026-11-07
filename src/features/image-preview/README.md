# 图片预览模块

`index.ts` 是宿主入口；`ImagePreview` 预览一个版本，`ImageComparison` 组合两个独立查看器并支持左右／上下排列。文件树和 Git 页面只提供 `ImageSource` 与版本标签，不持有图片内容。Git 的版本选择位于 `components/git/GitImagePreview.tsx`。

`api.ts` 定义路径识别及 IPC 契约，`useImagePreview` 按挂载需求读取，切换目标时丢弃旧响应，响应文件保存和 Git 变更事件，卸载时移除订阅。图片不进入文本草稿存储，没有全局图片缓存；隐藏标签卸载图片读取器并释放 Blob URL，大图弹窗复用同一个 URL。工作区／暂存区／HEAD 的连续变更通知合并为一次刷新，提交及父提交不因工作区变更重复读取。查看器支持适应窗口、25%–800% 相对缩放、Ctrl＋滚轮／触控板捏合、大图弹窗、透明棋盘背景、尺寸和文件大小；缩放改变布局尺寸，放大后可滚动到完整图片。

后端 `core/project_images.rs` 与 `commands/project_images.rs` 独立提供 `read_project_image`，沿用已登记项目／工作树授权和文件路径边界；支持工作区、暂存区、HEAD、指定提交和第一父提交。工作区图片可在普通非 Git 目录打开。版本不存在返回空状态，读取失败显示可重试错误；采用 Tauri 官方 `ipc::Response` 二进制响应，前端用 Blob URL 显示，避免 Base64／JSON 编码图片。空响应表示版本不存在，空文件返回错误。单图最多 20 MiB；Rust `image` 库只读取栅格尺寸，限制最长边 32768 像素、总像素 32 Mi，避免仅凭压缩大小放行巨图。原始图片不转码，保留透明度和动画。支持 PNG、JPEG、GIF、WebP、BMP、ICO、SVG，最终解码能力由系统 WebView 决定，解码失败明确提示。SVG 仅通过图片元素加载，不作为页面 HTML 注入。

结构参考 Orca 的 `ImageViewer`、`ImageDiffViewer` 及二进制预览分流，组件、主题和模态框沿用 AgentHub；不引入 Electron、Monaco 或 PDF 依赖。

回归：`npx vitest run src/features/image-preview/ImagePreview.test.tsx src/features/image-preview/imageZoom.test.ts src/components/git/GitImagePreview.test.tsx`，后端：`cargo test --manifest-path src-tauri/Cargo.toml project_images`。

浏览器验收：在项目根启动 `npx vite --host 127.0.0.1 --port 4179 --strictPort`，确保 web-access 共享代理可用，再运行 `node tests/browser/image-preview.mjs`。数据为合成图片，检查明暗主题、缩放、窄容器、弹窗、版本缺失及解码失败。
