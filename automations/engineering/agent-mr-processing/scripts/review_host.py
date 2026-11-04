"""Read repository identity and open review requests through the platform CLI."""
from dataclasses import dataclass
import json
import os
from pathlib import Path
import re
import subprocess
from urllib.parse import quote, urlsplit


def command(args, optional=False):
    result = subprocess.run(args, capture_output=True, text=True, encoding="utf-8",
                            timeout=45, check=False,
                            env={**os.environ, "GH_PROMPT_DISABLED": "1"})
    if result.returncode and not optional:
        if any(value in result.stderr.lower() for value in ('403', 'forbidden', 'insufficient permission')):
            raise RuntimeError("平台操作权限不足；未切换工具或身份。")
        raise RuntimeError(f"{Path(args[0]).name} 命令失败（{result.returncode}），请检查仓库、登录与网络。")
    return result


def read_json(path):
    text = path.read_text(encoding="utf-8-sig")
    if text.startswith("# AgentHub automation script:"):
        text = text.partition("\n")[2]
    return json.loads(text)


def remote_identity(url):
    if "://" not in url:
        match = re.fullmatch(r"(?:[^/@:]+@)?([^/:]+):(.+)", url)
        if not match:
            raise RuntimeError("Git remote 不是支持的 HTTPS/SSH 仓库地址。")
        host, path = match.groups()
    else:
        parsed = urlsplit(url)
        if parsed.scheme not in ("http", "https", "ssh", "git") or not parsed.hostname:
            raise RuntimeError("Git remote 不是支持的 HTTPS/SSH 仓库地址。")
        host = parsed.hostname
        if parsed.scheme in ("http", "https") and parsed.port:
            host += f":{parsed.port}"
        path = parsed.path.lstrip("/")
    host = host.lower()
    path = path.rstrip("/").removesuffix(".git")
    if not re.fullmatch(r"[a-z0-9.-]+(?::[0-9]+)?", host) or any(
        part in ("", ".", "..") or not re.fullmatch(r"[\w.-]+", part)
        for part in path.split("/")
    ) or len(path.split("/")) < 2:
        raise RuntimeError("Git remote 的主机或仓库路径无效。")
    return host, path


def cli_argv(config, provider):
    default = "gh" if provider == "github" else "glab"
    args = config.get(f"{provider}_cli", [default] if provider == "github" else None)
    if not isinstance(args, list) or not args or not all(
        isinstance(arg, str) and arg and "\0" not in arg for arg in args
    ):
        raise RuntimeError("平台 CLI 必须配置为非空 argv 数组。")
    return [os.path.expanduser(arg) if arg.startswith("~/") else arg for arg in args]


def repository(config):
    command(["git", "rev-parse", "--show-toplevel"])
    remotes = command(["git", "remote"]).stdout.split()
    remote = config.get("remote")
    if not remote:
        branch = command(["git", "symbolic-ref", "--quiet", "--short", "HEAD"], True)
        tracked = command(["git", "config", "--get", f"branch.{branch.stdout.strip()}.remote"], True)
        remote = tracked.stdout.strip() if branch.returncode == 0 else None
        if not remote and len(remotes) == 1:
            remote = remotes[0]
    if remote not in remotes:
        raise RuntimeError("无法唯一确定远端，请在 config/review-config.json 的 remote 中指定现有 Git remote。")
    host, path = remote_identity(command(["git", "remote", "get-url", "--", remote]).stdout.strip())
    preflight = config.get("project_preflight", [])
    if preflight:
        if not isinstance(preflight, list) or not all(isinstance(arg, str) and arg for arg in preflight):
            raise RuntimeError("project_preflight 必须为 argv 数组。")
        result = command([os.path.expanduser(arg) if arg.startswith("~/") else arg for arg in preflight])
        expected = config.get("project_preflight_expected", {})
        if expected:
            actual = json.loads(result.stdout)
            if not isinstance(expected, dict) or not isinstance(actual, dict) or any(
                actual.get(key) != value for key, value in expected.items()
            ):
                raise RuntimeError("项目校验结果不符合已配置的激活条件。")
    provider = config.get("provider", "auto")
    if provider == "auto":
        provider = {"github.com": "github", "gitlab.com": "gitlab"}.get(host)
        if not provider:
            authenticated = []
            for candidate in ("github", "gitlab"):
                try:
                    status = command([*cli_argv(config, candidate), "auth", "status", "--hostname", host], True)
                    if status.returncode == 0:
                        authenticated.append(candidate)
                except (FileNotFoundError, RuntimeError):
                    pass
            if len(authenticated) != 1:
                raise RuntimeError("无法确认自建主机的平台，请在 config/review-config.json 指定 provider 并完成对应 CLI 登录。")
            provider = authenticated[0]
    if provider not in ("github", "gitlab"):
        raise RuntimeError("config/review-config.json 的 provider 必须为 auto、github 或 gitlab。")
    if provider == "github" and len(path.split("/")) != 2:
        raise RuntimeError("GitHub remote 必须包含 owner/repository。")
    repo = Repository(provider, host, path, cli_argv(config, provider))
    command([*repo.cli, "auth", "status", "--hostname", host])
    identity = repo.api("user")
    if not isinstance(identity, dict) or not identity.get("id"):
        raise RuntimeError("无法核实平台登录身份。")
    project = repo.api(f"repos/{quote(path, safe='/')}" if provider == "github" else f"projects/{quote(path, safe='')}")
    actual = project.get("full_name" if provider == "github" else "path_with_namespace", "")
    if actual.casefold() != path.casefold():
        raise RuntimeError("平台仓库与实际 remote 不一致。")
    return repo


@dataclass
class Repository:
    provider: str
    host: str
    path: str
    cli: list

    def api(self, endpoint, method="GET", fields=None):
        args = [*self.cli, "api", "--hostname", self.host, "--method", method, endpoint]
        for key, value in (fields or {}).items():
            args.extend(["--raw-field", f"{key}={value}"])
        result = command(args)
        return json.loads(result.stdout) if result.stdout.strip() else None

    @property
    def endpoint(self):
        if self.provider == "github":
            return f"repos/{quote(self.path, safe='/')}/pulls"
        return f"projects/{quote(self.path, safe='')}/merge_requests"

    def requests(self, pages):
        for page in range(1, pages + 1):
            query = "state=open&sort=created&direction=asc" if self.provider == "github" else (
                "state=opened&scope=all&order_by=created_at&sort=asc"
            )
            items = self.api(f"{self.endpoint}?{query}&per_page=100&page={page}")
            if not isinstance(items, list):
                raise RuntimeError("平台未返回有效的 PR/MR 列表。")
            yield from items
            if len(items) < 100:
                return
        print(f"已检查前 {pages * 100} 个开放请求；可调整 config/review-config.json 的 max_pages。", flush=True)

    def pages(self, endpoint):
        result = []
        for page in range(1, 101):
            items = self.api(f"{endpoint}?per_page=100&page={page}")
            if not isinstance(items, list):
                raise RuntimeError("平台反馈分页无效。")
            result.extend(items)
            if len(items) < 100:
                return result
        raise RuntimeError("平台反馈超出分页上限，无法确认审查状态。")

    def snapshot(self, item):
        if not isinstance(item, dict):
            raise RuntimeError("平台返回的 PR/MR 数据无效。")
        opened = "open" if self.provider == "github" else "opened"
        if item.get("state") != opened or item.get("draft") or item.get("work_in_progress"):
            return None
        number = item.get("number" if self.provider == "github" else "iid")
        if not isinstance(number, int) or isinstance(number, bool) or number < 1:
            raise RuntimeError("平台返回的 PR/MR 编号无效。")
        if self.provider == "github":
            head, base = item.get("head", {}), item.get("base", {})
            head_sha, base_sha, target = head.get("sha"), base.get("sha"), base.get("ref")
            url = item.get("html_url")
        else:
            head_sha, target, url = item.get("sha"), item.get("target_branch"), item.get("web_url")
            if not isinstance(target, str) or not target:
                raise RuntimeError("GitLab MR 尚无目标分支。")
            branch = self.api(f"projects/{quote(self.path, safe='')}/repository/branches/{quote(target, safe='')}")
            base_sha = branch.get("commit", {}).get("id")
        if not all(isinstance(sha, str) and re.fullmatch(r"[0-9a-f]{40,64}", sha)
                   for sha in (head_sha, base_sha)) or not isinstance(target, str) or not target:
            raise RuntimeError("PR/MR 提交信息尚未就绪，未启动 Agent。")
        parsed = urlsplit(url or "")
        if parsed.scheme not in ("https", "http") or parsed.netloc.lower() != self.host:
            raise RuntimeError("PR/MR 链接与目标主机不符。")
        return {"provider": self.provider, "host": self.host, "repository": self.path,
                "number": number, "head_sha": head_sha, "base_sha": base_sha,
                "target_branch": target, "url": url}

    def current(self, number):
        return self.snapshot(self.api(f"{self.endpoint}/{number}"))
