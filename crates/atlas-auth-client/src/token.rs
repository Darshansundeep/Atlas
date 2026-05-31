//! Opaque-token holder + JWT claim shapes. Spec 002-cloud-auth.

use serde::{Deserialize, Serialize};

/// The wire shape of the JWT access-token claims. Verification happens
/// server-side at v1 (R-002-004); this struct is here so consumers can
/// destructure without re-defining the keys.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccessClaims {
    pub sub: String,
    pub email: String,
    pub sub_tier: String,
    pub device_install_id: String,
    pub iss: Option<String>,
    pub aud: Option<String>,
    pub iat: Option<i64>,
    pub exp: Option<i64>,
}

/// A refresh token. The raw value is opaque; once the desktop has it,
/// it is stored in the OS keychain and never logged.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RefreshToken(String);

impl RefreshToken {
    pub fn new(raw: String) -> Self {
        Self(raw)
    }
    pub fn as_str(&self) -> &str {
        &self.0
    }
    pub fn into_inner(self) -> String {
        self.0
    }
}

// Never reveal in a Display impl.
impl std::fmt::Display for RefreshToken {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "<refresh-token redacted>")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn refresh_token_does_not_leak_in_display() {
        let t = RefreshToken::new("super-secret-refresh-token".into());
        assert_eq!(format!("{t}"), "<refresh-token redacted>");
        assert_eq!(t.as_str(), "super-secret-refresh-token");
    }
}
