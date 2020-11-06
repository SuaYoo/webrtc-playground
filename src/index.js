import { TelnyxRTC } from '@telnyx/webrtc';

function telnyxRequest(path, data) {
  return fetch(`https://api.telnyx.com/v2/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.TELNYX_API_KEY}`,
    },
    body: JSON.stringify(data || {}),
  });
}

async function getCredentials() {
  const { data: telephonyCredentials } = await telnyxRequest(
    'telephony_credentials',
    {
      connection_id: process.env.TELNYX_SIP_CONNECTION_ID,
    }
  ).then((resp) => resp.json());

  const loginToken = await telnyxRequest(
    `telephony_credentials/${telephonyCredentials.id}/token`
  ).then((resp) => resp.text());

  return {
    sipUsername: telephonyCredentials.sip_username,
    loginToken,
  };
}

function initWebRTC(loginToken) {
  return new Promise((resolve, reject) => {
    const client = new TelnyxRTC({
      login_token: loginToken,
    });

    client.on('telnyx.socket.close', () => {
      console.log('socket closed');
      client.disconnect();
    });

    client.on('telnyx.socket.error', (error) => {
      console.log('telnyx.socket.error', error);
      client.disconnect();
    });

    client.on('telnyx.error', (e) => {
      console.log('error', e);

      reject();
    });

    client.on('telnyx.ready', resolve);

    client.connect();
  });
}

function makeMessageSubmitHandler(client, sipUsername) {
  return function handleMessageSubmit(e) {
    e.preventDefault();

    let toInput = document.querySelector('input[name="to"]');
    let messageInput = document.querySelector('input[name="message"]');
    const destinationNumber = `sip:${toInput.value}@sip.telnyx.com`;

    const call = client.newCall({
      // Note to self: Getting `"Invalid SIP URI calling preference D30` when
      // using "Receive SIP URI Calls" = Only from my connections
      destinationNumber,
      callerName: sipUsername, // required or will fail without reason
      audio: true, // Needed even for just messages
      video: false,
    });
  };
}

async function init() {
  let credentials = await getCredentials();

  let activeCall;
  let client = await initWebRTC(credentials.loginToken);

  client.on('telnyx.notification', (notification) => {
    if (notification.type === 'callUpdate') {
      activeCall = notification.call;

      console.log('activeCall:', activeCall);

      if (activeCall.state === 'ringing') {
        activeCall.answer();
      }
    } else {
      console.log('notification:', notification);
    }
  });

  document
    .getElementById('message_form')
    .addEventListener(
      'submit',
      makeMessageSubmitHandler(client, credentials.sipUsername)
    );

  document.getElementById('my_username').innerText = credentials.sipUsername;

  Array.from(document.querySelectorAll('#message_form input')).forEach((el) => {
    el.disabled = false;
  });

  window.addEventListener('beforeunload', (e) => {
    console.log('beforeunload');

    if (activeCall) {
      activeCall.hangup();
    }

    client.disconnect();
  });
}

init();
