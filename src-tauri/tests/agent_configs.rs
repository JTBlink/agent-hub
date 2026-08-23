use std::fs;

use agent_hub_lib::{
    agents::ScanContext,
    agents::{
        standard::{CodexAdapter, OpenCodeAdapter},
        ConfigStatus, DiagnosticCode,
    },
    configuration::{read_revision, write_atomically, ConfigurationError},
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
        include_str!("fixtures/codex/config.toml"),
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
        include_str!("fixtures/opencode/opencode.jsonc"),
    )
    .expect("fixture");

    let document = OpenCodeAdapter.scan_workspace(workspace.path());

    assert_eq!(document.agent, Agent::OpenCode);
    assert_eq!(document.format, ConfigFormat::Jsonc);
    assert_eq!(document.status, ConfigStatus::Ready);
    assert_eq!(document.structured_view["model"], "openai/gpt-5.3-codex");
    assert_eq!(document.structured_view["token"], "••••••");
    assert!(!document.source_preview.contains("secret-value"));
}

#[test]
fn explicit_global_overrides_are_captured_by_the_scan_context() {
    let directory = tempdir().expect("fixture root");
    let codex_home = directory.path().join("custom-codex");
    let opencode_path = directory.path().join("custom-opencode.jsonc");
    fs::create_dir_all(&codex_home).expect("Codex home");
    fs::write(
        codex_home.join("config.toml"),
        include_str!("fixtures/codex/config.toml"),
    )
    .expect("Codex fixture");
    fs::write(
        &opencode_path,
        include_str!("fixtures/opencode/opencode.jsonc"),
    )
    .expect("OpenCode fixture");
    let context = ScanContext::new(directory.path())
        .with_codex_home(&codex_home)
        .with_opencode_config_file(&opencode_path);

    let codex = agent_hub_lib::agents::AgentConfigAdapter::scan_global(&CodexAdapter, &context);
    let opencode =
        agent_hub_lib::agents::AgentConfigAdapter::scan_global(&OpenCodeAdapter, &context);

    assert_eq!(codex.path, codex_home.join("config.toml"));
    assert_eq!(codex.status, ConfigStatus::Ready);
    assert_eq!(opencode.path, opencode_path);
    assert_eq!(opencode.status, ConfigStatus::Ready);
}

#[test]
fn opencode_schema_shape_difference_is_a_structured_diagnostic() {
    let workspace = tempdir().expect("workspace");
    fs::write(
        workspace.path().join("opencode.json"),
        r#"{"$schema": 7, "model": "openai/gpt-5"}"#,
    )
    .expect("fixture");

    let document = OpenCodeAdapter.scan_workspace(workspace.path());

    assert_eq!(document.status, ConfigStatus::Invalid);
    assert_eq!(document.diagnostics[0].code, DiagnosticCode::SchemaMismatch);
    assert_eq!(
        document.diagnostics[0].message,
        "OpenCode $schema must be a string when present"
    );
}

#[test]
fn real_agent_formats_round_trip_exact_bytes_and_reject_concurrent_overwrite() {
    for (relative_path, format, fixture, replacement) in [
        (
            ".codex/config.toml",
            ConfigFormat::Toml,
            include_str!("fixtures/codex/config.toml"),
            format!(
                "{}\n# AgentHub edit keeps prior text intact.\n",
                include_str!("fixtures/codex/config.toml")
            ),
        ),
        (
            "opencode.json",
            ConfigFormat::Jsonc,
            include_str!("fixtures/opencode/opencode.jsonc"),
            format!(
                "{}\n// AgentHub edit keeps prior text intact.\n",
                include_str!("fixtures/opencode/opencode.jsonc")
            ),
        ),
    ] {
        let workspace = tempdir().expect("workspace");
        let path = workspace.path().join(relative_path);
        fs::create_dir_all(path.parent().expect("parent")).expect("config directory");
        fs::write(&path, fixture).expect("fixture");
        let backup_root = workspace.path().join("backups");
        let (_, revision) = read_revision(&path).expect("revision");

        let written = write_atomically(
            &path,
            format,
            &revision.checksum,
            replacement.as_bytes(),
            &backup_root,
        )
        .expect("real format writes");
        assert_eq!(fs::read_to_string(&path).expect("written"), replacement);
        assert_eq!(
            fs::read_to_string(&written.backup_path).expect("backup"),
            fixture
        );

        let stale_checksum = written.after.checksum;
        let external = format!("{replacement}\n# external edit\n");
        fs::write(&path, &external).expect("external edit");
        let error = write_atomically(
            &path,
            format,
            &stale_checksum,
            replacement.as_bytes(),
            &backup_root,
        )
        .expect_err("stale write is rejected");
        assert!(matches!(error, ConfigurationError::ExternalModified { .. }));
        assert_eq!(
            fs::read_to_string(&path).expect("external remains"),
            external
        );
    }
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
