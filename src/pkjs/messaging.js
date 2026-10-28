// J-01 Messagerie : envoie les messages à la montre un à un, en attendant l'accusé de chaque
// envoi (un réessai), et abandonne la file d'une demande périmée.
// Dépendance : pebble {sendAppMessage(dict, ok, fail)}.
function createMessenger(deps) {
  var pebble = deps.pebble;
  var queue = [];
  var busy = false;
  var generation = 0;

  function pump() {
    if (busy || queue.length === 0) {
      return;
    }
    var item = queue.shift();
    busy = true;
    var mine = generation;
    var attempt = function(retries) {
      pebble.sendAppMessage(item.message, function() {
        busy = false;
        pump();
      }, function() {
        if (mine !== generation) {
          busy = false;
          return pump();
        }
        if (retries > 0) {
          return attempt(retries - 1);
        }
        // Deux échecs : la file de cette demande est abandonnée, la montre redemandera.
        queue = [];
        busy = false;
      });
    };
    attempt(1);
  }

  return {
    // Remplace la file en attente par ces messages (le message en vol n'est pas interrompu).
    replace: function(messages) {
      generation += 1;
      queue = messages.map(function(message) { return { message: message }; });
      pump();
    },
    send: function(messages) {
      messages.forEach(function(message) {
        queue.push({ message: message });
      });
      pump();
    }
  };
}

module.exports = createMessenger;
