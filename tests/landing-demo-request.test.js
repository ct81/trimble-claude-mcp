import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const page = readFileSync(new URL('../pages/landing/buildtheimpossible.html', import.meta.url), 'utf8');
const start = page.indexOf("$('f').onsubmit=async e=>{");
const end = page.indexOf('\n};\nshow(0', start);
assert.ok(start >= 0 && end > start);
const handler = page.slice(start, end + 3);

function avatarContext() {
  const elements = {
    avatarStatus: { dataset: {} }, avatarStatusText: { textContent: 'Ready' },
    mute: {}, intro: {}, songPlay: { hidden: true },
    mic: { classList: { add() {}, remove() {} } }
  };
  const utterances = [], timers = new Map();
  const context = vm.createContext({
    $: id => elements[id],
    cap: { textContent: '', style: {} },
    console: { error() {} },
    AbortController,
    setTimeout: callback => { const id = timers.size + 1; timers.set(id, callback); return id; },
    clearTimeout: id => timers.delete(id),
    SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } },
    QA: { entries: [] }, S: [],
    CHESTER_EMAIL_API: '/chester-email',
    window: { speechSynthesis: {
      cancel() {}, getVoices: () => [], speak: utterance => utterances.push(utterance)
    }, SpeechRecognition: class { start() { this.onstart(); } } }
  });
  context.speechSynthesis = context.window.speechSynthesis;
  const voiceStart = page.indexOf('// voice + avatar state');
  const voiceEnd = page.indexOf('// realistic avatar', voiceStart);
  vm.runInContext(page.slice(voiceStart, voiceEnd), context);
  const chatStart = page.indexOf('const STOP=');
  const chatEnd = page.indexOf("$('qaFile').onchange", chatStart);
  vm.runInContext(page.slice(chatStart, chatEnd), context);
  return { context, elements, utterances, timers };
}

test('avatar status follows speech, ignores canceled speech callbacks, and handles muted captions', async () => {
  const { context, elements, utterances, timers } = avatarContext();
  await vm.runInContext("say('First answer')", context);
  assert.equal(elements.avatarStatusText.textContent, 'Speaking...');
  assert.equal(elements.avatarStatus.dataset.active, 'true');
  await vm.runInContext("say('Second answer')", context);
  utterances[0].onend();
  assert.equal(elements.avatarStatusText.textContent, 'Speaking...');
  utterances[1].onend();
  assert.equal(elements.avatarStatusText.textContent, 'Ready');
  assert.equal(elements.avatarStatus.dataset.active, 'false');
  elements.mute.onclick();
  await vm.runInContext("say('Caption only')", context);
  assert.equal(elements.avatarStatusText.textContent, 'Showing response');
  [...timers.values()][0]();
  assert.equal(elements.avatarStatusText.textContent, 'Ready');
});

test('avatar status follows microphone events and is not reset by interrupted speech', async () => {
  const { context, elements, utterances } = avatarContext();
  await vm.runInContext("say('Answer')", context);
  elements.mic.onclick();
  assert.equal(elements.avatarStatusText.textContent, 'Listening...');
  utterances[0].onend();
  assert.equal(elements.avatarStatusText.textContent, 'Listening...');
  vm.runInContext("rec.onerror({error:'not-allowed'});rec.onend()", context);
  assert.equal(elements.avatarStatusText.textContent, 'Microphone blocked');
  assert.equal(elements.avatarStatus.dataset.active, 'false');
});

test('avatar status follows translation and email delivery, including failure feedback', async () => {
  const { context, elements, utterances } = avatarContext();
  let finishTranslation;
  context.tr = () => new Promise(resolve => { finishTranslation = resolve; });
  const translated = vm.runInContext("LI=2;say('Hello')", context);
  assert.equal(elements.avatarStatusText.textContent, 'Translating...');
  finishTranslation('Translated answer');
  await translated;
  assert.equal(elements.avatarStatusText.textContent, 'Speaking...');
  utterances[0].onend();

  context.QA = { entries: [{
    questions: ['send an email to chester'], action: 'sendChesterEmail', reply: 'Email sent.'
  }] };
  for (const success of [true, false]) {
    let finishRequest;
    context.fetch = () => new Promise(resolve => { finishRequest = resolve; });
    const request = vm.runInContext("LI=0;ask('send an email to Chester')", context);
    assert.equal(elements.avatarStatusText.textContent, 'Sending email...');
    finishRequest({ ok: success, json: async () => success ? { sent: true } : { error: 'Email failed' } });
    await request;
    assert.equal(elements.avatarStatusText.textContent, 'Speaking...');
    utterances.at(-1).onend();
    assert.equal(elements.avatarStatusText.textContent, success ? 'Ready' : 'Unable to send');
    assert.equal(elements.avatarStatus.dataset.active, 'false');
  }
});

test('landing page inline scripts parse', () => {
  for (const [, attributes, source] of page.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!/\bsrc=/.test(attributes) && !/type=["']application\/json/i.test(attributes)) {
      assert.doesNotThrow(() => new vm.Script(source));
    }
  }
});

test('birthday Q&A plays the uploaded MP3 with spoken lyrics and stops on interruption', async () => {
  const { context, elements, utterances, timers } = avatarContext();
  const sources = [], requests = [];
  const buffer = { duration: 24 };
  context.fetch = async (url, options) => {
    requests.push({ url, signal: options.signal });
    return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
  };
  context.window.AudioContext = class {
    state = 'running';
    currentTime = 0;
    destination = {};
    createGain() {
      return {
        gain: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} },
        connect() {}, disconnect() {}
      };
    }
    async decodeAudioData() { return buffer; }
    createBufferSource() {
      const source = {
        connect() {}, disconnect() {},
        start() { this.started = true; },
        stop() { this.stopped = true; }
      };
      sources.push(source);
      return source;
    }
  };
  context.QA = JSON.parse(readFileSync(new URL('../pages/landing/qa.json', import.meta.url), 'utf8'));
  await vm.runInContext("ask('sing me a song')", context);
  assert.equal(elements.avatarStatusText.textContent, 'Playing birthday song');
  const musicUrl = new URL(requests[0].url, new URL('../pages/landing/buildtheimpossible.html', import.meta.url));
  assert.ok(readFileSync(musicUrl).length > 0, 'Music URL resolves to the uploaded MP3');
  assert.equal(sources[0].buffer, buffer);
  assert.equal(sources[0].started, true);
  [...timers.values()][0]();
  assert.equal(utterances[0].text, 'Happy birthday to you.');
  utterances[0].onstart();
  assert.equal(vm.runInContext('speaking', context), true);
  elements.mute.onclick();
  assert.equal(sources[0].stopped, true);
  assert.equal(requests[0].signal.aborted, true);
  assert.equal(timers.size, 0);
  assert.equal(vm.runInContext('birthdaySong', context), null);
  assert.equal(elements.avatarStatusText.textContent, 'Ready');

  await vm.runInContext('playBirthdaySong()', context);
  assert.equal(sources.length, 1, 'Muted playback must not start music');
  elements.mute.onclick();
  await vm.runInContext('playBirthdaySong()', context);
  sources.at(-1).onended();
  assert.equal(vm.runInContext('birthdaySong', context), null);
  assert.equal(timers.size, 0);
  assert.equal(elements.avatarStatusText.textContent, 'Ready');
  await vm.runInContext('playBirthdaySong()', context);
  await vm.runInContext("say('Another answer')", context);
  assert.equal(vm.runInContext('birthdaySong', context), null);
  assert.equal(timers.size, 0);
  assert.equal(elements.avatarStatusText.textContent, 'Speaking...');
});

test('birthday playback reports a missing music file without leaving playback active', async () => {
  const { context, elements } = avatarContext();
  let disconnected = false;
  context.window.AudioContext = class {
    state = 'running';
    createGain() {
      return { gain: {}, connect() {}, disconnect() { disconnected = true; } };
    }
  };
  context.fetch = async () => ({ ok: false, status: 404 });
  await vm.runInContext('playBirthdaySong()', context);
  assert.match(context.cap.textContent, /HTTP 404/);
  assert.equal(elements.avatarStatusText.textContent, 'Playback unavailable');
  assert.equal(vm.runInContext('birthdaySong', context), null);
  assert.equal(disconnected, true);
});

test('birthday playback surfaces blocked audio with a user-gesture retry button', async () => {
  const { context, elements } = avatarContext();
  context.window.AudioContext = class {
    state = 'suspended';
    async resume() {}
  };
  await vm.runInContext('playBirthdaySong()', context);
  assert.equal(elements.avatarStatusText.textContent, 'Playback unavailable');
  assert.equal(elements.songPlay.hidden, false);
  assert.match(context.cap.textContent, /Tap Play birthday song/);
});

test('demo form submits to the server and reports success or delivery errors', async () => {
  for (const outcome of ['success', 'failure']) {
    const button = { disabled: false, textContent: 'Send request' };
    const status = {
      textContent: '',
      classes: new Set(),
      classList: {
        add(name) { status.classes.add(name); },
        remove(name) { status.classes.delete(name); }
      }
    };
    const form = { onsubmit: null };
    let submitted;
    const context = {
      DEMO_REQUEST_API: 'https://trimble-claude-mcp-g86i.onrender.com/api/login/demo-request',
      FormData: class {
        get(key) {
          return { name: 'Test User', email: 'user@example.com', sol: 'SitePulse', msg: 'Please contact me.' }[key];
        }
      },
      $: id => ({ f: form, sendRequest: button, formStatus: status })[id],
      fetch: async (url, options) => {
        assert.equal(url, context.DEMO_REQUEST_API);
        submitted = JSON.parse(options.body);
        return {
          ok: outcome === 'success',
          json: async () => outcome === 'success'
            ? { sent: true }
            : { error: 'Could not send your demo request. Please try again later.' }
        };
      }
    };
    vm.runInNewContext(handler, context);
    await form.onsubmit({ preventDefault() {} });
    assert.deepEqual(submitted, {
      name: 'Test User', email: 'user@example.com', solution: 'SitePulse', message: 'Please contact me.'
    });
    if (outcome === 'success') {
      assert.equal(button.disabled, true);
      assert.equal(button.textContent, 'Request sent');
      assert.equal(status.textContent, 'Your demo request has been sent.');
    } else {
      assert.equal(button.disabled, false);
      assert.equal(button.textContent, 'Send request');
      assert.match(status.textContent, /Could not send your demo request/);
      assert.equal(status.classes.has('error'), true);
    }
  }
});
