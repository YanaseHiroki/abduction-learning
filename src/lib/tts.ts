/** Web Speech API wrapper. Zero tokens, works offline; voices depend on the OS. */
let voicesCache: SpeechSynthesisVoice[] = [];

function loadVoices() {
  if (typeof speechSynthesis === "undefined") return [];
  voicesCache = speechSynthesis.getVoices();
  return voicesCache;
}

if (typeof speechSynthesis !== "undefined") {
  loadVoices();
  speechSynthesis.addEventListener?.("voiceschanged", loadVoices);
}

export function hasVoiceFor(lang: string) {
  const voices = voicesCache.length ? voicesCache : loadVoices();
  const base = lang.split("-")[0].toLowerCase();
  return voices.some((v) => v.lang.toLowerCase().startsWith(base));
}

export function speak(text: string, lang: string, rate = 0.95) {
  if (typeof speechSynthesis === "undefined") return;
  const voices = voicesCache.length ? voicesCache : loadVoices();
  const base = lang.split("-")[0].toLowerCase();
  const voice =
    voices.find((v) => v.lang.toLowerCase() === lang.toLowerCase()) ??
    voices.find((v) => v.lang.toLowerCase().startsWith(base));
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = voice?.lang ?? lang;
  if (voice) u.voice = voice;
  u.rate = rate;
  speechSynthesis.speak(u);
}

export function stopSpeaking() {
  if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
}
