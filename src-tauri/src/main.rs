// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if std::env::args().nth(1).as_deref() == Some("--smoke") {
        if let Err(error) = app_lib::run_package_smoke() {
            eprintln!("agent-hub package smoke failed: {error}");
            std::process::exit(1);
        }
        println!("agent-hub package smoke passed");
        return;
    }
    app_lib::run();
}
