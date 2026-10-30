use app_lib::core::automation::{self, AutomationDraft};
use clap::{Args, Subcommand, ValueEnum};
use std::path::PathBuf;

#[derive(Args, Debug)]
pub(super) struct AutomationArgs {
    #[command(subcommand)]
    command: AutomationCommand,
}

#[derive(Debug, Clone, ValueEnum)]
enum Source {
    All,
    System,
    Hermes,
}
#[derive(Debug, Clone, ValueEnum)]
enum Origin {
    All,
    AgentHub,
    External,
    Unknown,
}

#[derive(Subcommand, Debug)]
enum AutomationCommand {
    /// 导入独立任务包或目录；默认未安装，--install 注册为暂停任务。
    Import {
        #[arg(long)]
        path: PathBuf,
        #[arg(long)]
        workdir: Option<String>,
        #[arg(long)]
        preview: bool,
        #[arg(long, conflicts_with = "preview")]
        install: bool,
    },
    /// 导出可移植 JSON 包，不包含项目路径、凭据或运行历史。
    Export {
        id: String,
        #[arg(long)]
        file: PathBuf,
    },
    /// 自动检查依赖并安装已导入／已卸载任务的调度。
    Install { id: String },
    /// 撤销调度并卸载私有环境，保留任务内容和运行记录。
    Uninstall { id: String },
    /// 将旧系统任务迁移为独立任务包，保留任务 ID、日程和原脚本。
    Migrate { id: String },
    /// 汇总本机任务；默认隐藏操作系统内置任务。
    List {
        #[arg(long, value_enum, default_value = "all")]
        source: Source,
        #[arg(long, value_enum, default_value = "all")]
        origin: Origin,
        /// 包含操作系统内置任务。
        #[arg(long)]
        show_system: bool,
        /// 按名称、原始标识或命令搜索。
        #[arg(long)]
        query: Option<String>,
    },
    /// 查看完整定义、创建者、日程和执行状态。
    Show { id: String },
    /// 查看本机保存的执行记录；不触发任务或 Git 备份。
    Runs { id: String },
    /// 读取最近输出或 --run 指定的执行日志。
    Logs {
        id: String,
        #[arg(long)]
        run: Option<String>,
    },
    /// 从 JSON 定义创建原生系统任务或 Hermes 任务。
    Create {
        #[arg(
            long,
            required_unless_present = "template",
            conflicts_with = "template"
        )]
        file: Option<PathBuf>,
        /// 使用内置模板 ID；创建前可通过 templates 预览。
        #[arg(long, required_unless_present = "file", conflicts_with = "file")]
        template: Option<String>,
        #[arg(long, default_value = "zh")]
        locale: String,
    },
    /// 查看本机可用的内置模板，供 GUI 和 Agent 快速创建。
    Templates {
        #[arg(long, default_value = "zh")]
        locale: String,
    },
    /// 查看 Git 备份中的任务定义；不触发调度。
    Backups,
    /// 预览备份；--apply 显式创建未安装的副本，不覆盖本机任务。
    Restore {
        id: String,
        #[arg(long)]
        apply: bool,
    },
    /// 更新任务；支持当前用户的常见 launchd 定时任务和 Hermes 任务。
    Edit {
        id: String,
        #[arg(long)]
        file: PathBuf,
        /// 乐观并发版本；省略时采用本次读取的当前版本。
        #[arg(long)]
        revision: Option<u64>,
    },
    /// 手动触发一次；不更改日程配置，也不等待执行结束。
    Run { id: String },
    /// 暂停后续计划；AgentHub 系统任务仍可手动运行，其他来源需先恢复。
    Pause { id: String },
    /// 恢复计划运行。
    Resume { id: String },
    /// 删除受支持的任务和创建记录。
    Remove {
        id: String,
        /// 同时清理 AgentHub 自动工作目录和本地记录，保留自定义及共享目录。
        #[arg(long)]
        delete_local_data: bool,
    },
}

fn task(id: &str) -> anyhow::Result<automation::AutomationTask> {
    automation::overview(None)
        .tasks
        .into_iter()
        .find(|t| t.id == id)
        .ok_or_else(|| {
            anyhow::anyhow!("Task not found; run automations list to obtain an exact ID")
        })
}

fn draft(file: &std::path::Path) -> anyhow::Result<AutomationDraft> {
    let bytes = std::fs::read(file)?;
    anyhow::ensure!(
        bytes.len() <= 128 * 1024,
        "Automation definition exceeds 128 KiB"
    );
    Ok(serde_json::from_slice(&bytes)?)
}

pub(super) fn run(args: &AutomationArgs, json: bool) -> anyhow::Result<()> {
    if matches!(
        args.command,
        AutomationCommand::List { .. } | AutomationCommand::Show { .. }
    ) {
        automation::sync_workspace_scripts().map_err(anyhow::Error::msg)?;
    }
    match &args.command {
        AutomationCommand::Import {
            path,
            workdir,
            preview,
            install,
        } => {
            if *preview {
                println!(
                    "{}",
                    serde_json::to_string_pretty(
                        &automation::package::preview_package(path).map_err(anyhow::Error::msg)?
                    )?
                );
            } else {
                let id = automation::package::import_package(path, workdir.clone())
                    .map_err(anyhow::Error::msg)?;
                if *install {
                    automation::package::install(&id).map_err(anyhow::Error::msg)?;
                }
                result(
                    json,
                    &id,
                    if *install { "installed" } else { "uninstalled" },
                );
            }
        }
        AutomationCommand::Export { id, file } => {
            automation::package::export_package(id, file).map_err(anyhow::Error::msg)?;
            result(json, id, "exported");
        }
        AutomationCommand::Install { id } => {
            automation::package::install(id).map_err(anyhow::Error::msg)?;
            result(json, id, "installed");
        }
        AutomationCommand::Uninstall { id } => {
            automation::package::uninstall(id).map_err(anyhow::Error::msg)?;
            result(json, id, "uninstalled");
        }
        AutomationCommand::Migrate { id } => {
            let new_id = automation::package::migrate(id).map_err(anyhow::Error::msg)?;
            result(json, &new_id, "uninstalled");
        }
        AutomationCommand::List {
            source,
            origin,
            show_system,
            query,
        } => {
            let mut report = automation::overview(None);
            let query = query.as_deref().unwrap_or("").to_lowercase();
            report.tasks.retain(|task| {
                (*show_system || !task.is_builtin)
                    && match source {
                        Source::All => true,
                        Source::System => task.source != "hermes",
                        Source::Hermes => task.source == "hermes",
                    }
                    && match origin {
                        Origin::All => true,
                        Origin::AgentHub => task.origin == automation::TaskOrigin::AgentHub,
                        Origin::External => task.origin == automation::TaskOrigin::External,
                        Origin::Unknown => task.origin == automation::TaskOrigin::Unknown,
                    }
                    && [
                        &task.name,
                        task.identifier.as_deref().unwrap_or(""),
                        task.command.as_deref().unwrap_or(""),
                        task.prompt.as_deref().unwrap_or(""),
                    ]
                    .iter()
                    .any(|s| s.to_lowercase().contains(&query))
            });
            if json {
                println!("{}", serde_json::to_string_pretty(&report)?);
            } else {
                println!("ID\tNAME\tORIGIN\tSOURCE\tSTATUS\tSCHEDULE");
                for task in &report.tasks {
                    println!(
                        "{}\t{}\t{:?}\t{}\t{}\t{}",
                        task.id,
                        task.name.replace(['\n', '\t'], " "),
                        task.origin,
                        task.source,
                        task.status,
                        task.schedule
                    );
                }
                for issue in &report.issues {
                    eprintln!("{}: {}", issue.source, issue.message);
                }
            }
        }
        AutomationCommand::Templates { locale } => println!(
            "{}",
            serde_json::to_string_pretty(&automation::templates(Some(locale)))?
        ),
        AutomationCommand::Backups => println!(
            "{}",
            serde_json::to_string_pretty(&automation::backup::list().map_err(anyhow::Error::msg)?)?
        ),
        AutomationCommand::Restore { id, apply } => println!(
            "{}",
            serde_json::to_string_pretty(
                &automation::backup::restore(id, *apply).map_err(anyhow::Error::msg)?
            )?
        ),
        AutomationCommand::Runs { id } => println!(
            "{}",
            serde_json::to_string_pretty(&automation::history(id).map_err(anyhow::Error::msg)?)?
        ),
        AutomationCommand::Logs { id, run } => {
            let output = match run {
                Some(run) => automation::run_output(id, run),
                None => automation::output(id),
            }
            .map_err(anyhow::Error::msg)?;
            if json {
                println!("{}", serde_json::to_string_pretty(&output)?);
            } else {
                if output.truncated {
                    eprintln!("Showing the last 256 KiB");
                }
                print!("{}", output.content);
            }
        }
        AutomationCommand::Show { id } => println!("{}", serde_json::to_string_pretty(&task(id)?)?),
        AutomationCommand::Create {
            file,
            template,
            locale,
        } => {
            let draft = if let Some(file) = file {
                draft(file)?
            } else {
                let id = template
                    .as_deref()
                    .ok_or_else(|| anyhow::anyhow!("Choose --file or --template"))?;
                automation::template(id, Some(locale))
                    .ok_or_else(|| {
                        anyhow::anyhow!("Template not found or its provider is not installed")
                    })?
                    .draft
            };
            let id = automation::save(None, None, draft).map_err(anyhow::Error::msg)?;
            result(json, &id, "saved");
        }
        AutomationCommand::Edit { id, file, revision } => {
            let revision = revision.or(task(id)?.revision);
            automation::save(Some(id), revision, draft(file)?).map_err(anyhow::Error::msg)?;
            result(json, id, "saved");
        }
        AutomationCommand::Run { id } => {
            automation::run(id).map_err(anyhow::Error::msg)?;
            result(json, id, "requested");
        }
        AutomationCommand::Pause { id } | AutomationCommand::Resume { id } => {
            let task = task(id)?;
            let mut draft = task
                .definition
                .ok_or_else(|| anyhow::anyhow!("This task is read-only"))?;
            draft.enabled = matches!(args.command, AutomationCommand::Resume { .. });
            automation::save(Some(id), task.revision, draft).map_err(anyhow::Error::msg)?;
            result(json, id, "saved");
        }
        AutomationCommand::Remove {
            id,
            delete_local_data,
        } => {
            automation::remove_with_local_data(id, *delete_local_data)
                .map_err(anyhow::Error::msg)?;
            result(json, id, "removed");
        }
    }
    Ok(())
}

fn result(json: bool, id: &str, state: &str) {
    if json {
        println!("{}", serde_json::json!({"id":id,"state":state}));
    } else {
        println!("{id}: {state}");
    }
}

#[cfg(test)]
mod tests {
    use clap::Parser;
    #[derive(Parser)]
    struct Cli {
        #[command(flatten)]
        args: super::AutomationArgs,
    }
    #[test]
    fn parses_management_and_origin_filters_without_opening_a_database() {
        assert!(Cli::try_parse_from([
            "cli",
            "list",
            "--origin",
            "agent-hub",
            "--source",
            "system",
            "--show-system"
        ])
        .is_ok());
        assert!(Cli::try_parse_from(["cli", "create", "--file", "task.json"]).is_ok());
        assert!(Cli::try_parse_from(["cli", "run", "exact-id"]).is_ok());
        assert!(Cli::try_parse_from(["cli", "remove", "exact-id", "--delete-local-data"]).is_ok());
        assert!(Cli::try_parse_from(["cli", "create", "--template", "workspace-check"]).is_ok());
        assert!(Cli::try_parse_from([
            "cli",
            "create",
            "--template",
            "workspace-check",
            "--file",
            "task.json"
        ])
        .is_err());
        assert!(Cli::try_parse_from(["cli", "templates", "--locale", "en"]).is_ok());
        assert!(Cli::try_parse_from(["cli", "restore", "id", "--apply"]).is_ok());
        assert!(Cli::try_parse_from([
            "cli",
            "edit",
            "exact-id",
            "--file",
            "task.json",
            "--revision",
            "2"
        ])
        .is_ok());
    }
}
