window.addEventListener("load", pageLoadClassify);
window.addEventListener("popstate", (newState) => {
    pageLoadClassify(false).then(r => {
    })
});

async function pageLoadClassify(push_history = true) {
    try {
        let paths = window.location.pathname.split("/");
        // /channel/<int:channel_id>
        if (paths[1] === "channel" && paths.length === 3 && Number.isInteger(Number(paths[2])) && Number(paths[2]) > 0) {
            const queryString = window.location.search;
            // let possible_magic_key = new URLSearchParams(queryString).get("magic_key");
            await preLoadChannelPage(push_history, paths[2])
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
        history.pushState({"page": "auth"}, null, 'auth');
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
        document.querySelector(".auth").style.display = "none";
        document.querySelector(".clip").style.display = "none";
        document.querySelector(".channel_header").style.display = "none";
        document.querySelector(".create_channel").style.display = "block";

        let create_channel_button = document.querySelector("#create_channel");
        create_channel_button.addEventListener('click', async function (push_history) {
            let new_channel_name = document.querySelector("#channel_name").value;
            document.querySelector("#channel_name").value = '';
            if (isEmpty(new_channel_name)) {
                alert("Channel name can not be empty!");
                return false;
            }
            await createChannel(push_history, new_channel_name);
        });

        let fetchRedirectPage = {
            method: 'GET',
            headers: new Headers({
                'Content-Type': 'application/json',
                'username': getUsername()
            })
        }

        const response = await fetch('/api/createchannel', fetchRedirectPage);
        let response_data = await response.json();

        if (response_data["result"] === "empty") {
            return;
        }

        let channel_ids = response_data["channel_ids"].split(",")
        let container = document.querySelector("#existed_channel_rooms");
        container.style.display = "block";
        container.innerHTML = "Existed channel rooms:<br>";
        for (let i = 0; i < channel_ids.length; i++) {
            let a = document.createElement('a');
            a.href = "http://127.0.0.1:5000/channel/" + channel_ids[i];
            a.innerHTML = "Channel " + channel_ids[i];
            container.appendChild(a);
            container.appendChild(document.createElement('br'));
        }

        if (push_history) {
            history.pushState({"page": "create"}, null, 'create');
        }
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
            'post_type': 'authentication',
            'channel_id': channel_id,
            'auth_key': getAuthKey(),
            'username': getUsername()
        })
    }

    let response = await fetch('/api/channel', fetchRedirectPage);
    let response_data = await response.json();
    let authentication = response_data["authentication"];

    if (authentication === "success") {
        await loadChannelPage(push_history, channel_id);
    } else if (authentication === "pending") {
        console.log("need to auth");
        loadAuth(push_history, channel_id);
    } else {
        await loadHomePage(push_history);
    }

}

async function loadChannelPage(push_history, channel_id) {
    try {
        if (push_history) {
            let url = '/channel/' + channel_id;
            history.pushState({"page": "channel"}, null, url);
        }

        document.querySelector(".clip").style.display = "block";
        document.querySelector(".channel_header").style.display = "block";
        document.querySelector(".auth").style.display = "none";
        document.querySelector(".create_channel").style.display = "none";
        // document.getElementById("invite_link").innerHTML = await getMagicLink(chat_id);

        let post_button = document.querySelector("#post");
        post_button.addEventListener('click', async function () {
            await postMessage(channel_id);
        });

        await startMessagePolling(channel_id);
    } catch (error) {
        console.log('Load channel page failed.', error);
    }
}


// async function getMagicLink(chat_id) {
//     try {
//         let fetchRedirectPage = {
//             method: 'POST',
//             headers: new Headers({
//                 'post_type': 'getMagicLink',
//                 'chat_id': chat_id
//             })
//         }
//
//         let response = await fetch('/api/chat', fetchRedirectPage);
//         let response_data = await response.json();
//         return response_data["magic_link"];
//     } catch (error) {
//         console.log('Get magic link failed.', error);
//     }
// }


function getAuthKey() {
    return window.localStorage.getItem("zhicongma_auth_key");
}


function getUsername() {
    return window.localStorage.getItem("zhicongma_username");
}


async function postMessage(channel_id) {
    try {
        // get message
        let curr_message = document.querySelector("#post_content").value;
        // set the input box blank
        document.querySelector("#post_content").value = "";

        // check if the input message is empty
        if (isEmpty(curr_message)) {
            alert("Message can not be empty!");
            return false;
        }

        // send new message and the related info to the server
        let fetchRedirectPage = {
            method: 'POST',
            headers: new Headers({
                'post_type': 'postMessage',
                'auth_key': getAuthKey(),
                'channel_id': channel_id,
                'username': getUsername(),
                'message_body': curr_message
            })
        }

        let response = await fetch('/api/channel', fetchRedirectPage);
        let response_data = await response.json();

        if (response_data["result"] === "invalid_account") {
            alert("invalid account!");
            return false;
        }

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
    curr_author.innerHTML = message["username"];
    curr_content.innerHTML = message["message_body"];
    curr_message.appendChild(curr_author);
    curr_message.appendChild(curr_content);
    return curr_message;
}


async function getMessages(channel_id) {
    try {
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

async function startMessagePolling(channel_id) {
    // continuously get messages without blocking the user
    await getMessages(channel_id);
    await startMessagePolling(channel_id);
}
