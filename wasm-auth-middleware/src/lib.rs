use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use getrandom::getrandom;
use serde::Serialize;
use sha2::{Digest, Sha256};
use url::Url;
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

    let mut url = Url::parse(authorization_endpoint)
        .map_err(|_| error("GitHub Authorize URL ist ungueltig."))?;

    url.query_pairs_mut()
        .append_pair("client_id", client_id)
        .append_pair("redirect_uri", redirect_uri)
        .append_pair("scope", scope)
        .append_pair("state", &state)
        .append_pair("code_challenge", &code_challenge)
        .append_pair("code_challenge_method", "S256")
        .append_pair("prompt", "select_account");

    let payload = LoginStart {
        authorization_url: url.to_string(),
        state,
        code_verifier,
    };

    serde_wasm_bindgen::to_value(&payload)
        .map_err(|_| error("Login-Daten konnten nicht serialisiert werden."))
}

#[wasm_bindgen]
pub fn complete_github_login(callback_url: &str, expected_state: &str) -> Result<JsValue, JsValue> {
    let url = Url::parse(callback_url).map_err(|_| error("Callback URL ist ungueltig."))?;
    let params = url.query_pairs();

    let mut code = None;
    let mut state = None;
    let mut oauth_error = None;

    for (key, value) in params {
        match key.as_ref() {
            "code" => code = Some(value.into_owned()),
            "state" => state = Some(value.into_owned()),
            "error" => oauth_error = Some(value.into_owned()),
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

fn error(message: &str) -> JsValue {
    JsValue::from_str(message)
}

#[cfg(test)]
mod tests {
    use super::pkce_challenge;

    #[test]
    fn creates_known_pkce_challenge() {
        let challenge = pkce_challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk");
        assert_eq!(challenge, "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
    }
}
