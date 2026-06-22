# Codex WebAssembly GitHub OAuth2

Projektstruktur fuer eine WebAssembly-Anwendung mit Rust-Middleware und GitHub-OAuth2-Authentifizierung.

Die Rust-Komponente laeuft als WebAssembly im Browser und uebernimmt die Auth-Middleware-Aufgaben fuer:

- Erzeugen von `state` und PKCE `code_verifier`
- Erzeugen der GitHub-Authorize-URL
- Validieren des OAuth-Callbacks
- Vorbereiten der Daten fuer den sicheren Token-Austausch

Der Token-Austausch selbst laeuft ueber ein kleines Backend, weil GitHub OAuth Apps beim Access-Token-Request ein `client_secret` verlangen. Dieses Secret darf niemals in WebAssembly, JavaScript oder statischen Dateien liegen.

## Struktur

```text
codex-webassembly-oauth/
  README.md
  .env.example
  package.json
  backend/
    .env.example
    package.json
    server.js
  frontend/
    .env.example
    index.html
    package.json
    src/
      app.js
      config.js
      styles.css
  e2e/
    features/
      github-oauth.feature
    steps/
      github-oauth.steps.js
    support/
      world.js
  wasm-auth-middleware/
    Cargo.toml
    src/
      lib.rs
  .github/
    workflows/
      ci.yml
```

## GitHub OAuth App

Lege in GitHub eine OAuth App an:

- Homepage URL: `http://localhost:5173`
- Authorization callback URL: `http://localhost:5173/callback`

Danach die Backend-Werte eintragen:

```bash
cp backend/.env.example backend/.env
```

```env
GITHUB_CLIENT_ID=your_github_oauth_client_id
GITHUB_CLIENT_SECRET=your_github_oauth_client_secret
FRONTEND_ORIGIN=http://localhost:5173
BACKEND_PORT=8787
```

Und die Frontend-Werte eintragen:

```bash
cp frontend/.env.example frontend/.env
```

```env
VITE_GITHUB_CLIENT_ID=your_github_oauth_client_id
VITE_GITHUB_REDIRECT_URI=http://localhost:5173/callback
VITE_GITHUB_SCOPE=read:user user:email
VITE_BACKEND_BASE_URL=http://localhost:8787
```

## Entwicklung

Abhaengigkeiten installieren:

```bash
npm install
```

WebAssembly bauen:

```bash
npm run wasm:build
```

Backend starten:

```bash
npm run dev:backend
```

Frontend starten:

```bash
npm run dev:frontend
```

Anwendung oeffnen:

```text
http://localhost:5173
```

## E2E-Test mit Gherkin

Der End-to-End-Test liegt in:

```text
e2e/features/github-oauth.feature
```

Der Test startet:

- einen lokalen GitHub-OAuth2-Mock
- das Auth-Backend
- das Vite-Frontend
- einen Chromium-Browser ueber Playwright

Danach prueft er, dass:

- der Login-Button den OAuth2-Flow startet
- die Rust/WebAssembly-Middleware eine Authorize-URL mit `state`, `code_challenge` und `code_challenge_method=S256` erzeugt
- der Callback validiert wird
- das Backend den Token-Exchange mit OAuth Code und PKCE Verifier ausfuehrt
- das authentifizierte GitHub-Profil im Frontend angezeigt wird

Test starten:

```bash
npm run test:e2e
```

Voraussetzungen fuer den lokalen E2E-Lauf:

- Node.js
- Rust/Cargo
- `wasm-pack`, wird ueber `npm install` installiert
- Chromium-Browser fuer Playwright

In GitHub Actions installiert der CI-Workflow diese Voraussetzungen automatisch.

## Authentifizierungsablauf

1. Das Frontend ruft `start_github_login` aus der Rust/Wasm-Middleware auf.
2. Die Middleware erzeugt `state`, `code_verifier` und `code_challenge`.
3. Das Frontend speichert `state` und `code_verifier` kurzlebig in `sessionStorage`.
4. Der Browser wird zu `https://github.com/login/oauth/authorize` weitergeleitet.
5. GitHub leitet zur Callback-URL zurueck.
6. Die Middleware validiert den Callback und prueft `state`.
7. Das Frontend sendet `code` und `code_verifier` an das Backend.
8. Das Backend tauscht die Daten zusammen mit `GITHUB_CLIENT_SECRET` gegen ein Access Token.
9. Das Backend ruft `https://api.github.com/user` auf und gibt ein minimales Profil zurueck.

## Sicherheit

- `GITHUB_CLIENT_SECRET` bleibt nur im Backend.
- `state` schuetzt gegen CSRF.
- PKCE bindet den Authorization Code an den urspruenglichen Browser-Flow.
- Tokens werden in diesem Beispiel nicht dauerhaft gespeichert.
- Fuer Produktion sollten Sessions, HTTPS, Rate Limits und CSRF-/Origin-Pruefungen ergaenzt werden.

## Quellen

- GitHub OAuth Authorize Endpoint: `https://github.com/login/oauth/authorize`
- GitHub OAuth Token Endpoint: `https://github.com/login/oauth/access_token`
- GitHub User API: `https://api.github.com/user`
