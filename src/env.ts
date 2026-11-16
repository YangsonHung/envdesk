export interface EnvFile {
  path: string;
  name: string;
  group: string;
  content: string;
}

export interface WorkspaceView {
  root: string;
  layered: boolean;
  files: EnvFile[];
}

export interface EnvEntry {
  key: string;
  value: string;
  prefix: string;
  suffix: string;
  line: number;
}

const assignment = /^(\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*)(.*)$/;

function splitComment(input: string): [string, string] {
  let quote = "";
  let escaped = false;
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\" && quote === '"') {
      escaped = true;
      continue;
    }
    if ((char === '"' || char === "'") && (!quote || quote === char)) {
      quote = quote ? "" : char;
      continue;
    }
    if (char === "#" && !quote && i > 0 && /\s/.test(input[i - 1])) {
      const start = input.slice(0, i).trimEnd().length;
      return [input.slice(0, start), input.slice(start)];
    }
  }
  return [input, ""];
}

export function parseEnv(text: string): EnvEntry[] {
  return text.split("\n").flatMap((line, index) => {
    const ending = line.endsWith("\r") ? "\r" : "";
    const match = assignment.exec(ending ? line.slice(0, -1) : line);
    if (!match) return [];
    const [value, suffix] = splitComment(match[3]);
    return [
      {
        prefix: match[1],
        key: match[2],
        value,
        suffix: suffix + ending,
        line: index,
      },
    ];
  });
}

export function updateValue(
  text: string,
  entry: EnvEntry,
  value: string,
): string {
  const lines = text.split("\n");
  lines[entry.line] = `${entry.prefix}${value}${entry.suffix}`;
  return lines.join("\n");
}

export function deleteEntry(text: string, entry: EnvEntry): string {
  const lines = text.split("\n");
  lines.splice(entry.line, 1);
  return lines.join("\n");
}

export function addEntry(text: string, key: string, value: string): string {
  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  const prefix = text && !text.endsWith("\n") ? `${text}${newline}` : text;
  return `${prefix}${prefix && !prefix.endsWith(newline + newline) ? newline : ""}${key}=${value}${newline}`;
}

export function isSensitive(key: string, value = ""): boolean {
  return (
    /(?:SECRET|TOKEN|PASSWORD|PASSWD|PRIVATE|CREDENTIAL|KEY|AUTHORIZATION|COOKIE|DATABASE_URL|REDIS_URL|DSN)/i.test(
      key,
    ) || /:\/\/[^/\s:@]+:[^@/\s]+@/.test(value)
  );
}

export function titleForFile(name: string): string {
  const labels: Record<string, string> = {
    "frontend.env": "前端",
    "backend.env": "后端",
    "biz.env": "业务后端",
    "sam-backend.env": "SAM 后端",
    "sam-frontend.env": "SAM 前端",
  };
  return labels[name] ?? name;
}
