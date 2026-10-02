"""Local club website. Python 3.10+, no third-party dependencies."""
import base64
import hashlib
import json
import os
import re
import secrets
import sqlite3
import time
from http.cookies import SimpleCookie
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
PUBLIC = ROOT / 'public'
DB = Path(os.environ.get('CHESS_DB', str(ROOT / 'club.sqlite3')))
PORT = int(os.environ.get('PORT', '8000'))
SOURCES = {'Unrated', 'Chess.com', 'Lichess', 'US Chess', 'FIDE', 'Club'}

def connect():
    db = sqlite3.connect(DB)
    db.row_factory = sqlite3.Row
    return db

def initialize():
    with connect() as db:
        db.executescript('''CREATE TABLE IF NOT EXISTS members (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, display_name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE, phone TEXT NOT NULL, school TEXT NOT NULL,
        interest TEXT NOT NULL, rating_source TEXT NOT NULL, rating INTEGER,
        listed INTEGER NOT NULL, photo BLOB, token_hash TEXT NOT NULL,
        created INTEGER NOT NULL, updated INTEGER NOT NULL);''')

def text_field(data, key, limit, required=False):
    value = data.get(key, '')
    if not isinstance(value, str):
        raise ValueError(f'Invalid {key.replace("_", " ")}.')
    value = value.strip()
    if len(value) > limit or (required and not value):
        raise ValueError(f'Please enter a valid {key.replace("_", " ")}.')
    return value

def photo_bytes(value):
    if value is None:
        return None
    if not isinstance(value, str) or not value.startswith('data:image/jpeg;base64,'):
        raise ValueError('Invalid profile photo. Choose another image.')
    try:
        raw = base64.b64decode(value.split(',', 1)[1], validate=True)
    except Exception:
        raise ValueError('Invalid profile photo.')
    if len(raw) > 350000 or not raw.startswith(b'\xff\xd8\xff') or not raw.endswith(b'\xff\xd9'):
        raise ValueError('Photo is too large or invalid.')
    return raw

def public_profile(row):
    return {key: row[key] for key in ('id', 'display_name', 'rating_source', 'rating', 'updated')} | {'has_photo': row['photo'] is not None}

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PUBLIC), **kwargs)

    def end_headers(self):
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'same-origin')
        self.send_header('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob:; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'")
        super().end_headers()

    def reply(self, code, data, cookie=None):
        raw = json.dumps(data).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(raw)))
        self.send_header('Cache-Control', 'no-store')
        if cookie:
            self.send_header('Set-Cookie', cookie)
        self.end_headers()
        self.wfile.write(raw)

    def me(self, db):
        cookie = SimpleCookie()
        try:
            cookie.load(self.headers.get('Cookie', ''))
            token = cookie['club_profile'].value if 'club_profile' in cookie else ''
        except Exception:
            token = ''
        if not token:
            return None
        return db.execute('SELECT * FROM members WHERE token_hash=?', (hashlib.sha256(token.encode()).hexdigest(),)).fetchone()

    def list_directory(self, path):
        self.send_error(404)
        return None

    def do_GET(self):
        path = urlparse(self.path).path
        if path == '/api/members':
            with connect() as db:
                rows = db.execute('SELECT * FROM members WHERE listed=1 ORDER BY display_name COLLATE NOCASE').fetchall()
            return self.reply(200, {'members': [public_profile(row) for row in rows]})
        if path == '/api/me':
            with connect() as db:
                row = self.me(db)
            return self.reply(200, {'profile': (public_profile(row) | {'listed': bool(row['listed'])}) if row else None})
        if path.startswith('/api/photo/'):
            member_id = path.rsplit('/', 1)[-1]
            with connect() as db:
                row = db.execute('SELECT * FROM members WHERE id=?', (member_id,)).fetchone()
                me = self.me(db)
            if not row or row['photo'] is None or (not row['listed'] and (not me or me['id'] != row['id'])):
                return self.reply(404, {'error': 'Photo not found.'})
            self.send_response(200)
            self.send_header('Content-Type', 'image/jpeg')
            self.send_header('Content-Length', str(len(row['photo'])))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(row['photo'])
            return
        if path.startswith('/api/'):
            return self.reply(404, {'error': 'Page not found.'})
        # Only the public directory is served; never expose member data or code.
        return super().do_GET()

    def do_POST(self):
        path = urlparse(self.path).path
        if path not in {'/api/signup', '/api/profile'}:
            return self.reply(404, {'error': 'Page not found.'})
        origin = self.headers.get('Origin')
        if origin and origin not in {f'http://localhost:{PORT}', f'http://127.0.0.1:{PORT}'}:
            return self.reply(403, {'error': 'This request is not allowed.'})
        if self.headers.get('Content-Type', '').split(';')[0] != 'application/json':
            return self.reply(415, {'error': 'Please submit the signup form.'})
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 600000:
                raise ValueError('Form is too large.')
            data = json.loads(self.rfile.read(length))
            if not isinstance(data, dict):
                raise ValueError('Invalid form.')
            listed = data.get('listed')
            if not isinstance(listed, bool):
                raise ValueError('Choose whether to appear in the directory.')
            photo = photo_bytes(data.get('photo'))
            with connect() as db:
                if path == '/api/profile':
                    me = self.me(db)
                    if not me:
                        return self.reply(401, {'error': 'Open this page in the browser where you signed up.'})
                    display_name = text_field(data, 'display_name', 80, True)
                    remove = data.get('remove_photo', False)
                    if not isinstance(remove, bool) or (remove and photo is not None):
                        raise ValueError('Choose a new photo or remove the old one.')
                    if photo is None and not remove:
                        photo = me['photo']
                    db.execute('UPDATE members SET display_name=?, listed=?, photo=?, updated=? WHERE id=?', (display_name, int(listed), photo, time.time_ns(), me['id']))
                    return self.reply(200, {'ok': True})
                name = text_field(data, 'name', 80, True)
                display_name = text_field(data, 'display_name', 80) or name
                email = text_field(data, 'email', 254, True).lower()
                if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', email):
                    raise ValueError('Enter a valid email address.')
                source = data.get('rating_source')
                if source not in SOURCES:
                    raise ValueError('Choose a rating source.')
                rating = data.get('rating')
                if source == 'Unrated':
                    rating = None
                elif isinstance(rating, bool) or not isinstance(rating, int) or not 0 <= rating <= 4000:
                    raise ValueError('Enter a whole-number rating from 0 to 4000.')
                phone = text_field(data, 'phone', 40)
                school = text_field(data, 'school', 100)
                interest = text_field(data, 'interest', 100, True)
                if interest not in {'Casual games and learning', 'Quads and competition', 'Both'}:
                    raise ValueError('Choose your playing interest.')
                if self.me(db):
                    return self.reply(409, {'error': 'You already joined in this browser. Open Members to update your profile.'})
                token = secrets.token_urlsafe(32)
                member_id = secrets.token_hex(16)
                now = time.time_ns()
                db.execute('INSERT INTO members VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)', (member_id, name, display_name, email, phone, school, interest, source, rating, int(listed), photo, hashlib.sha256(token.encode()).hexdigest(), now, now))
                cookie = f'club_profile={token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000'
                return self.reply(201, {'ok': True}, cookie)
        except sqlite3.IntegrityError:
            return self.reply(409, {'error': 'This email is already registered. Use the browser where you signed up to edit the profile.'})
        except (ValueError, TypeError) as error:
            return self.reply(400, {'error': str(error)})
        except Exception:
            return self.reply(500, {'error': 'Unable to save right now. Please try again.'})

if __name__ == '__main__':
    initialize()
    print(f'La Pine Chess: http://localhost:{PORT}\nKeep this window open. Press Ctrl+C to stop.')
    ThreadingHTTPServer(('127.0.0.1', PORT), Handler).serve_forever()
