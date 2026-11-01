use super::*;

#[test]
fn captures_auth_status_on_stderr_without_polluting_api_json() {
    let args = [
        "-c",
        "printf '{\"login\":\"demo\"}'; printf 'Logged in to github.example.invalid' >&2",
    ];
    let (stdout, stderr) = capture("sh", &args, &[], 5, None, None).unwrap();
    assert_eq!(stdout, "{\"login\":\"demo\"}");
    assert_eq!(stderr, "Logged in to github.example.invalid");
    assert_eq!(run("sh", &args, &[], 5, None, None).unwrap(), stdout);
}
