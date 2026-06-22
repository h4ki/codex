import init, {
  complete_github_login,
  start_github_login
} from "./wasm/wasm_auth_middleware.js";
import { authConfig } from "./config.js";
import "./styles.css";

const status = document.querySelector("#status");
const profile = document.querySelector("#profile");
const loginButton = document.querySelector("#login-button");
const logoutButton = document.querySelector("#logout-button");

const setStatus = (message) => {
  status.textContent = message;
};

const showProfile = (data) => {
  profile.hidden = false;
  profile.textContent = JSON.stringify(data, null, 2);
  logoutButton.hidden = false;
  loginButton.hidden = true;
};

const clearSession = () => {
  sessionStorage.removeItem("oauth_state");
  sessionStorage.removeItem("oauth_code_verifier");
  profile.hidden = true;
  profile.textContent = "";
  logoutButton.hidden = true;
  loginButton.hidden = false;
};

const exchangeCode = async (payload) => {
  const response = await fetch(`${authConfig.backendBaseUrl}/auth/github/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error ?? "Token-Austausch fehlgeschlagen.");
  }

  return data;
};

const beginLogin = () => {
  const login = start_github_login(
    authConfig.clientId,
    authConfig.redirectUri,
    authConfig.scope,
    authConfig.authorizationEndpoint
  );

  sessionStorage.setItem("oauth_state", login.state);
  sessionStorage.setItem("oauth_code_verifier", login.code_verifier);
  window.location.assign(login.authorization_url);
};

const handleCallback = async () => {
  const callbackUrl = window.location.href;
  const expectedState = sessionStorage.getItem("oauth_state") ?? "";
  const codeVerifier = sessionStorage.getItem("oauth_code_verifier") ?? "";

  const callback = complete_github_login(callbackUrl, expectedState);

  setStatus("GitHub-Code wird sicher ausgetauscht...");

  const data = await exchangeCode({
    code: callback.code,
    codeVerifier,
    redirectUri: authConfig.redirectUri
  });

  window.history.replaceState({}, document.title, "/");
  clearSession();
  setStatus("Angemeldet.");
  showProfile(data.user);
};

const main = async () => {
  await init();

  loginButton.addEventListener("click", beginLogin);
  logoutButton.addEventListener("click", () => {
    clearSession();
    setStatus("Abgemeldet.");
  });

  const params = new URLSearchParams(window.location.search);
  if (window.location.pathname === "/callback" || params.has("code")) {
    try {
      await handleCallback();
    } catch (error) {
      clearSession();
      setStatus(error instanceof Error ? error.message : "Login fehlgeschlagen.");
    }
  }
};

main().catch((error) => {
  setStatus(error instanceof Error ? error.message : "Anwendung konnte nicht starten.");
});
