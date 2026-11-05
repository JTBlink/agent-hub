use app_lib::core::agent_launch_config as config;
use clap::{Args, Subcommand};

#[derive(Args, Debug)]
pub struct LaunchArgs {
    #[command(subcommand)]
    command: LaunchCommand,
}
#[derive(Subcommand, Debug)]
enum LaunchCommand {
    /// 查看完整设置、默认指令与当前修订。
    Show,
    /// 查看共享启动环境与可用后端。
    Environment,
    /// 解析一个 Agent 的有效启动指令（不启动进程）。
    Resolve { agent: String },
    /// 在明确的 Herdr 会话和空闲窗格启动一次 Agent，不投递提示词。
    #[cfg(feature = "herdr")]
    Start {
        agent: String,
        #[arg(long)]
        session: String,
        #[arg(long)]
        pane: String,
        #[arg(long)]
        name: String,
        /// 显式任务参数覆盖全局参数；未指定时继承全局。
        #[arg(long)]
        arguments_json: Option<String>,
        #[arg(long, default_value = "[]")]
        extra_json: String,
    },
    /// 在原生终端启动一次 Agent。
    Terminal {
        agent: String,
        #[arg(long)]
        cwd: std::path::PathBuf,
        #[arg(long)]
        prompt_file: Option<std::path::PathBuf>,
        #[arg(long)]
        arguments_json: Option<String>,
        #[arg(long)]
        receipt_file: std::path::PathBuf,
    },
    #[command(hide = true)]
    TerminalRun { id: String },
    /// 查询终端降级启动回执；不重复执行。
    TerminalStatus { id: String },
    /// 以修订保护保存完整 JSON 文档。
    Save {
        #[arg(long)]
        file: std::path::PathBuf,
        #[arg(long)]
        revision: String,
    },
}
pub fn run(args: LaunchArgs, json: bool) -> anyhow::Result<()> {
    match args.command {
        LaunchCommand::Show => super::print_json(&config::load()?, json),
        LaunchCommand::Environment => {
            #[cfg(feature = "herdr")]
            let herdr_path = app_lib::core::herdr::tools::HerdrTools::default()
                .detect()?
                .map(|installation| installation.path);
            #[cfg(not(feature = "herdr"))]
            let herdr_path: Option<String> = None;
            super::print_json(&serde_json::json!({ "herdr_path": herdr_path }), json);
        }
        LaunchCommand::Resolve { agent } => super::print_json(&config::resolve(&agent)?, json),
        #[cfg(feature = "herdr")]
        LaunchCommand::Start {
            agent,
            session,
            pane,
            name,
            arguments_json,
            extra_json,
        } => {
            anyhow::ensure!(
                !session.is_empty()
                    && !session.starts_with('-')
                    && !pane.starts_with('-')
                    && !name.starts_with('-')
                    && !name.is_empty(),
                "Invalid Herdr target"
            );
            let mut launch = config::resolve(&agent)?;
            if let Some(raw) = arguments_json {
                launch.arguments = serde_json::from_str(&raw)?;
            }
            let extra: Vec<String> = serde_json::from_str(&extra_json)?;
            launch.arguments.extend(extra);
            anyhow::ensure!(
                launch.arguments.len() <= 256
                    && launch
                        .arguments
                        .iter()
                        .all(|arg| arg.len() <= 8192 && !arg.chars().any(char::is_control)),
                "Invalid Agent arguments"
            );
            let binary = app_lib::core::herdr::tools::HerdrTools::default()
                .detect()?
                .ok_or_else(|| anyhow::anyhow!("Herdr CLI is not installed"))?
                .path;
            let result = app_lib::core::herdr::agents::start_configured(
                std::path::Path::new(&binary),
                &session,
                &launch,
                &name,
                &pane,
            )?;
            super::print_json(&result, json);
        }
        LaunchCommand::Terminal {
            agent,
            cwd,
            prompt_file,
            arguments_json,
            receipt_file,
        } => {
            use app_lib::core::agent_launcher::external_terminal;
            use std::io::Write;
            let mut launch = config::resolve(&agent)?;
            if let Some(raw) = arguments_json {
                launch.arguments = serde_json::from_str(&raw)?;
            }
            let prompt = prompt_file.map(std::fs::read_to_string).transpose()?;
            let receipt = external_terminal::open(&launch, &cwd, prompt.as_deref(), |receipt| {
                let parent = receipt_file
                    .parent()
                    .ok_or_else(|| anyhow::anyhow!("Missing receipt directory"))?;
                let mut staged = tempfile::NamedTempFile::new_in(parent)?;
                serde_json::to_writer(&mut staged, receipt)?;
                staged.flush()?;
                staged.persist(&receipt_file).map_err(|error| error.error)?;
                Ok(())
            })?;
            super::print_json(&receipt, json);
        }
        LaunchCommand::TerminalRun { id } => {
            let code = app_lib::core::agent_launcher::external_terminal::run(&id)?;
            if code != 0 {
                std::process::exit(code);
            }
        }
        LaunchCommand::TerminalStatus { id } => super::print_json(
            &app_lib::core::agent_launcher::external_terminal::status(&id)?,
            json,
        ),
        LaunchCommand::Save { file, revision } => {
            let raw = std::fs::read(file)?;
            anyhow::ensure!(
                raw.len() <= 1024 * 1024,
                "Agent launch configuration is too large"
            );
            let document = serde_json::from_slice(&raw)?;
            super::print_json(&config::save(document, &revision)?, json)
        }
    }
    Ok(())
}
