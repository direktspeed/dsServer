
'use strict';
var harp = require("harp");
var dsserver = require("express")();


var fs = require('fs'),
    path = require('path'),
    util = require('util'),
    http = require('http'),
    https = require('https'),
    // express = require('express')
    //httpProxy = require('http-proxy'),
//     cache = require('./cache'),
    memoryMonitor = require('./memorymonitor');

var rootDir = fs.realpathSync(__dirname + '/../');

var dssrvVersion = require(path.join(__dirname, '..', 'package.json')).version;

var logType = {
    log: 1,
    accessLog: 2
};

var log = function (msg, type) {
    // Send the log data to the master
    var message = {};
    try {
        message = {
            type: (type === undefined) ? logType.log : type,
            from: process.pid,
            data: msg
        };
        process.send(message);
    } catch (err) {
        // Cannot write on the master channel (worker is committing a suicide)
        // (from the memorymonitor), writing the log directly.
        if (message.type === 1) {
            util.log('(worker #' + message.from + ') ' + message.data);
        }
    }
};

var debug = function (debugMode) {
    return function (msg) {
        if (debugMode !== true) {
            return;
        }
        log(msg, logType.log);
    };
};

// Ignore SIGUSR
process.on('SIGUSR1', function () {});
process.on('SIGUSR2', function () {});


function Worker(config, domainSettings) {
    if (!(this instanceof Worker)) {
        return new Worker(config, domainSettings);
    }

    debug = debug(config.server.debug);
    /*
    this.cache = cache(config, {
        logHandler: log,
        debugHandler: debug
    });
    */
    this.config = config;
    // this.domainSettings = config.http.vhosts;
}

Worker.prototype.run = function () {
    this.runServer(this.config);
};

Worker.prototype.runServer = function (config) {
    
    http.globalAgent.maxSockets = config.server.maxSockets;
    https.globalAgent.maxSockets = config.server.maxSockets;

    var getRemoteAddress = function (req) {
        if (req.connection === undefined) {
            return null;
        }
        if (req.connection.remoteAddress) {
            return req.connection.remoteAddress;
        }
        if (req.connection.socket && req.connection.socket.remoteAddress) {
            return req.connection.socket.remoteAddress;
        }
        return null;
    };

    var staticDir = config.server.staticDir || [ rootDir, 'static' ].join('/');

    
    var errorMessage = function (res, message, code) {
        // Flag the Response to know that it's an internal error message
        res.errorMessage = true;
        if (message === undefined) {
            message = '';
        }
        code = isNaN(code) ? 400 : parseInt(code, 10);

        var staticPath = function (name) {
            return [ staticDir, '/', 'error_', name, '.html' ].join('');
        };

        var serveFile = function (filePath) {
            var stream = fs.createReadStream(filePath);
            var headers = {
                'content-type': 'text/html',
                'cache-control': 'no-cache',
                'pragma': 'no-cache',
                'expires': '-1'
            };
            if (res.debug === true) {
                headers['x-debug-error'] = message;
                headers['x-debug-version-dssrv'] = dssrvVersion;
            }
            res.writeHead(code, headers);
            stream.on('data', function (data) {
                res.write(data);
            });
            stream.on('error', function () {
                res.end();
            });
            stream.on('end', function () {
                res.end();
            });
        };

        var serveText = function () {
            var headers = {
                'content-length': message.length,
                'content-type': 'text/plain',
                'cache-control': 'no-cache',
                'pragma': 'no-cache',
                'expires': '-1'
            };
            if (res.debug === true) {
                headers['x-debug-error'] = message;
                headers['x-debug-version-dssrv'] = dssrvVersion;
            }
            res.writeHead(code, headers);
            res.write(message);
            res.end();
        };

        if (code === 200) {
            // If code is 200, let's just serve the text message since
            // it's not an error...
            return serveText(message);
        }

        var errorPage = staticPath(code);
        fs.exists(errorPage, function (exists) {
            if (exists === true) {
                return serveFile(errorPage);
            }
            errorPage = staticPath('default');
            fs.exists(errorPage, function (exists) {
                if (exists === true) {
                    return serveFile(errorPage);
                }
                return serveText();
            });
        });
    };



   /*
    *   Event listener for HTTP server "error" event.
   */

  function serverOnError(error) {
    if (error.syscall !== 'listen') {
      throw error;
    }

    var bind = typeof app.get('port') === 'string'
      ? 'Pipe ' + app.get('port')
      : 'Port ' + app.get('port')

    // handle specific listen errors with friendly messages
    switch (error.code) {
      case 'EACCES':
        console.error(bind + ' requires elevated privileges');
        process.exit(1);
        break;
      case 'EADDRINUSE':
        console.error(bind + ' is already in use');
        process.exit(1);
        break;
      default:
        throw error;
    }
  }


    var httpRequestHandler = dsserver.use(function (req, res, next) {
            
            req.backends = process.send('getbackends')
            
            console.dir(this)
            /* Implament Statuc Object and on Demand Object Routing */
            var router = require("express").Router()
            // Configure the retryOnError      
            if (config.server.retryOnError) {
                req.on('retry', function () {
                    log('Retrying on ' + req.headers.host);
               //      require('./proxy.js')(req, res)
                });
            }


            /*
                We need to look if the request is for a app
                or for the http proxy

                TODO SWITCH TO EVAL to enable dynamic config passing to functions

            */
            // if req.header is not processed
            
            /*
                We need to look if the request is for a app
                or for the http proxy
                we optain that via config! we will try return the value of http.app!
            */

            if (typeof config.http.use !== 'undefined') {
                // try use alternate module path for plugins dir
                // use eache middelware
                // lb, cache, logging
                // router.use(require(req.vhosts.vhost_use)(req.vhosts.options))

            }
            // Config vhost usage
            if (typeof config.http.vhosts !== 'undefined') {
                // console.log(config.http.vhosts)
                try {
                    if (typeof config.http.vhosts[req.headers['host']] == 'undefined') req.vhosts = config.http.vhosts['default']                        
                        else req.vhosts = config.http.vhosts[req.headers['host']]
                        // console.log(config.http.vhosts[req.headers['host']].aO)
                    
                    console.log('VHOST LOG: %s, %s', typeof req.vhosts, req.headers['host'])
                    
                    // check if vhost_use has seperator , in it then do split(',')
                    // create a express router
                    if (typeof req.vhosts.use == 'object') {
                        for (var vhostsI=0; vhostsI < req.vhosts.use.length; vhostsI++) {
                            router.use(require(req.vhosts.use[vhostsI])(req.vhosts.options))
                        }
                        
                    } else {
                        router.use(require(req.vhosts.use)(req.vhosts.options))
                    }
                
                } catch (e) {
                    console.log('VHOST ERROR')
                    if (e.name == 'AssertionError') console.log('MODULE FOR VHOST NOT FOUND: ' + req.vhosts);
                     else {
                        console.log(e)
                        console.log(req.vhosts)
                        // console.log(require.resolve(req.vhosts.use))
                        // onsole.log(http.vhosts['default'])
                        // return console.log(e)
                     }
                }
                    // require('./vhosts')(req, res, config.vhosts)
            } 
    
            // Default HTTP app if not set default to error handler? from config else use harp do try catch
            if ( (typeof config.http.app !== 'undefined') && (config.http.app !== null)) {    
                try {
                    router.use(require(config.http.app)(config.http.options))
                } catch (e) {
                    console.log('MAIN APP ERROR')
                    console.log(e)
                    console.log(require.resolve(config.http.app))
                }
            }
             
            
            return router(req,res, next)
                        
            // else prepareHeader()
            // require('./proxy.js')(req, res)
    
    }.bind(this)).bind(this);

 
    var monitor = memoryMonitor({
        logHandler: log
    });

    // The handler configure the client socket for every new connection
    var tcpConnectionHandler = function (connection) {
        var remoteAddress = connection.remoteAddress,
            remotePort = connection.remotePort,
            start = Date.now();

        var getSocketInfo = function () {
            return JSON.stringify({
                remoteAddress: remoteAddress,
                remotePort: remotePort,
                bytesWritten: connection.bytesWritten,
                bytesRead: connection.bytesRead,
                elapsed: (Date.now() - start) / 1000
            });
        };

        connection.setKeepAlive(false);
        connection.setTimeout(config.server.tcpTimeout * 1000);
        connection.on('error', function (error) {
            log('TCP error from ' + getSocketInfo() + '; Error: ' + JSON.stringify(error));
        });
        connection.on('timeout', function () {
            log('TCP timeout from ' + getSocketInfo());
            connection.destroy();
        });
    };



    var counter = 0;
    var dropPrivileges = function () {
        counter--;
        // Every bind is in, we run as root, and we are asked to run as something else
        if (!counter && (process.getuid() === 0) && config.user && (config.user !== 0)) {
            log('Dropping privileges to ' + config.user + ':' + (config.group || config.user));
            process.setgid(config.group || config.user);
            process.setuid(config.user);
        }
    };

    // HTTP: Servers creation
    config.http.bind.forEach(function (options) {
        counter++;
        var httpServer = http.createServer(httpRequestHandler);
        httpServer.on('error', serverOnError);
        httpServer.on('connection', tcpConnectionHandler);
        httpServer.listen(options.port, options.address);
        monitor.addServer(httpServer);
        httpServer.once('listening', dropPrivileges);
        log('Started HTTP server on ' + options.address + ' ' + options.port);
    });

    config.https.bind.forEach(function (options) {
        counter++;
        var httpsServer = https.createServer(options, httpRequestHandler);
        httpsServer.on('connection', tcpConnectionHandler);
        httpsServer.on('upgrade', wsRequestHandler);

        httpsServer.listen(options.port, options.address);
        monitor.addServer(httpsServer);
        httpsServer.once('listening', dropPrivileges);
        log('Started HTTPs server on ' + options.address + ' ' + options.port);
    });
    
    // TCP: Servers creation

};

module.exports = Worker;