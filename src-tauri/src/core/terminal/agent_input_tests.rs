use super::prompt_bytes;
#[test]
fn pastes_multiline_prompt_as_one_submission() {
    assert_eq!(
        prompt_bytes("first\nsecond").unwrap(),
        b"\x1b[200~first\nsecond\x1b[201~\r"
    );
    assert_eq!(
        prompt_bytes("first\r\nsecond").unwrap(),
        prompt_bytes("first\nsecond").unwrap()
    );
}
#[test]
fn rejects_escape_injection_and_oversized_prompt() {
    for value in ["", "\x1b[201~command\r", "\0", "\x7f"] {
        assert!(prompt_bytes(value).is_err());
    }
    assert!(prompt_bytes(&"中".repeat(11_000)).is_err());
}
