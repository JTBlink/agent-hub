//! Detect Agent state without treating skill installers' directory scaffolding
//! as evidence of an installed Agent.
use std::path::Path;

pub(super) fn has_agent_state(detect_dir: &Path, skills_dir: &Path) -> bool {
    let Ok(entries) = std::fs::read_dir(detect_dir) else {
        return false;
    };
    let skill_component = skills_dir
        .strip_prefix(detect_dir)
        .ok()
        .and_then(|relative| relative.components().next())
        .map(|component| component.as_os_str());
    if detect_dir == skills_dir {
        return false;
    }
    entries.flatten().any(|entry| {
        let name = entry.file_name();
        if name == ".DS_Store" || name == ".gitkeep" {
            return false;
        }
        if Some(name.as_os_str()) == skill_component {
            // Nested roots such as agent/skills may also contain agent state.
            return entry.path() != skills_dir && has_agent_state(&entry.path(), skills_dir);
        }
        true
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn missing_or_skills_only_directory_does_not_imply_installed_agent() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().join("agent");
        let skills = root.join("skills");
        assert!(!has_agent_state(&root, &skills));
        fs::create_dir_all(skills.join("demo")).unwrap();
        fs::write(skills.join("demo/SKILL.md"), "# Demo").unwrap();
        fs::write(root.join(".DS_Store"), "metadata").unwrap();
        assert!(!has_agent_state(&root, &skills));
        fs::write(root.join("config.json"), "{}").unwrap();
        assert!(has_agent_state(&root, &skills));
    }

    #[test]
    fn nested_skill_scaffolding_requires_separate_agent_state() {
        let tmp = tempfile::tempdir().unwrap();
        let skills = tmp.path().join("agent/skills");
        fs::create_dir_all(&skills).unwrap();
        assert!(!has_agent_state(tmp.path(), &skills));
        fs::write(tmp.path().join("agent/settings.json"), "{}").unwrap();
        assert!(has_agent_state(tmp.path(), &skills));
    }
}
