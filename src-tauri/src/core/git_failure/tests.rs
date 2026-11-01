use super::*;
#[test]
fn only_missing_branch_allows_initial_push() {
    assert!(is_missing_remote_branch(
        "fatal: couldn't find remote ref main"
    ));
    for error in [
        "Authentication failed",
        "Could not resolve host",
        "Repository not found",
        "cannot open FETCH_HEAD: Permission denied",
    ] {
        assert!(!is_missing_remote_branch(error));
    }
    assert!(!is_authentication_error(
        "cannot open FETCH_HEAD: Permission denied"
    ));
    assert!(is_authentication_error("Permission denied (publickey)."));
    assert!(is_push_race("[rejected] main -> main (fetch first)"));
    assert!(!is_push_race(
        "Authentication failed; failed to push some refs"
    ));
    assert!(!is_push_race(
        "returned error: 403; failed to push some refs"
    ));
    assert!(!is_push_race(
        "[remote rejected] protected branch; failed to push some refs"
    ));
}
