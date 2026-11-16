# Working on EnvDesk

## Scope and implementation

- Keep changes focused on the requested behavior. Prefer direct implementations and introduce abstractions only for actual reuse or a clear separation of responsibilities.
- The React UI calls Rust commands through Tauri. Keep filesystem access, workspace boundaries, content validation, backups, and generation in the Rust backend; keep editing state and presentation in the frontend.
- Keep frontend and backend environment-file parsing consistent. Preserve comments and line endings when editing values, reject invalid or duplicate assignments, and keep override precedence explicit.

## Configuration safety

- Treat selected workspaces as user data. Use repository fixtures with synthetic values for development and tests; obtain explicit authorization before modifying or backing up a real workspace.
- Preserve the application's explicit confirmation before backup and save or generation, external-change detection before saving, and canonical-path checks that keep file access inside the selected workspace.
- Keep configuration contents local. Avoid logging configuration values, and mask sensitive fields in the table by default.
- Commit only synthetic environment fixtures. Keep real environment files, backups, build output, and dependencies out of Git.
- Use `trash` for file and directory deletion, including temporary artifacts. If it is unavailable or fails, stop and report the failure.

## UI and documentation

- Keep interface copy concise and in Chinese unless the task asks for localization. Avoid decorative labels, redundant explanations, and middle-dot separators.
- Maintain clear visual hierarchy, aligned controls, and consistent nested corner radii.
- Keep `README.md` in English and `README.zh-CN.md` in Chinese, with matching content, command examples, and language-switch links.

## Verification and delivery

- Run checks appropriate to the changes: `pnpm lint`, `pnpm test`, and `pnpm build` for frontend work; `cargo test --manifest-path src-tauri/Cargo.toml` for Rust work. For documentation-only work, verify commands against project configuration and check local links and language parity.
- The ignored Rust workspace test requires an explicitly supplied `ENVDESK_WORKSPACE_CHECK`; run it only against an authorized workspace.
- Before interactive verification, check whether the configured development port is already running. Ask the user to start it if needed; do not start project servers yourself. Use browser or computer automation only when explicitly requested, and prefer ego-browser for interactive websites. Close completed verification pages and spaces.
- Before a commit or commit-and-push delivery, complete one to three OpenCodeReview rounds, preferring delegation mode. Resolve high and medium findings before delivery; stop and report any that remain after round three. Reuse a valid review when the reviewed content has not changed.
- When reporting completion, explain the solution, name added, modified, and deleted files as applicable, and report verification results and material limitations.
