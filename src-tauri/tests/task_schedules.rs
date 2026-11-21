#![cfg(any(feature = "github", feature = "gitlab"))]

use app_lib::core::task_browser::{Binding, Provider, TaskClient, TaskFailure};
use serde_json::json;
use std::sync::atomic::AtomicBool;

fn binding(provider: Provider) -> Binding {
    Binding {
        id: "00000000-0000-0000-0000-000000000001".into(),
        project_id: "project".into(),
        provider,
        host: "code.example.invalid".into(),
        repository: "team/demo".into(),
        launcher: None,
    }
}

#[cfg(feature = "gitlab")]
#[test]
fn gitlab_reads_pipeline_schedule_status_and_next_run_as_reported() {
    let reader = |_: &Binding, args: &[String], _: &AtomicBool| {
        assert_eq!(args[5], "graphql");
        assert!(args
            .iter()
            .any(|arg| arg.contains("lastPipeline { id status }")));
        Ok::<_, TaskFailure>(json!({"data":{"project":{"pipelineSchedules": {
            "nodes": [{
                "id": "gid://gitlab/Ci::PipelineSchedule/75", "description": "Daily checks",
                "cron": "0 1 * * *", "cronTimezone": "Asia/Shanghai", "active": true,
                "refForDisplay": "dev", "nextRunAt": "2026-11-23T01:00:00Z",
                "owner": {"name": "Demo account"},
                "lastPipeline": {"id": "gid://gitlab/Ci::Pipeline/450", "status": "SUCCESS"}
            }],
            "pageInfo": {"hasNextPage":false}
        }}}}))
    };
    let data = TaskClient::new(reader)
        .schedules(&binding(Provider::Gitlab), &AtomicBool::new(false))
        .unwrap();
    let schedule = &data.items[0];
    assert_eq!(schedule.id, "75");
    assert_eq!(schedule.target.as_deref(), Some("dev"));
    assert_eq!(schedule.last_status.as_deref(), Some("success"));
    assert_eq!(
        schedule.next_run_at.as_deref(),
        Some("2026-11-23T01:00:00Z")
    );
    assert_eq!(
        schedule.last_run_url.as_deref(),
        Some("https://code.example.invalid/team/demo/-/pipelines/450")
    );
}

#[cfg(feature = "github")]
#[test]
fn github_reads_only_scheduled_workflows_and_keeps_each_cron_rule() {
    let reader = |_: &Binding, args: &[String], _: &AtomicBool| {
        Ok::<_, TaskFailure>(match args[5].as_str() {
            "graphql" => json!({"data":{"repository": {
                "defaultBranchRef":{"name":"trunk"},
                "object":{"entries":[
                    {"name":"scheduled.yml","object":{"isTruncated":false,"text":"on:\n  schedule:\n    - cron: '0 6 * * *'\n      timezone: Europe/Paris\n    - cron: '0 8 * * 1'"}},
                    {"name":"manual.yml","object":{"text":"on: workflow_dispatch"}}
                ]}
            }}}),
            "repos/team/demo/actions/workflows?per_page=100&page=1" => json!({"workflows":[
                {"id":41,"path":".github/workflows/scheduled.yml","name":"Scheduled checks","state":"disabled_manually"},
                {"id":42,"path":".github/workflows/manual.yml","name":"Manual","state":"active"}
            ]}),
            "repos/team/demo/actions/workflows/41/runs?event=schedule&per_page=1&branch=trunk" => {
                json!({"workflow_runs":[{"id":90,"status":"completed","conclusion":"failure"}]})
            }
            _ => panic!("unexpected request"),
        })
    };
    let data = TaskClient::new(reader)
        .schedules(&binding(Provider::Github), &AtomicBool::new(false))
        .unwrap();
    assert_eq!(data.items.len(), 1);
    let schedule = &data.items[0];
    assert_eq!(schedule.rules.len(), 2);
    assert_eq!(schedule.rules[0].timezone.as_deref(), Some("Europe/Paris"));
    assert_eq!(schedule.rules[1].timezone.as_deref(), Some("UTC"));
    assert_eq!(schedule.target.as_deref(), Some("trunk"));
    assert_eq!(schedule.last_status.as_deref(), Some("failure"));
    assert_eq!(schedule.active, Some(false));
    assert!(schedule.next_run_at.is_none() && schedule.owner.is_none());
}

#[cfg(feature = "gitlab")]
#[test]
fn gitlab_progress_counts_terminal_jobs_and_skips_retried_attempts() {
    let reader = |_: &Binding, args: &[String], _: &AtomicBool| {
        Ok::<_, TaskFailure>(match args[5].as_str() {
            "projects/team%2Fdemo/pipelines/450" => json!({"status":"running"}),
            "projects/team%2Fdemo/pipelines/450/jobs?include_retried=false&per_page=100&page=1" => {
                json!([
                    {"id":1,"status":"success"},{"id":2,"status":"failed"},
                    {"id":3,"status":"skipped"},{"id":4,"status":"running"},
                    {"id":5,"status":"pending"},{"id":5,"status":"pending"},
                    {"id":6,"status":"manual"},{"id":7,"status":"unrecognized"}
                ])
            }
            _ => panic!("unexpected request"),
        })
    };
    let progress = TaskClient::new(reader)
        .schedule_progress(&binding(Provider::Gitlab), 450, &AtomicBool::new(false))
        .unwrap();
    assert_eq!(progress.status.as_deref(), Some("running"));
    assert_eq!(
        (
            progress.total,
            progress.finished,
            progress.running,
            progress.waiting
        ),
        (7, 3, 1, 2)
    );
    assert!(!progress.limited);
}

#[cfg(feature = "github")]
#[test]
fn github_progress_counts_jobs_from_the_latest_run_attempt() {
    let reader = |_: &Binding, args: &[String], _: &AtomicBool| {
        Ok::<_, TaskFailure>(match args[5].as_str() {
            "repos/team/demo/actions/runs/90" => json!({"status":"in_progress","conclusion":null}),
            "repos/team/demo/actions/runs/90/jobs?filter=latest&per_page=100&page=1" => json!({
                "total_count":3,
                "jobs":[{"id":1,"status":"completed","conclusion":"failure"},
                        {"id":2,"status":"in_progress"},{"id":3,"status":"queued"}]
            }),
            _ => panic!("unexpected request"),
        })
    };
    let progress = TaskClient::new(reader)
        .schedule_progress(&binding(Provider::Github), 90, &AtomicBool::new(false))
        .unwrap();
    assert_eq!(progress.status.as_deref(), Some("in_progress"));
    assert_eq!(
        (
            progress.total,
            progress.finished,
            progress.running,
            progress.waiting
        ),
        (3, 1, 1, 1)
    );
}
