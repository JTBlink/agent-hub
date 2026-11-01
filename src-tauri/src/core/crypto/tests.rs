use super::*;

fn test_key() -> [u8; 32] {
    [0x42u8; 32]
}

#[test]
fn round_trip() {
    let key = test_key();
    let plaintext = "https://ghp_secret@github.com/user/repo.git";
    let encrypted = encrypt(&key, plaintext).unwrap();
    assert!(is_encrypted(&encrypted));
    assert_ne!(encrypted, plaintext);
    let decrypted = decrypt(&key, &encrypted).unwrap();
    assert_eq!(decrypted, plaintext);
}

#[test]
fn different_nonces_each_time() {
    let key = test_key();
    let a = encrypt(&key, "same").unwrap();
    let b = encrypt(&key, "same").unwrap();
    // Nonces are random, so ciphertexts must differ even for the same plaintext.
    assert_ne!(a, b);
}

#[test]
fn wrong_key_fails() {
    let key_a = test_key();
    let key_b = [0x99u8; 32];
    let encrypted = encrypt(&key_a, "secret").unwrap();
    assert!(decrypt(&key_b, &encrypted).is_err());
}

#[test]
fn is_encrypted_detects_prefix() {
    assert!(is_encrypted("enc:v1:deadbeef"));
    assert!(!is_encrypted("https://user:pass@host"));
    assert!(!is_encrypted(""));
}

#[test]
fn load_or_create_key_creates_and_reloads() {
    let tmp = tempfile::tempdir().unwrap();
    let path = tmp.path().join(".secret.key");

    let key1 = load_or_create_key(&path).unwrap();
    assert!(path.exists());

    let key2 = load_or_create_key(&path).unwrap();
    assert_eq!(key1, key2);
}

#[test]
fn corrupted_key_file_returns_error() {
    let tmp = tempfile::tempdir().unwrap();
    let path = tmp.path().join(".secret.key");
    // Write a file with wrong length.
    std::fs::write(&path, b"too-short").unwrap();
    let err = load_or_create_key(&path).unwrap_err();
    assert!(err.to_string().contains("corrupted"));
}

#[cfg(unix)]
#[test]
fn key_file_has_owner_only_permissions() {
    use std::os::unix::fs::PermissionsExt;
    let tmp = tempfile::tempdir().unwrap();
    let path = tmp.path().join(".secret.key");
    load_or_create_key(&path).unwrap();
    let mode = std::fs::metadata(&path).unwrap().permissions().mode();
    assert_eq!(mode & 0o777, 0o600);
}
