//! Render literal argv for a known interactive shell; never expand user arguments.
use anyhow::{bail, Result};

pub(crate) fn quote_posix(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}
pub(crate) fn render(shell: &str, program: &str, arguments: &[String]) -> Result<String> {
    if std::iter::once(program)
        .chain(arguments.iter().map(String::as_str))
        .any(|v| v.contains(['\r', '\n', '\0']))
    {
        bail!("Invalid launch argument");
    }
    let words = std::iter::once(program).chain(arguments.iter().map(String::as_str));
    match shell {
        "cmd" => {
            let mut rendered = Vec::new();
            for word in words {
                if word.contains(['%', '!', '"', '\r', '\n']) {
                    bail!("Use a shell supporting these launch arguments")
                }
                rendered.push(format!("\"{word}\""));
            }
            Ok(rendered.join(" "))
        }
        "pwsh" | "powershell" => Ok(format!(
            "& {}",
            words
                .map(|word| format!("'{}'", word.replace('\'', "''")))
                .collect::<Vec<_>>()
                .join(" ")
        )),
        "sh" | "bash" | "zsh" | "fish" | "dash" => {
            Ok(words.map(quote_posix).collect::<Vec<_>>().join(" "))
        }
        _ => bail!("Cannot safely launch a configured command in this shell"),
    }
}
