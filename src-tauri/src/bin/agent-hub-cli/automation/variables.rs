use app_lib::core::automation;
use clap::Subcommand;

#[derive(Subcommand, Debug)]
pub(super) enum Command {
    /// 查看指定方案的变量，省略 --variant 时读取当前方案。
    List {
        id: String,
        #[arg(long)]
        variant: Option<String>,
    },
    /// 设置一个变量；其值按字面数据保存，不执行插值。
    Set {
        id: String,
        #[arg(long)]
        variant: Option<String>,
        #[arg(long)]
        name: String,
        #[arg(long, allow_hyphen_values = true)]
        value: String,
        #[arg(long)]
        revision: u64,
    },
    /// 从指定方案移除一个变量。
    Unset {
        id: String,
        #[arg(long)]
        variant: Option<String>,
        #[arg(long)]
        name: String,
        #[arg(long)]
        revision: u64,
    },
}

pub(super) fn run(command: &Command) -> anyhow::Result<()> {
    automation::sync_workspace_scripts().map_err(anyhow::Error::msg)?;
    let (id, variant, change) = match command {
        Command::List { id, variant } => (id, variant, None),
        Command::Set {
            id,
            variant,
            name,
            value,
            revision,
        } => (id, variant, Some((name, Some(value.as_str()), revision))),
        Command::Unset {
            id,
            variant,
            name,
            revision,
        } => (id, variant, Some((name, None, revision))),
    };
    let task = super::task(id)?;
    let mut draft = task
        .definition
        .ok_or_else(|| anyhow::anyhow!("Task definition unavailable"))?;
    if let Some((name, value, revision)) = change {
        anyhow::ensure!(
            task.can_edit && task.origin == automation::TaskOrigin::AgentHub,
            "Task is read-only"
        );
        anyhow::ensure!(
            task.revision == Some(*revision),
            "Task changed; refresh before editing variables"
        );
        automation::set_prompt_variable(&mut draft, variant.as_deref(), name, value)
            .map_err(anyhow::Error::msg)?;
        automation::save(Some(id), Some(*revision), draft.clone()).map_err(anyhow::Error::msg)?;
    }
    let (variant, variables) =
        automation::prompt_variables(&draft, variant.as_deref()).map_err(anyhow::Error::msg)?;
    println!(
        "{}",
        serde_json::json!({"id":id,"variant":variant,"variables":variables,"revision":super::task(id)?.revision})
    );
    Ok(())
}
