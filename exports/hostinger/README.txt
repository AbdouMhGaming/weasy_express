WEASY EXPRESS — Hostinger Node.js Deployment
=============================================

STEP 1 — Upload files
  Upload the entire contents of this folder to your Hostinger Node.js root
  (usually the folder shown in File Manager → domains/yourdomain.com/public_html
  or the path shown in Hosting → Node.js → Application Root).

STEP 2 — Install dependencies
  In Hostinger → Node.js → click "Run NPM install" (or SSH and run: npm install)
  This installs only mysql2 (everything else is already bundled inside index.mjs).

STEP 3 — Set environment variables
  In Hostinger → Node.js → Environment Variables, add each variable from .env.example:
    PORT          → leave as 3000 (or whatever Hostinger assigns)
    DB_HOST       → your MySQL host (usually "localhost")
    DB_PORT       → 3306
    DB_NAME       → your MySQL database name
    DB_USER       → your MySQL username
    DB_PASS       → your MySQL password
    RESEND_API_KEY → your Resend API key (https://resend.com)
    MAIL_FROM     → e.g. Weasy Express <noreply@weasydelivery.com>
    MAIL_TO       → email address that receives contact/partner notifications
    ADMIN_SECRET  → any long random string (secures admin JWT tokens)

STEP 4 — Set entry point
  In Hostinger → Node.js → Startup File, set it to: index.mjs

STEP 5 — Create the database tables
  Run this SQL in Hostinger → Databases → phpMyAdmin:
  (see schema.sql included in this package)

STEP 6 — Restart the app
  In Hostinger → Node.js → click "Restart".
  Your site will be live at your domain!

NOTES
  - The app serves both the API (/api/*) and the website from a single Node.js process.
  - Admin accounts are managed from /admin (login with credentials stored in the DB).
  - To create the first admin, insert a row in the "admins" table via phpMyAdmin
    using the seed script instructions in schema.sql.
