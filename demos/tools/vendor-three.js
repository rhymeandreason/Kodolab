#!/usr/bin/env node
/* tools/vendor-three.js: build lib/three.r<N>.min.js, the global-script three.js every
 * classic page loads.
 *
 *   node tools/vendor-three.js [version]      default: the version lab/page.js pins
 *
 * three.js stopped shipping a global build at r160, and the kit stack is globals with a load
 * order and no build. This bundles the ES module into one classic script that defines THREE,
 * plus the two things every page here wants from it:
 *
 *   THREE.OrbitControls        from examples/jsm, where r128 pages took examples/js
 *   ColorManagement off        a raw hex means what it meant on r128, as in lab/core/three-compat.js
 *
 * THREE is a plain object, not the frozen module namespace, so a script may add to it.
 * Needs npm and the network; installs three and esbuild into a temp folder and leaves the
 * repo's node_modules alone. After a version change, rename the file's references:
 * kit/app.js ORDER, and every page's tag.
 */
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const { execFileSync } = require('child_process');

const demos = path.join(__dirname, '..');
const pinned = /THREE_VERSION = '([0-9.]+)'/.exec(fs.readFileSync(path.join(demos, 'lab', 'page.js'), 'utf8'))[1];
const version = process.argv[2] || pinned;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vendor-three-'));
const run = (cmd, args) => execFileSync(cmd, args, { cwd: tmp, stdio: 'inherit' });

fs.writeFileSync(path.join(tmp, 'package.json'), '{"private":true}');
run('npm', ['i', '--no-audit', '--no-fund', '--silent', 'three@' + version, 'esbuild']);
fs.writeFileSync(path.join(tmp, 'entry.js'), `
import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
T.ColorManagement.enabled = false;
globalThis.THREE = Object.assign({}, T, { OrbitControls });
`);
const rev = /"version":\s*"0\.(\d+)/.exec(fs.readFileSync(path.join(tmp, 'node_modules/three/package.json'), 'utf8'))[1];
const out = path.join(demos, 'lib', `three.r${rev}.min.js`);
run(path.join(tmp, 'node_modules/.bin/esbuild'), ['entry.js', '--bundle', '--minify', '--format=iife', '--target=es2020',
  '--legal-comments=none', `--banner:js=/* three.js ${version}, MIT, (c) three.js authors. Built by tools/vendor-three.js; do not edit. */`,
  '--outfile=' + out]);
fs.rmSync(tmp, { recursive: true, force: true });
console.log(out, (fs.statSync(out).size / 1024 | 0) + ' KB');
