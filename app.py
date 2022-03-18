import uuid
import sqlite3
from flask import Flask, request, jsonify, g
import bcrypt
import configparser

app = Flask(__name__)
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0

config = configparser.ConfigParser()
config.read('secrets.cfg')
PEPPER = config['secrets']['PEPPER']


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
    cur = g.db.execute(
        'select username, auth_key from user where username = ?',
        [username]
    )
    data = cur.fetchall()
    g.db.close()
    return data and auth_key == data[0][1]


@app.route('/api/auth', methods=['POST'])
def auth():
    username = request.headers['username']
    password = (request.headers['password'] + PEPPER).encode(('utf-8'))

    g.db = connect_db()
    cur = g.db.execute(
        "select username, auth_key, password from user where username = ?",
        [username]
    )
    data = cur.fetchall()
    cur.close()

    if data and bcrypt.checkpw(password, data[0][2]):
        return jsonify({"result": "success",
                        "auth_key": data[0][1]})

    if data:
        return jsonify({"result": "username exists"})

    new_auth_key = uuid.uuid1().hex
    hashed = bcrypt.hashpw(password, bcrypt.gensalt())
    cur = g.db.execute(
        "insert into user (username, auth_key, password) values (?, ?, ?)",
        [username, new_auth_key, hashed]
    )
    g.db.commit()
    cur.close()
    return jsonify({"result": "success",
                    "auth_key": new_auth_key})


@app.route('/api/createchannel', methods=['GET', 'POST'])
def create_channel():
    if request.method == 'GET':
        channel_ids, channel_names, channel_message_counts = get_channels()
        if not channel_ids:
            return jsonify({"result": "empty"})

        channel_unread_message_counts = get_channel_unread_message_counts(channel_ids,
                                                                          channel_message_counts,
                                                                          request.headers["username"])

        return jsonify({"channel_ids": ",".join(channel_ids),
                        "channel_names": ",".join(channel_names),
                        "channel_unread_message_counts": ",".join(channel_unread_message_counts)})

    # if request.method == 'POST'
    new_channel_name = request.headers['new_channel_name']
    if not add_new_channel(new_channel_name):
        return jsonify({"result": "duplicate channel name"})
    return jsonify({"result": "success",
                    "channel_id": get_channel_id_by_name(new_channel_name)})


def get_channel_unread_message_counts(channel_ids, channel_message_counts, username):
    g.db = connect_db()
    cur = g.db.execute(
        "select channel_id, latest_message_id from user_latest_message where username = ?",
        [username]
    )
    data = cur.fetchall()
    cur.close()

    channel_unread_message_counts = [str(i) for i in channel_message_counts]

    if not data:
        return channel_unread_message_counts

    for channel_id, latest_message_id in data:
        read_message_count = get_read_message_count(channel_id, latest_message_id)
        channel_index = channel_ids.index(str(channel_id))
        channel_unread_message_counts[channel_index] = str(channel_message_counts[channel_index] - read_message_count)

    return channel_unread_message_counts


def get_read_message_count(channel_id, latest_message_id):
    g.db = connect_db()
    cur = g.db.execute(
        "select sum(case when message_id <= ? then 1 else 0 end) from message where channel_id = ?",
        [latest_message_id, channel_id]
    )
    data = cur.fetchall()
    cur.close()
    return int(data[0][0])


def add_new_channel(channel_name):
    g.db = connect_db()
    cur = g.db.execute("select channel_name from channel")
    data1 = cur.fetchall()
    cur.close()
    curr_channel_names = [i[0] for i in data1]
    if channel_name in curr_channel_names:
        return False

    cur = g.db.execute(
        "insert into channel (channel_id, channel_name) values (null, ?)",
        [channel_name]
    )
    g.db.commit()
    cur.close()
    return True


def get_channel_id_by_name(channel_name):
    g.db = connect_db()
    cur = g.db.execute(
        "select channel_id from channel where channel_name = ?",
        [channel_name]
    )
    data = cur.fetchall()
    cur.close()
    return data[0][0]


def get_channels():
    g.db = connect_db()
    cur = g.db.execute(
        "select channel.channel_id, channel.channel_name, count(message_id) from channel left join message on message.channel_id = channel.channel_id group by channel.channel_id"
    )
    data = cur.fetchall()
    cur.close()
    return [str(channel[0]) for channel in data], [channel[1] for channel in data], [int(channel[2]) for channel in
                                                                                     data]


@app.route('/api/channel/authentication', methods=['POST'])
def authenticate():
    username = request.headers["username"]
    auth_key = request.headers["auth_key"]
    channel_id = request.headers["channel_id"]

    channel_ids, _, _ = get_channels()

    if channel_id not in channel_ids:
        return jsonify({"result": "invalid channel id"})

    if is_valid_account(username, auth_key):
        return jsonify({"result": "success"})
    else:
        return jsonify({"result": "need auth"})


@app.route('/api/channel/message/post', methods=['POST'])
def handle_channel_request():
    message_content = request.headers["message_content"]
    channel_id = int(request.headers['channel_id'])
    username = request.headers['username']
    g.db = connect_db()
    cur = g.db.execute(
        "insert into message (message_id, message_content, channel_id, username) values (null, ?, ?, ?)",
        [message_content, channel_id, username]
    )
    g.db.commit()
    cur.close()
    return "success"


@app.route('/api/channel/message/get', methods=['POST'])
def get_messages_and_report_last():
    channel_id = request.headers["channel_id"]
    username = request.headers["username"]

    g.db = connect_db()
    cur = g.db.execute(
        "select message_id, message_content, username from message where channel_id = ? order by message_id",
        [channel_id]
    )
    data = cur.fetchall()
    cur.close()

    if not data:
        return jsonify({"empty": "yes"})

    messages_for_channel = []
    for this_message_id, this_message_content, this_username in data:
        message_info_dict = {"message_id": this_message_id,
                             "message_content": this_message_content,
                             "username": this_username}
        messages_for_channel.append(message_info_dict)

    curr_latest_message_id = data[-1][0]

    g.db = connect_db()
    cur_db_latest = g.db.execute(
        "select latest_message_id from user_latest_message where channel_id = ? and username = ?",
        [channel_id, username]
    )
    data_db_latest = cur_db_latest.fetchall()
    cur_db_latest.close()

    if not data_db_latest or int(curr_latest_message_id) != int(data_db_latest[0][0]):
        # print("Inserted", username, channel_id, curr_latest_message_id)
        g.db = connect_db()
        cur_insert = g.db.execute(
            "insert into user_latest_message (username, channel_id, latest_message_id) values (?, ?, ?)",
            [username, channel_id, curr_latest_message_id]
        )
        g.db.commit()
        cur_insert.close()

    return jsonify(messages_for_channel)


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
        [reply_content, message_id, username]
    )
    g.db.commit()
    cur.close()
    return "success"


def connect_db():
    return sqlite3.connect('./db/belay.db')
