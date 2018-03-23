/**
 * @author zz85 (github.com/zz85 | twitter.com/blurspline)
 */

var dpr, rc, ctx;

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
		var sub = /Sub-topology: (.)/;
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
			linkedName = match[4];

			linkedName = linkedName.replace(/\[|\]/g, '').trim();
			linkedName = processName(linkedName);

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
				outside.push(`"${entityName}" -> "${linkedName}";`);
				stores.add(linkedName);
			}

			return;
		}

		match = /\-\-\>\s+(\S+)/.exec(line);

		if (match && entityName) {
			var linkedName = processName(match[1]);
			results.push(`"${entityName}" -> "${linkedName}";`);
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

	rc = rough.canvas(canvas);
	ctx = rc.ctx
	ctx.scale(dpr, dpr);

	var g = svg.querySelector('g');
	traverseSvgToRough(g);
}

function splitToArgs(array, delimiter) {
	return array.split(delimiter || ',').map(v => +v);
}

// node traversal function
function traverseSvgToRough(child) {

	if (child.nodeName === 'path') {
		var fill = child.getAttribute('fill');
		var stroke = child.getAttribute('stroke')

		var d = child.getAttribute('d');
		rc.path(d, { fill, stroke });
		return;
	  }

	if (child.nodeName === 'ellipse') {
		var cx = +child.getAttribute('cx');
		var cy = +child.getAttribute('cy');
		var rx = +child.getAttribute('rx');
		var ry = +child.getAttribute('ry');

		var fill = child.getAttribute('fill');
		var stroke = child.getAttribute('stroke');

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

		var fill = child.getAttribute('fill');
		var stroke = child.getAttribute('stroke')

		rc.path(`M${pts}Z`, { fill, stroke });

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

update();
