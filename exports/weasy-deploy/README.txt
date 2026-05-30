Weasy Express - Hostinger Node.js deployment
============================================

This bundle contains both the API server and the built website.
A single Node.js process serves everything.

Folder layout
-------------
package.json        Tells Hostinger how to start the app
dist/index.mjs      Bundled Node.js server (entry point)
dist/*.mjs          Logging worker files used by the server
public/             Built website (HTML, JS, CSS, images)
.env.example        Template for the environment variables you must set
.htaccess           Optional: proxy rules if you serve via Apache (see step 4)


Step-by-step on Hostinger
-------------------------

1. Upload
   - In hPanel open File Manager and navigate to your domain folder
     (e.g. /home/USER/domains/amongusgenesis.xyz/).
   - Create a folder for the app (e.g. weasy-app) and upload the contents
     of this zip into it. You can also upload the zip and "Extract" it.

2. Install dependencies
   - In hPanel open "Node.js" (or "Setup Node.js App").
   - Click "Create Application" with:
       Node.js version: 20.x or newer
       Application mode: Production
       Application root: /home/USER/domains/amongusgenesis.xyz/weasy-app
       Application URL: amongusgenesis.xyz (or the subdomain you want)
       Application startup file: server.js   (or dist/index.mjs - both work)
   - Click "Run NPM Install" once the app is created. The server bundle is
     standalone, so the install will be near-instant.

3. Set the environment variables
   - In the same Node.js panel, add the variables from .env.example:
       PORT             Hostinger usually fills this in for you
       RESEND_API_KEY   your real Resend key
       MAIL_FROM        Weasy Express <noreply@amongusgenesis.xyz>
       MAIL_TO          bigsabdou@gmail.com (or the official address)
       NODE_ENV         production
   - Click "Save" and then "Restart" the application.

4. (Apache plans only) Make / route through the Node.js app
   On most Hostinger plans you do not need this — the Node.js app already
   handles the public URL. If you see the default Hostinger placeholder
   page instead of the website, copy the included .htaccess file into the
   public_html folder of your domain. It forwards every request to the
   Node.js app on the port Hostinger gave you (replace PORT_NUMBER inside
   the file with the value you see in the Node.js panel).

5. Verify
   Open your domain in a browser. You should see the Weasy Express homepage.
   Submit a test message from the Contact page — you should receive an email
   at the address set in MAIL_TO.

Useful URLs
-----------
GET  /api/healthz   Health check (returns {"status":"ok"})
POST /api/contact   Contact form
POST /api/partner   Partner registration
GET  /api/track/:id Tracking lookup (Ecotrack)
