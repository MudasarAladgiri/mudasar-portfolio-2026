import { portfolioSeed } from "./data.js";

const storageKey = "mudasar-portfolio-data";
const visitorSettingsKey = "mudasar-visitor-settings";
const authKey = "mudasar-admin-auth";
const recoveryKey = "mudasar-password-recovery";
const loginMessageKey = "mudasar-login-message";
const formspreeEndpoint = "";
const adminSessionMs = 30 * 60 * 1000;
const contentRowId = "main";
const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
const cloudinaryCloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || "";
const cloudinaryUploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || "";
const hasSupabase = Boolean(supabaseUrl && supabaseAnonKey);
const hasCloudinary = Boolean(cloudinaryCloudName && cloudinaryUploadPreset);
const allCategory = { label: "All Projects", slug: "all", description: "A complete view of selected design, UI, branding, and motion work." };

const themeOptions = [
  ["fresh-green", "Fresh Green"],
  ["ocean-blue", "Ocean Blue"],
  ["purple-creative", "Purple Creative"],
  ["mint-fresh", "Mint Fresh"],
  ["cyan-tech", "Cyan Tech"],
  ["premium-gold", "Premium Gold"],
  ["minimal-black", "Minimal Black"]
];
const layoutOptions = [
  ["grid", "Grid layout"],
  ["masonry", "Masonry layout"],
  ["compact", "Compact layout"],
  ["spacious", "Spacious layout"]
];
const animationOptions = [
  ["smooth", "Smooth"],
  ["minimal", "Minimal"],
  ["off", "Off"]
];

const initialRecoverySession = captureRecoverySessionFromUrl();

const state = {
  data: loadData(),
  visitorSettings: loadVisitorSettings(),
  dataStatus: hasSupabase ? "Connecting to Supabase..." : "Using bundled project data.",
  settingsOpen: false,
  lightboxProject: null,
  lightboxIndex: 0,
  route: initialRecoverySession ? "/reset-password" : location.pathname,
  search: new URLSearchParams(location.search).get("q") || "",
  adminTab: "settings",
  authenticated: isAuthenticated(),
  recoverySession: initialRecoverySession || getRecoverySession()
};

function loadData() {
  let data = structuredClone(portfolioSeed);
  try {
    const saved = localStorage.getItem(storageKey);
    data = saved ? JSON.parse(saved) : data;
  } catch (error) {
    localStorage.removeItem(storageKey);
  }
  return mergeDefaults(data);
}

function mergeDefaults(data) {
  const merged = structuredClone(portfolioSeed);
  Object.assign(merged.settings, data.settings || {});
  if (data.settings?.adminPassword && !data.settings?.adminPasswordHash) {
    merged.settings.adminPasswordHash = portfolioSeed.settings.adminPasswordHash;
  }
  if (data.settings?.passwordResetVersion !== portfolioSeed.settings.passwordResetVersion) {
    merged.settings.adminPasswordHash = portfolioSeed.settings.adminPasswordHash;
    merged.settings.passwordResetVersion = portfolioSeed.settings.passwordResetVersion;
  }
  delete merged.settings.adminPassword;
  Object.assign(merged.profile, data.profile || {});
  Object.assign(merged.about, data.about || {});
  if (Array.isArray(data.about?.skillGroups)) {
    merged.about.skillGroups = data.about.skillGroups
      .map((group) => ({
        title: String(group.title || "Skill Group").trim(),
        skills: Array.isArray(group.skills) ? group.skills.map((skill) => String(skill || "").trim()).filter(Boolean) : []
      }))
      .filter((group) => group.title || group.skills.length);
  } else {
    merged.about.skillGroups = portfolioSeed.about.skillGroups;
  }
  if (
    !data.profile?.photo ||
    data.profile.photo === "/assets/profile-photo.svg" ||
    data.profile.photo === "/assets/mudasar-profile.png" ||
    data.profile.photo === "/assets/mudasar-profile-optimized.webp"
  ) {
    merged.profile.photo = portfolioSeed.profile.photo;
  }
  if (!data.profile?.cv || data.profile.cv === "/assets/cv/latest-cv.pdf") {
    merged.profile.cv = portfolioSeed.profile.cv;
    merged.profile.cvFileName = portfolioSeed.profile.cvFileName;
  }
  if (!data.profile?.linkedin || data.profile.linkedin === "https://www.linkedin.com/in/mudasar-aladgiri") {
    merged.profile.linkedin = portfolioSeed.profile.linkedin;
  }
  if (!Array.isArray(merged.profile.socialLinks)) {
    merged.profile.socialLinks = [];
  }
  for (const key of ["experience", "education", "certifications", "courses", "skills", "categories", "projects", "services", "languages"]) {
    if (Array.isArray(data[key])) merged[key] = data[key];
  }
  return merged;
}

function saveData() {
  localStorage.setItem(storageKey, JSON.stringify(state.data));
  if (hasSupabase && state.authenticated) {
    saveDataRemote().catch((error) => {
      console.warn("Supabase save failed", error);
    });
  }
}

function supabaseHeaders(token = getSupabaseSession()?.access_token) {
  return {
    "apikey": supabaseAnonKey,
    "Authorization": `Bearer ${token || supabaseAnonKey}`,
    "Content-Type": "application/json"
  };
}

async function supabaseRequest(path, options = {}) {
  if (!hasSupabase) throw new Error("Supabase is not configured.");
  const response = await fetch(`${supabaseUrl}${path}`, {
    ...options,
    headers: {
      ...supabaseHeaders(options.token),
      ...(options.headers || {})
    }
  });
  if (!response.ok) {
    let message = `Supabase request failed (${response.status}).`;
    try {
      const body = await response.json();
      message = body.message || body.error_description || body.error || message;
    } catch (error) {
      message = response.statusText || message;
    }
    throw new Error(message);
  }
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function loadDataRemote() {
  if (!hasSupabase) return;
  try {
    const rows = await supabaseRequest(`/rest/v1/portfolio_content?id=eq.${contentRowId}&select=data&limit=1`, {
      token: supabaseAnonKey
    });
    if (Array.isArray(rows) && rows[0]?.data) {
      state.data = mergeDefaults(rows[0].data);
      localStorage.setItem(storageKey, JSON.stringify(state.data));
      state.dataStatus = "Loaded live content from Supabase.";
    } else {
      state.dataStatus = "Supabase is connected. Seed data is showing until admin saves content.";
    }
  } catch (error) {
    state.dataStatus = `Using bundled data. Supabase load failed: ${error.message}`;
  }
  applySettings();
  render();
}

async function saveDataRemote() {
  const session = getSupabaseSession();
  if (!session?.access_token) throw new Error("Please login with Supabase admin access before saving.");

  const payload = {
    id: contentRowId,
    data: state.data,
    updated_at: new Date().toISOString()
  };

  await supabaseRequest("/rest/v1/portfolio_content?on_conflict=id", {
    method: "POST",
    token: session.access_token,
    headers: {
      "Prefer": "resolution=merge-duplicates"
    },
    body: JSON.stringify(payload)
  });
  state.dataStatus = "Saved live content to Supabase.";
}

async function saveDataAndRender(note, successMessage = "Saved to Supabase.") {
  localStorage.setItem(storageKey, JSON.stringify(state.data));
  if (note) note.textContent = hasSupabase ? "Saving to Supabase..." : "Saved locally.";
  if (hasSupabase) {
    await saveDataRemote();
    if (note) note.textContent = successMessage;
  } else if (note) {
    note.textContent = "Saved locally. Add Supabase env vars to persist changes on Vercel.";
  }
  render();
}

function loadVisitorSettings() {
  try {
    const saved = localStorage.getItem(visitorSettingsKey);
    return saved ? JSON.parse(saved) : {};
  } catch (error) {
    localStorage.removeItem(visitorSettingsKey);
    return {};
  }
}

function saveVisitorSettings() {
  localStorage.setItem(visitorSettingsKey, JSON.stringify(state.visitorSettings));
}

function isAuthenticated() {
  if (hasSupabase) {
    const session = getSupabaseSession();
    return Boolean(session?.access_token && session.expires_at && Date.now() < session.expires_at);
  }
  try {
    const session = JSON.parse(sessionStorage.getItem(authKey) || "null");
    if (!session?.authenticated || !session?.expiresAt || Date.now() > session.expiresAt) {
      sessionStorage.removeItem(authKey);
      return false;
    }
    return true;
  } catch (error) {
    sessionStorage.removeItem(authKey);
    return false;
  }
}

function setAdminSession() {
  sessionStorage.setItem(authKey, JSON.stringify({
    authenticated: true,
    expiresAt: Date.now() + adminSessionMs
  }));
}

function getSupabaseSession() {
  try {
    const session = JSON.parse(sessionStorage.getItem(authKey) || "null");
    if (!session?.access_token || !session?.expires_at || Date.now() > session.expires_at) {
      sessionStorage.removeItem(authKey);
      return null;
    }
    return session;
  } catch (error) {
    sessionStorage.removeItem(authKey);
    return null;
  }
}

function setSupabaseSession(session) {
  sessionStorage.setItem(authKey, JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: Date.now() + Number(session.expires_in || 3600) * 1000,
    email: session.user?.email || ""
  }));
}

function captureRecoverySessionFromUrl() {
  const query = new URLSearchParams(location.search);
  const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
  const params = hash.get("access_token") ? hash : query;
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  const type = params.get("type");

  if (type !== "recovery" || !accessToken) return null;

  const session = {
    access_token: accessToken,
    refresh_token: refreshToken || "",
    token_type: params.get("token_type") || "bearer",
    expires_at: Date.now() + Number(params.get("expires_in") || 3600) * 1000
  };
  sessionStorage.setItem(recoveryKey, JSON.stringify(session));
  history.replaceState({}, "", "/reset-password");
  return session;
}

function getRecoverySession() {
  try {
    const session = JSON.parse(sessionStorage.getItem(recoveryKey) || "null");
    if (!session?.access_token || !session?.expires_at || Date.now() > session.expires_at) {
      sessionStorage.removeItem(recoveryKey);
      return null;
    }
    return session;
  } catch (error) {
    sessionStorage.removeItem(recoveryKey);
    return null;
  }
}

async function updateRecoveryPassword(password) {
  if (!hasSupabase) throw new Error("Supabase is not configured on this deployment.");
  const session = state.recoverySession || getRecoverySession();
  if (!session?.access_token) throw new Error("Recovery session expired. Please request a new password reset link.");

  await supabaseRequest("/auth/v1/user", {
    method: "PUT",
    token: session.access_token,
    body: JSON.stringify({ password })
  });

  sessionStorage.removeItem(recoveryKey);
  sessionStorage.setItem(loginMessageKey, "Password updated successfully. Please login with your new password.");
  state.recoverySession = null;
}

async function signInAdmin(email, password) {
  if (!hasSupabase) {
    if (!(await passwordMatches(password))) throw new Error("Incorrect password. Try again.");
    setAdminSession();
    return;
  }
  const result = await supabaseRequest("/auth/v1/token?grant_type=password", {
    method: "POST",
    token: supabaseAnonKey,
    body: JSON.stringify({ email, password })
  });
  setSupabaseSession(result);
}

async function hashPassword(value) {
  const bytes = new TextEncoder().encode(String(value || ""));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function passwordMatches(password) {
  return await hashPassword(password) === state.data.settings.adminPasswordHash;
}

function activeSettings() {
  return {
    theme: state.visitorSettings.theme || state.data.settings.defaultTheme,
    layout: state.visitorSettings.layout || state.data.settings.defaultLayout,
    animation: state.visitorSettings.animation || state.data.settings.defaultAnimation
  };
}

function applySettings() {
  const settings = activeSettings();
  document.documentElement.dataset.theme = settings.theme;
  document.documentElement.dataset.layout = settings.layout;
  document.documentElement.dataset.animation = settings.animation;
}

function setRoute(path) {
  const url = new URL(path, location.origin);
  history.pushState({}, "", url.pathname + url.search);
  state.route = url.pathname;
  state.search = url.searchParams.get("q") || "";
  render();
  scrollTo({ top: 0, behavior: "smooth" });
}

window.addEventListener("popstate", () => {
  state.route = location.pathname;
  state.search = new URLSearchParams(location.search).get("q") || "";
  render();
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && state.lightboxProject) {
    state.lightboxProject = null;
    state.lightboxIndex = 0;
    render();
  }
  if (event.key === "ArrowRight" && state.lightboxProject) moveLightbox(1);
  if (event.key === "ArrowLeft" && state.lightboxProject) moveLightbox(-1);
});

const icons = {
  arrow: "->",
  mail: "@",
  lock: "[]",
  plus: "+",
  edit: "Edit",
  trash: "Delete",
  eye: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"></path><circle cx="12" cy="12" r="3"></circle></svg>`,
  eyeOff: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 3 18 18"></path><path d="M10.6 10.6A2 2 0 0 0 12 14a2 2 0 0 0 1.4-.6"></path><path d="M9.5 5.6A10.8 10.8 0 0 1 12 5c6 0 9.5 7 9.5 7a16.8 16.8 0 0 1-2.7 3.6"></path><path d="M6.7 6.7C4 8.5 2.5 12 2.5 12s3.5 7 9.5 7c1.4 0 2.7-.3 3.8-.8"></path></svg>`
};

function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

function profileContactLinks() {
  const p = state.data.profile;
  return [
    {
      label: "WhatsApp Bahrain",
      detail: p.phoneBahrain,
      href: `https://wa.me/${digitsOnly(p.phoneBahrain)}`,
      icon: "whatsapp"
    },
    {
      label: "WhatsApp India",
      detail: p.phoneIndia,
      href: `https://wa.me/${digitsOnly(p.phoneIndia)}`,
      icon: "whatsapp"
    },
    {
      label: "Email",
      detail: p.email,
      href: `mailto:${p.email}`,
      icon: "email"
    },
    {
      label: "LinkedIn",
      detail: "Connect professionally",
      href: p.linkedin,
      icon: "linkedin"
    }
  ];
}

function iconSvg(type) {
  const common = `viewBox="0 0 24 24" aria-hidden="true" focusable="false"`;
  if (type === "whatsapp") {
    return `<svg ${common}><path d="M20.5 11.8a8.3 8.3 0 0 1-12.3 7.3L4 20.2l1.1-4.1a8.3 8.3 0 1 1 15.4-4.3Z"/><path d="M9.1 7.7c.2-.4.4-.4.7-.4h.5c.2 0 .4.1.5.4l.7 1.7c.1.3.1.5-.1.7l-.4.5c-.1.1-.2.3 0 .5.4.8 1.1 1.5 2 1.9.2.1.4.1.5-.1l.7-.8c.2-.2.4-.2.7-.1l1.7.8c.3.1.4.3.4.5 0 .7-.5 1.4-1 1.7-.6.3-1.5.4-3-.2-2.5-1-4.1-3.2-4.2-3.3-.1-.2-1-1.4-1-2.6 0-1.1.5-1.8.8-2.2Z"/></svg>`;
  }
  if (type === "linkedin") {
    return `<svg ${common}><path d="M6.8 9.5v8.7H4V9.5h2.8ZM5.4 5.3c.9 0 1.6.6 1.6 1.5S6.3 8.3 5.4 8.3 3.8 7.7 3.8 6.8s.7-1.5 1.6-1.5Zm6.1 4.2.1 1.2c.5-.8 1.4-1.4 2.7-1.4 2 0 3.5 1.3 3.5 4.1v4.8H15v-4.5c0-1.2-.4-2-1.5-2-.8 0-1.3.5-1.6 1-.1.2-.1.5-.1.7v4.8H9V9.5h2.5Z"/></svg>`;
  }
  return `<svg ${common}><path d="M4.5 6.5h15v11h-15v-11Z"/><path d="m5.2 7.2 6.8 5 6.8-5"/></svg>`;
}

function ContactButtons() {
  const links = profileContactLinks();
  return `
    <div class="contact-buttons">
      ${links.map((link) => `
        <a class="contact-button ${link.icon}" href="${link.href}" target="${link.href.startsWith("http") ? "_blank" : "_self"}" rel="noreferrer">
          <span class="contact-icon">${iconSvg(link.icon)}</span>
          <span>
            <strong>${link.label}</strong>
            <small>${link.detail}</small>
          </span>
        </a>
      `).join("")}
    </div>
  `;
}

function projectCategories() {
  return Array.isArray(state.data.categories) ? state.data.categories : [];
}

function categoryBySlug(slug) {
  if (!slug || slug === "all") return allCategory;
  return projectCategories().find((category) => category.slug === slug);
}

function categorySlug(label) {
  return projectCategories().find((category) => category.label === label)?.slug || "all";
}

function categoryPath(label) {
  return `/projects/${categorySlug(label)}`;
}

function categoryLabel(slug) {
  return categoryBySlug(slug)?.label || allCategory.label;
}

function slugify(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function parseBadges(value) {
  return String(value || "")
    .split(",")
    .map((badge) => badge.trim())
    .filter(Boolean);
}

function isUniqueCategorySlug(slug, currentIndex = -1) {
  return projectCategories().every((category, index) => index === currentIndex || category.slug !== slug);
}

function ensureAboutSkillGroups() {
  if (!state.data.about) state.data.about = structuredClone(portfolioSeed.about);
  if (!Array.isArray(state.data.about.skillGroups)) state.data.about.skillGroups = [];
  return state.data.about.skillGroups;
}

function moveArrayItem(items, index, direction) {
  const nextIndex = index + direction;
  if (!Array.isArray(items) || index < 0 || nextIndex < 0 || index >= items.length || nextIndex >= items.length) return;
  [items[index], items[nextIndex]] = [items[nextIndex], items[index]];
}

function projectImages(project) {
  const images = Array.isArray(project.images)
    ? project.images.map((image) => String(image || "").trim()).filter(Boolean).slice(0, 3)
    : [];

  if (images.length) return images;
  if (project.media && project.media !== "gradient" && project.mediaType !== "video") return [project.media];
  return [];
}

function isVideoProject(project) {
  return project.mediaType === "video" && project.media && project.media !== "gradient";
}

function projectThumbnail(project) {
  return projectImages(project)[0] || "";
}

function videoProvider(url) {
  const value = String(url || "");
  if (/youtu\.be|youtube\.com/i.test(value)) return "youtube";
  if (/vimeo\.com/i.test(value)) return "vimeo";
  if (/\.mp4($|\?)/i.test(value)) return "mp4";
  return value ? "video" : "";
}

function videoEmbedUrl(url) {
  const value = String(url || "").trim();
  const provider = videoProvider(value);
  if (provider === "youtube") {
    const id = value.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([A-Za-z0-9_-]{6,})/)?.[1];
    return id ? `https://www.youtube.com/embed/${id}` : value;
  }
  if (provider === "vimeo") {
    const id = value.match(/vimeo\.com\/(?:video\/)?(\d+)/)?.[1];
    return id ? `https://player.vimeo.com/video/${id}` : value;
  }
  return value;
}

function videoFrame(project, autoplay = false) {
  const provider = videoProvider(project.media);
  if (provider === "youtube" || provider === "vimeo") {
    const src = `${videoEmbedUrl(project.media)}${videoEmbedUrl(project.media).includes("?") ? "&" : "?"}${autoplay ? "autoplay=1&" : ""}title=0&byline=0&portrait=0`;
    return `<iframe src="${src}" title="${project.title}" loading="lazy" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>`;
  }
  return `<video src="${project.media}" preload="none" controls playsinline ${autoplay ? "autoplay" : ""}></video>`;
}

function mediaPlaceholder(project) {
  return `<div class="generated-media media-placeholder"><span>${project.category}</span></div>`;
}

function videoPoster(project) {
  const thumbnail = projectThumbnail(project);
  return `
    <button class="video-poster ${thumbnail ? "" : "generated-media"}" type="button" data-view-image="${projectSlug(project)}" data-view-video="true" aria-label="Play ${project.title}">
      ${thumbnail ? `<img src="${thumbnail}" alt="${project.title}" loading="lazy" decoding="async" />` : `<span>${project.category}</span>`}
      <span class="play-icon" aria-hidden="true"></span>
    </button>
  `;
}

function galleryMedia(project, image, extraClass = "") {
  if (isVideoProject(project)) return videoFrame(project, true);
  if (image) return `<img src="${image}" alt="${project.title}" loading="lazy" decoding="async" />`;
  return `<div class="${extraClass} lightbox-placeholder generated-media"><span>${project.category}</span></div>`;
}

function projectSlug(project) {
  return project.slug || slugify(`${project.category}-${project.title}`);
}

function shell(content) {
  const links = [
    ["Home", "/"],
    ["About", "/about"],
    ["Resume", "/resume"],
    ["Projects", "/projects"],
    ["Services", "/services"],
    ["Contact", "/contact"]
  ];
  return `
    <header class="nav-wrap">
      <nav class="nav" aria-label="Primary navigation">
        <a class="brand" href="/" data-link aria-label="Mudasar Aladgiri home">
          <span class="brand-mark">MA</span>
          <span>Mudasar</span>
        </a>
        <button class="nav-toggle" aria-label="Open menu" data-action="toggle-menu">Menu</button>
        <div class="nav-links" data-menu>
          ${links.map(([label, path]) => `<a class="${isActive(path)}" href="${path}" data-link>${label}</a>`).join("")}
          <a class="admin-link ${isActive("/admin")}" href="/admin" data-link>Admin</a>
        </div>
      </nav>
    </header>
    <main>${content}</main>
    ${Footer()}
    ${PublicSettings()}
  `;
}

function optionList(options, current) {
  return options.map(([value, label]) => `<option value="${value}" ${current === value ? "selected" : ""}>${label}</option>`).join("");
}

function PublicSettings() {
  const settings = activeSettings();
  return `
    <aside class="public-settings ${state.settingsOpen ? "open" : ""}" aria-label="Public theme settings">
      <button class="settings-toggle" type="button" data-action="toggle-settings" aria-label="Open theme settings">
        <span></span>
      </button>
      <form class="settings-panel" data-public-settings>
        <div>
          <p class="eyebrow">Display Settings</p>
          <h3>Customize View</h3>
        </div>
        <label>Color theme<select name="theme">${optionList(themeOptions, settings.theme)}</select></label>
        <label>Layout style<select name="layout">${optionList(layoutOptions, settings.layout)}</select></label>
        <label>Animation level<select name="animation">${optionList(animationOptions, settings.animation)}</select></label>
        <div class="settings-actions">
          <button class="btn primary" type="submit">Apply</button>
          <button class="btn ghost" type="button" data-action="reset-public-settings">Reset</button>
        </div>
      </form>
    </aside>
  `;
}

function isActive(path) {
  if (path === "/" && state.route === "/") return "active";
  if (path !== "/" && state.route.startsWith(path)) return "active";
  return "";
}

function PageIntro(title, eyebrow, text, action = "") {
  return `
    <section class="page-hero section">
      <div class="container section-head reveal">
        <div>
          <p class="eyebrow">${eyebrow}</p>
          <h1>${title}</h1>
          ${text ? `<p>${text}</p>` : ""}
        </div>
        ${action}
      </div>
    </section>
  `;
}

function HomePage() {
  return `${Hero()}${About({ compact: true })}${Projects({ compact: true })}${Services({ compact: true })}${Contact({ compact: true })}`;
}

function Hero() {
  const p = state.data.profile;
  return `
    <section class="hero section">
      <div class="hero-bg" aria-hidden="true">
        <span></span><span></span><span></span>
      </div>
      <div class="container hero-grid">
        <div class="hero-copy reveal">
          <p class="eyebrow">Creative designer in ${p.location}</p>
          <h1>${p.name}</h1>
          <h2>${p.role}</h2>
          <p class="hero-text">${p.summary}</p>
          <div class="hero-actions">
            <a class="btn primary" href="/projects" data-link>View Projects ${icons.arrow}</a>
            <a class="btn ghost" href="${p.cv}" download>Download CV</a>
            <a class="btn soft" href="/contact" data-link>Contact Me</a>
            <a class="btn social-btn" href="${p.linkedin}" target="_blank" rel="noreferrer">LinkedIn</a>
          </div>
          <div class="stats" aria-label="Portfolio highlights">
            <span><strong>4+</strong> design roles</span>
            <span><strong>8</strong> categories</span>
            <span><strong>18+</strong> skills</span>
          </div>
        </div>
        <div class="hero-card reveal">
          <div class="orbit one"></div>
          <div class="orbit two"></div>
          <div class="hero-avatar" aria-label="${p.name} profile picture">
            <img src="${p.photo}" alt="${p.name}" loading="eager" decoding="async" fetchpriority="high" width="640" height="640" />
          </div>
          <div class="designer-panel">
            <div class="panel-top">
              <span></span><span></span><span></span>
            </div>
            <div class="canvas-preview">
              <div class="shape shape-a"></div>
              <div class="shape shape-b"></div>
              <div class="shape shape-c"></div>
              <p>Branding<br />UI Layout<br />AI Visuals</p>
            </div>
            <div class="tool-row">
              ${["Ps", "Ai", "Id", "Pr", "Ae", "Canva"].map((tool) => `<span>${tool}</span>`).join("")}
            </div>
          </div>
        </div>
      </div>
    </section>
  `;
}

function About({ compact = false } = {}) {
  const about = state.data.about || portfolioSeed.about;
  const groups = Array.isArray(about.skillGroups) && about.skillGroups.length ? about.skillGroups : portfolioSeed.about.skillGroups;
  return `
    ${compact ? "" : PageIntro(about.label || "About Me", "Profile", "A focused look at my creative background, design strengths, and working style.")}
    <section class="section about ${compact ? "compact-section" : ""}">
      <div class="container two-col">
        <div class="section-copy reveal">
          <p class="eyebrow">${escapeHtml(about.label || "About Me")}</p>
          <h2>${escapeHtml(about.headline || portfolioSeed.about.headline)}</h2>
          <p>${escapeHtml(about.paragraphOne || state.data.profile.summary)}</p>
          <p>${escapeHtml(about.paragraphTwo || portfolioSeed.about.paragraphTwo)}</p>
        </div>
        <div class="skill-groups reveal">
          ${groups.map((group) => `
            <article class="skill-card">
              <h3>${escapeHtml(group.title)}</h3>
              <div>${(group.skills || []).map((skill) => `<span>${escapeHtml(skill)}</span>`).join("")}</div>
            </article>
          `).join("")}
        </div>
      </div>
    </section>
  `;
}

function Resume() {
  return `
    ${PageIntro("CV / Resume", "Dynamic CV", "Experience, education, certifications, courses, languages, and core skills from my CV.", `<a class="btn soft" href="/admin" data-link>Admin Dashboard</a>`)}
    <section class="section compact-section">
      <div class="container">
        <div class="resume-grid">
          <div class="timeline reveal">
            <h3>Experience</h3>
            ${state.data.experience.map((job) => `
              <article class="timeline-item">
                <span>${job.period}</span>
                <h4>${job.title} - ${job.company}</h4>
                <p>${job.location}</p>
                <ul>${job.points.map((point) => `<li>${point}</li>`).join("")}</ul>
              </article>
            `).join("")}
          </div>
          <div class="stacked reveal">
            ${InfoPanel("Education", state.data.education.map((e) => `<strong>${e.title}</strong><small>${e.institution} | ${e.period}</small>`))}
            ${InfoPanel("Certifications", state.data.certifications)}
            ${InfoPanel("Courses", state.data.courses)}
            ${InfoPanel("Languages", state.data.languages)}
          </div>
        </div>
        <div class="chips reveal">${state.data.skills.map((skill) => `<span>${skill}</span>`).join("")}</div>
      </div>
    </section>
  `;
}

function InfoPanel(title, items) {
  return `
    <article class="info-panel">
      <h3>${title}</h3>
      ${items.map((item) => `<p>${item}</p>`).join("")}
    </article>
  `;
}

function Projects({ compact = false } = {}) {
  return `
    ${compact ? "" : PageIntro("Projects", "Categories", "Choose a project category to view a focused listing page with search and filters.")}
    <section class="section projects ${compact ? "compact-section" : ""}">
      <div class="container">
        <div class="section-head reveal">
          <div>
            <p class="eyebrow">Project Categories</p>
            <h2>Browse design work by tool, output, and creative discipline.</h2>
          </div>
        </div>
        <div class="category-grid">
          ${projectCategories().map(CategoryCard).join("")}
        </div>
      </div>
    </section>
  `;
}

function CategoryCard(category, index) {
  const count = state.data.projects.filter((project) => project.category === category.label).length;
  return `
    <a class="category-card reveal" href="/projects/${category.slug}" data-link style="--delay:${index * 45}ms">
      <span class="category-number">${String(index + 1).padStart(2, "0")}</span>
      <div class="category-badges">
        ${(category.badges || []).map((badge) => `<span>${badge}</span>`).join("")}
      </div>
      <span class="category-accent"></span>
      <div class="category-content">
        <h3>${category.label}</h3>
        <p>${category.description}</p>
        <small>${count} project${count === 1 ? "" : "s"} ${icons.arrow}</small>
      </div>
    </a>
  `;
}

function ProjectCategoryPage(slug = "all") {
  const category = categoryBySlug(slug);
  if (!category) return NotFound();
  const categoryProjects = slug === "all"
    ? state.data.projects
    : state.data.projects.filter((project) => project.category === category.label);
  const query = state.search.trim().toLowerCase();
  const projects = query
    ? categoryProjects.filter((project) => [project.title, project.description, project.tools, project.category].join(" ").toLowerCase().includes(query))
    : categoryProjects;

  return `
    ${PageIntro(category.label, "Project Listing", category.description, `<a class="btn soft" href="/projects" data-link>All Categories</a>`)}
    <section class="section compact-section">
      <div class="container">
        <form class="search-bar reveal" data-search>
          <label>
            Search projects
            <input name="q" value="${escapeHtml(state.search)}" placeholder="Search title, tools, or description" />
          </label>
          <button class="btn primary" type="submit">Search</button>
          ${state.search ? `<a class="btn ghost" href="/projects/${category.slug}" data-link>Clear</a>` : ""}
        </form>
        <div class="category-filter reveal">
          <a class="${slug === "all" ? "active" : ""}" href="/projects/all" data-link>All</a>
          ${projectCategories().map((item) => `<a class="${slug === item.slug ? "active" : ""}" href="/projects/${item.slug}" data-link>${item.label}</a>`).join("")}
        </div>
        <div class="project-grid">
          ${projects.map(ProjectCard).join("") || `<p class="empty">No projects found. Add one from the admin dashboard or clear the search.</p>`}
        </div>
      </div>
    </section>
  `;
}

function ProjectCard(project, index) {
  const slug = categorySlug(project.category);
  const lightboxId = projectSlug(project);
  const thumbnail = projectThumbnail(project);
  const isVideo = isVideoProject(project);
  return `
    <article class="project-card reveal" style="--delay:${index * 60}ms">
      <div class="project-media ${!thumbnail && project.media === "gradient" ? "generated-media" : ""}">
        ${isVideo
          ? videoPoster(project)
          : thumbnail
          ? `<img src="${thumbnail}" alt="${project.title}" loading="lazy" decoding="async" />`
          : project.media === "gradient"
            ? `<span>${project.category}</span>`
            : `<img src="${project.media}" alt="${project.title}" loading="lazy" decoding="async" />`}
      </div>
      <div class="project-body">
        <span>${project.category}</span>
        <h3>${project.title}</h3>
        <p>${project.description}</p>
        <small>${project.tools}</small>
        <div class="project-actions">
          <a class="btn soft" href="/projects/${slug}/${lightboxId}" data-link>View Details</a>
          <button class="btn ghost" type="button" data-view-image="${lightboxId}" data-view-index="0">${isVideo ? "Play Video" : "View Image"}</button>
        </div>
      </div>
    </article>
  `;
}

function projectByLightboxId(id) {
  return state.data.projects.find((project) => projectSlug(project) === id);
}

function moveLightbox(direction) {
  const project = projectByLightboxId(state.lightboxProject);
  if (!project) return;
  if (isVideoProject(project)) return;
  const total = projectImages(project).length;
  if (total < 2) return;
  state.lightboxIndex = (state.lightboxIndex + direction + total) % total;
  render();
}

function Lightbox() {
  if (!state.lightboxProject) return "";
  const project = projectByLightboxId(state.lightboxProject);
  if (!project) return "";
  const images = projectImages(project);
  const total = images.length;
  const activeIndex = total ? Math.min(Math.max(state.lightboxIndex, 0), total - 1) : 0;
  const activeImage = images[activeIndex];
  const isVideo = isVideoProject(project);
  return `
    <div class="lightbox" data-lightbox-overlay role="dialog" aria-modal="true" aria-label="${isVideo ? "Project video preview" : "Project image preview"}">
      <button class="lightbox-close" type="button" data-close-lightbox aria-label="Close preview">X</button>
      ${!isVideo && total > 1 ? `<button class="lightbox-arrow prev" type="button" data-lightbox-prev aria-label="Previous image"><</button>` : ""}
      <div class="lightbox-stage">
        ${galleryMedia(project, activeImage)}
        ${!isVideo && total > 1 ? `
          <div class="lightbox-count">${activeIndex + 1}/${total}</div>
          <div class="lightbox-dots" aria-label="Project image thumbnails">
            ${images.map((image, index) => `
              <button class="${index === activeIndex ? "active" : ""}" type="button" data-lightbox-dot="${index}" aria-label="View image ${index + 1}">
                <img src="${image}" alt="" loading="lazy" decoding="async" />
              </button>
            `).join("")}
          </div>
        ` : ""}
      </div>
      ${!isVideo && total > 1 ? `<button class="lightbox-arrow next" type="button" data-lightbox-next aria-label="Next image">></button>` : ""}
    </div>
  `;
}

function ProjectDetails(slug, detailSlug) {
  const category = categoryBySlug(slug);
  if (!category) return NotFound();
  const list = state.data.projects.filter((project) => project.category === category.label);
  const project = list.find((item) => projectSlug(item) === detailSlug);
  if (!project) return NotFound();
  const images = projectImages(project);
  const mainImage = images[0];
  const isVideo = isVideoProject(project);

  return `
    ${PageIntro(project.title, project.category, project.description, `<a class="btn soft" href="/projects/${slug}" data-link>Back to ${project.category}</a>`)}
    <section class="section compact-section">
      <div class="container project-detail-grid">
        <div class="project-detail-gallery">
          <div class="project-media detail-media ${!mainImage && project.media === "gradient" ? "generated-media" : ""}">
            ${isVideo
              ? videoPoster(project)
              : mainImage
              ? `<img src="${mainImage}" alt="${project.title}" loading="lazy" decoding="async" />`
              : project.media === "gradient"
                  ? `<span>${project.category}</span>`
                  : `<img src="${project.media}" alt="${project.title}" loading="lazy" decoding="async" />`}
          </div>
          ${!isVideo && images.length > 1 ? `
            <div class="detail-thumbs">
              ${images.map((image, index) => `
                <button type="button" data-view-image="${projectSlug(project)}" data-view-index="${index}" aria-label="Open image ${index + 1}">
                  <img src="${image}" alt="${project.title} preview ${index + 1}" loading="lazy" decoding="async" />
                </button>
              `).join("")}
            </div>
          ` : ""}
        </div>
        <article class="info-panel">
          <h3>Project Details</h3>
          <p>${project.description}</p>
          <p><strong>Tools Used</strong><small>${project.tools}</small></p>
          <p><strong>Category</strong><small>${project.category}</small></p>
          <a class="btn primary" href="/contact" data-link>Discuss Similar Work</a>
        </article>
      </div>
    </section>
  `;
}

function Services({ compact = false } = {}) {
  return `
    ${compact ? "" : PageIntro("Services", "What I Offer", "Professional design services for brands, campaigns, interfaces, videos, and AI visual workflows.")}
    <section class="section ${compact ? "compact-section" : ""}">
      <div class="container">
        <div class="section-head reveal">
          <p class="eyebrow">Services</p>
          <h2>Creative services for brands, campaigns, interfaces, and AI visuals.</h2>
        </div>
        <div class="services-grid">
          ${state.data.services.map((service, index) => `
            <article class="service-card reveal" style="--delay:${index * 45}ms">
              <span>${String(index + 1).padStart(2, "0")}</span>
              <h3>${service}</h3>
              <p>Premium, practical design support with clean files, strong composition, and platform-ready outputs.</p>
            </article>
          `).join("")}
        </div>
      </div>
    </section>
  `;
}

function Contact({ compact = false } = {}) {
  const p = state.data.profile;
  return `
    ${compact ? "" : PageIntro("Contact", "Start A Project", "Reach out for design, UI/UX, frontend layout, video, motion, or prompt engineering work.")}
    <section class="section contact ${compact ? "compact-section" : ""}">
      <div class="container contact-grid">
        <div class="section-copy reveal">
          <p class="eyebrow">Contact</p>
          <h2>Let's build visuals that feel sharp, clear, and useful.</h2>
          ${ContactButtons()}
          <div class="contact-list">
            <span>${p.location}</span>
            <a href="${p.portfolio}" target="_blank" rel="noreferrer">Portfolio Link</a>
            ${(p.socialLinks || []).filter((social) => social.url).map((social) => `<a href="${social.url}" target="_blank" rel="noreferrer">${social.label}</a>`).join("")}
          </div>
        </div>
        <form class="contact-form reveal" data-contact>
          <label>Name<input name="name" autocomplete="name" required /></label>
          <label>Email<input type="email" name="email" autocomplete="email" required /></label>
          <label>Project Type<input name="project" placeholder="Branding, UI/UX, video..." required /></label>
          <label>Message<textarea name="message" rows="5" required></textarea></label>
          <button class="btn primary" type="submit">Send Inquiry ${icons.mail}</button>
          <p class="form-note" aria-live="polite"></p>
        </form>
      </div>
    </section>
  `;
}

function LoginPage() {
  const message = sessionStorage.getItem(loginMessageKey) || "";
  if (message) sessionStorage.removeItem(loginMessageKey);
  return `
    ${PageIntro("Login", "Admin Access", hasSupabase ? "Login with your Supabase admin user to update live portfolio content." : "Private access for updating portfolio content.")}
    <section class="section compact-section admin-page">
      <div class="container login-card reveal">
        <form data-login>
          ${hasSupabase ? `<label>Email<input type="email" name="email" autocomplete="email" required /></label>` : ""}
          <label>Password
            <span class="password-field">
              <input type="password" name="password" autocomplete="current-password" required data-password-input />
              <button class="password-toggle" type="button" data-toggle-password aria-label="Show password" aria-pressed="false">
                ${icons.eye}
              </button>
            </span>
          </label>
          <button class="btn primary" type="submit">Login ${icons.lock}</button>
          <p class="form-note" aria-live="polite">${escapeHtml(message)}</p>
        </form>
      </div>
    </section>
  `;
}

function ResetPasswordPage() {
  const hasSession = Boolean(state.recoverySession || getRecoverySession());
  return `
    ${PageIntro("Reset Password", "Supabase Recovery", "Create a new admin password for your portfolio dashboard.")}
    <section class="section compact-section admin-page">
      <div class="container login-card reveal">
        <form data-reset-password>
          <label>New password<input type="password" name="password" autocomplete="new-password" minlength="8" required /></label>
          <label>Confirm password<input type="password" name="confirmPassword" autocomplete="new-password" minlength="8" required /></label>
          <button class="btn primary" type="submit" ${hasSession ? "" : "disabled"}>Update Password ${icons.lock}</button>
          <p class="form-note" aria-live="polite">${hasSession ? "" : "Recovery session missing or expired. Please request a new password reset link."}</p>
        </form>
      </div>
    </section>
  `;
}

function Admin() {
  if (state.authenticated && !isAuthenticated()) state.authenticated = false;
  if (!state.authenticated) return LoginPage();

  const tabs = ["settings", "personal", "about", "cv", "experience", "courses", "certifications", "skills", "projects", "services"];
  return `
    ${PageIntro("Admin Dashboard", "Private Dashboard", "Add, edit, and delete dynamic portfolio content.", `<button class="btn ghost" data-action="logout">Logout</button>`)}
    <section class="section compact-section admin-page">
      <div class="container">
        <p class="admin-status">${escapeHtml(state.dataStatus)} ${hasCloudinary ? "Cloudinary uploads enabled." : "Cloudinary uploads not configured."}</p>
        <div class="admin-tabs">
          ${tabs.map((tab) => `<button class="${state.adminTab === tab ? "active" : ""}" data-admin-tab="${tab}">${tab}</button>`).join("")}
        </div>
        <div class="admin-panel">${AdminTab()}</div>
      </div>
    </section>
  `;
}

function AdminTab() {
  if (state.adminTab === "settings") return AdminSettingsEditor();
  if (state.adminTab === "personal") return PersonalEditor();
  if (state.adminTab === "about") return AboutEditor();
  if (state.adminTab === "cv") return CVEditor();
  if (state.adminTab === "experience") return ExperienceEditor();
  if (state.adminTab === "projects") return ProjectEditor();
  return SimpleListEditor(state.adminTab, state.data[state.adminTab]);
}

function CVEditor() {
  const p = state.data.profile;
  const fileName = p.cvFileName || p.cv.split("/").pop() || "Current CV";
  return `
    <div class="cv-admin-card">
      <div>
        <p class="eyebrow">Current CV</p>
        <h3>${escapeHtml(fileName)}</h3>
        <p>${escapeHtml(p.cv)}</p>
        <p class="form-note">Paste any publicly accessible PDF URL from Cloudinary, Google Drive, Dropbox, or another public host.</p>
      </div>
      <form class="admin-form multi cv-url-form" data-save-cv-url>
        <label>CV filename / title
          <input name="cvFileName" placeholder="Mudasar-Aladgiri-CV.pdf" value="${escapeHtml(fileName)}" required />
        </label>
        <label>CV URL / PDF URL
          <input name="cvUrl" type="url" placeholder="https://example.com/Mudasar-CV.pdf" value="${escapeHtml(p.cv)}" required />
        </label>
        <button class="btn primary" type="submit">Save CV URL</button>
        <p class="form-note" aria-live="polite"></p>
      </form>
      <div class="cv-actions">
        <a class="btn ghost" href="${p.cv}" target="_blank" rel="noreferrer">View Current CV</a>
        <a class="btn ghost" href="${p.cv}" target="_blank" rel="noreferrer" download="${escapeHtml(fileName)}">Download / Open Current CV</a>
      </div>
    </div>
    <div class="admin-subhead">
      <h3>Education</h3>
      <p>Add, edit, or delete education items shown on the public Resume page.</p>
    </div>
    <form class="admin-form multi" data-add-education>
      <input name="title" placeholder="Degree / title" required />
      <input name="institution" placeholder="Institution" required />
      <input name="period" placeholder="Year / period" required />
      <button class="btn primary" type="submit">${icons.plus} Add Education</button>
      <p class="form-note" aria-live="polite"></p>
    </form>
    <div class="admin-list">
      ${(state.data.education || []).map((item, index) => `
        <article>
          <p><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.institution)} | ${escapeHtml(item.period)}</small></p>
          <div>
            <button data-edit-education="${index}">${icons.edit}</button>
            <button data-delete-education="${index}">${icons.trash}</button>
          </div>
        </article>
      `).join("") || `<p class="empty">No education items yet.</p>`}
    </div>
    <div class="admin-subhead">
      <h3>Languages</h3>
      <p>Add, edit, or delete languages shown on the public Resume page.</p>
    </div>
    <form class="admin-form" data-add-language>
      <input name="language" placeholder="Language" required />
      <button class="btn primary" type="submit">${icons.plus} Add Language</button>
      <p class="form-note" aria-live="polite"></p>
    </form>
    <div class="admin-list">
      ${(state.data.languages || []).map((language, index) => `
        <article>
          <p>${escapeHtml(language)}</p>
          <div>
            <button data-edit-language="${index}">${icons.edit}</button>
            <button data-delete-language="${index}">${icons.trash}</button>
          </div>
        </article>
      `).join("") || `<p class="empty">No languages yet.</p>`}
    </div>
  `;
}

function AdminSettingsEditor() {
  const settings = state.data.settings;
  return `
    <form class="admin-form multi settings-form" data-save-admin-settings>
      <div class="admin-status">
        Manage password securely through Supabase authentication.
        <button class="btn soft" type="button" data-password-reset-info>Reset Password</button>
      </div>
      <label>Default website theme<select name="defaultTheme">${optionList(themeOptions, settings.defaultTheme)}</select></label>
      <label>Default layout<select name="defaultLayout">${optionList(layoutOptions, settings.defaultLayout)}</select></label>
      <label>Default animation<select name="defaultAnimation">${optionList(animationOptions, settings.defaultAnimation)}</select></label>
      <button class="btn primary" type="submit">Save Admin Settings</button>
      <p class="form-note" aria-live="polite"></p>
    </form>
    <div class="admin-subhead">
      <h3>Personal / Contact Details</h3>
      <p>These details power the hero, contact page, WhatsApp links, email links, LinkedIn button, and footer text.</p>
    </div>
    ${PersonalEditor()}
  `;
}

function AboutEditor() {
  const about = state.data.about || portfolioSeed.about;
  const groups = Array.isArray(about.skillGroups) ? about.skillGroups : [];
  return `
    <form class="admin-form multi about-form" data-save-about>
      <input name="label" placeholder="About section label" value="${escapeHtml(about.label || "")}" required />
      <input name="headline" placeholder="Main headline" value="${escapeHtml(about.headline || "")}" required />
      <textarea name="paragraphOne" rows="4" placeholder="First paragraph" required>${escapeHtml(about.paragraphOne || "")}</textarea>
      <textarea name="paragraphTwo" rows="4" placeholder="Second paragraph" required>${escapeHtml(about.paragraphTwo || "")}</textarea>
      <button class="btn primary" type="submit">Save About Content</button>
      <p class="form-note" aria-live="polite"></p>
    </form>
    <div class="admin-subhead">
      <h3>Skill Group Cards</h3>
      <p>Add, edit, delete, and reorder the skill cards shown in the public About section.</p>
    </div>
    <form class="admin-form" data-add-skill-group>
      <input name="title" placeholder="New group title" required />
      <input name="skills" placeholder="Skill tags, comma separated" />
      <button class="btn primary" type="submit">${icons.plus} Add Skill Group</button>
      <p class="form-note" aria-live="polite"></p>
    </form>
    <div class="admin-list skill-group-admin-list">
      ${groups.map((group, groupIndex) => `
        <article class="skill-group-admin-item">
          <p><strong>${escapeHtml(group.title)}</strong><small>${(group.skills || []).map(escapeHtml).join(", ") || "No skill tags yet"}</small></p>
          <div>
            <button data-move-skill-group="${groupIndex}" data-direction="-1" ${groupIndex === 0 ? "disabled" : ""}>Up</button>
            <button data-move-skill-group="${groupIndex}" data-direction="1" ${groupIndex === groups.length - 1 ? "disabled" : ""}>Down</button>
            <button data-edit-skill-group="${groupIndex}">${icons.edit}</button>
            <button data-delete-skill-group="${groupIndex}">${icons.trash}</button>
          </div>
          <form class="admin-form skill-tag-form" data-add-skill-tag="${groupIndex}">
            <input name="skill" placeholder="Add skill tag" required />
            <button class="btn soft" type="submit">${icons.plus} Add Tag</button>
          </form>
          <div class="tag-admin-list">
            ${(group.skills || []).map((skill, skillIndex) => `
              <span>
                ${escapeHtml(skill)}
                <button data-move-skill-tag="${groupIndex}" data-tag-index="${skillIndex}" data-direction="-1" ${skillIndex === 0 ? "disabled" : ""}>Up</button>
                <button data-move-skill-tag="${groupIndex}" data-tag-index="${skillIndex}" data-direction="1" ${skillIndex === (group.skills || []).length - 1 ? "disabled" : ""}>Down</button>
                <button data-edit-skill-tag="${groupIndex}" data-tag-index="${skillIndex}">${icons.edit}</button>
                <button data-delete-skill-tag="${groupIndex}" data-tag-index="${skillIndex}">${icons.trash}</button>
              </span>
            `).join("") || `<small>No tags yet.</small>`}
          </div>
        </article>
      `).join("") || `<p class="empty">No skill groups yet. Add one above.</p>`}
    </div>
  `;
}

function PersonalEditor() {
  const p = state.data.profile;
  return `
    <div class="profile-admin-card">
      <div class="profile-preview">
        <img src="${escapeHtml(p.photo || portfolioSeed.profile.photo)}" alt="${escapeHtml(p.name)} profile preview" loading="lazy" decoding="async" />
      </div>
      <div>
        <p class="eyebrow">Profile Picture</p>
        <h3>Current profile image</h3>
        <p>${hasCloudinary ? "Uploads are stored in Cloudinary and saved to Supabase." : "Cloudinary is not configured. Paste a hosted image URL or add Cloudinary env vars."}</p>
        <div class="profile-upload-actions">
          <label class="btn soft upload-label">Upload / Change Picture
            <input type="file" accept="image/jpeg,image/png,image/webp" data-profile-upload />
          </label>
          <button class="btn ghost" type="button" data-remove-profile-picture>Remove Picture</button>
        </div>
        <p class="form-note" data-profile-note aria-live="polite"></p>
      </div>
    </div>
    <form class="admin-form multi personal-form" data-save-personal>
      <input name="name" placeholder="Name" value="${escapeHtml(p.name)}" required />
      <input name="role" placeholder="Hero title / roles" value="${escapeHtml(p.role)}" required />
      <input name="email" type="email" placeholder="Email" value="${escapeHtml(p.email)}" required />
      <input name="phoneBahrain" placeholder="Bahrain phone / WhatsApp" value="${escapeHtml(p.phoneBahrain)}" required />
      <input name="phoneIndia" placeholder="India phone / WhatsApp" value="${escapeHtml(p.phoneIndia)}" required />
      <input name="location" placeholder="Address / location" value="${escapeHtml(p.location)}" required />
      <input name="linkedin" placeholder="LinkedIn URL" value="${escapeHtml(p.linkedin)}" />
      <input name="portfolio" placeholder="Portfolio URL" value="${escapeHtml(p.portfolio)}" />
      <input name="photo" placeholder="/assets/profile/profile.webp or hosted image URL" value="${escapeHtml(p.photo)}" />
      <textarea name="summary" rows="4" placeholder="Profile summary" required>${escapeHtml(p.summary)}</textarea>
      <button class="btn primary" type="submit">Save Personal Details</button>
      <p class="form-note" aria-live="polite"></p>
    </form>
    <div class="admin-subhead">
      <h3>Other Social Links</h3>
      <p>Add optional social links such as Behance, Instagram, Dribbble, YouTube, or GitHub.</p>
    </div>
    <form class="admin-form" data-add-social>
      <input name="label" placeholder="Social name" required />
      <input name="url" placeholder="Social URL" required />
      <button class="btn primary" type="submit">${icons.plus} Add Social</button>
    </form>
    <div class="admin-list">
      ${(p.socialLinks || []).map((social, index) => `
        <article>
          <p><strong>${social.label}</strong><small>${social.url || "No URL added"}</small></p>
          <div>
            <button data-edit-social="${index}">${icons.edit}</button>
            <button data-delete-social="${index}">${icons.trash}</button>
          </div>
        </article>
      `).join("") || `<p class="empty">No extra social links yet.</p>`}
    </div>
  `;
}

function SimpleListEditor(key, items) {
  return `
    <form class="admin-form" data-add-simple="${key}">
      <input name="value" placeholder="Add ${key.slice(0, -1) || key}" required />
      <button class="btn primary" type="submit">${icons.plus} Add</button>
    </form>
    <div class="admin-list">
      ${items.map((item, index) => `
        <article>
          <p>${item}</p>
          <div>
            <button data-edit-simple="${key}" data-index="${index}">${icons.edit}</button>
            <button data-delete-simple="${key}" data-index="${index}">${icons.trash}</button>
          </div>
        </article>
      `).join("")}
    </div>
  `;
}

function ExperienceEditor() {
  return `
    <form class="admin-form multi" data-add-experience>
      <input name="title" placeholder="Role title" required />
      <input name="company" placeholder="Company" required />
      <input name="location" placeholder="Location" required />
      <input name="period" placeholder="Period" required />
      <textarea name="points" placeholder="Bullet points, one per line" rows="4" required></textarea>
      <button class="btn primary" type="submit">${icons.plus} Add Experience</button>
    </form>
    <div class="admin-list">
      ${state.data.experience.map((job, index) => `
        <article>
          <p><strong>${job.title}</strong> - ${job.company}<small>${job.period}</small></p>
          <div><button data-delete-experience="${index}">${icons.trash}</button></div>
        </article>
      `).join("")}
    </div>
  `;
}

function ProjectEditor() {
  const categories = projectCategories();
  return `
    <div class="admin-subhead">
      <div>
        <h3>Project categories</h3>
        <p>Create, edit, or delete the categories used by public project cards and filters.</p>
      </div>
    </div>
    <form class="admin-form multi category-form" data-add-category>
      <input name="label" placeholder="Category name" required />
      <input name="slug" placeholder="URL slug, example: packaging" />
      <input name="badges" placeholder="Software badges, comma separated: Ps, Ai" />
      <input name="description" placeholder="Short category description" required />
      <button class="btn primary" type="submit">${icons.plus} Add Category</button>
    </form>
    <div class="admin-list category-admin-list">
      ${categories.map((category, index) => {
        const count = state.data.projects.filter((project) => project.category === category.label).length;
        return `
          <article>
            <p><strong>${category.label}</strong><small>/${category.slug} | ${count} project${count === 1 ? "" : "s"} | ${(category.badges || []).join(", ") || "No badges"}</small></p>
            <div>
              <button data-edit-category="${index}">${icons.edit}</button>
              <button data-delete-category="${index}">${icons.trash}</button>
              <a class="admin-view-link" href="/projects/${category.slug}" data-link>Open</a>
            </div>
          </article>
        `;
      }).join("") || `<p class="empty">No categories yet. Add a category before adding projects.</p>`}
    </div>
    <div class="admin-subhead project-admin-subhead">
      <div>
        <h3>Projects</h3>
        <p>Add and manage portfolio items inside the categories above.</p>
      </div>
    </div>
    <form class="admin-form multi" data-add-project>
      <input name="title" placeholder="Project title" required />
      <select name="category" required>${categories.map((category) => `<option value="${category.label}">${category.label}</option>`).join("")}</select>
      <input name="description" placeholder="Description" required />
      <input name="tools" placeholder="Tools used" required />
      <p class="form-note">${hasCloudinary ? "Selected files upload to Cloudinary. URLs are saved to Supabase with the project." : "Cloudinary is not configured. Paste hosted image/video URLs, or add Cloudinary env vars to enable uploads."}</p>
      <label>Image 1
        <input name="image1" placeholder="/assets/projects/project-main.webp or hosted image URL" />
        <input name="imageFile1" type="file" accept="image/*" />
      </label>
      <label>Image 2
        <input name="image2" placeholder="/assets/projects/project-2.webp or hosted image URL" />
        <input name="imageFile2" type="file" accept="image/*" />
      </label>
      <label>Image 3
        <input name="image3" placeholder="/assets/projects/project-3.webp or hosted image URL" />
        <input name="imageFile3" type="file" accept="image/*" />
      </label>
      <label>Video
        <input name="media" placeholder="Video URL: MP4, YouTube, Vimeo, or Cloudinary URL. Keep blank for image project." />
        <input name="mediaFile" type="file" accept="video/mp4,video/webm,video/quicktime,video/*" />
      </label>
      <select name="mediaType"><option>image</option><option>video</option></select>
      <button class="btn primary" type="submit">${icons.plus} Add Project</button>
      <p class="form-note" aria-live="polite"></p>
    </form>
    <div class="admin-list">
      ${state.data.projects.map((project, index) => `
        <article>
          <p><strong>${project.title}</strong><small>${project.category} | ${project.tools}</small></p>
          <div>
            <button data-edit-project="${index}">${icons.edit}</button>
            <button data-delete-project="${index}">${icons.trash}</button>
            <a class="admin-view-link" href="${categoryPath(project.category)}" data-link>Open</a>
          </div>
        </article>
      `).join("")}
    </div>
  `;
}

function Footer() {
  const p = state.data.profile;
  return `
    <footer class="footer">
      <div class="container">
        <div>
          <strong>${p.name}</strong>
          <p>Copyright 2026. ${p.role}.</p>
        </div>
        <div class="footer-links">
          <a class="footer-button" href="/" data-link>Back to home</a>
        </div>
      </div>
    </footer>
  `;
}

function NotFound() {
  return PageIntro("Page Not Found", "404", "That page does not exist yet.", `<a class="btn primary" href="/" data-link>Go Home</a>`);
}

function page() {
  const parts = state.route.split("/").filter(Boolean);
  if (state.route === "/") return HomePage();
  if (state.route === "/index.html") return HomePage();
  if (state.route === "/about") return About();
  if (state.route === "/resume" || state.route === "/cv") return Resume();
  if (state.route === "/projects") return Projects();
  if (parts[0] === "projects" && parts[1] && !parts[2]) return ProjectCategoryPage(parts[1]);
  if (parts[0] === "projects" && parts[1] && parts[2]) return ProjectDetails(parts[1], parts[2]);
  if (state.route === "/services") return Services();
  if (state.route === "/contact") return Contact();
  if (state.route === "/login") return LoginPage();
  if (state.route === "/reset-password") return ResetPasswordPage();
  if (state.route === "/admin") return Admin();
  return NotFound();
}

function render() {
  applySettings();
  document.querySelector("#app").innerHTML = shell(page()) + Lightbox();
  document.title = titleForRoute();
  bindEvents();
  revealOnScroll();
}

function titleForRoute() {
  if (state.route === "/") return "Mudasar Aladgiri | Creative Designer Portfolio";
  const parts = state.route.split("/").filter(Boolean);
  if (parts[0] === "projects" && parts[1]) return `${categoryLabel(parts[1])} | Mudasar Aladgiri`;
  const label = state.route.slice(1).replace("-", " ") || "Home";
  return `${label.charAt(0).toUpperCase() + label.slice(1)} | Mudasar Aladgiri`;
}

function bindEvents() {
  document.querySelectorAll("[data-link]").forEach((link) => {
    link.addEventListener("click", (event) => {
      const href = link.getAttribute("href");
      if (!href || href.startsWith("http") || href.startsWith("mailto:") || href.startsWith("tel:") || link.hasAttribute("download")) return;
      event.preventDefault();
      setRoute(href);
    });
  });

  document.querySelector("[data-action='toggle-menu']")?.addEventListener("click", () => {
    document.querySelector("[data-menu]")?.classList.toggle("open");
  });

  document.querySelectorAll("[data-view-image]").forEach((button) => {
    button.addEventListener("click", () => {
      state.lightboxProject = button.dataset.viewImage;
      state.lightboxIndex = Number(button.dataset.viewIndex || 0);
      render();
    });
  });

  document.querySelector("[data-close-lightbox]")?.addEventListener("click", () => {
    state.lightboxProject = null;
    state.lightboxIndex = 0;
    render();
  });

  document.querySelector("[data-lightbox-overlay]")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) {
      state.lightboxProject = null;
      state.lightboxIndex = 0;
      render();
    }
  });

  document.querySelector("[data-lightbox-prev]")?.addEventListener("click", () => moveLightbox(-1));
  document.querySelector("[data-lightbox-next]")?.addEventListener("click", () => moveLightbox(1));
  document.querySelectorAll("[data-lightbox-dot]").forEach((button) => {
    button.addEventListener("click", () => {
      state.lightboxIndex = Number(button.dataset.lightboxDot);
      render();
    });
  });

  document.querySelector("[data-action='toggle-settings']")?.addEventListener("click", () => {
    state.settingsOpen = !state.settingsOpen;
    render();
  });

  document.querySelector("[data-public-settings]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    state.visitorSettings = {
      theme: data.get("theme"),
      layout: data.get("layout"),
      animation: data.get("animation")
    };
    saveVisitorSettings();
    state.settingsOpen = false;
    render();
  });

  document.querySelector("[data-action='reset-public-settings']")?.addEventListener("click", () => {
    state.visitorSettings = {};
    localStorage.removeItem(visitorSettingsKey);
    state.settingsOpen = false;
    render();
  });

  document.querySelector("[data-search]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const query = new FormData(event.currentTarget).get("q").trim();
    setRoute(query ? `${state.route}?q=${encodeURIComponent(query)}` : state.route);
  });

  document.querySelector("[data-contact]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const note = form.querySelector(".form-note");
    const name = String(data.get("name") || "").trim();
    const email = String(data.get("email") || "").trim();
    const project = String(data.get("project") || "").trim();
    const message = String(data.get("message") || "").trim();

    if (!name || !email || !project || !message) {
      note.textContent = "Please fill in your name, email, project type, and message before sending.";
      return;
    }

    const payload = { name, email, project, message };
    if (formspreeEndpoint) {
      sendDirectInquiry(formspreeEndpoint, payload, form, note);
      return;
    }

    const subject = encodeURIComponent(`Portfolio Inquiry - ${project}`);
    const body = encodeURIComponent([
      `Name: ${name}`,
      `Email: ${email}`,
      `Project Type: ${project}`,
      "",
      "Message:",
      message
    ].join("\n"));
    const toEmail = state.data.profile.email;
    const mailtoLink = `mailto:${encodeURIComponent(toEmail)}?subject=${subject}&body=${body}`;
    const gmailLink = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(toEmail)}&su=${subject}&body=${body}`;

    note.innerHTML = `Your email app should open with the inquiry ready. If it does not, <a href="${gmailLink}" target="_blank" rel="noreferrer">open Gmail compose</a>.`;
    window.location.href = mailtoLink;
  });

  document.querySelector("[data-login]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const note = form.querySelector(".form-note");
    const data = new FormData(form);
    try {
      note.textContent = "Signing in...";
      await signInAdmin(String(data.get("email") || "").trim(), String(data.get("password") || ""));
      state.authenticated = true;
      setRoute("/admin");
      return;
    } catch (error) {
      note.textContent = error.message || "Login failed. Try again.";
    }
  });

  document.querySelector("[data-toggle-password]")?.addEventListener("click", (event) => {
    const button = event.currentTarget;
    const input = document.querySelector("[data-password-input]");
    if (!input) return;
    const shouldShow = input.type === "password";
    input.type = shouldShow ? "text" : "password";
    button.setAttribute("aria-pressed", String(shouldShow));
    button.setAttribute("aria-label", shouldShow ? "Hide password" : "Show password");
    button.innerHTML = shouldShow ? icons.eyeOff : icons.eye;
    input.focus();
  });

  document.querySelector("[data-reset-password]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const note = form.querySelector(".form-note");
    const data = new FormData(form);
    const password = String(data.get("password") || "");
    const confirmPassword = String(data.get("confirmPassword") || "");

    if (password.length < 8) {
      note.textContent = "Password must be at least 8 characters.";
      return;
    }
    if (password !== confirmPassword) {
      note.textContent = "Passwords do not match.";
      return;
    }

    try {
      note.textContent = "Updating password...";
      await updateRecoveryPassword(password);
      note.textContent = "Password updated successfully. Redirecting to login...";
      setTimeout(() => setRoute("/login"), 900);
    } catch (error) {
      note.textContent = error.message || "Could not update password. Please request a new reset link.";
    }
  });

  document.querySelector("[data-action='logout']")?.addEventListener("click", () => {
    state.authenticated = false;
    sessionStorage.removeItem(authKey);
    setRoute("/login");
  });

  document.querySelectorAll("[data-admin-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      state.adminTab = button.dataset.adminTab;
      render();
    });
  });

  document.querySelector("[data-save-admin-settings]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const note = form.querySelector(".form-note");

    state.data.settings.defaultTheme = data.get("defaultTheme");
    state.data.settings.defaultLayout = data.get("defaultLayout");
    state.data.settings.defaultAnimation = data.get("defaultAnimation");

    applySettings();
    await saveDataAndRender(note, "Admin display defaults saved.");
  });

  document.querySelector("[data-password-reset-info]")?.addEventListener("click", () => {
    const note = document.querySelector("[data-save-admin-settings] .form-note");
    if (note) {
      note.textContent = "Use Supabase Authentication to send a password recovery email. The recovery link opens this website's Reset Password screen.";
    }
  });

  document.querySelector("[data-save-about]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    state.data.about = {
      ...(state.data.about || structuredClone(portfolioSeed.about)),
      label: String(data.get("label") || "").trim(),
      headline: String(data.get("headline") || "").trim(),
      paragraphOne: String(data.get("paragraphOne") || "").trim(),
      paragraphTwo: String(data.get("paragraphTwo") || "").trim()
    };
    await saveDataAndRender(form.querySelector(".form-note"), "About content saved.");
  });

  document.querySelector("[data-add-skill-group]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    ensureAboutSkillGroups().push({
      title: String(data.get("title") || "").trim(),
      skills: parseBadges(data.get("skills"))
    });
    await saveDataAndRender(form.querySelector(".form-note"), "Skill group added.");
  });

  document.querySelectorAll("[data-edit-skill-group]").forEach((button) => {
    button.addEventListener("click", async () => {
      const index = Number(button.dataset.editSkillGroup);
      const group = ensureAboutSkillGroups()[index];
      const title = prompt("Skill group title", group.title);
      if (!title) return;
      group.title = title.trim();
      await saveDataAndRender(null, "Skill group updated.");
    });
  });

  document.querySelectorAll("[data-delete-skill-group]").forEach((button) => {
    button.addEventListener("click", async () => {
      const index = Number(button.dataset.deleteSkillGroup);
      if (!confirm("Delete this skill group card?")) return;
      ensureAboutSkillGroups().splice(index, 1);
      await saveDataAndRender(null, "Skill group deleted.");
    });
  });

  document.querySelectorAll("[data-move-skill-group]").forEach((button) => {
    button.addEventListener("click", async () => {
      moveArrayItem(ensureAboutSkillGroups(), Number(button.dataset.moveSkillGroup), Number(button.dataset.direction));
      await saveDataAndRender(null, "Skill groups reordered.");
    });
  });

  document.querySelectorAll("[data-add-skill-tag]").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const group = ensureAboutSkillGroups()[Number(form.dataset.addSkillTag)];
      const skill = String(new FormData(form).get("skill") || "").trim();
      if (!skill) return;
      group.skills = Array.isArray(group.skills) ? group.skills : [];
      group.skills.push(skill);
      await saveDataAndRender(null, "Skill tag added.");
    });
  });

  document.querySelectorAll("[data-edit-skill-tag]").forEach((button) => {
    button.addEventListener("click", async () => {
      const group = ensureAboutSkillGroups()[Number(button.dataset.editSkillTag)];
      const index = Number(button.dataset.tagIndex);
      const next = prompt("Skill tag", group.skills[index]);
      if (!next) return;
      group.skills[index] = next.trim();
      await saveDataAndRender(null, "Skill tag updated.");
    });
  });

  document.querySelectorAll("[data-delete-skill-tag]").forEach((button) => {
    button.addEventListener("click", async () => {
      const group = ensureAboutSkillGroups()[Number(button.dataset.deleteSkillTag)];
      group.skills.splice(Number(button.dataset.tagIndex), 1);
      await saveDataAndRender(null, "Skill tag deleted.");
    });
  });

  document.querySelectorAll("[data-move-skill-tag]").forEach((button) => {
    button.addEventListener("click", async () => {
      const group = ensureAboutSkillGroups()[Number(button.dataset.moveSkillTag)];
      moveArrayItem(group.skills, Number(button.dataset.tagIndex), Number(button.dataset.direction));
      await saveDataAndRender(null, "Skill tags reordered.");
    });
  });

  document.querySelector("[data-save-cv-url]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const note = form.querySelector(".form-note");
    const cvUrl = String(data.get("cvUrl") || "").trim();
    const cvFileName = String(data.get("cvFileName") || "").trim();

    try {
      const parsedUrl = new URL(cvUrl);
      if (!["http:", "https:"].includes(parsedUrl.protocol)) throw new Error();
    } catch (error) {
      note.textContent = "Enter a valid public HTTP or HTTPS PDF URL.";
      return;
    }

    state.data.profile.cv = cvUrl;
    state.data.profile.cvFileName = cvFileName;
    await saveDataAndRender(note, "CV URL saved to Supabase.");
  });

  document.querySelector("[data-add-education]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    state.data.education = Array.isArray(state.data.education) ? state.data.education : [];
    state.data.education.push({
      title: String(data.get("title") || "").trim(),
      institution: String(data.get("institution") || "").trim(),
      period: String(data.get("period") || "").trim()
    });
    await saveDataAndRender(form.querySelector(".form-note"), "Education item added.");
  });

  document.querySelectorAll("[data-edit-education]").forEach((button) => {
    button.addEventListener("click", async () => {
      const index = Number(button.dataset.editEducation);
      const item = state.data.education[index];
      const title = prompt("Degree / title", item.title);
      if (!title) return;
      const institution = prompt("Institution", item.institution);
      if (!institution) return;
      const period = prompt("Year / period", item.period);
      if (!period) return;
      Object.assign(item, {
        title: title.trim(),
        institution: institution.trim(),
        period: period.trim()
      });
      await saveDataAndRender(null, "Education item updated.");
    });
  });

  document.querySelectorAll("[data-delete-education]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirm("Delete this education item?")) return;
      state.data.education.splice(Number(button.dataset.deleteEducation), 1);
      await saveDataAndRender(null, "Education item deleted.");
    });
  });

  document.querySelector("[data-add-language]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const language = String(new FormData(form).get("language") || "").trim();
    if (!language) return;
    state.data.languages = Array.isArray(state.data.languages) ? state.data.languages : [];
    state.data.languages.push(language);
    await saveDataAndRender(form.querySelector(".form-note"), "Language added.");
  });

  document.querySelectorAll("[data-edit-language]").forEach((button) => {
    button.addEventListener("click", async () => {
      const index = Number(button.dataset.editLanguage);
      const next = prompt("Language", state.data.languages[index]);
      if (!next) return;
      state.data.languages[index] = next.trim();
      await saveDataAndRender(null, "Language updated.");
    });
  });

  document.querySelectorAll("[data-delete-language]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirm("Delete this language?")) return;
      state.data.languages.splice(Number(button.dataset.deleteLanguage), 1);
      await saveDataAndRender(null, "Language deleted.");
    });
  });

  document.querySelector("[data-save-personal]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    Object.assign(state.data.profile, {
      name: String(data.get("name") || "").trim(),
      role: String(data.get("role") || "").trim(),
      email: String(data.get("email") || "").trim(),
      phoneBahrain: String(data.get("phoneBahrain") || "").trim(),
      phoneIndia: String(data.get("phoneIndia") || "").trim(),
      location: String(data.get("location") || "").trim(),
      linkedin: String(data.get("linkedin") || "").trim(),
      portfolio: String(data.get("portfolio") || "").trim(),
      photo: String(data.get("photo") || "").trim() || portfolioSeed.profile.photo,
      summary: String(data.get("summary") || "").trim()
    });
    await saveDataAndRender(event.currentTarget.querySelector(".form-note"), "Personal details saved.");
  });

  document.querySelector("[data-profile-upload]")?.addEventListener("change", async (event) => {
    const file = event.currentTarget.files?.[0];
    const note = document.querySelector("[data-profile-note]");
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      if (note) note.textContent = "Please upload a JPG, PNG, or WEBP profile image.";
      event.currentTarget.value = "";
      return;
    }

    try {
      if (note) note.textContent = "Updating profile picture...";
      state.data.profile.photo = await uploadToCloudinary(file, "image");
      await saveDataAndRender(note, "Profile picture uploaded and saved.");
    } catch (error) {
      if (note) note.textContent = error.message || "Could not update the profile picture.";
    }
  });

  document.querySelector("[data-remove-profile-picture]")?.addEventListener("click", () => {
    state.data.profile.photo = portfolioSeed.profile.photo;
    saveData();
    render();
  });

  document.querySelector("[data-add-social]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    state.data.profile.socialLinks.push({
      label: String(data.get("label") || "").trim(),
      url: String(data.get("url") || "").trim()
    });
    saveData();
    render();
  });

  document.querySelectorAll("[data-edit-social]").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.editSocial);
      const social = state.data.profile.socialLinks[index];
      const label = prompt("Social name", social.label);
      if (!label) return;
      const url = prompt("Social URL", social.url);
      if (!url) return;
      Object.assign(social, { label, url });
      saveData();
      render();
    });
  });

  document.querySelectorAll("[data-delete-social]").forEach((button) => {
    button.addEventListener("click", () => {
      state.data.profile.socialLinks.splice(Number(button.dataset.deleteSocial), 1);
      saveData();
      render();
    });
  });

  document.querySelectorAll("[data-add-simple]").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const key = form.dataset.addSimple;
      state.data[key].push(new FormData(form).get("value"));
      saveData();
      render();
    });
  });

  document.querySelectorAll("[data-edit-simple]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.editSimple;
      const index = Number(button.dataset.index);
      const next = prompt(`Edit ${key}`, state.data[key][index]);
      if (next) {
        state.data[key][index] = next;
        saveData();
        render();
      }
    });
  });

  document.querySelectorAll("[data-delete-simple]").forEach((button) => {
    button.addEventListener("click", () => {
      state.data[button.dataset.deleteSimple].splice(Number(button.dataset.index), 1);
      saveData();
      render();
    });
  });

  document.querySelector("[data-add-experience]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    state.data.experience.unshift({
      title: data.get("title"),
      company: data.get("company"),
      location: data.get("location"),
      period: data.get("period"),
      points: data.get("points").split("\n").filter(Boolean)
    });
    saveData();
    render();
  });

  document.querySelectorAll("[data-delete-experience]").forEach((button) => {
    button.addEventListener("click", () => {
      state.data.experience.splice(Number(button.dataset.deleteExperience), 1);
      saveData();
      render();
    });
  });

  document.querySelector("[data-add-category]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const label = String(data.get("label") || "").trim();
    const slug = slugify(data.get("slug") || label);
    const description = String(data.get("description") || "").trim();
    const badges = parseBadges(data.get("badges"));

    if (!label || !slug || !description) {
      alert("Please add a category name and description.");
      return;
    }
    if (!isUniqueCategorySlug(slug)) {
      alert("A category with this slug already exists. Choose another slug.");
      return;
    }

    state.data.categories.push({
      label,
      slug,
      description,
      image: `/assets/categories/${slug}.svg`,
      badges
    });
    saveData();
    render();
  });

  document.querySelectorAll("[data-edit-category]").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.editCategory);
      const category = state.data.categories[index];
      const originalLabel = category.label;
      const label = prompt("Category name", category.label);
      if (!label) return;
      const slug = slugify(prompt("Category URL slug", category.slug) || label);
      if (!slug) return;
      if (!isUniqueCategorySlug(slug, index)) {
        alert("A category with this slug already exists. Choose another slug.");
        return;
      }
      const description = prompt("Category description", category.description);
      if (!description) return;
      const badges = parseBadges(prompt("Software badges, comma separated", (category.badges || []).join(", ")));

      Object.assign(category, {
        label: label.trim(),
        slug,
        description: description.trim(),
        badges
      });

      state.data.projects.forEach((project) => {
        if (project.category === originalLabel) project.category = category.label;
      });

      saveData();
      render();
    });
  });

  document.querySelectorAll("[data-delete-category]").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.deleteCategory);
      const category = state.data.categories[index];
      const projectCount = state.data.projects.filter((project) => project.category === category.label).length;
      const message = projectCount
        ? "This category has projects. Delete category and its projects?"
        : "Are you sure you want to delete this category?";

      if (!confirm(message)) return;

      state.data.categories.splice(index, 1);
      state.data.projects = state.data.projects.filter((project) => project.category !== category.label);
      saveData();
      render();
    });
  });

  document.querySelector("[data-add-project]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    addProjectFromForm(event.currentTarget);
  });
  bindProjectManagementEvents();
}

async function addProjectFromForm(form) {
  const data = new FormData(form);
  const note = form.querySelector(".form-note");
  try {
    if (!data.get("category")) {
      alert("Create a category first, then add the project.");
      return;
    }
    const images = await projectImagesFromForm(form, data);
    const mediaFile = form.querySelector("[name='mediaFile']")?.files?.[0];
    const uploadedVideo = mediaFile ? await uploadToCloudinary(mediaFile, "video") : "";
    const media = uploadedVideo || String(data.get("media") || "").trim() || images[0] || "gradient";
    state.data.projects.unshift({
      title: data.get("title"),
      category: data.get("category"),
      description: data.get("description"),
      tools: data.get("tools"),
      mediaType: data.get("mediaType"),
      media,
      images
    });
    saveData();
    render();
  } catch (error) {
    if (note) note.textContent = error.message || "Could not save project images.";
    else alert(error.message || "Could not save project images.");
  }
}

function bindProjectManagementEvents() {
  document.querySelectorAll("[data-edit-project]").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.editProject);
      const project = state.data.projects[index];
      const title = prompt("Project title", project.title);
      if (!title) return;
      const description = prompt("Project description", project.description);
      if (!description) return;
      const tools = prompt("Tools used", project.tools);
      if (!tools) return;
      const currentImages = projectImages(project);
      const imagesInput = prompt("Project image URLs, comma separated. Maximum 3 images.", currentImages.join(", "));
      const images = parseBadges(imagesInput).slice(0, 3);
      Object.assign(project, {
        title,
        description,
        tools,
        images,
        media: images[0] || project.media || "gradient"
      });
      saveData();
      render();
    });
  });

  document.querySelectorAll("[data-delete-project]").forEach((button) => {
    button.addEventListener("click", () => {
      state.data.projects.splice(Number(button.dataset.deleteProject), 1);
      saveData();
      render();
    });
  });
}

async function uploadToCloudinary(file, resourceType = "auto") {
  if (!hasCloudinary) {
    throw new Error("Cloudinary is not configured. Add VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET.");
  }
  const body = new FormData();
  body.append("file", file);
  body.append("upload_preset", cloudinaryUploadPreset);
  body.append("folder", "mudasar-portfolio");

  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudinaryCloudName}/${resourceType}/upload`, {
    method: "POST",
    body
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message || "Cloudinary upload failed.");
  return result.secure_url;
}

function fileToOptimizedDataUrl(file, maxSize = 1200, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const image = new Image();
      image.addEventListener("load", () => {
        const scale = Math.min(1, maxSize / Math.max(image.naturalWidth, image.naturalHeight));
        const width = Math.max(1, Math.round(image.naturalWidth * scale));
        const height = Math.max(1, Math.round(image.naturalHeight * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d", { alpha: false });
        context.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL("image/webp", quality));
      });
      image.addEventListener("error", () => reject(new Error("Image optimization failed.")));
      image.src = reader.result;
    });
    reader.addEventListener("error", () => reject(new Error("Image upload failed.")));
    reader.readAsDataURL(file);
  });
}

async function projectImagesFromForm(form, data) {
  const images = [];
  for (const index of [1, 2, 3]) {
    const url = String(data.get(`image${index}`) || "").trim();
    const file = form.querySelector(`[name="imageFile${index}"]`)?.files?.[0];
    if (file) {
      if (!file.type.startsWith("image/")) throw new Error("Only image files are accepted for project images.");
      images.push(await uploadToCloudinary(file, "image"));
    } else if (url) {
      images.push(url);
    }
  }
  return images.slice(0, 3);
}

async function sendDirectInquiry(endpoint, payload, form, note) {
  const button = form.querySelector("button[type='submit']");
  button.disabled = true;
  button.textContent = "Sending...";
  note.textContent = "Sending your inquiry securely...";

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: payload.name,
        email: payload.email,
        project_type: payload.project,
        message: payload.message,
        _subject: `Portfolio Inquiry - ${payload.project}`
      })
    });

    if (!response.ok) throw new Error("Direct form service returned an error.");
    form.reset();
    note.textContent = "Thank you. Your inquiry has been sent successfully.";
  } catch (error) {
    note.textContent = "Direct sending is unavailable right now. Please use the email app or Gmail fallback.";
  } finally {
    button.disabled = false;
    button.textContent = `Send Inquiry ${icons.mail}`;
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function revealOnScroll() {
  const items = document.querySelectorAll(".reveal");
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) entry.target.classList.add("visible");
    });
  }, { threshold: 0.12 });
  items.forEach((item) => observer.observe(item));
}

render();
loadDataRemote();
