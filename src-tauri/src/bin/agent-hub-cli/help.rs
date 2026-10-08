//! Chinese help text and headings for every CLI command level.

use clap::{Arg, ArgAction, Command};

const CLI_HELP_TEMPLATE: &str = "{about-with-newline}用法: {usage}\n\n{all-args}{after-help}";

fn default_argument_help(id: &str) -> &'static str {
    match id {
        "path" | "paths" => "本地目录路径。",
        "agents" => "Agent 标识，可指定多个。",
        "key" => "唯一标识。",
        "name" => "名称。",
        "project_path" => "项目内的相对技能目录。",
        "query" => "搜索关键词。",
        "tags" => "标签，可重复指定。",
        "deployed_to" => "按部署到的 Agent 筛选。",
        "untagged" => "仅显示没有标签的技能。",
        "source" => "按技能来源筛选。",
        "reference" | "references" => "技能或技能组的 ID、名称或路径。",
        "dest" => "导出目标目录。",
        "force" => "强制覆盖或重新检查。",
        "local" => "按本地目录安装。",
        "git" => "按 Git 仓库安装。",
        "skillssh" => "从 Skills.sh 安装。",
        "all" => "处理全部技能。",
        "yes" => "跳过确认并执行。",
        "dry_run" => "仅预览，不写入更改。",
        "tool" => "Agent 标识。",
        "limit" => "返回的最大条数。",
        "git_url" | "url" => "Git 仓库 URL。",
        "git_subpath" => "Git 仓库内的技能子路径。",
        "old_name" => "原名称。",
        "new_name" => "新名称。",
        "description" => "技能组描述。",
        "icon" => "技能组图标。",
        "skill_group" => "技能组 ID 或名称。",
        "skills" => "技能 ID 或名称，可指定多个。",
        "message" => "本次备份的说明。",
        "tag" => "备份快照标签。",
        _ => "指定参数值。",
    }
}

pub(super) fn localize_command(command: Command) -> Command {
    command
        .help_template(CLI_HELP_TEMPLATE)
        .subcommand_help_heading("命令")
        .next_help_heading("选项")
        .mut_args(|arg| {
            let help = if arg.get_help().is_none() {
                Some(default_argument_help(arg.get_id().as_str()))
            } else {
                None
            };
            let heading = if arg.is_positional() {
                "参数"
            } else {
                "选项"
            };
            let arg = arg.help_heading(heading);
            if let Some(help) = help {
                arg.help(help)
            } else {
                arg
            }
        })
        .disable_help_flag(true)
        .disable_help_subcommand(true)
        .arg(
            Arg::new("help")
                .short('h')
                .long("help")
                .action(ArgAction::Help)
                .help("显示帮助"),
        )
        .mut_subcommands(localize_command)
}
