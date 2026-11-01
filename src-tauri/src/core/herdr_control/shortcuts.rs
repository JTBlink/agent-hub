use anyhow::{bail, Context, Result};

/// Only emit a TUI shortcut when the local configuration confirms its meaning.
/// Unknown bindings fail closed rather than sending control bytes to an Agent.
pub fn sidebar_keys() -> Result<String> {
    let path = std::env::var_os("HERDR_CONFIG_PATH")
        .map(std::path::PathBuf::from)
        .or_else(|| {
            std::env::var_os("XDG_CONFIG_HOME")
                .map(std::path::PathBuf::from)
                .map(|p| p.join("herdr/config.toml"))
        })
        .or_else(|| dirs::home_dir().map(|p| p.join(".config/herdr/config.toml")))
        .context("Herdr configuration directory is unavailable")?;
    let text = match std::fs::read_to_string(path) {
        Ok(text) => text,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => String::new(),
        Err(error) => return Err(error.into()),
    };
    configured_sidebar_keys(&text)
}

fn configured_sidebar_keys(text: &str) -> Result<String> {
    let config: toml::Value = toml::from_str(text).context("Cannot parse Herdr key bindings")?;
    let binding = |name: &str, fallback: &str| -> Result<String> {
        match config.get("keys").and_then(|keys| keys.get(name)) {
            None => Ok(fallback.into()),
            Some(value) => value
                .as_str()
                .map(str::to_owned)
                .context("Invalid Herdr key binding"),
        }
    };
    let sidebar = binding("toggle_sidebar", "prefix+b")?;
    if let Some(suffix) = sidebar.strip_prefix("prefix+") {
        Ok(format!(
            "{}{}",
            encode(&binding("prefix", "ctrl+b")?)?,
            encode(suffix)?
        ))
    } else {
        encode(&sidebar)
    }
}

fn encode(key: &str) -> Result<String> {
    if key.len() == 1 && key.is_ascii() {
        return Ok(key.into());
    }
    if let Some(letter) = key.strip_prefix("ctrl+") {
        if letter.len() == 1 && letter.as_bytes()[0].is_ascii_lowercase() {
            return Ok(char::from(letter.as_bytes()[0] - b'a' + 1).into());
        }
    }
    bail!("Herdr sidebar shortcut cannot be encoded safely; use the shortcut configured in Herdr")
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn custom_prefix_uses_the_configured_control_bytes() {
        assert_eq!(
            configured_sidebar_keys("[keys]\nprefix = 'ctrl+b'\n").unwrap(),
            "\u{2}b"
        );
        assert_eq!(
            configured_sidebar_keys("[keys]\n\"prefix\" = 'ctrl+a'\n").unwrap(),
            "\u{1}b"
        );
        assert!(configured_sidebar_keys("[keys]\ntoggle_sidebar = ''\n").is_err());
    }
}
