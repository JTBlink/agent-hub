"""Exercise the installed preflight with fake CLI responses, without a model or network."""
from contextlib import redirect_stdout
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

SCRIPT = Path(sys.argv.pop()).resolve()
sys.dont_write_bytecode = True
sys.path.insert(0, str(SCRIPT.parent))
import review


class ReviewPreflightChecks(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.task = Path(self.temp.name)
        self.state = self.task / '.local/state'
        (self.task / 'scripts').mkdir()
        (self.task / 'config').mkdir()
        self.config = {'provider': 'auto', 'remote': None, 'max_pages': 3}
        self.url = 'git@github.com:example/project.git'
        self.remotes = 'origin\n'
        self.tracked = 'origin\n'
        self.provider = 'github'
        self.head, self.base = 'a' * 40, 'b' * 40
        self.items = [self.request()]
        self.calls, self.starts = [], []
        self.report_override = None
        self.report_missing = False
        self.launch_status = 0
        self.finished = True
        self.detail_changes = []
        self.api_failure = False
        self.pages = None

    def tearDown(self):
        self.temp.cleanup()

    def request(self, number=1, draft=False):
        if self.provider == 'github':
            return {'number': number, 'state': 'open', 'draft': draft,
                    'head': {'sha': self.head}, 'base': {'sha': self.base, 'ref': 'main'},
                    'html_url': f'https://github.com/example/project/pull/{number}'}
        return {'iid': number, 'state': 'opened', 'draft': draft, 'sha': self.head,
                'target_branch': 'release/main',
                'web_url': f'https://gitlab.com/example/team/project/-/merge_requests/{number}'}

    def command(self, args, **options):
        self.calls.append(args)
        code = 0
        if args[:2] == ['git', 'rev-parse']:
            output = '/workspace/project\n'
        elif args == ['git', 'remote']:
            output = self.remotes
        elif args[:2] == ['git', 'symbolic-ref']:
            output = 'main\n'
        elif args[:2] == ['git', 'config']:
            output = self.tracked
            code = 0 if output else 1
        elif args[:3] == ['git', 'remote', 'get-url']:
            output = self.url
        elif 'auth' in args:
            output = ''
            code = 0 if args[0] == ('gh' if self.provider == 'github' else 'glab') else 1
        elif 'api' in args:
            self.assertIn('--hostname', args)
            self.assertEqual(args[args.index('--method') + 1], 'GET')
            if self.api_failure:
                return subprocess.CompletedProcess(args, 1, '', 'synthetic API failure')
            endpoint = args[-1]
            if '/repository/branches/' in endpoint:
                output = json.dumps({'commit': {'id': self.base}})
            elif '?' in endpoint:
                page = int(endpoint.rsplit('page=', 1)[1])
                output = json.dumps(self.pages[page - 1] if self.pages else self.items)
            elif self.detail_changes:
                output = json.dumps(self.detail_changes.pop(0))
            else:
                number = int(endpoint.rsplit('/', 1)[1])
                output = json.dumps(next(item for item in self.items if item.get('number', item.get('iid')) == number))
        else:
            raise AssertionError(args)
        return subprocess.CompletedProcess(args, code, output, '')

    def start(self, context):
        self.starts.append(context)
        contract = json.loads(context.splitlines()[-1])
        self.state.mkdir(parents=True, exist_ok=True)
        (self.state / '.herdr-run.json').write_text(json.dumps({'phase': 'completed' if self.finished else 'submitted'}))
        if not self.report_missing:
            report = contract['report_shape']
            report['summary'] = 'Synthetic review with separate findings'
            report['standards']['findings'] = [{'file': 'src/example.rs:10', 'impact': 'Synthetic finding', 'blocking': False}]
            report['publication'] = {'status': 'published', 'url': 'https://' + report['host'] + ('/example/project/pull/' if self.provider == 'github' else '/example/team/project/-/merge_requests/') + str(report['number']) + '#review-1', 'decision': 'comment'}
            if self.report_override:
                report.update(self.report_override)
            Path(contract['result_file']).write_text(json.dumps(report))
        return self.launch_status

    def execute(self, check=False):
        (self.task / 'config/review-config.json').write_text(json.dumps(self.config))
        with patch.object(review, 'TASK', self.task), patch.object(review, 'STATE', self.state):
            with patch('subprocess.run', side_effect=self.command), redirect_stdout(io.StringIO()):
                return review.main(check_only=check, start=self.start)

    def test_empty_or_draft_only_repository_never_starts_agent(self):
        for items in ([], [self.request(draft=True)]):
            self.items = items
            self.assertEqual(self.execute(), 0)
        self.assertEqual(self.starts, [])
        self.assertFalse(self.state.exists())

    def test_github_review_is_deduplicated_but_head_and_base_changes_are_reviewed(self):
        self.assertEqual(self.execute(), 0)
        self.assertEqual(self.execute(), 0)
        self.assertEqual(len(self.starts), 1)
        self.head = 'c' * 40
        self.items = [self.request()]
        self.assertEqual(self.execute(), 0)
        self.base = 'd' * 40
        self.items = [self.request()]
        self.assertEqual(self.execute(), 0)
        self.assertEqual(len(self.starts), 3)
        self.assertEqual(len(list((self.state / 'reviews').glob('*.json'))), 1)
        self.assertTrue(all(call[0] != 'glab' for call in self.calls))

    def test_old_local_only_receipt_is_reviewed_again(self):
        self.assertEqual(self.execute(), 0)
        receipt = next((self.state / 'reviews').glob('*.json'))
        report = json.loads(receipt.read_text())
        report.pop('publication')
        receipt.write_text(json.dumps(report))
        self.assertEqual(self.execute(), 0)
        self.assertEqual(len(self.starts), 2)
        self.assertEqual(json.loads(receipt.read_text())['publication']['status'], 'published')

    def test_gitlab_nested_project_and_target_branch_are_encoded(self):
        self.provider = 'gitlab'
        self.url = 'ssh://git@gitlab.com/example/team/project.git'
        self.items = [self.request()]
        self.assertEqual(self.execute(), 0)
        apis = [call[-1] for call in self.calls if 'api' in call]
        self.assertTrue(any('projects/example%2Fteam%2Fproject/merge_requests' in item for item in apis))
        self.assertTrue(any('branches/release%2Fmain' in item for item in apis))
        self.assertTrue(all(call[0] != 'gh' for call in self.calls))

    def test_one_candidate_per_run_and_later_pages_are_checked(self):
        self.pages = [[self.request(number=n, draft=True) for n in range(1, 101)],
                      [self.request(number=101), self.request(number=102)]]
        self.items = self.pages[1]
        self.assertEqual(self.execute(), 0)
        self.assertEqual(len(self.starts), 1)
        self.assertIn('/pull/101', self.starts[0])

    def test_check_mode_lists_candidate_without_starting_or_writing_state(self):
        self.assertEqual(self.execute(check=True), 0)
        self.assertEqual(self.starts, [])
        self.assertFalse(self.state.exists())

    def test_api_failure_is_not_treated_as_an_empty_repository(self):
        self.api_failure = True
        with self.assertRaises(RuntimeError):
            self.execute()
        self.assertEqual(self.starts, [])

    def test_ambiguous_remotes_require_selection_and_explicit_remote_is_respected(self):
        self.remotes, self.tracked = 'origin\nupstream\n', ''
        with self.assertRaises(RuntimeError):
            self.execute()
        self.config['remote'] = 'upstream'
        self.assertEqual(self.execute(check=True), 0)
        self.assertIn(['git', 'remote', 'get-url', '--', 'upstream'], self.calls)
        self.assertEqual(self.starts, [])

    def test_self_host_is_detected_from_host_specific_auth(self):
        self.provider = 'gitlab'
        self.url = 'git@code.example.invalid:example/team/project.git'
        self.items = []
        self.assertEqual(self.execute(), 0)
        statuses = [call for call in self.calls if 'auth' in call]
        self.assertEqual(len(statuses), 2)
        self.assertTrue(all(call[-1] == 'code.example.invalid' for call in statuses))

    def test_configured_launcher_is_used_as_argv_without_a_fallback(self):
        self.config['github_cli'] = ['node', '~/custom launcher.mjs']
        self.assertEqual(self.execute(check=True), 0)
        apis = [call for call in self.calls if 'api' in call]
        self.assertTrue(all(call[:2] == ['node', str(Path.home() / 'custom launcher.mjs')] for call in apis))
        self.assertEqual(self.starts, [])

    def test_incomplete_report_is_not_cached_or_relaunched(self):
        self.report_missing = True
        for _ in range(2):
            with self.assertRaises(RuntimeError):
                self.execute()
        self.assertEqual(len(self.starts), 1)
        self.assertFalse((self.state / 'reviews').exists())

    def test_stale_report_identity_is_not_accepted(self):
        self.report_override = {'head_sha': 'f' * 40}
        with self.assertRaises(RuntimeError):
            self.execute()
        self.assertFalse((self.state / 'reviews').exists())

    def test_confirmed_missing_spec_is_recorded_without_claiming_spec_passed(self):
        self.report_override = {'spec': {'status': 'unavailable', 'reason': 'Confirmed no spec', 'findings': []}}
        self.assertEqual(self.execute(), 0)
        report = json.loads(next((self.state / 'reviews').glob('*.json')).read_text())
        self.assertEqual(report['spec']['status'], 'unavailable')

    def test_unpublished_or_wrong_request_comment_is_not_cached(self):
        for publication in ({'status': 'pending'},
                            {'status': 'published', 'url': 'https://github.com/other/project/pull/1#r',
                             'decision': 'comment'}):
            with self.subTest(publication=publication):
                self.report_override = {'publication': publication}
                for result in self.state.glob('review-result-*.json'):
                    report = json.loads(result.read_text())
                    report['publication'] = publication
                    result.write_text(json.dumps(report))
                with self.assertRaises(RuntimeError):
                    self.execute()
                self.assertFalse((self.state / 'reviews').exists())

    def test_blocking_findings_require_request_changes_or_reported_limitation(self):
        self.report_override = {
            'standards': {'status': 'complete', 'findings': [
                {'file': 'src/example.rs:10', 'impact': 'Broken behavior', 'blocking': True}]},
            'publication': {'status': 'published', 'decision': 'comment',
                            'url': 'https://github.com/example/project/pull/1#review-1'}}
        with self.assertRaises(RuntimeError):
            self.execute()
        self.report_override['publication']['reason'] = 'Self-review cannot request changes'
        # Complete the retained round, without starting a second agent.
        result = next(self.state.glob('review-result-*.json'))
        report = json.loads(result.read_text())
        report['publication'] = self.report_override['publication']
        result.write_text(json.dumps(report))
        self.assertEqual(self.execute(), 0)
        self.assertEqual(len(self.starts), 1)

    def test_request_changes_is_recorded_for_blocking_findings(self):
        self.report_override = {
            'spec': {'status': 'complete', 'findings': [
                {'file': 'src/example.rs:10', 'impact': 'Missing requirement', 'blocking': True}]},
            'publication': {'status': 'published', 'decision': 'request_changes',
                            'url': 'https://github.com/example/project/pull/1#review-1'}}
        self.assertEqual(self.execute(), 0)
        report = json.loads(next((self.state / 'reviews').glob('*.json')).read_text())
        self.assertEqual(report['publication']['decision'], 'request_changes')

    def test_closed_request_before_launch_does_not_start_agent(self):
        self.detail_changes = [{**self.request(), 'state': 'closed'}]
        self.assertEqual(self.execute(), 0)
        self.assertEqual(self.starts, [])

    def test_changed_request_after_review_is_not_cached(self):
        self.detail_changes = [self.request(), {**self.request(), 'head': {'sha': 'f' * 40}}]
        with self.assertRaises(RuntimeError):
            self.execute()
        self.assertFalse((self.state / 'reviews').exists())
        self.assertFalse((self.state / 'review-pending.json').exists())

    def test_finished_pending_report_is_collected_without_starting_another_agent(self):
        self.finished = False
        self.assertEqual(self.execute(), 0)
        (self.state / '.herdr-run.json').write_text(json.dumps({'phase': 'completed'}))
        self.assertEqual(self.execute(), 0)
        self.assertEqual(len(self.starts), 1)
        self.assertTrue((self.state / 'reviews').exists())

    def test_pending_launch_with_no_confirmed_state_is_not_repeated(self):
        self.finished = False
        self.report_missing = True
        self.assertEqual(self.execute(), 0)
        (self.state / '.herdr-run.json').unlink()
        with self.assertRaises(RuntimeError):
            self.execute()
        self.assertEqual(len(self.starts), 1)

    def test_interrupted_round_without_report_never_submits_again(self):
        self.finished = False
        self.report_missing = True
        self.assertEqual(self.execute(), 0)
        self.assertEqual(self.execute(), 0)
        self.assertEqual(len(self.starts), 1)

    def test_report_survives_launcher_interruption_without_completed_pane_marker(self):
        self.finished = False
        self.assertEqual(self.execute(), 0)
        self.assertEqual(self.execute(), 0)
        self.assertEqual(len(self.starts), 1)
        self.assertTrue((self.state / 'reviews').exists())

    @unittest.skipIf(os.name == 'nt', 'Executable stubs use POSIX shebangs')
    def test_copied_preflight_runs_in_a_fresh_process_without_app_environment(self):
        bundle = self.task / 'independent package'
        shutil.copytree(SCRIPT.parent, bundle / 'scripts')
        shutil.copytree(SCRIPT.parent.parent / 'config', bundle / 'config')
        project = self.task / 'project'
        project.mkdir()
        tools = self.task / 'tools'
        tools.mkdir()
        (tools / 'python3').symlink_to(sys.executable)
        git = tools / 'git'
        git.write_text('''#!/usr/bin/env python3
import sys
args = sys.argv[1:]
if args[:1] == ['rev-parse']:
    print('/workspace/project')
elif args == ['remote'] or args[:1] == ['config']:
    print('origin')
elif args[:1] == ['symbolic-ref']:
    print('main')
elif args[:2] == ['remote', 'get-url']:
    print('https://github.com/example/project.git')
else:
    sys.exit(1)
''')
        gh = tools / 'gh'
        gh.write_text('#!/usr/bin/env python3\nprint("[]")\n')
        for binary in (git, gh):
            binary.chmod(0o755)
        env = {key: value for key, value in os.environ.items() if not key.startswith('AGENT_HUB_')}
        env['PATH'] = str(tools) + os.pathsep + env.get('PATH', '')
        env['HOME'] = str(self.task / 'empty-home')
        result = subprocess.run([sys.executable, str(bundle / 'scripts/review.py')],
                                cwd=project, env=env, capture_output=True, text=True, timeout=20)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('未启动 Agent', result.stdout)
        self.assertFalse((bundle / '.local').exists())


unittest.main()
