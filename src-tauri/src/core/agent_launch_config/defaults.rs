//! Defaults are available even when the Agent is not installed. No installation is triggered.
use std::collections::BTreeMap;

pub fn instructions() -> BTreeMap<String, String> {
    let entries = [
        ("claude_code", "claude --dangerously-skip-permissions"),
        (
            "codex",
            "codex --dangerously-bypass-approvals-and-sandbox -c check_for_update_on_startup=false",
        ),
        ("cursor", "cursor-agent"),
        ("github_copilot", "copilot"),
        ("gemini_cli", "gemini"),
        ("opencode", "opencode --auto"),
        ("openclaw", "openclaw tui"),
        ("hermes", "hermes --yolo"),
        ("openhands", "openhands"),
        ("cline", "cline"),
        ("goose", "goose session"),
        ("windsurf", "windsurf ."),
        ("continue", "cn"),
        ("grok", "grok"),
        ("antigravity", "agy"),
        ("qwen_code", "qwen"),
        ("crush", "crush"),
        ("kilo_code", "kilo"),
        ("roo_code", "code --reuse-window ."),
        ("deepagents", "deepagents"),
        ("amp", "amp"),
        ("kiro", "kiro-cli chat"),
        ("omp_agent", "omp"),
        ("droid", "droid"),
        ("trae", "trae ."),
        ("firebender", "open -a \"Android Studio\""),
        ("kimi", "kimi"),
        ("replit", "open -a Replit"),
        ("warp", "open -a Warp"),
        ("augment", "auggie"),
        ("bob", "bob chat"),
        ("codebuddy", "codebuddy"),
        ("command_code", "command-code"),
        ("cortex", "cortex"),
        ("iflow", "iflow"),
        ("junie", "junie"),
        ("kode", "kode"),
        ("mcpjam", "npx @mcpjam/inspector@latest"),
        ("mistral_vibe", "vibe"),
        ("mux", "mux"),
        ("neovate", "neovate"),
        ("pi", "pi"),
        ("pochi", "pochi"),
        ("qoder", "qoder"),
        ("trae_cn", "open -a \"Trae CN\""),
        ("zencoder", "code --reuse-window ."),
        ("zcode", "zcode"),
        ("adal", "adal"),
        ("qclaw", "open -a QClaw"),
        ("easyclaw", "open -a EasyClaw"),
        ("autoclaw", "open -a AutoClaw"),
        ("workbuddy", "open -a WorkBuddy"),
        ("deepseek_harness", "open -a \"DeepSeek Harness\""),
        ("gitlab_duo", "code --reuse-window ."),
    ];
    let mut defaults: BTreeMap<String, String> = entries
        .into_iter()
        .map(|(k, v)| (k.into(), v.into()))
        .collect();
    if !cfg!(target_os = "macos") {
        for (key, command) in [
            ("firebender", "studio ."),
            ("replit", "replit"),
            ("warp", "warp"),
            ("trae_cn", "trae ."),
            ("qclaw", "qclaw"),
            ("easyclaw", "easyclaw"),
            ("autoclaw", "autoclaw"),
            ("workbuddy", "workbuddy"),
            ("deepseek_harness", "deepseek-harness"),
        ] {
            defaults.insert(key.into(), command.into());
        }
    }
    defaults
}

/// Stable adapter identity differs from Herdr's CLI vocabulary for some Agents.
pub fn key_for_kind(kind: &str) -> &str {
    match kind {
        "claude" | "claude_teams" => "claude_code",
        "gemini" => "gemini_cli",
        "cursor-agent" => "cursor",
        "copilot" => "github_copilot",
        "agy" => "antigravity",
        "qwen" => "qwen_code",
        "kilo" => "kilo_code",
        "omp" => "omp_agent",
        "qodercli" => "qoder",
        _ => kind,
    }
}

pub fn kind_for_key(key: &str) -> Option<&str> {
    Some(match key {
        "claude_code" => "claude",
        "gemini_cli" => "gemini",
        "github_copilot" => "copilot",
        "antigravity" => "agy",
        "qwen_code" => "qwen",
        "kilo_code" => "kilo",
        "omp_agent" => "omp",
        "qoder" => "qodercli",
        "codex" | "cursor" | "opencode" | "hermes" | "grok" | "amp" | "droid" | "cline"
        | "kimi" | "kiro" | "pi" => key,
        _ => return None,
    })
}
