use super::{
    super::error::AppError,
    browser::{validate_url, Action, Browsers},
};
use serde_json::{json, Value};

impl Browsers {
    pub fn action(&self, id: &str, action: Action) -> Result<Value, AppError> {
        if let Action::ImportCookies { cookies } = &action {
            return self.import_cookie_values(id, cookies.clone());
        }
        let page = self.page(id)?;
        let intent = if matches!(
            &action,
            Action::Navigate { .. }
                | Action::Back
                | Action::Forward
                | Action::Reload { .. }
                | Action::Stop
        ) {
            let mut current = page
                .lock()
                .map_err(|_| AppError::internal("Browser page unavailable"))?;
            current.navigation_intent = current.navigation_intent.wrapping_add(1);
            Some((current.navigation_intent, current.connection_generation))
        } else {
            None
        };
        let action = if let Action::Navigate { url } = action {
            let profile = self
                .state
                .lock()
                .map_err(|_| AppError::internal("Browser state unavailable"))?
                .pages
                .get(id)
                .map(|page| page.profile.clone())
                .ok_or_else(|| AppError::not_found("Browser page unavailable"))?;
            Action::Navigate {
                url: self.resolve_document_url(&profile, &url)?,
            }
        } else {
            action
        };
        let mut page = page
            .lock()
            .map_err(|_| AppError::internal("Browser page unavailable"))?;
        if intent
            .is_some_and(|intent| intent != (page.navigation_intent, page.connection_generation))
        {
            return Err(AppError::cancelled(
                "Navigation was superseded; inspect the current page",
            ));
        }
        match action {
            Action::VerifyRevision {expected_revision} => {
                if page.identity()?.0 != expected_revision { return Err(AppError::cancelled("PREVIEW_CONTEXT_CHANGED")); }
                Ok(Value::Null)
            }
            Action::HandleDialog {accept,prompt} => {
                let result = page.cdp.call("Page.handleJavaScriptDialog",json!({"accept":accept,"promptText":prompt.unwrap_or_default()}))?;
                page.cdp.dialog = None;
                Ok(result)
            }
            Action::CancelUpload {token} => {
                if page.cdp.chooser.as_ref().is_some_and(|chooser|chooser["token"]==token) { page.cdp.chooser = None; }
                Ok(Value::Null)
            }

            Action::ClickRef {reference} => {
                page.validate_reference(&reference)?;
                let encoded=serde_json::to_string(&reference).map_err(|error|AppError::invalid_input(error.to_string()))?;
                let position=page.cdp.evaluate(&format!("(()=>{{const [token,index]={encoded}.split(':');const snapshot=window.__agentHubSnapshots?.get(token);if(snapshot?.url!==location.href)throw Error('Snapshot expired');const node=snapshot?.nodes[Number(index)];if(!node?.isConnected)throw Error('Snapshot expired');node.scrollIntoView({{block:'center',inline:'center'}});const box=node.getBoundingClientRect();const scale=visualViewport?.scale||1;return {{x:(box.x+box.width/2-(visualViewport?.offsetLeft||0))*scale,y:(box.y+box.height/2-(visualViewport?.offsetTop||0))*scale}}}})()"))?;
                page.validate_reference(&reference)?;
                for event in ["mousePressed","mouseReleased"] { page.cdp.call("Input.dispatchMouseEvent",json!({"type":event,"x":position["x"],"y":position["y"],"button":"left","clickCount":1}))?; }
                Ok(Value::Null)
            }
            Action::FillRef {reference,value} => {
                page.validate_reference(&reference)?;
                if value.len()>64*1024{return Err(AppError::invalid_input("Input exceeds limit"));}
                let reference=serde_json::to_string(&reference).map_err(|error|AppError::invalid_input(error.to_string()))?;
                let value=serde_json::to_string(&value).map_err(|error|AppError::invalid_input(error.to_string()))?;
                page.cdp.evaluate(&format!("(()=>{{const [token,index]={reference}.split(':');const snapshot=window.__agentHubSnapshots?.get(token);if(snapshot?.url!==location.href)throw Error('Snapshot expired');const node=snapshot?.nodes[Number(index)];if(!node?.isConnected||node.disabled||node.readOnly)throw Error('Input unavailable');node.focus();const setter=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(node),'value')?.set;if(setter)setter.call(node,{value});else if(node.isContentEditable)node.textContent={value};else throw Error('Element is not editable');node.dispatchEvent(new Event('input',{{bubbles:true}}));node.dispatchEvent(new Event('change',{{bubbles:true}}));return true}})()"))
            }

            Action::Navigate { url } => { validate_url(&url)?; page.cdp.call("Page.navigate", json!({ "url": url })) }
            Action::Reload { hard } => page.cdp.call("Page.reload", json!({ "ignoreCache": hard })),
            Action::Stop => page.cdp.call("Page.stopLoading", json!({})),
            Action::Back | Action::Forward => {
                let direction = if matches!(action, Action::Back) { -1 } else { 1 };
                let history = page.cdp.call("Page.getNavigationHistory", json!({}))?;
                let index = history["currentIndex"].as_i64().unwrap_or_default() + direction;
                if index < 0 { return Ok(Value::Null); }
                match history["entries"][index as usize]["id"].as_i64() {
                    Some(entry) => page.cdp.call("Page.navigateToHistoryEntry", json!({ "entryId": entry })), None => Ok(Value::Null)
                }
            }
            Action::Resize { width, height, mobile } => {
                if !(240..=3840).contains(&width) || !(200..=2160).contains(&height) { return Err(AppError::invalid_input("Viewport dimensions are outside the supported range")); }
                page.cdp.expected_size = Some((width,height));
                page.cdp.call("Emulation.setDeviceMetricsOverride", json!({"width":width,"height":height,"deviceScaleFactor":1,"mobile":mobile}))?;
                page.width = width; page.height = height;page.mobile=mobile;page.cdp.frame=None;
                Ok(Value::Null)
            }
            Action::Mouse { x, y, event, button, delta_x, delta_y } => {
                if !x.is_finite() || !y.is_finite() || x < 0. || y < 0. || x > f64::from(page.width) || y > f64::from(page.height) { return Err(AppError::invalid_input("Pointer is outside the page")); }
                if !["mousePressed", "mouseReleased", "mouseMoved", "mouseWheel"].contains(&event.as_str()) { return Err(AppError::invalid_input("Invalid pointer event")); }
                let button = button.unwrap_or_else(|| "left".into());
                if !["left", "right", "middle", "none"].contains(&button.as_str()) { return Err(AppError::invalid_input("Invalid pointer button")); }
                let mut params = json!({ "type":event,"x":x,"y":y,"button":button,"clickCount":1 });
                params["buttons"] = json!(if event == "mouseReleased" || event == "mouseWheel" {0} else {match button.as_str(){"left"=>1,"right"=>2,"middle"=>4,_=>0}});
                if event == "mouseWheel" { params["deltaX"] = json!(delta_x.filter(|value| value.is_finite()).unwrap_or(0.).clamp(-2000., 2000.)); params["deltaY"] = json!(delta_y.filter(|value| value.is_finite()).unwrap_or(0.).clamp(-2000., 2000.)); }
                page.cdp.call("Input.dispatchMouseEvent", params)
            }
            Action::Text { text } => {
                if text.len() > 64 * 1024 { return Err(AppError::invalid_input("Input exceeds limit")); }
                page.cdp.call("Input.insertText", json!({"text":text}))
            }
            Action::Key { key, code, modifiers } => {
                if key.len() > 64 || code.len() > 64 || modifiers > 15 { return Err(AppError::invalid_input("Invalid key")); }
                let key_code = match key.as_str() { "Backspace"=>8,"Tab"=>9,"Enter"=>13,"Escape"=>27,"ArrowLeft"=>37,"ArrowUp"=>38,"ArrowRight"=>39,"ArrowDown"=>40,"Delete"=>46,"Home"=>36,"End"=>35,_ if key.len()==1=>u32::from(key.as_bytes()[0].to_ascii_uppercase()),_=>0 };
                let params = json!({"type":"keyDown","key":key,"code":code,"modifiers":modifiers,"windowsVirtualKeyCode":key_code});
                page.cdp.call("Input.dispatchKeyEvent", params)?;
                page.cdp.call("Input.dispatchKeyEvent", json!({"type":"keyUp","key":key,"code":code,"modifiers":modifiers,"windowsVirtualKeyCode":key_code}))
            }
            Action::Evaluate { expression } => page.cdp.evaluate(&expression),
            Action::Pick { x, y } => {
                if !x.is_finite() || !y.is_finite() { return Err(AppError::invalid_input("Invalid pick position")); }
                let (revision,url)=page.identity()?;
                let value=page.cdp.evaluate(&format!("({})({}, {})", include_str!("scripts/pick.js"), x, y))?;
                if !value.is_object(){return Ok(Value::Null);}
                if page.identity()?.0 != revision { return Err(AppError::cancelled("Page changed during selection")); }
                super::capture::normalize(value,revision,url)
            }
            Action::Snapshot => {
                let (revision,url)=page.identity()?;
                let token = uuid::Uuid::new_v4().simple().to_string();
                let mut value = page.cdp.evaluate(&include_str!("scripts/snapshot.js").replace("__SNAPSHOT_ID__",&token))?;
                if !value.is_object() || page.identity()?.0 != revision {return Err(AppError::cancelled("Page changed during snapshot"));}
                if page.snapshots.len() >= 8 { page.snapshots.pop_front(); }
                page.snapshots.push_back((token, revision.clone()));
                value["revision"]=json!(revision);value["url"]=json!(url);Ok(value)
            },
            Action::Screenshot { full, clip, expected_revision } => {
                let (revision,_)=page.identity()?;
                if expected_revision.as_ref().is_some_and(|expected|expected!=&revision){return Err(AppError::cancelled("PREVIEW_CONTEXT_CHANGED"));}
                let mut params = json!({ "format":"png", "captureBeyondViewport": full });
                if full {
                    let layout = page.cdp.call("Page.getLayoutMetrics", json!({}))?;
                    let size = &layout["cssContentSize"];
                    let w = size["width"].as_f64().unwrap_or(0.); let h = size["height"].as_f64().unwrap_or(0.);
                    if w <= 0. || h <= 0. || w * h > 32_000_000. { return Err(AppError::invalid_input("Page exceeds the full-page screenshot limit")); }
                    params["clip"] = json!({"x":0,"y":0,"width":w,"height":h,"scale":1});
                } else if let Some(clip) = clip {
                    for field in ["x", "y", "width", "height"] { let value = clip[field].as_f64().ok_or_else(|| AppError::invalid_input("Invalid capture bounds"))?; if !value.is_finite() || value < 0. { return Err(AppError::invalid_input("Invalid capture bounds")); } }
                    if clip["width"].as_f64().unwrap_or(0.) * clip["height"].as_f64().unwrap_or(0.) > 32_000_000. { return Err(AppError::invalid_input("Capture exceeds limit")); }
                    params["clip"] = clip; params["clip"]["scale"] = json!(1); params["captureBeyondViewport"] = json!(true);
                }
                let result = page.cdp.call("Page.captureScreenshot", params)?;
                if page.identity()?.0 != revision { return Err(AppError::cancelled("Page changed during capture")); }
                if result["data"].as_str().is_some_and(|data| data.len() <= 24 * 1024 * 1024) { Ok(result) } else { Err(AppError::invalid_input("Screenshot is unavailable or exceeds limit")) }
            }
            Action::Find { text, backwards } => {
                let encoded = serde_json::to_string(&text).map_err(|error| AppError::invalid_input(error.to_string()))?;
                page.cdp.evaluate(&format!("(()=>{{const text={encoded};const found=window.find(text,false,{backwards},true);const count=text?document.body.innerText.toLowerCase().split(text.toLowerCase()).length-1:0;return {{found,count}};}})()"))
            }
            Action::Cookies => page.cdp.call("Network.getAllCookies", json!({})),
            Action::ImportCookies { .. } => Err(AppError::internal("Cookie import was not dispatched")),
            Action::Storage => page.cdp.evaluate("({local:Object.fromEntries(Object.entries(localStorage)),session:Object.fromEntries(Object.entries(sessionStorage))})"),
        }
    }
}

impl super::browser::Page {
    fn validate_reference(&mut self, reference: &str) -> Result<(), AppError> {
        let (token, index) = reference
            .split_once(':')
            .ok_or_else(|| AppError::invalid_input("Invalid snapshot reference"))?;
        if reference.len() > 100 || index.parse::<usize>().map_or(true, |index| index >= 500) {
            return Err(AppError::invalid_input("Invalid snapshot reference"));
        }
        let revision = self.identity()?.0;
        if !self
            .snapshots
            .iter()
            .any(|(stored, value)| stored == token && value == &revision)
        {
            return Err(AppError::cancelled("Snapshot expired; take a new snapshot"));
        }
        Ok(())
    }
}
