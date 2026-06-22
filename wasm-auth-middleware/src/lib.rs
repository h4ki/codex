use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use getrandom::getrandom;
use serde::Serialize;
use sha2::{Digest, Sha256};
use wasm_bindgen::prelude::*;

#[derive(Serialize)]
struct LoginStart {
    authorization_url: String,
    state: String,
    code_verifier: String,
}

#[derive(Serialize)]
struct LoginCallback {
    code: String,
    state: String,
}

#[wasm_bindgen]
pub fn start_github_login(
    client_id: &str,
    redirect_uri: &str,
    scope: &str,
    authorization_endpoint: &str,
) -> Result<JsValue, JsValue> {
    if client_id.trim().is_empty() {
        return Err(error("client_id darf nicht leer sein."));
    }

    let state = random_url_token(32)?;
    let code_verifier = random_url_token(64)?;
    let code_challenge = pkce_challenge(&code_verifier);

    if authorization_endpoint.trim().is_empty() {
        return Err(error("GitHub Authorize URL darf nicht leer sein."));
    }

    let authorization_url = format!(
        "{authorization_endpoint}?client_id={}&redirect_uri={}&scope={}&state={}&code_challenge={}&code_challenge_method=S256&prompt=select_account",
        encode(client_id),
        encode(redirect_uri),
        encode(scope),
        encode(&state),
        encode(&code_challenge),
    );

    let payload = LoginStart {
        authorization_url,
        state,
        code_verifier,
    };

    serde_wasm_bindgen::to_value(&payload)
        .map_err(|_| error("Login-Daten konnten nicht serialisiert werden."))
}

#[wasm_bindgen]
pub fn complete_github_login(callback_url: &str, expected_state: &str) -> Result<JsValue, JsValue> {
    let mut code = None;
    let mut state = None;
    let mut oauth_error = None;

    for (key, value) in parse_query(callback_url)? {
        match key.as_str() {
            "code" => code = Some(value),
            "state" => state = Some(value),
            "error" => oauth_error = Some(value),
            _ => {}
        }
    }

    if let Some(value) = oauth_error {
        return Err(error(&format!("GitHub OAuth Fehler: {value}")));
    }

    let state = state.ok_or_else(|| error("Callback enthaelt keinen state."))?;
    if state != expected_state {
        return Err(error("OAuth state stimmt nicht ueberein."));
    }

    let code = code.ok_or_else(|| error("Callback enthaelt keinen code."))?;
    let payload = LoginCallback { code, state };

    serde_wasm_bindgen::to_value(&payload)
        .map_err(|_| error("Callback-Daten konnten nicht serialisiert werden."))
}

fn random_url_token(byte_len: usize) -> Result<String, JsValue> {
    let mut bytes = vec![0_u8; byte_len];
    getrandom(&mut bytes).map_err(|_| error("Zufallswerte konnten nicht erzeugt werden."))?;
    Ok(URL_SAFE_NO_PAD.encode(bytes))
}

fn pkce_challenge(code_verifier: &str) -> String {
    let digest = Sha256::digest(code_verifier.as_bytes());
    URL_SAFE_NO_PAD.encode(digest)
}

fn parse_query(url: &str) -> Result<Vec<(String, String)>, JsValue> {
    let query = url
        .split_once('?')
        .map(|(_, query)| query)
        .unwrap_or_default()
        .split_once('#')
        .map(|(query, _)| query)
        .unwrap_or_else(|| url.split_once('?').map(|(_, query)| query).unwrap_or_default());

    query
        .split('&')
        .filter(|part| !part.is_empty())
        .map(|part| {
            let (key, value) = part.split_once('=').unwrap_or((part, ""));
            Ok((decode(key)?, decode(value)?))
        })
        .collect()
}

fn encode(value: &str) -> String {
    let mut encoded = String::new();

    for byte in value.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                encoded.push(byte as char)
            }
            _ => encoded.push_str(&format!("%{byte:02X}")),
        }
    }

    encoded
}

fn decode(value: &str) -> Result<String, JsValue> {
    let bytes = value.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;

    while index < bytes.len() {
        match bytes[index] {
            b'%' if index + 2 < bytes.len() => {
                let hex = &value[index + 1..index + 3];
                let byte = u8::from_str_radix(hex, 16)
                    .map_err(|_| error("Callback URL konnte nicht decodiert werden."))?;
                decoded.push(byte);
                index += 3;
            }
            b'+' => {
                decoded.push(b' ');
                index += 1;
            }
            byte => {
                decoded.push(byte);
                index += 1;
            }
        }
    }

    String::from_utf8(decoded).map_err(|_| error("Callback URL konnte nicht decodiert werden."))
}

fn error(message: &str) -> JsValue {
    JsValue::from_str(message)
}

#[cfg(test)]
mod tests {
    use super::{decode, encode, pkce_challenge};

    #[test]
    fn creates_known_pkce_challenge() {
        let challenge = pkce_challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk");
        assert_eq!(challenge, "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
    }

    #[test]
    fn encodes_oauth_query_values() {
        assert_eq!(encode("read:user user:email"), "read%3Auser%20user%3Aemail");
    }

    #[test]
    fn decodes_callback_values() {
        assert_eq!(decode("mock%20code").unwrap(), "mock code");
    }
}
