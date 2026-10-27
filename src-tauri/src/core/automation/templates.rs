use super::{AutomationDraft, Provider, Schedule};
use serde::Serialize;

#[derive(Serialize)]
pub struct AutomationTemplate {
    pub id: String,
    pub title: String,
    pub description: String,
    pub draft: AutomationDraft,
}
#[derive(Serialize)]
pub struct AutomationCatalog {
    pub shell: String,
    pub templates: Vec<AutomationTemplate>,
}

/// GUI and agents receive exactly the same platform-correct starter tasks.
pub fn templates(locale: Option<&str>) -> AutomationCatalog {
    catalog(
        locale.unwrap_or("en"),
        super::super::tool_detection::is_installed("hermes"),
        super::command_shell(),
    )
}

fn catalog(locale: &str, hermes: bool, shell: &str) -> AutomationCatalog {
    let chinese = locale.starts_with("zh");
    let traditional = locale.starts_with("zh-TW") || locale.starts_with("zh-Hant");
    let text = |en: &str, zh: &str, tw: &str| {
        if traditional {
            tw.to_string()
        } else if chinese {
            zh.to_string()
        } else {
            en.to_string()
        }
    };
    let mut templates = Vec::new();
    let mut add = |id: &str,
                   title: String,
                   description: String,
                   provider: Provider,
                   content: String,
                   schedule: Schedule| {
        templates.push(AutomationTemplate {
            id: id.into(),
            title: title.clone(),
            description,
            draft: AutomationDraft {
                name: title,
                provider,
                content,
                workdir: None,
                schedule,
                enabled: true,
            },
        });
    };
    add(
        "workspace-check",
        text("Workspace check", "工作目录检查", "工作目錄檢查"),
        text(
            "Inspect the current directory and files. Run manually.",
            "查看当前目录和文件，按需手动触发。",
            "查看目前目錄和檔案，按需手動觸發。",
        ),
        Provider::System,
        if shell == "powershell" {
            "Get-Location\nGet-ChildItem -Force"
        } else {
            "printf 'Working directory: '; pwd\nprintf '\\nFiles:\\n'; ls -la"
        }
        .into(),
        Schedule::Manual,
    );
    add(
        "disk-check",
        text("Disk space check", "磁盘空间检查", "磁碟空間檢查"),
        text(
            "Check available disk space every hour.",
            "每小时检查可用磁盘空间。",
            "每小時檢查可用磁碟空間。",
        ),
        Provider::System,
        if shell == "powershell" {
            "Get-PSDrive -PSProvider FileSystem | Format-Table Name,Used,Free,Root"
        } else {
            "df -h ."
        }
        .into(),
        Schedule::Interval { minutes: 60 },
    );
    add("git-status", text("Git workspace status", "Git 工作区状态", "Git 工作區狀態"), text("Review changes and recent commits on weekdays. Choose a Git working directory.", "工作日查看改动与最近提交，请指定 Git 工作目录。", "工作日查看變更與最近提交，請指定 Git 工作目錄。"), Provider::System,
        if shell == "powershell" { "if (Test-Path -LiteralPath '.git') {\n  git status --short\n  git log -5 --oneline\n} else {\n  Write-Output 'Choose a Git working directory to inspect repository status.'\n}" } else { "if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then\n  git status --short\n  git log -5 --oneline\nelse\n  printf 'Choose a Git working directory to inspect repository status.\\n'\nfi" }.into(), Schedule::Daily { hour: 17, minute: 0, weekdays: true });
    if hermes {
        add("repository-audit", text("Weekday repository audit", "工作日仓库审计", "工作日儲存庫稽核"), text("Ask Hermes to inspect repository health and suggest follow-up work.", "让 Hermes 检查仓库状态，汇总问题与后续建议。", "讓 Hermes 檢查儲存庫狀態，彙整問題與後續建議。"), Provider::Hermes,
            text("Inspect this repository: dependencies, failing tests, lint/type errors and risky open changes. Summarize evidence and recommend next actions. Report findings without changing files.", "检查当前仓库的依赖更新、失败测试、lint/类型检查状态和有风险的未提交改动。汇总证据与问题，给出下一步建议，只报告结果，不修改文件。", "檢查目前儲存庫的相依更新、失敗測試、lint/型別檢查狀態與有風險的未提交變更。彙整證據與問題，提供下一步建議，只報告結果，不修改檔案。"), Schedule::Daily { hour: 9, minute: 0, weekdays: true });
        add("daily-summary", text("Daily project summary", "每日项目摘要", "每日專案摘要"), text("Summarize recent project activity with Hermes.", "让 Hermes 汇总项目近期活动与待办建议。", "讓 Hermes 彙整專案近期活動與待辦建議。"), Provider::Hermes,
            text("Review recent commits, current changes and project notes in this working directory. Write a short daily summary of progress, risks and suggested next steps. Do not change files.", "阅读工作目录中的最近提交、当前改动和项目记录，生成简短的每日摘要：已完成事项、风险与后续建议。不要修改文件。", "閱讀工作目錄中的最近提交、目前變更與專案記錄，產生簡短的每日摘要：已完成事項、風險與後續建議。不要修改檔案。"), Schedule::Daily { hour: 18, minute: 0, weekdays: false });
    }
    AutomationCatalog {
        shell: shell.into(),
        templates,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn templates_use_the_native_shell_and_hide_uninstalled_hermes() {
        let windows = catalog("zh", false, "powershell");
        assert_eq!(windows.templates.len(), 3);
        assert!(windows.templates[0].draft.content.contains("Get-ChildItem"));
        assert_eq!(windows.templates[0].title, "工作目录检查");
        assert!(windows
            .templates
            .iter()
            .all(|t| t.draft.provider == Provider::System));
        let unix = catalog("en", true, "sh");
        assert_eq!(unix.templates.len(), 5);
        for mut template in unix.templates {
            template.draft.validate().unwrap();
        }
    }
}
