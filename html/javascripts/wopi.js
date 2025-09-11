function post(msg) {
    window.document.querySelector("#collabora-online-viewer").contentWindow.postMessage(JSON.stringify(msg), '*');
}

function postReady() {
    post({
        MessageId: 'Host_PostmessageReady'
    });
}

function receiveMessage(event) {
    console.log('==== receiveMessage: ' + event.data);
    let msg = JSON.parse(event.data);
    if (!msg) {
        return;
    }
    if (msg.MessageId == 'App_LoadingStatus') {
        if (msg.Values) {
            if (msg.Values.Status == 'Document_Loaded') {
                post({'MessageId': 'Host_PostmessageReady'});
            }
        }
    } else if (msg.MessageId === "UI_InsertGraphic") {
        post({
            MessageId: "Action_InsertGraphic",
            Values: {
                url: current_graphics
            }
        });
    }

    console.log(msg.MessageId);
}


window.addEventListener("message", receiveMessage, false);
