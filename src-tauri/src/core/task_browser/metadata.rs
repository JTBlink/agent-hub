//! Normalize platform-owned task facts without inferring missing values.
use super::{Provider, ReviewMetadata, TaskCheck, TaskKind, TaskMetadata};
use serde_json::Value;

pub(crate) fn text(value: &Value) -> Option<String> {
    value.as_str().filter(|s| !s.is_empty()).map(str::to_owned)
}

pub(crate) fn actor(value: &Value) -> Option<String> {
    text(&value["login"]).or_else(|| text(&value["username"]))
}

fn actors(value: &Value) -> Vec<String> {
    value
        .as_array()
        .map(|items| items.iter().filter_map(actor).collect())
        .unwrap_or_default()
}

pub(super) fn extract(provider: Provider, kind: TaskKind, item: &Value) -> TaskMetadata {
    TaskMetadata {
        state_reason: text(&item["state_reason"]),
        author: actor(
            &item[if provider == Provider::Github {
                "user"
            } else {
                "author"
            }],
        ),
        labels: item["labels"]
            .as_array()
            .map(|values| {
                values
                    .iter()
                    .filter_map(|label| text(label).or_else(|| text(&label["name"])))
                    .collect()
            })
            .unwrap_or_default(),
        milestone: text(&item["milestone"]["title"]),
        created_at: text(&item["created_at"]),
        closed_at: text(&item["closed_at"]),
        due_date: text(&item["due_date"]),
        comment_count: item["user_notes_count"]
            .as_u64()
            .or_else(|| item["comments"].as_u64()),
        task_count: item["task_completion_status"]["count"].as_u64(),
        completed_tasks: item["task_completion_status"]["completed_count"].as_u64(),
        priority: text(&item["priority"]),
        severity: text(&item["severity"]),
        weight: item["weight"].as_u64(),
        issue_type: text(&item["issue_type"]),
        confidential: item["confidential"].as_bool(),
        locked: item["discussion_locked"]
            .as_bool()
            .or_else(|| item["locked"].as_bool()),
        estimated_seconds: item["time_stats"]["time_estimate"].as_u64(),
        spent_seconds: item["time_stats"]["total_time_spent"].as_u64(),
        review: (kind == TaskKind::Review).then(|| review(provider, item)),
    }
}

fn review(provider: Provider, item: &Value) -> ReviewMetadata {
    let github = provider == Provider::Github;
    ReviewMetadata {
        source_branch: text(&item["source_branch"]).or_else(|| text(&item["head"]["ref"])),
        target_branch: text(&item["target_branch"]).or_else(|| text(&item["base"]["ref"])),
        head_sha: text(&item["sha"]).or_else(|| text(&item["head"]["sha"])),
        draft: item["draft"]
            .as_bool()
            .or_else(|| item["work_in_progress"].as_bool()),
        merge_status: text(&item["detailed_merge_status"]).or_else(|| {
            text(
                &item[if github {
                    "mergeable_state"
                } else {
                    "merge_status"
                }],
            )
        }),
        // GitLab reports false while mergeability is still being computed.
        // Keep that unknown instead of promising a conflict-free merge.
        has_conflicts: if github {
            item["mergeable"].as_bool().map(|value| !value)
        } else {
            match item["detailed_merge_status"]
                .as_str()
                .or_else(|| item["merge_status"].as_str())
            {
                Some("checking" | "unchecked" | "preparing") | None => None,
                _ => item["has_conflicts"].as_bool(),
            }
        },
        discussions_resolved: item["blocking_discussions_resolved"].as_bool(),
        additions: item["additions"].as_u64(),
        deletions: item["deletions"].as_u64(),
        changed_files: item["changed_files"].as_u64(),
        commits: item["commits"].as_u64(),
        changes_count: text(&item["changes_count"]),
        merged_by: actor(&item["merge_user"]).or_else(|| actor(&item["merged_by"])),
        merged_at: text(&item["merged_at"]),
        reviewers: actors(
            &item[if github {
                "requested_reviewers"
            } else {
                "reviewers"
            }],
        ),
        pipeline: item
            .get("head_pipeline")
            .filter(|value| value.is_object())
            .map(|value| TaskCheck {
                name: value["id"]
                    .as_u64()
                    .map(|id| format!("#{id}"))
                    .unwrap_or_else(|| "CI".into()),
                status: super::adapter::string(value, "status"),
                url: super::adapter::string(value, "web_url"),
                sha: text(&value["sha"]),
            }),
    }
}
