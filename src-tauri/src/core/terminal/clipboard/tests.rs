use super::*;

#[test]
fn no_files_produces_no_input_and_control_characters_are_rejected() {
    assert_eq!(file_input(&[]).unwrap(), None);
    assert!(file_input(&[PathBuf::from("/tmp/file\ncommand")]).is_err());
}

#[cfg(not(windows))]
#[test]
fn quotes_multiple_unicode_paths_as_literal_shell_arguments_without_enter() {
    let paths = vec![
        PathBuf::from("/tmp/示例 file.txt"),
        PathBuf::from("/tmp/it's $(echo unsafe).txt"),
    ];
    let input = file_input(&paths).unwrap().unwrap();
    assert_eq!(
        shell_words::split(&input).unwrap(),
        vec!["/tmp/示例 file.txt", "/tmp/it's $(echo unsafe).txt"]
    );
    assert!(!input.contains(['\r', '\n']));
}

#[cfg(windows)]
#[test]
fn quotes_windows_paths_and_rejects_shell_expansion() {
    assert_eq!(
        file_input(&[PathBuf::from(r"C:\example files\demo.txt")]).unwrap(),
        Some(r#""C:\example files\demo.txt""#.into())
    );
    assert!(file_input(&[PathBuf::from(r"C:\%TEMP%\demo.txt")]).is_err());
}
