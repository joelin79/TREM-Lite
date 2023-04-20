/* eslint-disable no-undef */
const Speech = require("speak-tts");
const WebSocket = require("ws");
const bytenode = require("bytenode");
const fetch = require("node-fetch");
const { ipcRenderer } = require("electron");
const region = JSON.parse(fs.readFileSync(path.resolve(app.getAppPath(), "./resource/data/region.json")).toString());
const lang = {};

const speecd_use = storage.getItem("speecd_use") ?? false;
const speech = new Speech.default();
(async () => {
	await speech.init();
	speech.setLanguage("zh-TW");
	speech.setVoice("Microsoft Zhiwei - Chinese (Traditional, Taiwan)");
	// speech.setLanguage("ja-JP");
	// speech.setVoice("Microsoft Sayaka - Japanese (Japan)");
	speech.setRate(1.8);
})();

let tw_lang_data = {};
let lang_data = {};

localStorage.lang = "zh-Hant";
localStorage.plugin = "off";

fs.readdirSync(path.join(app.getAppPath(), "./resource/lang/")).forEach((file, i, arr) => {
	try {
		lang[path.parse(file).name] = require(path.join(app.getAppPath(), `./resource/lang/${path.parse(file).name}`, file));
		if (localStorage.lang == path.parse(file).name) {
			tw_lang_data = JSON.parse(fs.readFileSync(path.resolve(app.getAppPath(), `./resource/lang/${path.parse(file).name}/${path.parse(file).name}.json`)).toString());
			try {
				lang_data = JSON.parse(fs.readFileSync(path.resolve(app.getAppPath(), `./resource/lang/${path.parse(file).name}/${path.parse(file).name}.json`)).toString());
			} catch (err) {
				console.log(err);
			}
			// dynamicLoadCss(path.parse(file).name);
		}
	} catch (err) {
		console.error(err);
	}
});

function get_lang_string(id) {
	return lang_data[id] ?? tw_lang_data[id] ?? "";
}

function dynamicLoadCss(url) {
	const currentWindow = BrowserWindow.getFocusedWindow();
	const head = document.getElementsByTagName("head")[0];
	const link = document.createElement("link");
	link.type = "text/css";
	link.rel = "stylesheet";
	if (!currentWindow?.title) {
		if (currentWindow.title == "TREM-Lite")
			link.href = `../resource/lang/${url}/css/main.css`;
		else if (currentWindow.title == "TREM-Lite Setting")
			link.href = `../resource/lang/${url}/css/setting.css`;
	} else
		link.href = `../resource/lang/${url}/css/main.css`;
	head.appendChild(link);
}

function dynamicLoadJs(url, callback) {
	const head = document.getElementsByTagName("footer")[0];
	const script = document.createElement("script");
	script.type = "text/javascript";
	script.src = `../resource/plugin/${url}.js`;
	if (typeof (callback) == "function")
		script.onload = script.onreadystatechange = function() {
			if (!this.readyState || this.readyState === "loaded" || this.readyState === "complete") {
				callback();
				script.onload = script.onreadystatechange = null;
			}
		};

	head.appendChild(script);
}