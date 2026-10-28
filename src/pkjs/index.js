var http = require('./http');
var storage = {
  get: function(key) { return localStorage.getItem(key); },
  set: function(key, value) { localStorage.setItem(key, value); },
  remove: function(key) { localStorage.removeItem(key); }
};
var now = function() { return Date.now(); };

var link = require('./link')({
  http: http, storage: storage, now: now,
  setTimer: function(fn, ms) { return setTimeout(fn, ms); },
  clearTimer: function(id) { clearTimeout(id); }
});
var client = require('./tado')({ http: http, link: link });
var cache = require('./cache')({ storage: storage, now: now });
var app = require('./app')({
  messenger: require('./messaging')({ pebble: Pebble }),
  link: link,
  home: require('./home')({ client: client, cache: cache }),
  views: require('./views'),
  cache: cache,
  openUrl: function(url) { Pebble.openURL(url); }
});

Pebble.addEventListener('appmessage', function(e) {
  app.onMessage(e.payload);
});

// Prévient la montre que le pkjs peut recevoir ses demandes.
Pebble.addEventListener('ready', function() {
  Pebble.sendAppMessage({ MsgType: require('./protocol').MSG_READY },
    function() {},
    function(e) { console.log('prêt refusé ' + JSON.stringify(e)); });
});
