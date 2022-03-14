import uuid
import sqlite3
from flask import Flask, request, jsonify, g

app = Flask(__name__)
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0


@app.route('/')
@app.route('/auth')
@app.route('/create')
@app.route('/channel/<int:channel_id>')
@app.route('/message/<int:message_id>')
def index(channel_id=None, message_id=None):
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
    cur = g.db.execute('select username, auth_key from user where username = ?', [username])
    data = cur.fetchall()
    g.db.close()
    return data and auth_key == data[0][1]


@app.route('/api/auth', methods=['POST'])
def auth():
    username = request.headers['username']
    password = request.headers['password']

    g.db = connect_db()
    cur = g.db.execute("select username, auth_key, password from user where username = ?", [username])
    data = cur.fetchall()
    cur.close()

    if data and data[0][2] == password:
        return jsonify({"result": "success",
                        "auth_key": data[0][1]})

    if data:
        return jsonify({"result": "username exists"})

    new_auth_key = uuid.uuid1().hex
    insert_new_account = "insert into user (username, auth_key, password) values (?, ?, ?)"
    data_tuple = (username, new_auth_key, password)
    cur = g.db.execute(insert_new_account, data_tuple)
    g.db.commit()
    cur.close()
    return jsonify({"result": "success",
                    "auth_key": new_auth_key})


@app.route('/api/createchannel', methods=['GET', 'POST'])
def create_channel():
    if request.method == 'GET':
        channel_ids, channel_names = get_channels()
        if not channel_ids:
            return jsonify({"result": "empty"})
        return jsonify({"channel_ids": ",".join(channel_ids),
                        "channel_names": ",".join(channel_names)})

    new_channel_name = request.headers['new_channel_name']
    if not add_new_channel(new_channel_name):
        return jsonify({"result": "duplicate channel name"})
    return jsonify({"result": "success",
                    "channel_id": get_channel_id_by_name(new_channel_name)})


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


def get_channels():
    g.db = connect_db()
    cur = g.db.execute("select * from channel")
    data = cur.fetchall()
    cur.close()
    return [str(channel[0]) for channel in data], [channel[1] for channel in data]


@app.route('/api/channel/authentication', methods=['POST'])
def authenticate():
    username = request.headers["username"]
    auth_key = request.headers["auth_key"]
    channel_id = request.headers["channel_id"]

    channel_ids, _ = get_channels()

    if channel_id not in channel_ids:
        return jsonify({"result": "invalid channel id"})

    if is_valid_account(username, auth_key):
        return jsonify({"result": "success"})
    else:
        return jsonify({"result": "need auth"})


@app.route('/api/channel/message', methods=['GET', 'POST'])
def handle_channel_request():
    if request.method == 'GET':
        channel_id = request.headers["channel_id"]
        g.db = connect_db()
        cur = g.db.execute(
            "select message_id, message_content, username from message where channel_id = ?",
            [channel_id]
        )
        data = cur.fetchall()
        cur.close()

        if not data:
            return jsonify({"empty": "yes"})

        messages_for_channel = []
        for message_id, message_content, username in data:
            message_info_dict = {"message_id": message_id,
                                 "message_content": message_content,
                                 "username": username}
            messages_for_channel.append(message_info_dict)

        return jsonify(messages_for_channel)

    # if request.method == 'POST'
    message_content = request.headers["message_content"]
    channel_id = int(request.headers['channel_id'])
    username = request.headers['username']
    g.db = connect_db()
    cur = g.db.execute(
        "insert into message (message_id, message_content, channel_id, username) values (null, ?, ?, ?)",
        [message_content, channel_id, username])
    g.db.commit()
    cur.close()
    return "success"


@app.route('/api/channel/reply', methods=['GET'])
def get_reply_count():
    channel_id = request.headers["channel_id"]
    g.db = connect_db()
    cur = g.db.execute(
        "select message.message_id, count(reply_id) from message left join reply on reply.message_id = message.message_id where channel_id = ? group by message.message_id",
        [channel_id]
    )
    data = cur.fetchall()
    cur.close()
    message_to_reply_counts = []
    for message_id, reply_count in data:
        message_to_reply_counts.append({"message_id": message_id,
                                        "reply_count": reply_count})
    return jsonify(message_to_reply_counts)


@app.route('/api/reply', methods=['GET', 'POST'])
def handle_reply_request():
    if request.method == 'GET':
        message_id = request.headers["message_id"]
        g.db = connect_db()
        cur_reply = g.db.execute(
            "select username, reply_content from reply where message_id = ? order by reply_id desc",
            [message_id]
        )
        data_reply = cur_reply.fetchall()
        cur_reply.close()

        cur_message = g.db.execute(
            "select message_content, username from message where message_id = ?",
            [message_id]
        )
        data_message = cur_message.fetchall()
        cur_message.close()

        message_content = data_message[0][0]
        message_username = data_message[0][1]
        if not data_reply:
            return jsonify({"empty": "yes",
                            "message_content": message_content,
                            "message_username": message_username})

        replies = []
        for reply_username, reply_content in data_reply:
            replies.append({"message_content": message_content,
                            "message_username": message_username,
                            "reply_content": reply_content,
                            "reply_username": reply_username})
        return jsonify(replies)

    # if request.method == 'POST'
    message_id = request.headers["message_id"]
    reply_content = request.headers["reply_content"]
    username = request.headers["username"]
    g.db = connect_db()
    cur = g.db.execute(
        "insert into reply (reply_id, reply_content, message_id, username) values (null, ?, ?, ?)",
        [reply_content, message_id, username])
    g.db.commit()
    cur.close()
    return "success"


def connect_db():
    return sqlite3.connect('./db/belay.db')
