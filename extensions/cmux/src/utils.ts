import { getPreferenceValues } from "@raycast/api";
import { spawnSync } from "child_process";
import { existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

interface Preferences {
  cmuxPath: string;
}

export interface Workspace {
  ref: string;
  index: number;
  title: string;
  selected: boolean;
  pinned: boolean;
  current_directory: string;
  listening_ports?: number[];
  custom_color: string | null;
}

export function getCmuxPath(): string {
  const prefs = getPreferenceValues<Preferences>();
  return prefs.cmuxPath || "/opt/homebrew/bin/cmux";
}

export function runCmux(args: string[]): { stdout: string; stderr: string } {
  const cmuxPath = getCmuxPath();
  const result = spawnSync(cmuxPath, args, { encoding: "utf8", timeout: 5000 });
  return {
    stdout: result.stdout || "",
    stderr: result.stderr || (result.error?.message ?? ""),
  };
}

export class CmuxNotRunningError extends Error {
  constructor() {
    super("cmux is not running");
    this.name = "CmuxNotRunningError";
  }
}

export class CmuxAccessDeniedError extends Error {
  constructor() {
    super("cmux socket access denied — Automation mode required");
    this.name = "CmuxAccessDeniedError";
  }
}

export async function listWorkspaces(): Promise<Workspace[]> {
  // 소켓 없으면 CLI 2.5초 타임아웃 없이 즉시 실패
  if (!existsSync(CMUX_SOCKET_PATH)) throw new CmuxNotRunningError();
  const { stdout, stderr } = runCmux(["--json", "list-workspaces"]);

  const combined = stdout + stderr;
  if (combined.includes("Socket not found")) throw new CmuxNotRunningError();
  if (combined.includes("Access denied")) throw new CmuxAccessDeniedError();

  let parsed: { workspaces?: Workspace[]; ok?: boolean; error?: string };
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new CmuxNotRunningError();
  }

  // 실제 응답: { window_ref, workspaces: [...] } (ok wrapper 없음)
  if (Array.isArray(parsed.workspaces)) {
    return parsed.workspaces;
  }

  throw new Error(parsed.error || "Unknown cmux error");
}

function checkCmuxRunning(stdout: string, stderr: string): void {
  const combined = stdout + stderr;
  if (combined.includes("Socket not found")) {
    throw new CmuxNotRunningError();
  }
  if (combined.includes("Access denied")) {
    throw new CmuxAccessDeniedError();
  }
}

export function selectWorkspace(id: string): void {
  const { stdout, stderr } = runCmux(["select-workspace", "--workspace", id]);
  checkCmuxRunning(stdout, stderr);
}

/**
 * 새 workspace를 생성하고 workspace ID(ref)를 반환합니다.
 * new-workspace는 "OK <wsId>" 형태로 응답합니다.
 */
export function openWorkspace(cwd: string): string {
  const cleanCwd = cwd.replace(/\/$/, "");
  const { stdout, stderr } = runCmux(["new-workspace", "--cwd", cleanCwd]);
  checkCmuxRunning(stdout, stderr);
  const match = stdout.trim().match(/^OK\s+(.+)$/);
  return match ? match[1] : "";
}

/**
 * cmux가 꺼진 상태에서 경로를 엽니다.
 * open -a로 앱을 즉시 실행(~0.85초 내 소켓 준비),
 * 100ms 간격으로 new-workspace를 폴링하여 소켓 올라오면 바로 생성합니다.
 */
const CMUX_SOCKET_PATH = join(
  homedir(),
  "Library",
  "Application Support",
  "cmux",
  "cmux.sock",
);

export async function openPathInCmux(path: string): Promise<string> {
  spawnSync("/usr/bin/open", ["/Applications/cmux.app"]);
  const cleanPath = path.replace(/\/$/, "");
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    // 소켓 파일 존재 확인 후 CLI 호출 — 소켓 없으면 CLI가 2.5초 대기하므로 스킵
    if (existsSync(CMUX_SOCKET_PATH)) {
      try {
        return openWorkspace(cleanPath);
      } catch {
        // 소켓 파일은 있지만 아직 준비 안 됨 — 재시도
      }
    }
    await new Promise((r) => setTimeout(r, 10));
  }
  return "";
}

export function closeWorkspace(id: string): void {
  const { stdout, stderr } = runCmux(["close-workspace", "--workspace", id]);
  checkCmuxRunning(stdout, stderr);
}

export function focusCmux(): void {
  spawnSync("open", ["-a", "/Applications/cmux.app"]);
}

/**
 * cmux가 꺼진 상태에서 실행 후 특정 workspace를 선택합니다.
 * 소켓이 올라올 때까지 최대 10초 폴링합니다.
 */
export async function launchAndSelectWorkspace(wsRef: string): Promise<void> {
  spawnSync("/usr/bin/open", ["/Applications/cmux.app"]);
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (existsSync(CMUX_SOCKET_PATH)) {
      try {
        selectWorkspace(wsRef);
        return;
      } catch {
        // 소켓 파일은 있지만 아직 준비 안 됨 — 재시도
      }
    }
    await new Promise((r) => setTimeout(r, 10));
  }
}

/**
 * Finder에서 현재 선택/열려있는 디렉토리 경로를 반환합니다.
 * - 경로 문자열: 정상
 * - "": Finder 창 없음
 * - null: osascript 실패 (권한 없음 등)
 */
export async function getFinderDirectory(): Promise<string | null> {
  const script = [
    'tell application "Finder"',
    "  if (count of selection) > 0 then",
    "    set sel to first item of selection",
    "    if class of sel is folder then",
    "      return POSIX path of (sel as alias)",
    "    else",
    "      return POSIX path of ((container of sel) as alias)",
    "    end if",
    "  else if (count of windows) > 0 then",
    "    return POSIX path of ((target of front window) as alias)",
    "  else",
    '    return ""',
    "  end if",
    "end tell",
  ].join("\n");

  const result = spawnSync("osascript", ["-e", script], {
    encoding: "utf8",
    timeout: 5000,
  });

  // osascript 실패 (권한 거부 등)
  if (result.status !== 0 || result.error) {
    return null;
  }

  return result.stdout.trim();
}
