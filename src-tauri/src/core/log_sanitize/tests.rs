use super::*;

#[test]
fn redacts_email_and_token() {
    let s = sanitize("user alice@example.com pushed with token ghp_ABCDEFGHIJKLMNOPQRST");
    assert!(s.contains("<email>"));
    assert!(s.contains("<token>"));
}

#[test]
fn redacts_git_credentials() {
    let s = sanitize("clone https://alice:pat_xyz@github.com/foo/bar.git");
    assert!(s.contains("<redacted>"));
    assert!(s.contains("github.com/foo/bar.git"));
}

#[test]
fn replaces_generic_users_path() {
    let s = sanitize("opened /Users/somebody/Documents/x.txt");
    assert!(s.starts_with("opened ~/Documents"));
}
