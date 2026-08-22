use std::{fs, io::ErrorKind, time::UNIX_EPOCH};

use serde_json::Value;
use sha2::{Digest, Sha256};

use crate::{Agent, ConfigFormat, Scope};

use super::{
    AgentConfigAdapter, ConfigDocument, ConfigStatus, Diagnostic, DiagnosticCode, ScanContext,
};

const REDACTED_VALUE: &str = "••••••";

pub struct ClaudeCodeAdapter;

impl ClaudeCodeAdapter {
    pub fn scan_workspace(&self, workspace: impl AsRef<std::path::Path>) -> ConfigDocument {
        let context = ScanContext::new(workspace.as_ref())
            .with_claude_config_dir(workspace.as_ref().join(".claude"));
        let mut document = self.scan_global(&context);
        document.scope = Scope::Workspace;
        document
    }
}

impl AgentConfigAdapter for ClaudeCodeAdapter {
    fn scan_global(&self, context: &ScanContext) -> ConfigDocument {
        let path = context.claude_config_directory().join("settings.json");
        let bytes = match fs::read(&path) {
            Ok(bytes) => bytes,
            Err(error) => {
                let (status, code) = match error.kind() {
                    ErrorKind::NotFound => (ConfigStatus::Missing, DiagnosticCode::FileMissing),
                    ErrorKind::PermissionDenied => {
                        (ConfigStatus::Unreadable, DiagnosticCode::PermissionDenied)
                    }
                    _ => (ConfigStatus::Unreadable, DiagnosticCode::IoFailure),
                };
                let document = empty_document(
                    path,
                    status,
                    Diagnostic {
                        code,
                        message: error.to_string(),
                        line: None,
                        column: None,
                    },
                );
                crate::logging::config_scan_completed(
                    document.agent,
                    document.scope,
                    document.status,
                );
                return document;
            }
        };

        let checksum = Some(format!("{:x}", Sha256::digest(&bytes)));
        let modified_at_ms = fs::metadata(&path)
            .ok()
            .and_then(|metadata| metadata.modified().ok())
            .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
            .map(|duration| duration.as_millis());

        let document = match serde_json::from_slice::<Value>(&bytes) {
            Ok(mut structured_view) => {
                redact_sensitive_values(&mut structured_view);
                let source_preview = redact_raw_preview(&String::from_utf8_lossy(&bytes));
                ConfigDocument {
                    agent: Agent::ClaudeCode,
                    scope: Scope::Global,
                    format: ConfigFormat::Json,
                    path,
                    status: ConfigStatus::Ready,
                    checksum,
                    modified_at_ms,
                    structured_view,
                    source_preview,
                    diagnostics: Vec::new(),
                }
            }
            Err(error) => ConfigDocument {
                agent: Agent::ClaudeCode,
                scope: Scope::Global,
                format: ConfigFormat::Json,
                path,
                status: ConfigStatus::Invalid,
                checksum,
                modified_at_ms,
                structured_view: Value::Null,
                source_preview: redact_raw_preview(&String::from_utf8_lossy(&bytes)),
                diagnostics: vec![Diagnostic {
                    code: DiagnosticCode::JsonSyntax,
                    message: error.to_string(),
                    line: Some(error.line()),
                    column: Some(error.column()),
                }],
            },
        };
        crate::logging::config_scan_completed(document.agent, document.scope, document.status);
        document
    }
}

fn empty_document(
    path: std::path::PathBuf,
    status: ConfigStatus,
    diagnostic: Diagnostic,
) -> ConfigDocument {
    ConfigDocument {
        agent: Agent::ClaudeCode,
        scope: Scope::Global,
        format: ConfigFormat::Json,
        path,
        status,
        checksum: None,
        modified_at_ms: None,
        structured_view: Value::Null,
        source_preview: String::new(),
        diagnostics: vec![diagnostic],
    }
}

fn redact_sensitive_values(value: &mut Value) {
    match value {
        Value::Object(map) => {
            for (key, value) in map {
                if is_sensitive_key(key) {
                    *value = Value::String(REDACTED_VALUE.to_owned());
                } else {
                    redact_sensitive_values(value);
                }
            }
        }
        Value::Array(values) => {
            for value in values {
                redact_sensitive_values(value);
            }
        }
        _ => {}
    }
}

fn is_sensitive_key(key: &str) -> bool {
    let normalized = key
        .chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect::<String>();
    [
        "apikey",
        "token",
        "secret",
        "password",
        "credential",
        "authorization",
        "cookie",
        "privatekey",
    ]
    .iter()
    .any(|marker| normalized.contains(marker))
}

fn redact_raw_preview(input: &str) -> String {
    let mut scanner = JsonPreviewScanner::new(input);
    scanner.scan_value();
    scanner.copy_remaining();
    scanner.output
}

/// A best-effort JSON lexer used only for display. It preserves the original
/// whitespace, ordering, and line structure while replacing values below
/// sensitive keys. It intentionally does not validate or rewrite the source,
/// so malformed JSON can still be shown with a parser diagnostic.
struct JsonPreviewScanner<'a> {
    source: &'a [u8],
    position: usize,
    output: String,
}

impl<'a> JsonPreviewScanner<'a> {
    fn new(source: &'a str) -> Self {
        Self {
            source: source.as_bytes(),
            position: 0,
            output: String::with_capacity(source.len()),
        }
    }

    fn scan_value(&mut self) {
        self.copy_whitespace();
        match self.source.get(self.position).copied() {
            Some(b'{') => self.scan_object(),
            Some(b'[') => self.scan_array(),
            Some(b'"' | b'\'') => self.copy_string(),
            Some(_) => self.copy_primitive(),
            None => {}
        }
    }

    fn scan_object(&mut self) {
        self.copy_byte(); // {
        loop {
            self.copy_whitespace();
            match self.source.get(self.position).copied() {
                Some(b'}') => {
                    self.copy_byte();
                    break;
                }
                Some(quote @ (b'"' | b'\'')) => {
                    let key_start = self.position;
                    let key_end = self.quoted_string_end(self.position, quote);
                    let Some(key_end) = key_end else {
                        self.copy_remaining();
                        break;
                    };
                    let raw_key = std::str::from_utf8(&self.source[key_start..key_end]).ok();
                    let key = if quote == b'"' {
                        raw_key.and_then(|raw| serde_json::from_str::<String>(raw).ok())
                    } else {
                        raw_key.map(|raw| raw[1..raw.len() - 1].to_owned())
                    };
                    self.copy_until(key_end);
                    self.copy_whitespace();
                    if self.source.get(self.position) == Some(&b':') {
                        self.copy_byte();
                    }
                    self.copy_whitespace();
                    let value_start = self.position;
                    if key.as_deref().is_some_and(is_sensitive_key) {
                        let value_end = self.value_end(value_start);
                        if value_end > value_start {
                            self.output.push('"');
                            self.output.push_str(REDACTED_VALUE);
                            self.output.push('"');
                            self.position = value_end;
                        } else {
                            self.scan_value();
                        }
                    } else {
                        self.scan_value();
                    }
                }
                Some(byte) if byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-') => {
                    self.scan_unquoted_member();
                }
                Some(_) => self.copy_byte(),
                None => break,
            }
        }
    }

    fn scan_unquoted_member(&mut self) {
        let key_start = self.position;
        let mut key_end = key_start;
        while self
            .source
            .get(key_end)
            .is_some_and(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-'))
        {
            key_end += 1;
        }
        let key = std::str::from_utf8(&self.source[key_start..key_end]).ok();
        self.copy_until(key_end);
        self.copy_whitespace();
        if self.source.get(self.position) != Some(&b':') {
            return;
        }
        self.copy_byte();
        self.copy_whitespace();
        let value_start = self.position;
        if key.is_some_and(is_sensitive_key) {
            let value_end = self.value_end(value_start);
            if value_end > value_start {
                self.output.push('"');
                self.output.push_str(REDACTED_VALUE);
                self.output.push('"');
                self.position = value_end;
                return;
            }
        }
        self.scan_value();
    }

    fn scan_array(&mut self) {
        self.copy_byte(); // [
        loop {
            self.copy_whitespace();
            match self.source.get(self.position).copied() {
                Some(b']') => {
                    self.copy_byte();
                    break;
                }
                Some(b',') => self.copy_byte(),
                Some(_) => {
                    let start = self.position;
                    self.scan_value();
                    if self.position == start {
                        self.copy_byte();
                    }
                }
                None => break,
            }
        }
    }

    fn copy_string(&mut self) {
        let quote = self.source[self.position];
        let end = self
            .quoted_string_end(self.position, quote)
            .unwrap_or(self.source.len());
        self.copy_until(end);
    }

    fn copy_primitive(&mut self) {
        while let Some(byte) = self.source.get(self.position).copied() {
            if byte.is_ascii_whitespace() || matches!(byte, b',' | b'}' | b']') {
                break;
            }
            self.copy_byte();
        }
    }

    fn value_end(&self, start: usize) -> usize {
        match self.source.get(start).copied() {
            Some(quote @ (b'"' | b'\'')) => self
                .quoted_string_end(start, quote)
                .unwrap_or(self.source.len()),
            Some(b'{') | Some(b'[') => self.balanced_end(start),
            Some(byte) if !byte.is_ascii_whitespace() && !matches!(byte, b',' | b'}' | b']') => {
                let mut position = start;
                while let Some(byte) = self.source.get(position).copied() {
                    if matches!(byte, b',' | b'}' | b']' | b'\n' | b'\r') {
                        break;
                    }
                    position += 1;
                }
                while position > start
                    && self
                        .source
                        .get(position - 1)
                        .is_some_and(u8::is_ascii_whitespace)
                {
                    position -= 1;
                }
                position
            }
            _ => start,
        }
    }

    fn balanced_end(&self, start: usize) -> usize {
        let mut stack = Vec::new();
        let mut position = start;
        while let Some(byte) = self.source.get(position).copied() {
            match byte {
                quote @ (b'"' | b'\'') => {
                    position = self
                        .quoted_string_end(position, quote)
                        .unwrap_or(self.source.len());
                    continue;
                }
                b'{' | b'[' => stack.push(byte),
                b'}' if stack.last() == Some(&b'{') => {
                    stack.pop();
                    if stack.is_empty() {
                        return position + 1;
                    }
                }
                b']' if stack.last() == Some(&b'[') => {
                    stack.pop();
                    if stack.is_empty() {
                        return position + 1;
                    }
                }
                _ => {}
            }
            position += 1;
        }
        self.source.len()
    }

    fn quoted_string_end(&self, start: usize, quote: u8) -> Option<usize> {
        if self.source.get(start) != Some(&quote) {
            return None;
        }
        let mut position = start + 1;
        while let Some(byte) = self.source.get(position).copied() {
            match byte {
                b'\\' => position = position.saturating_add(2),
                byte if byte == quote => return Some(position + 1),
                _ => position += 1,
            }
        }
        None
    }

    fn copy_whitespace(&mut self) {
        while self
            .source
            .get(self.position)
            .is_some_and(u8::is_ascii_whitespace)
        {
            self.copy_byte();
        }
    }

    fn copy_byte(&mut self) {
        if self.position < self.source.len() {
            let remaining = std::str::from_utf8(&self.source[self.position..])
                .expect("preview source was created from UTF-8 text");
            if let Some(character) = remaining.chars().next() {
                self.output.push(character);
                self.position += character.len_utf8();
            }
        }
    }

    fn copy_until(&mut self, end: usize) {
        let end = end.min(self.source.len());
        if end > self.position {
            self.output
                .push_str(&String::from_utf8_lossy(&self.source[self.position..end]));
            self.position = end;
        }
    }

    fn copy_remaining(&mut self) {
        self.copy_until(self.source.len());
    }
}
