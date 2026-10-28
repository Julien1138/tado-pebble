var test = require('node:test');
var assert = require('node:assert/strict');
var cp = require('node:child_process');
var os = require('node:os');
var path = require('node:path');

// La reconnaissance de gestes (src/c/gesture.c) n'a pas de dépendance au SDK : on la compile
// avec le compilateur de l'ordinateur et on lance un programme d'essai.
test('gestes tactiles : pas, tap, lignes touchées', function(t) {
  var cc = cp.spawnSync('cc', ['--version']);
  if (cc.error) {
    return t.skip('pas de compilateur C sur cette machine');
  }
  var root = path.join(__dirname, '..');
  var out = path.join(os.tmpdir(), 'tado-gesture-test-' + process.pid);
  var build = cp.spawnSync('cc', ['-Wall', '-Werror', '-I', path.join(root, 'src/c'),
    path.join(root, 'src/c/gesture.c'), path.join(root, 'test/c/gesture_test.c'), '-o', out]);
  assert.equal(build.status, 0, String(build.stderr));
  var run = cp.spawnSync(out);
  assert.equal(run.status, 0, String(run.stderr));
  assert.match(String(run.stdout), /ok/);
});
