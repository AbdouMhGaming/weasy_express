==========================================================
Weasy Express - Hostinger Deployment Guide
==========================================================

WHAT'S IN THIS FOLDER
---------------------
  index.mjs               -> The Node.js server (frontend + API in one file)
  pino-*.mjs              -> Logger workers (must stay next to index.mjs)
  thread-stream-worker.mjs-> Logger worker (must stay next to index.mjs)
  public/                 -> Built website files (HTML, CSS, JS, images)
  package.json            -> Tells Node how to start the app
  README.txt              -> This file

The server runs the website AND the API together on a single port.

----------------------------------------------------------
STEP 1 - LOG IN TO HOSTINGER hPanel
----------------------------------------------------------
  1. Open https://hpanel.hostinger.com and sign in.
  2. Pick the website / hosting plan you want to deploy to.

----------------------------------------------------------
STEP 2 - CREATE A NODE.JS APP
----------------------------------------------------------
  1. In the left menu of hPanel, find "Advanced" -> "Node.js".
     (On some plans it's "Websites" -> your domain -> "Node.js".)
  2. Click "Create application".
  3. Settings:
       Node.js version       : 20.x or higher (24.x if available)
       Application mode      : Production
       Application root      : weasy           (or any folder name)
       Application URL       : your domain (e.g. weasyexpress.com)
       Application startup file : index.mjs
  4. Click "Create".
  Hostinger now creates an empty folder at /home/USERNAME/weasy/.

----------------------------------------------------------
STEP 3 - UPLOAD THE FILES
----------------------------------------------------------
  EASY WAY (File Manager)
    1. In hPanel: "Files" -> "File Manager".
    2. Open the folder Hostinger created in Step 2 (e.g. /home/USERNAME/weasy/).
    3. Click "Upload" and upload weasy-hostinger.zip
       (the zip you downloaded from Replit).
    4. Right-click the zip in File Manager -> "Extract".
    5. Move the extracted contents UP one level so files sit directly in
       /home/USERNAME/weasy/  (not /home/USERNAME/weasy/weasy-hostinger/).
       Final layout should look like:
           weasy/
             index.mjs
             pino-file.mjs
             pino-pretty.mjs
             pino-worker.mjs
             thread-stream-worker.mjs
             package.json
             public/
    6. Delete the zip file and the empty extracted folder.

  ALTERNATIVE (FTP)
    Use FileZilla with the FTP credentials in hPanel -> Files -> FTP Accounts.
    Upload all files from this folder into your Node app's root folder.

----------------------------------------------------------
STEP 4 - SET ENVIRONMENT VARIABLES (THE SECRET STUFF)
----------------------------------------------------------
  In hPanel -> Node.js -> your app -> "Environment Variables"
  (or "Application variables"), add EACH of these one at a time:

    NAME                            VALUE
    ------------------------------  -------------------------------------------
    NODE_ENV                        production
    RESEND_API_KEY                  re_XBgf5tE1_3ehUUYvKoS25seQyUDFGGRug
    MAIL_FROM                       Weasy Express <noreply@amongusgenesis.xyz>
    MAIL_TO                         contact@weasyexpress.com, bigsabdou@gmail.com
    GOOGLE_SHEETS_WEBHOOK_URL       (your Apps Script /exec URL)
    GOOGLE_SHEETS_WEBHOOK_SECRET    (the SHARED_SECRET you set in the script)

  DO NOT put these values in any uploaded file. Only enter them through this
  panel. Hostinger keeps them server-side; visitors cannot see them.

  PORT is set automatically by Hostinger - do not add it yourself.

----------------------------------------------------------
STEP 5 - INSTALL DEPENDENCIES (one click)
----------------------------------------------------------
  In hPanel -> Node.js -> your app, click "Run NPM Install".
  (The bundle is self-contained, but Hostinger likes to see this run.
   It will finish quickly because package.json has no dependencies.)

----------------------------------------------------------
STEP 6 - START THE APP
----------------------------------------------------------
  In hPanel -> Node.js -> your app, click "Start application"
  (or "Restart" if it's already running).
  Status should turn green / "Running".

  Open your domain in a browser. You should see the Weasy Express site.

----------------------------------------------------------
STEP 7 - TEST THE FORMS
----------------------------------------------------------
  1. Open the contact form, send a test message.
     -> You should receive an email at contact@weasyexpress.com
        and bigsabdou@gmail.com.
  2. Open "Become a Partner", register a test partner.
     -> You should receive an email AND a new row should appear in the
        "Partners" tab of your Google Sheet.

  If something fails, in hPanel -> Node.js -> your app -> click "Logs".
  Look for lines starting with ERROR.

----------------------------------------------------------
STEP 8 - POINT YOUR DOMAIN (if not done yet)
----------------------------------------------------------
  If your domain is registered at Hostinger, this is automatic.
  If it's elsewhere, point its A record to the IP shown in
  hPanel -> Hosting -> your plan -> "Details".

----------------------------------------------------------
SECURITY CHECKLIST
----------------------------------------------------------
  [ ] No secret values are written inside any uploaded file.
  [ ] All secrets are entered ONLY in hPanel Environment Variables.
  [ ] You did NOT publish the Google Sheet to the web (File -> Share ->
      Publish to web -> Stop publishing) unless you actually want it public.
  [ ] The Google Sheet is shared only with your Google account.

----------------------------------------------------------
UPDATING THE SITE LATER
----------------------------------------------------------
  Get a new weasy-hostinger.zip from Replit, replace ALL files in your
  Node app folder (keep the env vars intact), then click "Restart" in
  the Node.js panel.
