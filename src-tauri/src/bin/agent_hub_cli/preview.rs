use anyhow::{bail, Context, Result};
use app_lib::core::{central_repo, preview::automation::ControlEndpoint};
use clap::{Args, Subcommand};
use serde_json::{json, Value};
use std::path::PathBuf;

#[derive(Args, Debug)]
pub struct PreviewArgs {
    #[command(subcommand)]
    pub command: PreviewCommand,
}
#[derive(Subcommand, Debug)]
pub enum PreviewCommand {
    /// 列出网页标签及连接状态。
    List,
    /// 打开与桌面界面共用的网页。
    Open {
        url: String,
        #[arg(long, default_value = "default")]
        profile: String,
    },
    /// 关闭网页。
    Close { id: String },
    /// 读取页面与可操作元素快照。
    Snapshot { id: String },
    /// 重新连接原页面通道，不导航或重放输入。
    Reconnect { id: String },
    /// 放弃原表单并重新打开最后地址，保留逻辑页面 ID。
    Reopen { id: String },
    /// 在指定页面导航。
    Navigate { id: String, url: String },
    /// 在页面内执行表达式（不访问应用 IPC）。
    Evaluate { id: String, expression: String },
    /// 抓取当前视口或完整页面。
    Screenshot {
        id: String,
        output: PathBuf,
        #[arg(long)]
        full: bool,
    },
    /// 用当前快照中的引用点击元素。
    Click { id: String, reference: String },
    /// 填写快照中的输入元素。
    Fill {
        id: String,
        reference: String,
        #[arg(allow_hyphen_values = true)]
        value: String,
    },
    /// 滚动页面。
    Scroll {
        id: String,
        #[arg(long, default_value_t = 0., allow_negative_numbers = true)]
        x: f64,
        #[arg(long, default_value_t = 600., allow_negative_numbers = true)]
        y: f64,
    },
}
fn request(body: Value) -> Result<Value> {
    let path = central_repo::home_base_dir().join("preview/control.json");
    let bytes = std::fs::read(path).context("Start AgentHub to use preview automation")?;
    if bytes.len() > 8192 {
        bail!("Invalid preview control configuration");
    }
    let endpoint: ControlEndpoint = serde_json::from_slice(&bytes)?;
    app_lib::core::preview::automation::call(&endpoint, body)
        .map_err(|error| anyhow::anyhow!(error.to_string()))
}
fn action(id: &str, value: Value) -> Result<Value> {
    request(json!({"kind":"action","id":id,"action":value}))
}
pub fn run(args: &PreviewArgs, json_output: bool) -> Result<()> {
    let value = match &args.command {
        PreviewCommand::List => request(json!({"kind":"list"}))?,
        PreviewCommand::Open { url, profile } => {
            request(json!({"kind":"open","url":url,"profile":profile}))?
        }
        PreviewCommand::Close { id } => request(json!({"kind":"close","id":id}))?,
        PreviewCommand::Reopen { id } => request(json!({"kind":"reopen","id":id}))?,
        PreviewCommand::Reconnect { id } => request(json!({"kind":"reconnect","id":id}))?,
        PreviewCommand::Snapshot { id } => action(id, json!({"kind":"snapshot"}))?,
        PreviewCommand::Navigate { id, url } => action(id, json!({"kind":"navigate","url":url}))?,
        PreviewCommand::Evaluate { id, expression } => {
            action(id, json!({"kind":"evaluate","expression":expression}))?
        }
        PreviewCommand::Click { id, reference } => {
            action(id, json!({"kind":"click_ref","reference":reference}))?
        }
        PreviewCommand::Fill {
            id,
            reference,
            value,
        } => action(
            id,
            json!({"kind":"fill_ref","reference":reference,"value":value}),
        )?,
        PreviewCommand::Scroll { id, x, y } => {
            if !x.is_finite() || !y.is_finite() {
                bail!("Scroll coordinates must be finite");
            }
            action(
                id,
                json!({"kind":"evaluate","expression":format!("window.scrollBy({x},{y}); true")}),
            )?
        }
        PreviewCommand::Screenshot { id, output, full } => {
            use base64::Engine;
            let result = action(id, json!({"kind":"screenshot","full":full}))?;
            let data = result["data"].as_str().context("Screenshot unavailable")?;
            let bytes = base64::engine::general_purpose::STANDARD.decode(data)?;
            std::fs::write(output, bytes)?;
            json!({"saved":output})
        }
    };
    super::print_json(&value, json_output);
    Ok(())
}
