import { useLayoutEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Popover } from "radix-ui";
import {
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Eye,
  EyeOff,
  FileCode2,
  Layers2,
  Search,
  PanelLeft,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  addEntry,
  deleteEntry,
  isSensitive,
  parseEnv,
  titleForFile,
  updateValue,
} from "./env";
import type { EnvFile, WorkspaceView } from "./env";
import "./App.css";

type ConfirmAction = "save" | "sync" | "discard" | null;
type Theme = "system" | "light" | "dark";

function App() {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem("envdesk-theme");
    return saved === "light" || saved === "dark" ? saved : "system";
  });
  const [workspace, setWorkspace] = useState<WorkspaceView | null>(null);
  const [selectedPath, setSelectedPath] = useState("");
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [visible, setVisible] = useState<Set<string>>(new Set());
  const [raw, setRaw] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [entryError, setEntryError] = useState("");
  const [confirm, setConfirm] = useState<ConfirmAction>(null);
  const [pendingPath, setPendingPath] = useState("");
  const [syncFiles, setSyncFiles] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    new Set(),
  );

  useLayoutEffect(() => {
    const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      document.documentElement.dataset.theme =
        theme === "system" ? (systemTheme.matches ? "dark" : "light") : theme;
    };
    applyTheme();
    systemTheme.addEventListener("change", applyTheme);
    return () => systemTheme.removeEventListener("change", applyTheme);
  }, [theme]);

  const selected = workspace?.files.find((file) => file.path === selectedPath);
  const dirty = Boolean(selected && draft !== selected.content);
  const entries = useMemo(() => parseEnv(draft), [draft]);
  const filtered = useMemo(
    () =>
      entries.filter((entry) =>
        entry.key.toLowerCase().includes(query.trim().toLowerCase()),
      ),
    [entries, query],
  );
  const groups = useMemo(() => {
    const result = new Map<string, EnvFile[]>();
    workspace?.files.forEach((file) =>
      result.set(file.group, [...(result.get(file.group) ?? []), file]),
    );
    return result;
  }, [workspace]);

  function activate(file: EnvFile) {
    setSelectedPath(file.path);
    setDraft(file.content);
    setQuery("");
    setVisible(new Set());
    setRaw(false);
    setError("");
  }

  function selectFile(file: EnvFile) {
    setNavOpen(false);
    if (file.path === selectedPath) return;
    if (dirty) {
      setPendingPath(file.path);
      setConfirm("discard");
      return;
    }
    activate(file);
  }

  async function loadWorkspace(path: string, preferred = "") {
    const result = await invoke<WorkspaceView>("open_workspace", { path });
    if (result.root !== workspace?.root) setCollapsedGroups(new Set());
    setWorkspace(result);
    const file =
      result.files.find((item) => item.path === preferred) ?? result.files[0];
    if (file) activate(file);
    else {
      setSelectedPath("");
      setDraft("");
    }
    return result;
  }

  async function chooseWorkspace() {
    if (dirty) {
      setError("请先保存或撤销当前修改，再切换目录。");
      return;
    }
    try {
      const path = await open({
        directory: true,
        multiple: false,
        title: "选择环境配置目录",
      });
      if (!path) return;
      setBusy(true);
      setError("");
      setMessage("");
      await loadWorkspace(path);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!selected || !workspace) return;
    try {
      setBusy(true);
      setError("");
      const backup = await invoke<string>("save_file", {
        path: selected.path,
        original: selected.content,
        content: draft,
      });
      const path = selected.path;
      await loadWorkspace(workspace.root, path);
      setMessage(`已保存，备份位于 ${backup}`);
      setConfirm(null);
    } catch (err) {
      setError(String(err));
      setConfirm(null);
    } finally {
      setBusy(false);
    }
  }

  async function requestSync() {
    if (dirty) {
      setError("请先保存或撤销当前修改，再生成配置。");
      return;
    }
    try {
      setBusy(true);
      setError("");
      const files = await invoke<string[]>("preview_sync");
      if (!files.length) {
        setMessage("生成配置已是最新。");
        return;
      }
      setSyncFiles(files);
      setConfirm("sync");
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function sync() {
    try {
      setBusy(true);
      setError("");
      const result = await invoke<{ changed: string[]; backup: string | null }>(
        "sync_workspace",
      );
      setMessage(
        result.changed.length
          ? `已生成 ${result.changed.length} 个文件${result.backup ? `，备份位于 ${result.backup}` : ""}`
          : "生成配置已是最新。",
      );
      setConfirm(null);
    } catch (err) {
      setError(String(err));
      setConfirm(null);
    } finally {
      setBusy(false);
    }
  }

  function openNewEntry() {
    setEntryError("");
    setNewOpen(true);
  }

  function add() {
    const key = newKey.trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      setEntryError("配置名只能包含英文字母、数字和下划线，且不能以数字开头。");
      return;
    }
    if (entries.some((entry) => entry.key === key)) {
      setEntryError("该配置项已存在。");
      return;
    }
    if (/[\r\n]/.test(newValue)) {
      setEntryError("值不能包含换行。");
      return;
    }
    setDraft(addEntry(draft, key, newValue));
    setNewKey("");
    setNewValue("");
    setNewOpen(false);
    setEntryError("");
    setQuery("");
  }

  function toggleVisible(key: string) {
    setVisible((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const navigation = (
    <>
      <div className="brand">
        <div className="brand-mark">
          <Layers2 size={19} />
        </div>
        <strong>EnvDesk</strong>
      </div>
      <button
        className="workspace-switch"
        onClick={() => {
          setNavOpen(false);
          void chooseWorkspace();
        }}
        disabled={busy}
        title={workspace?.root ?? "选择配置目录"}
        aria-label="选择配置目录"
      >
        <span className="workspace-name">
          {workspace
            ? workspace.root.split("/").filter(Boolean).at(-1)
            : "选择配置目录"}
        </span>
        <ChevronDown size={14} />
      </button>
      <nav className="nav-scroll" aria-label="配置文件">
        {Array.from(groups.entries()).map(([group, files]) => (
          <section className="nav-group" key={group}>
            <button
              type="button"
              className="nav-group-title"
              aria-expanded={!collapsedGroups.has(group)}
              onClick={() =>
                setCollapsedGroups((previous) => {
                  const next = new Set(previous);
                  if (next.has(group)) next.delete(group);
                  else next.add(group);
                  return next;
                })
              }
            >
              <ChevronRight size={13} aria-hidden="true" />
              <span className="nav-group-name">
                {group === "公共配置" || group === "配置文件"
                  ? group
                  : `环境 ${group}`}
              </span>
            </button>
            {!collapsedGroups.has(group) &&
              files.map((file) => (
                <button
                  key={file.path}
                  className={`nav-item ${selectedPath === file.path ? "active" : ""}`}
                  aria-current={selectedPath === file.path ? "page" : undefined}
                  onClick={() => selectFile(file)}
                  disabled={busy}
                  title={file.path}
                >
                  <span>{titleForFile(file.name)}</span>
                  {selectedPath === file.path && dirty && (
                    <i role="img" aria-label="有未保存修改" />
                  )}
                </button>
              ))}
          </section>
        ))}
      </nav>
      <label className="theme-setting">
        <span>主题</span>
        <select
          value={theme}
          onChange={(event) => {
            const next = event.target.value as Theme;
            setTheme(next);
            localStorage.setItem("envdesk-theme", next);
          }}
        >
          <option value="system">跟随系统</option>
          <option value="light">浅色</option>
          <option value="dark">深色</option>
        </select>
      </label>
    </>
  );

  return (
    <main className="app-shell">
      <aside className="sidebar">{navigation}</aside>
      <Dialog open={navOpen} onOpenChange={setNavOpen}>
        <DialogContent className="navigation-drawer">
          <DialogHeader className="sr-only">
            <DialogTitle>配置文件导航</DialogTitle>
            <DialogDescription>选择工作区或配置文件。</DialogDescription>
          </DialogHeader>
          {navigation}
        </DialogContent>
      </Dialog>
      <div className="main-column" aria-busy={busy}>
        <header className="topbar">
          <Button
            className="navigation-toggle"
            variant="ghost"
            size="icon"
            aria-label="打开文件导航"
            onClick={() => setNavOpen(true)}
          >
            <PanelLeft />
          </Button>
          <div className="breadcrumb">
            <span>
              {workspace
                ? workspace.root.split("/").filter(Boolean).at(-1)
                : "工作区"}
            </span>
            {selected && (
              <>
                <ChevronRight size={13} />
                <strong>
                  {selected.group === "公共配置" ||
                  selected.group === "配置文件"
                    ? selected.group
                    : `环境 ${selected.group}`}
                </strong>
              </>
            )}
          </div>
          <Popover.Root>
            <Popover.Trigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="使用说明">
                <CircleHelp />
              </Button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                className="help-popover"
                align="end"
                sideOffset={8}
                collisionPadding={16}
              >
                <Popover.Title className="sr-only">使用说明</Popover.Title>
                <Popover.Description>
                  {workspace
                    ? "编辑后点击“备份并保存”。"
                    : "选择配置目录，编辑后点击“备份并保存”。"}
                </Popover.Description>
                {workspace?.layered && (
                  <p>公共配置与环境覆盖项分别保存，再点击“生成配置”。</p>
                )}
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        </header>
        {(error || message) && (
          <div
            className={`notice ${error ? "notice-error" : ""}`}
            role={error ? "alert" : "status"}
          >
            {error ? <CircleHelp size={16} /> : <Check size={16} />}
            <span>{error || message}</span>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="关闭提示"
              onClick={() => {
                setError("");
                setMessage("");
              }}
            >
              <X />
            </Button>
          </div>
        )}
        {!workspace ? (
          <div className="welcome">
            <div className="welcome-symbol">
              <Layers2 size={30} />
            </div>
            <h1>管理本地环境配置</h1>
            <Button onClick={chooseWorkspace} disabled={busy}>
              {busy ? "正在读取目录…" : "选择配置目录"}
            </Button>
            {busy && (
              <div className="loading-preview" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
            )}
          </div>
        ) : !selected ? (
          <div className="welcome">
            <div className="welcome-symbol">
              <FileCode2 size={30} />
            </div>
            <h1>没有找到配置文件</h1>
            <p>选择包含 .env 文件或分层配置的目录。</p>
            <Button variant="outline" onClick={chooseWorkspace} disabled={busy}>
              选择配置目录
            </Button>
          </div>
        ) : (
          <section className="content" aria-label="配置编辑器">
            <div className="content-head">
              <div className="file-heading">
                <div className="file-title">
                  <h1>{titleForFile(selected.name)}</h1>
                  {dirty && <span className="dirty-badge">未保存</span>}
                </div>
                <div className="path-line" title={selected.path}>
                  <span>{selected.path}</span>
                </div>
              </div>
              <div className="head-actions">
                {busy && (
                  <span className="operation-status" role="status">
                    正在处理…
                  </span>
                )}
                {workspace.layered && (
                  <Button
                    variant="outline"
                    onClick={requestSync}
                    disabled={busy}
                  >
                    生成配置
                  </Button>
                )}
                <Button
                  onClick={() => setConfirm("save")}
                  disabled={!dirty || busy}
                >
                  备份并保存
                </Button>
              </div>
            </div>
            <div className="editor">
              <div className="editor-toolbar">
                <div className="view-switch" role="group" aria-label="编辑视图">
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-pressed={!raw}
                    onClick={() => setRaw(false)}
                    disabled={busy}
                  >
                    表格视图
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-pressed={raw}
                    onClick={() => setRaw(true)}
                    disabled={busy}
                  >
                    源码视图
                  </Button>
                </div>
                {!raw && (
                  <div className="search-box">
                    <Search size={16} />
                    <Input
                      aria-label="搜索配置名"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="搜索配置名"
                      disabled={busy}
                    />
                    {query && (
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label="清空搜索"
                        onClick={() => setQuery("")}
                      >
                        <X />
                      </Button>
                    )}
                  </div>
                )}
                <div className="editor-actions">
                  {dirty && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() => {
                        setDraft(selected.content);
                        setError("");
                      }}
                    >
                      撤销
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={openNewEntry}
                  >
                    添加配置
                  </Button>
                </div>
              </div>
              {raw ? (
                <div className="raw-wrap">
                  <div className="raw-caption">源码包含敏感值明文</div>
                  <Textarea
                    aria-label="配置文件源码"
                    spellCheck={false}
                    value={draft}
                    disabled={busy}
                    onChange={(event) => setDraft(event.target.value)}
                    className="raw-editor"
                  />
                </div>
              ) : (
                <div className="table-scroll">
                  <table className="config-table">
                    <colgroup>
                      <col className="key-column" />
                      <col />
                      <col className="action-column" />
                    </colgroup>
                    <thead>
                      <tr>
                        <th scope="col">配置名称</th>
                        <th scope="col">配置值</th>
                        <th scope="col">
                          <span className="sr-only">操作</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((entry) => {
                        const sensitive = isSensitive(entry.key, entry.value);
                        const shown = visible.has(entry.key);
                        return (
                          <tr key={`${entry.key}-${entry.line}`}>
                            <th scope="row">
                              <span className="config-name" title={entry.key}>
                                {entry.key}
                              </span>
                            </th>
                            <td>
                              <div className="value-wrap">
                                <input
                                  aria-label={`${entry.key} 的值`}
                                  type={
                                    sensitive && !shown ? "password" : "text"
                                  }
                                  autoComplete="off"
                                  spellCheck={false}
                                  value={entry.value}
                                  disabled={busy}
                                  onChange={(event) =>
                                    setDraft(
                                      updateValue(
                                        draft,
                                        entry,
                                        event.target.value,
                                      ),
                                    )
                                  }
                                />
                                {sensitive && (
                                  <Button
                                    className="row-icon"
                                    variant="ghost"
                                    size="icon-sm"
                                    disabled={busy}
                                    aria-label={`${shown ? "隐藏" : "显示"} ${entry.key}`}
                                    aria-pressed={shown}
                                    onClick={() => toggleVisible(entry.key)}
                                  >
                                    {shown ? <EyeOff /> : <Eye />}
                                  </Button>
                                )}
                              </div>
                            </td>
                            <td>
                              <Button
                                className="row-delete"
                                variant="ghost"
                                size="icon-sm"
                                disabled={busy}
                                aria-label={`删除 ${entry.key}`}
                                title="删除配置项"
                                onClick={() =>
                                  setDraft(deleteEntry(draft, entry))
                                }
                              >
                                <Trash2 />
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {!filtered.length && (
                    <div className="empty-list">
                      <h2>{query ? "没有匹配的配置项" : "暂无配置项"}</h2>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (query) setQuery("");
                          else openNewEntry();
                        }}
                        disabled={busy}
                      >
                        {query ? "清空搜索" : "添加配置"}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        )}
      </div>
      <Dialog
        open={newOpen}
        onOpenChange={(open) => {
          setNewOpen(open);
          if (!open) setEntryError("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>添加配置项</DialogTitle>
            <DialogDescription className="sr-only">
              添加到当前文件，保存后写入磁盘。
            </DialogDescription>
          </DialogHeader>
          <div className="dialog-fields">
            <label htmlFor="new-key">配置名称</label>
            <Input
              id="new-key"
              value={newKey}
              onChange={(event) => setNewKey(event.target.value)}
              placeholder="例如 APP_PORT"
            />
            <label htmlFor="new-value">配置值</label>
            <Input
              id="new-value"
              type={isSensitive(newKey) ? "password" : "text"}
              value={newValue}
              onChange={(event) => setNewValue(event.target.value)}
              placeholder="输入配置值"
            />
            {entryError && (
              <p className="field-error" role="alert">
                {entryError}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)}>
              取消
            </Button>
            <Button onClick={add}>添加</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirm === "save"
                ? "备份并保存配置"
                : confirm === "sync"
                  ? "生成完整配置"
                  : "放弃未保存的修改？"}
            </DialogTitle>
            <DialogDescription>
              {confirm === "save"
                ? "当前文件会先备份到工作区的 backups 目录，然后保存修改。"
                : confirm === "sync"
                  ? `将重新生成 ${syncFiles.length} 个文件，并先备份已有文件。`
                  : "切换文件后，当前尚未保存的修改将丢失。"}
            </DialogDescription>
          </DialogHeader>
          {confirm === "sync" && (
            <div className="sync-list">
              {syncFiles.map((path) => (
                <div key={path}>
                  <FileCode2 size={14} />
                  <span>{path}</span>
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)}>
              取消
            </Button>
            <Button
              disabled={busy}
              onClick={() => {
                if (confirm === "save") void save();
                else if (confirm === "sync") void sync();
                else {
                  const file = workspace?.files.find(
                    (item) => item.path === pendingPath,
                  );
                  if (file) activate(file);
                  setConfirm(null);
                }
              }}
            >
              {confirm === "save"
                ? "备份并保存"
                : confirm === "sync"
                  ? "备份并生成"
                  : "放弃修改"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

export default App;
