use super::{policy, sources};
use serde_json::json;
#[test]
fn normalizes_scopes_and_reports_expired_partitioned_and_invalid_cookies() {
    let result=policy::normalize(json!([
 {"domain":"EXAMPLE.INVALID","name":"__Host-session","value":"synthetic","secure":true,"path":"/"},
 {"domain":"example.invalid","name":"expired","value":"old","expires":1},
 {"domain":"example.invalid","name":"bound","value":"private","partitionKey":{"topLevelSite":"https://example.invalid"}},
 {"domain":"co.uk","name":"unsafe","value":"cookie"},
 {"domain":"example.invalid","name":"__Secure-invalid","value":"cookie","secure":false}
 ])).unwrap();
    assert_eq!(result.cookies.len(), 1);
    assert_eq!(result.cookies[0].domain, "example.invalid");
    assert_eq!(
        result.cookies[0].params()["url"],
        "https://example.invalid/"
    );
    assert!(result.cookies[0].params().get("domain").is_none());
    assert_eq!(result.skipped.expired, 1);
    assert_eq!(result.skipped.partitioned, 1);
    assert_eq!(result.skipped.invalid, 2);
}
#[test]
fn refuses_public_suffixes_and_host_injection_but_accepts_local_hosts() {
    for host in [
        "com",
        "github.io",
        "example.invalid:443",
        "evil.invalid/path",
        "user@example.invalid",
        "example.invalid?x",
        "exa\nmple.invalid",
    ] {
        assert!(policy::domain(host).is_none(), "{host}");
    }
    assert_eq!(policy::domain("localhost").as_deref(), Some("localhost"));
    assert_eq!(policy::domain("127.1").as_deref(), Some("127.0.0.1"));
}
#[test]
fn netscape_import_preserves_empty_values_and_http_only_flags() {
    let input =
        "# Netscape HTTP Cookie File\n#HttpOnly_.example.invalid\tTRUE\t/\tTRUE\t0\tsession\t\n";
    let value = sources::netscape(input).unwrap();
    let result = policy::normalize(value).unwrap();
    assert_eq!(result.cookies.len(), 1);
    assert_eq!(result.cookies[0].value, "");
    assert!(result.cookies[0].http_only);
    assert!(!result.cookies[0].host_only);
}
#[test]
fn reads_a_selected_firefox_database_without_mutating_the_source() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("cookies.sqlite");
    let connection = rusqlite::Connection::open(&path).unwrap();
    connection.execute_batch("PRAGMA user_version=15; CREATE TABLE moz_cookies (host TEXT,path TEXT,name TEXT,value TEXT,expiry INTEGER,isSecure INTEGER,isHttpOnly INTEGER,sameSite INTEGER,originAttributes TEXT); INSERT INTO moz_cookies VALUES ('.example.invalid','/','session','synthetic',0,1,1,1,''); INSERT INTO moz_cookies VALUES ('.example.invalid','/','container','synthetic',0,1,1,1,'^userContextId=1');").unwrap();
    drop(connection);
    let before = std::fs::read(&path).unwrap();
    let result = policy::normalize(sources::file(&path, "firefox").unwrap()).unwrap();
    assert_eq!(result.cookies.len(), 1);
    assert_eq!(result.skipped.partitioned, 1);
    assert_eq!(std::fs::read(path).unwrap(), before);
}

#[test]
fn device_bound_domains_are_not_part_of_the_write_or_replace_scope() {
    let result=policy::normalize(json!([{"domain":"accounts.google.com","name":"session","value":"synthetic"},{"domain":"example.invalid","name":"bound","value":"synthetic","sourceBound":true}])).unwrap();
    assert!(result.cookies.is_empty());
    assert_eq!(result.skipped.bound, 2);
}

#[test]
fn rejects_executable_database_views_instead_of_querying_them() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("cookies.sqlite");
    let connection = rusqlite::Connection::open(&path).unwrap();
    connection
        .execute_batch("PRAGMA user_version=17; CREATE VIEW moz_cookies AS SELECT zeroblob(1000000000) AS value;")
        .unwrap();
    drop(connection);
    assert!(sources::file(&path, "firefox").is_err());
}

#[test]
fn firefox_versioned_expiry_and_same_site_semantics_are_preserved() {
    for (schema, multiplier) in [(14, 1i64), (15, 1i64), (17, 1000i64)] {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("cookies.sqlite");
        let connection = rusqlite::Connection::open(&path).unwrap();
        connection
            .pragma_update(None, "user_version", schema)
            .unwrap();
        connection.execute_batch("CREATE TABLE moz_cookies (host TEXT,path TEXT,name TEXT,value TEXT,expiry INTEGER,isSecure INTEGER,isHttpOnly INTEGER,sameSite INTEGER,originAttributes TEXT);").unwrap();
        if schema == 14 {
            connection
                .execute_batch("ALTER TABLE moz_cookies ADD COLUMN rawSameSite INTEGER;")
                .unwrap();
        }
        let expiry = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64
            + 3600;
        for (name, site, secure) in [
            ("unset", 256, 0),
            ("lax", 1, 0),
            ("strict", 2, 1),
            ("none", 0, 1),
        ] {
            connection.execute("INSERT INTO moz_cookies (host,path,name,value,expiry,isSecure,isHttpOnly,sameSite,originAttributes) VALUES ('example.invalid','/',?1,'synthetic',?2,?3,1,?4,'')",rusqlite::params![name,expiry*multiplier,secure,if schema==14&&site==256{1}else{site}]).unwrap();
            if schema == 14 {
                connection
                    .execute(
                        "UPDATE moz_cookies SET rawSameSite=?1 WHERE name=?2",
                        rusqlite::params![if site == 256 { 0 } else { site }, name],
                    )
                    .unwrap();
            }
        }
        drop(connection);
        let result = policy::normalize(sources::file(&path, "firefox").unwrap()).unwrap();
        assert_eq!(result.cookies.len(), 4);
        assert!(result
            .cookies
            .iter()
            .all(|cookie| cookie.expires == Some(expiry as f64)));
        assert_eq!(
            result
                .cookies
                .iter()
                .find(|cookie| cookie.name == "unset")
                .unwrap()
                .same_site,
            None
        );
        assert_eq!(
            result
                .cookies
                .iter()
                .find(|cookie| cookie.name == "none")
                .unwrap()
                .same_site
                .as_deref(),
            Some("None")
        );
    }
}

#[test]
fn negative_expiry_and_malformed_attributes_do_not_become_valid_session_cookies() {
    let result = policy::normalize(json!([
     {"domain":"example.invalid","name":"expired","value":"old","expires":-10},
     {"domain":"example.invalid","name":"bad-date","value":"old","expires":"yesterday"},
     {"domain":"example.invalid","name":"bad-flag","value":"old","httpOnly":"true"},
     {"domain":"example.invalid","name":"session","value":"valid","expires":-1,"session":true}
    ]))
    .unwrap();
    assert_eq!(result.cookies.len(), 1);
    assert_eq!(result.cookies[0].name, "session");
    assert_eq!(result.skipped.expired, 1);
    assert_eq!(result.skipped.invalid, 2);
}
