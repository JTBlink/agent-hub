//! CLI-owned authenticated host metadata shared by accounts and repository discovery.
use crate::core::{cli_process, task_browser::Provider, tool_detection};
use std::{
    collections::{HashMap, HashSet},
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex, OnceLock,
    },
    time::{Duration, Instant},
};
type HostCache = HashMap<String, (Instant, HashSet<String>)>;
static HOSTS: OnceLock<Mutex<HostCache>> = OnceLock::new();
static HOST_GENERATION: AtomicU64 = AtomicU64::new(0);
static HOST_PROBES: [Mutex<()>; 2] = [Mutex::new(()), Mutex::new(())];

fn host_cache() -> &'static Mutex<HostCache> {
    HOSTS.get_or_init(|| Mutex::new(HashMap::new()))
}

pub(crate) fn refresh_hosts() {
    let mut cache = host_cache().lock().unwrap_or_else(|e| e.into_inner());
    HOST_GENERATION.fetch_add(1, Ordering::AcqRel);
    cache.clear();
}

pub(crate) fn status_hosts(text: &str) -> HashSet<String> {
    // Only retain hostnames, never account names or the rest of auth status.
    text.lines()
        .filter_map(|line| {
            let lower = line.to_ascii_lowercase();
            let host = lower
                .split_once("logged in to ")?
                .1
                .split_whitespace()
                .next()?;
            let host = host.trim_end_matches(':');
            (!host.is_empty()
                && host
                    .bytes()
                    .all(|c| c.is_ascii_alphanumeric() || b".-:".contains(&c)))
            .then(|| host.to_owned())
        })
        .collect()
}

pub(crate) fn known_hosts(program: &str, default_host: &str) -> HashSet<String> {
    if (program == "gh" && !Provider::Github.enabled())
        || (program == "glab" && !Provider::Gitlab.enabled())
    {
        return HashSet::new();
    }
    let _probe = HOST_PROBES[usize::from(program == "glab")]
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    let launcher = local_launcher(program);
    let cache_key = format!(
        "{program}:{}",
        serde_json::to_string(&launcher).unwrap_or_default()
    );
    if let Some((time, hosts)) = host_cache()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .get(&cache_key)
    {
        if time.elapsed() < Duration::from_secs(15 * 60) {
            return hosts.clone();
        }
    }
    let generation = HOST_GENERATION.load(Ordering::Acquire);
    let mut hosts = HashSet::from([default_host.into()]);
    if let Some(launcher) = launcher {
        let mut args = launcher.args.iter().map(String::as_str).collect::<Vec<_>>();
        args.extend(if program == "glab" {
            vec!["auth", "status", "--all"]
        } else {
            vec!["auth", "status"]
        });
        // Keep the existing CLI environment (HOME, config overrides and keyring).
        // A failed host must not hide another host's configured authentication.
        let output = match cli_process::capture(
            &launcher.program,
            &args,
            &[("GH_PROMPT_DISABLED", "1"), ("GLAB_CHECK_UPDATE", "false")],
            10,
            None,
            None,
        ) {
            Ok((stdout, stderr)) => format!("{stdout}\n{stderr}"),
            Err(error) => error,
        };
        hosts.extend(status_hosts(&output));
    }
    let mut cache = host_cache().lock().unwrap_or_else(|e| e.into_inner());
    if HOST_GENERATION.load(Ordering::Acquire) == generation {
        cache.retain(|_, (time, _)| time.elapsed() < Duration::from_secs(15 * 60));
        cache.insert(cache_key, (Instant::now(), hosts.clone()));
    }
    hosts
}

fn local_launcher(program: &str) -> Option<crate::core::task_browser::CliLauncher> {
    #[cfg(feature = "gitlab")]
    if program == "glab" {
        // Host discovery stays local: only an actual CLI operation may download.
        return super::gitlab::cli::GlabCli::default()
            .local_launcher()
            .ok()
            .flatten();
    }
    tool_detection::find_command(program).map(|path| crate::core::task_browser::CliLauncher {
        program: path.to_string_lossy().into_owned(),
        args: Vec::new(),
    })
}
