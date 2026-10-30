"""Verify real bundled scripts with fake Herdr responses; no agent or model is started."""
from pathlib import Path
from contextlib import redirect_stdout
import hashlib
import io
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
CONFIG = HERE / 'herdr.json'
ORIGINAL_CONFIG = CONFIG.read_text(encoding='utf-8')
OLD_NAME = 'ah-' + hashlib.sha256(str(HERE).encode()).hexdigest()[:8] + '-previous'


class HerdrChecks(unittest.TestCase):
    def setUp(self):
        STATE.unlink(missing_ok=True)
        self.calls = []
        self.output = io.StringIO()

    def tearDown(self):
        PROMPT.write_text(ORIGINAL, encoding='utf-8')
        CONFIG.write_text(ORIGINAL_CONFIG, encoding='utf-8')
        STATE.unlink(missing_ok=True)

    def execute(self, missing=False, running=True, status='done', previous='done', failure=None,
                output='Synthetic Herdr result', read_failure=None, config=None,
                missing_agent=False, pane_exists=False, lookup_failure=None,
                replacement_name=None, previous_after=None, pane_failure=None, progress=None, previous_completion=None,
                shell_busy=False, pane_cwd=None, start_failure=None):
        if config is not None:
            CONFIG.write_text(json.dumps(config), encoding='utf-8')
        previous_name = json.loads(STATE.read_text()).get('agent_name', OLD_NAME) if STATE.exists() else OLD_NAME
        lookups = 0
        observed = iter(progress or ['working', status])

        def error(args, code):
            return subprocess.CompletedProcess(args, 1, '', json.dumps({'error': {'code': code, 'message': code}}))
        def run(args, **options):
            nonlocal lookups
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
                    payload = {'result': {'root_pane': {'pane_id': 'w-test:p-test', 'workspace_id': 'w-test', 'tab_id': 'w-test:t-task'}}}
                elif command[:2] == ['agent', 'start']:
                    if start_failure:
                        return error(args, start_failure)
                    payload = {'result': {'agent': {'agent_status': 'idle', 'completion_seq': 1}}}
                elif command[:2] == ['agent', 'prompt']:
                    if failure:
                        return subprocess.CompletedProcess(args, 1, '', json.dumps({'error': {'code': failure, 'message': 'delivery uncertain'}}))
                    payload = {'result': {'agent': {'agent_status': status}}}
                elif command[:2] == ['agent', 'get']:
                    if command[2].startswith('w-test:') and lookups < (2 if previous != 'unknown' else 1):
                        lookups += 1
                        if lookup_failure or missing_agent:
                            return error(args, lookup_failure or 'agent_not_found')
                        payload = {'result': {'agent': {'agent_status': previous_after if lookups > 1 and previous_after else previous, 'name': replacement_name or previous_name, 'cwd': str(PROJECT)}}}
                        if previous_completion is not None:
                            payload['result']['agent']['completion_seq'] = previous_completion
                    else:
                        current = next(observed)
                        payload = {'result': {'agent': {'agent_status': current, 'completion_seq': 2 if current == 'done' else 1}}}
                elif command[:2] == ['pane', 'get']:
                    if not pane_exists:
                        return error(args, 'pane_not_found')
                    payload = {'result': {'pane': {'pane_id': 'w-test:p-test', 'workspace_id': 'w-test', 'tab_id': 'w-test:t-task', 'cwd': str(pane_cwd or PROJECT)}}}
                elif command[:2] == ['pane', 'process-info']:
                    payload = {'result': {'process_info': {'shell_pid': 201, 'foreground_processes': [{'pid': 202 if shell_busy else 201}]}}}
                elif command[:2] == ['pane', 'split']:
                    if pane_failure:
                        return error(args, pane_failure)
                    payload = {'result': {'pane': {'pane_id': 'w-test:p-next', 'workspace_id': 'w-test', 'tab_id': 'w-test:t-task'}}}
                elif command[:2] == ['pane', 'close']:
                    payload = {'result': {'type': 'ok'}}
                elif command[:2] == ['agent', 'read']:
                    if read_failure:
                        return subprocess.CompletedProcess(args, 1, '', json.dumps({'error': {'code': read_failure, 'message': 'read failed'}}))
                    return subprocess.CompletedProcess(args, 0, output, '')
                else:
                    raise AssertionError(command)
            return subprocess.CompletedProcess(args, 0, json.dumps(payload), '')
        with patch('shutil.which', return_value=None if missing else 'herdr'):
            with patch('subprocess.run', side_effect=run):
                with patch('pathlib.Path.cwd', return_value=PROJECT):
                    with self.assertRaises(SystemExit) as result, redirect_stdout(self.output), patch('time.sleep'):
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

    def test_working_prior_agent_skips_even_if_last_run_was_completed(self):
        for phase in ['submitted', 'completed', 'attention']:
            with self.subTest(phase=phase):
                state = {'session': 'default', 'pane': 'w-test:p-test',
                         'cwd': str(PROJECT), 'phase': phase}
                STATE.write_text(json.dumps(state))
                self.calls = []
                self.assertEqual(self.execute(previous='working'), 0)
                self.assertIn('跳过本次触发', self.output.getvalue())
                self.assertEqual(json.loads(STATE.read_text()), state)
                self.assertEqual([args[3:5] for args, _ in self.calls[1:]], [['agent', 'get']])

    def test_blocked_or_unknown_agent_is_preserved_even_after_completed_run(self):
        for status in ['blocked', 'unknown']:
            with self.subTest(status=status):
                STATE.write_text(json.dumps({'session': 'default', 'pane': 'w-test:p-test',
                                             'cwd': str(PROJECT), 'phase': 'completed'}))
                self.calls = []
                self.assertEqual(self.execute(previous=status), 1 if status == 'blocked' else 0)
                self.assertFalse(any('prompt' in args or 'create' in args for args, _ in self.calls))

    def test_terminal_output_is_preserved_as_plain_text(self):
        for output in ['检查完成。\n结果：无需处理。\n', '{"error": {"message": "quoted terminal content"}}', '']:
            with self.subTest(output=output):
                STATE.unlink(missing_ok=True)
                self.output = io.StringIO()
                self.assertEqual(self.execute(output=output), 0)
                self.assertIn(output, self.output.getvalue())
                self.assertEqual(json.loads(STATE.read_text())['phase'], 'completed')

    def test_read_failure_is_reported_without_resubmitting_prompt(self):
        result = self.execute(read_failure='agent_not_idle')
        self.assertIsInstance(result, str)
        self.assertIn('read failed', result)
        self.assertEqual(sum('prompt' in args for args, _ in self.calls), 1)

    def save_previous(self, phase='completed'):
        STATE.write_text(json.dumps({'session': 'default', 'pane': 'w-test:p-test',
                                     'cwd': str(PROJECT), 'workspace': 'w-test',
                                     'tab': 'w-test:t-task', 'agent_name': OLD_NAME,
                                     'phase': phase}))

    def test_closed_previous_pane_creates_one_replacement_tab(self):
        for phase in ['submitted', 'attention', 'completed']:
            with self.subTest(phase=phase):
                self.save_previous(phase)
                self.calls = []
                self.assertEqual(self.execute(missing_agent=True), 0)
                self.assertIn('已关闭', self.output.getvalue())
                calls = [args[3:5] for args, _ in self.calls[1:]]
                self.assertIn(['pane', 'get'], calls)
                self.assertEqual(calls.count(['tab', 'create']), 1)
                self.assertNotIn(['workspace', 'create'], calls)
                self.assertEqual(json.loads(STATE.read_text())['phase'], 'completed')

    def test_missing_agent_in_existing_pane_is_preserved(self):
        self.save_previous('attention')
        self.assertIsInstance(self.execute(missing_agent=True, pane_exists=True), str)
        self.assertFalse(any('create' in args or 'start' in args or 'close' in args for args, _ in self.calls))

    def test_startup_exit_resumes_in_the_existing_shell_without_new_layout(self):
        self.assertIsInstance(self.execute(start_failure='agent_not_ready'), str)
        state = json.loads(STATE.read_text())
        self.assertEqual(state['phase'], 'starting')
        self.assertFalse(state['prompt_attempted'])
        self.calls = []
        self.assertEqual(self.execute(missing_agent=True, pane_exists=True), 0)
        self.assertFalse(any('create' in args or 'split' in args or 'close' in args for args, _ in self.calls))
        self.assertEqual(sum('prompt' in args for args, _ in self.calls), 1)
        self.assertEqual(json.loads(STATE.read_text())['tab'], 'w-test:t-task')

    def test_completed_agent_exit_reuses_an_idle_shell_for_the_next_round(self):
        self.save_previous()
        self.assertEqual(self.execute(missing_agent=True, pane_exists=True), 0)
        self.assertFalse(any('create' in args or 'split' in args or 'close' in args for args, _ in self.calls))
        self.assertEqual(sum('start' in args for args, _ in self.calls), 1)

    def test_busy_shell_is_skipped_without_input_or_layout_changes(self):
        self.save_previous('starting')
        self.assertEqual(self.execute(missing_agent=True, pane_exists=True, shell_busy=True), 0)
        self.assertFalse(any('create' in args or 'start' in args or 'prompt' in args for args, _ in self.calls))
        self.assertEqual(json.loads(STATE.read_text())['phase'], 'starting')

    def test_shell_in_a_different_project_is_not_reused(self):
        self.save_previous('starting')
        self.assertIsInstance(self.execute(missing_agent=True, pane_exists=True, pane_cwd=HERE), str)
        self.assertFalse(any('create' in args or 'start' in args or 'prompt' in args for args, _ in self.calls))

    def test_unknown_startup_without_a_prompt_is_skipped_without_waiting_for_a_result(self):
        self.save_previous('starting')
        state = json.loads(STATE.read_text()); state['prompt_attempted'] = False
        STATE.write_text(json.dumps(state))
        self.assertEqual(self.execute(previous='unknown'), 0)
        self.assertFalse(any('read' in args or 'prompt' in args or 'start' in args for args, _ in self.calls))

    def test_only_codex_receives_the_unattended_update_override(self):
        for kind in ['codex', 'claude']:
            with self.subTest(kind=kind):
                STATE.unlink(missing_ok=True); self.calls = []
                self.assertEqual(self.execute(config={'agent': kind}), 0)
                start = next(args for args, _ in self.calls if 'start' in args)
                self.assertEqual('check_for_update_on_startup=false' in start, kind == 'codex')

    def test_unavailable_server_does_not_mean_previous_pane_was_closed(self):
        self.save_previous()
        self.assertIsInstance(self.execute(lookup_failure='connection_failed'), str)
        self.assertFalse(any('create' in args or 'start' in args or 'close' in args for args, _ in self.calls))

    def test_completed_agent_is_replaced_in_same_tab_with_a_fresh_agent(self):
        self.save_previous()
        self.assertEqual(self.execute(), 0)
        calls = [args for args, _ in self.calls]
        split = next(args for args in calls if 'split' in args)
        self.assertIn('--no-focus', split)
        self.assertEqual(split[split.index('--cwd') + 1], str(PROJECT))
        closed = next(args for args in calls if 'close' in args)
        self.assertEqual(closed[-1], 'w-test:p-test')
        start = next(args for args in calls if 'start' in args)
        self.assertEqual(start[start.index('--pane') + 1], 'w-test:p-next')
        self.assertNotEqual(start[start.index('start') + 1], OLD_NAME)
        self.assertFalse(any('create' in args or 'send-keys' in args for args in calls))
        self.assertEqual(json.loads(STATE.read_text())['tab'], 'w-test:t-task')
        self.assertEqual(json.loads(STATE.read_text())['pane'], 'w-test:p-next')

    def test_replaced_or_newly_working_agent_is_never_closed(self):
        for options in [{'replacement_name': 'user-agent'}, {'previous_after': 'working'}]:
            with self.subTest(options=options):
                self.save_previous()
                self.calls = []
                self.assertIsInstance(self.execute(**options), str)
                self.assertFalse(any('close' in args or 'start' in args or 'prompt' in args for args, _ in self.calls))

    def test_pending_old_agent_replacement_cannot_start_a_second_agent_on_retry(self):
        self.save_previous()
        self.assertIsInstance(self.execute(previous_after='working'), str)
        state = json.loads(STATE.read_text())
        self.assertEqual(state['replacement_pending'], 'w-test:p-test')
        self.calls = []
        self.assertIsInstance(self.execute(missing_agent=True, pane_exists=True), str)
        self.assertFalse(any('start' in args or 'prompt' in args for args, _ in self.calls))

    def test_failed_pane_replacement_is_not_repeated(self):
        self.save_previous()
        self.assertIsInstance(self.execute(pane_failure='timeout'), str)
        self.assertEqual(json.loads(STATE.read_text())['phase'], 'attention')
        self.calls = []
        self.assertEqual(self.execute(), 1)
        self.assertFalse(any('split' in args or 'close' in args or 'start' in args for args, _ in self.calls))

    def test_extra_arguments_follow_defaults_and_remain_literal_data(self):
        self.assertEqual(self.execute(config={
            'session': 'default', 'agent': 'codex',
            'arguments': ['--dangerously-bypass-approvals-and-sandbox'],
            'extra_arguments': '-m model-id -c \'name="value with spaces"\' --literal "$(touch NEVER)"',
        }), 0)
        start = next(args for args, _ in self.calls if 'start' in args)
        self.assertEqual(start[start.index('--') + 1:], [
            '-c', 'check_for_update_on_startup=false',
            '--dangerously-bypass-approvals-and-sandbox', '-m', 'model-id',
            '-c', 'name="value with spaces"', '--literal', '$(touch NEVER)',
        ])
        self.assertTrue(all(not options.get('shell') for _, options in self.calls))

    def test_invalid_extra_arguments_never_create_a_session(self):
        for value in ['-m "unterminated', ['--model'], 'nul\0value']:
            with self.subTest(value=value):
                self.calls = []
                self.assertIsInstance(self.execute(config={'agent': 'codex', 'extra_arguments': value}), str)
                self.assertFalse(self.calls)

    def test_unknown_startup_keeps_observing_until_completion_without_resubmission(self):
        self.assertEqual(self.execute(progress=['unknown', 'unknown', 'working', 'done']), 0)
        self.assertIn('状态识别中', self.output.getvalue())
        prompts = [args for args, _ in self.calls if 'prompt' in args]
        self.assertEqual(len(prompts), 1)
        self.assertNotIn('--wait', prompts[0])
        self.assertEqual(json.loads(STATE.read_text())['phase'], 'completed')

    def test_legacy_five_second_stall_continues_observing_the_same_agent(self):
        self.assertEqual(self.execute(failure='agent_prompt_stalled', progress=['unknown', 'working', 'done']), 0)
        self.assertEqual(sum('prompt' in args for args, _ in self.calls), 1)
        self.assertIn('不会重复投递', self.output.getvalue())

    def test_initial_idle_is_not_mistaken_for_task_completion(self):
        self.assertEqual(self.execute(progress=['idle', 'unknown', 'working', 'done']), 0)
        gets = [args for args, _ in self.calls if 'get' in args]
        self.assertEqual(len(gets), 4)

    def test_fast_completion_is_detected_by_completion_sequence(self):
        self.assertEqual(self.execute(progress=['done']), 0)
        self.assertEqual(sum('get' in args for args, _ in self.calls), 1)

    def test_previously_uncertain_run_recovers_completed_result_without_new_prompt(self):
        self.save_previous('attention')
        self.assertEqual(self.execute(previous='done', previous_completion=2), 0)
        self.assertFalse(any('prompt' in args or 'create' in args or 'split' in args for args, _ in self.calls))
        self.assertIn('仅收回已有结果', self.output.getvalue())
        self.assertEqual(json.loads(STATE.read_text())['phase'], 'completed')

    def test_uncertain_delivery_requires_attention_and_is_not_retried(self):
        self.assertIsInstance(self.execute(failure='timeout'), str)
        self.assertEqual(json.loads(STATE.read_text())['phase'], 'attention')
        self.calls = []
        self.assertEqual(self.execute(previous='idle'), 1)
        self.assertFalse(any('prompt' in args or 'create' in args for args, _ in self.calls))

    def test_blocked_completion_is_not_success(self):
        self.assertEqual(self.execute(status='blocked'), 1)
        self.assertEqual(json.loads(STATE.read_text())['phase'], 'attention')
        read = next(args for args, _ in self.calls if 'read' in args)
        self.assertEqual(read[-2:], ['--source', 'visible'])


unittest.main()
