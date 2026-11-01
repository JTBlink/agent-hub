//! Pure three-way decision (design §3): object-level table, component-level
//! merge for skills, whole-file newest-wins for scenarios / memberships /
//! residual paths, and the viewpoint-independent path-collision pass.
//!
//! Everything here is a pure function of the three snapshots plus the
//! declared-pending pin set and the per-side last-touch info — no repository
//! access — so both devices merging the same pair of commits compute the
//! same plan (§10 convergence).

use anyhow::{bail, Result};
use std::collections::{BTreeMap, BTreeSet};

use super::snapshot::{attrs_eq, skill_identical, FileEntry, SkillObj, Snapshot};
use crate::core::sync_metadata::{path_key, SkillMetaFile};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Side {
    Ours,
    Theirs,
}

/// Last-touch stamp of a path on one side: committer time plus the touching
/// commit id as a viewpoint-independent tie-break.
pub type Touch = (i64, String);

pub struct DecisionInput<'a> {
    pub base: &'a Snapshot,
    pub ours: &'a Snapshot,
    pub theirs: &'a Snapshot,
    /// Declared-pending skills (from trailers, §4) → side whose version is
    /// pinned. These bypass the normal three-way decision entirely.
    pub pinned: &'a BTreeMap<String, Side>,
    /// Newest-first last-touch info per repo-relative path, per side, for
    /// whole-file newest-wins decisions. Only consulted for paths where both
    /// sides diverged from base.
    pub ours_touch: &'a BTreeMap<String, Touch>,
    pub theirs_touch: &'a BTreeMap<String, Touch>,
}

#[derive(Debug, Clone)]
pub struct PlannedSkill {
    pub meta: SkillMetaFile,
    pub content: Option<git2::Oid>,
    /// True when the collision pass had to move this skill to a fresh path.
    pub renamed_for_collision: bool,
    /// Where the surviving components came from, for the summary.
    pub changed_from_theirs: bool,
}

#[derive(Debug, Clone)]
pub struct NewConflict {
    pub skill_id: String,
    /// Path of the theirs version (for the pending projection / UI).
    pub theirs_path: Option<String>,
}

#[derive(Debug, Default)]
pub struct MergePlan {
    pub skills: BTreeMap<String, PlannedSkill>,
    pub new_conflicts: Vec<NewConflict>,
    /// Previously declared pendings still active after this merge (their
    /// conflict refs advance to the new theirs commit).
    pub still_pending: Vec<String>,
    pub scenarios: BTreeMap<String, FileEntry>,
    pub memberships: BTreeMap<(String, String), FileEntry>,
    pub residual: BTreeMap<String, FileEntry>,
    /// skill ids adopted or partially adopted from theirs, for the summary.
    pub updated_from_theirs: Vec<String>,
    /// skill ids whose local version was kept over a conflicting remote one.
    pub kept_local: Vec<String>,
}

pub fn decide(input: &DecisionInput) -> Result<MergePlan> {
    let mut plan = MergePlan::default();

    // ── skills: pinned pendings first (§4 钉住) ──
    let mut pinned_ids: BTreeSet<&String> = BTreeSet::new();
    for (id, side) in input.pinned {
        let snap = match side {
            Side::Ours => input.ours,
            Side::Theirs => input.theirs,
        };
        match snap.skills.get(id) {
            Some(obj) => {
                plan.skills.insert(
                    id.clone(),
                    PlannedSkill {
                        meta: obj.meta.clone(),
                        content: obj.content,
                        renamed_for_collision: false,
                        changed_from_theirs: *side == Side::Theirs,
                    },
                );
                plan.still_pending.push(id.clone());
                pinned_ids.insert(id);
            }
            // The pinned side no longer has the skill (it was deleted there
            // after being pinned) — the pin has nothing to hold; fall back to
            // the normal three-way decision below.
            None => {
                plan.still_pending.push(id.clone());
            }
        }
    }

    // ── skills: object-level table (§3) ──
    let ids: BTreeSet<&String> = input
        .base
        .skills
        .keys()
        .chain(input.ours.skills.keys())
        .chain(input.theirs.skills.keys())
        .collect();
    for id in ids {
        if pinned_ids.contains(id) {
            continue;
        }
        let b = input.base.skills.get(id);
        let o = input.ours.skills.get(id);
        let t = input.theirs.skills.get(id);
        match (b, o, t) {
            (_, None, None) => {} // absent (or deleted on both) — stays absent
            (None, Some(o), None) => {
                plan.skills.insert(id.clone(), planned(o, false));
            }
            (None, None, Some(t)) => {
                plan.skills.insert(id.clone(), planned(t, true));
                plan.updated_from_theirs.push(id.clone());
            }
            (None, Some(o), Some(t)) => {
                if skill_identical(o, t) {
                    plan.skills.insert(id.clone(), planned(o, false));
                } else {
                    // 双新增分叉 → true conflict, keep ours.
                    plan.skills.insert(id.clone(), planned(o, false));
                    plan.new_conflicts.push(NewConflict {
                        skill_id: id.clone(),
                        theirs_path: Some(t.meta.path.clone()),
                    });
                    plan.kept_local.push(id.clone());
                }
            }
            (Some(b), None, Some(t)) => {
                if skill_identical(b, t) {
                    // our deletion propagates
                } else {
                    // 删 vs 改 → true conflict; ours (the deletion) is kept.
                    plan.new_conflicts.push(NewConflict {
                        skill_id: id.clone(),
                        theirs_path: Some(t.meta.path.clone()),
                    });
                    plan.kept_local.push(id.clone());
                }
            }
            (Some(b), Some(o), None) => {
                if skill_identical(b, o) {
                    // their deletion propagates
                    plan.updated_from_theirs.push(id.clone());
                } else {
                    // 改 vs 删 → true conflict, keep ours.
                    plan.skills.insert(id.clone(), planned(o, false));
                    plan.new_conflicts.push(NewConflict {
                        skill_id: id.clone(),
                        theirs_path: None,
                    });
                    plan.kept_local.push(id.clone());
                }
            }
            (Some(b), Some(o), Some(t)) => match merge_components(b, o, t) {
                ComponentOutcome::Merged { skill, from_theirs } => {
                    plan.skills.insert(id.clone(), *skill);
                    if from_theirs {
                        plan.updated_from_theirs.push(id.clone());
                    }
                }
                ComponentOutcome::Conflict => {
                    plan.skills.insert(id.clone(), planned(o, false));
                    plan.new_conflicts.push(NewConflict {
                        skill_id: id.clone(),
                        theirs_path: Some(t.meta.path.clone()),
                    });
                    plan.kept_local.push(id.clone());
                }
            },
        }
    }

    // ── whole-file objects (§3): scenarios / memberships / residual ──
    plan.scenarios = merge_whole_files(
        &input.base.scenarios,
        &input.ours.scenarios,
        &input.theirs.scenarios,
        |id| format!("{}/scenarios/{}.json", super::snapshot::METADATA_DIR, id),
        input,
    );
    plan.memberships = merge_whole_files(
        &input.base.memberships,
        &input.ours.memberships,
        &input.theirs.memberships,
        |(sid, skid)| {
            format!(
                "{}/scenario-skills/{}/{}.json",
                super::snapshot::METADATA_DIR,
                sid,
                skid
            )
        },
        input,
    );
    plan.residual = merge_whole_files(
        &input.base.residual,
        &input.ours.residual,
        &input.theirs.residual,
        |path| path.clone(),
        input,
    );

    // ── orphan self-heal as tree-build input (§5 step 3 / v2-R2 finding 9):
    // memberships must reference a surviving scenario and skill.
    plan.memberships.retain(|(sid, skid), _| {
        plan.scenarios.contains_key(sid) && plan.skills.contains_key(skid)
    });

    // ── metadata-namespace junk drop (构树输入自愈): legacy trees carry
    // atomic-write leftovers (`x.json.tmp.<uuid>`) and OS noise inside the
    // metadata subdirectories — an old client committed them before disk
    // cleanup ran. The app only ever writes `.json` files there, so any
    // other residual is junk; merging it forward would trip the strict
    // validator on every device forever.
    plan.residual
        .retain(|path, _| !is_metadata_namespace_junk(path));

    resolve_path_collisions(&mut plan, input)?;
    Ok(plan)
}

fn planned(obj: &SkillObj, from_theirs: bool) -> PlannedSkill {
    PlannedSkill {
        meta: obj.meta.clone(),
        content: obj.content,
        renamed_for_collision: false,
        changed_from_theirs: from_theirs,
    }
}

enum ComponentOutcome {
    Merged {
        skill: Box<PlannedSkill>,
        from_theirs: bool,
    },
    Conflict,
}

/// Component-level merge (§3): content / path / attrs each decide
/// independently; any per-component two-sided divergence conflicts the whole
/// skill.
fn merge_components(b: &SkillObj, o: &SkillObj, t: &SkillObj) -> ComponentOutcome {
    fn pick<'x, V: PartialEq>(bv: &V, ov: &'x V, tv: &'x V) -> Option<(&'x V, bool)> {
        let o_changed = ov != bv;
        let t_changed = tv != bv;
        match (o_changed, t_changed) {
            (false, false) => Some((ov, false)),
            (true, false) => Some((ov, false)),
            (false, true) => Some((tv, true)),
            (true, true) => {
                if ov == tv {
                    Some((ov, false))
                } else {
                    None
                }
            }
        }
    }

    let content = pick(&b.content, &o.content, &t.content);
    let path = pick(&b.meta.path, &o.meta.path, &t.meta.path);
    // attrs are one component: enabled + tags + source move together.
    let attrs_changed_o = !attrs_eq(&b.meta, &o.meta);
    let attrs_changed_t = !attrs_eq(&b.meta, &t.meta);
    let attrs: Option<(&SkillMetaFile, bool)> = match (attrs_changed_o, attrs_changed_t) {
        (false, false) | (true, false) => Some((&o.meta, false)),
        (false, true) => Some((&t.meta, true)),
        (true, true) => {
            if attrs_eq(&o.meta, &t.meta) {
                Some((&o.meta, false))
            } else {
                None
            }
        }
    };

    match (content, path, attrs) {
        (Some((content, c_t)), Some((path, p_t)), Some((attrs_src, a_t))) => {
            // Canonical rebuild (§2.1): attrs winner's values verbatim, the
            // winning path, path_key recomputed by the shared helper.
            let meta = SkillMetaFile {
                schema_version: attrs_src.schema_version,
                skill_id: o.meta.skill_id.clone(),
                path: path.clone(),
                path_key: path_key(path),
                enabled: attrs_src.enabled,
                tags: attrs_src.tags.clone(),
                source: attrs_src.source.clone(),
            };
            let from_theirs = c_t || p_t || a_t;
            ComponentOutcome::Merged {
                skill: Box::new(PlannedSkill {
                    meta,
                    content: *content,
                    renamed_for_collision: false,
                    changed_from_theirs: from_theirs,
                }),
                from_theirs,
            }
        }
        _ => ComponentOutcome::Conflict,
    }
}

/// Whole-file object merge: three-way per key; both-changed-unequal (and
/// delete-vs-modify) resolve by newest committer time of the last commit
/// touching the path on each side, with the touching commit id as a
/// deterministic tie-break (§3 新者胜).
fn merge_whole_files<K: Ord + Clone>(
    base: &BTreeMap<K, FileEntry>,
    ours: &BTreeMap<K, FileEntry>,
    theirs: &BTreeMap<K, FileEntry>,
    to_path: impl Fn(&K) -> String,
    input: &DecisionInput,
) -> BTreeMap<K, FileEntry> {
    let keys: BTreeSet<&K> = base
        .keys()
        .chain(ours.keys())
        .chain(theirs.keys())
        .collect();
    let mut out = BTreeMap::new();
    for key in keys {
        let b = base.get(key);
        let o = ours.get(key);
        let t = theirs.get(key);
        let winner: Option<FileEntry> = match (b, o, t) {
            (_, None, None) => None,
            (None, Some(o), None) => Some(*o),
            (None, None, Some(t)) => Some(*t),
            (Some(b), Some(o), None) => {
                if o == b {
                    None // their deletion propagates
                } else {
                    newest_wins(key, Some(*o), None, &to_path, input)
                }
            }
            (Some(b), None, Some(t)) => {
                if t == b {
                    None // our deletion propagates
                } else {
                    newest_wins(key, None, Some(*t), &to_path, input)
                }
            }
            (None, Some(o), Some(t)) | (Some(_), Some(o), Some(t)) => {
                let b_entry = b.copied();
                if o == t || Some(*o) != b_entry && Some(*t) == b_entry {
                    Some(*o)
                } else if Some(*o) == b_entry {
                    Some(*t)
                } else {
                    newest_wins(key, Some(*o), Some(*t), &to_path, input)
                }
            }
        };
        if let Some(entry) = winner {
            out.insert(key.clone(), entry);
        }
    }
    out
}

fn newest_wins<K>(
    key: &K,
    ours: Option<FileEntry>,
    theirs: Option<FileEntry>,
    to_path: &impl Fn(&K) -> String,
    input: &DecisionInput,
) -> Option<FileEntry> {
    let path = to_path(key);
    let o_touch = input.ours_touch.get(&path);
    let t_touch = input.theirs_touch.get(&path);
    let take_theirs = match (o_touch, t_touch) {
        (Some(o), Some(t)) => t > o,
        (None, Some(_)) => true,
        (Some(_), None) => false,
        // No touch info on either side (shouldn't happen for a genuinely
        // diverged path): keep ours for safety.
        (None, None) => false,
    };
    if take_theirs {
        theirs
    } else {
        ours
    }
}

/// Path-collision pass (§3): group the FINAL skill set by folded path key;
/// pendings are immovable placeholders, then the base holder, then the
/// smallest skill_id; everyone else moves to `path (2)`, `(3)`, … in
/// skill_id order.
fn resolve_path_collisions(plan: &mut MergePlan, input: &DecisionInput) -> Result<()> {
    let mut groups: BTreeMap<String, Vec<String>> = BTreeMap::new();
    for (id, skill) in &plan.skills {
        groups
            .entry(skill.meta.path_key.clone())
            .or_default()
            .push(id.clone());
    }

    let mut occupied: BTreeSet<String> = groups.keys().cloned().collect();
    let base_holder_by_key: BTreeMap<String, String> = input
        .base
        .skills
        .iter()
        .map(|(id, s)| (path_key(&s.meta.path), id.clone()))
        .collect();
    let pending_ids: BTreeSet<&String> = input.pinned.keys().collect();

    for (key, mut ids) in groups {
        if ids.len() < 2 {
            continue;
        }
        ids.sort();

        let pending_holders: Vec<&String> =
            ids.iter().filter(|id| pending_ids.contains(id)).collect();
        if pending_holders.len() > 1 {
            // §3-4: two immovable placeholders on one key is an invariant
            // violation — abort with zero changes.
            bail!(
                "path collision on '{key}' between two pending skills ({}) — resolve the pending conflicts first",
                pending_holders
                    .iter()
                    .map(|s| s.as_str())
                    .collect::<Vec<_>>()
                    .join(", ")
            );
        }
        let placeholder: Option<String> = pending_holders
            .first()
            .map(|s| (*s).clone())
            .or_else(|| {
                base_holder_by_key
                    .get(&key)
                    .filter(|holder| ids.contains(holder))
                    .cloned()
            })
            .or_else(|| ids.first().cloned());

        for id in &ids {
            if Some(id) == placeholder.as_ref() {
                continue;
            }
            let skill = plan.skills.get_mut(id).expect("grouped id exists");
            let mut n = 2u32;
            let (new_path, new_key) = loop {
                let candidate = suffixed_path(&skill.meta.path, n);
                let candidate_key = path_key(&candidate);
                if !occupied.contains(&candidate_key) {
                    break (candidate, candidate_key);
                }
                n += 1;
            };
            occupied.insert(new_key.clone());
            skill.meta.path = new_path;
            skill.meta.path_key = new_key;
            skill.renamed_for_collision = true;
        }
    }
    Ok(())
}

/// Residual files inside the managed metadata subdirectories that the app
/// never writes: anything non-`.json` under skills/scenarios/scenario-skills,
/// plus atomic-write temp leftovers anywhere under `.agent-hub/`.
pub(crate) fn is_metadata_namespace_junk(path: &str) -> bool {
    let Some(rest) = path.strip_prefix(".agent-hub/") else {
        return false;
    };
    if rest.contains(".tmp.") {
        return true;
    }
    (rest.starts_with("skills/")
        || rest.starts_with("scenarios/")
        || rest.starts_with("scenario-skills/"))
        && !rest.ends_with(".json")
}

fn suffixed_path(path: &str, n: u32) -> String {
    match path.rsplit_once('/') {
        Some((dir, name)) => format!("{dir}/{name} ({n})"),
        None => format!("{path} ({n})"),
    }
}

#[cfg(test)]
mod tests;
