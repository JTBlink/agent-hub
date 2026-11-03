//! Keep WebKit's host-only/domain distinction instead of round-tripping through a CDP cookie.
use super::*;
use crate::core::preview::cookies::policy::Cookie;
use objc2::{rc::Retained, runtime::AnyObject};
use objc2_foundation::{
    ns_string, NSArray, NSDate, NSHTTPCookie, NSHTTPCookieDomain, NSHTTPCookieExpires,
    NSHTTPCookieName, NSHTTPCookiePath, NSHTTPCookiePropertyKey, NSHTTPCookieSecure,
    NSHTTPCookieValue, NSMutableDictionary, NSString,
};
use objc2_web_kit::WKWebView;
use std::{ptr::NonNull, sync::Mutex};
pub async fn cookies(view: &tauri::Webview) -> Result<Vec<Cookie>, AppError> {
    let (sender, receiver) = tokio::sync::oneshot::channel();
    view.with_webview(move |platform| {
        let sender = Mutex::new(Some(sender));
        let block = block2::RcBlock::new(move |values: NonNull<NSArray<NSHTTPCookie>>| {
            let result = (|| {
                let values = unsafe { values.as_ref() };
                if values.len() > 2000 {
                    return Err(AppError::invalid_input(
                        "Native cookie store exceeds the import limit",
                    ));
                }
                let mut result = Vec::new();
                let mut size = 0;
                for value in values {
                    if value.properties().is_some_and(|properties| {
                        properties
                            .allKeys()
                            .iter()
                            .any(|key| key.to_string().to_ascii_lowercase().contains("partition"))
                    }) {
                        return Err(AppError::invalid_input(
                            "Native cookies include a partition the import adapter cannot preserve",
                        ));
                    }
                    let domain = value.domain().to_string();
                    let same_site = value
                        .sameSitePolicy()
                        .map(|value| value.to_string())
                        .and_then(|value| match value.to_ascii_lowercase().as_str() {
                            "lax" => Some("Lax".into()),
                            "strict" => Some("Strict".into()),
                            "none" => Some("None".into()),
                            _ => None,
                        });
                    let cookie = Cookie {
                        name: value.name().to_string(),
                        value: value.value().to_string(),
                        host_only: !domain.starts_with('.'),
                        domain: domain.trim_start_matches('.').to_string(),
                        path: value.path().to_string(),
                        secure: value.isSecure(),
                        http_only: value.isHTTPOnly(),
                        expires: value.expiresDate().map(|date| date.timeIntervalSince1970()),
                        same_site,
                        priority: None,
                    };
                    size += cookie.name.len()
                        + cookie.value.len()
                        + cookie.domain.len()
                        + cookie.path.len();
                    if size > 2 * 1024 * 1024 {
                        return Err(AppError::invalid_input(
                            "Native cookie store exceeds the import limit",
                        ));
                    }
                    result.push(cookie);
                }
                Ok(result)
            })();
            if let Ok(mut sender) = sender.lock() {
                if let Some(sender) = sender.take() {
                    let _ = sender.send(result);
                }
            }
        });
        unsafe {
            let wk: &WKWebView = &*platform.inner().cast();
            wk.configuration()
                .websiteDataStore()
                .httpCookieStore()
                .getAllCookies(&block);
        }
    })
    .map_err(AppError::io)?;
    super::receive(receiver).await
}
fn native_cookie(cookie: &Cookie) -> Result<Retained<NSHTTPCookie>, AppError> {
    let name = NSString::from_str(&cookie.name);
    let value = NSString::from_str(&cookie.value);
    let path = NSString::from_str(&cookie.path);
    let domain = NSString::from_str(&if cookie.host_only {
        cookie.domain.clone()
    } else {
        format!(".{}", cookie.domain)
    });
    let properties: Retained<NSMutableDictionary<NSHTTPCookiePropertyKey, AnyObject>> =
        NSMutableDictionary::from_slices(
            &[
                unsafe { NSHTTPCookieName },
                unsafe { NSHTTPCookieValue },
                unsafe { NSHTTPCookiePath },
                unsafe { NSHTTPCookieDomain },
            ],
            &[&*name, &*value, &*path, &*domain],
        );
    unsafe {
        properties.insert(
            NSHTTPCookieSecure,
            if cookie.secure {
                ns_string!("TRUE")
            } else {
                ns_string!("FALSE")
            },
        );
        properties.insert(
            ns_string!("HttpOnly"),
            if cookie.http_only {
                ns_string!("TRUE")
            } else {
                ns_string!("FALSE")
            },
        );
        if let Some(expires) = cookie.expires {
            properties.insert(
                NSHTTPCookieExpires,
                &*NSDate::dateWithTimeIntervalSince1970(expires),
            );
        }
        if let Some(same_site) = &cookie.same_site {
            properties.insert(
                ns_string!("SameSite"),
                &*NSString::from_str(&same_site.to_ascii_lowercase()),
            );
        }
        NSHTTPCookie::cookieWithProperties(&properties)
            .ok_or_else(|| AppError::invalid_input("WebKit rejected a cookie"))
    }
}
pub async fn mutate_cookie(
    view: &tauri::Webview,
    cookie: Cookie,
    delete: bool,
) -> Result<(), AppError> {
    let (sender, receiver) = tokio::sync::oneshot::channel();
    view.with_webview(move |platform| {
        let cookie = match native_cookie(&cookie) {
            Ok(cookie) => cookie,
            Err(error) => {
                let _ = sender.send(Err(error));
                return;
            }
        };
        let sender = Mutex::new(Some(sender));
        let callback = block2::RcBlock::new(move || {
            if let Ok(mut sender) = sender.lock() {
                if let Some(sender) = sender.take() {
                    let _ = sender.send(Ok(()));
                }
            }
        });
        unsafe {
            let wk: &WKWebView = &*platform.inner().cast();
            let store = wk.configuration().websiteDataStore().httpCookieStore();
            if delete {
                store.deleteCookie_completionHandler(&cookie, Some(&callback));
            } else {
                store.setCookie_completionHandler(&cookie, Some(&callback));
            }
        }
    })
    .map_err(AppError::io)?;
    super::receive(receiver).await
}
