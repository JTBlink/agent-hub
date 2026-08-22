use std::{fmt, str::FromStr};

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InvalidDomainValue {
    pub type_name: &'static str,
    pub value: String,
}

impl fmt::Display for InvalidDomainValue {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            formatter,
            "invalid {} value: {}",
            self.type_name, self.value
        )
    }
}

impl std::error::Error for InvalidDomainValue {}

macro_rules! domain_enum {
    (
        $(#[$meta:meta])*
        $name:ident {
            $( $variant:ident => $literal:literal ),+ $(,)?
        }
    ) => {
        $(#[$meta])*
        #[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
        pub enum $name {
            $(
                #[serde(rename = $literal)]
                $variant
            ),+
        }

        impl $name {
            pub const ALL: &'static [$name] = &[
                $( $name::$variant ),+
            ];

            pub const fn as_str(self) -> &'static str {
                match self {
                    $( $name::$variant => $literal ),+
                }
            }
        }

        impl FromStr for $name {
            type Err = InvalidDomainValue;

            fn from_str(value: &str) -> Result<Self, Self::Err> {
                match value {
                    $( $literal => Ok($name::$variant), )+
                    other => Err(InvalidDomainValue {
                        type_name: stringify!($name),
                        value: other.to_owned(),
                    }),
                }
            }
        }

        impl TryFrom<&str> for $name {
            type Error = InvalidDomainValue;

            fn try_from(value: &str) -> Result<Self, Self::Error> {
                value.parse()
            }
        }

        impl fmt::Display for $name {
            fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
                formatter.write_str(self.as_str())
            }
        }

        impl AsRef<str> for $name {
            fn as_ref(&self) -> &str {
                self.as_str()
            }
        }
    };
}

domain_enum! {
    /// A supported AI coding agent.
    Agent {
        ClaudeCode => "claude-code",
        Codex => "codex",
        OpenCode => "opencode"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn domain_values_round_trip_through_storage_and_json_names() {
        for agent in Agent::ALL {
            assert_eq!(agent.as_str().parse::<Agent>(), Ok(*agent));
            assert_eq!(
                serde_json::to_string(agent).expect("agent serializes"),
                format!("\"{}\"", agent.as_str())
            );
        }
        assert_eq!("opencode".parse::<Agent>(), Ok(Agent::OpenCode));
        assert!("unsupported".parse::<Agent>().is_err());
        assert_eq!(
            "plugin-skill".parse::<SkillKind>(),
            Ok(SkillKind::PluginSkill)
        );
    }
}

domain_enum! {
    /// The scope in which a configuration or Skill installation applies.
    Scope {
        Global => "global",
        Workspace => "workspace"
    }
}

domain_enum! {
    /// A configuration file syntax understood by an adapter.
    ConfigFormat {
        Json => "json",
        Jsonc => "jsonc",
        Toml => "toml",
        Yaml => "yaml",
        Markdown => "markdown"
    }
}

domain_enum! {
    /// The result of parsing a configuration file.
    ParseStatus {
        Valid => "valid",
        Invalid => "invalid",
        Missing => "missing",
        Unreadable => "unreadable"
    }
}

domain_enum! {
    /// The kind of Skill descriptor discovered from a source.
    SkillKind {
        Standard => "standard",
        PluginSkill => "plugin-skill"
    }
}

domain_enum! {
    /// The lifecycle state of a Skill installation.
    InstallationState {
        Installed => "installed",
        Pending => "pending",
        Disabled => "disabled",
        Failed => "failed"
    }
}
