# Mudasar Aladgiri Portfolio

Fast, responsive portfolio website for Mudasar Aladgiri using CV-based content, reusable components, local admin editing, project filters, services, contact form, and a downloadable CV.

## Run

```powershell
.\start-portfolio.ps1
```

Open:

```text
http://localhost:4173
```

If port `4173` is already busy, the local server automatically tries the next available port and prints the exact URL in the terminal.

## Admin

Go to:

```text
http://localhost:4173/admin
```

Admin changes are saved in browser `localStorage`, so the public site updates immediately in the same browser.

For production on Vercel, uploaded files from the admin dashboard do not become GitHub files. Add permanent media to the `public/assets` folder and paste paths such as:

- `/assets/profile/profile.webp`
- `/assets/projects/project-name.webp`
- `/assets/cv/Mudasar-CV.pdf`

Then commit and push those files to GitHub so Vercel can deploy them.

Security note: this admin area is a local/static-site editor. It is useful for editing your own copy in the browser, but it is not a secure production CMS for multiple users. For a public hosted admin panel, use a backend with server-side authentication and a database.

## Routes

- `/`
- `/about`
- `/resume`
- `/projects`
- `/projects/photoshop`
- `/projects/illustrator`
- `/projects/indesign`
- `/projects/uiux`
- `/projects/social-media`
- `/projects/branding`
- `/projects/premiere-pro`
- `/projects/after-effects`
- `/services`
- `/contact`
- `/login`
- `/admin`
