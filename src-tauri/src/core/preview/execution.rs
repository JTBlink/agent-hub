//! Immutable execution location captured from the runtime configuration.
use super::runtime::BrowserProfile;
use serde::Serialize;
#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "snake_case")]
/// Chromium process selected by the profile; external endpoints are not host attestation.
pub enum Renderer {
    Client,
    Server,
}
#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "snake_case")]
/// Explicit proxy routing or the selected browser host's default network policy.
pub enum Network {
    ClientDefault,
    ServerDefault,
    Proxy,
}
#[derive(Clone, Copy, Serialize)]
/// Location snapshot retained by the native page for its runtime lifetime.
pub struct Execution {
    pub render: Renderer,
    pub network: Network,
}
impl Execution {
    /// Capture a configuration after runtime startup validates the profile.
    pub fn from_profile(profile: &BrowserProfile) -> Self {
        Self {
            render: if profile.endpoint.is_some() {
                Renderer::Server
            } else {
                Renderer::Client
            },
            network: if profile.proxy.is_some() {
                Network::Proxy
            } else if profile.endpoint.is_some() {
                Network::ServerDefault
            } else {
                Network::ClientDefault
            },
        }
    }
}

#[cfg(test)]
mod tests;
