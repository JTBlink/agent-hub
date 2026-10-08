//! Failure decisions shared by manual and background backup operations.

pub(crate) fn is_authentication_error(message: &str) -> bool {
    let message = message.to_ascii_lowercase();
    [
        "authentication failed",
        "authentication attempts exhausted",
        "invalid username or token",
        "could not read username",
        "could not read password",
        "unable to get password from user",
        "permission denied (publickey",
        "no credentials available",
        "returned error: 401",
        "returned error: 403",
    ]
    .iter()
    .any(|marker| message.contains(marker))
}

/// Only an absent branch on a new remote permits an initial push after fetch
/// fails. Authentication, connectivity, and repository errors must propagate.
pub(crate) fn is_missing_remote_branch(message: &str) -> bool {
    let message = message.to_ascii_lowercase();
    !is_authentication_error(&message)
        && (message.contains("couldn't find remote ref")
            || message.contains("could not find remote branch"))
}

pub(crate) fn is_push_race(message: &str) -> bool {
    let message = message.to_ascii_lowercase();
    !is_authentication_error(&message)
        && (message.contains("non-fast-forward") || message.contains("fetch first"))
}

#[cfg(test)]
mod tests {
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
}
