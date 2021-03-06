// @remove-on-eject-begin
/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
// @remove-on-eject-end
'use strict';

// Do this as the first thing so that any code reading it knows the right env.
process.env.BABEL_ENV = 'development';
process.env.NODE_ENV = 'development';

// Makes the script crash on unhandled rejections instead of silently
// ignoring them. In the future, promise rejections that are not handled will
// terminate the Node.js process with a non-zero exit code.
process.on('unhandledRejection', err => {
  throw err;
});

// Ensure environment variables are read.
require('../config/env');

const fs = require('fs');
const chalk = require('chalk');
const webpack = require('webpack');
const WebpackDevServer = require('webpack-dev-server');
const clearConsole = require('react-dev-utils/clearConsole');
const checkRequiredFiles = require('react-dev-utils/checkRequiredFiles');
const {
  choosePort,
  createCompiler,
  prepareProxy,
  prepareUrls,
} = require('react-dev-utils/WebpackDevServerUtils');
const openBrowser = require('react-dev-utils/openBrowser');
const configureKinopsProxy = require('./kinops-utils/configureKinopsProxy');
const paths = require('../config/paths');
const config = require('../config/webpack.config.dev');
const createDevServerConfig = require('../config/webpackDevServer.config');

const useYarn = fs.existsSync(paths.yarnLockFile);
const isInteractive = process.stdout.isTTY;

// Warn and crash if required files are missing
if (!checkRequiredFiles([paths.appIndexJs])) {
  process.exit(1);
}

// Tools like Cloud9 rely on this.
const DEFAULT_PORT = parseInt(process.env.PORT, 10) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

if (process.env.HOST) {
  console.log(
    chalk.cyan(
      `Attempting to bind to HOST environment variable: ${chalk.yellow(
        chalk.bold(process.env.HOST)
      )}`
    )
  );
  console.log(
    `If this was unintentional, check that you haven't mistakenly set it in your shell.`
  );
  console.log(`Learn more here: ${chalk.yellow('http://bit.ly/2mwWSwH')}`);
  console.log();
}

// We attempt to use the default port but if it is busy, we offer the user to
// run on a different port. `choosePort()` Promise resolves to the next free port.
choosePort(HOST, DEFAULT_PORT)
  // Customizations for kinops.io, we add an extra step at start up that checks
  // for the config.json file and if its not present it prompts the user for
  // configuration values and then creates the file.
  .then(configureKinopsProxy(paths.appConfig))
  .then(kinopsConfig => {
    const port = kinopsConfig ? kinopsConfig.port : null;
    if (!kinopsConfig || !port) {
      // We have not found a port or the kionps configuration was not completed.
      return;
    }
    const protocol = process.env.HTTPS === 'true' ? 'https' : 'http';
    const appName = require(paths.appPackageJson).name;
    const urls = prepareUrls(protocol, HOST, port);
    // Create a webpack compiler that is configured with custom messages.
    const compiler = createCompiler(webpack, config, appName, urls, useYarn);
    // Load proxy config
    const proxySetting = require(paths.appPackageJson).proxy;
    // Customization for kinops.io, we do not support configuring the dev server
    // proxy in the package.json because we set it up to work specifically with
    // kinops.io
    if (proxySetting) {
      console.log(
        chalk.red(
          `When using kinops-react-scripts the dev server proxy cannot be
        configured using the "proxy" package.json property. By default the dev
        server is configured to use a proxy that works with kinops.io. Settings
        to configure the connection to kinops.io are defined in the config.js
        file in the root of the project.`.replace(/\n\s*/g, ' ')
        )
      );
      process.exit();
    }
    // Hardcode the proxy settings (with a couple of configurable properties
    // that can be defined in the config.js file).
    const kinopsProxySetting = {
      '^((?!/sockjs-node/\\d{3}/\\w{8}/websocket).)*$': {
        target: kinopsConfig.kineticWebserver,
        headers: {
          'X-Webpack-Bundle-Name': kinopsConfig.bundleName,
          'X-Webpack-Kinetic-Webserver': kinopsConfig.kineticWebserver,
        },
        secure: false,
        autoRewrite: true,
        protocolRewrite: 'http',
        ws: true,
      },
    };
    const proxyConfig = prepareProxy(kinopsProxySetting, paths.appPublic);
    // Serve webpack assets generated by the compiler over a web sever.
    const serverConfig = createDevServerConfig(
      proxyConfig,
      urls.lanUrlForConfig
    );
    const devServer = new WebpackDevServer(compiler, serverConfig);
    // Launch WebpackDevServer.
    devServer.listen(port, HOST, err => {
      if (err) {
        return console.log(err);
      }
      if (isInteractive) {
        clearConsole();
      }
      console.log(chalk.cyan('Starting the development server...\n'));
      openBrowser(urls.localUrlForBrowser);
    });

    ['SIGINT', 'SIGTERM'].forEach(function(sig) {
      process.on(sig, function() {
        devServer.close();
        process.exit();
      });
    });
  })
  .catch(err => {
    if (err && err.message) {
      console.log(err.message);
    }
    process.exit(1);
  });
