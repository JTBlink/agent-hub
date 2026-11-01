use super::*;

#[test]
fn default_group_name_follows_tray_language_without_renaming() {
    let group = TraySkillGroupEntry {
        id: "default-group".into(),
        name: "Default".into(),
        skill_count: 2,
        synced_pairs: 2,
        total_pairs: 2,
    };
    assert_eq!(
        skill_group_menu_label(&group, TrayLanguage::SimplifiedChinese),
        "✓ 默认 (2 个技能)"
    );
    assert_eq!(
        skill_group_menu_label(&group, TrayLanguage::TraditionalChinese),
        "✓ 預設 (2 個技能)"
    );
    assert_eq!(
        skill_group_menu_label(&group, TrayLanguage::English),
        "✓ Default (2 skills)"
    );
    assert_eq!(group.name, "Default");
}

#[test]
fn tray_language_defaults_to_chinese_before_frontend_saves_locale() {
    assert_eq!(
        TrayLanguage::from_setting(None),
        TrayLanguage::SimplifiedChinese
    );
    assert_eq!(
        TrayLanguage::from_setting(Some("zh-TW".into())),
        TrayLanguage::TraditionalChinese
    );
    assert_eq!(
        TrayLanguage::from_setting(Some("en".into())),
        TrayLanguage::English
    );
}

#[test]
fn skill_update_menu_item_follows_selected_language() {
    assert_eq!(
        format_updates_label(2, TrayLanguage::SimplifiedChinese),
        "2 个技能有更新"
    );
    assert_eq!(
        format_updates_label(2, TrayLanguage::TraditionalChinese),
        "2 個技能有更新"
    );
    assert_eq!(
        format_updates_label(1, TrayLanguage::English),
        "1 skill update available"
    );
}

#[test]
fn chinese_tray_counts_and_partial_group_use_chinese_text() {
    let group = TraySkillGroupEntry {
        id: "group-demo".into(),
        name: "日常开发".into(),
        skill_count: 2,
        synced_pairs: 1,
        total_pairs: 2,
    };
    let data = TrayMenuData {
        language: TrayLanguage::SimplifiedChinese,
        total_skills: 2,
        coding_agent_count: 1,
        update_count: 1,
        skill_groups: vec![group.clone()],
        check_updates_running: false,
    };
    assert_eq!(format_status_line(&data), "2 个技能 · 已连接 1 个 Agent");
    assert_eq!(
        format_tooltip(&data),
        "agent-hub · 2 个技能 · 1 个 Agent · 1 项更新"
    );
    assert_eq!(
        skill_group_menu_label(&group, data.language),
        "日常开发 (1 / 2 已同步)"
    );
}
