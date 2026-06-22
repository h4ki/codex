Feature: GitHub OAuth2 Login ueber Rust WebAssembly
  Die Anwendung soll den GitHub OAuth2 Login ueber die Rust WebAssembly Middleware starten,
  den Callback validieren und das authentifizierte GitHub Profil anzeigen.

  Scenario: Benutzer meldet sich erfolgreich ueber GitHub OAuth2 an
    Given ein lokaler GitHub OAuth2 Mock ist verfuegbar
    And Backend und Frontend sind fuer den Mock OAuth2 Flow gestartet
    When der Benutzer die Anwendung oeffnet
    And der Benutzer den GitHub Login startet
    Then die WebAssembly Middleware erzeugt eine GitHub Authorize Anfrage mit PKCE
    And die Anwendung zeigt das authentifizierte GitHub Profil an
    And der Backend Token Exchange wurde mit dem OAuth Code und PKCE Verifier ausgefuehrt
