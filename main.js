/**
 * @author zz85 (https://github.com/zz85 | https://twitter.com/blurspline)
 */

var dpr, rc, ctx;
const DEBUG = false;
const STORAGE_KEY = 'kafka-streams-viz';

function processName(name) {
	return name.replace(/-/g, '-\\n');
}

// converts kafka stream ascii topo description to DOT language
function convertTopoToDot(topo) {
	var lines = topo.split('\n');
	var results = [];
	var outside = [];
	var stores = new Set();
	var topics = new Set();
	var entityName;

	// dirty but quick parsing
	lines.forEach(line => {
		var sub = /Sub-topology: ([0-9]*)/;
		var match = sub.exec(line);

		if (match) {
			if (results.length) results.push(`}`);
			results.push(`subgraph cluster_${match[1]} {
			label = "${match[0]}";

			style=filled;
			color=lightgrey;
			node [style=filled,color=white];
			`);

			return;
		}

		match = /(Source\:|Processor\:|Sink:)\s+(\S+)\s+\((topics|topic|stores)\:(.*)\)/.exec(line)

		if (match) {
			entityName = processName(match[2]);
			var type = match[3]; // source, processor or sink
			var linkedNames = match[4];
			linkedNames = linkedNames.replace(/\[|\]/g, '');
			linkedNames.split(',').forEach(linkedName => {
				linkedName = processName(linkedName.trim());

				if (linkedName === '') {
					// short circuit
				}
				else if (type === 'topics') {
					// from
					outside.push(`"${linkedName}" -> "${entityName}";`);
					topics.add(linkedName);
				}
				else if (type === 'topic') {
					// to
					outside.push(`"${entityName}" -> "${linkedName}";`);
					topics.add(linkedName);
				}
				else if (type === 'stores') {
					if (entityName.includes("JOIN")) {
						outside.push(`"${linkedName}" -> "${entityName}";`);
					} else {
						outside.push(`"${entityName}" -> "${linkedName}";`);
					}

					stores.add(linkedName);
				}
			});

			return;
		}

		match = /\-\-\>\s+(.*)$/.exec(line);

		if (match && entityName) {
			var targets = match[1];
			targets.split(',').forEach(name => {
				var linkedName = processName(name.trim());
				if (linkedName === 'none') return;

				results.push(`"${entityName}" -> "${linkedName}";`);
			});
		}
	})

	if (results.length) results.push(`}`);

	results = results.concat(outside);

	stores.forEach(node => {
		results.push(`"${node}" [shape=cylinder];`)
	});

	topics.forEach(node => {
		results.push(`"${node}" [shape=rect];`)
	});

	return `
	digraph G {
		label = "Kafka Streams Topology"

		${results.join('\n')}
	}
	`;
}

function update() {
	var topo = input.value;
	var dotCode = convertTopoToDot(topo);
	if (DEBUG) console.log('dot code\n', dotCode);


	graphviz_code.value = dotCode;

	var params = {
		engine: 'dot',
		format: 'svg'
  	};

	var svgCode = Viz(dotCode, params);

	svg_container.innerHTML = svgCode;

	var svg = svg_container.querySelector('svg')
	dpr = window.devicePixelRatio
	canvas.width = svg.viewBox.baseVal.width * dpr | 0;
	canvas.height = svg.viewBox.baseVal.height * dpr | 0;
	canvas.style.width = `${svg.viewBox.baseVal.width}px`;
	canvas.style.height = `${svg.viewBox.baseVal.height}px`;

	rc = rough.canvas(canvas);
	ctx = rc.ctx
	ctx.scale(dpr, dpr);

	var g = svg.querySelector('g');

	try {
		traverseSvgToRough(g);

		sessionStorage.setItem(STORAGE_KEY, topo);
	}
	catch (e) {
		console.error('Exception generating graph', e && e.stack || e);
		// TODO update Frontend
	}
}

function nullIfNone(attribute) {
	return attribute === 'none' ? null : attribute;
}

/**
 * The following part can be removed when rough.js adds support for rendering svgs.
 */

function getFillStroke(child) {
	var fill = nullIfNone(child.getAttribute('fill'));
	var stroke = nullIfNone(child.getAttribute('stroke'));
	var isBaseRectangle = child.nodeName === 'polygon' && child.parentNode.id === 'graph0';

	return {
		fill: isBaseRectangle ? 'white' : fill,
		fillStyle: isBaseRectangle ? 'solid' : 'hachure',
		stroke: stroke
	};
}

function splitToArgs(array, delimiter) {
	return array.split(delimiter || ',').map(v => +v);
}

// node traversal function
function traverseSvgToRough(child) {

	if (child.nodeName === 'path') {
		var d = child.getAttribute('d');
		var opts = getFillStroke(child);
		rc.path(d, opts);
		return;
	  }

	if (child.nodeName === 'ellipse') {
		var cx = +child.getAttribute('cx');
		var cy = +child.getAttribute('cy');
		var rx = +child.getAttribute('rx');
		var ry = +child.getAttribute('ry');

		var opts = getFillStroke(child);

		rc.ellipse(cx, cy, rx * 1.5, ry * 1.5);
		return;
  	}

	if (child.nodeName === 'text') {
		var fontFamily = child.getAttribute('font-family')
		var fontSize = +child.getAttribute('font-size')
		var anchor = child.getAttribute('text-anchor')

		if (anchor === 'middle') {
			ctx.textAlign = 'center';
		}

		if (fontFamily) {
			ctx.fontFamily = fontFamily;
		}

		if (fontSize) {
			ctx.fontSize = fontSize;
		}

		ctx.fillText(child.textContent, child.getAttribute('x'), child.getAttribute('y'));
		return;
  	}

	if (child.nodeName === 'polygon') {
		var pts = child.getAttribute('points')

		var opts = getFillStroke(child);
		rc.path(`M${pts}Z`, opts);

		return;
	}

	if (child.nodeName === 'g') {
		var transform = child.getAttribute('transform');
		ctx.save();

		if (transform) {
	  		var scale = /scale\((.*)\)/.exec(transform);
	  		if (scale) {
				var args = scale[1].split(' ').map(parseFloat);
				ctx.scale(...args);
	  		}

			var rotate = /rotate\((.*)\)/.exec(transform);
			if (rotate) {
				var args = rotate[1].split(' ').map(parseFloat);
				ctx.rotate(...args);
			}

			var translate = /translate\((.*)\)/.exec(transform);
			if (translate) {
				var args = translate[1].split(' ').map(parseFloat);
				ctx.translate(...args);
			}
		}

		[...child.children].forEach(traverseSvgToRough);

		ctx.restore();
		return;
	}
}

var pending;
function scheduleUpdate() {
	if (pending) clearTimeout(pending);

	pending = setTimeout(() => {
		pending = null;
		update();
	}, 200);
}

// startup
var topo;

if (window.location.hash.length > 1) {
	try {
		topo = atob(window.location.hash.substr(1));
	} catch {
		console.log("Can not read topo from url hash");
		window.location.hash = "";
	}
}

if (!topo) {
	topo = sessionStorage.getItem(STORAGE_KEY);
}

if (topo) input.value = topo;
update();
