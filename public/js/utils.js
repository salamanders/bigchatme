/*jshint esversion: 8 */
/*global document, console, firebase, firebaseui */

/*exported blockUntilDOMReady, easyAuth, notify, waitForGlobal, getSmallUserCamera */


const timeout = async ms => new Promise(res => setTimeout(res, ms));

async function waitForGlobal(/** @type {string} */ valueName) {
    console.time(`blockUntilWindow-${valueName}`);
    while (!window[valueName]) {
        await timeout(50);
    }
    console.timeEnd(`blockUntilWindow-${valueName}`);
    return window[valueName];
}

/** Block on document being fully ready, makes it safe to run scripts any time. */
async function blockUntilDOMReady() {
    console.time('blockUntilDOMReady');
    return new Promise(resolve => {
        if (document.readyState === 'complete') {
            console.timeEnd('blockUntilDOMReady');
            resolve();
            return;
        }
        const onReady = () => {
            document.removeEventListener('DOMContentLoaded', onReady, true);
            window.removeEventListener('load', onReady, true);
            console.timeEnd('blockUntilDOMReady');
            resolve();
        };
        document.addEventListener('DOMContentLoaded', onReady, true);
        window.addEventListener('load', onReady, true);
    });
}

// https://github.com/firebase/firebaseui-web
async function easyAuth(clientId) {
    return new Promise(resolve => {
        console.time('easyAuth');
        const user = firebase.auth().currentUser;
        if (user) {
            console.info('Authorized (existing):', user.displayName);
            console.timeEnd('easyAuth');
            resolve(user);
            return;
        }

        firebase.auth().onAuthStateChanged(user => {
            console.info('onAuthStateChanged');
            if (user) {
                console.info('Authorized (onAuthStateChanged):', user.displayName);
                console.timeEnd('easyAuth');
                resolve(user);
                return;
            }
            // noinspection SpellCheckingInspection
            const uiConfig = {
                signInSuccessUrl: '/',
                signInOptions: [
                    {
                        'provider': firebase.auth.GoogleAuthProvider.PROVIDER_ID,
                        'authMethod': 'https://accounts.google.com',
                        'clientId': clientId
                    }
                ]
            };
            const ui = new firebaseui.auth.AuthUI(firebase.auth());
            const authDiv = document.createElement('div');
            authDiv.id = 'firebaseui-auth-container';
            document.body.appendChild(authDiv);
            ui.start('#firebaseui-auth-container', uiConfig);
            console.info('Auth: no way to resolve from here, which is ok because likely going to get redirected.');
            console.timeEnd('easyAuth');
        });
    });
}


async function getSmallUserCamera() {
    /** @type {MediaStream} */
    const stream = await navigator.mediaDevices.getUserMedia({
        video: {
            facingMode: 'user',
            frameRate: {ideal: 5},
            width: {ideal: 320},
            height: {ideal: 180}
        },
        audio: {
            sampleRate: {ideal: 16000},
            sampleSize: {ideal: 8},
            channelCount: {ideal: 1}
        }
    });

    window.stream = stream; // make stream available to console
    stream.getTracks().forEach(track => {
        console.info(`Track: ${track.id} (${track.kind}): ${JSON.stringify(track.getSettings())}`);
    });
}

/**
 *
 * @param {string} message
 */
async function notify(message) {
    if (!("Notification" in window)) {
        console.error("This browser does not support desktop notifications.");
        return;
    }
    const displayNotification = () => {
        return new Notification(message);
    };

    switch (Notification.permission) {
        case "denied":
            console.warn(`Notifications previously denied!`);
            break;
        case "granted":
            return displayNotification();
        default:
            const newPermission = await Notification.requestPermission();
            if (newPermission === "granted") {
                return displayNotification();
            } else {
                console.warn(`Notifications freshly denied!`);
            }
    }
}