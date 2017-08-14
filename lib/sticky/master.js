'use strict';

const cluster = require('cluster');
const util = require('util');
const net = require('net');
const ip = require('ip');

const debug = require('debug')('sticky:master');

function Master(workerCount, env) {
  net.Server.call(this, {
    pauseOnConnect: true
  }, this.balance);

  this.env = env || {};

  this.seed = (Math.random() * 0xffffffff) | 0;
  this.workers = [];

  debug('master seed=%d', this.seed);

  this.once('listening', function() {
    debug('master listening on %j', this.address());

    for (let i = 0; i < workerCount; i++)
      this.spawnWorker();
  });
}
util.inherits(Master, net.Server);
module.exports = Master;

Master.prototype.hash = function hash(ip) {
  let hash = this.seed;
  for (let i = 0; i < ip.length; i++) {
    const num = ip[i];

    hash += num;
    hash %= 2147483648;
    hash += (hash << 10);
    hash %= 2147483648;
    hash ^= hash >> 6;
  }

  hash += hash << 3;
  hash %= 2147483648;
  hash ^= hash >> 11;
  hash += hash << 15;
  hash %= 2147483648;

  return hash >>> 0;
};

Master.prototype.spawnWorker = function spawnWorker() {
  const worker = cluster.fork(this.env);

  worker.on('exit', (code) => {
    debug('worker=%d died with code=%d', worker.process.pid, code);
    this.respawn(worker);
  });

  worker.on('message', (msg) => {
    // Graceful exit
    if (msg.type === 'close')
      this.respawn(worker);
  });

  debug('worker=%d spawn', worker.process.pid);
  this.workers.push(worker);
};

Master.prototype.respawn = function respawn(worker) {
  const index = this.workers.indexOf(worker);
  if (index !== -1) {
    this.workers.splice(index, 1);
  }
  this.spawnWorker();
};

Master.prototype.balance = function balance(socket) {
  const addr = ip.toBuffer(socket.remoteAddress || '127.0.0.1');
  const hash = this.hash(addr);

  debug('balacing connection %j', addr);
  this.workers[hash % this.workers.length].send('sticky:balance', socket);
};
