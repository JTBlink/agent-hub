use super::*;
use std::fs;

const SKILL: &str = ".agents/skills/demo";

fn project(ignore_rules: &str, paths: &[&str]) -> tempfile::TempDir {
    let directory = tempfile::tempdir().unwrap();
    git2::Repository::init(directory.path()).unwrap();
    fs::write(directory.path().join(".gitignore"), ignore_rules).unwrap();
    for path in paths {
        let file = directory.path().join(SKILL).join(path);
        fs::create_dir_all(file.parent().unwrap()).unwrap();
        fs::write(file, "fixture").unwrap();
    }
    directory
}

fn report(directory: &tempfile::TempDir) -> Vec<String> {
    // Match status(), which canonicalizes the project root before Git
    // diagnostics (macOS temporary paths can have a symlinked ancestor).
    ignored_paths(&directory.path().canonicalize().unwrap(), &[SKILL.into()])
}

#[test]
fn ignored_caches_and_local_environment_files_need_no_delivery_warning() {
    let directory = project(
        "__pycache__/\n*.pyc\n.DS_Store\nThumbs.db\n.env*\n*.env\n",
        &[
            "SKILL.md",
            "scripts/__pycache__/run.cpython-311.pyc",
            "scripts/__pycache__/metadata.json",
            "scripts/stray.pyc",
            ".DS_Store",
            "Thumbs.db",
            ".env",
            ".env.local",
            ".env.production",
            "config/wechat.env",
        ],
    );
    assert!(report(&directory).is_empty());
}

#[test]
fn ignored_scripts_resources_and_environment_templates_still_warn() {
    let paths = [
        "scripts/run.sh",
        "scripts/extension.pyd",
        "resources/reference.md",
        ".env.example",
        ".env.sample",
        ".env.template",
        "config/wechat.env.example",
        "config/example.env",
        "config/sample.env",
        "config/template.env",
    ];
    let directory = project(
        "*.sh\n*.pyd\nreference.md\n.env*\n*.example\n*.env\n",
        &paths,
    );
    let expected: BTreeSet<_> = paths.iter().map(|path| format!("{SKILL}/{path}")).collect();
    assert_eq!(
        report(&directory).into_iter().collect::<BTreeSet<_>>(),
        expected
    );
}

#[test]
fn ignored_parent_with_only_local_additions_does_not_warn() {
    let directory = project(
        ".agents/\n",
        &[
            "SKILL.md",
            "scripts/__pycache__/run.pyc",
            "config/wechat.env",
        ],
    );
    let repo = git2::Repository::open(directory.path()).unwrap();
    let mut index = repo.index().unwrap();
    index
        .add_path(Path::new(&format!("{SKILL}/SKILL.md")))
        .unwrap();
    index.write().unwrap();
    assert!(report(&directory).is_empty());

    fs::write(
        directory.path().join(SKILL).join("scripts/run.py"),
        "fixture",
    )
    .unwrap();
    assert_eq!(report(&directory), [SKILL]);
}
