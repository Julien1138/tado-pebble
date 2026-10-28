// J-04 Cache : conserve chaque réponse avec l'heure de son obtention, dans le stockage du
// téléphone, et sert les âges. Dépendances : storage {get, set, remove}, now().
var PREFIX = 'tado.cache.';

function createCache(deps) {
  var storage = deps.storage;
  var now = deps.now;

  function read(key) {
    try {
      return JSON.parse(storage.get(PREFIX + key));
    } catch (e) {
      return null;
    }
  }

  // Rend la donnée si elle a moins de ttlMs (sauf force), sinon la demande à loader(cb).
  // Si loader échoue et qu'une copie existe, rend la copie périmée : source 'stale'.
  // cb(err, data, {ageSeconds, source: 'cache' | 'live' | 'stale'}).
  function fetch(key, ttlMs, force, loader, cb) {
    var entry = read(key);
    var age = entry ? now() - entry.at : 0;
    if (entry && !force && age < ttlMs) {
      return cb(null, entry.data, { ageSeconds: Math.round(age / 1000), source: 'cache' });
    }
    loader(function(err, data) {
      if (err) {
        if (entry) {
          return cb(null, entry.data, { ageSeconds: Math.round(age / 1000), source: 'stale', error: err });
        }
        return cb(err);
      }
      storage.set(PREFIX + key, JSON.stringify({ at: now(), data: data }));
      cb(null, data, { ageSeconds: 0, source: 'live' });
    });
  }

  // Efface tout (délier, TPB-CPT-004).
  function clear(keys) {
    keys.forEach(function(key) {
      storage.remove(PREFIX + key);
    });
  }

  return { fetch: fetch, clear: clear };
}

module.exports = createCache;
