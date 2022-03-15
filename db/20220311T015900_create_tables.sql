-- sqlite3 belay.db -init 20220311T015900_create_tables.sql

CREATE TABLE IF NOT EXISTS user (
	username TEXT PRIMARY KEY,
	auth_key TEXT NOT NULL,
	password TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS channel (
    channel_id INTEGER PRIMARY KEY,
	channel_name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS message (
    message_id INTEGER PRIMARY KEY AUTOINCREMENT,
	message_content TEXT,
	channel_id INTEGER NOT NULL,
	username TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reply (
    reply_id INTEGER PRIMARY KEY AUTOINCREMENT,
	reply_content TEXT,
	message_id INTEGER NOT NULL,
	username TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_latest_message (
    username TEXT NOT NULL,
    channel_id INTEGER NOT NULL,
    latest_message_id INTEGER NOT NULL
);



