use super::*;
fn options(query: &str) -> SearchOptions {
    SearchOptions {
        query: query.into(),
        case_sensitive: false,
        whole_word: false,
        regex: false,
        include: String::new(),
        exclude: String::new(),
        use_ignore: true,
    }
}
#[test]
fn searches_utf16_columns_and_filters_in_one_checkout() {
    let temp = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(temp.path().join("src")).unwrap();
    std::fs::write(
        temp.path().join("src/demo.rs"),
        "😀 Hello hello\r\nworld HELLO\n",
    )
    .unwrap();
    std::fs::write(temp.path().join("ignored.rs"), "hello").unwrap();
    let mut query = options("hello");
    query.include = "src/**".into();
    let found = search(temp.path(), &query).unwrap();
    assert_eq!(found.count, 3);
    assert_eq!(found.files.len(), 1);
    assert_eq!(found.files[0].matches[0].column, 4);
    assert_eq!(found.files[0].matches[2].line, 2);
    query.case_sensitive = true;
    assert_eq!(search(temp.path(), &query).unwrap().count, 1);
    query.exclude = "*.rs".into();
    assert_eq!(search(temp.path(), &query).unwrap().count, 0);
}
#[test]
fn honors_ignore_rules_binary_limits_and_regex_modes() {
    let temp = tempfile::tempdir().unwrap();
    git2::Repository::init(temp.path()).unwrap();
    std::fs::write(temp.path().join(".gitignore"), "ignored.txt\n").unwrap();
    std::fs::write(temp.path().join("ignored.txt"), "foo").unwrap();
    std::fs::write(temp.path().join("demo.txt"), "foo foobar FOO 42\n").unwrap();
    std::fs::write(temp.path().join("binary"), b"foo\0").unwrap();
    let mut query = options("foo");
    query.whole_word = true;
    assert_eq!(search(temp.path(), &query).unwrap().count, 2);
    query.use_ignore = false;
    assert_eq!(search(temp.path(), &query).unwrap().count, 3);
    query.query = "[0-9]+".into();
    query.regex = true;
    assert_eq!(search(temp.path(), &query).unwrap().count, 1);
    query.query = "[".into();
    assert!(search(temp.path(), &query).is_err());
}
#[test]
fn bounds_results_and_handles_zero_width_patterns() {
    let (found, truncated) = find_matches("a\na\na\n", &Regex::new("(?m)^").unwrap(), 2);
    assert_eq!(found.len(), 2);
    assert!(truncated);
    assert_eq!(found[1].line, 2);
}
#[test]
fn replacements_preserve_line_endings_and_refuse_stale_content() {
    let temp = tempfile::tempdir().unwrap();
    std::fs::write(temp.path().join("demo.txt"), "hello\r\nhello\r\n").unwrap();
    let query = options("hello");
    let found = search(temp.path(), &query).unwrap();
    assert_eq!(
        replace(temp.path(), &query, "$literal", &found.files)
            .unwrap()
            .replaced,
        2
    );
    assert_eq!(
        std::fs::read_to_string(temp.path().join("demo.txt")).unwrap(),
        "$literal\r\n$literal\r\n"
    );
    let stale = replace(temp.path(), &query, "bad", &found.files).unwrap();
    assert_eq!(stale.files, 0);
    assert_eq!(stale.errors.len(), 1);
    let mut query = options(r"(\$)(literal)");
    query.regex = true;
    let found = search(temp.path(), &query).unwrap();
    assert_eq!(
        replace(temp.path(), &query, "$2", &found.files)
            .unwrap()
            .replaced,
        2
    );
}
#[test]
fn bounds_long_previews_result_counts_and_replacement_growth() {
    let content = format!("{}needle{}", "😀".repeat(1000), "😀".repeat(1000));
    let (matches, _) = find_matches(&content, &Regex::new("needle").unwrap(), 1000);
    assert!(matches[0].preview.len() < 500);
    assert!(matches[0].preview.contains("needle"));
    assert_eq!(matches[0].column, 2001);
    let temp = tempfile::tempdir().unwrap();
    std::fs::write(temp.path().join("many.txt"), "needle\n".repeat(1002)).unwrap();
    let found = search(temp.path(), &options("needle")).unwrap();
    assert_eq!(found.count, 1000);
    assert!(found.truncated);
    assert!(replacement_content(
        &"a".repeat(1000),
        &Regex::new("a").unwrap(),
        &"b".repeat(2048),
        false
    )
    .is_err());
}

#[cfg(unix)]
#[test]
fn never_follows_links_outside_the_checkout() {
    let root = tempfile::tempdir().unwrap();
    let outside = tempfile::tempdir().unwrap();
    std::fs::write(outside.path().join("secret"), "needle").unwrap();
    std::os::unix::fs::symlink(outside.path(), root.path().join("link")).unwrap();
    std::os::unix::fs::symlink(outside.path().join("secret"), root.path().join("file")).unwrap();
    assert_eq!(search(root.path(), &options("needle")).unwrap().count, 0);
}
