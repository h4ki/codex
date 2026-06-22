import { setDefaultTimeout, setWorldConstructor } from "@cucumber/cucumber";
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

setDefaultTimeout(60_000);

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const waitForUrl = async (url, timeoutMs = 30_000) => {
  const started = Date.now();
  let lastError;

  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw lastError ?? new Error(`Timeout beim Warten auf ${url}`);
};

const readJsonBody = async (request) =>
  new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });

class OAuthWorld {
  constructor() {
    this.rootDir = rootDir;
    this.mockPort = 9876;
    this.backendPort = 8787;
    this.frontendPort = 5173;
    this.mockBaseUrl = `http://127.0.0.1:${this.mockPort}`;
    this.frontendBaseUrl = `http://127.0.0.1:${this.frontendPort}`;
    this.backendBaseUrl = `http://127.0.0.1:${this.backendPort}`;
    this.processes = [];
    this.githubRequests = {
      authorize: null,
      token: null,
      user: null
    };
  }

  async startMockGithub() {
    this.mockServer = createServer(async (request, response) => {
      const url = new URL(request.url, this.mockBaseUrl);

      if (url.pathname === "/login/oauth/authorize") {
        this.githubRequests.authorize = Object.fromEntries(url.searchParams.entries());
        const redirectUri = url.searchParams.get("redirect_uri");
        const state = url.searchParams.get("state");
        const redirect = new URL(redirectUri);
        redirect.searchParams.set("code", "mock-github-code");
        redirect.searchParams.set("state", state);
        response.writeHead(302, { Location: redirect.toString() });
        response.end();
        return;
      }

      if (url.pathname === "/login/oauth/access_token" && request.method === "POST") {
        const body = await readJsonBody(request);
        this.githubRequests.token = body;
        response.writeHead(200, {
          "Content-Type": "application/json"
        });
        response.end(
          JSON.stringify({
            access_token: "mock-access-token",
            token_type: "bearer",
            scope: "read:user user:email"
          })
        );
        return;
      }

      if (url.pathname === "/user") {
        this.githubRequests.user = {
          authorization: request.headers.authorization
        };
        response.writeHead(200, {
          "Content-Type": "application/json"
        });
        response.end(
          JSON.stringify({
            id: 123456,
            login: "codex-oauth-tester",
            name: "Codex OAuth Tester",
            avatar_url: "https://example.test/avatar.png",
            html_url: "https://github.com/codex-oauth-tester"
          })
        );
        return;
      }

      response.writeHead(404, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "Nicht gefunden" }));
    });

    await new Promise((resolve) => this.mockServer.listen(this.mockPort, "127.0.0.1", resolve));
  }

  spawnProcess(command, args, env) {
    const child = spawn(command, args, {
      cwd: this.rootDir,
      env: {
        ...process.env,
        ...env
      },
      stdio: ["ignore", "pipe", "pipe"]
    });

    child.stdout.on("data", (chunk) => {
      this.lastStdout = `${this.lastStdout ?? ""}${chunk}`;
    });
    child.stderr.on("data", (chunk) => {
      this.lastStderr = `${this.lastStderr ?? ""}${chunk}`;
    });

    this.processes.push(child);
    return child;
  }

  async startApp() {
    this.spawnProcess("node", ["backend/server.js"], {
      BACKEND_PORT: String(this.backendPort),
      FRONTEND_ORIGIN: this.frontendBaseUrl,
      GITHUB_CLIENT_ID: "mock-client-id",
      GITHUB_CLIENT_SECRET: "mock-client-secret",
      GITHUB_TOKEN_ENDPOINT: `${this.mockBaseUrl}/login/oauth/access_token`,
      GITHUB_USER_ENDPOINT: `${this.mockBaseUrl}/user`
    });

    this.spawnProcess(
      "node",
      [
        "node_modules/vite/bin/vite.js",
        "preview",
        "--host",
        "127.0.0.1",
        "--port",
        String(this.frontendPort)
      ],
      {
        VITE_GITHUB_CLIENT_ID: "mock-client-id",
        VITE_GITHUB_AUTHORIZATION_ENDPOINT: `${this.mockBaseUrl}/login/oauth/authorize`,
        VITE_GITHUB_REDIRECT_URI: `${this.frontendBaseUrl}/callback`,
        VITE_GITHUB_SCOPE: "read:user user:email",
        VITE_BACKEND_BASE_URL: this.backendBaseUrl
      }
    );

    await Promise.all([
      waitForUrl(`${this.backendBaseUrl}/health`),
      waitForUrl(this.frontendBaseUrl)
    ]);
  }

  async openBrowser() {
    this.browser = await chromium.launch();
    this.page = await this.browser.newPage();
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close();
    }

    await Promise.all(
      this.processes.map(
        (child) =>
          new Promise((resolve) => {
            if (child.exitCode !== null) {
              resolve();
              return;
            }

            child.once("exit", resolve);
            child.kill("SIGTERM");
            setTimeout(() => {
              if (child.exitCode === null) {
                child.kill("SIGKILL");
              }
            }, 2_000);
          })
      )
    );

    if (this.mockServer) {
      await new Promise((resolve) => this.mockServer.close(resolve));
    }
  }
}

setWorldConstructor(OAuthWorld);
