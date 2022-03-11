import uuid
import sqlite3
from collections import deque
from flask import Flask, request, jsonify, g

app = Flask(__name__)
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0


@app.route('/')
@app.route('/auth')
@app.route('/create')
@app.route('/channel/<int:channel_id>')
def index(channel_id=None):
    return app.send_static_file('index.html')


# -------------------------------- API ROUTES -----------------------------------------------
@app.route('/api/homepage', methods=['POST'])
def homepage():
    if request.method == 'POST':
        if not is_valid_account(request.headers['username'], request.headers['auth_key']):
            return jsonify({"verification": "fail"})
        else:
            return jsonify({"verification": "success"})


def is_valid_account(username, auth_key):
    g.db = connect_db()
    cur = g.db.execute('select user_name, auth_key from user where user_name = ?', [username])
    data = cur.fetchall()
    g.db.close()
    return data and auth_key == data[0][1]
    # return username in users and users[username][1] == auth_key


@app.route('/api/auth', methods=['POST'])
def auth():
    username = request.headers['username']
    password = request.headers['password']

    g.db = connect_db()
    cur = g.db.execute("select user_name, auth_key, password from user where user_name = ?", [username])
    data = cur.fetchall()
    cur.close()

    # log in succeeds
    # if username in users and users[username][0] == password:
    #     return jsonify({"result": "success",
    #                     "auth_key": users[username][1]})
    if data and data[0][2] == password:
        return jsonify({"result": "success",
                        "auth_key": data[0][1]})

    # create account henceforth
    # create account fails due to duplicate username
    # if username in users:
    #     return jsonify({"result": "username exists"})
    if data:
        return jsonify({"result": "username exists"})

    # create account succeeds
    # new_auth_key = uuid.uuid1().hex
    # users[username] = (password, new_auth_key)
    # return jsonify({"result": "success",
    #                 "auth_key": new_auth_key})
    new_auth_key = uuid.uuid1().hex
    insert_new_account = "insert into user (user_name, auth_key, password) values (?, ?, ?)"
    data_tuple = (username, new_auth_key, password)
    cur = g.db.execute(insert_new_account, data_tuple)
    g.db.commit()
    cur.close()
    return jsonify({"result": "success",
                    "auth_key": new_auth_key})


@app.route('/api/createchannel', methods=['POST'])
def create_channel():
    # if request.method == 'GET':
    #     channel_ids = get_channels_by_username(username)
    #     if not channel_ids:
    #         return jsonify({"result": "empty"})
    #     else:
    #         channel_ids_str = ",".join(channel_ids)
    #         return jsonify({"channel_ids": channel_ids_str})

    # if request.method == 'POST':
    new_channel_name = request.headers['new_channel_name']
    if not add_new_channel(new_channel_name):
        return jsonify({"result": "duplicate channel name"})
    return jsonify({"result": "success",
                    "channel_id": get_channel_id_by_name(new_channel_name)})

    # new_channel_id = len(chats) + 1  # chat_id starts from 1
    # chats[new_chat_id] = new_chat(username)
    # return jsonify({"channel_id": str(new_channel_id)})


def add_new_channel(channel_name):
    g.db = connect_db()
    cur = g.db.execute("select channel_name from channel")
    data1 = cur.fetchall()
    cur.close()
    curr_channel_names = [i[0] for i in data1]
    if channel_name in curr_channel_names:
        return False

    cur = g.db.execute("insert into channel (channel_id, channel_name) values (null, ?)", [channel_name])
    g.db.commit()
    cur.close()
    return True


def get_channel_id_by_name(channel_name):
    g.db = connect_db()
    cur = g.db.execute("select channel_id from channel where channel_name = ?", [channel_name])
    data = cur.fetchall()
    cur.close()
    return data[0][0]


def get_channels_by_username(username):
    chat_ids = []
    for chat_id in chats:
        if username in chats[chat_id]['authorized_users']:
            chat_ids.append(str(chat_id))
    return chat_ids


# def new_chat(username):
#     magic_key = ''.join(random.choices(string.ascii_lowercase + string.digits, k=40))
#
#     return dict([
#         ("authorized_users", {username}),
#         ("magic_key", magic_key),
#         ("messages", [])
#     ])


@app.route('/api/chat', methods=['GET', 'POST'])
def handle_request():
    if request.method == 'GET':
        chat_id = int(request.headers["chat_id"])
        if not chats[chat_id]["messages"]:
            return jsonify({"empty": "yes"})
        return jsonify(list(chats[chat_id]["messages"]))

    if request.method == 'POST':
        post_type = request.headers['post_type']
        if post_type == 'authentication':
            possible_chat_id = int(request.headers['chat_id'])
            possible_auth_key = request.headers['auth_key']
            possible_username = request.headers['username']
            possible_magic_key = request.headers['magic_key']
            return authenticate(possible_chat_id, possible_auth_key, possible_username, possible_magic_key)
        if post_type == 'getMagicLink':
            chat_id = int(request.headers['chat_id'])
            magic_key = chats[chat_id]['magic_key']
            magic_link = 'http://127.0.0.1:5000/chat/' + str(chat_id) + '?magic_key=' + magic_key
            return jsonify({"magic_link": magic_link})
        if post_type == 'postMessage':
            message_body = request.headers["message_body"]
            chat_id = int(request.headers['chat_id'])
            auth_key = request.headers['auth_key']
            username = request.headers['username']
            return post_new_message(chat_id, message_body, auth_key, username)


def post_new_message(chat_id, message_body, auth_key, username):
    if not is_valid_account(username, auth_key):
        return jsonify({'result': 'invalid_account'})

    message_dict = {"username": username, "message_body": message_body}
    if not chats[chat_id]["messages"]:
        chats[chat_id]["messages"] = deque([message_dict])
    elif len(chats[chat_id]["messages"]) + 1 <= 30:
        chats[chat_id]["messages"].append(message_dict)
    else:
        chats[chat_id]["message"].popleft()
        chats[chat_id]["message"].append(message_dict)

    return jsonify({'result': 'success'})


def authenticate(possible_chat_id, possible_auth_key, possible_username, possible_magic_key):
    # if chat id not valid, redirect to home page
    if possible_chat_id not in chats:
        return jsonify({"authentication": "fail"})

    has_valid_account = is_valid_account(possible_username, possible_auth_key)

    # chat id is valid henceforth
    if has_valid_account and possible_username in chats[possible_chat_id]["authorized_users"]:
        return jsonify({"authentication": "success"})

    has_valid_magic_key = is_valid_magic_key(possible_magic_key, possible_chat_id)

    if not has_valid_account and has_valid_magic_key:
        return jsonify({"authentication": "pending"})

    if has_valid_account and has_valid_magic_key:
        chats[possible_chat_id]["authorized_users"].add(possible_username)
        return jsonify({"authentication": "success"})

    return jsonify({"authentication": "fail"})


def is_valid_magic_key(possible_magic_key, valid_chat_id):
    return possible_magic_key == chats[valid_chat_id]["magic_key"]


def connect_db():
    return sqlite3.connect('./db/belay.db')
