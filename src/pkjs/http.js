// Adaptateur XMLHttpRequest : request({method, url, headers, body}, cb(err, {status, body})).
// Le corps de réponse est du JSON décodé, ou null s'il est vide ou illisible.
function request(req, cb) {
  var xhr = new XMLHttpRequest();
  xhr.open(req.method, req.url);
  xhr.timeout = 15000;
  var headers = req.headers || {};
  Object.keys(headers).forEach(function(name) {
    xhr.setRequestHeader(name, headers[name]);
  });
  xhr.onload = function() {
    var body = null;
    try {
      body = xhr.responseText ? JSON.parse(xhr.responseText) : null;
    } catch (e) {
      body = null;
    }
    cb(null, { status: xhr.status, body: body });
  };
  xhr.onerror = xhr.ontimeout = function() {
    cb({ kind: 'network' });
  };
  xhr.send(req.body === undefined ? null : req.body);
}

module.exports = request;
