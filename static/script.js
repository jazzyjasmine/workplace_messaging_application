window.addEventListener("load", pageLoadClassify);
window.addEventListener("popstate", (newState) => {
    console.log("back!");
    pageLoadClassify(false).then(r => {
    })
});

async function pageLoadClassify(push_history = true) {
    try {
        let paths = window.location.pathname.split("/");
        // /channel/<int:channel_id>
        if (paths[1] === "channel" && Number.isInteger(Number(paths[2]))) {
            await preLoadChannelPage(push_history, paths[2])
        } else if (paths[1] === "create") {
            await loadCreateChannel(push_history);
        } else {
            await loadHomePage(push_history);
        }
    } catch (error) {
        console.log('Page load failed.', error);
    }
}


function loadAuth(push_history = true, channel_id = null) {
    document.querySelector(".create_channel").style.display = "none";
    document.querySelector(".auth").style.display = "block";
    document.querySelector(".clip").style.display = "none";
    document.querySelector(".channel_header").style.display = "none";

    let submit_auth_button = document.querySelector('#submit_auth');
    submit_auth_button.addEventListener('click', async function (push_history) {
        await auth(push_history, channel_id);
    });

    if (push_history) {
        history.pushState({"page": "auth"}, null, '/auth');
    }
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
                await loadCreateChannel(push_history);
            }
        } else {
            alert("Username already exists!");
        }

    } catch (error) {
        console.log('Log in or create account failed.', error);
    }
}

async function loadCreateChannel(push_history = true) {
    try {
        if (push_history) {
            history.pushState({"page": "create"}, null, '/create');
        }

        document.querySelector(".auth").style.display = "none";
        document.querySelector(".clip").style.display = "none";
        document.querySelector(".channel_header").style.display = "none";
        document.querySelector(".create_channel").style.display = "block";

        // create channel button
        let create_channel_button = document.querySelector("#create_channel");
        create_channel_button.addEventListener('click', async function (push_history) {
            let new_channel_name = document.querySelector("#channel_name").value;
            if (isEmpty(new_channel_name)) {
                // alert("Channel name can not be empty!");
                return false;
            }
            document.querySelector("#channel_name").value = "";
            await createChannel(push_history, new_channel_name);
        });

        // get all channels
        let fetchRedirectPage = {method: 'GET'}

        const response = await fetch('/api/createchannel', fetchRedirectPage);
        let response_data = await response.json();

        if (response_data["result"] === "empty") {
            return;
        }

        let channel_ids = response_data["channel_ids"].split(",");
        let channel_names = response_data["channel_names"].split(",");
        let container = document.querySelector("#existed_channel_rooms");
        container.style.display = "block";
        container.innerHTML = "Existed channels:<br>";
        for (let i = 0; i < channel_ids.length; i++) {
            let a = document.createElement('a');
            a.href = "http://127.0.0.1:5000/channel/" + channel_ids[i];
            a.innerHTML = channel_names[i];
            container.appendChild(a);
            container.appendChild(document.createElement('br'));
        }
    } catch (error) {
        console.log('Load create channel page failed.', error);
    }
}

async function createChannel(push_history, new_channel_name) {
    try {
        console.log("createChannel: " + new_channel_name);
        let fetchRedirectPage = {
            method: 'POST',
            headers: new Headers({
                'new_channel_name': new_channel_name
            })
        }

        let response = await fetch('/api/createchannel', fetchRedirectPage);
        let response_data = await response.json();

        if (response_data["result"] === "duplicate channel name") {
            alert("Channel name already exists!");
            return false;
        }
        await loadChannelPage(push_history, response_data['channel_id'])

    } catch (error) {
        console.log('Create channel failed.', error);
    }
}

async function loadHomePage(push_history = true) {
    try {
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
            loadAuth(push_history);
        } else {
            await loadCreateChannel(push_history);
        }

        if (push_history) {
            history.pushState({"page": "home"}, null, '/');
        }

    } catch (error) {
        console.log('Auth key verification failed.', error);
    }
}

function isEmpty(input_string) {
    // check if a string is empty
    return !input_string.trim().length;
}

async function preLoadChannelPage(push_history, channel_id) {
    let fetchRedirectPage = {
        method: 'POST',
        headers: new Headers({
            'channel_id': channel_id,
            'auth_key': getAuthKey(),
            'username': getUsername()
        })
    }

    let response = await fetch('/api/channel_preauthentication', fetchRedirectPage);
    let response_data = await response.json();
    let authentication_result = response_data["result"];

    if (authentication_result === "success") {
        await loadChannelPage(push_history, channel_id);
    } else if (authentication_result === "need auth") {
        loadAuth(push_history, channel_id);
    } else {
        await loadHomePage(push_history);
    }

}

async function loadChannelPage(push_history, channel_id) {
    try {
        console.log("loadChannelPage: " + channel_id);
        if (push_history) {
            let url = '/channel/' + channel_id;
            history.pushState({"page": "channel"}, null, url);
        }

        document.querySelector(".clip").style.display = "block";
        document.querySelector(".channel_header").style.display = "block";
        document.querySelector(".auth").style.display = "none";
        document.querySelector(".create_channel").style.display = "none";
        document.querySelector(".messages").innerHTML = "";

        let post_button = document.querySelector("#post");
        post_button.addEventListener('click', async function () {
            await postMessage();
        });

        console.log("finish loading channel page " + channel_id);

        await startMessagePolling();
    } catch (error) {
        console.log('Load channel page failed.', error);
    }
}


function getAuthKey() {
    return window.localStorage.getItem("zhicongma_auth_key");
}


function getUsername() {
    return window.localStorage.getItem("zhicongma_username");
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
        console.log(channel_id + "is posting message: " + curr_message);

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

        await fetch('/api/channel', fetchRedirectPage);

        // if (response_data["result"] === "invalid_account") {
        //     alert("invalid account!");
        //     return false;
        // }

    } catch (error) {
        console.log('Post Message Failed', error);
    }
}


function displayMessages(all_messages) {
    // display all messages on the web page
    let container = document.querySelector(".messages");
    container.innerHTML = "";
    for (let i = 0; i < all_messages.length; i++) {
        container.appendChild(buildOneMessage(all_messages[i]))
    }
}


function buildOneMessage(message) {
    // build one message tag
    let curr_message = document.createElement("message");
    let curr_author = document.createElement("author");
    let curr_content = document.createElement("content");
    let curr_reply_entrance = document.createElement('a');
    curr_author.innerHTML = message["username"];
    curr_content.innerHTML = message["message_content"];
    curr_reply_entrance.href = "http://127.0.0.1:5000/message/" + message["message_id"];
    curr_reply_entrance.innerHTML = "reply";
    curr_message.appendChild(curr_author);
    curr_message.appendChild(curr_content);
    curr_message.appendChild(curr_reply_entrance);
    return curr_message;
}


async function getMessages() {
    try {
        let paths = window.location.pathname.split("/");
        if (paths[1] !== "channel" || !Number.isInteger(Number(paths[2]))) {
            return;
        }
        let channel_id = paths[2];
        console.log("getMessage: " + channel_id);
        let fetchRedirectPage = {
            method: 'GET',
            headers: new Headers({
                'channel_id': channel_id
            })
        }

        let response = await fetch("/api/channel", fetchRedirectPage);
        let response_data = await response.json();

        // if no message, do nothing
        if (response_data["empty"] && response_data["empty"] === "yes") {
            return;
        }

        // otherwise, display all the messages
        displayMessages(response_data);

    } catch (error) {
        console.log('Get message request Failed', error);
    }
}

async function startMessagePolling() {
    // continuously get messages without blocking the user
    await getMessages();
    await delay(1500);
    await startMessagePolling();
}


async function delay(ms) {
  // return await for better async stack trace support in case of errors.
  return await new Promise(resolve => setTimeout(resolve, ms));
}
