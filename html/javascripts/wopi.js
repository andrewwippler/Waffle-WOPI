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
    } else if (msg.MessageId === "File_Rename") {
        // Handle file rename event
        if (msg.Values && msg.Values.NewName) {
          console.log("File renamed to: " + msg.Values.NewName);
          window.location.href = encodeURIComponent(msg.Values.NewName);
        }
    } else if (msg.MessageId === "UI_SaveAs") {
      // Handle file rename even
      alert("Save As is supported by editing the filename title for the document.");
    }

    console.log(msg.MessageId);
}


window.addEventListener("message", receiveMessage, false);
