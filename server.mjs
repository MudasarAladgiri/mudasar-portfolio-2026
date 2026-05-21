import { createServer } from "node:http";
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { createGzip } from "node:zlib";

const root = process.cwd();
const preferredPort = Number(process.env.PORT || 4173);
const maxCvUploadBytes = 5 * 1024 * 1024;

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

  if (req.method === "POST" && url.pathname === "/api/upload-cv") {
    handleCVUpload(req, res);
    return;
  }

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

function sendJson(res, status, payload) {
  res.writeHead(status, securityHeaders("application/json; charset=utf-8"));
  res.end(JSON.stringify(payload));
}

function parseMultipart(buffer, boundary) {
  const delimiter = Buffer.from(`--${boundary}`);
  const parts = [];
  let start = buffer.indexOf(delimiter);

  while (start !== -1) {
    start += delimiter.length;
    if (buffer[start] === 45 && buffer[start + 1] === 45) break;
    if (buffer[start] === 13 && buffer[start + 1] === 10) start += 2;

    const headerEnd = buffer.indexOf(Buffer.from("\r\n\r\n"), start);
    if (headerEnd === -1) break;

    const headers = buffer.slice(start, headerEnd).toString("utf8");
    let contentStart = headerEnd + 4;
    let next = buffer.indexOf(delimiter, contentStart);
    if (next === -1) break;
    let contentEnd = next - 2;
    if (contentEnd < contentStart) contentEnd = next;

    parts.push({
      headers,
      content: buffer.slice(contentStart, contentEnd)
    });
    start = next;
  }

  return parts;
}

function handleCVUpload(req, res) {
  if (req.headers["x-portfolio-admin"] !== "true") {
    sendJson(res, 403, { error: "Upload request is not authorized." });
    return;
  }

  const contentType = req.headers["content-type"] || "";
  const boundary = contentType.match(/boundary=(.+)$/)?.[1];
  const declaredLength = Number(req.headers["content-length"] || 0);

  if (!boundary) {
    sendJson(res, 400, { error: "Missing upload boundary." });
    return;
  }

  if (declaredLength > maxCvUploadBytes) {
    sendJson(res, 413, { error: "CV file is too large. Maximum size is 5MB." });
    return;
  }

  const chunks = [];
  let received = 0;
  let tooLarge = false;
  req.on("data", (chunk) => {
    received += chunk.length;
    if (received > maxCvUploadBytes) {
      tooLarge = true;
      return;
    }
    chunks.push(chunk);
  });
  req.on("end", () => {
    if (tooLarge) {
      if (!res.headersSent) sendJson(res, 413, { error: "CV file is too large. Maximum size is 5MB." });
      return;
    }
    const buffer = Buffer.concat(chunks);
    const filePart = parseMultipart(buffer, boundary).find((part) => part.headers.includes('name="cv"'));
    const rawFileName = filePart?.headers.match(/filename="([^"]+)"/)?.[1] || "uploaded-cv.pdf";
    const fileName = rawFileName.replace(/[^\w .()-]/g, "").slice(0, 120) || "uploaded-cv.pdf";

    if (!filePart || !fileName.toLowerCase().endsWith(".pdf")) {
      sendJson(res, 400, { error: "Only PDF files are accepted." });
      return;
    }

    if (!filePart.content.slice(0, 5).toString("utf8").startsWith("%PDF")) {
      sendJson(res, 400, { error: "The selected file does not look like a valid PDF." });
      return;
    }

    const cvDir = join(root, "public", "assets", "cv");
    mkdirSync(cvDir, { recursive: true });
    writeFileSync(join(cvDir, "Mudasar-CV.pdf"), filePart.content);
    sendJson(res, 200, {
      path: "/assets/cv/Mudasar-CV.pdf",
      fileName
    });
  });
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
