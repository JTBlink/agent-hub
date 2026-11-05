pub use super::platforms::contracts::AppUpdateInfo;
use crate::core::error::AppError;
pub fn check_update(_current: &str, _proxy: Option<&str>) -> Result<AppUpdateInfo, AppError> {
    Err(AppError::not_found("APP_UPDATE_NO_RELEASE"))
}
