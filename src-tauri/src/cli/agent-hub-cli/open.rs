use anyhow::{bail, Context, Result};
use clap::{Args, FromArgMatches};
use std::{ffi::OsString, path::PathBuf};

#[derive(Args, Debug)]
pub struct OpenArgs {
    /// 在 AgentHub 中打开的本地文件；支持相对路径和 ~/。
    pub path: PathBuf,
}

/// Let clap identify the root command before expanding a file-path shorthand.
/// This preserves global-option values, nested commands, and typo diagnostics.
pub(super) fn parse(arguments: Vec<OsString>) -> Result<super::Cli, clap::Error> {
    let command = super::cli_command();
    let matches = command
        .clone()
        .allow_external_subcommands(true)
        .try_get_matches_from(&arguments)?;
    if let Some((name, values)) = matches.subcommand() {
        if command.find_subcommand(name).is_none() {
            let path = std::path::Path::new(name);
            let mut expanded = arguments;
            if path.is_absolute()
                || name.starts_with(['.', '~'])
                || name.contains(['/', '\\'])
                || path.extension().is_some()
                || path.is_file()
            {
                let remaining = values.get_raw("").map_or(0, Iterator::count);
                let index = expanded.len() - remaining - 1;
                expanded.insert(index, "open".into());
            }
            let matches = command.try_get_matches_from(expanded)?;
            return super::Cli::from_arg_matches(&matches);
        }
    }
    super::Cli::from_arg_matches(&matches)
}

pub fn run(args: &OpenArgs, json_output: bool) -> Result<()> {
    let input = args.path.to_str().context("文件路径必须是有效的 UTF-8")?;
    let directory = std::env::current_dir().context("无法确定当前目录")?;
    let path = app_lib::core::preview::documents::resolve_explicit_path(input, Some(&directory))?;
    let path = path.canonicalize().context("文件不存在或无法访问")?;
    if !path.is_file() {
        bail!("请指定文件路径，不能打开目录");
    }
    let value = super::preview_cli::request(serde_json::json!({
        "kind": "open_file", "path": path
    }))
    .context("文件打开请求未完成；请确认 AgentHub 桌面应用正在运行，结果不明时先检查界面")?;
    super::print_json(&value, json_output);
    Ok(())
}

#[cfg(test)]
#[path = "open/tests.rs"]
mod tests;
