//! Localized text for the native tray menu, shared by initial builds and refreshes.

use super::{TrayMenuData, TraySkillGroupEntry, TraySkillGroupStatus};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum TrayLanguage {
    SimplifiedChinese,
    TraditionalChinese,
    English,
}

impl TrayLanguage {
    pub(super) fn from_setting(value: Option<String>) -> Self {
        match value.as_deref() {
            Some("zh-TW") => Self::TraditionalChinese,
            Some("zh") => Self::SimplifiedChinese,
            // The tray is created before the frontend detects the OS language.
            // Start in Chinese until that choice is saved to the shared setting.
            Some("en") => Self::English,
            _ => Self::SimplifiedChinese,
        }
    }
}

pub(super) fn format_status_line(data: &TrayMenuData) -> String {
    if matches!(data.language, TrayLanguage::SimplifiedChinese) {
        return format!(
            "{} 个技能 · 已连接 {} 个 Agent",
            data.total_skills, data.coding_agent_count
        );
    }
    if matches!(data.language, TrayLanguage::TraditionalChinese) {
        return format!(
            "{} 個技能 · 已連接 {} 個 Agent",
            data.total_skills, data.coding_agent_count
        );
    }
    let skill_label = if data.total_skills == 1 {
        "skill"
    } else {
        "skills"
    };
    let agent_label = if data.coding_agent_count == 1 {
        "agent"
    } else {
        "agents"
    };
    format!(
        "{} {} · {} {} connected",
        data.total_skills, skill_label, data.coding_agent_count, agent_label
    )
}

pub(super) fn format_tooltip(data: &TrayMenuData) -> String {
    if matches!(data.language, TrayLanguage::SimplifiedChinese) {
        return if data.update_count > 0 {
            format!(
                "agent-hub · {} 个技能 · {} 个 Agent · {} 项更新",
                data.total_skills, data.coding_agent_count, data.update_count
            )
        } else {
            format!(
                "agent-hub · {} 个技能 · {} 个 Agent",
                data.total_skills, data.coding_agent_count
            )
        };
    }
    if matches!(data.language, TrayLanguage::TraditionalChinese) {
        return if data.update_count > 0 {
            format!(
                "agent-hub · {} 個技能 · {} 個 Agent · {} 項更新",
                data.total_skills, data.coding_agent_count, data.update_count
            )
        } else {
            format!(
                "agent-hub · {} 個技能 · {} 個 Agent",
                data.total_skills, data.coding_agent_count
            )
        };
    }
    if data.update_count > 0 {
        format!(
            "agent-hub · {} skills · {} agents · {} updates",
            data.total_skills, data.coding_agent_count, data.update_count
        )
    } else {
        format!(
            "agent-hub · {} skills · {} agents",
            data.total_skills, data.coding_agent_count
        )
    }
}

pub(super) fn format_updates_label(count: usize, language: TrayLanguage) -> String {
    match language {
        TrayLanguage::SimplifiedChinese => format!("{count} 个技能有更新"),
        TrayLanguage::TraditionalChinese => format!("{count} 個技能有更新"),
        TrayLanguage::English if count == 1 => "1 skill update available".to_string(),
        TrayLanguage::English => format!("{count} skill updates available"),
    }
}

pub(super) fn skill_group_menu_label(
    skill_group: &TraySkillGroupEntry,
    language: TrayLanguage,
) -> String {
    let name = match (skill_group.name.as_str(), language) {
        ("Default", TrayLanguage::SimplifiedChinese) => "默认",
        ("Default", TrayLanguage::TraditionalChinese) => "預設",
        (name, _) => name,
    };
    if matches!(language, TrayLanguage::SimplifiedChinese) {
        return match skill_group.status() {
            TraySkillGroupStatus::Active => {
                format!("✓ {} ({} 个技能)", name, skill_group.skill_count)
            }
            TraySkillGroupStatus::Partial => format!(
                "{} ({} / {} 已同步)",
                name, skill_group.synced_pairs, skill_group.total_pairs
            ),
            _ => format!("{} ({} 个技能)", name, skill_group.skill_count),
        };
    }
    if matches!(language, TrayLanguage::TraditionalChinese) {
        return match skill_group.status() {
            TraySkillGroupStatus::Active => {
                format!("✓ {} ({} 個技能)", name, skill_group.skill_count)
            }
            TraySkillGroupStatus::Partial => format!(
                "{} ({} / {} 已同步)",
                name, skill_group.synced_pairs, skill_group.total_pairs
            ),
            _ => format!("{} ({} 個技能)", name, skill_group.skill_count),
        };
    }
    let unit = if skill_group.skill_count == 1 {
        "skill"
    } else {
        "skills"
    };
    match skill_group.status() {
        TraySkillGroupStatus::Active => format!("✓ {} ({} {unit})", name, skill_group.skill_count),
        TraySkillGroupStatus::Partial => format!(
            "{} ({}/{} synced)",
            name, skill_group.synced_pairs, skill_group.total_pairs
        ),
        _ => format!("{} ({} {unit})", name, skill_group.skill_count),
    }
}

#[cfg(test)]
mod tray_menu_text_tests;
