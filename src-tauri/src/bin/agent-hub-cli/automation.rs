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
    /// 只读审计任务公共运行逻辑；--path 检查仓库，省略则检查所有本机来源。
    Audit {
        #[arg(long)]
        path: Option<PathBuf>,
    },
    /// 复制完整任务为独立且默认暂停的副本，可继续编辑全部内容。
    Copy {
        id: String,
        /// 副本名称；省略时在原名称后添加 (copy)。
        #[arg(long)]
        name: Option<String>,
        /// 核对原任务修订，防止复制陈旧版本。
        #[arg(long)]
        revision: Option<u64>,
    },
    /// 导入独立任务包或目录，准备运行环境并默认暂停。
    Import {
        #[arg(long)]
        path: PathBuf,
        #[arg(long)]
        workdir: Option<String>,
        #[arg(long)]
        preview: bool,
    },
    /// 导出可移植 JSON 包，不包含项目路径、凭据或运行历史。
    Export {
        id: String,
        #[arg(long)]
        file: PathBuf,
    },
    /// 迁移旧任务或规范任务目录；保留任务 ID、日程和原脚本。
    Migrate { id: String },
    /// 默认列出 AgentHub 创建的任务；使用 --origin all 查看所有来源。
    List {
        #[arg(long, value_enum, default_value = "all")]
        source: Source,
        #[arg(long, value_enum, default_value = "agent-hub")]
        origin: Origin,
        /// 包含操作系统内置任务。
        #[arg(long)]
        show_system: bool,
        /// 按名称、原始标识或命令搜索。
        #[arg(long)]
        query: Option<String>,
    },
    /// 查看本地任务实例的完整定义、创建者、日程和执行状态。
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
        /// 从内置模板创建独立本地任务；原模板保持只读，可通过 templates 查看。
        #[arg(long, required_unless_present = "file", conflicts_with = "file")]
        template: Option<String>,
        #[arg(long, default_value = "zh")]
        locale: String,
    },
    /// 只读查看市场内置模板；通过 create --template 创建本地任务。
    Templates {
        #[arg(long, default_value = "zh")]
        locale: String,
    },
    /// 查看 Git 备份中的任务定义；不触发调度。
    Backups,
    /// 预览备份；--apply 显式创建默认暂停的副本，不覆盖本机任务。
    Restore {
        id: String,
        #[arg(long)]
        apply: bool,
    },
    /// 编辑本地任务实例的定义、脚本和日程；不能修改市场模板。
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
    /// 删除本地任务及其调度、创建记录；不删除市场模板。
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
        AutomationCommand::Audit { path } => {
            let report = match path {
                Some(path) => {
                    automation::runtime_audit::repository(path).map_err(anyhow::Error::msg)?
                }
                None => automation::runtime_audit::installed(),
            };
            println!("{}", serde_json::to_string_pretty(&report)?);
            anyhow::ensure!(
                report.is_clean(),
                "Task runtime audit found entries requiring review"
            );
        }
        AutomationCommand::Copy { id, name, revision } => {
            let mut draft = automation::copy_draft(id, *revision).map_err(anyhow::Error::msg)?;
            draft.name = name
                .clone()
                .unwrap_or_else(|| format!("{} (copy)", draft.name));
            let id = automation::save(None, None, draft).map_err(anyhow::Error::msg)?;
            result(json, &id, "saved");
        }
        AutomationCommand::Import {
            path,
            workdir,
            preview,
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
                result(json, &id, "saved");
            }
        }
        AutomationCommand::Export { id, file } => {
            automation::package::export_package(id, file).map_err(anyhow::Error::msg)?;
            result(json, id, "exported");
        }
        AutomationCommand::Migrate { id } => {
            let new_id = automation::package::migrate(id).map_err(anyhow::Error::msg)?;
            result(json, &new_id, "saved");
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
#[path = "automation/tests.rs"]
mod tests;
