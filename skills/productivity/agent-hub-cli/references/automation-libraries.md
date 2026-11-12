# Shared automation libraries

Use `automations libraries --help` from the resolved CLI. Missing commands require the matching app/CLI update; never place arbitrary shared folders into the Git backup worktree, whose automation tree is regenerated.

Each library lives at `~/.agent-hub/automations/_shared/<name>/`, with `library.json` declaring schema_version 1, a lowercase name, a SemVer version and relative files. Only the current copy is kept. Include `__init__.py` for Python packages; declare all relative-import source files. Do not declare credentials, `.local`, environments, output or logs. The CLI checks bounded regular files and rejects links/private paths.

```bash
"$SM" --json automations libraries import --path ./code-host --preview
"$SM" --json automations libraries import --path ./code-host
"$SM" --json automations libraries list
"$SM" --json automations libraries resolve code-host
"$SM" --json automations libraries import --path ./code-host --revision <current-revision>
"$SM" --json automations libraries backups
"$SM" --json automations libraries restore code-host
"$SM" --json automations libraries restore code-host --apply
```

Updates and deletion use the revision read from the current library. An update replaces declared content, preserving private state and refusing unknown local files. Do not bypass a running-task/reference guard by editing library directories. Deletion additionally requires `--yes` and is refused while installed tasks or task backups reference the library.

Add `{"kind":"library","name":"code-host"}` to the task draft's existing `package_options.dependencies`, then save via revision-protected `automations edit`. Preserve all other task content, schedule, activation and business state. Missing libraries block runtime preparation.

Python task adapters resolve `automations libraries runtime`, load the returned module with runpy, and call its `load("code-host", resolved_cli)` function. This obtains a validated in-memory source snapshot without copying the library into each task. Keep task-specific filtering, authorization, callbacks, quotas and namespaces outside the library. Continue using existing Agent execution and TaskState services.

Library definitions join the same automatic Git backup as tasks. Confirm via `libraries backups` and the real Git commit, not merely a successful import. Git pull does not activate tasks or overwrite local libraries. Explicit task backup restoration restores missing declared libraries first; existing differing libraries require explicit revision-protected restoration. Private runtime data and pending execution histories stay on the original device.
