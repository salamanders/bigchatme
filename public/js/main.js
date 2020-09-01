/*jshint esversion: 8 */
/*global console, blockUntilDOMReady, easyAuth, firebase, notify, timeout */
/*global canvasToDoc, clickForStream */

/*exported main */

const CLIENT_ID_GOOGLE = '955533863396-mdtdedhlovdl74trt385u6ne8ge7p1bu.apps.googleusercontent.com';

/** @type {?string} */
let myUserId = null;
/** @type {?DocumentReference} */
let myselfRef = null;
/** @type {?firebase.storage.Reference} */
let clipsRef = null;
/** @type {?CollectionReference} */
let studentCollection = null;

/** @type {?HTMLElement} */
let captureVideoButton = null;
/** @type {?HTMLVideoElement} */
let videoElement = null;

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
 * @param {?firebase.firestore.Blob} image_fb_blob
 * @returns {HTMLElement} person
 */
function bumpPerson(id, name, grade, image_fb_blob) {
    const textContent = `${name} (${grade})`;
    let pingElt = document.getElementById(id);
    if (pingElt === null) {
        pingElt = document.createElement("span");
        pingElt.id = id;
        pingElt.classList.add('ping');
        pingElt.appendChild(document.createTextNode(textContent));
        const imageElt = new Image();
        imageElt.classList.add('thumbnail');
        pingElt.appendChild(imageElt);
        document.getElementById("pings").appendChild(pingElt);
    }

    if (image_fb_blob) {
        const uint8_array = image_fb_blob.toUint8Array();
        const blob = new Blob([uint8_array]);
        const blob_url = URL.createObjectURL(blob);
        const imageElt = pingElt.getElementsByClassName('thumbnail')[0];
        imageElt.src = blob_url;
        imageElt.onload = () => {
            URL.revokeObjectURL(blob_url);
        };
    }

    pingElt.style.opacity = "1.0";
    return pingElt;
}


/**
 * Initialize all firestore and storage references.
 * @return {Promise<void>}
 */
async function getReferences() {
    const user = await easyAuth(CLIENT_ID_GOOGLE);
    myUserId = user.uid;
    console.log(`User finished registration with myUserId:${myUserId}`);

    const db = firebase.firestore();
    const storage = firebase.storage();
    const storageRef = storage.ref();
    clipsRef = storageRef.child('clips');
    studentCollection = db.collection("students");
    myselfRef = studentCollection.doc(myUserId);

    captureVideoButton = document.getElementById('capture_button');
    videoElement = document.getElementById('video_main');
}

/**
 * Collect information (if necessary)
 * @return {Promise<void>}
 */
async function firstVisit() {
    const myselfDoc = await myselfRef.get();
    if (!myselfDoc.exists) {
        console.log("My first visit!");
        const newUser = await fillInMyInfo();
        await myselfRef.set(newUser);
    }
}

/**
 * Listen and react to server-side changes.
 */
function listenForPresence() {
    let isFirstSnapshot = true;
    studentCollection.onSnapshot(snapshot => {
        console.info(`Got a snapshot, first=${isFirstSnapshot}`);
        snapshot.docChanges().forEach(change => {
            const data = change.doc.data();
            switch (change.type) {
                case "added":
                case "modified":
                    console.log(`Person ${change.type}: `, data);
                    bumpPerson(change.doc.id, data.name, data.grade, data.image);
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

    // Fade everyone out over time.
    setInterval(() => {
        console.info(`Timer loop, checking.`);
        for (const pingElt of document.querySelectorAll(".ping")) {
            pingElt.style.opacity = `${parseFloat(pingElt.style.opacity) - 0.1}`;
        }
    }, 60 * 1000);
}

async function startCamera() {
    /** @type {MediaStream} */
    const stream = await clickForStream(captureVideoButton);
    window.stream = stream; // make stream available to console
    videoElement.srcObject = stream;
    videoElement.onloadedmetadata = (_) => {
        videoElement.play(); // Unsure what this does.
    };
    while (!videoElement.videoWidth) {
        console.info(`Awaiting videoElement to be ready.`);
        await timeout(250);
    }

    const canvas = document.createElement('canvas');
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;
    // document.body.appendChild(canvas);
    const context = canvas.getContext('2d');

    setInterval(async () => {
        console.debug(`taking picture (stream to canvas)`);
        context.drawImage(videoElement, 0, 0, videoElement.videoWidth, videoElement.videoHeight);
        await canvasToDoc(canvas, myselfRef);
    }, 2000);
}

function setupPushToTalk() {
    captureVideoButton.textContent = 'Hold to Talk';
    const mediaRecorder = new MediaRecorder(window.stream);
    const recordedChunks = [];
    let finalGather = false;
    captureVideoButton.onmousedown = () => {
        console.time('recording');
        console.info(`recorder: ${mediaRecorder.mimeType} ${mediaRecorder.state}`);

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                recordedChunks.push(event.data);
                console.info(`ondataavailable: ${event.data.size}`);
            } else {
                console.warn('Empty video data?');
            }
            if (finalGather) {
                finalGather = false;
                console.timeEnd('recording');
                const superBuffer = new Blob(recordedChunks);
                console.info(`final gather of recorded video: ${Math.round(superBuffer.size / 1024)}kb`);
                // TODO: Upload the video clip.
                recordedChunks.length = 0;
            }
        };
        mediaRecorder.start(3000); // ms per ondataavailable calls target
    };
    captureVideoButton.onmouseup = () => {
        mediaRecorder.stop();
        finalGather = true;
    };
}

async function main() {
    console.info('main() starting');
    await blockUntilDOMReady();
    await getReferences();
    await firstVisit();
    listenForPresence();
    await startCamera();
    setupPushToTalk();
}

main().then(() => {
    console.log('Finished setup script.');
}).catch(err => {
    console.warn(err);
});