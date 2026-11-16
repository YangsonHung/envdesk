# EnvDesk

**English** | [中文](README.zh-CN.md)

EnvDesk is a local environment configuration manager built with Tauri 2, Rust, and React. Edit `.env` files in a regular directory or manage shared settings and environment overrides in a layered workspace.

## Features

- Search, add, edit, and remove configuration entries in a table, or edit comments and file contents in the source view.
- Mask sensitive fields in the table by default.
- Back up source files before saving and reject saves when a file has changed externally.
- Preview and generate merged configurations, with environment overrides taking precedence over shared values.
- Switch between light, dark, and system themes.
- Keep configuration contents on your device; the application does not upload them.

The application interface is currently in Chinese.

## Installation

### macOS

Install with [Homebrew](https://brew.sh/):

```bash
brew install --cask yangsonhung/tap/envdesk
```

Homebrew selects the package for your Mac and verifies its checksum. The cask removes the quarantine flag from `EnvDesk.app` after installation; this release is ad-hoc signed and not notarized by Apple.

Alternatively, download a DMG below and drag `EnvDesk.app` to Applications:

> [!WARNING]
> When installing the DMG manually, macOS may report that “EnvDesk.app is damaged and can't be opened.” This can be caused by macOS blocking this unnotarized release.
>
> After confirming that the download matches the [release checksums](https://github.com/YangsonHung/envdesk/releases/download/v0.1.0/SHA256SUMS), remove the quarantine flag from this app:
>
> ```bash
> xattr -dr com.apple.quarantine "/Applications/EnvDesk.app"
> ```

| Architecture            | Download                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------ |
| Apple Silicon (aarch64) | [DMG](https://github.com/YangsonHung/envdesk/releases/download/v0.1.0/EnvDesk_0.1.0_aarch64.dmg) |
| Intel (x86_64)          | [DMG](https://github.com/YangsonHung/envdesk/releases/download/v0.1.0/EnvDesk_0.1.0_x64.dmg)     |

### Windows

Download and run the [Windows x64 installer](https://github.com/YangsonHung/envdesk/releases/download/v0.1.0/EnvDesk_0.1.0_x64-setup.exe). The installer is unsigned and may show a system security warning.

## Local development

Install Node.js, pnpm, Rust 1.90 or later, and the [Tauri prerequisites for your platform](https://v2.tauri.app/start/prerequisites/).

```bash
git clone https://github.com/YangsonHung/envdesk.git
cd envdesk
pnpm install
pnpm tauri dev
```

The Tauri development command starts the Vite frontend on port `1420` and opens the desktop application. Running `pnpm dev` alone only serves the frontend; file operations require the Tauri application.

Build a macOS application:

```bash
pnpm tauri build --bundles app
```

The application bundle is written to `src-tauri/target/release/bundle/macos/`.

Build a Windows x64 installer on Windows:

```bash
pnpm tauri build --target x86_64-pc-windows-msvc --bundles nsis
```

The installer is written to `src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/`. Maintainers can also run the [Windows release workflow](.github/workflows/release-windows.yml) with an existing release tag; it builds that tag and uploads the installer to the matching release.

## Usage

1. Open the application and select a configuration directory. Regular directories list top-level `.env`, `.env.*`, and `*.env` files. Layered workspaces must contain both `common/` and `overrides/`.
2. Select a file in the sidebar. Search by key, edit entries, or switch to the source view to edit the original text and comments. Sensitive values are masked in the table but visible in plain text in the source view.
3. Click **备份并保存** (Back up and save) and confirm. EnvDesk backs up the current source file under the selected directory's `backups/` before writing your changes. If the file has changed externally, reload it before saving.
4. In a layered workspace, save your source changes, then click **生成配置** (Generate configuration). Review the output file list and confirm. EnvDesk backs up existing output files and updates `generated/`.

EnvDesk does not start or restart the projects it manages. Services usually need a restart to pick up configuration changes. Backups contain the original configuration values, including secrets; protect them accordingly.

### Layered workspace

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

For each environment directory under `overrides/`, EnvDesk generates every file in `common/`. An override file must have a matching filename in `common/`; its keys replace shared keys. Environments without an override file receive the shared configuration unchanged in value. `generated/` and `backups/` are created when needed.

### Supported format

Configuration entries use single-line `KEY=VALUE` assignments. Comments, the `export` prefix, and `#` inside quotes are supported. Duplicate keys and invalid assignments are rejected when saving or generating. Multiline values are not supported for saving or generation.

## Validation

```bash
pnpm lint
pnpm test
pnpm build
cargo test --manifest-path src-tauri/Cargo.toml
```

One Rust test is ignored by default because it requires an explicitly supplied workspace via `ENVDESK_WORKSPACE_CHECK`. The regular tests use synthetic fixtures in the repository.

## Contributing

Read [AGENTS.md](AGENTS.md) for development conventions and configuration safety requirements. Keep the English and Chinese READMEs in sync, and use synthetic values in examples and tests.

## License

[MIT](LICENSE) © 2026 YangsonHung
