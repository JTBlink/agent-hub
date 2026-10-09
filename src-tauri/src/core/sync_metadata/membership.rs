//! Incremental persistence for membership-only edits. Callers hold RepoLock.
use super::*;

pub(crate) fn write_scenario_membership_metadata_unlocked(
    store: &SkillStore,
    scenario_id: &str,
) -> Result<()> {
    // Bootstrap/recovery must remain a complete snapshot, otherwise reindexing
    // could treat a partially exported library as the authoritative full set.
    if !has_complete_skill_snapshot() || !metadata_has_complete_scenario_snapshot() {
        return write_all_from_db_unlocked(store);
    }
    let scenario = store
        .get_all_scenarios()?
        .into_iter()
        .find(|scenario| scenario.id == scenario_id)
        .ok_or_else(|| anyhow!("skill group not found: {scenario_id}"))?;
    write_scenario_file(&scenario)?;
    // Recompute this group's ordinal positions too: a newly added member can
    // sort before existing rows, so writing only the new file loses order on restore.
    let skill_ids = write_membership_records(store, scenario_id)?;
    let membership_dir = metadata_dir().join("scenario-skills").join(scenario_id);
    if membership_dir.exists() {
        let expected = skill_ids.into_iter().collect();
        if remove_stale_json_files(&membership_dir, &expected)? {
            // Persist removals as well as additions before releasing the repo lock.
            sync_parent_dir(&membership_dir.join("member.json"))?;
        }
    }
    Ok(())
}

pub(super) fn write_membership_records(
    store: &SkillStore,
    scenario_id: &str,
) -> Result<Vec<String>> {
    let skill_ids = store.get_skill_ids_for_scenario(scenario_id)?;
    for (index, skill_id) in skill_ids.iter().enumerate() {
        write_membership_record(store, scenario_id, skill_id, index)?;
    }
    Ok(skill_ids)
}

fn write_membership_record(
    store: &SkillStore,
    scenario_id: &str,
    skill_id: &str,
    index: usize,
) -> Result<()> {
    let tools = store
        .get_scenario_skill_tool_toggles(scenario_id, skill_id)?
        .into_iter()
        .map(|toggle| (toggle.tool, toggle.enabled))
        .collect::<BTreeMap<_, _>>();
    write_membership_file(&ScenarioSkillMetaFile {
        schema_version: SCHEMA_VERSION,
        scenario_id: scenario_id.to_string(),
        skill_id: skill_id.to_string(),
        sort_order: index as i32,
        tools,
    })
}
