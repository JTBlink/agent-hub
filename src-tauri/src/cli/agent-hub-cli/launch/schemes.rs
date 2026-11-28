use super::config;
use clap::{Args, Subcommand};

#[derive(Args, Clone, Debug)]
pub struct SchemeArgs {
    #[command(subcommand)]
    command: SchemeCommand,
}
#[derive(Subcommand, Clone, Debug)]
enum SchemeCommand {
    /// 列出指定 Agent 的有效方案（包含尚未保存的内置默认方案）。
    List { agent: String },
    /// 新建方案；稳定 ID 供自动化任务引用。
    Add {
        agent: String,
        #[arg(long)]
        id: String,
        #[arg(long)]
        name: String,
        #[arg(long)]
        instruction: String,
        #[arg(long)]
        default: bool,
    },
    /// 更新名称或完整启动指令，保留稳定 ID。
    Update {
        agent: String,
        id: String,
        #[arg(long)]
        name: Option<String>,
        #[arg(long)]
        instruction: Option<String>,
    },
    /// 删除方案；删除默认项时须显式指定接替方案。
    Delete {
        agent: String,
        id: String,
        #[arg(long)]
        replacement: Option<String>,
    },
    /// 设置该 Agent 的默认启动方案。
    SetDefault { agent: String, id: String },
}

pub fn run(args: SchemeArgs, json: bool) -> anyhow::Result<()> {
    use config::SchemeEdit;
    let (agent, change) = match args.command {
        SchemeCommand::List { agent } => {
            let (agent, schemes) = config::effective_schemes(&config::load()?, &agent)?;
            super::super::print_json(
                &serde_json::json!({"agent":agent,"default_id":schemes.default_id,"items":schemes.items}),
                json,
            );
            return Ok(());
        }
        SchemeCommand::Add {
            agent,
            id,
            name,
            instruction,
            default,
        } => (
            agent,
            SchemeEdit::Add {
                id,
                name,
                instruction,
                default,
            },
        ),
        SchemeCommand::Update {
            agent,
            id,
            name,
            instruction,
        } => (
            agent,
            SchemeEdit::Update {
                id,
                name,
                instruction,
            },
        ),
        SchemeCommand::Delete {
            agent,
            id,
            replacement,
        } => (agent, SchemeEdit::Delete { id, replacement }),
        SchemeCommand::SetDefault { agent, id } => (agent, SchemeEdit::SetDefault { id }),
    };
    super::super::print_json(&config::edit_schemes(&agent, change)?, json);
    Ok(())
}
