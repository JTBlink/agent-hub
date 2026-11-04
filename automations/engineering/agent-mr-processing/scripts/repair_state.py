"""Persist repair attempts across scheduled runs; expose agent result callbacks."""
import argparse
from contextlib import contextmanager
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import runpy
import re
from urllib.parse import urlsplit

LIMIT = 3


def request_key(request):
    return hashlib.sha256(json.dumps([request[k] for k in (
        'provider', 'host', 'repository', 'number')]).encode()).hexdigest()


def timestamp():
    return datetime.now(timezone.utc).isoformat()


class RepairState:
    limit = LIMIT

    def __init__(self, directory):
        task_state = runpy.run_path(str(Path(__file__).with_name('task_state.py')))['TaskState']
        self.storage = task_state(directory)
        self.path = self.storage.path

    @contextmanager
    def locked(self):
        with self.storage.extension('mr_repair') as state:
            requests = state.setdefault('requests', {})
            if not isinstance(requests, dict):
                raise RuntimeError('MR 处理状态格式无效。')
            yield requests

    def get(self, request):
        if not self.path.exists():
            return None
        with self.locked() as requests:
            return requests.get(request_key(request))

    def ensure(self, request):
        key = request_key(request)
        with self.locked() as requests:
            if key not in requests:
                requests[key] = {k: request[k] for k in (
                    'provider', 'host', 'repository', 'number', 'url', 'head_sha', 'base_sha', 'target_branch')}
                requests[key].update(status='pending', attempts=[], updated_at=timestamp())
            record = requests[key]
            record.update(url=request['url'], target_branch=request['target_branch'])
            record.setdefault('base_sha', request['base_sha'])
            if len(record['attempts']) >= LIMIT and record['status'] in ('failed', 'succeeded'):
                record['status'] = 'manual_pending'
            return key, record

    def observe_handoff(self, request, comment_url):
        key, _ = self.ensure(request)
        with self.locked() as requests:
            record = requests[key]
            if (record['status'] != 'manual_pending' or len(record['attempts']) < LIMIT
                    or record['head_sha'] != request['head_sha']):
                raise RuntimeError('远端标记不能代替本地累计尝试与版本证据。')
            requests[key].update(status='manual', head_sha=request['head_sha'],
                                 comment_url=comment_url, updated_at=timestamp(),
                                 handoff_reason='已从平台读回人工接管标记。')

    def update(self, key, action, head, evidence='', comment_url='', *, run_id='',
               base='', verdict='pending', blocking_count=0, standards='unavailable', spec='unavailable'):
        if not re.fullmatch(r'[0-9a-f]{40,64}', head):
            raise RuntimeError('必须提供实际源提交的完整 SHA。')
        with self.locked() as requests:
            if key not in requests:
                raise RuntimeError('修复请求未登记。')
            record = requests[key]
            attempts = record['attempts']
            if action == 'begin':
                if record['status'] in ('running', 'manual', 'manual_pending', 'awaiting_review') or len(attempts) >= LIMIT:
                    raise RuntimeError('已有未确认的尝试或已达 3 次上限，禁止继续修复。')
                attempts.append(dict(number=len(attempts) + 1, head_sha=head, initial_head_sha=head,
                                     started_at=timestamp(), status='running', run_id=run_id))
                record['status'] = 'running'
            elif action in ('failed', 'success'):
                if (record['status'] != 'running' or not evidence.strip()
                        or attempts[-1].get('run_id', '') != run_id):
                    raise RuntimeError('须先登记修复尝试，并提供验证结果或失败证据。')
                attempts[-1].update(status=action, head_sha=head, evidence=evidence,
                                    finished_at=timestamp())
                record['status'] = ('manual_pending' if action == 'failed' and len(attempts) >= LIMIT
                                    else 'awaiting_review' if action == 'success' else 'failed')
            elif action == 'reviewed':
                if (record['status'] in ('running', 'manual') or not evidence.strip()
                        or not run_id or not re.fullmatch(r'[0-9a-f]{40,64}', base)):
                    raise RuntimeError('须提供审查执行身份、准确版本和证据，不能覆盖未确认修复。')
                if verdict not in ('pending', 'rejected', 'passed') or blocking_count < 0:
                    raise RuntimeError('审查结论或必修问题数量无效。')
                if verdict == 'passed' and (blocking_count or standards != 'complete' or spec != 'complete'
                        or any(attempt.get('run_id') == run_id for attempt in attempts)):
                    raise RuntimeError('通过须来自独立双轴重审，修复执行者不得自签通过。')
                if verdict == 'rejected' and not blocking_count:
                    raise RuntimeError('rejected 必须有当前版本已确认的未处理必修问题。')
                if verdict == 'pending' and blocking_count:
                    raise RuntimeError('存在已确认必修问题时不能清成 pending。')
                prior = record.get('review', {})
                if (verdict == 'pending' and prior.get('verdict') == 'rejected'
                        and prior.get('head_sha') == head and prior.get('base_sha') == base):
                    raise RuntimeError('同版本证据缺失不能撤销此前有效的必修问题结论。')
                if prior and (prior.get('head_sha'), prior.get('base_sha')) != (head, base):
                    record['previous_review'] = prior
                record['review'] = dict(verdict=verdict, head_sha=head, base_sha=base,
                                        run_id=run_id, evidence=evidence, blocking_count=blocking_count,
                                        standards=standards, spec=spec, comment_url=comment_url)
                record['base_sha'] = base
                record['status'] = ('succeeded' if verdict == 'passed' else 'manual_pending'
                                    if len(attempts) >= LIMIT else 'failed' if verdict == 'rejected'
                                    else 'awaiting_review')
            elif action == 'handoff':
                parsed = urlsplit(comment_url)
                if (record['status'] != 'manual_pending' or not evidence.strip()
                        or parsed.scheme != 'https' or parsed.netloc != record['host']
                        or not comment_url.startswith(record['url'] + '#')):
                    raise RuntimeError('须达到失败上限并提供读回验证的 MR/PR 评论链接与交接说明。')
                record.update(status='manual', comment_url=comment_url, handoff_reason=evidence)
            else:
                raise RuntimeError('未知修复回调动作。')
            record.update(head_sha=head, updated_at=timestamp(), current_run=run_id)
            return record


def main():
    parser = argparse.ArgumentParser(description='Local MR/PR repair attempt callbacks')
    parser.add_argument('--state-dir', required=True)
    parser.add_argument('--request', required=True)
    parser.add_argument('--action', choices=['begin', 'failed', 'success', 'reviewed', 'handoff'], required=True)
    parser.add_argument('--head', required=True)
    parser.add_argument('--evidence', default='')
    parser.add_argument('--comment-url', default='')
    parser.add_argument('--run-id', required=True)
    parser.add_argument('--base', default='')
    parser.add_argument('--verdict', choices=['pending', 'rejected', 'passed'], default='pending')
    parser.add_argument('--blocking-count', type=int, default=0)
    parser.add_argument('--standards', choices=['complete', 'unavailable'], default='unavailable')
    parser.add_argument('--spec', choices=['complete', 'unavailable'], default='unavailable')
    args = parser.parse_args()
    record = RepairState(args.state_dir).update(args.request, args.action, args.head,
                                               args.evidence, args.comment_url, run_id=args.run_id,
                                               base=args.base, verdict=args.verdict,
                                               blocking_count=args.blocking_count,
                                               standards=args.standards, spec=args.spec)
    print(json.dumps({'status': record['status'], 'attempts': len(record['attempts']),
                      'limit': LIMIT}, ensure_ascii=False))


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, OSError, ValueError) as error:
        raise SystemExit(str(error)) from None
