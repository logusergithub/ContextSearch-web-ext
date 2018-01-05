function notify(message, sender, sendResponse) {
	
	switch(message.action) {
		
		case "updateUserOptions":
			loadUserOptions();
			getAllOpenTabs((tabs) => {
				for (let tab of tabs)
					browser.tabs.sendMessage(tab.id, {"userOptions": userOptions});	
			});
			break;
			
		case "openOptions":
			browser.runtime.openOptionsPage();
			break;
			
		case "openTab":
			openSearchTab(message.info, sender.tab);
			break;
			
		case "enableContextMenu":
			userOptions.contextMenu = true;
			buildContextMenu();
			break;
			
		case "getUserOptions":
			loadUserOptions();
			sendResponse({"userOptions": userOptions});
			break;
		
		case "openQuickMenuRequest":
			browser.tabs.sendMessage(sender.tab.id, {action: "openQuickMenu", searchTerms: message.searchTerms, screenCoords: message.screenCoords}, {frameId: 0});
			break;
			
		case "closeQuickMenuRequest":
			browser.tabs.sendMessage(sender.tab.id, {action: "closeQuickMenu"});
			break;
			
		case "closeWindowRequest":
			browser.windows.remove(sender.tab.windowId);
			break;

	}
}

function loadUserOptions() {
	
	function onGot(result) {
		
		userOptions = result.userOptions || userOptions;
		
		browser.storage.local.get("searchEngines").then((r2) => {
			if (typeof r2.searchEngines !== 'undefined') {
				console.log('found separate searchEngines array in local storage.  Copying to userOptions and removing');
				userOptions.searchEngines = r2.searchEngines || userOptions.searchEngines;
				browser.storage.local.remove("searchEngines");
				browser.storage.local.set({"userOptions": userOptions});
			}
			buildContextMenu();
		}, () => {
			console.log('error getting searchEngines from localStorage');
			buildContextMenu();
		});
	}
  
	function onError(error) {
		console.log(`Error: ${error}`);
		buildContextMenu();
	}
	
	var getting = browser.storage.local.get("userOptions");
	getting.then(onGot, onError);
}

function buildContextMenu() {
	
	browser.contextMenus.removeAll();

	if (!userOptions.contextMenu) {
		console.log('Context menu is disabled');
		return false;
	}	

	browser.contextMenus.create({
		id: "search_engine_menu",
		title: (userOptions.searchEngines.length === 0) ? "+ Add search engines" : "Search with",
		contexts: ["selection"]
	});

	for (var i=0;i<userOptions.searchEngines.length;i++) {
		browser.contextMenus.create({
			parentId: "search_engine_menu",
			id: i.toString(),
			title: userOptions.searchEngines[i].title,
			contexts: ["selection"],
			icons: {
				"16": userOptions.searchEngines[i].icon_url || userOptions.searchEngines[i].icon_base64String || "",
				"32": userOptions.searchEngines[i].icon_url || userOptions.searchEngines[i].icon_base64String || ""
			}
		});
	}
	
	if (!browser.contextMenus.onClicked.hasListener(openSearchTab))
		browser.contextMenus.onClicked.addListener(openSearchTab);
	
}

function openSearchTab(info, tab) {
	
	if (userOptions.searchEngines.length === 0) {	
		// if searchEngines is empty, open Options
		browser.runtime.openOptionsPage();
		return false;	
	}
	
	// get modifier keys
	var shift = info.modifiers.includes("Shift");
	var ctrl = info.modifiers.includes("Ctrl");
	
	// swap modifier keys if option set
	if (userOptions.swapKeys)
		shift = [ctrl, ctrl=shift][0];
	
	var searchTerms = info.selectionText.trim();
	userOptions.searchEngines[info.menuItemId].queryCharset = userOptions.searchEngines[info.menuItemId].queryCharset || "UTF-8";

	var encodedSearchTermsObject = encodeCharset(searchTerms, userOptions.searchEngines[info.menuItemId].queryCharset);
	var q = replaceOpenSearchParams(userOptions.searchEngines[info.menuItemId].query_string, encodedSearchTermsObject.uri);
	
//		console.log(q);
	// get array of open search tabs async. and find right-most tab
	getOpenSearchTabs(tab.id, (openSearchTabs) => {
		
		if (typeof userOptions.searchEngines[info.menuItemId].method !== 'undefined' && userOptions.searchEngines[info.menuItemId].method === "POST")
			q = userOptions.searchEngines[info.menuItemId].template;

		function onCreate(_tab) {
			
			// code for POST engines
			if (typeof userOptions.searchEngines[info.menuItemId].method === 'undefined' || userOptions.searchEngines[info.menuItemId].method !== "POST") return;
			
			// if new window
			if (shift) _tab = _tab.tabs[0];

			browser.tabs.onUpdated.addListener(function listener(tabId, changeInfo, tabInfo) {
		
				// new windows open to about:blank and throw extra complete event
				if (tabInfo.url !== q) return;
				browser.tabs.onUpdated.removeListener(listener);

				browser.tabs.executeScript(_tab.id, {
					code: 'window.stop();',
					runAt: 'document_start'
				}).then(() => {
				browser.tabs.executeScript(_tab.id, {
					code: 'var _INDEX=' + info.menuItemId + ', _SEARCHTERMS="' + /*encodedSearchTermsObject.ascii*/ searchTerms + '"', 
					runAt: 'document_idle'
				}).then(() => {
				browser.tabs.executeScript(_tab.id, {
					file: '/execute.js',
					runAt: 'document_idle'
				});});});
			
			});
		}
		
		function onError() {
			console.log(`Error: ${error}`);
		}

		if (shift) {	// open in new window

			var creating = browser.windows.create({
				url: q
			});
			creating.then(onCreate, onError);
			
		} else {	// open in new tab
		
			// rightMostSearchTabIndex = tab.index if openSearchTabs is empty or right-most search tab is left of tab
			var rightMostSearchTabIndex = (openSearchTabs.length > 0 && openSearchTabs[openSearchTabs.length -1].index > tab.index) ? openSearchTabs[openSearchTabs.length -1].index : tab.index;
			
			var creating = browser.tabs.create({
				url: q,
				active: (ctrl || userOptions.backgroundTabs) ? false : true,
				index: rightMostSearchTabIndex + 1,
				openerTabId: tab.id
			});
			creating.then(onCreate, onError);

		}
	});
}

function getOpenSearchTabs(id, callback) {

	function onGot(tabs) {		
		var openSearchTabs = tabs.sort(function(a, b) {
			return (a.index < b.index) ? -1 : 1;
		});
		callback(openSearchTabs);
	}

	function onError(error) {
		console.log(`Error: ${error}`);
	}

	var querying = browser.tabs.query({currentWindow: true, openerTabId: id});
	querying.then(onGot, onError);
}

function getAllOpenTabs(callback) {
	
	function onGot(tabs) {
		callback(tabs);
	}

	function onError(error) {
		console.log(`Error: ${error}`);
	}

	var querying = browser.tabs.query({});
	querying.then(onGot, onError);
}

var userOptions = {
	searchEngines: [],
	backgroundTabs: false,
	swapKeys: false,
	quickMenu: false,
	quickMenuColumns: 4,
	quickMenuItems: 100,
	quickMenuKey: 0,
	quickMenuOnKey: false,
	quickMenuOnMouse: true,
	quickMenuMouseButton: 3,
	quickMenuAuto: false,
	quickMenuScale: 1,
	quickMenuScaleOnZoom: true,
	quickMenuOffset: {x:0, y:0},
	contextMenu: true
};

loadUserOptions();
browser.runtime.onMessage.addListener(notify);
browser.runtime.onInstalled.addListener(function updatePage() {
	if (userOptions.searchEngines.length !== 0 && typeof userOptions.searchEngines[0].method === 'undefined') {	
		var creating = browser.tabs.create({
			url: "/update.html"
		});
		creating.then();
	}
});

browser.browserAction.onClicked.addListener(() => {
	
//	browser.browserAction.setPopup({popup: "/options.html#quickload"});

	var creating = browser.windows.create({
		url: browser.runtime.getURL("/options.html#quickload"),
		type: "popup",
		height: 100,
		width: 400
	});
	creating.then((windowInfo) => {
	});

});

function encodeCharset(string, encoding) {

	try {
		
		if (encoding.toLowerCase() === 'utf-8') 
			return {ascii: string, uri: encodeURIComponent(string)};
		
		let uint8array = new TextEncoder(encoding, { NONSTANDARD_allowLegacyEncoding: true }).encode(string);
		let uri_string = "", ascii_string = "";
		
		for (let uint8 of uint8array) {
			let c = String.fromCharCode(uint8);
			ascii_string += c;
			uri_string += (c.match(/[a-zA-Z0-9\-_.!~*'()]/) !== null) ? c : "%" + uint8.toString(16);
		}

		return {ascii: ascii_string, uri: uri_string};
	} catch (error) {
		console.log(error.message);
		return {ascii: string, uri: string};
	}
}
/*
function nativeTest() {
	function decodeLz4Block(input, output, sIdx, eIdx)
	{
		sIdx = sIdx || 0;
		eIdx = eIdx || input.length;

		// Process each sequence in the incoming data
		for (var i = sIdx, j = 0; i < eIdx;)
		{
			var token = input[i++];

			// Literals
			var literals_length = (token >> 4);
			if (literals_length > 0) {
				// length of literals
				var l = literals_length + 240;
				while (l === 255) {
					l = input[i++];
					literals_length += l;
				}

				// Copy the literals
				var end = i + literals_length;
				while (i < end) {
					output[j++] = input[i++];
				}

				// End of buffer?
				if (i === eIdx) {
					return j;
				}
			}

			// Match copy
			// 2 bytes offset (little endian)
			var offset = input[i++] | (input[i++] << 8);

			// 0 is an invalid offset value
			if (offset === 0 || offset > j) {
				return -(i-2);
			}

			// length of match copy
			var match_length = (token & 0xf);
			var l = match_length + 240;
			while (l === 255) {
				l = input[i++];
				match_length += l;
			}

			// Copy the match
			var pos = j - offset; // position of the match copy in the current output
			var end = j + match_length + 4; // minmatch = 4
			while (j < end) {
				output[j++] = output[pos++];
			}
		}

		return j;
	}
	
	function readMozlz4Base64String(str)
	{
		let input = Uint8Array.from(atob(str), c => c.charCodeAt(0));
		let output;
		let uncompressedSize = input.length*3;  // size estimate for uncompressed data!

		// Decode whole file.
		do {
			output = new Uint8Array(uncompressedSize);
			uncompressedSize = decodeLz4Block(input, output, 8+4);  // skip 8 byte magic number + 4 byte data size field
			// if there's more data than our output estimate, create a bigger output array and retry (at most one retry)
		} while (uncompressedSize > output.length);

		output = output.slice(0, uncompressedSize); // remove excess bytes

		let decodedText = new TextDecoder().decode(output);
		console.log(JSON.parse(decodedText));
	};
	
	function onResponse(response) {
//		console.log("Received " + response);
//		let binary_str = atob(response.pong);
//		console.log(binary_str);
		readMozlz4Base64String(response.pong);

	}

	function onError(error) {
		console.log(`Error: ${error}`)
	}
	var sending = browser.runtime.sendNativeMessage("search_engines_server","{\"path\": \"C:\\Users\\Mike\\AppData\\Roaming\\Mozilla\\Firefox\\Profiles\\iy8k3epd.default-1478560510169\\search.json.mozlz4\"}");
	sending.then(onResponse, onError);
	//C:\\Users\\Mike\\AppData\\Roaming\\Mozilla\\Firefox\\Profiles\\iy8k3epd.default-1478560510169\\search.json.mozlz4
}

nativeTest();

/*
console.log(encodeCharset("blahbla blah blah & blah", 'utf-8'));
console.log(encodeCharset("ツ 日本語用コンテ blah blah", 'euc-jp'));
console.log(encodeCharset("try this", 'windows-1251'));
console.log(encodeCharset('一般来说，URL只能使用英文字母、阿拉伯数字和某些标点符号，不能使用其他文字和符号。比如，世界上有英文字母的网址"http://www.abc.com"，但是没有希腊字母的网址"http://www.aβγ.com"（读作阿尔法-贝塔-伽玛.com）。这是因为网络标准RFC 1738做了硬性规定', 'GB2312'));
//'euc-jp' ядрами и графическое
*/
