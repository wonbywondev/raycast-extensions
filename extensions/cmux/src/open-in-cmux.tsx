import { showHUD } from "@raycast/api";
import {
  CmuxNotRunningError,
  focusCmux,
  getFinderDirectory,
  openPathInCmux,
  openWorkspace,
  selectWorkspace,
} from "./utils";

export default async function OpenInCmuxCommand() {
  try {
    const dir = await getFinderDirectory();

    if (dir === null) {
      await showHUD("Finder 창을 찾을 수 없습니다 (Automation 권한 확인 필요)");
      return;
    }
    if (dir === "") {
      await showHUD("열린 Finder 창이 없습니다");
      return;
    }

    let wsId: string;
    try {
      wsId = openWorkspace(dir);
    } catch (err) {
      if (
        err instanceof CmuxNotRunningError ||
        (err as Error)?.name === "CmuxNotRunningError"
      ) {
        await showHUD("cmux 실행 중...");
        wsId = await openPathInCmux(dir);
        if (wsId) selectWorkspace(wsId);
        focusCmux();
        await showHUD(`cmux에서 열기: ${dir}`);
        return;
      }
      throw err;
    }

    if (wsId) selectWorkspace(wsId);
    focusCmux();
    await showHUD(`cmux에서 열기: ${dir}`);
  } catch (err) {
    if ((err as Error)?.name === "CmuxAccessDeniedError") {
      await showHUD(
        "cmux 설정 필요: Settings → Socket Control → Automation mode",
      );
    } else {
      await showHUD(`오류: ${String(err)}`);
    }
  }
}
