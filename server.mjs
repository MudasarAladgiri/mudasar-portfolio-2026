import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { createGzip } from "node:zlib";

const root = process.cwd();
const preferredPort = Number(process.env.PORT || 4173);

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".pdf": "application/pdf",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".txt": "text/plain; charset=utf-8"
};

function securityHeaders(contentType = "application/octet-stream") {
  return {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: https:; media-src 'self' data: https:; frame-src https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com; connect-src 'self' https://formspree.io; frame-ancestors 'none'; base-uri 'self'; form-action 'self' mailto:"
  };
}

function cacheControlFor(urlPath) {
  if (urlPath.startsWith("/assets/cv/")) return "no-store";
  if (urlPath.startsWith("/assets/")) return "public, max-age=31536000, immutable";
  if (urlPath.endsWith(".css") || urlPath.endsWith(".js")) return "public, max-age=3600";
  return "no-store";
}

function isTextAsset(filePath) {
  return [".html", ".css", ".js", ".json", ".svg", ".txt"].includes(extname(filePath).toLowerCase());
}

function requestHandler(req, res) {
  const url = new URL(req.url || "/", `http://${req.headers.host || `localhost:${preferredPort}`}`);

  const cleanPath = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
  let filePath = resolve(root, cleanPath === "/" ? "index.html" : cleanPath.slice(1));
  if (cleanPath.startsWith("/assets/")) {
    const publicAssetPath = resolve(root, "public", cleanPath.slice(1));
    if (publicAssetPath.startsWith(resolve(root, "public")) && existsSync(publicAssetPath)) {
      filePath = publicAssetPath;
    }
  }

  if (!filePath.startsWith(root)) {
    res.writeHead(403, securityHeaders("text/plain; charset=utf-8"));
    res.end("Forbidden");
    return;
  }

  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    filePath = join(root, "index.html");
  }

  const contentType = types[extname(filePath).toLowerCase()] || "application/octet-stream";
  const headers = {
    ...securityHeaders(contentType),
    "Cache-Control": cacheControlFor(url.pathname)
  };
  const shouldGzip = /\bgzip\b/.test(req.headers["accept-encoding"] || "") && isTextAsset(filePath);
  if (shouldGzip) headers["Content-Encoding"] = "gzip";

  res.writeHead(200, headers);
  const stream = createReadStream(filePath);
  if (shouldGzip) {
    stream.pipe(createGzip()).pipe(res);
    return;
  }
  stream.pipe(res);
}

function listen(port, attempts = 0) {
  const server = createServer(requestHandler);

  server.once("error", (error) => {
    if (error.code === "EADDRINUSE" && !process.env.PORT && attempts < 20) {
      listen(port + 1, attempts + 1);
      return;
    }
    throw error;
  });

  server.listen(port, () => {
    console.log(`Portfolio running at http://localhost:${port}`);
  });
}

listen(preferredPort);
