//! Bounded script/result contract shared by native adapters; never uses page-side eval.
use super::*;
pub(super) fn query(expression: &str) -> Result<String, AppError> {
    validate(expression)?;
    let expression = expression.trim().trim_end_matches(';');
    Ok(format!("(()=>{{try{{const value=({expression});return {{ok:true,value:value===undefined?null:value}}}}catch(error){{return {{ok:false,error:String(error)}}}}}})()"))
}
pub(super) fn validate(script: &str) -> Result<(), AppError> {
    if script.len() > 256 * 1024 {
        Err(AppError::invalid_input("Native expression exceeds limit"))
    } else {
        Ok(())
    }
}
pub(super) fn decode(json: &str, wrapped: bool) -> Result<Value, AppError> {
    if json.len() > 2 * 1024 * 1024 {
        return Err(AppError::invalid_input("Native page result exceeds limit"));
    }
    let mut value: Value = serde_json::from_str(json).map_err(AppError::io)?;
    if !wrapped {
        return Ok(value);
    }
    if value["ok"] != true {
        return Err(AppError::network(
            value["error"].as_str().unwrap_or("Native script failed"),
        ));
    }
    Ok(value["value"].take())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn decodes_native_values_and_propagates_script_failures() {
        assert_eq!(
            decode(r#"{"ok":true,"value":{"text":"page"}}"#, true).unwrap()["text"],
            "page"
        );
        assert_eq!(decode("42", false).unwrap(), 42);
        assert!(decode(r#"{"ok":false,"error":"fixture failure"}"#, true).is_err());
        assert!(decode(&"x".repeat(2 * 1024 * 1024 + 1), false).is_err());
        assert!(query(&"x".repeat(256 * 1024 + 1)).is_err());
    }
}
