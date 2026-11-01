use super::*;

#[test]
fn contextual_io_error_includes_the_underlying_filesystem_reason() {
    let cause = std::io::Error::from(std::io::ErrorKind::NotFound);
    let error = anyhow::Error::from(cause)
        .context("Failed to remove existing target <workspace>/skills/demo");
    let error = AppError::io_with_context(error);
    assert_eq!(error.kind, ErrorKind::Io);
    assert!(error.message.contains("Failed to remove existing target"));
    assert!(error.message.contains("entity not found"));
}

#[test]
fn classify_git_error_detects_cancelled() {
    let err = AppError::classify_git_error("Installation cancelled by user");
    assert!(matches!(err.kind, ErrorKind::Cancelled));
}

#[test]
fn classify_git_error_detects_canceled_american_spelling() {
    let err = AppError::classify_git_error("Operation was canceled");
    assert!(matches!(err.kind, ErrorKind::Cancelled));
}

#[test]
fn classify_git_error_regular_git_error() {
    let err = AppError::classify_git_error("Failed to push to remote");
    assert!(matches!(err.kind, ErrorKind::Git));
}

#[test]
fn classify_git_error_case_insensitive() {
    let err = AppError::classify_git_error("CANCELLED by system");
    assert!(matches!(err.kind, ErrorKind::Cancelled));
}

#[test]
fn classify_git_error_detects_connection_refused() {
    let err = AppError::classify_git_error("fatal: unable to access 'https://gitea.example.com/user/repo.git/': Failed to connect to gitea.example.com port 443: Connection refused");
    assert!(matches!(err.kind, ErrorKind::Network));
}

#[test]
fn classify_git_error_detects_could_not_resolve_host() {
    let err = AppError::classify_git_error(
        "fatal: unable to access: Could not resolve host: example.com",
    );
    assert!(matches!(err.kind, ErrorKind::Network));
}

#[test]
fn constructors_set_correct_kinds() {
    assert!(matches!(AppError::not_found("x").kind, ErrorKind::NotFound));
    assert!(matches!(
        AppError::invalid_input("x").kind,
        ErrorKind::InvalidInput
    ));
    assert!(matches!(
        AppError::cancelled("x").kind,
        ErrorKind::Cancelled
    ));
    assert!(matches!(AppError::db("x").kind, ErrorKind::Database));
    assert!(matches!(AppError::git("x").kind, ErrorKind::Git));
    assert!(matches!(AppError::network("x").kind, ErrorKind::Network));
    assert!(matches!(AppError::io("x").kind, ErrorKind::Io));
    assert!(matches!(AppError::internal("x").kind, ErrorKind::Internal));
}

#[test]
fn display_shows_message() {
    let err = AppError::not_found("Skill not found");
    assert_eq!(format!("{}", err), "Skill not found");
}

#[test]
fn serializes_to_json_with_kind_and_message() {
    let err = AppError::not_found("missing");
    let json = serde_json::to_value(&err).unwrap();
    assert_eq!(json["kind"], "not_found");
    assert_eq!(json["message"], "missing");
}

#[test]
fn error_kind_serializes_snake_case() {
    let err = AppError::invalid_input("bad");
    let json = serde_json::to_value(&err).unwrap();
    assert_eq!(json["kind"], "invalid_input");
}

#[test]
fn from_io_error() {
    let io_err = std::io::Error::new(std::io::ErrorKind::NotFound, "file gone");
    let app_err: AppError = io_err.into();
    assert!(matches!(app_err.kind, ErrorKind::Io));
    assert!(app_err.message.contains("file gone"));
}
