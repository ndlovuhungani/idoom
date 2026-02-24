

# Auto-Deploy to Hostinger Shared Hosting

## The Problem

Hostinger's Git deployment on shared hosting only pulls files from your repo -- it does NOT run `npm install` or `npm run build`. Since this is a React/Vite app, the raw source code won't work. You need the compiled `dist/` folder served to visitors.

## The Solution

We'll set up a **GitHub Actions workflow** that automatically:
1. Builds your project whenever you push code
2. Pushes the compiled files to a separate branch called `deploy`
3. Hostinger pulls from the `deploy` branch -- giving it ready-to-serve files

This means: **every time you update code (via Lovable or GitHub), Hostinger automatically gets the latest build.**

## Setup Steps

### Step 1: Add a GitHub Actions Workflow

A new file `.github/workflows/deploy.yml` will be created that:
- Triggers on every push to `main`
- Installs dependencies and runs `npm run build`
- Copies a `.htaccess` file into the build output (for React Router)
- Force-pushes the `dist/` contents to a `deploy` branch

### Step 2: Add `.htaccess` to the Project

A `public/.htaccess` file will be added so Apache (Hostinger's server) correctly handles single-page app routing. Vite automatically copies files from `public/` into the build output.

### Step 3: Configure Hostinger

On Hostinger's side, you'll need to:
1. Go to your website's **Git** deployment settings
2. Set the **branch** to `deploy` (instead of `main`)
3. Save and trigger a pull

From then on, every code change will auto-build and auto-deploy.

---

## Technical Details

### New Files

**`.github/workflows/deploy.yml`**
- Uses Node.js 20 to install and build
- Sets the required `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` environment variables during build
- Uses `peaceiris/actions-gh-pages` or manual git push to publish `dist/` contents to the `deploy` branch

**`public/.htaccess`**
```text
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /
  RewriteRule ^index\.html$ - [L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule . /index.html [L]
</IfModule>
```

### Flow Diagram

```text
Push to main --> GitHub Actions builds --> Pushes to deploy branch --> Hostinger pulls deploy branch --> Site is live
```

