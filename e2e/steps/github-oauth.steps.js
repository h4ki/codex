import assert from "node:assert/strict";
import { After, Given, Then, When } from "@cucumber/cucumber";

After(async function () {
  await this.cleanup();
});

Given("ein lokaler GitHub OAuth2 Mock ist verfuegbar", async function () {
  await this.startMockGithub();
});

Given("Backend und Frontend sind fuer den Mock OAuth2 Flow gestartet", async function () {
  await this.startApp();
});

When("der Benutzer die Anwendung oeffnet", async function () {
  await this.openBrowser();
  await this.page.goto(this.frontendBaseUrl);
  await this.page.getByRole("heading", { name: "GitHub OAuth2 Login" }).waitFor();
});

When("der Benutzer den GitHub Login startet", async function () {
  await this.page.getByRole("button", { name: "Mit GitHub anmelden" }).click();
});

Then("die WebAssembly Middleware erzeugt eine GitHub Authorize Anfrage mit PKCE", async function () {
  assert.equal(this.githubRequests.authorize.client_id, "mock-client-id");
  assert.equal(this.githubRequests.authorize.redirect_uri, `${this.frontendBaseUrl}/callback`);
  assert.equal(this.githubRequests.authorize.scope, "read:user user:email");
  assert.equal(this.githubRequests.authorize.code_challenge_method, "S256");
  assert.match(this.githubRequests.authorize.state, /^[A-Za-z0-9_-]{40,}$/);
  assert.match(this.githubRequests.authorize.code_challenge, /^[A-Za-z0-9_-]{40,}$/);
});

Then("die Anwendung zeigt das authentifizierte GitHub Profil an", async function () {
  await this.page.getByText("Angemeldet.").waitFor();
  const profileText = await this.page.locator("#profile").textContent();
  const profile = JSON.parse(profileText);

  assert.equal(profile.login, "codex-oauth-tester");
  assert.equal(profile.name, "Codex OAuth Tester");
  assert.equal(profile.profileUrl, "https://github.com/codex-oauth-tester");
});

Then(
  "der Backend Token Exchange wurde mit dem OAuth Code und PKCE Verifier ausgefuehrt",
  async function () {
    assert.equal(this.githubRequests.token.client_id, "mock-client-id");
    assert.equal(this.githubRequests.token.client_secret, "mock-client-secret");
    assert.equal(this.githubRequests.token.code, "mock-github-code");
    assert.equal(this.githubRequests.token.redirect_uri, `${this.frontendBaseUrl}/callback`);
    assert.match(this.githubRequests.token.code_verifier, /^[A-Za-z0-9_-]{80,}$/);
    assert.equal(this.githubRequests.user.authorization, "Bearer mock-access-token");
  }
);
