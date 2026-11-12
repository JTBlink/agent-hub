use app_lib::core::automation::libraries;
use clap::Subcommand;
use std::path::PathBuf;

#[derive(Subcommand, Debug)]
pub(super) enum Command {
    /// 列出当前公共库及其依赖任务。
    List,
    /// 解析公共库；--content 供共享运行器获取一致的内存快照。
    Resolve {
        name: String,
        #[arg(long)]
        content: bool,
    },
    /// 导入或更新公共库，更新必须提供当前内容修订。
    Import {
        #[arg(long)]
        path: PathBuf,
        #[arg(long)]
        revision: Option<String>,
        #[arg(long)]
        preview: bool,
    },
    /// 查看已进入备份的公共库。
    Backups,
    /// 预览备份；--apply 恢复，覆盖已有库必须提供其当前修订。
    Restore {
        name: String,
        #[arg(long)]
        revision: Option<String>,
        #[arg(long)]
        apply: bool,
    },
    /// 删除没有任务引用的公共库。
    Remove {
        name: String,
        #[arg(long)]
        revision: String,
        #[arg(long)]
        yes: bool,
    },
    /// 获取CLI管理的公共库Python加载器。
    Runtime,
}

pub(super) fn run(command: &Command) -> anyhow::Result<()> {
    let value = match command {
        Command::List => serde_json::to_value(libraries::list().map_err(anyhow::Error::msg)?)?,
        Command::Resolve { name, content } => {
            serde_json::to_value(libraries::resolve(name, *content).map_err(anyhow::Error::msg)?)?
        }
        Command::Import {
            path,
            revision,
            preview,
        } => {
            if *preview {
                serde_json::to_value(libraries::preview(path).map_err(anyhow::Error::msg)?)?
            } else {
                serde_json::to_value(
                    libraries::import(path, revision.as_deref()).map_err(anyhow::Error::msg)?,
                )?
            }
        }
        Command::Backups => {
            serde_json::to_value(libraries::backups().map_err(anyhow::Error::msg)?)?
        }
        Command::Restore {
            name,
            revision,
            apply,
        } => serde_json::to_value(
            libraries::restore(name, revision.as_deref(), *apply).map_err(anyhow::Error::msg)?,
        )?,
        Command::Remove {
            name,
            revision,
            yes,
        } => {
            anyhow::ensure!(*yes, "Deleting a shared library requires --yes");
            libraries::remove(name, revision).map_err(anyhow::Error::msg)?;
            serde_json::json!({"name":name,"state":"removed"})
        }
        Command::Runtime => {
            serde_json::json!({"path":libraries::python_loader().map_err(anyhow::Error::msg)?})
        }
    };
    println!("{}", serde_json::to_string_pretty(&value)?);
    Ok(())
}
