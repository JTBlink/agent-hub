use super::*;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};

impl HerdrControl {
    // The public pane.focus API supports a precise Shell target; the CLI only
    // exposes directional pane focus. Use the session's discovered endpoint.
    pub(super) fn focus_pane(&self, session: &str, pane_id: &str) -> Result<()> {
        let socket = self
            .sessions()?
            .into_iter()
            .find(|s| s.name == session && s.running)
            .and_then(|s| s.socket_path)
            .context("Herdr session endpoint is unavailable")?;
        let request = serde_json::json!({"id":uuid::Uuid::new_v4().to_string(),"method":"pane.focus","params":{"pane_id":pane_id}});
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()?;
        runtime.block_on(async {
            tokio::time::timeout(std::time::Duration::from_secs(5), async {
                #[cfg(unix)]
                let mut stream = tokio::net::UnixStream::connect(&socket).await?;
                #[cfg(windows)]
                let mut stream =
                    tokio::net::windows::named_pipe::ClientOptions::new().open(&socket)?;
                let mut bytes = serde_json::to_vec(&request)?;
                bytes.push(b'\n');
                stream.write_all(&bytes).await?;
                let mut response = Vec::new();
                BufReader::new(stream.take(1024 * 1024))
                    .read_until(b'\n', &mut response)
                    .await?;
                let response: Value =
                    serde_json::from_slice(&response).context("Invalid Herdr focus response")?;
                if response.get("id") != request.get("id") || response.get("error").is_some() {
                    bail!("Herdr rejected pane focus; refresh the selected target")
                }
                Ok(())
            })
            .await
            .context("Herdr pane focus timed out")?
        })
    }
}
