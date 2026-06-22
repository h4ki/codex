import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../.env") });
dotenv.config({ path: resolve(__dirname, ".env"), override: true });

const app = express();
const port = Number(process.env.BACKEND_PORT ?? 8787);
const frontendOrigin = process.env.FRONTEND_ORIGIN ?? "http://localhost:5173";
const githubTokenEndpoint =
  process.env.GITHUB_TOKEN_ENDPOINT ?? "https://github.com/login/oauth/access_token";
const githubUserEndpoint = process.env.GITHUB_USER_ENDPOINT ?? "https://api.github.com/user";

app.use(
  cors({
    origin: frontendOrigin,
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"]
  })
);
app.use(express.json());

const requiredEnv = ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"];

const assertConfig = () => {
  const missing = requiredEnv.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Fehlende Backend-Konfiguration: ${missing.join(", ")}`);
  }
};

app.get("/health", (_request, response) => {
  response.json({ ok: true });
});

app.post("/auth/github/token", async (request, response) => {
  try {
    assertConfig();

    const { code, codeVerifier, redirectUri } = request.body;
    if (!code || !codeVerifier || !redirectUri) {
      return response.status(400).json({
        error: "code, codeVerifier und redirectUri sind erforderlich."
      });
    }

    const tokenResponse = await fetch(githubTokenEndpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier
      })
    });

    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok || tokenData.error) {
      return response.status(401).json({
        error: tokenData.error_description ?? tokenData.error ?? "GitHub Token Request fehlgeschlagen."
      });
    }

    const userResponse = await fetch(githubUserEndpoint, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${tokenData.access_token}`,
        "X-GitHub-Api-Version": "2022-11-28"
      }
    });

    const user = await userResponse.json();
    if (!userResponse.ok) {
      return response.status(401).json({
        error: user.message ?? "GitHub Benutzerprofil konnte nicht geladen werden."
      });
    }

    response.json({
      user: {
        id: user.id,
        login: user.login,
        name: user.name,
        avatarUrl: user.avatar_url,
        profileUrl: user.html_url
      }
    });
  } catch (error) {
    response.status(500).json({
      error: error instanceof Error ? error.message : "Unbekannter Serverfehler."
    });
  }
});

app.listen(port, () => {
  console.log(`Auth backend listening on http://localhost:${port}`);
});
