var userOptions;

browser.runtime.sendMessage({action: "getUserOptions"}).then( message => {
	userOptions = message.userOptions;

	setUserStyles();
	makePageTiles();
})

// document.addEventListener('mouseup', e => {
// 	console.info('iframe captured mouseup');
// });

// document.addEventListener('drop', e => {
// 	console.info('iframe captured drop');
// })

var colors;

function makePageTiles() {

	var mainDiv = document.createElement('div');
	mainDiv.className = "pageTilesContainer";

	let rows = userOptions.pageTiles.rows;
	let cols = userOptions.pageTiles.columns;

	mainDiv.style.setProperty("--cs-pagetilerows", rows);
	mainDiv.style.setProperty("--cs-pagetilecols", cols);

	colors = userOptions.pageTiles.paletteString.split('-');

	let nodes = findNodes(userOptions.nodeTree, n => true);

	let gridNodes = userOptions.pageTiles.grid.map( id => nodes.find( n => n.id === id) || {id: null, type: "bookmarklet", title: "", icon: browser.runtime.getURL('/icons/empty.svg')} );

	gridNodes = gridNodes.slice(0, rows * cols);

	gridNodes.forEach( node => {

		let div = document.createElement('div');
		div.className = 'pageTile';

		let header = document.createElement('div');
		header.innerText = node.title;
		div.appendChild(header);
		
		node.icon = getIconFromNode(node);

		if ( colors.length !== 1 ) {
			let bgcolor = '#' + colorFromString(node.id || node.type);
			div.style.backgroundColor = bgcolor;
			if ( getLuma(bgcolor) < 140) div.style.color = '#ccc ';
		} else {
			div.style.filter = 'none';
		}

		div.style.backgroundImage = `url(${node.icon})`;

		div.ondragenter = function(e) { 
			e.preventDefault();
			div.classList.add('dragover');
		}
		div.ondragleave = function(e) { 
			e.preventDefault();
			div.classList.remove('dragover');
		}
		div.ondragover = e => e.preventDefault();

		div.onmouseenter = div.ondragenter;
		div.onmouseleave = div.ondragleave;

		div.onmouseup = searchHandler;
		div.ondrop = searchHandler;
		div.onclick = searchHandler;
			
		async function searchHandler(e) {
			e.preventDefault();

			let searchTerms = e.dataTransfer ? e.dataTransfer.getData("text/plain") : null;

			if ( ! searchTerms ) {
				let message = await browser.runtime.sendMessage({action: "getLastSearch"});
				searchTerms = message.lastSearch;

				if ( !searchTerms ) return;
			}

			browser.runtime.sendMessage({
				action: "quickMenuSearch", 
				info: {
					menuItemId: node.id,
					selectionText: searchTerms,
					openMethod: userOptions.pageTiles.openMethod
				}
			});
			
			close();
		}
		
		div.addEventListener('dragend', close);
		div.addEventListener('click', close);
		
		// // clear events for empty tiles
		if ( !node.id )	div.classList.add('empty');

		mainDiv.appendChild(div);
	});

	document.body.appendChild(mainDiv);
	mainDiv.getBoundingClientRect();
	mainDiv.style.opacity = 1;
}

document.addEventListener('keydown', e => {
	if ( e.key == "Escape" ) close();
});

function close() {
	browser.runtime.sendMessage({action: "closePageTiles"});
}

function colorFromString(str) {
	let num = 0;
	let letters = str.split('');
	letters.forEach(l => num+=l.charCodeAt(0));
	let index = num % colors.length;

	return colors[index];
}

function getLuma(hexcolor) {
	var c = hexcolor.substring(1);      // strip #
	var rgb = parseInt(c, 16);   // convert rrggbb to decimal
	var r = (rgb >> 16) & 0xff;  // extract red
	var g = (rgb >>  8) & 0xff;  // extract green
	var b = (rgb >>  0) & 0xff;  // extract blue

	return 0.2126 * r + 0.7152 * g + 0.0722 * b; // per ITU-R BT.709
}

function setUserStyles() {
	if ( userOptions.userStylesEnabled ) {
		// Append <style> element to <head>
		var styleEl = document.createElement('style');
		document.head.appendChild(styleEl);
		styleEl.innerText = userOptions.userStyles;
		
		document.body.getBoundingClientRect();
	}
}