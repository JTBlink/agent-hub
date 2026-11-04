"""Request selection and launcher integration, without remote writes or agents."""
from pathlib import Path
import os
import json
import subprocess
import runpy
import sys
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = Path(sys.argv.pop()).resolve()
review = runpy.run_path(str(SCRIPT))
host = review['load_host'](SCRIPT.parent.parent)
repair = runpy.run_path(str(SCRIPT.with_name('repair_state.py')))
RepairState = repair['RepairState']


def snapshot(number):
    return dict(provider='github', host='github.com', repository='demo/project', number=number,
                head_sha='a' * 40, base_sha='b' * 40, target_branch='main',
                url=f'https://github.com/demo/project/pull/{number}')


class Repo:
    provider = 'github'
    endpoint = 'repos/demo/project/pulls'

    def __init__(self):
        self.items = [dict(number=n, title=f'Change {n}', created_at=f'2026-01-0{n}T00:00:00Z') for n in (1, 2)]
        self.reviews = []
        self.comments = []

    def requests(self, pages):
        return iter(self.items)

    def snapshot(self, item):
        return None if item.get('draft') else snapshot(item['number'])

    def current(self, number):
        return snapshot(number)

    def pages(self, endpoint):
        return self.reviews if endpoint.endswith('/reviews') else self.comments


class ReviewChecks(unittest.TestCase):
    def test_selects_oldest_creation_even_when_recently_updated(self):
        repo = Repo()
        repo.items[0]['updated_at'] = '2026-11-04T00:00:00Z'
        self.assertEqual(review['choose'](repo, 3)['number'], 1)

    def test_skips_draft(self):
        repo = Repo(); repo.items[0]['draft'] = True
        self.assertEqual(review['choose'](repo, 3)['number'], 2)

    def test_skips_completed_snapshot_but_keeps_updated_head(self):
        repo = Repo()
        repo.comments = [dict(body=review['review_marker'](snapshot(1)))]
        self.assertEqual(review['choose'](repo, 3)['number'], 2)
        repo.comments[0]['body'] = review['review_marker']({**snapshot(1), 'head_sha': 'c' * 40})
        self.assertEqual(review['choose'](repo, 3)['number'], 1)

    def test_incidental_comment_does_not_count_as_completed_review(self):
        repo = Repo()
        repo.reviews = [dict(state='COMMENTED', commit_id='a' * 40, body='Please check this.', user={'id': 1})]
        self.assertEqual(review['choose'](repo, 3)['number'], 1)

    def test_inactive_project_preflight_stops_before_authentication(self):
        from types import SimpleNamespace
        replies = ['workspace', 'origin', 'main', 'origin', 'https://github.com/demo/project.git',
                   '{"reason":"inactive"}']
        results = [SimpleNamespace(returncode=0, stdout=value) for value in replies]
        with patch.object(host, 'command', side_effect=results) as command:
            with self.assertRaisesRegex(RuntimeError, '激活条件'):
                host.repository({'project_preflight': ['check-project'],
                                 'project_preflight_expected': {'reason': 'active'}})
            self.assertFalse(any('auth' in call.args[0] for call in command.call_args_list))

    def test_requested_changes_remain_actionable(self):
        repo = Repo()
        repo.reviews = [dict(state='CHANGES_REQUESTED', commit_id='a' * 40, user={'id': 1})]
        repo.comments = [dict(body=review['review_marker'](snapshot(1)))]
        self.assertEqual(review['choose'](repo, 3)['number'], 1)

    def test_marker_alone_does_not_override_local_attempt_evidence(self):
        repo = Repo()
        repo.reviews = [dict(state='CHANGES_REQUESTED', user={'id': 1})]
        repo.comments = [dict(body='<!-- agent-hub-manual-handoff:' + 'a' * 40 + ' -->')]
        self.assertEqual(review['choose'](repo, 3)['number'], 1)
        repo.comments = [dict(body='<!-- agent-hub-manual-handoff:' + 'c' * 40 + ' -->')]
        self.assertEqual(review['choose'](repo, 3)['number'], 1)

    def test_replaced_review_does_not_leave_old_rejection_active(self):
        repo = Repo()
        repo.reviews = [dict(state=state, commit_id='a' * 40, user={'id': 1})
                        for state in ('CHANGES_REQUESTED', 'APPROVED')]
        self.assertIsNone(review['choose'](repo, 3))

    def test_changed_or_closed_request_stops_launch(self):
        for current in (None, {**snapshot(1), 'head_sha': 'c' * 40}):
            repo = Repo(); repo.current = lambda number: current
            with self.assertRaisesRegex(RuntimeError, '变化'):
                review['choose'](repo, 3)

    def test_api_orders_by_creation_for_both_platforms(self):
        for provider, expected in [('github', 'sort=created&direction=asc'),
                                   ('gitlab', 'order_by=created_at&sort=asc')]:
            repo = host.Repository(provider, 'example.invalid', 'demo/project', ['cli'])
            with patch.object(repo, 'api', return_value=[]) as api:
                self.assertEqual(list(repo.requests(3)), [])
                self.assertIn(expected, api.call_args.args[0])

    def test_gitlab_requires_explicit_project_launcher(self):
        with self.assertRaises(RuntimeError):
            host.cli_argv({}, 'gitlab')
        self.assertEqual(host.cli_argv({'gitlab_cli': ['node', 'launcher.mjs']}, 'gitlab'), ['node', 'launcher.mjs'])

    def test_gitlab_unresolved_discussion_keeps_request_actionable(self):
        repo = Repo(); repo.provider = 'gitlab'
        repo.pages = lambda endpoint: [{'notes': [{'resolvable': True, 'resolved': False}]}]
        changes, _, _ = review['feedback'](repo, snapshot(1))
        self.assertTrue(changes)

    def test_launch_passes_callback_and_saves_only_private_state(self):
        with tempfile.TemporaryDirectory() as folder:
            state = RepairState(Path(folder) / '.local/state')
            globals_ = review['main'].__globals__
            with patch.dict(os.environ, {'AGENT_HUB_TASK_DIR': folder}):
                with patch.dict(globals_, load_host=lambda task: host,
                                load_repairs=lambda task, directory: state,
                                choose=lambda repo, pages, repairs: {
                                    **snapshot(1), 'title': 'Change', 'created_at': '2026-01-01T00:00:00Z'}):
                    with patch.object(host, 'read_json', return_value={}), patch.object(host, 'repository'):
                        with patch('runpy.run_path') as launcher:
                            launcher.return_value['main'].return_value = 0
                            self.assertEqual(review['main'](), 0)
                            context = launcher.return_value['main'].call_args.kwargs['prompt_context']
                            self.assertIn(snapshot(1)['url'], context)
                            self.assertIn('repair_state.py', context)
            data = json.loads(state.path.read_text())
            self.assertEqual(list(data['extensions']), ['mr_repair'])
            self.assertEqual(state.get(snapshot(1))['attempts'], [])
            self.assertEqual([p.name for p in Path(folder).iterdir()], ['.local'])

    def test_no_candidates_does_not_start_agent_or_write_state(self):
        with tempfile.TemporaryDirectory() as folder:
            state = RepairState(folder)
            globals_ = review['main'].__globals__
            with patch.dict(globals_, load_host=lambda task: host,
                            load_repairs=lambda task, directory: state,
                            choose=lambda repo, pages, repairs: None):
                with patch.object(host, 'read_json', return_value={}), patch.object(host, 'repository'):
                    with patch('runpy.run_path') as launcher:
                        self.assertEqual(review['main'](), 0)
                        launcher.assert_not_called()
            self.assertFalse(state.path.exists())

    def test_callback_persists_three_attempts_across_processes_and_rejects_fourth(self):
        with tempfile.TemporaryDirectory() as folder:
            state = RepairState(folder)
            key, _ = state.ensure(snapshot(1))
            command = [sys.executable, str(SCRIPT.with_name('repair_state.py')),
                       '--state-dir', folder, '--request', key, '--head', 'a' * 40, '--run-id', 'repair-1']
            for attempt in range(3):
                for action in ('begin', 'failed'):
                    result = subprocess.run([*command, '--action', action, '--evidence', 'validation failed'],
                                            capture_output=True, text=True)
                    self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(len(RepairState(folder).get(snapshot(1))['attempts']), attempt + 1)
            record = state.get(snapshot(1))
            self.assertEqual(record['status'], 'manual_pending')
            result = subprocess.run([*command, '--action', 'begin', '--head', 'c' * 40], capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(state.get(snapshot(1)), record)
            self.assertEqual(state.get(snapshot(1))['url'], snapshot(1)['url'])

    def test_local_handoff_persists_and_skips_request_even_after_new_commit(self):
        with tempfile.TemporaryDirectory() as folder:
            state = RepairState(folder); key, _ = state.ensure(snapshot(1))
            for _ in range(3):
                state.update(key, 'begin', 'a' * 40)
                state.update(key, 'failed', 'a' * 40, 'test failed')
            selected = review['choose'](Repo(), 3, state)
            self.assertEqual(selected['mode'], 'handoff_only')
            with self.assertRaises(RuntimeError):
                state.update(key, 'handoff', 'a' * 40, 'manual', 'https://example.invalid/#note')
            state.update(key, 'handoff', 'c' * 40, 'manual', snapshot(1)['url'] + '#note-1')
            self.assertEqual(review['choose'](Repo(), 3, RepairState(folder))['number'], 2)
            self.assertEqual(state.get(snapshot(1))['status'], 'manual')

    def test_unconfirmed_attempt_requires_reconciliation_and_blocks_new_begin(self):
        with tempfile.TemporaryDirectory() as folder:
            state = RepairState(folder); key, _ = state.ensure(snapshot(1))
            state.update(key, 'begin', 'a' * 40)
            with self.assertRaises(RuntimeError):
                state.update(key, 'begin', 'b' * 40)
            self.assertEqual(review['choose'](Repo(), 3, state)['mode'], 'reconcile_only')
            state.update(key, 'success', 'a' * 40, 'tests passed')
            self.assertEqual(review['choose'](Repo(), 3, state)['mode'], 'review_only')
            state.update(key, 'reviewed', 'a' * 40, 'independent tests passed',
                         run_id='review-2', base='b' * 40, verdict='passed',
                         standards='complete', spec='complete')
            self.assertEqual(review['choose'](Repo(), 3, state)['mode'], 'labels_only')

    def test_legacy_success_without_independent_evidence_requires_review(self):
        with tempfile.TemporaryDirectory() as folder:
            state = RepairState(folder); key, _ = state.ensure(snapshot(1))
            with state.locked() as requests:
                requests[key]['status'] = 'succeeded'
            self.assertEqual(review['choose'](Repo(), 3, state)['mode'], 'review_only')

    def test_extensions_preserve_other_tasks_data_and_release_lock_on_error(self):
        with tempfile.TemporaryDirectory() as folder:
            state = RepairState(folder)
            with state.storage.extension('maintenance') as extension:
                extension['last_check'] = 'retained'
            state.ensure(snapshot(1))
            with state.storage.extension('maintenance') as extension:
                self.assertEqual(extension['last_check'], 'retained')
                with self.assertRaises(RuntimeError):
                    state.ensure(snapshot(2))
            self.assertIsNone(state.get(snapshot(2)))
            state.ensure(snapshot(2))
            self.assertEqual(state.get(snapshot(2))['attempts'], [])

    def test_remote_handoff_is_saved_locally(self):
        with tempfile.TemporaryDirectory() as folder:
            state = RepairState(folder); repo = Repo()
            repo.items = repo.items[:1]
            key, _ = state.ensure(snapshot(1))
            for _ in range(3):
                state.update(key, 'begin', 'a' * 40)
                state.update(key, 'failed', 'a' * 40, 'test failed')
            repo.comments = [dict(body='<!-- agent-hub-manual-handoff:' + 'a' * 40 + ' -->', id=7)]
            self.assertIsNone(review['choose'](repo, 3, state))
            self.assertEqual(RepairState(folder).get(snapshot(1))['status'], 'manual')

    def test_corrupt_local_state_is_preserved(self):
        with tempfile.TemporaryDirectory() as folder:
            state = RepairState(folder); state.path.write_text('broken')
            with self.assertRaises(ValueError):
                state.ensure(snapshot(1))
            self.assertEqual(state.path.read_text(), 'broken')
            self.assertFalse((Path(folder) / '.task-state.lock').exists())


unittest.main()
