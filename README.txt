LA PINE CHESS CLUB — WORKING LOCAL WEBSITE

1. Extract the ZIP into a NEW folder; keep your original files as a backup.
2. Requires Python 3.10 or newer. On Windows double-click START-WINDOWS.bat.
   Or open the folder in VS Code, choose Terminal > New Terminal and run:
      py server.py
   Mac/Linux: python3 server.py
3. Open http://localhost:8000 in your browser. Keep the server window open.
   VS Code Live Server can display the pages but cannot save memberships.

WHAT IS INCLUDED
- Home page matching your green-and-gold design.
- Signup, Quads, Elo Ratings, and Members pages with working navigation.
- Required name and email; optional display name, phone, school and photo.
- Self-reported rating and source, including Unrated; playing interests.
- Opt-in member directory with circular photos, name below and rating source.
- Same-browser profile editing: change display name/photo or hide your listing.
- Private email and phone; server-backed SQLite persistence across restarts.
- Responsive mobile menu, keyboard focus, form validation and status messages.
- Elo calculator for explanation only. No automatic rating changes.

PHOTO
Place a real club photo at public/images/club-chess.jpg. Without it the homepage
shows a neat text-and-knight placeholder instead of a broken image. No stock
photo is presented as a photo of your club.

CONTENT TO CONFIRM
Replace meeting times, location and contact on public/index.html.
Quads explains the format and example pairings. No actual events, pairings,
results, or standings are invented. Add confirmed event content to quads.html.
Club rating policy is marked unconfirmed. Ask the organizer before adopting
starting ratings, K-factor or rated-game rules.

DATA AND PROFILE EDITING
club.sqlite3 is created beside server.py and contains private member data.
Back it up securely; do not upload or share it with your website's public files.
Only public/ is served to browsers. No sample or test members ship in this ZIP.
Profile editing uses a private browser cookie. Clearing cookies or moving to a
new browser loses editing access; this version has no email login or recovery.
Email is recorded but not verified. There is no email delivery service.

PUBLISHING
This is a complete local version, NOT an online club registration service yet.
The server listens only on your own computer. Other computers cannot sign up
through your localhost address. Static-only hosting won't run the database.
Before opening real registration online, choose Python-capable hosting and add
HTTPS, verified account login/recovery, organizer approval/rating controls,
request limits and persistent database backups. The local server intentionally
rejects posts from other origins; hosting will require an origin configuration.

FILES
public/index.html   public/styles.css   public/script.js
public/signup.html  public/quads.html   public/elo.html   public/members.html
server.py           START-WINDOWS.bat   README.txt
