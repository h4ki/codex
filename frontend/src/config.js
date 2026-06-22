export const authConfig = {
  clientId: import.meta.env.VITE_GITHUB_CLIENT_ID ?? "replace-with-github-client-id",
  authorizationEndpoint:
    import.meta.env.VITE_GITHUB_AUTHORIZATION_ENDPOINT ??
    "https://github.com/login/oauth/authorize",
  redirectUri: import.meta.env.VITE_GITHUB_REDIRECT_URI ?? "http://localhost:5173/callback",
  scope: import.meta.env.VITE_GITHUB_SCOPE ?? "read:user user:email",
  backendBaseUrl: import.meta.env.VITE_BACKEND_BASE_URL ?? "http://localhost:8787"
};
