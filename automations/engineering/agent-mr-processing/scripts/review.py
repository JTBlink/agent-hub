"""Select the oldest actionable request before starting the review agent."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import runpy
import sys
import uuid
from datetime import datetime


def load_host(task):
    spec = importlib.util.spec_from_file_location("review_host", task / "scripts/review_host.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def review_marker(snapshot):
    identity = [snapshot[key] for key in (
        "provider", "host", "repository", "number", "head_sha", "base_sha", "target_branch")]
    return '<!-- agent-hub-code-review:' + hashlib.sha256(json.dumps(identity).encode()).hexdigest() + ' -->'


def feedback(repo, snapshot):
    number = snapshot['number']
    if repo.provider == 'github':
        reviews = repo.pages(f'{repo.endpoint}/{number}/reviews')
        comments = repo.pages(f'{repo.endpoint.replace("/pulls", "/issues")}/{number}/comments')
        latest = {}
        for review in reviews:
            if review.get('state') != 'DISMISSED':
                latest[review.get('user', {}).get('id')] = review
        changes = any(r.get('state') == 'CHANGES_REQUESTED' for r in latest.values())
        reviewed = any(r.get('commit_id') == snapshot['head_sha'] and (
            r.get('state') == 'APPROVED' or (
                r.get('state') == 'COMMENTED' and snapshot['head_sha'] in (r.get('body') or '')
                and all(section in (r.get('body') or '') for section in ('## Standards', '## Spec'))
            )) for r in reviews)
        return changes, reviewed, [*reviews, *comments]
    discussions = repo.pages(f'{repo.endpoint}/{number}/discussions')
    notes = [note for discussion in discussions for note in discussion.get('notes', [])]
    changes = any(n.get('resolvable') and not n.get('resolved') for n in notes)
    return changes, False, notes


def choose(repo, max_pages, repairs=None):
    # The API orders globally by creation time; stop after the first actionable request.
    for item in repo.requests(max_pages):
        snapshot = repo.snapshot(item)
        if not snapshot:
            continue
        local = repairs.get(snapshot) if repairs else None
        if local and local['status'] == 'manual':
            continue
        created = item.get('created_at')
        if not isinstance(created, str):
            raise RuntimeError('请求缺少创建时间，无法可靠排序。')
        datetime.fromisoformat(created.replace('Z', '+00:00'))
        changes, reviewed, notes = feedback(repo, snapshot)
        verdict = local.get('review', {}) if local else {}
        same_review = (verdict.get('head_sha'), verdict.get('base_sha')) == (
            snapshot['head_sha'], snapshot['base_sha'])
        if same_review and verdict.get('verdict') == 'rejected':
            changes = True
        label = local.get('label_sync', {}) if local else {}
        label_verified = (label.get('sync_status') == 'verified'
                          and label.get('head_sha') == snapshot['head_sha']
                          and label.get('base_sha') == snapshot['base_sha']
                          and label.get('run_id') == local.get('current_run')) if local else False
        label_pending = bool(same_review and local and local['status'] in ('succeeded', 'failed')
                             and not label_verified)

        handoff = next((note for note in notes if
                        f"<!-- agent-hub-manual-handoff:{snapshot['head_sha']} -->" in (note.get('body') or '')), None)
        if (handoff is not None and local and local['status'] == 'manual_pending'
                and len(local['attempts']) >= repairs.limit):
            if repairs:
                link = handoff.get('html_url') or handoff.get('web_url') or (
                    snapshot['url'] + '#note_' + str(handoff.get('id', '')))
                repairs.observe_handoff(snapshot, link)
            continue
        completed = reviewed or any(review_marker(snapshot) in (n.get('body') or '') for n in notes)
        legacy_review = bool(local and local['status'] == 'succeeded' and not same_review)
        needs_recovery = label_pending or legacy_review or (local and local['status'] in ('running', 'manual_pending', 'awaiting_review'))
        if not needs_recovery and not changes and (completed or (
            same_review and verdict.get('verdict') == 'passed' and label_verified
        )):
            continue
        current = repo.current(snapshot['number'])
        if current != snapshot:
            raise RuntimeError('选定请求的状态或提交已变化，请在下轮重新筛选。')
        snapshot.update(title=item.get('title', ''), created_at=created)
        if label_pending:
            snapshot['mode'] = 'labels_only'
        elif legacy_review or (local and local['status'] == 'awaiting_review'):
            snapshot['mode'] = 'review_only'
        elif local and local['status'] == 'running':
            snapshot['mode'] = 'reconcile_only'
        elif local and (local['status'] == 'manual_pending' or len(local['attempts']) >= repairs.limit):
            snapshot['mode'] = 'handoff_only'
        return snapshot
    return None


def load_repairs(task, state_dir):
    return runpy.run_path(str(task / 'scripts/repair_state.py'))['RepairState'](state_dir)


def main():
    # Redirected Windows task logs otherwise inherit a legacy ANSI encoding.
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")
    task = Path(os.environ.get('AGENT_HUB_TASK_DIR', str(Path(__file__).resolve().parent.parent)))
    host = load_host(task)
    config = host.read_json(task / 'config/review-config.json')
    pages = config.get('max_pages', 3)
    if not isinstance(pages, int) or isinstance(pages, bool) or not 1 <= pages <= 100:
        raise RuntimeError('max_pages 必须为 1–100 的整数。')
    state_dir = Path(os.environ.get('AGENT_HUB_STATE_DIR', str(task / '.local/state')))
    repairs = load_repairs(task, state_dir)
    selected = choose(host.repository(config), pages, repairs)
    if not selected:
        print('已检查范围内没有待处理的 MR / PR。', flush=True)
        return 0
    print(f"本轮修复 #{selected['number']}：{selected['title']}\n{selected['url']}\n"
          f"创建时间：{selected['created_at']}；按创建时间从早到晚选择。", flush=True)
    key, record = repairs.ensure(selected)
    run_id = (record.get('current_run', '') if selected.get('mode') == 'labels_only' else
              record['attempts'][-1].get('run_id', '') if record['status'] == 'running' else uuid.uuid4().hex)
    callback = [sys.executable, str(task / 'scripts/repair_state.py'),
                '--state-dir', str(state_dir), '--request', key, '--run-id', run_id]
    label_callback = [sys.executable, str(task / 'scripts/review_labels.py'),
                      '--state-dir', str(state_dir), '--request', key, '--run-id', run_id]
    context = ('仅处理本轮指定请求；先读取 label_policy_path 的操作协议，再用提供的回调 argv 登记修复、'
               '审查与标签结果。登记失败禁止修复；review_only 只做独立重审，reconcile_only 只核实旧结果，'
               'handoff_only 禁止继续修复，labels_only 只核实标签。新 SHA 待独立重审，修复者不签发 passed；'
               '只同步当前 MR/PR 的标签，不修改关联 Issue。不删除或改写累计计数。\n'
               + json.dumps({'request': selected, 'attempts_used': len(record['attempts']),
                             'limit': repairs.limit, 'status': record['status'], 'run_id': run_id,
                             'label_policy_path': str(task / 'references/review-labels.md'),
                             'callback_argv': callback, 'label_callback_argv': label_callback},
                            ensure_ascii=False))
    return runpy.run_path(str(task / 'scripts/agent.py'))['main'](prompt_context=context)


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except (RuntimeError, OSError, ValueError) as error:
        raise SystemExit(f'请求筛选未完成：{error}') from None
