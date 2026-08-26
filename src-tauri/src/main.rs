#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if std::env::args().nth(1).as_deref() == Some("--smoke") {
        if let Err(error) = agent_hub_lib::run_package_smoke() {
            eprintln!("AgentHub package smoke test failed: {error}");
            std::process::exit(1);
        }
        println!("AgentHub package smoke test passed");
        return;
    }
    agent_hub_lib::run();
}
