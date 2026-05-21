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

Admin changes are saved to Supabase when these Vercel environment variables are configured:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_CLOUDINARY_CLOUD_NAME`
- `VITE_CLOUDINARY_UPLOAD_PRESET`

Run `supabase-schema.sql` in the Supabase SQL editor once, then create an admin user in Supabase Authentication. Use that email/password at `/login`.

Cloudinary should use an unsigned upload preset. Admin project/profile/CV uploads go to Cloudinary and the returned URLs are saved in Supabase. If Supabase is not configured, the site falls back to bundled data and browser-local storage only.

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
