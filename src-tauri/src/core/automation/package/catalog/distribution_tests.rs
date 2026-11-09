use super::*;
#[test]
fn repository_automations_are_real_independent_installable_packages() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../automations");
    let result = scan(&root, "fixture-commit".into()).unwrap();
    assert!(
        result.issues.is_empty(),
        "{:?}",
        result
            .issues
            .iter()
            .map(|i| (&i.path, &i.message))
            .collect::<Vec<_>>()
    );
    assert_eq!(result.packages.len(), 10);
    let shared = std::fs::read_to_string(root.join("_shared/agent-entry.py")).unwrap();
    for entry in result.packages {
        assert!(!entry.package.draft.enabled);
        assert!(entry.package.draft.workdir.is_none());
        assert!(entry.package.draft.script_dir.is_none());
        if entry
            .package
            .draft
            .files
            .iter()
            .any(|f| f.path == "config/agent.json")
        {
            let agent = entry
                .package
                .draft
                .files
                .iter()
                .find(|f| f.path == "scripts/agent.py" || f.path == "scripts/agent-code-review.py")
                .unwrap();
            assert_eq!(
                agent.content, shared,
                "shared adapter must match for {}",
                entry.path
            );
        }
    }
}
