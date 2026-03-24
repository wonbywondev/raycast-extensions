# PLAN: Raycast Extension for cmux

## 목표
cmux의 workspace를 Raycast에서 탐색/전환하고, Finder 선택 폴더를 cmux로 빠르게 열 수 있는 Raycast extension 구현.

---

## 프로젝트 구조

```
raycast-cmux/           ← 프로젝트 루트 (= /Users/won/dev/00_projects/raycast_cmux)
  package.json
  tsconfig.json
  src/
    list-workspaces.tsx  ← Command 1: List & switch workspaces
    open-in-cmux.tsx     ← Command 2: Open Finder selection in cmux
    utils.ts             ← 공통 유틸 (CLI 호출, Finder 선택 등)
  assets/
    (아이콘 추가 예정)
  COMPASS/
  reference/
```

---

## Command 1: List Workspaces (`list-workspaces.tsx`)

### 동작
1. `cmux --json list-workspaces` 실행
2. workspace 목록을 Raycast List로 표시
3. 각 항목: 제목, 현재 디렉토리, 포트, 핀 여부, 선택 여부
4. 선택 시: `cmux select-workspace --workspace <id>` + cmux 앱 포커스

### Actions (⌘K로 열리는 액션 패널)
- `↵ Enter`: workspace 전환 (select-workspace)
- `⌘ O`: cmux에서 새 workspace로 열기 (디렉토리 재사용)
- `⌘ C`: 경로 클립보드 복사
- `⌘ ⌫`: workspace 닫기 (close-workspace)

### 에러 처리
- cmux 미실행: "cmux가 실행 중이 아닙니다" + "cmux 실행" 액션
- Access denied: "Socket Control → Automation mode" 안내

---

## Command 2: Open in cmux (`open-in-cmux.tsx`)

### 동작 흐름
```
Raycast 실행
  → osascript: Finder 현재 선택/폴더 가져오기
    → null: showHUD("Finder 창을 찾을 수 없습니다...")
    → "": showHUD("열린 Finder 창이 없습니다")
    → 경로 획득:
        → cmux ON: new-workspace --cwd <path>
                   → OK <wsRef> 파싱
                   → select-workspace <wsRef>  ← 포커스 핵심
                   → focusCmux()
                   → showHUD("cmux에서 열기: <path>")
        → cmux OFF (CmuxNotRunningError):
                   → showHUD("cmux 실행 중...")
                   → cmux <path>  (spawn 비동기, 앱 실행 + 생성 원자적)
                   → OK <wsRef> 파싱
                   → select-workspace <wsRef>
                   → focusCmux()
                   → showHUD("cmux에서 열기: <path>")
        → Access denied: showHUD("Settings → Automation mode")
```

### "No-view" 패턴
- UI 없이 바로 실행, `showHUD()`로 피드백

---

## 공통 유틸 (`utils.ts`)

```typescript
getCmuxPath()          // preferences 또는 기본값 /opt/homebrew/bin/cmux
runCmux(args)          // spawnSync 실행 (동기)
listWorkspaces()       // --json list-workspaces 파싱 (async Promise)
selectWorkspace(id)    // select-workspace --workspace <id>
openWorkspace(cwd)     // new-workspace --cwd <cwd> → wsRef 반환
closeWorkspace(id)     // close-workspace --workspace <id>
openPathInCmux(path)   // cmux <path> (spawn 비동기) → wsRef Promise 반환
focusCmux()            // open -a /Applications/cmux.app
getFinderDirectory()   // osascript → 경로 | "" | null
```

---

## 알려진 제한 사항

### cmux OFF 시 속도
- `cmux <path>` 내부에서 앱 실행 후 소켓 대기 (최대 10초)
- Raycast에서 HUD("cmux 실행 중...")는 즉시 표시되지만 최종 HUD까지 3~10초 소요
- 근본 해결책 없음 (cmux 앱 시작 시간이 bottleneck)

### Socket Control 설정
- **필수**: cmux Settings → Socket Control → Automation mode
- 기본값(cmuxOnly)에서는 외부 프로세스 차단

---

## 구현 완료 현황 (2026-03-20)

- [x] Phase 0~4: 전체 구현 및 빌드 성공
- [x] Phase 5: 실기기 테스트 완료
  - cmux ON: workspace 생성 + 포커스 정상
  - cmux OFF: workspace 생성 + 포커스 정상 (단, 느림)
  - 파일 선택 시 부모 디렉토리로 열림 정상
- [ ] Phase 6: (선택) 아이콘 추가 및 Raycast Store 배포
