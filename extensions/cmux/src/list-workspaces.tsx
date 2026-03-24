import {
  Action,
  ActionPanel,
  Clipboard,
  Icon,
  List,
  Toast,
  open,
  showToast,
} from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { useEffect } from "react";
import {
  CmuxAccessDeniedError,
  CmuxNotRunningError,
  Workspace,
  closeWorkspace,
  focusCmux,
  launchAndSelectWorkspace,
  listWorkspaces,
  openWorkspace,
  selectWorkspace,
} from "./utils";

export default function ListWorkspacesCommand() {
  const { data, isLoading, error, revalidate } = useCachedPromise(
    listWorkspaces,
    [],
    {
      keepPreviousData: true,
      onError: () => {}, // 에러는 렌더에서 직접 처리 — 기본 에러 바 억제
    },
  );

  const isAccessDenied =
    error instanceof CmuxAccessDeniedError ||
    error?.name === "CmuxAccessDeniedError";
  const isNotRunning =
    !isAccessDenied &&
    (error instanceof CmuxNotRunningError ||
      error?.name === "CmuxNotRunningError");

  // 2초마다 자동 갱신 — cmux OFF 시 existsSync 가드로 ~0ms 즉시 실패
  useEffect(() => {
    const id = setInterval(revalidate, 2000);
    return () => clearInterval(id);
  }, [revalidate]);

  // 캐시 데이터가 있으면 cmux 상태와 무관하게 목록 표시
  if (data && data.length > 0) {
    return (
      <List isLoading={isLoading && !data}>
        {data.map((ws) => (
          <WorkspaceItem key={ws.ref} workspace={ws} onRefresh={revalidate} />
        ))}
      </List>
    );
  }

  if (isAccessDenied) {
    return (
      <List>
        <List.EmptyView
          icon={Icon.Lock}
          title="접근 권한 없음"
          description="cmux Settings → Socket Control → Automation mode로 변경하세요"
          actions={
            <ActionPanel>
              <Action
                title="Cmux 설정 열기"
                icon={Icon.Gear}
                onAction={() => open("/Applications/cmux.app")}
              />
            </ActionPanel>
          }
        />
      </List>
    );
  }

  if (isNotRunning) {
    return (
      <List>
        <List.EmptyView
          icon={Icon.Warning}
          title="cmux가 실행 중이 아닙니다"
          description="cmux를 실행한 후 다시 시도하세요"
          actions={
            <ActionPanel>
              <Action
                title="Cmux 실행"
                icon={Icon.Play}
                onAction={async () => {
                  await open("/Applications/cmux.app");
                  setTimeout(revalidate, 2000);
                }}
              />
              <Action
                title="새로고침"
                icon={Icon.RotateClockwise}
                onAction={revalidate}
              />
            </ActionPanel>
          }
        />
      </List>
    );
  }

  return <List isLoading={isLoading} />;
}

function WorkspaceItem({
  workspace: ws,
  onRefresh,
}: {
  workspace: Workspace;
  onRefresh: () => void;
}) {
  const accessories: List.Item.Accessory[] = [];

  if (ws.pinned) {
    accessories.push({ icon: Icon.Pin, tooltip: "Pinned" });
  }
  if (ws.listening_ports && ws.listening_ports.length > 0) {
    accessories.push({
      text: ws.listening_ports.map((p) => `:${p}`).join(" "),
    });
  }

  return (
    <List.Item
      title={ws.title || `Workspace ${ws.index}`}
      subtitle={ws.current_directory}
      accessories={accessories}
      actions={
        <ActionPanel>
          <Action
            title="Switch to Workspace"
            icon={Icon.ArrowRight}
            onAction={async () => {
              try {
                selectWorkspace(ws.ref);
                focusCmux();
                await showToast({
                  style: Toast.Style.Success,
                  title: `Switched to ${ws.title}`,
                });
              } catch (err) {
                if ((err as Error)?.name === "CmuxNotRunningError") {
                  await showToast({
                    style: Toast.Style.Animated,
                    title: "cmux 실행 중...",
                  });
                  await launchAndSelectWorkspace(ws.ref);
                  focusCmux();
                  await showToast({
                    style: Toast.Style.Success,
                    title: `Switched to ${ws.title}`,
                  });
                } else {
                  await showToast({
                    style: Toast.Style.Failure,
                    title: String(err),
                  });
                }
              }
            }}
          />
          <Action
            title="Open Directory as New Workspace"
            icon={Icon.Plus}
            shortcut={{ modifiers: ["cmd"], key: "o" }}
            onAction={async () => {
              try {
                openWorkspace(ws.current_directory);
                focusCmux();
                await showToast({
                  style: Toast.Style.Success,
                  title: `Opened ${ws.current_directory}`,
                });
              } catch (err) {
                await showToast({
                  style: Toast.Style.Failure,
                  title: String(err),
                });
              }
            }}
          />
          <Action
            title="Copy Path"
            icon={Icon.Clipboard}
            shortcut={{ modifiers: ["cmd"], key: "c" }}
            onAction={async () => {
              await Clipboard.copy(ws.current_directory);
              await showToast({
                style: Toast.Style.Success,
                title: "Path copied",
              });
            }}
          />
          <Action
            title="Close Workspace"
            icon={Icon.Trash}
            style={Action.Style.Destructive}
            shortcut={{ modifiers: ["cmd"], key: "delete" }}
            onAction={async () => {
              try {
                closeWorkspace(ws.ref);
                onRefresh();
                await showToast({
                  style: Toast.Style.Success,
                  title: `Closed ${ws.title}`,
                });
              } catch (err) {
                await showToast({
                  style: Toast.Style.Failure,
                  title: String(err),
                });
              }
            }}
          />
        </ActionPanel>
      }
    />
  );
}
