use super::*;
use serde_json::json;
fn resolve(value: &Value, label: &str) -> (String, Option<String>) {
    let presentation = Resolver::new("en").resolve(value, label);
    (presentation.name, presentation.bundle_id)
}

fn application(root: &Path, directory: &str, name: &str, id: &str) -> std::path::PathBuf {
    let contents = root.join(directory).join("Contents");
    std::fs::create_dir_all(contents.join("Resources")).unwrap();
    let mut metadata = plist::Dictionary::new();
    metadata.insert("CFBundleDisplayName".into(), name.into());
    metadata.insert("CFBundleIdentifier".into(), id.into());
    plist::Value::Dictionary(metadata)
        .to_file_xml(contents.join("Info.plist"))
        .unwrap();
    contents
}

#[test]
fn selects_localized_names_and_the_containing_app_instead_of_its_helper() {
    let temporary = tempfile::tempdir().unwrap();
    let contents = application(
        temporary.path(),
        "Demo.app",
        "Demo Input",
        "org.example.demo",
    );
    let localized = contents.join("Resources/zh-Hans.lproj");
    std::fs::create_dir_all(&localized).unwrap();
    let mut names = plist::Dictionary::new();
    names.insert("CFBundleDisplayName".into(), "示例输入法".into());
    plist::Value::Dictionary(names)
        .to_file_xml(localized.join("InfoPlist.strings"))
        .unwrap();
    let helper = application(
        &contents.join("Helpers"),
        "Helper.app",
        "TechnicalHelper",
        "org.example.demo.helper",
    );
    let value = json!({"Program":helper.join("MacOS/helper")});
    assert_eq!(
        Resolver::new("zh")
            .resolve(&value, "org.example.helper")
            .name,
        "示例输入法"
    );
    let english = Resolver::new("en").resolve(&value, "org.example.helper");
    assert_eq!(english.name, "Demo Input");
    assert_eq!(english.bundle_id.as_deref(), Some("org.example.demo"));
}

#[cfg(target_os = "macos")]
#[test]
fn reads_utf16_strings_without_rewriting_localizations() {
    let temporary = tempfile::tempdir().unwrap();
    let contents = application(
        temporary.path(),
        "Demo.app",
        "Demo Input",
        "org.example.demo",
    );
    let localized = contents.join("Resources/zh-Hans.lproj");
    std::fs::create_dir_all(&localized).unwrap();
    let path = localized.join("InfoPlist.strings");
    let mut bytes = vec![0xff, 0xfe];
    bytes.extend(
        "\"CFBundleDisplayName\" = \"示例输入法\";"
            .encode_utf16()
            .flat_map(u16::to_le_bytes),
    );
    std::fs::write(&path, &bytes).unwrap();
    let task = Resolver::new("zh").resolve(
        &json!({"Program":contents.join("MacOS/input")}),
        "org.example.demo",
    );
    assert_eq!(task.name, "示例输入法");
    assert_eq!(std::fs::read(path).unwrap(), bytes);
}
#[test]
fn prefers_explicit_names_and_scripts_and_humanizes_unknown_labels() {
    assert_eq!(localization_candidates("../../en"), vec!["en", "English"]);
    assert_eq!(
        resolve(
            &json!({"ProgramArguments":["~/scripts/start.sh"]}),
            "org.example.project.audit"
        )
        .0,
        "Project · Audit"
    );
    assert_eq!(
        resolve(&json!({"Comment":"Repository audit"}), "org.example.audit").0,
        "Repository audit"
    );
    assert_eq!(
        resolve(
            &json!({"ProgramArguments":["/bin/bash","~/scripts/network-reset.sh"]}),
            "org.example.reset"
        )
        .0,
        "Network Reset"
    );
    assert_eq!(
        resolve(&json!({}), "com.example.DemoUpdater.wake").0,
        "Demo Updater · Wake"
    );
    assert_eq!(
        resolve(&json!({}), "org.example.scheduled-tasks.network-reset").0,
        "Scheduled Tasks · Network Reset"
    );
    assert_eq!(
        resolve(&json!({}), "Repository audit").0,
        "Repository Audit"
    );
}
#[test]
fn reads_the_programs_actual_application_name_and_bundle_id() {
    let temporary = tempfile::tempdir().unwrap();
    let contents = temporary.path().join("Demo.app/Contents");
    std::fs::create_dir_all(&contents).unwrap();
    let mut metadata = plist::Dictionary::new();
    metadata.insert("CFBundleDisplayName".into(), "Demo Application".into());
    metadata.insert("CFBundleIdentifier".into(), "org.example.demo".into());
    plist::Value::Dictionary(metadata)
        .to_file_xml(contents.join("Info.plist"))
        .unwrap();
    let program = contents.join("MacOS/demo");
    let (name, id) = resolve(
        &json!({"ProgramArguments":[program]}),
        "org.example.demo.wake",
    );
    assert_eq!(name, "Demo Application");
    assert_eq!(id.as_deref(), Some("org.example.demo"));
    assert_eq!(
        resolve(
            &json!({"ProgramArguments":["/unavailable/Demo.app/Contents/MacOS/demo"]}),
            "org.example.DemoUpdater.wake"
        )
        .1,
        None
    );
}
