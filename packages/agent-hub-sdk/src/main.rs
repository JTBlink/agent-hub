use std::{env, ffi::OsString, fs, io, process::Command, process::ExitCode};

use agent_hub_sdk::{RELEASE_LOCK_JSON, VERSION};

fn main() -> ExitCode {
    match run(env::args_os().skip(1).collect()) {
        Ok(code) => code,
        Err(error) => {
            eprintln!("agent-hub-sdk: {error}");
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
            println!("agent-hub-sdk {VERSION}");
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
            println!("agent-hub-sdk {VERSION}\n\n  lock\n  install <new-sdk-directory>\n  build <product.json> <new-sdk-directory> [--frontend | -- <desktop build args>]\n\nInstall and build require Node.js.");
            return Ok(ExitCode::SUCCESS);
        }
    };
    let staging = tempfile::tempdir()?;
    let lock = staging.path().join("sdk-lock.json");
    fs::write(&lock, RELEASE_LOCK_JSON)?;
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
