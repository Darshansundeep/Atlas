//! PKCE (RFC 7636) generator. Spec 002-cloud-auth R-002-002.
//!
//! - `code_verifier`: 128 chars from the unreserved set [A-Za-z0-9-._~]
//! - `code_challenge`: BASE64URL-NO-PAD(SHA-256(code_verifier))
//! - `code_challenge_method`: always `S256`

use base64::Engine;
use rand::{thread_rng, Rng};
use sha2::{Digest, Sha256};

const VERIFIER_LEN: usize = 128;
const UNRESERVED: &[u8] =
    b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

#[derive(Debug, Clone)]
pub struct PkcePair {
    pub verifier: String,
    pub challenge: String,
}

impl PkcePair {
    pub fn new() -> Self {
        let mut rng = thread_rng();
        let verifier: String = (0..VERIFIER_LEN)
            .map(|_| {
                let idx = rng.gen_range(0..UNRESERVED.len());
                UNRESERVED[idx] as char
            })
            .collect();
        let challenge = Self::challenge_for(&verifier);
        Self { verifier, challenge }
    }

    pub fn challenge_for(verifier: &str) -> String {
        let digest = Sha256::digest(verifier.as_bytes());
        base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(digest)
    }
}

impl Default for PkcePair {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn verifier_is_128_chars() {
        let p = PkcePair::new();
        assert_eq!(p.verifier.len(), VERIFIER_LEN);
    }

    #[test]
    fn verifier_uses_only_unreserved_charset() {
        let p = PkcePair::new();
        for c in p.verifier.chars() {
            assert!(UNRESERVED.contains(&(c as u8)), "bad char: {c}");
        }
    }

    #[test]
    fn challenge_matches_spec_example() {
        // RFC 7636 Appendix B.
        let verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
        let challenge = PkcePair::challenge_for(verifier);
        assert_eq!(challenge, "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
    }

    #[test]
    fn challenge_is_base64url_no_pad() {
        let p = PkcePair::new();
        assert!(!p.challenge.contains('='));
        assert!(!p.challenge.contains('+'));
        assert!(!p.challenge.contains('/'));
    }
}
