//! Display names are independent of the launchd label used for runtime lookup.
use serde_json::Value;
use std::path::Path;

#[derive(Clone)]
struct ApplicationIdentity {
    name: String,
    bundle_id: Option<String>,
    icon_path: Option<std::path::PathBuf>,
}

pub(super) struct Presentation {
    pub name: String,
    pub bundle_id: Option<String>,
    pub icon: Option<String>,
}

pub(super) struct Resolver {
    locale: String,
    applications: std::collections::HashMap<std::path::PathBuf, Option<ApplicationIdentity>>,
    icons: std::collections::HashMap<std::path::PathBuf, Option<String>>,
}

impl Resolver {
    pub(super) fn new(locale: &str) -> Self {
        Self {
            locale: locale.into(),
            applications: Default::default(),
            icons: Default::default(),
        }
    }

    pub(super) fn resolve(&mut self, value: &Value, label: &str) -> Presentation {
        let arguments: Vec<_> = value["ProgramArguments"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(Value::as_str)
            .collect();
        let application = value["Program"]
            .as_str()
            .into_iter()
            .chain(arguments.iter().copied())
            .find_map(|program| self.application_identity(program));
        let bundle_id = application.as_ref().and_then(|app| app.bundle_id.clone());
        let icon = application
            .as_ref()
            .and_then(|app| app.icon_path.as_ref())
            .and_then(|path| {
                self.icons
                    .entry(path.clone())
                    .or_insert_with(|| super::app_icons::data_url(path))
                    .clone()
            });
        let name = value["Comment"]
            .as_str()
            .map(str::trim)
            .filter(|text| !text.is_empty())
            .map(str::to_owned)
            .or_else(|| application.map(|app| app.name))
            .or_else(|| {
                value["Program"]
                    .as_str()
                    .into_iter()
                    .chain(arguments.iter().copied())
                    .find_map(script_name)
            })
            .unwrap_or_else(|| label_name(label));
        Presentation {
            name,
            bundle_id,
            icon,
        }
    }

    fn application_identity(&mut self, program: &str) -> Option<ApplicationIdentity> {
        let path = Path::new(program);
        if !path.is_absolute() {
            return None;
        }
        let bundles: Vec<_> = path
            .ancestors()
            .filter(|path| {
                path.extension()
                    .and_then(|ext| ext.to_str())
                    .is_some_and(|ext| ext.eq_ignore_ascii_case("app"))
            })
            .collect();
        // Prefer the containing user-facing app over a nested helper app.
        bundles.into_iter().rev().find_map(|bundle| {
            self.applications
                .entry(bundle.to_path_buf())
                .or_insert_with(|| read_application(bundle, &self.locale))
                .clone()
        })
    }
}

fn read_application(bundle: &Path, locale: &str) -> Option<ApplicationIdentity> {
    let metadata = plist::Value::from_file(bundle.join("Contents/Info.plist")).ok()?;
    let base = metadata.as_dictionary()?;
    let resources = bundle.join("Contents/Resources");
    let localized = localization_candidates(locale)
        .into_iter()
        .find_map(|language| {
            read_localization(&resources.join(format!("{language}.lproj/InfoPlist.strings")))
        });
    let text = |dictionary: &plist::Dictionary, key: &str| {
        dictionary
            .get(key)
            .and_then(plist::Value::as_string)
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_owned)
    };
    let display_name = |dictionary: &plist::Dictionary| {
        text(dictionary, "CFBundleDisplayName").or_else(|| text(dictionary, "CFBundleName"))
    };
    let name = localized
        .as_ref()
        .and_then(display_name)
        .or_else(|| display_name(base))
        .filter(|name| !name.starts_with('«') && !name.starts_with("$("))
        .or_else(|| bundle.file_stem()?.to_str().map(str::to_owned))?;
    let icon_path = text(base, "CFBundleIconFile").and_then(|file| {
        // CFBundleIconFile is a resource filename, not an arbitrary filesystem path.
        if Path::new(&file).file_name()? != std::ffi::OsStr::new(&file) {
            return None;
        }
        let path = resources.join(&file);
        if path.is_file() {
            return Some(path);
        }
        if path.extension().is_none() {
            for extension in ["icns", "png"] {
                let candidate = path.with_extension(extension);
                if candidate.is_file() {
                    return Some(candidate);
                }
            }
        }
        None
    });
    Some(ApplicationIdentity {
        name,
        bundle_id: text(base, "CFBundleIdentifier"),
        icon_path,
    })
}

fn localization_candidates(locale: &str) -> Vec<String> {
    // Locale is an IPC input and will become a resource directory component.
    if locale.is_empty()
        || locale.len() > 35
        || !locale
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_')
    {
        return vec!["en".into(), "English".into()];
    }
    let normalized = locale.replace('_', "-").to_ascii_lowercase();
    if normalized.starts_with("zh") {
        return if normalized.contains("hant")
            || normalized.ends_with("tw")
            || normalized.ends_with("hk")
        {
            ["zh-Hant", "zh_TW", "zh-TW", "zh", "en", "English"]
        } else {
            ["zh-Hans", "zh_CN", "zh-CN", "zh", "en", "English"]
        }
        .map(str::to_owned)
        .to_vec();
    }
    let language = normalized.split('-').next().unwrap_or("en");
    vec![
        locale.into(),
        locale.replace('-', "_"),
        language.into(),
        "en".into(),
        "English".into(),
    ]
}

fn read_localization(path: &Path) -> Option<plist::Dictionary> {
    if !path.is_file() {
        return None;
    }
    if let Ok(value) = plist::Value::from_file(path) {
        return value.into_dictionary();
    }
    // Many InfoPlist.strings files use UTF-16/OpenStep syntax. plutil converts to
    // stdout only; it never rewrites the application's localization resource.
    #[cfg(target_os = "macos")]
    {
        let xml = super::process::read_command(
            "/usr/bin/plutil",
            &["-convert", "xml1", "-o", "-", path.to_str()?],
        )
        .ok()?;
        plist::Value::from_reader_xml(std::io::Cursor::new(xml.as_bytes()))
            .ok()?
            .into_dictionary()
    }
    #[cfg(not(target_os = "macos"))]
    None
}

fn script_name(argument: &str) -> Option<String> {
    let path = Path::new(argument);
    let extension = path.extension()?.to_str()?.to_ascii_lowercase();
    if ![
        "sh", "bash", "zsh", "py", "rb", "pl", "js", "mjs", "cjs", "ps1",
    ]
    .contains(&extension.as_str())
    {
        return None;
    }
    let stem = path.file_stem()?.to_str()?;
    // Generic entrypoint names lose the useful project/action in the job label.
    if [
        "start",
        "run",
        "main",
        "index",
        "entrypoint",
        "launch",
        "task",
    ]
    .contains(&stem.to_ascii_lowercase().as_str())
    {
        return None;
    }
    Some(humanize(stem))
}

fn label_name(label: &str) -> String {
    let parts: Vec<_> = label.split('.').collect();
    let meaningful =
        if parts.len() > 2 && ["com", "org", "net", "io", "dev", "app"].contains(&parts[0]) {
            &parts[2..]
        } else {
            &parts[..]
        };
    meaningful
        .iter()
        .map(|part| humanize(part))
        .collect::<Vec<_>>()
        .join(" · ")
}

fn humanize(text: &str) -> String {
    let chars: Vec<_> = text.chars().collect();
    let mut spaced = String::new();
    for (index, &ch) in chars.iter().enumerate() {
        if ['-', '_'].contains(&ch) {
            spaced.push(' ');
            continue;
        }
        if index > 0
            && ch.is_uppercase()
            && (chars[index - 1].is_lowercase()
                || chars[index - 1].is_ascii_digit()
                || (chars[index - 1].is_uppercase()
                    && chars.get(index + 1).is_some_and(|c| c.is_lowercase())))
        {
            spaced.push(' ');
        }
        spaced.push(ch);
    }
    spaced
        .split_whitespace()
        .map(|word| {
            let mut chars = word.chars();
            chars
                .next()
                .map(|first| first.to_uppercase().collect::<String>() + chars.as_str())
                .unwrap_or_default()
        })
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(test)]
mod tests {
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
}
