"""Verify real bundled scripts with fake Herdr responses; no agent or model is started."""
from pathlib import Path
import json
import runpy
import subprocess
import sys
import unittest
from unittest.mock import patch

SCRIPT = Path(sys.argv.pop()).resolve()
HERE = SCRIPT.parent
PROJECT = HERE.parent / 'selected-project'
PROJECT.mkdir(exist_ok=True)
PROMPT = HERE / 'prompt.md'
ORIGINAL = PROMPT.read_text(encoding='utf-8')
STATE = HERE / '.herdr-run.json'


class HerdrChecks(unittest.TestCase):
    def setUp(self):
        STATE.unlink(missing_ok=True)
        self.calls = []

    def tearDown(self):
        PROMPT.write_text(ORIGINAL, encoding='utf-8')
        STATE.unlink(missing_ok=True)

    def execute(self, missing=False, running=True, status='done', previous='done', failure=None):
        def run(args, **options):
            self.calls.append((args, options))
            assert args[0] == 'herdr', args
            command = args[1:]
            if command[:2] == ['session', 'list']:
                payload = {'sessions': [{'name': 'default', 'running': running}]}
            else:
                assert command[:2] == ['--session', 'default'], command
                command = command[2:]
                if command[:2] == ['workspace', 'list']:
                    payload = {'result': {'workspaces': [{'workspace_id': 'w-test', 'worktree': {'checkout_path': str(PROJECT)}}]}}
                elif command[:2] == ['tab', 'create']:
                    payload = {'result': {'root_pane': {'pane_id': 'w-test:p-test', 'workspace_id': 'w-test'}}}
                elif command[:2] == ['agent', 'start']:
                    payload = {'result': {'agent': {'agent_status': 'idle'}}}
                elif command[:2] == ['agent', 'prompt']:
                    if failure:
                        return subprocess.CompletedProcess(args, 1, '', json.dumps({'error': {'code': failure, 'message': 'delivery uncertain'}}))
                    payload = {'result': {'agent': {'agent_status': status}}}
                elif command[:2] == ['agent', 'get']:
                    payload = {'result': {'agent': {'agent_status': previous}}}
                elif command[:2] == ['agent', 'read']:
                    payload = {'result': {'text': 'Synthetic Herdr result'}}
                else:
                    raise AssertionError(command)
            return subprocess.CompletedProcess(args, 0, json.dumps(payload), '')
        with patch('shutil.which', return_value=None if missing else 'herdr'):
            with patch('subprocess.run', side_effect=run):
                with patch('pathlib.Path.cwd', return_value=PROJECT):
                    with self.assertRaises(SystemExit) as result:
                        runpy.run_path(str(SCRIPT), run_name='__main__')
        return result.exception.code

    def test_launches_in_explicit_project_without_focus_and_passes_prompt_as_data(self):
        prompt = "Review\n$(touch NEVER) `quoted` 中文"
        PROMPT.write_text(prompt, encoding='utf-8')
        self.assertEqual(self.execute(), 0)
        calls = [args for args, _ in self.calls]
        tab = next(args for args in calls if 'create' in args)
        self.assertIn('--no-focus', tab)
        self.assertEqual(tab[tab.index('--cwd') + 1], str(PROJECT))
        submitted = next(args for args in calls if 'prompt' in args)
        self.assertEqual(submitted[submitted.index('prompt') + 2], prompt)
        self.assertTrue(all(not options.get('shell') for _, options in self.calls))
        self.assertEqual(json.loads(STATE.read_text())['phase'], 'completed')

    def test_missing_cli_or_inactive_session_never_launches(self):
        self.assertIsInstance(self.execute(missing=True), str)
        self.assertFalse(self.calls)
        self.assertIsInstance(self.execute(running=False), str)
        self.assertFalse(any('create' in args for args, _ in self.calls))

    def test_working_or_blocked_prior_agent_is_not_prompted_again(self):
        for status in ['working', 'blocked', 'unknown']:
            STATE.write_text(json.dumps({'session': 'default', 'pane': 'w-test:p-test', 'cwd': str(PROJECT), 'phase': 'submitted'}))
            self.calls = []
            self.execute(previous=status)
            self.assertFalse(any('prompt' in args or 'create' in args for args, _ in self.calls))

    def test_uncertain_delivery_requires_attention_and_is_not_retried(self):
        self.assertIsInstance(self.execute(failure='agent_prompt_stalled'), str)
        self.assertEqual(json.loads(STATE.read_text())['phase'], 'attention')
        self.calls = []
        self.assertEqual(self.execute(previous='idle'), 1)
        self.assertFalse(any('prompt' in args or 'create' in args for args, _ in self.calls))

    def test_blocked_completion_is_not_success(self):
        self.assertEqual(self.execute(status='blocked'), 1)
        self.assertEqual(json.loads(STATE.read_text())['phase'], 'attention')


unittest.main()
