//! CLI adaptation only; validation, storage, recovery and elevation stay in core.
use app_lib::core::{
    error::AppError,
    hosts::{self, profiles},
};
use clap::{Args, Subcommand};
use std::{io::Read, path::PathBuf};

#[derive(Args, Debug)]
pub(super) struct HostsArgs {
    #[command(subcommand)]
    command: HostsCommand,
}

#[derive(Subcommand, Debug)]
enum HostsCommand {
    /// 列出完整方案及其 ID、修订和文件路径。
    List,
    /// 查看方案；使用 ID 或唯一名称。
    Show { reference: String },
    /// 从 UTF-8 文件创建完整方案；保存不会修改系统。
    Create {
        #[arg(long)]
        name: String,
        #[command(flatten)]
        input: Input,
    },
    /// 更新方案正文，必须提供读取时的修订。
    Update {
        /// 方案 ID 或唯一名称。
        reference: String,
        #[arg(long)]
        revision: String,
        #[command(flatten)]
        input: Input,
    },
    /// 重命名方案并保留 ID 和正文。
    Rename {
        /// 方案 ID 或唯一名称。
        reference: String,
        #[arg(long)]
        name: String,
        #[arg(long)]
        revision: String,
    },
    /// 复制方案为新的 ID。
    Copy {
        /// 方案 ID 或唯一名称。
        reference: String,
        #[arg(long)]
        name: String,
    },
    /// 删除指定修订的方案，不改变系统 Hosts。
    Delete {
        /// 方案 ID 或唯一名称。
        reference: String,
        #[arg(long)]
        revision: String,
    },
    /// 将已保存的完整方案应用到系统，可能请求管理员授权。
    Apply {
        /// 方案 ID 或唯一名称。
        reference: String,
        #[arg(long)]
        revision: String,
        /// system read 返回的系统修订。
        #[arg(long)]
        system_revision: String,
    },
    /// 撤销当前用户的 macOS Hosts 持久免密授权；下次写入重新授权。
    #[cfg(target_os = "macos")]
    RevokeAuthorization,
    /// 读取或显式写入本机系统 Hosts。
    System {
        #[command(subcommand)]
        command: SystemCommand,
    },
}

#[derive(Subcommand, Debug)]
enum SystemCommand {
    /// 读取实际系统内容、修订及已应用方案 ID。
    Read,
    /// 写入完整正文，保留原文备份并校验系统修订。
    Write {
        #[arg(long)]
        revision: String,
        #[command(flatten)]
        input: Input,
    },
}

#[derive(Args, Debug)]
struct Input {
    /// UTF-8 Hosts 正文文件；使用 - 从标准输入读取，最大 1 MiB。
    #[arg(long)]
    file: PathBuf,
}

impl Input {
    fn read(&self) -> anyhow::Result<String> {
        let source: Box<dyn Read> = if self.file == std::path::Path::new("-") {
            Box::new(std::io::stdin())
        } else {
            Box::new(std::fs::File::open(&self.file)?)
        };
        let mut bytes = Vec::new();
        source.take(1024 * 1024 + 1).read_to_end(&mut bytes)?;
        if bytes.len() > 1024 * 1024 {
            return Err(AppError::invalid_input("HOSTS_TOO_LARGE").into());
        }
        String::from_utf8(bytes).map_err(|_| AppError::invalid_input("HOSTS_ENCODING").into())
    }
}

fn resolve(reference: &str) -> anyhow::Result<profiles::HostsProfile> {
    let mut profiles = profiles::list().map_err(AppError::io)?;
    if let Some(index) = profiles.iter().position(|p| p.id == reference) {
        return Ok(profiles.swap_remove(index));
    }
    let mut matches = profiles.into_iter().filter(|p| p.name == reference);
    let profile = matches
        .next()
        .ok_or_else(|| AppError::not_found("HOSTS_PROFILE_NOT_FOUND"))?;
    if matches.next().is_some() {
        return Err(AppError::invalid_input("HOSTS_PROFILE_AMBIGUOUS: use the profile ID").into());
    }
    Ok(profile)
}

pub(super) fn run(args: &HostsArgs, isolated: bool, json: bool) -> anyhow::Result<()> {
    if isolated
        && matches!(
            args.command,
            HostsCommand::Apply { .. }
                | HostsCommand::System {
                    command: SystemCommand::Write { .. }
                }
        )
    {
        return Err(AppError::invalid_input(
            "System Hosts writes cannot be combined with --skills-root",
        )
        .into());
    }
    #[cfg(target_os = "macos")]
    if isolated && matches!(args.command, HostsCommand::RevokeAuthorization) {
        return Err(AppError::invalid_input(
            "Hosts authorization cannot be combined with --skills-root",
        )
        .into());
    }
    use HostsCommand::*;
    match &args.command {
        #[cfg(target_os = "macos")]
        RevokeAuthorization => {
            hosts::macos_helper::revoke().map_err(AppError::io)?;
            super::print_json(&serde_json::json!({"ok": true, "revoked": true}), json);
        }
        List => super::print_json(&profiles::list().map_err(AppError::io)?, json),
        Show { reference } => super::print_json(&resolve(reference)?, json),
        Create { name, input } => super::print_json(
            &profiles::create(name, &input.read()?).map_err(AppError::io)?,
            json,
        ),
        Update {
            reference,
            revision,
            input,
        } => {
            let profile = resolve(reference)?;
            super::print_json(
                &profiles::update(&profile.id, &profile.name, &input.read()?, revision)
                    .map_err(AppError::io)?,
                json,
            );
        }
        Rename {
            reference,
            name,
            revision,
        } => {
            let profile = resolve(reference)?;
            super::print_json(
                &profiles::update(&profile.id, name, &profile.content, revision)
                    .map_err(AppError::io)?,
                json,
            );
        }
        Copy { reference, name } => {
            let profile = resolve(reference)?;
            super::print_json(
                &profiles::create(name, &profile.content).map_err(AppError::io)?,
                json,
            );
        }
        Delete {
            reference,
            revision,
        } => {
            let profile = resolve(reference)?;
            profiles::delete(&profile.id, revision).map_err(AppError::io)?;
            super::print_json(
                &serde_json::json!({"ok":true,"id":profile.id,"deleted":true}),
                json,
            );
        }
        Apply {
            reference,
            revision,
            system_revision,
        } => {
            let profile = resolve(reference)?;
            super::print_json(
                &profiles::apply(&profile.id, revision, system_revision).map_err(AppError::io)?,
                json,
            );
        }
        System {
            command: SystemCommand::Read,
        } => super::print_json(&hosts::read_for_editor().map_err(AppError::io)?, json),
        System {
            command: SystemCommand::Write { revision, input },
        } => super::print_json(
            &hosts::save(&input.read()?, revision).map_err(AppError::io)?,
            json,
        ),
    }
    Ok(())
}
