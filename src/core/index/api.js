/* eslint-disable no-undef */
const win = BrowserWindow.fromId(process.env.window * 1);
const PostAddressIP = "https://exptech.com.tw/api/v1/trem/";

let report_data = {};
let report_now_id = 0;
let replay_stop_state = false;
let update = false;
let start = false;

const info_list = [];

let click_report_id = -1;

win.on("show", () => sleep(false));
win.on("hide", () => sleep(true));
win.on("minimize", () => sleep(true));
win.on("restore", () => sleep(false));

function int_to_intensity(int) {
	return intensity_list[int];
}

function intensity_float_to_int(float) {
	return (float < 0) ? 0 : (float < 4.5) ? Math.round(float) : (float < 5) ? 5 : (float < 5.5) ? 6 : (float < 6) ? 7 : (float < 6.5) ? 8 : 9;
}

function intensity_string_to_int(string) {
	return (string == "0") ? 0 : (string == "1") ? 1 : (string == "2") ? 2 : (string == "3") ? 3 : (string == "4") ? 4 : (string == "5-") ? 5 : (string == "5+") ? 6 : (string == "6-") ? 7 : (string == "6+") ? 8 : 9;
}

function check_update() {
	if (update) return;
	const controller = new AbortController();
	setTimeout(() => {
		controller.abort();
	}, 2500);
	fetch("https://api.github.com/repos/ExpTechTW/TREM-Lite/releases", { signal: controller.signal })
		.then((ans) => ans.json())
		.then((ans) => {
			if (ver_string_to_int(ans[0].tag_name) > ver_string_to_int(app.getVersion())) {
				ver_text.innerHTML = `➜ ${app.getVersion()}`;
				ver_text.style.cursor = "pointer";
				update = true;
				const notification = new Notification("🆙 新版本", {
					body : `發現新版本! 『${ans[0].tag_name}』`,
					icon : "../TREM.ico",
				});
				notification.onclick = () => {
					shell.openExternal("https://github.com/ExpTechTW/TREM-Lite/releases/latest");
				};
			}
		})
		.catch((err) => {
			log(err, 3, "api", "check_update");
		});
}

function fetch_eew() {
	const controller = new AbortController();
	setTimeout(() => {
		controller.abort();
	}, 2500);
	fetch("https://exptech.com.tw/api/v1/earthquake/eew", { signal: controller.signal })
		.then((ans) => ans.json())
		.then((ans) => {
			ans.timestamp = Now().getTime();
			get_data(ans, "http");
			if (!start) refresh_report_list(true);
		})
		.catch((err) => {
			log(err, 3, "api", "fetch_eew");
			setTimeout(() => fetch_eew(), 3000);
		});
}

async function fetch_trem_eq(id) {
	if (!id) return null;
	const controller = new AbortController();
	setTimeout(() => {
		controller.abort();
	}, 2500);
	return await new Promise((c) => {
		fetch(`https://exptech.com.tw/api/v1/file/trem_report/${id}.json`, { signal: controller.signal })
			.then((ans) => ans.json())
			.then((ans) => {
				c(ans);
			})
			.catch((err) => {
				log(err, 3, "api", "fetch_trem_eq");
				c(null);
			});
	});
}

async function fetch_report() {
	return await new Promise((c) => {
		const controller = new AbortController();
		setTimeout(() => {
			controller.abort();
		}, 2500);
		let _report_data = [];
		_report_data = storage.getItem("report_data");
		if (typeof _report_data != "object") _report_data = [];
		const list = {};
		for (let i = 0; i < _report_data.length; i++) {
			const md5 = crypto.createHash("md5");
			list[_report_data[i].identifier] = md5.update(JSON.stringify(_report_data[i])).digest("hex");
		}
		fetch("https://exptech.com.tw/api/v3/earthquake/reports", {
			method  : "post",
			headers : {
				"Accept"       : "application/json",
				"Content-Type" : "application/json",
			},
			body   : JSON.stringify({ list, key: (storage.getItem("show_reportInfo") ?? false) ? storage.getItem("key") ?? "" : "" }),
			signal : controller.signal })
			.then((ans) => ans.json())
			.then((ans) => {
				for (let i = 0; i < ans.length; i++) {
					const id = ans[i].identifier;
					for (let _i = 0; _i < _report_data.length; _i++)
						if (_report_data[_i].identifier == id) {
							_report_data.splice(_i, 1);
							break;
						}
				}
				for (let i = 0; i < ans.length; i++)
					_report_data.push(ans[i]);
				for (let i = 0; i < _report_data.length - 1; i++)
					for (let _i = 0; _i < _report_data.length - 1; _i++)
						if (new Date(_report_data[_i].originTime.replaceAll("/", "-")).getTime() < new Date(_report_data[_i + 1].originTime.replaceAll("/", "-")).getTime()) {
							const temp = _report_data[_i + 1];
							_report_data[_i + 1] = _report_data[_i];
							_report_data[_i] = temp;
						}
				storage.setItem("report_data", _report_data);
				report_data = _report_data;
				c(true);
			})
			.catch((err) => {
				log(err, 3, "api", "fetch_report");
				c(false);
			});
	});
}

async function refresh_report_list(_fetch = false, data = {}) {
	if (_fetch) {
		const ans = await fetch_report();
		if (!ans) {
			setTimeout(() => refresh_report_list(true), 3000);
			return;
		}
	}
	if (data.type == "report") {
		if (TREM.palert.time) {
			TREM.palert.time = 0;
			if (TREM.palert.geojson) {
				TREM.palert.geojson.remove();
				delete TREM.palert.geojson;
			}
		}
		report_data.unshift(data.raw);
		if (TREM.report_time != 0) {
			const epicenterIcon = L.icon({
				iconUrl  : "../resource/images/cross.png",
				iconSize : [30, 30],
			});
			const intensity = data.raw.data[0]?.areaIntensity ?? 0;
			const intensity_level = (intensity == 0) ? "--" : int_to_intensity(intensity);
			if (TREM.report_epicenterIcon) TREM.report_epicenterIcon.remove();
			TREM.report_epicenterIcon = L.marker([data.lat, data.lon],
				{ icon: epicenterIcon, zIndexOffset: 6000 }).addTo(TREM.Maps.main);
			TREM.report_bounds.extend([data.lat, data.lon]);
			if (!data.location.startsWith("地震資訊"))
				for (let _i = 0; _i < data.raw.data.length; _i++) {
					const station_data = data.raw.data[_i].eqStation;
					for (let i = 0; i < station_data.length; i++) {
						const station_Intensity = station_data[i].stationIntensity;
						const icon = L.divIcon({
							className : `dot intensity_${station_Intensity}`,
							html      : `<span>${int_to_intensity(station_Intensity)}</span>`,
							iconSize  : [30, 30],
						});
						TREM.report_icon_list[station_data[i].stationName] = L.marker([station_data[i].stationLat, station_data[i].stationLon], { icon: icon, zIndexOffset: station_Intensity * 10 })
							.bindTooltip(`<div class='report_station_box'><div>站名: ${data.raw.data[_i].areaName} ${station_data[i].stationName}</div><div>位置: ${station_data[i].stationLat} °N  ${station_data[i].stationLon} °E</div><div>距離: ${station_data[i].distance} km</div><div>震度: ${int_to_intensity(station_Intensity)}</div></div>`, { opacity: 1 })
							.addTo(TREM.Maps.main);
						TREM.report_bounds.extend([station_data[i].stationLat, station_data[i].stationLon]);
					}
				}
			Zoom = true;
			TREM.Maps.main.setView(TREM.report_bounds.getCenter(), TREM.Maps.main.getBoundsZoom(TREM.report_bounds) - 0.5);
			show_icon(3, intensity);
			document.getElementById("report_title_text").innerHTML = `${get_lang_string("report.title").replace("${type}", (data.location.startsWith("地震資訊")) ? get_lang_string("report.title.Local") : ((data.raw.earthquakeNo % 1000) ? data.raw.earthquakeNo : get_lang_string("report.title.Small")))}`;
			document.getElementById("report_max_intensity").innerHTML = (data.location.startsWith("地震資訊")) ? "最大震度" : `${data.raw.data[0].areaName} ${data.raw.data[0].eqStation[0].stationName}`;
			const eew_intensity = document.getElementById("report_intensity");
			eew_intensity.className = `intensity_${intensity} intensity_center`;
			eew_intensity.innerHTML = intensity_level;
			const report_location = document.getElementById("report_location");
			const loc = data.location.substring(data.location.indexOf("(") + 1, data.location.indexOf(")")).replace("位於", "");
			report_location.style.fontSize = (loc.length > 10) ? "16px" : (loc.length > 7) ? "20px" : "24px";
			report_location.innerHTML = loc;
			document.getElementById("report_time").innerHTML = get_lang_string("eew.time").replace("${time}", data.raw.originTime);
			let report_scale = data.scale.toString();
			if (report_scale.length == 1) report_scale = report_scale + ".0";
			document.getElementById("report_scale").innerHTML = `M ${report_scale}`;
			document.getElementById("report_args").innerHTML = `${get_lang_string("word.depth")}:&nbsp;<b>${data.depth}</b>&nbsp;km`;
			info_box_change();
		}
	}
	const report_list = document.getElementById("report_list");
	report_list.innerHTML = "";
	report_list.scrollTop = 0;
	const IsPalert = (data.type == "palert") ? true : false;
	for (let i = (IsPalert) ? -1 : 0; i < report_data.length; i++) {
		const report = document.createElement("div");
		report.className = "report";
		report.id = i;
		if (i == -1) {
			const now = new Date(data.time);
			const _Now = now.getFullYear()
				+ "/" + (now.getMonth() + 1 < 10 ? "0" : "") + (now.getMonth() + 1)
				+ "/" + (now.getDate() < 10 ? "0" : "") + now.getDate()
				+ " " + (now.getHours() < 10 ? "0" : "") + now.getHours()
				+ ":" + (now.getMinutes() < 10 ? "0" : "") + now.getMinutes()
				+ ":" + (now.getSeconds() < 10 ? "0" : "") + now.getSeconds();
			const report_text_intensity = document.createElement("div");
			report_text_intensity.className = `report_text report_intensity intensity_${data.intensity[0].intensity}`;
			report_text_intensity.style = `font-size: ${(data.intensity[0].intensity > 4 && data.intensity[0].intensity != 7) ? "50" : "60"}px;`;
			report_text_intensity.innerHTML = `${int_to_intensity(data.intensity[0].intensity)}`;
			const report_text_box = document.createElement("div");
			report_text_box.className = "report_text_box";
			const report_text = document.createElement("div");
			report_text.className = "report_text";
			report_text.style = "font-size: 22px;";
			report_text.innerHTML = "<b>震源 調查中</b>";
			const report_text_time = document.createElement("div");
			report_text_time.className = "report_text";
			report_text_time.style = "font-size: 15px;";
			report_text_time.innerHTML = `${_Now}`;
			report_text_box.append(report_text, report_text_time);
			report.append(report_text_intensity, report_text_box);
		} else {
			const originTime = new Date((new Date(`${report_data[i].originTime} GMT+08:00`)).toLocaleString("en-US", { timeZone: "Asia/Taipei" }));
			const intensity = report_data[i].data[0]?.areaIntensity ?? 0;
			const time = report_data[i].originTime.substring(0, 16);
			const cwb_code = "EQ"
				+ report_data[i].earthquakeNo
				+ "-"
				+ (originTime.getMonth() + 1 < 10 ? "0" : "") + (originTime.getMonth() + 1)
				+ (originTime.getDate() < 10 ? "0" : "") + originTime.getDate()
				+ "-"
				+ (originTime.getHours() < 10 ? "0" : "") + originTime.getHours()
				+ (originTime.getMinutes() < 10 ? "0" : "") + originTime.getMinutes()
				+ (originTime.getSeconds() < 10 ? "0" : "") + originTime.getSeconds();
			let loc = report_data[i].location;
			loc = loc.substring(loc.indexOf("(") + 3, loc.indexOf(")"));
			const resize = (intensity > 4 && intensity != 7) ? true : false;
			const intensity_level = (intensity == 0) ? "--" : int_to_intensity(intensity);
			if (i == 0 && !IsPalert) {
				const report_info = document.createElement("div");
				report_info.className = "report_item";
				report_info.id = `${originTime.getTime()}_info`;
				const report_text = document.createElement("div");
				report_text.className = `report_text report_intensity intensity_${intensity}`;
				report_text.style = `font-size: ${(resize) ? "50" : "60"}px;`;
				report_text.innerHTML = `${intensity_level}`;
				const report_text_box = document.createElement("div");
				report_text_box.className = "report_text_box";
				const report_text_loc = document.createElement("div");
				report_text_loc.className = "report_text";
				report_text_loc.style = (loc.length > 12) ? "font-size: 14px;" : (loc.length > 7) ? "font-size: 16px;" : "font-size: 22px;";
				report_text_loc.innerHTML = `<b>${loc}</b>`;
				const report_text_time = document.createElement("div");
				report_text_time.className = "report_text";
				report_text_time.style = "font-size: 15px;";
				report_text_time.innerHTML = `${time}`;
				const report_text_magnitudeValue_depth = document.createElement("div");
				report_text_magnitudeValue_depth.style = "display: flex;";
				const report_text_magnitudeValue = document.createElement("div");
				report_text_magnitudeValue.className = "report_text";
				report_text_magnitudeValue.style.color = (report_data[i].earthquakeNo.toString().includes("000")) ? "white" : "goldenrod";
				report_text_magnitudeValue.innerHTML = `<b>M&nbsp;${report_data[i].magnitudeValue.toFixed(1)}</b>`;
				const report_text_depth = document.createElement("div");
				report_text_depth.className = "report_text report_scale";
				report_text_depth.style = "width: 100%;text-align: right;";
				report_text_depth.innerHTML = `${get_lang_string("word.depth")}:&nbsp;<b>${report_data[i].depth}</b>&nbsp;km`;
				report_text_magnitudeValue_depth.append(report_text_magnitudeValue, report_text_depth);
				report_text_box.append(report_text_loc, report_text_time, report_text_magnitudeValue_depth);
				report_info.append(report_text, report_text_box);
				const report_click_box = document.createElement("div");
				report_click_box.className = "report_click hide";
				report_click_box.id = `${originTime.getTime()}_click_box`;
				const report_click_report = document.createElement("i");
				report_click_report.className = "report_click_text fa fa-circle-info fa-2x";
				report_click_report.id = `${originTime.getTime()}_click_report`;
				report_click_report.onclick = () => {
					report_report(i);
				};
				const report_click_replay = document.createElement("i");
				report_click_replay.className = "report_click_text fa-regular fa-circle-play fa-2x";
				report_click_replay.id = `${originTime.getTime()}_click_replay`;
				report_click_replay.onclick = () => {
					if (!WS) return;
					if (rts_replay_timestamp) {
						replay_stop();
						report.className = "report";
						report.style.border = "";
						report_click_replay.className = "report_click_text fa-regular fa-circle-play fa-2x";
						if (report_now_id == originTime.getTime()) return;
					}
					report.className = "report replay";
					report_click_replay.className = "report_click_text fa-regular fa-square fa-2x";
					report_now_id = originTime.getTime();
					rts_replay_timestamp = originTime.getTime();
					rts_replay_time = originTime.getTime();
					let list = [];
					if (report_data[i].ID.length != 0) list = list.concat(report_data[i].ID);
					if (report_data[i].trem.length != 0) list = list.concat(report_data[i].trem);
					replay_run(list);
					if (storage.getItem("report_eew")) get_data({
						"originTime" : originTime.getTime(),
						"type"       : "eew-report",
						"time"       : Now().getTime(),
						"lon"        : report_data[i].epicenterLon,
						"lat"        : report_data[i].epicenterLat,
						"depth"      : Math.round(report_data[i].depth),
						"scale"      : Number(report_data[i].magnitudeValue.toFixed(1)),
						"timestamp"  : Now().getTime(),
						"number"     : 1,
						"id"         : report_data[i].ID + "R",
						"location"   : loc,
						"cancel"     : false,
					});
				};
				const report_click_web = document.createElement("i");
				report_click_web.className = "report_click_text fa fa-globe fa-2x";
				report_click_web.id = `${originTime.getTime()}_click_web`;
				if (report_data[i].trem.length || !report_data[i].location.startsWith("地震資訊"))
					report_click_web.onclick = () => {
						shell.openExternal((report_data[i].trem.length) ? `https://exptech.com.tw/api/v1/file/trem-info.html?id=${report_data[i].trem[0]}` : `https://www.cwb.gov.tw/V8/C/E/EQ/${cwb_code}.html`);
					};
				else report_click_web.style = "color: red;";
				report_click_box.append(report_click_report, report_click_replay, report_click_web);
				report.append(report_info, report_click_box);
			} else {
				const report_info = document.createElement("div");
				report_info.className = "report_item";
				report_info.id = `${originTime.getTime()}_info`;
				const report_text = document.createElement("div");
				report_text.className = `report_text report_intensity intensity_${intensity}`;
				report_text.style = `font-size: ${(resize) ? "35" : "40"}px;max-width: 55px;`;
				report_text.innerHTML = `${intensity_level}`;
				const report_text_box = document.createElement("div");
				report_text_box.className = "report_text_box";
				const report_text_loc = document.createElement("div");
				report_text_loc.className = "report_text";
				report_text_loc.style = (loc.length > 12) ? "font-size: 12px;" : (loc.length > 7) ? "font-size: 14px;" : "";
				report_text_loc.innerHTML = `<b>${loc}</b>`;
				const report_text_time = document.createElement("div");
				report_text_time.className = "report_text";
				report_text_time.style = "font-size: 15px;";
				report_text_time.innerHTML = `${time}`;
				const report_text_magnitudeValue = document.createElement("div");
				report_text_magnitudeValue.className = "report_text report_scale";
				report_text_magnitudeValue.style.color = (report_data[i].earthquakeNo.toString().includes("000")) ? "white" : "goldenrod";
				report_text_magnitudeValue.innerHTML = `<b>M&nbsp;${report_data[i].magnitudeValue.toFixed(1)}</b>`;
				report_text_box.append(report_text_loc, report_text_time);
				report_info.append(report_text, report_text_box, report_text_magnitudeValue);
				const report_click_box = document.createElement("div");
				report_click_box.className = "report_click hide";
				report_click_box.id = `${originTime.getTime()}_click_box`;
				const report_click_report = document.createElement("i");
				report_click_report.className = "report_click_text fa fa-circle-info fa-2x";
				report_click_report.id = `${originTime.getTime()}_click_report`;
				report_click_report.onclick = () => {
					report_report(i);
				};
				const report_click_replay = document.createElement("i");
				report_click_replay.className = "report_click_text fa-regular fa-circle-play fa-2x";
				report_click_replay.id = `${originTime.getTime()}_click_replay`;
				report_click_replay.onclick = () => {
					if (!WS) return;
					if (rts_replay_timestamp) {
						replay_stop();
						report.className = "report";
						report.style.border = "";
						report_click_replay.className = "report_click_text fa-regular fa-circle-play fa-2x";
						if (report_now_id == originTime.getTime()) return;
					}
					report.className = "report replay";
					report_click_replay.className = "report_click_text fa-regular fa-square fa-2x";
					report_now_id = originTime.getTime();
					rts_replay_timestamp = originTime.getTime();
					rts_replay_time = originTime.getTime();
					let list = [];
					if (report_data[i].ID.length != 0) list = list.concat(report_data[i].ID);
					if (report_data[i].trem.length != 0) list = list.concat(report_data[i].trem);
					replay_run(list);
					if (storage.getItem("report_eew")) get_data({
						"originTime" : originTime.getTime(),
						"type"       : "eew-report",
						"time"       : Now().getTime(),
						"lon"        : report_data[i].epicenterLon,
						"lat"        : report_data[i].epicenterLat,
						"depth"      : Math.round(report_data[i].depth),
						"scale"      : Number(report_data[i].magnitudeValue.toFixed(1)),
						"timestamp"  : Now().getTime(),
						"number"     : 1,
						"id"         : report_data[i].ID + "R",
						"location"   : loc,
						"cancel"     : false,
					});
				};
				const report_click_web = document.createElement("i");
				report_click_web.className = "report_click_text fa fa-globe fa-2x";
				report_click_web.id = `${originTime.getTime()}_click_web`;
				if (report_data[i].trem.length || !report_data[i].location.startsWith("地震資訊"))
					report_click_web.onclick = () => {
						shell.openExternal((report_data[i].trem.length) ? `https://exptech.com.tw/api/v1/file/trem-info.html?id=${report_data[i].trem[0]}` : `https://www.cwb.gov.tw/V8/C/E/EQ/${cwb_code}.html`);
					};
				else report_click_web.style = "color: red;";
				report_click_box.append(report_click_report, report_click_replay, report_click_web);
				report.append(report_info, report_click_box);
			}
			if (!start) {
				start = true;
				if (!Object.keys(TREM.EQ_list).length) report_report(i);
			}
			report.onmouseenter = () => {
				document.getElementById(`${originTime.getTime()}_click_box`).style.height = document.getElementById(`${originTime.getTime()}_info`).offsetHeight;
				document.getElementById(`${originTime.getTime()}_info`).className = "hide";
				document.getElementById(`${originTime.getTime()}_click_box`).className = "report_click";
			};
			report.onmouseleave = () => {
				document.getElementById(`${originTime.getTime()}_info`).className = "report_item";
				document.getElementById(`${originTime.getTime()}_click_box`).className = "report_click hide";
			};
			report.style.boxSizing = "border-box";
		}
		report_list.appendChild(report);
	}
}

function replay_stop() {
	for (const item of document.getElementsByClassName("report_click_text fa-regular fa-circle-play fa-2x"))
		item.style.display = "";
	eew_replay_stop();
	rts_replay_time = 0;
	alert_timestamp = 0;
	rts_replay_timestamp = 0;
	for (let i = 0; i < Object.keys(TREM.EQ_list).length; i++) {
		const key = Object.keys(TREM.EQ_list)[i];
		if (TREM.EQ_list[key].epicenterIcon) TREM.EQ_list[key].epicenterIcon.remove();
		if (TREM.EQ_list[key].p_wave) TREM.EQ_list[key].p_wave.remove();
		if (TREM.EQ_list[key].s_wave) TREM.EQ_list[key].s_wave.remove();
		if (TREM.EQ_list[key].progress) TREM.EQ_list[key].progress.remove();
		delete TREM.EQ_list[key];
		i--;
	}
	eew_cache = [];
	i_list = {
		data : [],
		time : 0,
	};
	time.style.cursor = "";
	time.style.color = "white";
	setTimeout(() => fetch_eew(), 1500);
}

function replay_run(id_list) {
	for (const item of document.getElementsByClassName("report_click_text fa-regular fa-circle-play fa-2x"))
		item.style.display = "none";
	for (let i = 0; i < Object.keys(TREM.EQ_list).length; i++) {
		const key = Object.keys(TREM.EQ_list)[i];
		if (TREM.EQ_list[key].epicenterIcon) TREM.EQ_list[key].epicenterIcon.remove();
		if (TREM.EQ_list[key].p_wave) TREM.EQ_list[key].p_wave.remove();
		if (TREM.EQ_list[key].s_wave) TREM.EQ_list[key].s_wave.remove();
		if (TREM.EQ_list[key].progress) TREM.EQ_list[key].progress.remove();
		delete TREM.EQ_list[key];
		i--;
	}
	eew_cache = [];
	time.style.cursor = "pointer";
	time.style.color = "yellow";
	on_rts_data({});
	report_off();
	for (let i = 0; i < id_list.length; i++) {
		const data = {
			method  : "POST",
			headers : { "content-type": "application/json" },
			body    : JSON.stringify({
				uuid : localStorage.UUID,
				id   : id_list[i],
			}),
		};
		fetch(`${PostAddressIP}replay`, data)
			.catch((err) => {
				console.error(err);
			});
	}
}

function eew_replay_stop() {
	replay_stop_state = true;
	for (let i = 0; i < info_list.length; i++) {
		const info_box = document.getElementById("info_box");
		info_box.removeChild(info_box.children[i]);
		info_list.splice(i, 1);
		i--;
	}
	const data = {
		method  : "POST",
		headers : { "content-type": "application/json" },
		body    : JSON.stringify({
			uuid: localStorage.UUID,
		}),
	};
	fetch(`${PostAddressIP}stop`, data)
		.then(() => setTimeout(() => replay_stop_state = false, 1000))
		.catch((err) => {
			setTimeout(() => replay_stop_state = false, 1000);
			console.error(err);
		});
}

function eew_location_intensity(data) {
	const json = {};
	let eew_max_pga = 0;
	let count = 0;
	for (let i = 0; i < Object.keys(region).length; i++) {
		const city = Object.keys(region)[i];
		for (let index = 0; index < Object.keys(region[city]).length; index++) {
			const town = Object.keys(region[city])[index];
			const info = region[city][town];
			const dist_surface = Math.sqrt(pow((data.lat - info.lat) * 111) + pow((data.lon - info.lon) * 101));
			const dist = Math.sqrt(pow(dist_surface) + pow(data.depth));
			const pga = 1.657 * Math.pow(Math.E, (1.533 * data.scale)) * Math.pow(dist, -1.607) * info.site;
			if (pga > eew_max_pga) eew_max_pga = pga;
			if (pga > 0.8) count++;
			json[`${city} ${town}`] = {
				dist,
				pga,
			};
		}
	}
	// console.log(data.type, " ", data.number, " ", count);
	json.max_pga = eew_max_pga;
	return json;
}

function eew_location_info(data) {
	const dist_surface = Math.sqrt(pow((data.lat - TREM.user.lat) * 111) + pow((data.lon - TREM.user.lon) * 101));
	const dist = Math.sqrt(pow(dist_surface) + pow(data.depth));
	const pga = 1.657 * Math.pow(Math.E, (1.533 * data.scale)) * Math.pow(dist, -1.607) * (storage.getItem("site") ?? 1.751);
	return {
		dist,
		pga,
	};
}

function pga_to_intensity(pga) {
	return (pga > 800) ? 9 : (pga > 440) ? 8 : (pga > 250) ? 7 : (pga > 140) ? 6 : (pga > 80) ? 5 : (pga > 25) ? 4 : (pga > 8) ? 3 : (pga > 2.5) ? 2 : (pga > 0.8) ? 1 : 0;
}

function int_to_color(int) {
	const list = ["#A6ADAD", "#6B7878", "#1E6EE6", "#32B464", "#FFE05D", "#FFAA13", "#EF700F", "#E60000", "#A00000", "#5D0090"];
	return list[int];
}

async function report_report(info) {
	if (Object.keys(TREM.EQ_list).length) return;
	if (TREM.report_epicenterIcon) report_off();
	if (click_report_id == info) {
		click_report_id = -1;
		return;
	}
	click_report_id = info;
	const data = report_data[info];
	TREM.report_time = now_time();
	const epicenterIcon = L.icon({
		iconUrl  : "../resource/images/cross.png",
		iconSize : [30, 30],
	});
	const intensity = data.data[0]?.areaIntensity ?? 0;
	const intensity_level = (intensity == 0) ? "--" : int_to_intensity(intensity);
	if (TREM.report_epicenterIcon) TREM.report_epicenterIcon.remove();
	TREM.report_epicenterIcon = L.marker([data.epicenterLat, data.epicenterLon],
		{ icon: epicenterIcon, zIndexOffset: 6000 }).addTo(TREM.Maps.main);
	TREM.report_bounds.extend([data.epicenterLat, data.epicenterLon]);
	const trem_eq = await fetch_trem_eq(data.trem[0]);
	if ((storage.getItem("report_show_trem") ?? false) && trem_eq)
		if (trem_eq && Object.keys(station).length) {
			const trem_eq_list = trem_eq.station;
			for (let i = 0; i < trem_eq_list.length; i++) {
				const uuid = trem_eq_list[i].uuid.split("-")[2];
				if (!station[uuid]) continue;
				const _info = station[uuid];
				const station_Intensity = intensity_string_to_int(trem_eq_list[i].intensity);
				const icon = (station_Intensity == 0) ? L.divIcon({
					className : "pga_dot dot_max pga_intensity_0",
					html      : "<span></span>",
					iconSize  : [10 + TREM.size, 10 + TREM.size],
				}) : L.divIcon({
					className : `dot_max intensity_${station_Intensity}`,
					html      : `<span>${int_to_intensity(station_Intensity)}</span>`,
					iconSize  : [30, 30],
				});
				TREM.report_icon_list[`${uuid}-${station_Intensity}`] = L.marker([_info.Lat, _info.Long], { icon: icon, zIndexOffset: station_Intensity * 10 })
					.bindTooltip(`<div class='report_station_box'><div>站名: ${uuid} ${trem_eq_list[i].name}</div><div>位置: ${_info.Lat.toFixed(2)} °N  ${_info.Long.toFixed(2)} °E</div><div>PGA: ${trem_eq_list[i].pga} gal</div><div>PGV: ${trem_eq_list[i].pgv} kine</div><div>震度: ${int_to_intensity(station_Intensity)}</div></div>`, { opacity: 1 })
					.addTo(TREM.Maps.main);
				TREM.report_bounds.extend([_info.Lat, _info.Long]);
			}
		}
	if (!data.location.startsWith("地震資訊"))
		for (let _i = 0; _i < data.data.length; _i++) {
			const station_data = data.data[_i].eqStation;
			for (let i = 0; i < station_data.length; i++) {
				const station_Intensity = station_data[i].stationIntensity;
				const icon = L.divIcon({
					className : `dot intensity_${station_Intensity}`,
					html      : `<span>${int_to_intensity(station_Intensity)}</span>`,
					iconSize  : [30, 30],
				});
				TREM.report_icon_list[station_data[i].stationName] = L.marker([station_data[i].stationLat, station_data[i].stationLon], { icon: icon, zIndexOffset: station_Intensity * 10 })
					.bindTooltip(`<div class='report_station_box'><div>站名: ${data.data[_i].areaName} ${station_data[i].stationName}</div><div>位置: ${station_data[i].stationLat} °N  ${station_data[i].stationLon} °E</div><div>距離: ${station_data[i].distance} km</div><div>震度: ${int_to_intensity(station_Intensity)}</div></div>`, { opacity: 1 })
					.addTo(TREM.Maps.main);
				TREM.report_bounds.extend([station_data[i].stationLat, station_data[i].stationLon]);
			}
		}
	Zoom = true;
	TREM.Maps.main.setView(TREM.report_bounds.getCenter(), TREM.Maps.main.getBoundsZoom(TREM.report_bounds) - 0.5);
	show_icon(3, intensity);
	document.getElementById("report_title_text").innerHTML = `${get_lang_string("report.title").replace("${type}", (data.location.startsWith("地震資訊")) ? get_lang_string("report.title.Local") : ((data.earthquakeNo % 1000) ? data.earthquakeNo : get_lang_string("report.title.Small")))}`;
	document.getElementById("report_max_intensity").innerHTML = (data.location.startsWith("地震資訊")) ? "最大震度" : `${data.data[0].areaName} ${data.data[0].eqStation[0].stationName}`;
	const eew_intensity = document.getElementById("report_intensity");
	eew_intensity.className = `intensity_${intensity} intensity_center`;
	eew_intensity.innerHTML = intensity_level;
	const report_location = document.getElementById("report_location");
	const loc = data.location.substring(data.location.indexOf("(") + 1, data.location.indexOf(")")).replace("位於", "");
	report_location.style.fontSize = (loc.length > 10) ? "16px" : (loc.length > 7) ? "20px" : "24px";
	report_location.innerHTML = loc;
	document.getElementById("report_time").innerHTML = get_lang_string("eew.time").replace("${time}", data.originTime);
	let report_magnitudeValue = data.magnitudeValue.toString();
	if (report_magnitudeValue.length == 1)
		report_magnitudeValue = report_magnitudeValue + ".0";
	document.getElementById("report_scale").innerHTML = `M ${report_magnitudeValue}`;
	document.getElementById("report_args").innerHTML = `${get_lang_string("word.depth")}:&nbsp;<b>${data.depth}</b>&nbsp;km`;
	info_box_change();
}

function info_box_change() {
	for (const item of document.getElementsByClassName("eew_box"))
		item.style.display = "none";
	for (const item of document.getElementsByClassName("report_box"))
		item.style.display = "inline";
	for (const item of document.getElementsByClassName("report_hide"))
		item.style.display = "inline";
}

function IntensityToClassString(level) {
	const classname = (level == 9) ? "seven"
		: (level == 8) ? "six strong"
			: (level == 7) ? "six"
				: (level == 6) ? "five strong"
					: (level == 5) ? "five"
						: (level == 4) ? "four"
							: (level == 3) ? "three"
								: (level == 2) ? "two"
									: (level == 1) ? "one"
										: "zero";

	// if (tinycolor(setting["theme.customColor"] ? setting[`theme.int.${level}`] : [
	// 	"#757575",
	// 	"#757575",
	// 	"#2774C2",
	// 	"#7BA822",
	// 	"#E8D630",
	// 	"#E68439",
	// 	"#DB641F",
	// 	"#F55647",
	// 	"#DB1F1F",
	// 	"#862DB3",
	// ][level]).getLuminance() > 0.575)
	// 	classname += " darkText";

	return classname;
}

function add_info(icon_class, icon_color, info_title, info_title_color, info_body, time = 240000) {
	const item = document.createElement("div");
	item.className = "info_item";
	const body = document.createElement("div");
	body.className = "info_box_body";
	const icon = document.createElement("i");
	icon.className = icon_class;
	icon.style.color = icon_color;
	const text_body = document.createElement("div");
	const title = document.createElement("div");
	title.className = "info_box_title";
	title.innerHTML = info_title;
	title.style.color = info_title_color;
	const text = document.createElement("div");
	text.innerHTML = info_body;
	text_body.appendChild(title);
	text_body.appendChild(text);
	body.appendChild(icon);
	body.appendChild(text_body);
	item.appendChild(body);
	document.getElementById("info_box").appendChild(item);
	info_list.push(now_time() + time);
}

function show_icon(show = true, max = 1) {
	if (show) {
		document.getElementById("icon_intensity_box").style.display = "";
		if (show != 3) document.getElementById("icon_map_box").style.display = "";

		icon_level(1, "");
		if (max > 1) icon_level(2, "");
		if (max > 2) icon_level(3, "");
		if (max > 3) icon_level(4, "");
		if (max > 4) icon_level(5, "");
		if (max > 5) icon_level(6, "");
		if (max > 6) icon_level(7, "");
		if (max > 7) icon_level(8, "");
		if (max > 8) icon_level(9, "");
	} else {
		document.getElementById("icon_intensity_box").style.display = "none";
		document.getElementById("icon_map_box").style.display = "none";
		icon_level(1);
		icon_level(2);
		icon_level(3);
		icon_level(4);
		icon_level(5);
		icon_level(6);
		icon_level(7);
		icon_level(8);
		icon_level(9);
	}
}

function icon_level(level, type = "none") {
	document.getElementById(`m_level_${level}`).style.display = type;
	document.getElementById(`i_level_${level}`).style.display = type;
}

function show_screen(type) {
	if (type == "eew" && !(storage.getItem("show_eew") ?? true)) return;
	if (type == "report" && !(storage.getItem("show_report") ?? true)) return;
	if (type == "palert" && !(storage.getItem("show_palert") ?? true)) return;
	if (type == "trem" && !(storage.getItem("show_trem") ?? true)) return;
	if (type == "rts" && !(storage.getItem("show_trem") ?? true)) return;
	if (type == "tsunami" && !(storage.getItem("show_eew") ?? true)) return;
	win.flashFrame(true);
	win.setAlwaysOnTop(true);
	win.show();
	win.setAlwaysOnTop(false);
}