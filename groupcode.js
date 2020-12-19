

const python_snippet = `print("Hello World!")`;

let python_editor = null;
let user = null;

class Editor {
	constructor(div, mode, example) {
		this.lastValue = null;
		this.timer = null;
		this.updating = false;
		this.mode = mode;

		let textarea = document.querySelector(`${div} textarea`);
		this.editor = CodeMirror.fromTextArea(textarea, {
			lineNumbers: true,
			theme: 'dracula',
			mode,
			indentWithTabs: true
		});

		this.editor.setValue(example);
		this.lastValue = this.editor.getValue();
		this.editor.on('change', this.onChange.bind(this));
	}

	onChange() {
		if (this.updating) return;

		let newValue = this.editor.getValue();
		if (newValue === this.lastValue) return;

		this.lastValue = newValue;
		if (this.timer) clearTimeout(this.timer);
		this.timer = setTimeout(this.sendUpdate.bind(this), 100);
	}

	sendUpdate() {
		gatheract.sendMessage({
			type: this.mode,
			code: this.editor.getValue()
		});
	}

	update(code) {
		this.updating = true;
		let cursor = this.editor.getCursor();
		this.editor.setValue(code);
		this.lastValue = this.editor.getValue();
		this.editor.setCursor(cursor);
		this.updating = false;
	}

	calcPatch() {
		return JsDiff.createPatch('fileName', this.lastValue, this.editor.getValue(), '', '');
	}
}

document.addEventListener('DOMContentLoaded', async () => {
	python_editor = new Editor('#python', 'python', python_snippet);
	window.jqconsole = $('#console').jqconsole('', '>>> ');
	jqconsole.Write('Loading PyPy.js.\n\n', 'jqconsole-output');
	jqconsole.Write('It\'s big, so this might take a while...', 'jqconsole-output');

	let config = {
		appId: 'groupcode_python',
		events: {
			connected: msg => {
				user = msg.user;
			},
			channelInfo: onChannelInfo,
			appMessage: onUpdate
		}
	};
	gatheract.init(config);

	verbose_exec(
		'print "Welcome to PyPy.js!\\n";import sys;print "Python v"+sys.version',
		init_run = true
	);
});

function onUpdate(data) {
	let editor = python_editor;
	if (editor) editor.update(data.code);
}

function onChannelInfo(msg) {
	// the host should inform any new user of current state
	if (gatheract.isHost && msg.newUser) {
		if (msg.newUser.id === gatheract.user.id) return;
		setTimeout(() => {
			python_editor.sendUpdate();
		}, 500);
	}
}

function run() {

	document.getElementById('button').disabled = true;
	jqconsole.Reset();
	jqconsole.Write('exec...', 'jqconsole-output');
	var code = python_editor.editor.getValue();
	verbose_exec(code, init_run = false);
}

function verbose_exec(code, init_run) {
	$("#run_info").text("starting vm...");

	var init_start = new Date();
	window.vm = new pypyjs();

	// Send all VM output to the console.
	vm.stdout = vm.stderr = function (data) {
		jqconsole.Write(data, 'jqconsole-output');
	}
	var pseudo_status = setInterval(function () { vm.stdout("."); }, 500);
	vm.ready().then(function () {
		var duration = new Date() - init_start;
		$("#run_info").text("Init took " + human_time(duration));

		clearInterval(pseudo_status);
		jqconsole.Reset();

		// console.log("Start code:" + JSON.stringify(code));
		var start_time = new Date();
		vm.exec(code).then(function () {
			if (init_run != true) { // don't overwrite "PyPy.js init in..." info
				var duration = new Date() - start_time;
				$("#run_info").text("Ran in " + human_time(duration) + " (OK)");
			}
		}, function (err) {
			// err is an instance of pypyjs.Error
			var duration = new Date() - start_time;
			$("#run_info").text("Ran in " + human_time(duration) + " (" + err.name + ": " + err.message + "!)");
			vm.stderr(err.trace); // the human-readable traceback, as a string
		});
		document.getElementById('button').disabled = false;
	}, function (err) {
		jqconsole.Write('ERROR: ' + err);
	});
}

// based on code from http://stackoverflow.com/questions/8211744/convert-time-interval-given-in-seconds-into-more-human-readable-form
function human_time(milliseconds) {
	var temp = Math.floor(milliseconds / 1000);
	var minutes = Math.floor((temp %= 3600) / 60);
	if (minutes) {
		return minutes + 'min.'
	}
	var seconds = temp % 60;
	if (seconds) {
		return seconds + 'sec.'
	}
	return milliseconds + 'ms'
}