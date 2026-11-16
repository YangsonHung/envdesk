use serde::Serialize;
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    path::{Component, Path, PathBuf},
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::State;

#[derive(Default)]
struct Workspace(Mutex<Option<PathBuf>>);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct EnvFile {
    path: String,
    name: String,
    group: String,
    content: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceView {
    root: String,
    layered: bool,
    files: Vec<EnvFile>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SyncResult {
    changed: Vec<String>,
    backup: Option<String>,
}

fn message(error: impl std::fmt::Display) -> String {
    error.to_string()
}
fn is_env(path: &Path) -> bool {
    path.file_name()
        .and_then(|s| s.to_str())
        .is_some_and(|s| s == ".env" || s.starts_with(".env.") || s.ends_with(".env"))
}
fn entries(path: &Path) -> Result<Vec<PathBuf>, String> {
    let mut paths = fs::read_dir(path)
        .map_err(message)?
        .map(|e| e.map(|v| v.path()).map_err(message))
        .collect::<Result<Vec<_>, _>>()?;
    paths.sort();
    Ok(paths)
}
fn current(state: &Workspace) -> Result<PathBuf, String> {
    state
        .0
        .lock()
        .map_err(message)?
        .clone()
        .ok_or_else(|| "请先选择配置目录".into())
}
fn safe_relative(path: &str) -> Result<&Path, String> {
    let path = Path::new(path);
    if path.as_os_str().is_empty()
        || path
            .components()
            .any(|c| !matches!(c, Component::Normal(_)))
    {
        return Err("文件路径无效".into());
    }
    Ok(path)
}
fn in_root(root: &Path, path: &Path) -> Result<PathBuf, String> {
    let canonical = path.canonicalize().map_err(message)?;
    if !canonical.starts_with(root) {
        return Err("文件不在所选目录中".into());
    }
    Ok(canonical)
}
fn file_record(root: &Path, path: &Path, group: String) -> Result<EnvFile, String> {
    let canonical = in_root(root, path)?;
    let path_string = path
        .strip_prefix(root)
        .map_err(message)?
        .to_string_lossy()
        .into_owned();
    let name = path
        .file_name()
        .ok_or("文件名无效")?
        .to_string_lossy()
        .into_owned();
    Ok(EnvFile {
        path: path_string,
        name,
        group,
        content: fs::read_to_string(canonical).map_err(message)?,
    })
}
#[tauri::command]
fn open_workspace(path: String, state: State<'_, Workspace>) -> Result<WorkspaceView, String> {
    let root = PathBuf::from(path).canonicalize().map_err(message)?;
    if !root.is_dir() {
        return Err("请选择目录".into());
    }
    let layered = root.join("common").is_dir() && root.join("overrides").is_dir();
    let mut files = Vec::new();
    if layered {
        for path in entries(&root.join("common"))? {
            if path.is_file() && is_env(&path) {
                files.push(file_record(&root, &path, "公共配置".into())?);
            }
        }
        for dir in entries(&root.join("overrides"))? {
            if !dir.is_dir() {
                continue;
            }
            in_root(&root, &dir)?;
            let group = dir
                .file_name()
                .ok_or("目录名无效")?
                .to_string_lossy()
                .into_owned();
            for path in entries(&dir)? {
                if path.is_file() && is_env(&path) {
                    files.push(file_record(&root, &path, group.clone())?);
                }
            }
        }
    } else {
        for path in entries(&root)? {
            if path.is_file() && is_env(&path) {
                files.push(file_record(&root, &path, "配置文件".into())?);
            }
        }
    }
    *state.0.lock().map_err(message)? = Some(root.clone());
    Ok(WorkspaceView {
        root: root.to_string_lossy().into_owned(),
        layered,
        files,
    })
}
fn assignment(line: &str) -> Option<&str> {
    let line = line.trim_start();
    if line.starts_with('#') || line.is_empty() {
        return None;
    }
    let line = line.strip_prefix("export ").unwrap_or(line);
    let (key, _) = line.split_once('=')?;
    let key = key.trim();
    let mut chars = key.chars();
    if !chars
        .next()
        .is_some_and(|c| c.is_ascii_alphabetic() || c == '_')
        || !chars.all(|c| c.is_ascii_alphanumeric() || c == '_')
    {
        return None;
    }
    Some(key)
}
fn validate(content: &str) -> Result<BTreeSet<String>, String> {
    let mut keys = BTreeSet::new();
    for (index, line) in content.lines().enumerate() {
        if line.trim().is_empty() || line.trim_start().starts_with('#') {
            continue;
        }
        let key = assignment(line).ok_or_else(|| format!("第 {} 行不是有效的配置项", index + 1))?;
        if !keys.insert(key.to_owned()) {
            return Err(format!("配置项 {key} 重复"));
        }
    }
    Ok(keys)
}
fn merge(common: &str, override_content: &str) -> Result<String, String> {
    validate(common)?;
    let local = validate(override_content)?;
    let shared = common
        .split_inclusive('\n')
        .filter(|line| assignment(line).is_none_or(|key| !local.contains(key)))
        .collect::<String>();
    let shared = shared.trim_end();
    let local_text = override_content.trim();
    Ok(match (shared.is_empty(), local_text.is_empty()) {
        (false, false) => format!("{shared}\n\n{local_text}\n"),
        (false, true) => format!("{shared}\n"),
        (true, false) => format!("{local_text}\n"),
        (true, true) => String::new(),
    })
}
fn backup_dir(root: &Path) -> Result<PathBuf, String> {
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(message)?
        .as_millis();
    let backups = root.join("backups");
    if backups.exists() {
        in_root(root, &backups)?;
    }
    let path = backups.join(format!("envdesk-{stamp}"));
    fs::create_dir_all(&path).map_err(message)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&path, fs::Permissions::from_mode(0o700)).map_err(message)?;
    }
    Ok(path)
}
fn backup_file(root: &Path, backup: &Path, source: &Path) -> Result<(), String> {
    let relative = source.strip_prefix(root).map_err(message)?;
    let dest = backup.join(relative);
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(message)?;
    }
    fs::copy(source, &dest).map_err(message)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&dest, fs::Permissions::from_mode(0o600)).map_err(message)?;
    }
    Ok(())
}
#[tauri::command]
fn save_file(
    path: String,
    original: String,
    content: String,
    state: State<'_, Workspace>,
) -> Result<String, String> {
    let root = current(&state)?;
    let relative = safe_relative(&path)?;
    let target = root.join(relative);
    let canonical = in_root(&root, &target)?;
    let layered = root.join("common").is_dir() && root.join("overrides").is_dir();
    let components: Vec<_> = relative.components().collect();
    let allowed = if layered {
        (components.len() == 2 && relative.starts_with("common"))
            || (components.len() == 3 && relative.starts_with("overrides"))
    } else {
        components.len() == 1
    };
    if !allowed || !is_env(&target) {
        return Err("只能编辑配置源文件".into());
    }
    validate(&content)?;
    if fs::read_to_string(&canonical).map_err(message)? != original {
        return Err("文件已被其他程序修改，请重新载入后再保存".into());
    }
    let backup = backup_dir(&root)?;
    backup_file(&root, &backup, &target)?;
    fs::write(&canonical, content).map_err(message)?;
    Ok(backup.to_string_lossy().into_owned())
}
fn planned(root: &Path) -> Result<BTreeMap<PathBuf, String>, String> {
    let common_dir = root.join("common");
    let override_dir = root.join("overrides");
    if !common_dir.is_dir() || !override_dir.is_dir() {
        return Err("当前目录没有分层配置".into());
    }
    let common_files = entries(&common_dir)?
        .into_iter()
        .filter(|path| path.is_file() && is_env(path))
        .collect::<Vec<_>>();
    let mut result = BTreeMap::new();
    for dir in entries(&override_dir)? {
        if !dir.is_dir() {
            continue;
        }
        in_root(root, &dir)?;
        let profile = dir.file_name().ok_or("目录名无效")?;
        for local in entries(&dir)? {
            if !local.is_file() || !is_env(&local) {
                continue;
            }
            let name = local.file_name().ok_or("文件名无效")?;
            if !common_dir.join(name).is_file() {
                return Err(format!("缺少公共配置：{}", name.to_string_lossy()));
            }
        }
        for common in &common_files {
            let name = common.file_name().ok_or("文件名无效")?;
            let local = dir.join(name);
            let common_text = fs::read_to_string(in_root(root, &common)?).map_err(message)?;
            let local_text = if local.exists() {
                fs::read_to_string(in_root(root, &local)?).map_err(message)?
            } else {
                String::new()
            };
            let generated = root.join("generated");
            if generated.exists() {
                in_root(root, &generated)?;
            }
            let profile_dir = generated.join(profile);
            if profile_dir.exists() {
                in_root(root, &profile_dir)?;
            }
            let output = profile_dir.join(name);
            if output.exists() {
                in_root(root, &output)?;
            }
            result.insert(output, merge(&common_text, &local_text)?);
        }
    }
    Ok(result)
}
#[tauri::command]
fn preview_sync(state: State<'_, Workspace>) -> Result<Vec<String>, String> {
    let root = current(&state)?;
    let mut changed = Vec::new();
    for (path, content) in planned(&root)? {
        if !path.exists() || fs::read_to_string(&path).map_err(message)? != content {
            changed.push(
                path.strip_prefix(&root)
                    .map_err(message)?
                    .to_string_lossy()
                    .into_owned(),
            );
        }
    }
    Ok(changed)
}
#[tauri::command]
fn sync_workspace(state: State<'_, Workspace>) -> Result<SyncResult, String> {
    let root = current(&state)?;
    let mut changed = Vec::new();
    for (path, content) in planned(&root)? {
        if !path.exists() || fs::read_to_string(&path).map_err(message)? != content {
            changed.push((path, content));
        }
    }
    if changed.is_empty() {
        return Ok(SyncResult {
            changed: vec![],
            backup: None,
        });
    }
    let backup = backup_dir(&root)?;
    for (path, _) in &changed {
        if path.exists() {
            backup_file(&root, &backup, path)?;
        }
    }
    let mut names = Vec::new();
    for (path, content) in changed {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(message)?;
        }
        fs::write(&path, content).map_err(message)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&path, fs::Permissions::from_mode(0o600)).map_err(message)?;
        }
        names.push(
            path.strip_prefix(&root)
                .map_err(message)?
                .to_string_lossy()
                .into_owned(),
        );
    }
    Ok(SyncResult {
        changed: names,
        backup: Some(backup.to_string_lossy().into_owned()),
    })
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn local_value_replaces_shared_without_duplicate() {
        let result = merge("# common\nA=one\nB=two\n", "A=local\n\nC=three\n").unwrap();
        assert_eq!(result, "# common\nB=two\n\nA=local\n\nC=three\n");
    }
    #[test]
    #[ignore = "需要指定只读测试目录"]
    fn existing_workspace_generation_matches() {
        let root = PathBuf::from(
            std::env::var("ENVDESK_WORKSPACE_CHECK").expect("设置 ENVDESK_WORKSPACE_CHECK"),
        );
        let planned = planned(&root).expect("读取配置");
        assert!(!planned.is_empty());
        for (path, content) in planned {
            assert!(
                fs::read_to_string(path).expect("读取生成文件") == content,
                "生成配置不一致"
            );
        }
    }
    #[test]
    fn profiles_without_override_still_receive_common_file() {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/layered");
        let files = planned(&root).expect("读取测试配置");
        assert_eq!(files.len(), 2);
        assert!(files[&root.join("generated/local/service.env")].contains("APP_PORT=5202"));
        assert!(files[&root.join("generated/staging/service.env")].contains("APP_PORT=5000"));
    }
    #[test]
    fn duplicate_and_invalid_keys_are_rejected() {
        assert!(merge("A=1\nA=2\n", "").is_err());
        assert!(merge("A=1\n", "not an assignment\n").is_err());
    }
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(Workspace::default())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            open_workspace,
            save_file,
            preview_sync,
            sync_workspace
        ])
        .run(tauri::generate_context!())
        .expect("error while running application");
}
