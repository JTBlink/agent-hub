use super::policy::{MAX_BYTES, MAX_COOKIES};
use crate::core::{error::AppError, preview::runtime};
use serde_json::{json, Value};
use std::{io::Read, path::Path};
pub fn file(path: &Path, format: &str) -> Result<Value, AppError> {
    if format == "firefox" {
        return firefox(path);
    }
    let mut bytes = Vec::new();
    std::fs::File::open(path)?
        .take((MAX_BYTES + 1) as u64)
        .read_to_end(&mut bytes)?;
    if bytes.len() > MAX_BYTES {
        return Err(AppError::invalid_input("Cookie file exceeds 2 MiB"));
    }
    let text = std::str::from_utf8(&bytes)
        .map_err(|_| AppError::invalid_input("Cookie file must contain UTF-8 text"))?;
    match format {
        "json" => {
            serde_json::from_str(text).map_err(|_| AppError::invalid_input("Invalid cookie JSON"))
        }
        "netscape" => netscape(text),
        _ => Err(AppError::invalid_input("Unsupported cookie file format")),
    }
}
pub fn netscape(text: &str) -> Result<Value, AppError> {
    let mut cookies = Vec::new();
    for line in text.lines() {
        let line = line.trim_end_matches('\r');
        if line.trim().is_empty() || line.starts_with('#') && !line.starts_with("#HttpOnly_") {
            continue;
        }
        let (line, http_only) = line
            .strip_prefix("#HttpOnly_")
            .map_or((line, false), |line| (line, true));
        let fields = line.split('\t').collect::<Vec<_>>();
        if fields.len() != 7
            || !["TRUE", "FALSE"].contains(&fields[1])
            || !["TRUE", "FALSE"].contains(&fields[3])
        {
            return Err(AppError::invalid_input("Invalid Netscape cookie record"));
        }
        let expires = fields[4]
            .parse::<i64>()
            .map_err(|_| AppError::invalid_input("Invalid cookie expiration"))?;
        cookies.push(json!({"domain":fields[0],"hostOnly":fields[1]!="TRUE","path":fields[2],"secure":fields[3]=="TRUE","expires":expires,"name":fields[5],"value":fields[6],"httpOnly":http_only}));
        if cookies.len() > MAX_COOKIES {
            return Err(AppError::invalid_input("Cookie file exceeds 2000 cookies"));
        }
    }
    Ok(json!(cookies))
}
fn firefox(path: &Path) -> Result<Value, AppError> {
    if std::fs::metadata(path)?.len() > 64 * 1024 * 1024 {
        return Err(AppError::invalid_input("Cookie database exceeds 64 MiB"));
    }
    let temporary = tempfile::tempdir()?;
    let snapshot = temporary.path().join("cookies.sqlite");
    let original = std::fs::metadata(path)?;
    copy_database_file(path, &snapshot)?;
    let mut wal_name = path.as_os_str().to_os_string();
    wal_name.push("-wal");
    let wal = std::path::PathBuf::from(wal_name);
    let wal_before = std::fs::metadata(&wal)
        .ok()
        .map(|metadata| (metadata.len(), metadata.modified().ok()));
    if wal.is_file() {
        copy_database_file(&wal, &temporary.path().join("cookies.sqlite-wal"))?;
    }
    let wal_after = std::fs::metadata(&wal)
        .ok()
        .map(|metadata| (metadata.len(), metadata.modified().ok()));
    if wal_before != wal_after {
        return Err(AppError::cancelled(
            "Cookie database changed; close the source browser and choose it again",
        ));
    }
    let current = std::fs::metadata(path)?;
    if current.len() != original.len() || current.modified().ok() != original.modified().ok() {
        return Err(AppError::cancelled(
            "Cookie database changed; close the source browser and choose it again",
        ));
    }
    let connection = rusqlite::Connection::open_with_flags(
        &snapshot,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY | rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|_| AppError::io("Cannot open the selected Firefox cookie database"))?;
    connection.set_limit(
        rusqlite::limits::Limit::SQLITE_LIMIT_LENGTH,
        MAX_BYTES as i32,
    );
    connection.set_limit(rusqlite::limits::Limit::SQLITE_LIMIT_SQL_LENGTH, 64 * 1024);
    connection.set_limit(rusqlite::limits::Limit::SQLITE_LIMIT_COLUMN, 128);
    let started = std::time::Instant::now();
    connection.progress_handler(
        10000,
        Some(move || started.elapsed() > std::time::Duration::from_secs(3)),
    );
    connection
        .execute_batch("PRAGMA trusted_schema=OFF; PRAGMA query_only=ON;")
        .map_err(AppError::io)?;
    let schema: i64 = connection
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .map_err(AppError::io)?;
    if !(9..=17).contains(&schema) {
        return Err(AppError::invalid_input(
            "Unsupported Firefox cookie database version; export cookie JSON instead",
        ));
    }
    let ordinary:bool=connection.query_row("SELECT EXISTS(SELECT 1 FROM sqlite_schema WHERE name='moz_cookies' AND type='table' AND upper(sql) NOT LIKE '%VIRTUAL%')",[],|row|row.get(0)).map_err(|_|AppError::invalid_input("Unsupported Firefox cookie schema"))?;
    if !ordinary {
        return Err(AppError::invalid_input("Unsupported Firefox cookie schema"));
    }
    let generated = connection
        .prepare("PRAGMA table_xinfo(moz_cookies)")
        .map_err(AppError::io)?
        .query_map([], |row| row.get::<_, i64>(6))
        .map_err(AppError::io)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(AppError::io)?;
    if generated.iter().any(|hidden| *hidden != 0) {
        return Err(AppError::invalid_input(
            "Generated cookie columns are not supported",
        ));
    }
    let raw_site = if (10..=14).contains(&schema) {
        "rawSameSite"
    } else {
        "NULL"
    };
    let query=format!("SELECT host,path,name,value,expiry,isSecure,isHttpOnly,sameSite,originAttributes,{raw_site} FROM moz_cookies LIMIT 2001");
    let mut statement = connection
        .prepare(&query)
        .map_err(|_| AppError::invalid_input("Unsupported Firefox cookie database schema"))?;
    let rows = statement
        .query_map([], |row| firefox_row(row, schema))
        .map_err(AppError::io)?;
    let mut cookies = Vec::new();
    let mut size = 0;
    for row in rows {
        let row = row.map_err(|_| AppError::invalid_input("Invalid Firefox cookie record"))?;
        size += row.to_string().len();
        if size > MAX_BYTES || cookies.len() >= MAX_COOKIES {
            return Err(AppError::invalid_input(
                "Cookie database exceeds the import budget; export selected sites",
            ));
        }
        cookies.push(row);
    }
    Ok(json!(cookies))
}
pub fn browser(endpoint: &str) -> Result<Value, AppError> {
    let mut cdp = runtime::connect_control(endpoint)?;
    cdp.set_timeout(std::time::Duration::from_secs(12))?;
    let value = cdp.call("Storage.getCookies", json!({}))?;
    Ok(value["cookies"].clone())
}

fn copy_database_file(source: &Path, target: &Path) -> Result<(), AppError> {
    let mut input = std::fs::File::open(source)?.take(64 * 1024 * 1024 + 1);
    let mut output = std::fs::File::create(target)?;
    if std::io::copy(&mut input, &mut output)? > 64 * 1024 * 1024 {
        return Err(AppError::invalid_input(
            "Cookie database or WAL exceeds 64 MiB",
        ));
    }
    Ok(())
}

fn firefox_row(row: &rusqlite::Row<'_>, schema: i64) -> rusqlite::Result<Value> {
    let mut same_site: i64 = row.get(7)?;
    let raw: Option<i64> = row.get(9)?;
    if (10..=14).contains(&schema) && same_site == 1 && raw == Some(0) {
        same_site = 256;
    }
    let attributes: String = row.get(8)?;
    let expiry: i64 = row.get(4)?;
    let expires = expiry as f64 / if schema >= 16 { 1000. } else { 1. };
    Ok(json!({
        "domain":row.get::<_,String>(0)?,
        "path":row.get::<_,String>(1)?,
        "name":row.get::<_,String>(2)?,
        "value":row.get::<_,String>(3)?,
        "expires":expires,
        "secure":row.get::<_,bool>(5)?,
        "httpOnly":row.get::<_,bool>(6)?,
        "sameSite":match same_site{0=>"None",1=>"Lax",2=>"Strict",256=>"unspecified",_=>"invalid"},
        "partitionKey":if attributes.is_empty(){Value::Null}else{json!("source-bound")}
    }))
}
