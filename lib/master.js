
'use strict';

var cluster = require('cluster'),
    events = require('events'),
    util = require('util'),
    AccessLogger = require('./accesslogger');
    // dscmsSettings = require('/app/lib/domainConfig');

function Master(config) {
    if (!(this instanceof Master)) {
        return new Master(config);
    }

    this.config = config;

    this.lbbackends = {
            phpfpm: [ "" ],
            "dsserver": ["",""],
            "dead": {
                phpfpm: [],
                "dsserver": []
            }
    }


    var logger = new AccessLogger(config.server.accessLog);

    this.on('message', function(message) {
        console.log('message from child: ', message);
        if (typeof message == 'object') {
            
            if (message.type == 'markActive') 
                this.lbbackends[message.backendname].add( this.lbbackends.dead[message.backendname][message.backendidx].pop() )
            if (message.type == 'markDead') this.lbbackends.dead[message.backendname].add(this.lbbackends[message.backendname][message.backendidx].pop())
            return proc.send('DONE')
        }
        if (message == 'getBackends') proc.send({ "type": 3, "data": this.lbbackends });

        proc.send('Hello from master!');
    }.bind(this));
    
    this.on('exit', function () {
        logger.stop();
    });

    this.accessLog = logger.log;
}

Master.prototype = new events.EventEmitter();

Master.prototype.run = function () {
    this.spawnWorkers(this.config.server.workers);
};

Master.prototype.spawnWorkers = function (number) {
    var spawnWorker = function () {
        var worker = cluster.fork();
        worker.on('message', function (message) {
            // Gather the logs from the workers
            if (message.type === 1) {
                // normal log
                util.log('(worker #' + message.from + ') ' + message.data);
            } else if (message.type === 2) {
                // access log
                this.accessLog(message.data);
            } else if ((message.type === 3)) {
                this.lbbackends = message.data
            }
        }.bind(this));
    }.bind(this);

    // Spawn all workers
    for (var n = 0; n < number; n += 1) {
        util.log('Spawning worker #' + n);
        spawnWorker();
    }

    // When one worker is dead, let's respawn one
    cluster.on('exit', function (worker, code, signal) {
        var m = 'Worker died (pid: ' + worker.process.pid + ', suicide: ' +
                (worker.suicide === undefined ? 'false' : worker.suicide.toString());
        if (worker.suicide === false) {
            if (code !== null) {
                m += ', exitcode: ' + code;
            }
            if (signal !== null) {
                m += ', signal: ' + signal;
            }
        }
        m += '). Spawning a new one.';
        util.log(m);
        spawnWorker();
    });

    // Set an exit handler
    var onExit = function () {
        this.emit('exit');
        util.log('Exiting, killing the workers');
        for (var id in cluster.workers) {
            var worker = cluster.workers[id];
            util.log('Killing worker #' + worker.process.pid);
            worker.destroy();
        }
        process.exit(0);
    }.bind(this);
    process.on('SIGINT', onExit);
    process.on('SIGTERM', onExit);
};

module.exports = Master;