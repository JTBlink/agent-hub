//! Chromium's bundled inspector, connected only to an owned preview target.
use super::{browser::Browsers, runtime};
use crate::core::error::AppError;

impl Browsers {
    pub fn devtools_url(&self, id: &str) -> Result<String, AppError> {
        let current = self.page(id)?;
        let (handle, runtime) = {
            let state = self
                .state
                .lock()
                .map_err(|_| AppError::internal("Browser state unavailable"))?;
            if state.lost_pages.contains(id) {
                return Err(AppError::network("Browser page is no longer available"));
            }
            let handle = state
                .pages
                .get(id)
                .filter(|handle| std::sync::Arc::ptr_eq(&handle.page, &current))
                .ok_or_else(|| AppError::not_found("Browser page unavailable"))?
                .clone();
            let runtime = state
                .runtimes
                .get(&handle.profile)
                .cloned()
                .ok_or_else(|| AppError::network("Browser runtime unavailable"))?;
            (handle, runtime)
        };
        let runtime = runtime
            .lock()
            .map_err(|_| AppError::internal("Browser runtime unavailable"))?;
        let targets = runtime::json_endpoint(&runtime.endpoint, "/json/list")?;
        let address = targets
            .as_array()
            .and_then(|targets| targets.iter().find(|target| target["id"] == handle.target))
            .and_then(|target| target["webSocketDebuggerUrl"].as_str())
            .ok_or_else(|| AppError::network("Browser page is no longer available"))?;
        inspector_url(&runtime.endpoint, address)
    }
}

fn inspector_url(endpoint: &str, advertised: &str) -> Result<String, AppError> {
    let address = runtime::control_address(endpoint, advertised)?;
    let mut url =
        reqwest::Url::parse(&runtime::validate_endpoint(endpoint)?).map_err(AppError::network)?;
    // The inspector entrypoint adds a second page screencast beside the tools.
    // The host already renders the page, so use the tools-only entrypoint.
    url.set_path("/devtools/devtools_app.html");
    url.query_pairs_mut().append_pair(
        "ws",
        address
            .strip_prefix("ws://")
            .ok_or_else(|| AppError::invalid_input("Invalid inspector transport"))?,
    );
    Ok(url.into())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    #[ignore = "requires installed Chromium; verifies the bundled DevTools frontend"]
    fn bundled_inspector_connects_to_the_original_preview_page() {
        use crate::core::preview::actions::Action;
        let root = tempfile::tempdir().unwrap();
        let browsers = Browsers::new(root.path().into());
        let page = browsers.create("guest", "about:blank").unwrap();
        let url = browsers.devtools_url(&page).unwrap();
        let response = reqwest::blocking::get(&url).unwrap();
        assert!(response.status().is_success());
        let inspector = browsers.create("guest", &url).unwrap();
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(15);
        loop {
            let text = browsers.action(&inspector, Action::Evaluate {
                expression: "(()=>{const texts=[];const visit=root=>{texts.push(root.textContent||'');for(const node of root.querySelectorAll('*'))if(node.shadowRoot)visit(node.shadowRoot)};visit(document.body);return texts.join(' ')})()".into(),
            }).unwrap();
            let text = text.as_str().unwrap_or_default();
            if text.contains("Elements") && text.contains("Console") && text.contains("Network") {
                break;
            }
            assert!(
                std::time::Instant::now() < deadline,
                "Inspector did not load its native panels: {text}"
            );
            std::thread::sleep(std::time::Duration::from_millis(100));
        }
        let has_screencast = browsers.action(&inspector, Action::Evaluate {
            expression: "(()=>{const visit=root=>Boolean(root.querySelector('.screencast, devtools-split-view[name=\"inspector-view.screencast-split-view-state\"]'))||Array.from(root.querySelectorAll('*')).some(node=>node.shadowRoot&&visit(node.shadowRoot));return visit(document)})()".into(),
        }).unwrap();
        assert_eq!(
            has_screencast,
            serde_json::json!(false),
            "Tools must not duplicate the preview page"
        );
        assert!(browsers
            .action(
                &page,
                Action::Evaluate {
                    expression: "document.title".into()
                }
            )
            .is_ok());
        browsers.close(&inspector).unwrap();
        browsers.close(&page).unwrap();
        assert!(browsers.devtools_url(&page).is_err());
        browsers.clear();
    }
    #[test]
    fn inspector_uses_the_validated_local_endpoint_for_frontend_and_forwarded_socket() {
        let url = inspector_url(
            "http://127.0.0.1:4321",
            "ws://localhost:9222/devtools/page/fixture",
        )
        .unwrap();
        let url = reqwest::Url::parse(&url).unwrap();
        assert_eq!(url.path(), "/devtools/devtools_app.html");
        assert_eq!(url.port(), Some(4321));
        assert_eq!(
            url.query_pairs().find(|(key, _)| key == "ws").unwrap().1,
            "127.0.0.1:4321/devtools/page/fixture"
        );
        assert!(inspector_url(
            "http://example.invalid:9222",
            "ws://localhost:9222/devtools/page/fixture"
        )
        .is_err());
    }
}
