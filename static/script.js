window.addEventListener("load", pageLoadClassify);
window.addEventListener("popstate", (newState) => {
    pageLoadClassify(false).then(r => {
    })
});

// Determine which page to load by url we user manually launches a page
async function pageLoadClassify(push_history = true) {
    try {
        let paths = window.location.pathname.split("/");

        if (paths[1] === "channel" && Number.isInteger(Number(paths[2]))) {
            // /channel/<int:channel_id>
            await preLoadChannelPage(push_history, paths[2])
        } else if (paths[1] === "create") {
            // /create
            await loadCreateChannelPage(push_history);
        }  else {
            await homepageClassify(push_history);
        }
    } catch (error) {
        console.log('Page load failed.', error);
    }
}

// ------------------------------------Page: /------------------------------------

// Check if valid user
// Either redirect to loadAuthPage (invalid user) or loadCreateChannelPage (valid user)
async function homepageClassify(push_history = true) {
    try {
        if (push_history) {
            history.pushState({"page": "home"}, null, '/');
        }

        let fetchRedirectPage = {
            method: 'POST',
            headers: new Headers({
                'username': getUsername(),
                'auth_key': getAuthKey()
            })
        }

        let response = await fetch('/api/homepage', fetchRedirectPage);
        let response_data = await response.json();
        let verification_result = response_data['verification'];

        if (verification_result === "fail") {
            loadAuthPage(push_history);
        } else {
            await loadCreateChannelPage(push_history);
        }

    } catch (error) {
        console.log('Auth key verification failed.', error);
    }
}

// ------------------------------------Page: /auth------------------------------------

// Load Auth page /auth, create account and become a valid user
// Redirect to either preLoadChannelPage or loadCreateChannelPage, depending on previous page
function loadAuthPage(push_history = true, channel_id = null) {
    if (push_history) {
        history.pushState({"page": "auth"}, null, '/auth');
    }

    document.querySelector(".create_channel").style.display = "none";
    document.querySelector(".auth").style.display = "block";
    document.querySelector(".channel_header").style.display = "none";
    document.querySelector(".reply").style.display = "none";
    document.querySelector(".comment_box").style.display = "none";

    let submit_auth_button = document.querySelector('#submit_auth');
    submit_auth_button.addEventListener('click', async function (push_history) {
        await auth(push_history, channel_id);
    });
}

async function auth(push_history, channel_id) {
    try {
        let username_box = document.querySelector("#username");
        let password_box = document.querySelector("#password");

        let username = username_box.value;
        let password = password_box.value;

        if (isEmpty(username)) {
            alert("Username can not be empty!");
            return false;
        }

        if (isEmpty(password)) {
            alert("Password can not be empty!");
            return false;
        }

        username_box.value = "";
        password_box.value = "";

        let fetchRedirectPage = {
            method: 'POST',
            headers: new Headers({
                'username': username,
                'password': password
            })
        }

        let response = await fetch('/api/auth', fetchRedirectPage);
        let response_data = await response.json();
        let result = response_data['result'];
        if (result === "success") {
            window.localStorage.setItem("zhicongma_auth_key", response_data['auth_key']);
            window.localStorage.setItem("zhicongma_username", username);

            if (channel_id) {
                await preLoadChannelPage(push_history, channel_id)
            } else {
                await loadCreateChannelPage(push_history);
            }
        } else {
            alert("Username already exists!");
        }

    } catch (error) {
        console.log('Log in or create account failed.', error);
    }
}

// ------------------------------------Page: /create------------------------------------

// Load create channel page
// Page functions: create channel, display existed channels with number of unread messages
// Redict to loadChannelPage by creating a channel or clicking an existed channel href
async function loadCreateChannelPage(push_history = true) {
    try {
        if (push_history) {
            history.pushState({"page": "create"}, null, '/create');
        }

        document.querySelector(".auth").style.display = "none";
        document.querySelector(".create_channel").style.display = "block";
        document.querySelector(".reply").style.display = "none";
        document.querySelector(".messages").style.display = "none";
        document.querySelector(".comment_box").style.display = "none";

        addCreateChannelButtonListener();

        // get all channels
        await createChannelPolling();

    } catch (error) {
        console.log('Load create channel page failed.', error);
    }
}

async function createChannel(push_history, new_channel_name) {
    try {
        let fetchRedirectPage = {
            method: 'POST',
            headers: new Headers({
                'new_channel_name': new_channel_name
            })
        }

        let response = await fetch('/api/createchannel', fetchRedirectPage);
        let response_data = await response.json();

        // check if channel name already exists (channel name must be unique)
        if (response_data["result"] === "duplicate channel name") {
            alert("Channel name already exists!");
            return false;
        }
        await loadChannelPage(push_history, response_data['channel_id'])

    } catch (error) {
        console.log('Create channel failed.', error);
    }
}

async function getChannelsInfo() {
    try {
        if (window.location.pathname.split("/")[1] !== "create" && window.location.pathname.split("/")[1] !== "channel") {
            return;
        }

        let fetchRedirectPage = {
            method: 'GET',
            headers: new Headers({
                'username': getUsername()
            })
        }

        let curr_channel_id = null;
        if (window.location.pathname.split("/")[1] === "channel") {
            curr_channel_id = window.location.pathname.split("/")[2];
        }

        const response = await fetch('/api/createchannel', fetchRedirectPage);
        let response_data = await response.json();

        if (response_data["result"] === "empty") {
            return;
        }

        let channel_ids = response_data["channel_ids"].split(",");
        let channel_names = response_data["channel_names"].split(",");
        let channel_unread_message_counts = response_data["channel_unread_message_counts"].split(",")

        let container = document.querySelector("#existed_channel_rooms");
        container.style.display = "block";
        container.innerHTML = "Existed channels";

        for (let i = 0; i < channel_ids.length; i++) {
            let channel_info_container = document.createElement('channelInfo');
            let channel_button = document.createElement('button');
            channel_button.id = "channel_button_" + channel_ids[i];
            channel_button.innerHTML = channel_names[i];
            channel_button.setAttribute("class", "existedChannelHrefs");

            if (channel_ids[i] === curr_channel_id) {
                channel_button.style.backgroundColor = "Deeppink";
            }

            channel_button.addEventListener('click', async () => {
                await loadChannelPage(true, channel_button.id.slice(15, channel_button.id.length));
            })

            channel_info_container.appendChild(channel_button);
            if (channel_unread_message_counts[i] !== "0" && channel_unread_message_counts[i] !== 0 && channel_ids[i] !== curr_channel_id) {
                let unreadCount = document.createElement('unreadCount');
                if (channel_unread_message_counts[i] === "1" || channel_unread_message_counts[i] === 1) {
                    unreadCount.innerHTML = channel_unread_message_counts[i] + " unread message"
                } else {
                    unreadCount.innerHTML = channel_unread_message_counts[i] + " unread messages"
                }
                channel_info_container.appendChild(unreadCount);
            }

            container.appendChild(channel_info_container);
            container.appendChild(document.createElement('br'));
        }
    } catch (error) {
        console.log('Get Channel Infos failed.', error);
    }
}

async function createChannelPolling() {
    // continuously get replies without blocking the user
    await getChannelsInfo();
    await delay(3000);
    await createChannelPolling();
}

// ------------------------------------Page: /channel/<int:channel_id>------------------------------------

// checks if valid user/valid channel id if attempts to manually log in a channel page
async function preLoadChannelPage(push_history, channel_id) {
    let fetchRedirectPage = {
        method: 'POST',
        headers: new Headers({
            'channel_id': channel_id,
            'auth_key': getAuthKey(),
            'username': getUsername()
        })
    }

    let response = await fetch('/api/channel/authentication', fetchRedirectPage);
    let response_data = await response.json();
    let authentication_result = response_data["result"];

    if (authentication_result === "success") {
        await loadChannelPage(push_history, channel_id);
    } else if (authentication_result === "need auth") {
        loadAuthPage(push_history, channel_id);
    } else {
        await homepageClassify(push_history);
    }

}

// Load channel page
async function loadChannelPage(push_history, channel_id) {
    try {
        if (push_history) {
            let url = '/channel/' + channel_id;
            history.pushState({"page": "channel"}, null, url);
        }

        document.querySelector(".clip").style.display = "block";
        document.querySelector(".channel_header").style.display = "block";
        document.querySelector(".comment_box").style.display = "block";
        document.querySelector(".auth").style.display = "none";
        document.querySelector(".create_channel").style.display = "block";
        document.querySelector(".messages").innerHTML = "";
        document.querySelector(".messages").style.display = "block";
        document.querySelector(".reply").style.display = "none";
        document.querySelector("#existed_channel_rooms").style.display = "block";

        let post_button = document.querySelector("#post");
        post_button.addEventListener('click', async function () {
            await postMessage();
        });

        addCreateChannelButtonListener();

        await channelPolling();

    } catch (error) {
        console.log('Load channel page failed.', error);
    }
}

async function postMessage() {
    try {
        let paths = window.location.pathname.split("/");
        if (paths[1] !== "channel" || !Number.isInteger(Number(paths[2]))) {
            return;
        }

        let channel_id = paths[2];

        // get message
        let curr_message = document.querySelector("#post_content").value

        // check if the input message is empty
        if (isEmpty(curr_message)) {
            // alert("Message can not be empty!");
            return false;
        }

        // set the input box blank
        document.querySelector("#post_content").value = "";

        // send new message and the related info to the server
        let fetchRedirectPage = {
            method: 'POST',
            headers: new Headers({
                'channel_id': channel_id,
                'username': getUsername(),
                'message_content': curr_message
            })
        }

        await fetch('/api/channel/message/post', fetchRedirectPage);

    } catch (error) {
        console.log('Post Message Failed', error);
    }
}

async function getMessages() {
    try {
        let paths = window.location.pathname.split("/");
        if (paths[1] !== "channel" || !Number.isInteger(Number(paths[2]))) {
            return;
        }
        let channel_id = paths[2];

        let fetchRedirectPage = {
            method: 'POST',
            headers: new Headers({
                'channel_id': channel_id,
                'username': getUsername()
            })
        }

        let response = await fetch("/api/channel/message/get", fetchRedirectPage);
        let response_data = await response.json();

        // if no message, do nothing
        if (response_data["empty"] && response_data["empty"] === "yes") {
            return;
        }

        // otherwise, display all the messages
        function buildOneMessage(message) {
            // build one message tag
            let curr_message = document.createElement("message");
            let curr_author = document.createElement("author");
            let curr_content = document.createElement("content");
            let curr_reply_entrance = document.createElement('button');

            curr_author.innerHTML = message["username"];

            curr_content.innerHTML = message["message_content"];

            curr_reply_entrance.id = "message_reply_" + message["message_id"];
            curr_reply_entrance.innerHTML = "reply";
            curr_reply_entrance.setAttribute("class", "replyHref");
            curr_reply_entrance.addEventListener('click', async () => {
                await loadReplyPage(true, curr_reply_entrance.id.slice(14, curr_reply_entrance.id.length));
            })

            let reply_count_holder = document.createElement("div");
            reply_count_holder.id = "reply_holder_" + message["message_id"];

            curr_message.appendChild(curr_author);
            curr_message.appendChild(curr_content);
            curr_message.appendChild(curr_reply_entrance);
            curr_message.appendChild(reply_count_holder);
            curr_message.id = "message_" + message["message_id"];

            let url_matches = message["message_content"].match(/(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig);
            if (url_matches) {
                let img_container = document.createElement("div");
                img_container.setAttribute("class","imgContainer");
                for (let single_url of url_matches) {
                    if (!isValidImageURL(single_url)) {
                        continue;
                    }
                    let curr_img = document.createElement("img");
                    curr_img.src = single_url;
                    img_container.appendChild(curr_img);
                }
                curr_message.appendChild(img_container);
            }

            return curr_message;
        }

        let container = document.querySelector(".messages");
        container.innerHTML = "";
        for (let i = 0; i < response_data.length; i++) {
            container.appendChild(buildOneMessage(response_data[i]))
        }

    } catch (error) {
        console.log('Get message request Failed', error);
    }
}

async function getReplyCount() {
    try {
        // get channel id from url
        let paths = window.location.pathname.split("/");
        if (paths[1] !== "channel" || !Number.isInteger(Number(paths[2]))) {
            return;
        }
        let channel_id = paths[2];

        // if no message, return
        if (document.querySelector(".messages").children.length === 0) {
            return;
        }

        let fetchRedirectPage = {
            method: 'GET',
            headers: new Headers({
                'channel_id': channel_id
            })
        }

        let response = await fetch("/api/channel/reply", fetchRedirectPage);
        let response_data = await response.json();

        for (let i = 0; i < response_data.length; i++) {
            if (response_data[i]["reply_count"] === "0" || response_data[i]["reply_count"] === 0) {
                continue;
            }
            let message_id = response_data[i]["message_id"];
            let reply_count = response_data[i]["reply_count"];

            let curr_reply_container = document.getElementById("reply_holder_" + message_id);
            curr_reply_container.innerHTML = "";

            let curr_reply_count = document.createElement("replyCount");
            curr_reply_count.id = "reply_count_" + message_id;
            if (reply_count === "1" || reply_count === 1) {
                curr_reply_count.innerHTML = reply_count + " reply";
            } else {
                curr_reply_count.innerHTML = reply_count + " replies";
            }

            curr_reply_container.appendChild(curr_reply_count);
        }

    } catch (error) {
        console.log('Get repy count request Failed', error);
    }
}

async function channelPolling() {
    // continuously get messages without blocking the user
    await getChannelsInfo();
    await getMessages();
    await getReplyCount();
    await delay(3000);
    await channelPolling();
}

// ------------------------------------Page: /message/<int:message_id>------------------------------------

// Load reply page
async function loadReplyPage(push_history = true, message_id) {
    if (push_history) {
        let url = '/message/' + message_id;
        history.pushState({"page": "message"}, null, url);
    }

    document.querySelector(".clip").style.display = "none";
    document.querySelector(".channel_header").style.display = "none";
    document.querySelector(".auth").style.display = "none";
    document.querySelector(".reply").style.display = "block";

    // click listener for posting reply
    let post_button = document.querySelector("#reply_submit");
    post_button.addEventListener('click', async function () {
        await postReply();
    });

    await replyPolling();

}

async function postReply() {
    try {
        let paths = window.location.pathname.split("/");
        if (paths[1] !== "message" || !Number.isInteger(Number(paths[2]))) {
            return;
        }

        let message_id = paths[2];

        // get reply content
        let curr_reply = document.querySelector("#reply_content").value

        // check if the input reply is empty
        if (isEmpty(curr_reply)) {
            return false;
        }

        // set the reply box blank
        document.querySelector("#reply_content").value = "";

        // send new message and the related info to the server
        let fetchRedirectPage = {
            method: 'POST',
            headers: new Headers({
                'message_id': message_id,
                'username': getUsername(),
                'reply_content': curr_reply
            })
        }

        await fetch('/api/reply', fetchRedirectPage);

    } catch (error) {
        console.log('Post Reply Failed', error);
    }
}

async function getReply() {
    try {
        let paths = window.location.pathname.split("/");
        if (paths[1] !== "message" || !Number.isInteger(Number(paths[2]))) {
            return;
        }

        let message_id = paths[2];

        let fetchRedirectPage = {
            method: 'GET',
            headers: new Headers({
                'message_id': message_id
            })
        }

        let response = await fetch("/api/reply", fetchRedirectPage);
        let response_data = await response.json();

        // display the message to be replied
        function displayMessageToBeReplied(message_username, message_content) {
            let curr_message_container = document.getElementById("currMessage");
            if (curr_message_container.children.length !== 0) {
                return;
            }
            let curr_message = document.createElement("message");
            let curr_message_author = document.createElement("author");
            let curr_message_content = document.createElement("content");
            curr_message_author.innerHTML = message_username;
            curr_message_content.innerHTML = message_content;
            curr_message.appendChild(curr_message_author);
            curr_message.appendChild(curr_message_content);
            curr_message_container.appendChild(curr_message);
        }

        // if no reply, do nothing
        if (response_data["empty"] && response_data["empty"] === "yes") {
            displayMessageToBeReplied(response_data["message_username"], response_data["message_content"]);
            return;
        }

        displayMessageToBeReplied(response_data[0]["message_username"], response_data[0]["message_content"]);

        // display replies
        let replies_container = document.querySelector(".replies");
        replies_container.innerHTML = '';
        for (let i = 0; i < response_data.length; i++) {
            let curr_reply = document.createElement("message");
            let curr_reply_author = document.createElement("author");
            let curr_reply_content = document.createElement("content");
            curr_reply_author.innerHTML = response_data[i]["reply_username"] + ": ";
            curr_reply_content.innerHTML = response_data[i]["reply_content"];
            curr_reply.appendChild(curr_reply_author);
            curr_reply.appendChild(curr_reply_content);
            replies_container.appendChild(curr_reply);
            replies_container.appendChild(document.createElement("br"));
        }

    } catch (error) {
        console.log('Get Reply Failed', error);
    }
}

async function replyPolling() {
    // continuously get replies without blocking the user
    await getReply();
    await delay(3000);
    await replyPolling();
}


// ------------------------------------Non page loading functions------------------------------------

function addCreateChannelButtonListener() {
    let create_channel_button = document.querySelector("#create_channel");
    create_channel_button.addEventListener('click', async function (push_history) {
        let new_channel_name = document.querySelector("#channel_name").value;
        if (isEmpty(new_channel_name)) {
            return false;
        }
        document.querySelector("#channel_name").value = "";
        await createChannel(push_history, new_channel_name);
    });
}

function isEmpty(input_string) {
    // check if a string is empty
    return !input_string.trim().length;
}

async function delay(ms) {
    // return await for better async stack trace support in case of errors.
    return await new Promise(resolve => setTimeout(resolve, ms));
}

function getAuthKey() {
    // get auth key from localStorage
    return window.localStorage.getItem("zhicongma_auth_key");
}

function getUsername() {
    // get username from localStorage
    return window.localStorage.getItem("zhicongma_username");
}

// reference of this function: https://thewebdev.info/2021/08/15/how-to-verify-that-an-url-is-an-image-url-with-javascript/
function isValidImageURL(url) {
  if (typeof url !== 'string') {
    return false;
  }
  return (url.match(/^http[^\?]*.(jpg|jpeg|gif|png|tiff|bmp)(\?(.*))?$/gmi) !== null);
}