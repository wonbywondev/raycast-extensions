# CHECKLIST: Raycast cmux Extension

## Phase 0: 환경 준비
- [x] Raycast 설치 확인 (`/Applications/Raycast.app`)
- [x] Node.js / npm 설치 확인 (v25.8.1 / 11.11.0)
- [x] `/opt/homebrew/bin/cmux` 존재 확인 (미실행 시 Socket not found 정상 출력)
- [x] Raycast developer mode 활성화 필요 (사용자가 확인)

## Phase 1: 프로젝트 초기화
- [x] `package.json` 수동 작성 (commands 2개, preferences 포함)
- [x] `tsconfig.json` 작성 (jsx: react-jsx, @types/react 19.x)
- [x] `npm install` 완료

## Phase 2: `utils.ts` 구현
- [x] `getCmuxPath()`: preferences 또는 기본값 `/opt/homebrew/bin/cmux`
- [x] `runCmux(args)`: `spawnSync` 실행 + stdout/stderr 반환
- [x] `listWorkspaces()`: `--json list-workspaces` 파싱 (async, stdout+stderr 모두 체크)
- [x] cmux 미실행 에러 감지 (`CmuxNotRunningError`)
- [x] cmux 접근 거부 에러 감지 (`CmuxAccessDeniedError`)
- [x] `getFinderDirectory()`: `spawnSync("osascript")` 로 폴더 경로 추출
  - [x] 폴더 선택 시 → 그 폴더
  - [x] 파일 선택 시 → 부모 폴더
  - [x] 선택 없음 시 → Finder 현재 창 폴더
  - [x] Finder 창 없음 시 → `""` 반환
  - [x] osascript 실패 시 → `null` 반환
- [x] `focusCmux()`: `spawnSync("open", ["-a", ...])`
- [x] `selectWorkspace()`, `openWorkspace()` (wsRef 반환), `closeWorkspace()` 구현
- [x] `openPathInCmux()`: `spawn` 비동기, wsRef Promise 반환

## Phase 3: `list-workspaces.tsx` 구현
- [x] `useCachedPromise(listWorkspaces)` 로딩
- [x] `List` + `List.Item` 렌더링
  - [x] title: workspace 제목
  - [x] subtitle: `current_directory`
  - [x] accessories: selected(●), pinned(📌), 포트 번호
- [x] Actions:
  - [x] Enter: `select-workspace` + `focusCmux()`
  - [x] ⌘O: 해당 디렉토리로 새 workspace 열기
  - [x] ⌘C: 경로 클립보드 복사
  - [x] ⌘⌫: `close-workspace`
- [x] 에러 상태: cmux 미실행 → "cmux 실행" 액션
- [x] 에러 상태: Access denied → "Automation mode" 안내

## Phase 4: `open-in-cmux.tsx` 구현
- [x] no-view 패턴 (mode: "no-view")
- [x] `getFinderDirectory()` 호출 (null / "" / 경로 구분)
- [x] cmux ON: `openWorkspace` → wsRef → `selectWorkspace` → `focusCmux()` → HUD
- [x] cmux OFF: HUD "cmux 실행 중..." → `openPathInCmux` (비동기) → wsRef → `selectWorkspace` → HUD
- [x] Access denied → HUD with 설정 안내

## Phase 5: 실기기 테스트 ✅
- [x] cmux ON: workspace 생성 + 포커스 정상 동작
- [x] cmux OFF: workspace 생성 + 포커스 정상 동작 (3~10초 소요)
- [x] Finder 폴더 선택 → 해당 폴더로 열림
- [x] Finder 파일 선택 → 부모 폴더로 열림
- [x] 소켓 접근 거부 → Automation mode 안내 메시지
- [x] List Workspaces: cmux ON → workspace 목록 표시 정상
- [x] List Workspaces: cmux OFF → 캐시된 목록 표시, "오프라인" 태그
- [x] List Workspaces: cmux OFF → Enter → cmux 실행 + workspace 전환 정상
- [x] useCachedPromise 에러 바 억제 (onError: () => {}) — 확인됨
- [x] List Workspaces: 2초 폴링으로 자동 갱신 (existsSync 가드로 OFF 시 ~0ms 비용)
- [x] List Workspaces: 오프라인 태그/상태 제거 — 캐시 데이터 있으면 항상 목록 표시
- [x] List Workspaces: cmux OFF 상태에서 Enter → 자동 실행 + workspace 전환
- [x] 초록 점(selected 표시) 제거
- [x] open-in-cmux cmux OFF 속도 개선 (100ms 폴링, ~1초)
- [x] open-in-cmux cmux OFF 추가 속도 개선: `existsSync(socketPath)` 가드로 CLI 2.5초 타임아웃 제거 (~50ms 폴링)

## Phase 6: 마무리
- [x] README.md 작성 (명령어, 요구사항, 단축키, 설정)
- [x] CHANGELOG.md 작성
- [x] 스크린샷 3장 (media/)
- [x] author wonbywondev, keywords 추가
- [x] 아이콘 (cmux 앱 아이콘 사용)
- [ ] 스토어 제출 (`npm run publish`) — 다음 이슈 해결 후
  - [ ] ESLint 설정 파일 (.eslintrc.js) 누락
  - [ ] Prettier 포맷 오류 (3개 소스 파일)
  - [ ] Title Case 경고: "Cmux", "List Cmux Workspaces", "Open in Cmux"

## 핵심 참고 정보
| 항목 | 값 |
|------|-----|
| cmux CLI | `/opt/homebrew/bin/cmux` |
| 소켓 경로 | `~/Library/Application Support/cmux/cmux.sock` |
| 앱 경로 | `/Applications/cmux.app` |
| list-workspaces | `cmux --json list-workspaces` |
| workspace 전환 | `cmux select-workspace --workspace <id>` |
| 새 workspace (ON) | `cmux new-workspace --cwd <path>` → `OK <wsRef>` |
| 새 workspace (OFF) | `cmux <path>` (앱 실행 포함, 비동기) |
| 미실행 감지 | stdout/stderr에 "Socket not found" 포함 여부 |
| 접근 거부 감지 | stdout/stderr에 "Access denied" 포함 여부 |
| Socket Control | cmux Settings → Automation mode 필수 |
