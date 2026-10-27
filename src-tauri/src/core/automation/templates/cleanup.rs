//! Cleanup starters deliberately target named children of the selected workspace.
use super::{localized, AutomationTemplate};
use crate::core::automation::{AutomationDraft, Provider, Schedule};

pub(super) fn templates(locale: &str, shell: &str) -> Vec<AutomationTemplate> {
    [
        (
            "temp-cleanup", "tmp", 7, 0,
            localized(locale, "Scheduled temporary file cleanup", "临时文件定时清理", "暫存檔案定時清理"),
            localized(locale, "Daily at 03:00: remove files older than 7 days from tmp in the selected working directory. Keep directories and skip symbolic links. Choose your working directory before creating.", "每天 03:00 清理工作目录 tmp 子目录中超过 7 天的文件，保留目录并跳过符号链接。创建前请选择工作目录。", "每天 03:00 清理工作目錄 tmp 子目錄中超過 7 天的檔案，保留目錄並略過符號連結。建立前請選擇工作目錄。"),
        ),
        (
            "log-cleanup", "logs", 30, 30,
            localized(locale, "Scheduled old log cleanup", "过期日志定时清理", "過期日誌定時清理"),
            localized(locale, "Daily at 03:30: remove files older than 30 days from logs in the selected working directory. Keep directories and skip symbolic links. Choose your working directory before creating.", "每天 03:30 清理工作目录 logs 子目录中超过 30 天的文件，保留目录并跳过符号链接。创建前请选择工作目录。", "每天 03:30 清理工作目錄 logs 子目錄中超過 30 天的檔案，保留目錄並略過符號連結。建立前請選擇工作目錄。"),
        ),
    ].into_iter().map(|(id, directory, days, minute, title, description)| AutomationTemplate {
        id: id.into(),
        title: title.clone(),
        description,
        draft: AutomationDraft {
            name: title, provider: Provider::System,
            content: command(shell, directory, days),
            workdir: None,
            schedule: Schedule::Daily {hour: 3, minute, weekdays: false},
            enabled: true,
        },
    }).collect()
}

fn command(shell: &str, directory: &str, days: u32) -> String {
    if shell == "powershell" {
        format!(
            r#"$RetentionDays = {days}
$Target = Join-Path (Get-Location).Path '{directory}'
if (!(Test-Path -LiteralPath $Target)) {{
  Write-Output "No cleanup directory: $Target"
  exit 0
}}
$Root = Get-Item -LiteralPath $Target -Force -ErrorAction Stop
if (!$Root.PSIsContainer -or ($Root.Attributes -band [IO.FileAttributes]::ReparsePoint)) {{
  throw 'Cleanup target must be a directory, not a symbolic link or junction.'
}}
$Cutoff = (Get-Date).AddDays(-$RetentionDays)
$Pending = New-Object 'System.Collections.Generic.Stack[string]'
$Pending.Push($Root.FullName)
$Removed = 0
while ($Pending.Count -gt 0) {{
  foreach ($Entry in (Get-ChildItem -LiteralPath ($Pending.Pop()) -Force -ErrorAction Stop)) {{
    if ($Entry.Attributes -band [IO.FileAttributes]::ReparsePoint) {{ continue }}
    if ($Entry.PSIsContainer) {{ $Pending.Push($Entry.FullName) }}
    elseif ($Entry.LastWriteTime -lt $Cutoff) {{
      Remove-Item -LiteralPath $Entry.FullName -Force -ErrorAction Stop
      $Removed++
    }}
  }}
}}
Write-Output "Removed $Removed old files from $Target"
"#
        )
    } else {
        format!(
            r#"set -eu
RETENTION_DAYS={days}
TARGET='./{directory}'
if [ -L "$TARGET" ]; then
  printf 'Cleanup target must not be a symbolic link.\n' >&2
  exit 1
fi
if [ ! -e "$TARGET" ]; then
  printf 'No cleanup directory: %s\n' "$TARGET"
  exit 0
fi
if [ ! -d "$TARGET" ]; then
  printf 'Cleanup target must be a directory.\n' >&2
  exit 1
fi
find -P "$TARGET" -xdev -type f -mmin +"$((RETENTION_DAYS * 24 * 60))" -print -exec rm -f -- {{}} +
printf 'Cleanup completed: %s (files older than %s days)\n' "$TARGET" "$RETENTION_DAYS"
"#
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        fs,
        path::Path,
        time::{Duration, SystemTime},
    };

    fn old_file(path: &Path) {
        aged_file_hours(path, 90 * 24);
    }
    fn aged_file_hours(path: &Path, hours: u64) {
        fs::write(path, "old temporary content").unwrap();
        fs::File::options()
            .write(true)
            .open(path)
            .unwrap()
            .set_times(
                fs::FileTimes::new()
                    .set_modified(SystemTime::now() - Duration::from_secs(hours * 3600)),
            )
            .unwrap();
    }
    fn run(workspace: &Path, directory: &str, days: u32) -> std::process::Output {
        let script = command(
            if cfg!(windows) { "powershell" } else { "sh" },
            directory,
            days,
        );
        if cfg!(windows) {
            let file = workspace.join("cleanup.ps1");
            fs::write(&file, format!("\u{feff}{script}")).unwrap();
            std::process::Command::new("powershell.exe")
                .args([
                    "-NoProfile",
                    "-NonInteractive",
                    "-ExecutionPolicy",
                    "Bypass",
                    "-File",
                ])
                .arg(file)
                .current_dir(workspace)
                .output()
                .unwrap()
        } else {
            std::process::Command::new("/bin/sh")
                .args(["-c", &script])
                .current_dir(workspace)
                .output()
                .unwrap()
        }
    }
    #[test]
    fn removes_only_expired_files_in_the_named_directory_and_is_repeatable() {
        for (directory, days) in [("tmp", 7), ("logs", 30)] {
            let root = tempfile::tempdir().unwrap();
            let target = root.path().join(directory);
            fs::create_dir_all(target.join("nested space/empty")).unwrap();
            old_file(&target.join("old ' quoted.tmp"));
            old_file(&target.join("nested space/old.log"));
            fs::write(target.join("recent.log"), "keep recent content").unwrap();
            aged_file_hours(&target.join("two-weeks-old.log"), 15 * 24);
            aged_file_hours(&target.join("just-expired.log"), u64::from(days) * 24 + 1);
            aged_file_hours(
                &target.join("within-retention.log"),
                u64::from(days) * 24 - 1,
            );
            old_file(&root.path().join("outside.log"));
            let output = run(root.path(), directory, days);
            assert!(
                output.status.success(),
                "{}",
                String::from_utf8_lossy(&output.stderr)
            );
            assert!(!target.join("old ' quoted.tmp").exists());
            assert!(!target.join("nested space/old.log").exists());
            assert!(target.join("recent.log").is_file());
            assert!(!target.join("just-expired.log").exists());
            assert!(target.join("within-retention.log").exists());
            assert_eq!(
                target.join("two-weeks-old.log").exists(),
                directory == "logs"
            );
            assert!(target.join("nested space/empty").is_dir());
            assert!(root.path().join("outside.log").is_file());
            assert!(run(root.path(), directory, days).status.success());
        }
    }
    #[test]
    fn missing_directories_are_noops_and_file_targets_are_rejected() {
        let root = tempfile::tempdir().unwrap();
        assert!(run(root.path(), "tmp", 7).status.success());
        assert!(!root.path().join("tmp").exists());
        old_file(&root.path().join("tmp"));
        assert!(!run(root.path(), "tmp", 7).status.success());
        assert!(root.path().join("tmp").is_file());
    }
    #[cfg(unix)]
    #[test]
    fn refuses_root_symlinks_and_never_traverses_nested_links() {
        let root = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        old_file(&outside.path().join("preserved.log"));
        std::os::unix::fs::symlink(outside.path(), root.path().join("tmp")).unwrap();
        assert!(!run(root.path(), "tmp", 7).status.success());
        fs::remove_file(root.path().join("tmp")).unwrap();
        fs::create_dir(root.path().join("tmp")).unwrap();
        std::os::unix::fs::symlink(outside.path(), root.path().join("tmp/linked-dir")).unwrap();
        std::os::unix::fs::symlink(
            outside.path().join("preserved.log"),
            root.path().join("tmp/linked-file"),
        )
        .unwrap();
        assert!(run(root.path(), "tmp", 7).status.success());
        assert!(outside.path().join("preserved.log").is_file());
        assert!(root.path().join("tmp/linked-file").is_symlink());
    }
}
