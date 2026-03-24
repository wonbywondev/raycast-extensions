# cmux Changelog

## [Initial Version] - {PR_MERGE_DATE}

### Added

- **List cmux Workspaces** command: browse and switch between cmux workspaces
  - Workspace list cached locally and auto-refreshes every 2 seconds
  - Launches cmux automatically when switching to a workspace while cmux is off
  - Actions: switch (Enter), open as new workspace (⌘O), copy path (⌘C), close (⌘⌫)
- **Open in cmux** command: open current Finder selection as a new cmux workspace
  - Supports folder selection, file selection (opens parent folder), and active Finder window
  - Launches cmux automatically if not running
