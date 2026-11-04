"""Synchronize only the current MR/PR's three review labels, with version checks."""
import argparse
import json
from pathlib import Path
import runpy
import subprocess
from urllib.parse import quote

LABELS = {'ai-review::pending', 'ai-review::rejected', 'ai-review::passed'}
IDENTITY = ('provider', 'host', 'repository', 'number', 'head_sha', 'base_sha', 'target_branch')


def expected_label(record, snapshot):
    review = record.get('review', {})
    if (review.get('head_sha') != snapshot['head_sha']
            or review.get('base_sha') != snapshot['base_sha']):
        return 'ai-review::pending'
    verdict = review.get('verdict')
    if verdict == 'rejected' and review.get('blocking_count', 0) > 0:
        return 'ai-review::rejected'
    if verdict == 'passed':
        if (not review.get('evidence') or review.get('standards') != 'complete'
                or review.get('spec') != 'complete' or review.get('blocking_count', 0)
                or any(a.get('run_id') == review.get('run_id') for a in record['attempts'])):
            raise RuntimeError('缺少独立双轴审查证据，不能同步 passed。')
        return 'ai-review::passed'
    return 'ai-review::pending'


def read_current(repo, snapshot):
    raw = repo.api(f"{repo.endpoint}/{snapshot['number']}")
    current = repo.snapshot(raw)
    if not current or any(current[key] != snapshot[key] for key in IDENTITY):
        raise RuntimeError('MR/PR 已关闭或来源/目标版本变化，停止标签写入。')
    labels = raw.get('labels', [])
    names = [label.get('name') if isinstance(label, dict) else label for label in labels]
    if not all(isinstance(label, str) for label in names):
        raise RuntimeError('MR/PR 标签格式无效。')
    return set(names)


def verify_comment(repo, record, snapshot):
    review = record.get('review', {})
    link = review.get('comment_url', '')
    if not link.startswith(record['url'] + '#'):
        raise RuntimeError('缺少当前 MR/PR 已发布并读回的审查评论链接。')
    number = snapshot['number']
    if repo.provider == 'github':
        notes = repo.pages(repo.endpoint.replace('/pulls', '/issues') + f'/{number}/comments')
        notes += repo.pages(repo.endpoint + f'/{number}/reviews')
    else:
        notes = repo.pages(repo.endpoint + f'/{number}/notes')
    for note in notes:
        actual = note.get('html_url') or note.get('web_url') or record['url'] + '#note_' + str(note.get('id', ''))
        if actual == link and all(sha in (note.get('body') or '') for sha in (
            snapshot['head_sha'], snapshot['base_sha']
        )):
            return
    raise RuntimeError('未读回绑定当前来源/目标版本的审查评论，不能记录标签成功。')


def sync(repo, repairs, key, snapshot, run_id):
    # A separate operation lock serializes remote writes without holding the JSON lock over I/O.
    lock = repairs.storage.directory / '.label-sync.lock'
    lock.mkdir()
    try:
        with repairs.locked() as requests:
            record = requests[key]
            if record.get('current_run') != run_id:
                raise RuntimeError('本执行已被替代，不允许覆盖新执行的标签。')
            expected = expected_label(record, snapshot)
            prior = record.get('label_sync', {})
            read_only = all(prior.get(k) == v for k, v in {
                'head_sha': snapshot['head_sha'],
                'base_sha': snapshot['base_sha'], 'expected_label': expected,
            }.items()) and prior.get('write_attempted', False) and (
                prior.get('sync_status') == 'uncertain' or prior.get('run_id') == run_id
            )
            result = dict(expected_label=expected, before_labels=[], observed_labels=[],
                          head_sha=snapshot['head_sha'], base_sha=snapshot['base_sha'],
                          run_id=run_id, policy_version=1, sync_status='uncertain',
                          preconditions_verified=False,
                          write_attempted=read_only, reason='')
            record['label_sync'] = result.copy()
        try:
            before = read_current(repo, snapshot)
            result['before_labels'] = sorted(before | set(prior.get('before_labels', []) if read_only else []))
            if expected != 'ai-review::pending':
                verify_comment(repo, record, snapshot)
            elif 'ai-review::rejected' in before:
                old_review = record.get('review', {})
                if old_review.get('verdict') != 'rejected':
                    old_review = record.get('previous_review', {})
                new_version = old_review.get('verdict') == 'rejected' and (
                    old_review.get('head_sha'), old_review.get('base_sha')
                ) != (snapshot['head_sha'], snapshot['base_sha'])
                if not new_version:
                    raise RuntimeError('现有 rejected 缺少可核验的旧版本证据，不能清成 pending。')
            result['preconditions_verified'] = True
            if before & LABELS != {expected} and not read_only:
                with repairs.locked() as requests:
                    if requests[key].get('current_run') != run_id:
                        raise RuntimeError('标签写入归属已变化。')
                    result['write_attempted'] = True
                    requests[key]['label_sync'] = result.copy()
                if repo.provider == 'gitlab':
                    fields = {'add_labels': expected}
                    remove = sorted((before & LABELS) - {expected})
                    if remove:
                        fields['remove_labels'] = ','.join(remove)
                    repo.api(f"{repo.endpoint}/{snapshot['number']}", 'PUT', fields)
                else:
                    endpoint = repo.endpoint.replace('/pulls', '/issues') + f"/{snapshot['number']}/labels"
                    if expected not in before:
                        repo.api(endpoint, 'POST', {'labels[]': expected})
                    for label in sorted((before & LABELS) - {expected}):
                        read_current(repo, snapshot)
                        repo.api(endpoint + '/' + quote(label, safe=''), 'DELETE')
        except (RuntimeError, OSError, ValueError, subprocess.TimeoutExpired) as error:
            result['reason'] = str(error)
            result['sync_status'] = 'failed'
        # Also read after an error/timeout. Never retry a write on an uncertain result.
        try:
            observed = read_current(repo, snapshot)
            result['observed_labels'] = sorted(observed)
            preserved = set(result['before_labels']) - LABELS
            if (observed & LABELS == {expected} and preserved <= observed
                    and result['preconditions_verified']):
                result['sync_status'] = 'verified'
                result['reason'] = ''
            else:
                result['sync_status'] = ('failed' if '权限不足' in result['reason'] else
                                         'uncertain' if result['write_attempted'] else 'failed')
                result['reason'] = result['reason'] or '读回标签不符合期望，未重发写入。'
        except (RuntimeError, OSError, ValueError, subprocess.TimeoutExpired) as error:
            result['reason'] = str(error)
            result['sync_status'] = 'uncertain' if result['write_attempted'] else 'failed'
        with repairs.locked() as requests:
            if requests[key].get('current_run') != run_id:
                raise RuntimeError('标签读回时执行归属已变化，不能记录成功。')
            requests[key]['label_sync'] = result
        return result
    finally:
        lock.rmdir()


def main():
    parser = argparse.ArgumentParser(description='Sync current MR/PR review labels')
    parser.add_argument('--state-dir', required=True)
    parser.add_argument('--request', required=True)
    parser.add_argument('--run-id', required=True)
    parser.add_argument('--head', required=True)
    parser.add_argument('--base', required=True)
    args = parser.parse_args()
    task = Path(__file__).resolve().parent.parent
    review = runpy.run_path(str(task / 'scripts/review.py'))
    host = review['load_host'](task)
    repairs = review['load_repairs'](task, args.state_dir)
    with repairs.locked() as requests:
        record = requests[args.request].copy()
    try:
        repo = host.repository(host.read_json(task / 'config/review-config.json'))
    except (RuntimeError, OSError, ValueError, subprocess.TimeoutExpired) as error:
        with repairs.locked() as requests:
            requests[args.request]['label_sync'] = dict(
                sync_status='not_performed', reason=str(error), run_id=args.run_id,
                head_sha=args.head, base_sha=args.base, write_attempted=False)
        raise
    snapshot = {k: record[k] for k in IDENTITY}
    snapshot.update(head_sha=args.head, base_sha=args.base)
    result = sync(repo, repairs, args.request, snapshot, args.run_id)
    print(json.dumps(result, ensure_ascii=False))
    return 0 if result['sync_status'] == 'verified' else 1


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except (RuntimeError, OSError, ValueError, KeyError) as error:
        raise SystemExit(f'标签未同步：{error}') from None
