use std::fs;

use agent_hub_lib::agents::{
    claude::ClaudeCodeAdapter, AgentConfigAdapter, ConfigStatus, DiagnosticCode, ScanContext,
};
use agent_hub_lib::{Agent, ConfigFormat, Scope};
use tempfile::tempdir;

#[test]
fn discovers_and_redacts_valid_global_settings_without_losing_unknown_fields() {
    let directory = tempdir().expect("temporary directory");
    let claude_directory = directory.path().join(".claude");
    fs::create_dir(&claude_directory).expect("Claude directory is created");
    fs::write(
        claude_directory.join("settings.json"),
        r#"{"model":"sonnet","apiKey":"super-secret","futureSetting":42}"#,
    )
    .expect("fixture is written");
    let adapter = ClaudeCodeAdapter;

    let document = adapter.scan_global(&ScanContext::new(directory.path()));

    assert_eq!(document.status, ConfigStatus::Ready);
    assert_eq!(document.agent, Agent::ClaudeCode);
    assert_eq!(document.scope, Scope::Global);
    assert_eq!(document.format, ConfigFormat::Json);
    assert_eq!(document.path, claude_directory.join("settings.json"));
    assert_eq!(document.checksum.as_deref().map(str::len), Some(64));
    assert!(document.modified_at_ms.is_some());
    assert_eq!(document.structured_view["model"], "sonnet");
    assert_eq!(document.structured_view["futureSetting"], 42);
    assert_eq!(document.structured_view["apiKey"], "••••••");
    assert!(!document.source_preview.contains("super-secret"));
    assert!(document.diagnostics.is_empty());
}

#[test]
fn redacts_nested_sensitive_values_and_preserves_source_shape() {
    let directory = tempdir().expect("temporary directory");
    let claude_directory = directory.path().join(".claude");
    fs::create_dir(&claude_directory).expect("Claude directory is created");
    let source = r#"{
  "model": "sonnet",
  "nested": {"private_key": "pem-secret"},
  "headers": [{"Authorization": "bearer-secret"}]
}"#;
    fs::write(claude_directory.join("settings.json"), source).expect("fixture is written");

    let document = ClaudeCodeAdapter.scan_global(&ScanContext::new(directory.path()));

    assert_eq!(document.structured_view["nested"]["private_key"], "••••••");
    assert_eq!(
        document.structured_view["headers"][0]["Authorization"],
        "••••••"
    );
    assert!(document
        .source_preview
        .contains("\n  \"model\": \"sonnet\","));
    assert!(!document.source_preview.contains("pem-secret"));
    assert!(!document.source_preview.contains("bearer-secret"));
}

#[test]
fn redacts_sensitive_values_even_when_json_is_invalid() {
    let directory = tempdir().expect("temporary directory");
    let claude_directory = directory.path().join(".claude");
    fs::create_dir(&claude_directory).expect("Claude directory is created");
    fs::write(
        claude_directory.join("settings.json"),
        r#"{"apiKey":"super-secret","model":}"#,
    )
    .expect("fixture is written");

    let document = ClaudeCodeAdapter.scan_global(&ScanContext::new(directory.path()));

    assert_eq!(document.status, ConfigStatus::Invalid);
    assert!(!document.source_preview.contains("super-secret"));
    assert!(document.source_preview.contains("apiKey"));
}

#[test]
fn honors_claude_config_dir_without_creating_the_default_directory() {
    let directory = tempdir().expect("temporary directory");
    let override_directory = directory.path().join("portable-claude");
    fs::create_dir(&override_directory).expect("override directory is created");
    fs::write(override_directory.join("settings.json"), "{}").expect("fixture is written");
    let context = ScanContext::new(directory.path()).with_claude_config_dir(&override_directory);

    let document = ClaudeCodeAdapter.scan_global(&context);

    assert_eq!(document.path, override_directory.join("settings.json"));
    assert_eq!(document.status, ConfigStatus::Ready);
    assert!(!directory.path().join(".claude").exists());
}

#[test]
fn missing_settings_are_diagnostic_and_scan_remains_read_only() {
    let directory = tempdir().expect("temporary directory");

    let document = ClaudeCodeAdapter.scan_global(&ScanContext::new(directory.path()));

    assert_eq!(document.status, ConfigStatus::Missing);
    assert_eq!(document.diagnostics[0].code, DiagnosticCode::FileMissing);
    assert!(!directory.path().join(".claude").exists());
}

#[test]
fn invalid_json_reports_the_parser_location_and_keeps_a_read_only_preview() {
    let directory = tempdir().expect("temporary directory");
    let claude_directory = directory.path().join(".claude");
    fs::create_dir(&claude_directory).expect("Claude directory is created");
    fs::write(
        claude_directory.join("settings.json"),
        "{\n  \"model\":,\n}",
    )
    .expect("fixture is written");

    let document = ClaudeCodeAdapter.scan_global(&ScanContext::new(directory.path()));

    assert_eq!(document.status, ConfigStatus::Invalid);
    assert_eq!(document.diagnostics[0].code, DiagnosticCode::JsonSyntax);
    assert_eq!(document.diagnostics[0].line, Some(2));
    assert!(document.diagnostics[0].column.is_some());
    assert!(document.source_preview.contains("\"model\""));
}

#[cfg(unix)]
#[test]
fn unreadable_settings_report_permissions_without_modifying_the_file() {
    use std::os::unix::fs::PermissionsExt;

    let directory = tempdir().expect("temporary directory");
    let claude_directory = directory.path().join(".claude");
    fs::create_dir(&claude_directory).expect("Claude directory is created");
    let settings = claude_directory.join("settings.json");
    fs::write(&settings, "{}").expect("fixture is written");
    let original = fs::metadata(&settings)
        .expect("metadata loads")
        .permissions();
    fs::set_permissions(&settings, fs::Permissions::from_mode(0o000))
        .expect("permissions are restricted");

    let document = ClaudeCodeAdapter.scan_global(&ScanContext::new(directory.path()));

    fs::set_permissions(&settings, original).expect("permissions are restored");
    assert_eq!(document.status, ConfigStatus::Unreadable);
    assert_eq!(
        document.diagnostics[0].code,
        DiagnosticCode::PermissionDenied
    );
}
