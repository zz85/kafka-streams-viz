/**
 * @author zz85 (github.com/zz85 | twitter.com/blurspline)
 */

function processName(name) {
  return name.replace(/-/g, '-\\n');
}

function convert(topo) {
	var lines = topo.split('\n');
	var results = [];
	var outside = [];
	var stores = new Set();
	var topics = new Set();
	var entity;

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
			`)

			return;
		}

		match = /(Source\:|Processor\:|Sink:)\s+(\S+)\s+\((topics|topic|stores)\:(.*)\)/.exec(line)

		if (match) {
			entity = processName(match[2]);
			type = match[3];
			names = match[4];

			names = names.replace(/\[|\]/g, '').trim();
			names = processName(names);

			if (names == '') {
				// short circuit
			}
			else if (type === 'topics') {
				// from
				outside.push(`"${names}" -> "${entity}";`);
				topics.add(names);
			}
			else if (type == 'topic') {
				// to
				outside.push(`"${entity}" -> "${names}";`);
				topics.add(names);
			}
			else if (type == 'stores') {
				outside.push(`"${entity}" -> "${names}";`);
				stores.add(names);
			}

			return;
		}

		match = /\-\-\>\s+(\S+)/.exec(line);

		if (match && entity) {
			name = processName(match[1])
			results.push(`"${entity}" -> "${name}";`);
		}
	})

	if (results.length) results.push(`}`);

	results = results.concat(outside);

	stores.forEach(node => {
	  results.push(`"${node}" [shape=cylinder];`)
	  // cylinder rect
	})

	topics.forEach(node => {
	  results.push(`"${node}" [shape=rect];`)
	})

	return `
	digraph G {
		label = "Kafka Streams Topology"

		${results.join('\n')}
	}
	`
}

function update() {
	change = convert(input.value)

	out.value = change

	params = {
		engine: 'dot',
		format: 'svg'
  	}

	v = Viz(change, params);

	var tmp = document.createElement('div');
	tmp.innerHTML = v;

	svg = tmp.querySelector('svg')
	dpr = window.devicePixelRatio
	canvas.width = svg.viewBox.baseVal.width * dpr | 0;
	canvas.height = svg.viewBox.baseVal.height * dpr | 0;

	rc = rough.canvas(canvas);
	ctx = rc.ctx
	ctx.scale(dpr, dpr);
  
	g = svg.querySelector('g');
	traverse(g);
}

function splitToArgs(array, delimiter) {
	return array.split(delimiter || ',').map(v => +v);
}

function traverse(child) {
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

		/*
			pts = pts.split(' ');
			for (var i = 0; i < pts.length - 1; i++) {
			var a = splitToArgs(pts[i])
			var b = splitToArgs(pts[i + 1])
			rc.line(...a, ...b, {
				fill, stroke
			});
			}
		*/
		rc.path(`M${pts}Z`, { fill, stroke });

		return;
	}

	if (child.nodeName === 'g') {
		var transform = child.getAttribute('transform');
		ctx.save();

		if (transform) {
	  		var scale = /scale\((.*)\)/.exec(transform);
	  		if (scale) {
				var args = scale[1].split(' ').map(parseFloat)
				ctx.scale(...args)
	  		}

			var rotate = /rotate\((.*)\)/.exec(transform);
			if (rotate) {
				var args = rotate[1].split(' ').map(parseFloat)
				ctx.rotate(...args)
			}
	  
			var translate = /translate\((.*)\)/.exec(transform);
			if (translate) {
				var args = translate[1].split(' ').map(parseFloat)
				ctx.translate(...args)
			}
		}

		[...child.children].forEach(traverse);

		ctx.restore();
		return;
	}
}

update();
