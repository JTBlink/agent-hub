use std::fs;

use agent_hub_lib::{
    agents::{
        standard::{CodexAdapter, OpenCodeAdapter},
        ConfigStatus, DiagnosticCode,
    },
    Agent, ConfigFormat, Scope,
};
use tempfile::tempdir;

#[test]
fn codex_workspace_toml_preserves_unknown_fields_and_redacts_secrets() {
    let workspace = tempdir().expect("workspace");
    let directory = workspace.path().join(".codex");
    fs::create_dir(&directory).expect("Codex directory");
    fs::write(
        directory.join("config.toml"),
        "model = \"gpt-5\"\napi_key = \"secret-value\"\nfuture_option = 42\n",
    )
    .expect("fixture");

    let document = CodexAdapter.scan_workspace(workspace.path());

    assert_eq!(document.agent, Agent::Codex);
    assert_eq!(document.scope, Scope::Workspace);
    assert_eq!(document.format, ConfigFormat::Toml);
    assert_eq!(document.status, ConfigStatus::Ready);
    assert_eq!(document.structured_view["future_option"], 42);
    assert_eq!(document.structured_view["api_key"], "••••••");
    assert!(!document.source_preview.contains("secret-value"));
}

#[test]
fn opencode_workspace_jsonc_accepts_comments_and_trailing_commas() {
    let workspace = tempdir().expect("workspace");
    fs::write(
        workspace.path().join("opencode.json"),
        "{\n // comment\n \"model\": \"测试模型\",\n \"token\": \"secret-value\",\n}\n",
    )
    .expect("fixture");

    let document = OpenCodeAdapter.scan_workspace(workspace.path());

    assert_eq!(document.agent, Agent::OpenCode);
    assert_eq!(document.format, ConfigFormat::Jsonc);
    assert_eq!(document.status, ConfigStatus::Ready);
    assert_eq!(document.structured_view["model"], "测试模型");
    assert_eq!(document.structured_view["token"], "••••••");
    assert!(!document.source_preview.contains("secret-value"));
}

#[test]
fn invalid_agent_formats_return_typed_diagnostics_without_source_content() {
    let workspace = tempdir().expect("workspace");
    fs::create_dir(workspace.path().join(".codex")).expect("Codex directory");
    fs::write(
        workspace.path().join(".codex/config.toml"),
        "api_key = \"top-secret\n",
    )
    .expect("fixture");
    fs::write(workspace.path().join("opencode.json"), "{\"token\":}").expect("fixture");

    let codex = CodexAdapter.scan_workspace(workspace.path());
    let opencode = OpenCodeAdapter.scan_workspace(workspace.path());

    assert_eq!(codex.status, ConfigStatus::Invalid);
    assert_eq!(codex.diagnostics[0].code, DiagnosticCode::TomlSyntax);
    assert!(!codex.diagnostics[0].message.contains("top-secret"));
    assert_eq!(opencode.status, ConfigStatus::Invalid);
    assert_eq!(opencode.diagnostics[0].code, DiagnosticCode::JsoncSyntax);
}
