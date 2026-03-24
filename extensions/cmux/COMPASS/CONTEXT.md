# CONTEXT: Raycast Extension for cmux

## 기능 요약
1. **List Workspaces**: 현재 실행 중인 cmux의 workspace 목록을 Raycast에서 나열 → 선택 시 전환
2. **Open in cmux**: 현재 Finder에서 선택된 디렉토리를 cmux에서 열기 (새 workspace)

## 환경

### cmux 설치 정보
- **앱**: `/Applications/cmux.app`
- **Homebrew CLI**: `/opt/homebrew/bin/cmux` (주의: `which cmux` 하면 Miniconda cmux가 먼저 나올 수 있음)
- **소켓 경로 (앱 실행 중)**: `~/Library/Application Support/cmux/cmux.sock`

### cmux CLI 주요 명령어
```bash
# workspace 목록 (JSON)
/opt/homebrew/bin/cmux --json list-workspaces

# workspace 전환
/opt/homebrew/bin/cmux select-workspace --workspace <id>

# 디렉토리로 새 workspace 열기 (cmux 실행 중일 때)
# → "OK <wsRef>" 형태로 응답 (wsRef로 즉시 select-workspace 호출 필요)
/opt/homebrew/bin/cmux new-workspace --cwd /path/to/dir

# 경로를 직접 전달 (cmux 미실행 시에도 앱 실행 + workspace 생성 원자적 처리)
/opt/homebrew/bin/cmux /path/to/dir
```

### `list-workspaces` JSON 응답 구조
```json
{
  "ok": true,
  "result": {
    "window_id": "UUID",
    "workspaces": [
      {
        "id": "UUID",
        "ref": "workspace:0",
        "index": 0,
        "title": "my-project",
        "selected": true,
        "pinned": false,
        "current_directory": "/Users/won/dev/my-project",
        "listening_ports": [3000],
        "custom_color": null
      }
    ]
  }
}
```

### `new-workspace` 응답
- 성공: `OK workspace:3` 또는 `OK <uuid>` (plain text, JSON 아님)
- 이 wsRef를 바로 `select-workspace --workspace <wsRef>`에 사용

### cmux 소켓 접근 제어
- 기본값 `cmuxOnly`: cmux 내부에서 실행된 프로세스만 허용 → Raycast 불가
- **필수 설정**: cmux Settings → Socket Control → **Automation mode**
  - 동일 macOS 사용자의 외부 프로세스 허용 (ancestry 체크 없음)
- 에러 메시지: `ERROR: Access denied — only processes started inside cmux can connect`

### cmux 미실행 시
- 소켓 없음 → CLI 호출 시 stdout/stderr에 `Error: Socket not found` 반환
- `cmux <path>` 명령은 미실행 시에도 앱 실행 + workspace 생성 자동 처리
  - 내부적으로 앱 실행 후 소켓 대기 (최대 10초), 완료 후 `OK <wsRef>` 출력
  - **단점**: 앱 시작 시간만큼 느림 (3~10초)

---

## Finder 선택 디렉토리 가져오기 (osascript)

- `runAppleScript()` 는 `@raycast/api`에 없음 → `spawnSync("osascript", ["-e", script])` 사용
- macOS POSIX path는 디렉토리에 trailing slash 포함 → 사용 전 제거 필요

```applescript
tell application "Finder"
  if (count of selection) > 0 then
    set sel to first item of selection
    if class of sel is folder then
      return POSIX path of (sel as alias)
    else
      return POSIX path of ((container of sel) as alias)
    end if
  else if (count of windows) > 0 then
    return POSIX path of ((target of front window) as alias)
  else
    return ""
  end if
end tell
```

- 폴더 선택 시 → 그 폴더 경로
- 파일 선택 시 → 파일의 부모 폴더 경로
- 선택 없음 시 → Finder 현재 창의 폴더 경로
- Finder 창 없음 시 → `""` 반환
- osascript 실패(권한 없음 등) → `null` 반환

---

## Raycast Extension 기술 스택

- **언어**: TypeScript
- **프레임워크**: `@raycast/api` v1.93+, `@types/react` 19.x (18.x 사용 시 JSX 타입 에러)
- **유틸**: `@raycast/utils` (`useCachedPromise`)
- **CLI 실행**: `child_process.spawnSync` (동기), `child_process.spawn` (비동기, cmux OFF 케이스)
- **AppleScript 실행**: `spawnSync("osascript", ["-e", script])`

---

## 결정 사항

| 날짜 | 항목 | 결정 | 이유 |
|------|------|------|------|
| 2026-03-20 | CLI 실행 방식 | `spawnSync` (execSync 대신) | 경로에 공백 포함 시 quoting 불필요, stdout/stderr 분리 명확 |
| 2026-03-20 | cmux OFF 처리 | `open -a` + 100ms 폴링 | `open -a` 즉시 반환, 소켓 준비까지 실측 ~0.85초; `cmux <path>` 방식보다 빠름 |
| 2026-03-20 | `open -a cmux /path` 방식 | 불채택 | 실행 중인 cmux에서 `application(_:open:urls:)` 미호출 — workspace 미생성 확인 |
| 2026-03-20 | workspace 포커스 | `new-workspace` 후 즉시 `select-workspace` | `new-workspace`만으로는 포커스 전환 안 됨 |
| 2026-03-20 | Socket Control | Automation mode 필수 | 기본 cmuxOnly 모드는 외부 프로세스 차단 |
| 2026-03-20 | cmux OFF 속도 최적화 | `existsSync(socketPath)` 가드 추가 | CLI는 소켓 없을 때 2.5초 연결 타임아웃 대기. 소켓 파일 존재 확인으로 ~0ms 스킵 가능. 폴링 주기 50ms 유지 |
| 2026-03-24 | List 자동 갱신 | 2초 interval 폴링 | useCachedPromise에 revalidateOnFocus/interval 옵션 없음. useEffect + setInterval(revalidate, 2000)으로 해결. cmux OFF 시 existsSync 가드로 폴링 비용 ~0ms |
| 2026-03-24 | 오프라인 태그 제거 | 캐시 데이터 항상 표시 | 사용자 요청. 오프라인/온라인 구분 UI 불필요. 캐시 있으면 cmux 상태 무관하게 목록 표시 |
| 2026-03-24 | 스토어 제출 차단 이슈 | 미해결 | ESLint 설정 파일 누락 + Prettier 포맷 오류 + Title Case 경고. 해결 후 npm run publish 재시도 필요 |

---

## 참고 자료
- 로컬 Raycast 문서: `reference/Create Your First Extension _ Raycast API.html`
- cmux CLI 소스: `/Users/won/dev/100_watchlist/cmux/CLI/cmux.swift`
- cmux 소켓 명령 핸들러: `/Users/won/dev/100_watchlist/cmux/Sources/TerminalController.swift`
- cmux 소켓 접근 제어: `/Users/won/dev/100_watchlist/cmux/Sources/SocketControlSettings.swift`
