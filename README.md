<p align="center">
  <img src="crates/tmd-app/icons/128x128.png" width="96" height="96" alt="TMD icon" />
</p>

<h1 align="center">TMD</h1>

<p align="center">轻量、快速、面向文本与 Markdown 的桌面编辑器。</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-3b82f6.svg" alt="MIT License" /></a>
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-2563eb.svg" alt="Windows, macOS and Linux" />
  <img src="https://img.shields.io/badge/Tauri-2-24c8db.svg" alt="Tauri 2" />
  <img src="https://img.shields.io/badge/Monaco-0.53-007acc.svg" alt="Monaco Editor" />
</p>

TMD 将 Notepad++ 的轻量文件编辑体验、VS Code 的工作区导航，以及 MarkText 风格的 Markdown 即时编辑整合在一个本地优先的桌面应用中。编辑器基于 Monaco，桌面外壳和文件能力由 Tauri 与 Rust 提供。

![TMD Markdown workspace](docs/screenshots/tmd-markdown.png)

## 主要功能

- 单文件与工作区模式，可直接打开文件或目录，也支持拖放文件。
- Monaco 编辑内核，提供多语言语法高亮、代码提示、折叠、括号匹配、多光标和大文件优化。
- VS Code 与 Notepad++ 两套快捷键方案，支持按命令分组查看和自定义。
- Markdown 默认即时编辑，并可切换源码或分屏预览模式。
- Markdown 支持大纲、表格、任务列表、数学公式、网络图片，以及 Mermaid、PlantUML 和 Vega 图表。
- 当前文件、打开文档与工作区搜索，支持普通、扩展和正则表达式模式及替换预览。
- UTF-8、UTF-8 BOM、UTF-16 和 ANSI 编码识别与转换，可切换 LF、CRLF 和 CR 行尾。
- 临时文档、打开标签、窗口位置、工作区、搜索历史和编辑设置均可恢复。
- 自绘标题栏、亮色与深色主题、文件类型图标和可调整的编辑器外观。

## 当前状态

TMD 仍在持续开发中，当前主要测试平台为 Windows 10/11。Windows x64、macOS ARM64（Apple Silicon）与 Linux x64 安装包均由 GitHub Actions 自动构建，发布版本从 [GitHub Releases](https://github.com/TP-mimanchi/TMD/releases) 获取。

## 本地开发

需要以下环境：

- Rust stable
- Node.js 20.19 或更高版本
- npm 8 或更高版本
- Windows WebView2 Runtime（macOS 与 Linux 无需额外安装）

安装前端依赖：

```powershell
cd crates\tmd-app\frontend
npm install
```

启动桌面开发模式：

```powershell
cd crates\tmd-app
cargo tauri dev
```

> Tauri CLI 会自动在 `crates/tmd-app/frontend` 目录执行 `npm run dev` / `npm run build`，因此在仓库任意目录调用 `cargo tauri` 均可。

构建安装包：

```powershell
cd crates\tmd-app
cargo tauri build
```

产物位于 `target\release\bundle`。

> `tauri.conf.json` 中开启了 `createUpdaterArtifacts`（自动更新），构建时需提供更新签名密钥，否则会报 `no Tauri private key provided`。本地构建可先生成一对密钥：
>
> ```bash
> cargo tauri signer generate -w ~/.tauri/tmd.key
> export TAURI_SIGNING_PRIVATE_KEY="$HOME/.tauri/tmd.key"   # Windows: $env:TAURI_SIGNING_PRIVATE_KEY
> ```

## 构建 macOS 应用

Tauri 不支持在 Windows 上交叉编译 macOS 应用，macOS 版本必须在 Mac 环境构建。有两种方式：

### 方式一：在 Mac 上本地构建

前置依赖（在 Mac 上安装）：

```bash
# Xcode 命令行工具
xcode-select --install

# Rust stable（已有可跳过）
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 按芯片类型添加目标
rustup target add aarch64-apple-darwin   # Apple Silicon（M1~M4）
# rustup target add x86_64-apple-darwin  # Intel Mac
```

并安装 Node.js 20.19 或更高版本。然后：

```bash
git clone <仓库地址> TMD && cd TMD

cd crates/tmd-app/frontend
npm install

# 更新签名密钥（见“本地开发”一节说明，已设置可跳过）
cargo tauri signer generate -w ~/.tauri/tmd.key
export TAURI_SIGNING_PRIVATE_KEY="$HOME/.tauri/tmd.key"

cd crates/tmd-app
# Apple Silicon
cargo tauri build --target aarch64-apple-darwin
# Intel Mac
# cargo tauri build --target x86_64-apple-darwin
```

构建产物位于 `target/aarch64-apple-darwin/release/bundle`：

- `macos/TMD.app`：应用本体，可直接拖入「应用程序」
- `dmg/TMD_<版本>_aarch64.dmg`：磁盘镜像安装包
- `macos/TMD.app.tar.gz` 与 `.sig`：自动更新产物

其他 Mac 首次打开未经公证的 `TMD.app` 会被 Gatekeeper 拦截，右键选择「打开」或执行 `xattr -dr com.apple.quarantine /Applications/TMD.app` 即可。正式分发建议配置 Apple 开发者证书签名与公证。

调试阶段也可以直接在 Mac 上运行 `cargo tauri dev`，流程与 Windows 一致。

### 方式二：GitHub Actions 自动构建（无需本地 Mac）

`.github/workflows/release.yml` 已配置 Windows / macOS（macos-26 runner，ARM64）/ Linux 三平台构建矩阵，自动签名并发布（依赖仓库 secret `TAURI_SIGNING_PRIVATE_KEY`）。

1. 确认 `crates/tmd-app/tauri.conf.json` 中的 `version` 是本次发布版本（当前 `0.1.8`）。
2. 推送对应 tag 触发发布流水线：

   ```bash
   git tag v0.1.8
   git push origin v0.1.8
   ```

3. 流水线完成后，到 [GitHub Releases](https://github.com/TP-mimanchi/TMD/releases) 下载 `TMD_0.1.8_aarch64.dmg`，在 Mac 上安装即可。

仅想构建而不发布 Release 时，可以在 GitHub 仓库的 Actions 页面手动运行 `Release` workflow，产物在该 workflow 的 Artifacts 中下载（此模式不会创建 GitHub Release）。

## 验证

```powershell
cargo test --workspace

cd crates\tmd-app\frontend
npm run test:keybindings
npm run build
```

## 项目结构

```text
crates/tmd-app/           Tauri 桌面应用与前端界面
crates/tmd-core/          文档、编码、搜索和文件系统核心
crates/tmd-app/frontend/  Monaco 与 Markdown 编辑体验
docs/                       产品、架构和界面资料
scripts/                    上游同步及开发脚本
```

## 开源与致谢

TMD 使用 [MIT License](LICENSE) 开源。

Markdown 即时编辑能力基于 [MarkText](https://github.com/marktext/marktext) 的 Muya 和[Notra](https://github.com/zhangzhibang/Notra)编辑器演进，固定的上游版本和许可证保留在 `crates/tmd-app/frontend/vendor/marktext-muya`。代码编辑能力由 [Monaco Editor](https://github.com/microsoft/monaco-editor) 提供。各第三方依赖继续遵循其各自许可证。
