"""MR/PR three-state label synchronization, with fully isolated fake platform I/O."""
from pathlib import Path
import runpy
import subprocess
import sys
import tempfile
import unittest
from urllib.parse import unquote

SCRIPT = Path(sys.argv.pop()).resolve()
state_module = runpy.run_path(str(SCRIPT.with_name('repair_state.py')))
labels = runpy.run_path(str(SCRIPT.with_name('review_labels.py')))
RepairState = state_module['RepairState']


class Platform:
    def __init__(self, provider='github'):
        self.provider = provider
        self.endpoint = ('repos/demo/project/pulls' if provider == 'github'
                         else 'projects/demo%2Fproject/merge_requests')
        self.pin = dict(provider=provider, host='example.invalid', repository='demo/project',
                        number=1, head_sha='a' * 40, base_sha='b' * 40, target_branch='main',
                        url='https://example.invalid/demo/project/' + ('pull/1' if provider == 'github' else '-/merge_requests/1'))
        self.names = {'business', 'merge-train', 'ai-review::pending'}
        self.writes = []
        self.behavior = ''
        self.comment_url = self.pin['url'] + '#note_7'
        self.notes = [dict(id=7, html_url=self.comment_url, body='a' * 40 + '\n' + 'b' * 40)]

    def snapshot(self, raw):
        return {key: raw[key] for key in self.pin}

    def pages(self, endpoint):
        return list(self.notes)

    def api(self, endpoint, method='GET', fields=None):
        if method == 'GET':
            return {**self.pin, 'labels': sorted(self.names)}
        self.writes.append((endpoint, method, fields))
        if self.behavior == 'forbidden':
            raise RuntimeError('平台操作权限不足。')
        if method == 'PUT':
            self.names.add(fields['add_labels'])
            self.names -= set(fields.get('remove_labels', '').split(','))
        elif method == 'POST':
            self.names.add(fields['labels[]'])
        elif method == 'DELETE':
            self.names.discard(unquote(endpoint.rsplit('/', 1)[1]))
        if self.behavior == 'version_race':
            self.pin['base_sha'] = 'c' * 40
        if self.behavior == 'timeout':
            raise subprocess.TimeoutExpired('platform', 1)
        return {}


class LabelChecks(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.state = RepairState(self.folder.name)
        self.repo = Platform()
        self.key, _ = self.state.ensure(self.repo.pin)

    def review(self, verdict='passed', run='review-1', blocking=0):
        self.state.update(self.key, 'reviewed', 'a' * 40, 'verified requirements and standards',
                          self.repo.comment_url, run_id=run, base='b' * 40,
                          verdict=verdict, blocking_count=blocking, standards='complete', spec='complete')

    def sync(self, run='review-1', pin=None):
        return labels['sync'](self.repo, self.state, self.key, pin or self.repo.pin.copy(), run)

    def test_preserves_business_labels_and_mutually_exclusive_state_on_both_platforms(self):
        for provider in ('github', 'gitlab'):
            with self.subTest(provider=provider):
                self.repo = Platform(provider)
                self.key, _ = self.state.ensure(self.repo.pin)
                self.repo.names.add('ai-review::rejected')
                self.review()
                result = self.sync()
                self.assertEqual(result['sync_status'], 'verified')
                self.assertEqual(self.repo.names, {'business', 'merge-train', 'ai-review::passed'})
                for endpoint, method, _ in self.repo.writes:
                    self.assertIn('/1/', endpoint + '/' if method == 'PUT' else endpoint)
                    self.assertTrue('/issues/1/' in endpoint or '/merge_requests/1' in endpoint)

    def test_same_state_only_reads_and_no_issue_or_other_mr_is_modified(self):
        self.review('pending')
        result = self.sync()
        self.assertEqual(result['sync_status'], 'verified')
        self.assertEqual(self.repo.writes, [])

    def test_repair_success_is_pending_until_fresh_independent_review(self):
        self.review('rejected', blocking=1)
        self.state.update(self.key, 'begin', 'a' * 40, run_id='repair-1')
        self.state.update(self.key, 'success', 'c' * 40, 'tests passed', run_id='repair-1')
        self.repo.pin['head_sha'] = 'c' * 40
        self.repo.names = {'business', 'ai-review::rejected'}
        result = self.sync('repair-1')
        self.assertEqual(result['expected_label'], 'ai-review::pending')
        self.assertEqual(result['sync_status'], 'verified')
        with self.assertRaises(RuntimeError):
            self.state.update(self.key, 'reviewed', 'c' * 40, 'self review', run_id='repair-1',
                              base='b' * 40, verdict='passed', standards='complete', spec='complete')
        self.state.update(self.key, 'reviewed', 'c' * 40, 'independent review',
                          run_id='review-2', base='b' * 40, verdict='passed', standards='complete', spec='complete')
        self.assertEqual(self.state.get(self.repo.pin)['review']['verdict'], 'passed')

    def test_exhaustion_does_not_imply_rejected_and_does_not_clear_known_issues(self):
        for _ in range(3):
            self.state.update(self.key, 'begin', 'a' * 40, run_id='repair-1')
            self.state.update(self.key, 'failed', 'a' * 40, 'build unavailable', run_id='repair-1')
        record = self.state.get(self.repo.pin)
        self.assertEqual(record['status'], 'manual_pending')
        self.assertEqual(labels['expected_label'](record, self.repo.pin), 'ai-review::pending')
        self.review('rejected', blocking=1)
        record = self.state.get(self.repo.pin)
        self.assertEqual(labels['expected_label'](record, self.repo.pin), 'ai-review::rejected')
        with self.assertRaises(RuntimeError):
            self.review('pending')
        with self.assertRaises(RuntimeError):
            self.state.update(self.key, 'begin', 'c' * 40, run_id='repair-2')

    def test_budget_exhaustion_still_allows_independent_pass_without_another_repair(self):
        for _ in range(2):
            self.state.update(self.key, 'begin', 'a' * 40, run_id='repair-1')
            self.state.update(self.key, 'failed', 'a' * 40, 'test failed', run_id='repair-1')
        self.state.update(self.key, 'begin', 'a' * 40, run_id='repair-1')
        self.state.update(self.key, 'success', 'c' * 40, 'tests passed', run_id='repair-1')
        self.state.update(self.key, 'reviewed', 'c' * 40, 'independent review passed',
                          self.repo.comment_url, run_id='review-2', base='b' * 40,
                          verdict='passed', standards='complete', spec='complete')
        self.repo.pin['head_sha'] = 'c' * 40
        self.repo.notes[0]['body'] = 'c' * 40 + '\n' + 'b' * 40
        self.assertEqual(self.sync('review-2')['expected_label'], 'ai-review::passed')
        with self.assertRaises(RuntimeError):
            self.state.update(self.key, 'begin', 'c' * 40, run_id='repair-2')

    def test_uncertain_existing_rejected_cannot_be_erased_by_missing_evidence(self):
        self.review('pending')
        self.repo.names = {'business', 'ai-review::rejected'}
        result = self.sync()
        self.assertEqual(result['sync_status'], 'failed')
        self.assertEqual(self.repo.writes, [])

    def test_failed_comment_verification_does_not_claim_success_even_if_label_matches(self):
        self.review()
        self.repo.names.add('ai-review::passed')
        self.repo.names.discard('ai-review::pending')
        self.repo.notes = []
        result = self.sync()
        self.assertNotEqual(result['sync_status'], 'verified')
        self.assertEqual(self.repo.writes, [])

    def test_timeout_is_read_back_and_same_operation_never_blindly_retries(self):
        self.review(); self.repo.behavior = 'timeout'
        first = self.sync()
        self.assertEqual(first['sync_status'], 'uncertain')
        count = len(self.repo.writes)
        self.sync()
        self.assertEqual(len(self.repo.writes), count)

    def test_timeout_does_not_blindly_retry_even_from_a_new_review_run(self):
        self.review(); self.repo.behavior = 'timeout'
        self.assertEqual(self.sync()['sync_status'], 'uncertain')
        count = len(self.repo.writes)
        self.review(run='review-2')
        self.sync('review-2')
        self.assertEqual(len(self.repo.writes), count)

    def test_version_race_after_write_never_records_success(self):
        self.review(); self.repo.behavior = 'version_race'
        pin = self.repo.pin.copy()
        result = self.sync(pin=pin)
        self.assertEqual(result['sync_status'], 'uncertain')
        self.assertEqual(self.state.get(pin)['label_sync']['sync_status'], 'uncertain')

    def test_old_execution_cannot_overwrite_new_review(self):
        self.review(run='review-2')
        with self.assertRaises(RuntimeError):
            self.sync('review-1')
        self.assertEqual(self.repo.writes, [])

    def test_permission_failure_is_explicit_and_not_success(self):
        self.review(); self.repo.behavior = 'forbidden'
        result = self.sync()
        self.assertEqual(result['sync_status'], 'failed')
        self.assertIn('权限不足', result['reason'])


unittest.main()
