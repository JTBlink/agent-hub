use std::{
    env,
    ffi::OsString,
    fs, io,
    path::{Path, PathBuf},
    process::Command,
    process::ExitCode,
};

use agent_hub_core::{RELEASE_LOCK_JSON, VERSION};

fn main() -> ExitCode {
    match run(env::args_os().skip(1).collect()) {
        Ok(code) => code,
        Err(error) => {
            eprintln!("agent-hub-core: {error}");
            ExitCode::FAILURE
        }
    }
}

fn run(args: Vec<OsString>) -> io::Result<ExitCode> {
    let command = args.first().and_then(|arg| arg.to_str());
    let script = match command {
        Some("lock") if args.len() == 1 => {
            print!("{RELEASE_LOCK_JSON}");
            return Ok(ExitCode::SUCCESS);
        }
        Some("--version" | "-V") if args.len() == 1 => {
            println!("agent-hub-core {VERSION}");
            return Ok(ExitCode::SUCCESS);
        }
        Some("install") if args.len() == 2 => "install.mjs",
        Some("build") if args.len() >= 3 => "build-product.mjs",
        _ => {
            if !args.is_empty() && !matches!(command, Some("--help" | "-h")) {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidInput,
                    "invalid arguments; see --help",
                ));
            }
            println!("agent-hub-core {VERSION}\n\n  lock\n  install <new-sdk-directory>\n  build <product.json> <new-sdk-directory> [--frontend | -- <desktop build args>]\n\nInstall and build require Git and Node.js.");
            return Ok(ExitCode::SUCCESS);
        }
    };
    let staging = tempfile::tempdir()?;
    let lock = prepare_archive(staging.path())?;
    fs::write(
        staging.path().join("install.mjs"),
        include_str!("../install.mjs"),
    )?;
    if script == "build-product.mjs" {
        fs::write(
            staging.path().join(script),
            include_str!("../build-product.mjs"),
        )?;
    }
    let status = Command::new("node")
        .arg(staging.path().join(script))
        .arg(lock)
        .args(&args[1..])
        .status()
        .map_err(|error| {
            io::Error::new(error.kind(), format!("could not start Node.js: {error}"))
        })?;
    Ok(if status.success() {
        ExitCode::SUCCESS
    } else {
        ExitCode::FAILURE
    })
}

fn checked(command: &mut Command, step: &str) -> io::Result<()> {
    if command.status()?.success() {
        Ok(())
    } else {
        Err(io::Error::other(format!("{step} failed")))
    }
}

fn prepare_archive(staging: &Path) -> io::Result<PathBuf> {
    let source: serde_json::Value = serde_json::from_str(RELEASE_LOCK_JSON)?;
    let revision = source["revision"].as_str().unwrap_or_default();
    if revision.len() != 40 || !revision.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err(io::Error::other("invalid SDK source revision"));
    }
    let repository = source["repository"].as_str().unwrap_or_default();
    let checkout = staging.join("source");
    fs::create_dir(&checkout)?;
    let git = |args: &[&str]| {
        let mut command = Command::new("git");
        command.current_dir(&checkout).args(args);
        command
    };
    checked(&mut git(&["init", "--quiet"]), "initialize SDK checkout")?;
    checked(
        &mut git(&["fetch", "--quiet", "--depth", "1", repository, revision]),
        "fetch SDK source",
    )?;
    let actual = git(&["rev-parse", "FETCH_HEAD"]).output()?;
    if !actual.status.success() || String::from_utf8_lossy(&actual.stdout).trim() != revision {
        return Err(io::Error::other("SDK source revision mismatch"));
    }
    checked(
        &mut git(&["checkout", "--quiet", "--detach", revision]),
        "checkout SDK source",
    )?;
    let stem = format!("agent-hub-core-{VERSION}");
    let archive = staging.join(format!("{stem}.tar.gz"));
    checked(
        Command::new("node")
            .current_dir(&checkout)
            .arg("packages/agent-hub-core/package.mjs")
            .arg(&archive),
        "package SDK source",
    )?;
    let manifest: serde_json::Value =
        serde_json::from_slice(&fs::read(staging.join(format!("{stem}-manifest.json")))?)?;
    if manifest["version"] != VERSION || manifest["revision"] != revision {
        return Err(io::Error::other("SDK archive identity mismatch"));
    }
    let lock = serde_json::json!({
        "source": archive,
        "version": VERSION,
        "revision": revision,
        "sha256": manifest["sha256"],
    });
    let path = staging.join("sdk-lock.json");
    fs::write(&path, serde_json::to_vec(&lock)?)?;
    Ok(path)
}
