# EnvDesk

[English](README.md) | **中文**

EnvDesk 是一个使用 Tauri 2、Rust 和 React 构建的本地环境配置管理工具。它可以编辑普通目录中的 `.env` 文件，也支持通过分层目录管理公共配置和环境覆盖项。

## 功能

- 在表格中搜索、添加、修改和移除配置项，或在源码视图中编辑原始内容和注释。
- 表格中的敏感字段默认隐藏。
- 保存前备份源文件，并在文件被外部修改时拒绝覆盖。
- 预览并生成合并后的配置，环境覆盖项优先于公共配置。
- 支持浅色、深色和跟随系统的主题。
- 配置内容保留在本机，应用不会将其上传到网络。

应用界面目前为中文。

## 本地开发

安装 Node.js、pnpm、Rust 1.90 或更新版本，以及[对应系统的 Tauri 构建依赖](https://v2.tauri.app/start/prerequisites/)。

```bash
git clone https://github.com/YangsonHung/envdesk.git
cd envdesk
pnpm install
pnpm tauri dev
```

Tauri 开发命令会在端口 `1420` 启动 Vite 前端并打开桌面应用。单独运行 `pnpm dev` 仅提供前端页面，文件操作需要在 Tauri 应用中使用。

构建 macOS 应用：

```bash
pnpm tauri build --bundles app
```

构建完成后，应用位于 `src-tauri/target/release/bundle/macos/`。

## 使用

1. 打开应用，选择包含环境配置的目录。普通目录会列出顶层 `.env`、`.env.*` 和 `*.env` 文件；分层目录需要同时包含 `common/` 和 `overrides/`。
2. 在左侧选择文件，按配置键搜索，修改配置项，或切换到源码视图编辑原始内容和注释。敏感值在表格中默认隐藏，在源码视图中显示明文。
3. 点击「备份并保存」并确认，应用先将当前源文件备份到所选目录的 `backups/`，再写入修改。如果源文件已被外部修改，需要重新载入后再保存。
4. 对分层目录，保存源文件后点击「生成配置」，确认待生成文件列表。应用会备份已有生成文件并更新 `generated/`。

EnvDesk 不会自动启动或重启被管理的项目。服务通常需要重启才能读取更新后的配置。备份包含原始配置值和凭据，请妥善保管。

### 分层目录

```text
workspace/
├── common/
│   └── service.env
├── overrides/
│   ├── local/
│   │   └── service.env
│   └── staging/
├── generated/
│   ├── local/
│   │   └── service.env
│   └── staging/
│       └── service.env
└── backups/
```

应用会为 `overrides/` 下的每个环境目录生成 `common/` 中的所有文件。覆盖文件必须在 `common/` 中存在同名文件，其中的配置键会替换公共配置键。没有覆盖文件的环境会沿用公共配置的值。`generated/` 和 `backups/` 在需要时创建。

### 支持的格式

配置项使用单行 `KEY=VALUE` 格式，支持注释、`export` 前缀和引号内的 `#`。保存或生成时会拒绝重复配置键和无效配置行。多行值暂不支持保存和生成。

## 验证

```bash
pnpm lint
pnpm test
pnpm build
cargo test --manifest-path src-tauri/Cargo.toml
```

有一个 Rust 测试需要通过 `ENVDESK_WORKSPACE_CHECK` 显式指定工作区，因此默认跳过。常规测试使用仓库中的虚构配置样例。

## 参与开发

开发约定和配置安全要求见 [AGENTS.md](AGENTS.md)。修改说明时同步更新中英文 README，示例和测试仅使用虚构值。

## 协议

[MIT](LICENSE) © 2026 YangsonHung
