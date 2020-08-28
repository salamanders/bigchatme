/*jshint esversion: 8 */
/*global console, blockUntilDOMReady, easyAuth, firebase, notify, waitForGlobal, getSmallUserCamera */

/*exported main */

const CLIENT_ID_GOOGLE = '955533863396-mdtdedhlovdl74trt385u6ne8ge7p1bu.apps.googleusercontent.com';

const fillInMyInfo = () => new Promise(resolve => {
    console.info(`registrationFlow`);
    const registerDialog = document.getElementById('register_dialog');
    registerDialog.querySelector('.close').addEventListener('click', () => {
        registerDialog.close();
        resolve({
            name: document.getElementById('first').value,
            grade: document.getElementById('grade').value
        });
    });
    registerDialog.showModal();
});

/**
 * Refreshes a person and moves it up the list.
 * @param {string} id identifier of the person
 * @param {string} name label of the box
 * @param {string} grade K-5
 * @returns {HTMLElement} person
 */
function bumpPerson(id, name, grade) {
    const textContent = `${name} (${grade})`;
    let pingElt = document.getElementById(id);
    if (pingElt === null) {
        pingElt = document.createElement("span");
        pingElt.id = id;
        pingElt.classList.add('ping');
        pingElt.appendChild(document.createTextNode(textContent));
        document.getElementById("pings").appendChild(pingElt);
    }
    pingElt.style.opacity = "1.0";
    return pingElt;
}

/** @type {?string} */
let myUserId = null;

async function main() {
    console.info('main() starting');
    await blockUntilDOMReady();

    const user = await easyAuth(CLIENT_ID_GOOGLE);
    myUserId = user.uid;
    console.log(`User finished registration with myUserId:${myUserId}`);

    const db = firebase.firestore();
    const studentCollection = db.collection("students");

    const myselfRef = studentCollection.doc(myUserId);
    const myselfDoc = await myselfRef.get();
    if (!myselfDoc.exists) {
        console.log("My first visit!");
        const newUser = await fillInMyInfo();
        newUser.ts = firebase.firestore.FieldValue.serverTimestamp();
        await myselfRef.set(newUser);
    } else {
        console.log("Returning visitor!  Updating my TS only.");
        await myselfRef.update({
            ts: firebase.firestore.FieldValue.serverTimestamp()
        });
    }

    let isFirstSnapshot = true;
    studentCollection.onSnapshot(snapshot => {
        console.info(`Got a snapshot, first=${isFirstSnapshot}`);
        snapshot.docChanges().forEach(change => {
            const data = change.doc.data();
            switch (change.type) {
                case "added":
                case "modified":
                    console.log(`Person ${change.type}: `, data);
                    bumpPerson(change.doc.id, data.name, data.grade);
                    if (!isFirstSnapshot) {
                        notify(`${data.name} (${data.grade}) wants to chat.`);
                    }
                    break;
                case "removed":
                    console.log("Removed person: ", data);
                    break;
                default:
                    console.error(`Unknown change.type: ${change.type}`, data);
            }
        });
        if (isFirstSnapshot) {
            document.getElementById(myUserId).classList.add('myPing');
        }
        isFirstSnapshot = false;
    });

    setInterval(() => {
        console.info(`Timer loop, checking.`);
        for (const pingElt of document.querySelectorAll(".ping")) {
            pingElt.style.opacity = `${parseFloat(pingElt.style.opacity) - 0.1}`;
        }
    }, 60 * 1000);

    console.log('Finished main().');
}

main().then(() => {
    console.log('Finished setup script.');
}).then(async () => {
    const captureVideoButton = document.getElementById('capture_button');
    const videoElement = document.getElementById('video_main');
    captureVideoButton.onclick = getSmallUserCamera;
    videoElement.srcObject = await waitForGlobal('stream');
    captureVideoButton.textContent = 'Hold to Talk';

}).catch(err => {
    console.warn(err);
});