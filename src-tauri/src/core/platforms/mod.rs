//! Independently compiled hosting-platform integrations. No platform is required by cloud sync.
pub mod contracts;
#[cfg(feature = "github")]
pub(crate) mod github;
#[cfg(feature = "gitlab")]
pub(crate) mod gitlab;
use crate::core::task_browser::{Provider, TaskFailure};
impl Provider {
    /// Whether this provider implementation is included in the current product.
    pub fn enabled(self) -> bool {
        match self {
            Self::Github => cfg!(feature = "github"),
            Self::Gitlab => cfg!(feature = "gitlab"),
        }
    }
    pub(crate) fn require(self) -> Result<(), TaskFailure> {
        if self.enabled() {
            Ok(())
        } else {
            Err(TaskFailure::new(
                "feature_unavailable",
                "This build does not include the selected hosting platform",
            ))
        }
    }
    pub(crate) fn cli(self) -> Result<&'static str, TaskFailure> {
        self.require()?;
        match self {
            #[cfg(feature = "github")]
            Self::Github => Ok(github::CLI),
            #[cfg(feature = "gitlab")]
            Self::Gitlab => Ok(gitlab::CLI),
            #[cfg(not(feature = "github"))]
            Self::Github => unreachable!(),
            #[cfg(not(feature = "gitlab"))]
            Self::Gitlab => unreachable!(),
        }
    }
}
