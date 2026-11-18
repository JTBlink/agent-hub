//! Summarize backup scopes without exposing opaque metadata IDs.
const AUTO_COMMIT_MAX_NAMES: usize = 5;

pub(crate) fn build_auto_commit_message(porcelain: &str) -> String {
    let mut skills = std::collections::BTreeSet::new();
    let mut automations = std::collections::BTreeSet::new();
    let mut has_metadata = false;
    let mut configuration = std::collections::BTreeSet::new();
    let mut metadata = std::collections::BTreeSet::new();
    let mut configuration_marker = false;
    for line in porcelain.lines() {
        let entry = line.get(3..).unwrap_or("").trim();
        if entry.is_empty() {
            continue;
        }
        let path = entry
            .split(" -> ")
            .last()
            .unwrap_or(entry)
            .trim_matches('"');
        if let Some(rest) = path.strip_prefix("skills/") {
            if let Some((name, _)) = rest.split_once('/') {
                if !name.starts_with('.') {
                    skills.insert(name.to_string());
                    continue;
                }
            }
        }
        if let Some(rest) = path.strip_prefix("automations/") {
            if let Some((name, _)) = rest.split_once('/') {
                if !name.starts_with('.') {
                    automations.insert(name.to_string());
                    continue;
                }
            }
        }
        if let Some(rest) = path.strip_prefix("user-config/") {
            if rest == "schema.json" {
                configuration_marker = true;
            } else {
                let section = rest.split('/').next().unwrap_or(rest);
                let section = section.strip_suffix(".json").unwrap_or(section);
                configuration.insert(format!("user-config/{section}"));
            }
            continue;
        }
        if let Some(rest) = path.strip_prefix(".agent-hub/") {
            let section = match rest.split('/').next().unwrap_or(rest) {
                "skills" => Some("metadata/skills"),
                "scenarios" => Some("metadata/skill-groups"),
                "scenario-skills" => Some("metadata/group-memberships"),
                "schema.json" => Some("metadata/sync-schema"),
                _ => None,
            };
            if let Some(section) = section {
                metadata.insert(section.to_string());
                continue;
            }
        }
        has_metadata = true;
    }
    if skills.is_empty()
        && automations.is_empty()
        && !has_metadata
        && configuration.is_empty()
        && metadata.is_empty()
        && !configuration_marker
    {
        return "auto backup".to_string();
    }
    let mut parts: Vec<String> = skills.into_iter().collect();
    parts.extend(
        automations
            .into_iter()
            .map(|name| format!("automation/{name}")),
    );
    if configuration_marker && configuration.is_empty() {
        configuration.insert("user-config/sync-schema".into());
    }
    parts.extend(configuration);
    parts.extend(metadata);
    let overflow = if parts.len() > AUTO_COMMIT_MAX_NAMES {
        let n = parts.len() - AUTO_COMMIT_MAX_NAMES;
        parts.truncate(AUTO_COMMIT_MAX_NAMES);
        Some(n)
    } else {
        None
    };
    if has_metadata {
        parts.push("metadata".into());
    }
    let mut msg = format!("auto backup: {}", parts.join(", "));
    if let Some(n) = overflow {
        msg.push_str(&format!(" (+{n} more)"));
    }
    msg
}

#[cfg(test)]
mod tests;
