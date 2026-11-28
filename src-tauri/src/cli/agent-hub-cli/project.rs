//! Project commands use the same core as the desktop, and never require a
//! personal database for status, repair, team deployment or shared toggles.
use app_lib::core::{project_library, skill_store::SkillStore, tool_adapters};
use clap::{Args, Subcommand};
use std::path::PathBuf;

#[derive(Args, Debug)]
pub(super) struct ProjectArgs {
    /// 项目根目录。
    #[arg(long, default_value = ".", global = true)]
    path: PathBuf,
    #[command(subcommand)]
    command: ProjectCommand,
}

#[derive(Subcommand, Debug)]
enum ProjectCommand {
    /// 查看项目技能、入口健康和待提交路径。
    Status,
    /// 从个人技能库添加到项目，生成团队入口。
    Add {
        reference: String,
        #[arg(long = "agent", required = true)]
        agents: Vec<String>,
        /// 将 Agent 入口保存为副本，适用于不支持软链接的团队。
        #[arg(long)]
        copy: bool,
    },
    /// 从项目技能库为团队添加入口，不读取个人库。
    Deploy {
        name: String,
        #[arg(long = "agent", required = true)]
        agents: Vec<String>,
    },
    /// 以个人技能库的选定版本更新项目，保护本地修改。
    Update { name: String, reference: String },
    /// 从项目内容刷新全部团队入口，不下载来源。
    Repair { name: String },
    /// 启用项目 Skill，影响全部团队入口。
    Enable { name: String },
    /// 停用项目 Skill，保留内容，影响全部团队入口。
    Disable { name: String },
    /// 移除完整项目技能及团队副本，保护本地修改。
    Remove { name: String },
    /// 移除一个专属入口，保留项目库内容。
    Undeploy {
        name: String,
        #[arg(long = "agent")]
        agent: String,
    },
}

pub(super) fn run(
    args: &ProjectArgs,
    store: Option<&SkillStore>,
    json: bool,
) -> anyhow::Result<()> {
    let targets = |keys: &[String]| -> anyhow::Result<Vec<_>> {
        keys.iter()
            .map(|key| {
                let target = if let Some(store) = store {
                    tool_adapters::find_adapter_with_store(store, key)
                } else {
                    tool_adapters::find_adapter(key)
                };
                target.ok_or_else(|| anyhow::anyhow!("Unknown agent: {key}"))
            })
            .collect()
    };
    let root = &args.path;
    let report = match &args.command {
        ProjectCommand::Status => project_library::status(root)?,
        ProjectCommand::Add {
            reference,
            agents,
            copy,
        } => {
            let store =
                store.ok_or_else(|| anyhow::anyhow!("Personal library required for add"))?;
            let skill = super::resolve_skill(store, reference)?;
            let preference = app_lib::core::deployment_preferences::Preference::load(
                store,
                app_lib::core::deployment_preferences::Scope::Project,
            )?;
            project_library::install_with_mode(
                root,
                &skill,
                &targets(agents)?,
                matches!(
                    preference.for_install(copy.then_some(true)),
                    app_lib::core::sync_engine::SyncMode::Copy
                ),
            )?
        }
        ProjectCommand::Deploy { name, agents } => {
            project_library::deploy(root, name, &targets(agents)?)?
        }
        ProjectCommand::Update { name, reference } => {
            let store =
                store.ok_or_else(|| anyhow::anyhow!("Personal library required for update"))?;
            let skill = super::resolve_skill(store, reference)?;
            project_library::update(root, name, &skill, false)?
        }
        ProjectCommand::Remove { name } => project_library::remove(root, name)?,
        ProjectCommand::Repair { name } => project_library::repair(root, name)?,
        ProjectCommand::Enable { name } => project_library::set_enabled(root, name, true)?,
        ProjectCommand::Disable { name } => project_library::set_enabled(root, name, false)?,
        ProjectCommand::Undeploy { name, agent } => {
            project_library::remove_target(root, name, agent)?
        }
    };
    super::print_json(&report, json);
    Ok(())
}

impl ProjectArgs {
    pub(super) fn needs_personal_library(&self) -> bool {
        matches!(
            self.command,
            ProjectCommand::Add { .. } | ProjectCommand::Update { .. }
        )
    }
}
