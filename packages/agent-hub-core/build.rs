use std::{env, fs, path::PathBuf, process::Command};

fn main() -> std::io::Result<()> {
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let output = PathBuf::from(env::var_os("OUT_DIR").expect("Cargo output directory"));
    let bundled = manifest.join("registry-sdk.json");
    println!("cargo:rustc-check-cfg=cfg(registry_sdk)");
    println!("cargo:rerun-if-changed={}", bundled.display());
    if bundled.is_file() {
        let body = fs::read_to_string(bundled)?;
        let metadata: serde_json::Value = serde_json::from_str(&body)?;
        if metadata["version"] != env!("CARGO_PKG_VERSION") {
            return Err(std::io::Error::other("Registry SDK version mismatch"));
        }
        println!("cargo:rustc-cfg=registry_sdk");
        return fs::write(output.join("sdk-source.json"), body);
    }
    let shipped = manifest.join(".cargo_vcs_info.json");
    let archived = manifest.join("../../SDK_REVISION");
    println!("cargo:rerun-if-changed={}", shipped.display());
    println!("cargo:rerun-if-changed={}", archived.display());

    let revision = fs::read_to_string(&shipped)
        .ok()
        .and_then(|body| serde_json::from_str::<serde_json::Value>(&body).ok())
        .and_then(|metadata| metadata["git"]["sha1"].as_str().map(str::to_owned))
        .or_else(|| {
            fs::read_to_string(archived)
                .ok()
                .map(|body| body.trim().to_owned())
        })
        .or_else(|| {
            // Cargo supplies source provenance in registry packages. Resolve HEAD
            // for a development checkout so the same command can be tested locally.
            let output = Command::new("git")
                .args(["rev-parse", "--verify", "HEAD"])
                .current_dir(&manifest)
                .output()
                .ok()?;
            output
                .status
                .success()
                .then(|| String::from_utf8_lossy(&output.stdout).trim().to_owned())
        })
        .unwrap_or_default();
    if let Ok(output) = Command::new("git")
        .args(["rev-parse", "--absolute-git-dir"])
        .current_dir(&manifest)
        .output()
    {
        if output.status.success() {
            let dir = PathBuf::from(String::from_utf8_lossy(&output.stdout).trim());
            println!("cargo:rerun-if-changed={}", dir.join("HEAD").display());
            if let Ok(head) = fs::read_to_string(dir.join("HEAD")) {
                if let Some(reference) = head.trim().strip_prefix("ref: ") {
                    println!("cargo:rerun-if-changed={}", dir.join(reference).display());
                }
            }
        }
    }
    let lock = serde_json::json!({
        "repository": format!("{}.git", env!("CARGO_PKG_REPOSITORY")),
        "version": env!("CARGO_PKG_VERSION"),
        "revision": revision,
    });
    fs::write(
        output.join("sdk-source.json"),
        format!("{}\n", serde_json::to_string_pretty(&lock)?),
    )
}
