'use strict';

const cluster = require('cluster');
const os = require('os');
const debug = require('debug')('sticky:worker');

const sticky = require('../sticky-session');
const Master = sticky.Master;

function listen(server, port, options) {
  if (!options) {
    options = {};
  }

  if (cluster.isMaster) {
    const workerCount = options.workers || os.cpus().length;

    const master = new Master(workerCount, options.env);
    master.listen(port);
    master.once('listening', () => {
      server.emit('listening');
    });
    return false;
  }

  // Override close callback to gracefully close server
  const oldClose = server.close;
  server.close = () => {
    debug('graceful close');
    process.send({ type: 'close' });
    return oldClose.apply(this, arguments);
  };

  process.on('message', (msg, socket) => {
    if (msg !== 'sticky:balance' || !socket) {
      return;
    }

    debug('incoming socket');
    server._connections++;
    socket.server = server;
    server.emit('connection', socket);
  });
  return true;
}

exports.listen = listen;
