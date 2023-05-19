#!/usr/bin/env node
/* eslint-disable no-case-declarations */
/* eslint-disable indent */
/* eslint-disable no-undef */
/* eslint-disable-next-line no-case-declarations */
import isValidHostname from 'is-valid-hostname';

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { homedir } from 'os';
import MaximoConfig from './maximo/maximo-config.js';
import MaximoClient from './maximo/maximo-client.js';
import format from 'xml-formatter';

const yarg = yargs(hideBin(process.argv));
const supportedVersions = ['7608', '7609', '76010', '76011', '7610', '7611', '7612', '7613', '8300', '8400', '8500'];
var installOrUpgrade = true;

// Command line options
const deploy = {
    command: 'deploy',
    desc: 'Deploy a single script, screen or inspection form definition or all the scripts, screens or inspection form definitions in a directory.',
    builder: (yargs) => yargs
        .option('deleteAll', {
            desc: 'Indicates if any script not in the current deploy directory, but on the server, will be deleted from the server. This option is may be destructive, the default is false. (Does not apply to screens or inspection forms)',
            type: 'boolean'
        })
        .option('deleteList', {
            desc: 'Path to a file that contains a JSON list of the scripts on the server to delete if they exist, the default is delete.json. (Does not apply to screens or inspection forms)',
            type: 'boolean'
        })
        .option('directory', {
            desc: 'The directory containing the scripts, screen or inspection form definitions to deploy.',
            type: 'string',
            alias: 'd',
            global: false
        })
        .option('file', {
            desc: 'The path to a single script, screen or inspection form definition file to deploy, if a relative path is provided it is relative to the --directory argument path.',
            type: 'string',
            alias: 'f',
            global: false
        })
        .option('recursive', {
            desc: 'Indicates if subdirectories will be included when deploying all scripts, screen or inspection form definitions, the default is true.',
            type: 'boolean',
            alias: 'r'
        })
};
const encrypt = {
    command: 'encrypt',
    desc: 'Encrypt the settings password.'
};
const extract = {
    command: 'extract',
    desc: 'Extract script, screen or inspection form definitions to a local directory.',
    builder: (yargs) => yargs
        .option('directory', {
            desc: 'The directory to extract the scripts, screens or inspection forms to, defaults is the current directory.',
            type: 'string',
            alias: 'd',
            global: false
        })
        .option('overwrite', {
            desc: 'Overwrite existing files if different from the server, default is true.',
            type: 'boolean',
            alias: 'o',
            global: false
        })
        .option('type', {
            desc: 'The type of object to extract, "script", "screen" of "form". Defaults to "script".',
            type: 'string',            
            global: false
        })
};
const streamLog = {
    command: 'log',
    desc: 'Stream the Maximo log to the console.',
    builder: (yargs) => yargs
        .option('log-timeout', {
            desc: 'Number of seconds between logging requests, the default is 30.',
            type: 'number'
        })
};

const argv = yarg
    .usage('Usage: $0 <command> [options]')
    .option('allow-untrusted-certs', {
        desc: 'Allow untrusted SSL certificates.',
        type: 'boolean'
    })
    .option('apikey', {
        desc: 'The Maximo API key that will be used to access Maximo. If provided, the user name and password are ignored if configured.',
        type: 'string',
        alias: 'a'
    })
    .option('ca', {
        desc: 'Path to the Maximo server certificate authority (CA) if it is not part of the system CA chain.',
        type: 'string'
    })
    .option('context', {
        desc: 'The part of the URL that follows the hostname, default is maximo.',
        type: 'string',
        alias: 'c'
    })
    .option('host', {
        desc: 'The Maximo host name or IP address *without* the http/s protocol prefix. .',
        type: 'string',
        alias: 'h'
    })
    .option('install', {
        desc: 'Indicates if the utility scripts should install and upgrade automatically, default is true.',
        type: 'boolean',
        alias: 'i'
    })
    .option('key', {
        desc: 'The path to the encryption key for the settings encrypted values. A relative path is relative to the settings.json file directory.',
        type: 'string',
        alias: 'k'
    })
    .option('maxauth', {
        desc: 'Force native Maximo authentication, default is false.',
        type: 'boolean'
    })
    .option('password', {
        desc: 'The Maximo user password.',
        type: 'string',
        alias: 'passwd'
    })
    .option('port', {
        desc: 'The Maximo server port, defaults to 80 if the --ssl argument is false, 443 if the --ssl argument is true.',
        type: 'number',
        alias: 'p'
    })
    .option('settings', {
        desc: 'The path to the settings file, default is settings.json.',
        type: 'string',
        alias: 's',
        default: './settings.json'
    })
    .option('ssl', {
        desc: 'Indicates if SSL will be used, defaults to true.',
        type: 'boolean'
    })
    .option('timeout', {
        desc: 'The connection timeout in seconds, default is 30 seconds.',
        type: 'number',
        alias: 't'
    })
    .option('username', {
        desc: 'The Maximo user name.',
        type: 'string',
        alias: 'u'
    })
    .command(encrypt)
    .command(extract)
    .command(deploy)
    .command(streamLog)
    .demandCommand(1, 1, 'Either the "encrypt", "extract", "deploy", or "log" command must be provided.', 'Only one command can be provided, either "encrypt", "extract", "deploy", or "log".')
    .help()
    .strict()
    .argv;

class Configuration {
    constructor(args) {
        let settings = {
            allowUntrustedCerts: false,
            apikey: undefined,
            ca: undefined,
            context: 'maximo',
            maxauth: false,
            host: undefined,
            password: undefined,
            port: undefined,
            ssl: true,
            key: homedir() + path.sep + '.settings.json.key',
            timeout: 30,
            username: undefined,
            install: true,
            deploy: {
                file: undefined,
                recursive: true,
                directory: './',
                deleteAll: false,
                deleteList: 'delete.json'
            },
            log: {
                timeout: 30
            },
            extract: {
                directory: './',
                overwrite: true,
                type: 'script'
            }
        };
        if (args.settings) {
            if (fs.existsSync(args.settings)) {
                try {
                    settings = Object.assign(settings, JSON.parse(fs.readFileSync(args.settings)));
                    this.settingsFile = args.settings;
                } catch (error) {
                    if (error instanceof SyntaxError) {
                        console.error(`The settings file ${args.settings} exists, but is not a valid JSON format.`);
                    } else {
                        console.error(`An error occurred reading ${args.settings}, ${error.message}`);
                    }
                    errorExit();
                }
            } else {
                if (args.settings !== './settings.json') {
                    console.error(`The settings file ${args.settings} cannot be read.`);
                    errorExit();
                }
            }
        }

        this.command = argv._[0];

        this.allowUntrustedCerts = this.__selectCLIIfDefined(args['allow-untrusted-certs'], settings.allowUntrustedCerts, false);
        this.apikey = this.__selectCLIIfDefined(args.apikey, settings.apikey);
        this.ca = this.__getFileContentsOrUndefined(this.__selectCLIIfDefined(args.ca, settings.ca));
        this.context = this.__selectCLIIfDefined(args.context, settings.context);
        this.maxauth = this.__selectCLIIfDefined(args.maxauth, settings.maxauth);
        this.host = this.__selectCLIIfDefined(args.host, settings.host);
        this.host = this.__selectCLIIfDefined(args.host, settings.host);
        this.password = this.__selectCLIIfDefined(args.password, settings.password);
        this.port = this.__selectCLIIfDefined(args.port, settings.port);
        this.ssl = this.__selectCLIIfDefined(args.ssl, settings.ssl);
        this.timeout = this.__selectCLIIfDefined(args.timeout, settings.timeout);
        this.username = this.__selectCLIIfDefined(args.username, settings.username);
        this.install = this.__selectCLIIfDefined(args.install, settings.install);
        this.key = this.__selectCLIIfDefined(args.key, settings.key);

        switch (this.command) {
            case 'deploy':
                this.file = this.__selectCLIIfDefined(args.file, settings.deploy.file);
                this.recursive = this.__selectCLIIfDefined(args.recursive, settings.deploy.recursive);
                this.directory = this.__selectCLIIfDefined(args.directory, settings.deploy.directory);
                this.deleteAll = this.__selectCLIIfDefined(args.deleteAll, settings.deploy.deleteAll);
                this.deleteList = this.__selectCLIIfDefined(args.deleteList, settings.deploy.deleteList);
                break;
            case 'log':
                this.logTimeout = this.__selectCLIIfDefined(args['log-timeout'], settings.log.timeout);
                break;
            case 'extract':
                this.directory = this.__selectCLIIfDefined(args.directory, settings.extract.directory);
                this.overwrite = this.__selectCLIIfDefined(args.overwrite, settings.extract.overwrite);
                this.type = this.__selectCLIIfDefined(args.type, settings.extract.type);
                break;
        }

        if (typeof this.port === 'undefined') {
            this.port = this.ssl ? 443 : 80;
        }
    }

    validate() {
        try {
            switch (this.command) {
                case 'encrypt':
                    if (typeof this.settingsFile === 'undefined') {
                        console.error('The settings file must be provided to encrypt the password.');
                        errorExit();
                    }
                    try {
                        let tmpSettings = JSON.parse(fs.readFileSync(this.settingsFile));
                        const password = tmpSettings.password;
                        const apikey = tmpSettings.apikey;
                        if ((password === 'undefined' || !password) && (typeof apikey === 'undefined' || !apikey)) {
                            console.error(`Neither an apikey or password is not specified in the settings file ${this.settingsFile}. There is no value to encrypt.`);
                            errorExit();
                        } else if ((password && password.startsWith('{encrypted}') && !apikey)) {
                            console.error(`The password in ${this.settingsFile} is already encrypted and no apikey is present to encrypt, to re-encrypt the password reset the password to plain text and try again.`);
                            errorExit();
                        } else if ((apikey && apikey.startsWith('{encrypted}') && !password)) {
                            console.error(`The apikey in ${this.settingsFile} is already encrypted and no password is present to encrypt, to re-encrypt the apikey reset the apikey to plain text and try again.`);
                            errorExit();
                        } else if ((apikey && apikey.startsWith('{encrypted}') && password && password.startsWith('{encrypted}'))) {
                            console.error(`The apikey and password in ${this.settingsFile} are already encrypted, to re-encrypt the apikey or password reset the apikey or password to plain text and try again.`);
                            errorExit();
                        }
                    } catch (error) {
                        if (error instanceof SyntaxError) {
                            console.error(`The settings file ${this.settingsFile} exists, but is not a valid JSON format.`);
                        } else {
                            console.error(`An error occurred reading ${this.settingsFile}, ${error}`);
                        }
                        errorExit();
                    }
                    break;
                case 'extract':
                    decryptSettings(this);
                    this.__validateCommon();
                    if (!fs.existsSync(this.directory)) {
                        throw new Error(`The script extract directory ${this.directory} does not exist.`);
                    }

                    break;
                case 'deploy':
                    decryptSettings(this);
                    this.__validateCommon();

                    let hasDirectory = typeof this.directory === 'undefined' || !this.directory;
                    let hasFile = typeof this.file !== 'undefined' && this.file;
                    let isAbsolute = hasFile ? path.isAbsolute(this.file) : false;
                    if (hasDirectory) {
                        if (hasFile) {
                            throw new Error('Neither a directory nor a file was provided to deploy. Either a directory or a file is required.');
                        } else if (!isAbsolute) {
                            throw new Error(`The file ${this.file} is relative but a directory has not be provided.  A directory is required for files with a relative path.`);
                        }
                    }

                    if (hasDirectory && !fs.existsSync(this.directory)) {
                        throw new Error(`The script extract directory ${this.directory} does not exist.`);
                    }

                    if (hasFile) {
                        const file = isAbsolute ? path.resolve(this.file) : path.resolve(this.directory, this.file);
                        if (!fs.existsSync(file)) {
                            throw new Error(`The provided script file ${file} does not exist.`);
                        }

                        if (!file.endsWith('.py') && !file.endsWith('.js') && !file.endsWith('.xml') && !file.endsWith('.json')) {
                            throw new Error(`Only .js, .py, xml or json files can be deployed. The file ${file} does not meet this requirement.`);
                        }
                    }

                    break;
                case 'log':
                    decryptSettings(this);
                    this.__validateCommon();
                    break;
            }
            return this;
        } catch (error) {
            console.error(`${error.message}`);
            errorExit();
        }
    }

    __validateCommon() {
        if (typeof this.host === 'undefined' || !this.host) {
            throw new Error('A host name or IP address is required.');
        } else {
            if (!isValidHostname(this.host)) {
                throw new Error(`${this.host} is not a valid host name or IP address.`);
            }
        }

        if ((typeof this.apikey === 'undefined' || !this.apikey) && ((typeof this.username == 'undefined' || !this.username) || (typeof this.password == 'undefined' || !this.password))) {
            throw new Error('An apikey or username and password are required to connect to Maximo.');
        }

        if (this.port <= 0 || this.port > 65535 || !Number.isInteger(this.port)) {
            throw new Error(`The port number ${this.port} must be a positive integer between 1 and 65535.`);
        }

        if (typeof this.ca !== 'undefined' && !this.ca) {
            if (!fs.existsSync(this.ca)) {
                throw new Error(`The CA file ${this.ca} cannot be read.`);
            }
        }

        if (this.timeout < 0 || this.timeout > 300 || !Number.isInteger(this.timeout)) {
            throw new Error(`The connection timeout is ${this.timeout}, it must be a positive integer between 1 and 300.`);
        }

        if (typeof this.logTimeout !== 'undefined' && (this.logTimeout < 30 || this.logTimeout > 300 || !Number.isInteger(this.logTimeout))) {
            throw new Error(`The logging timeout is ${this.logTimeout}, it must be a positive integer between 30 and 300.`);
        }
    }

    __selectCLIIfDefined(clia, setting) {
        return typeof clia !== 'undefined' ? clia : setting;
    }

    __getFileContentsOrUndefined(file) {
        if (typeof file !== 'undefined' && file) {
            let file = path.isAbsolute(file) ? path.resolve(config.file) : path.resolve('./', config.file);
            if (fs.existsSync(file)) {
                return fs.readFileSync(file);
            } else {
                console.warn(`Could not load file ${file}`);
            }
        }

        return undefined;
    }
}

const config = new Configuration(argv).validate();

let client = undefined;
installOrUpgrade = config.install;

switch (config.command) {
    case 'encrypt':
        try {
            encryptSettings(config);
            console.log(`The password and apikey if present have been encrypted in the ${config.settingsFile} settings file.`);
        } catch (error) {
            console.error('Error encrypting settings file. ' + error);
            errorExit();
        }
        exit();
        break;
    case 'deploy':
        try {
            client = new MaximoClient(getMaximoConfig(config));
            let deployedScripts = [];
            let noScriptName = false;
            if (await (login(client))) {

                let deployFile = async function (file) {
                    try {
                        let fileContent = fs.readFileSync(file, 'utf8');
                        let result;
                        if (file.endsWith('.xml')) {
                            result = await client.postScreen(fileContent);
                        } else if (file.endsWith('.json')) {                            
                            result = await client.postForm(JSON.parse(fileContent));
                        } else {
                                                        
                            let deployFileName = file.substring(0, file.lastIndexOf('.')) + '-deploy' + file.substring(file.lastIndexOf('.'));
                            
                            var scriptDeploy;
                            if (fs.existsSync(deployFileName)) {
                                scriptDeploy = fs.readFileSync(deployFileName);
                            }

                            result = await client.postScript(fileContent, file, scriptDeploy);
                        }
                        if (result) {
                            if (result.status === 'error') {
                                if (result.message) {
                                    throw new Error(result.message);
                                } else if (result.cause) {
                                    throw new Error(`Error: ${JSON.stringify(result.cause)}`);
                                } else {
                                    throw new Error('An unknown error occurred: ' + JSON.stringify(result));
                                }
                            } else {
                                
                                if (typeof result.scriptName !== 'undefined' && result.scriptName) {
                                    deployedScripts.push(result.scriptName.toLowerCase());
                                    console.log(`Deployed ${file} as ${result.scriptName}`);
                                } else {
                                    if (file.endsWith('.py') || file.endsWith('.js')) {
                                        noScriptName = true;
                                        // console.log(`Deployed ${file} but a script name was not returned.`);
                                    } else {
                                        console.log(`Deployed ${file} to Maximo.`);
                                    }
                                }
                            }
                        } else {
                            throw new Error('Did not receive a response from Maximo.');
                        }
                    } catch (error) {
                        if (error && error.message) {
                            console.error(error.message);
                        } else {
                            console.error(error.message);
                        }

                    }
                };

                if (typeof config.file !== 'undefined' && config.file) {
                    let file = path.isAbsolute(config.file) ? path.resolve(config.file) : path.resolve(config.directory, config.file);
                    await deployFile(file);
                } else {
                    let deployDir = async function (directory, deployFile) {
                        await asyncForEach(fs.readdirSync(directory, { withFileTypes: true }), async (file) => {
                            if (config.recursive && file.isDirectory()) {
                                await deployDir(path.resolve(directory, file.name), deployFile);
                            } else {
                                if (!file.isDirectory()) {
                                    if (file.name.endsWith('.js') || file.name.endsWith('.py') || file.name.endsWith('.xml') || file.name.endsWith('.json')) {
                                        try {
                                            await deployFile(path.resolve(directory, file.name));
                                        } catch (error) {
                                            console.error(error);
                                        }
                                    }
                                }
                            }
                        });
                    };

                    await deployDir(config.directory, deployFile);

                    if (config.deleteAll) {
                        if (!noScriptName) {
                            let allScripts = await client.getAllScriptNames();
                            var undeployedScripts = allScripts.filter((i) => {
                                return deployedScripts.indexOf(i) < 0;
                            });

                            await asyncForEach(undeployedScripts, async (script) => { await client.deleteScriptIfExists(script); });
                        } else {
                            console.warn('The delete all flag was set but one or more of the script name was not returned after deploying the script. Deleting all is an unsafe operation.  Ensure you have at least version 1.15.0 of the SHARPTREE.AUTOSCRIPT.DEPLOY script deployed.')
                        }
                    } else if (typeof config.deleteList !== 'undefined' && config.deleteList && fs.existsSync(config.deleteList)) {
                        let deleteList = JSON.parse(fs.readFileSync(config.deleteList));
                        if (typeof deleteList !== 'undefined' && Array.isArray(deleteList)) {
                            await asyncForEach(deleteList, async (script) => { await client.deleteScriptIfExists(script); });
                        }
                    }
                }
            } else {
                console.error('Login unsuccessful, unable to login to Maximo.');
                errorExit();
            }
        } catch (error) {
            console.error('Error deploying scripts to maximo: ' + error);
            errorExit();
        } finally {
            if (typeof client !== 'undefined') {
                await client.disconnect();
            }
        }
        exit();
        break;
    case 'extract':
        try {
            client = new MaximoClient(getMaximoConfig(config));
            if (await (login(client))) {
                if (config.type == 'screen') {
                    let screenNames = await client.getAllScreenNames();
                    if (typeof screenNames !== 'undefined' && screenNames.length > 0) {
                        await asyncForEach(screenNames, async (screenName) => {
                            if (typeof screenName !== 'undefined' && screenName) {
                                let screenInfo = await client.getScreen(screenName);
                                let fileExtension = '.xml';
                                let outputFile = config.directory + '/' + screenName.toLowerCase() + fileExtension;
                                let xml = format(screenInfo.presentation);
                                if (!fs.existsSync(outputFile)) {
                                    fs.writeFileSync(outputFile, xml);
                                    console.log(`Extracted ${screenName} to ${outputFile}`);
                                } else {
                                    console.log(`Screen presentation file ${outputFile} exists and overwriting is disabled, skipping.`);
                                }                                    
                            }
                        });
                    }
                } else if (config.type == 'form') {
                    let forms = await client.getAllForms();
                    if (typeof forms !== 'undefined' && forms.length > 0) {
                        await asyncForEach(forms, async (form) => {
                            if (typeof form !== 'undefined' && form) {

                                let formInfo = await client.getForm(form.id);
                                let outputFile = config.directory + '/' + formInfo.name.toLowerCase().replaceAll(' ', '-') + '.json';
                                let source = JSON.stringify(formInfo, null, 4);

                                // if the file doesn't exist then just write it out.
                                if (!fs.existsSync(outputFile) || config.overwrite) {
                                    fs.writeFileSync(outputFile, source);
                                    console.log(`Extracted ${formInfo.name} to ${outputFile}`);
                                } else {
                                    console.log(`Inspection form file ${outputFile} exists and overwriting is disabled, skipping.`);
                                }
                            }
                        });
                    }
                } else {
                    let scriptNames = await client.getAllScriptNames();
                    if (typeof scriptNames !== 'undefined' && scriptNames.length > 0) {

                        await asyncForEach(scriptNames, async (scriptName) => {
                            if (typeof scriptName !== 'undefined' && scriptName) {

                                let scriptInfo = await client.getScript(scriptName);
                                let fileExtension = getExtension(scriptInfo.scriptLanguage);
                                let outputFile = config.directory + '/' + scriptName.toLowerCase() + fileExtension;

                                // if the file doesn't exist then just write it out.
                                if (!fs.existsSync(outputFile) || config.overwrite) {
                                    fs.writeFileSync(outputFile, scriptInfo.script);
                                    console.log(`Extracted ${scriptName} to ${outputFile}`);
                                } else {
                                    console.log(`Script file ${outputFile} exists and overwriting is disabled, skipping.`);
                                }
                            }
                        });
                    } else {
                        throw new Error('No scripts were found to extract.');
                    }
                }
            } else {
                console.error('Login unsuccessful, unable to login to Maximo.');
                errorExit();
            }
        } catch (error) {
            console.error('Error extracting scripts from maximo: ' + error);
            errorExit();
        } finally {
            if (typeof client !== 'undefined') {
                console.log('disconnecting');
                await client.disconnect();
            }
        }
        exit();
        break;
    case 'log':
        try {
            client = new MaximoClient(getMaximoConfig(config));
            if (await (login(client))) {
                await client.startLogging(config.logTimeout);
            } else {
                console.error('Login unsuccessful, unable to login to Maximo.');
                errorExit();
            }
        } catch (error) {
            if (typeof error !== 'undefined' && typeof error.toJSON === 'function') {
                let jsonError = error.toJSON();
                if (typeof jsonError.message !== 'undefined') {
                    console.error(jsonError.message);
                    errorExit();
                } else {
                    window.showErrorMessage(JSON.stringify(jsonError), { modal: true });
                }
            } else if (typeof error !== 'undefined' && typeof error.Error !== 'undefined' && typeof error.Error.message !== 'undefined') {
                console.error(error.Error.message);
            } else if (error instanceof Error) {
                console.error(error.message);
            } else {
                console.error(error);
            }
            errorExit();
        } finally {
            if (typeof client !== 'undefined') {
                console.log('disconnecting');
                await client.disconnect();
            }

        }
        exit();
        break;
    default:
        console.error(`${config.command} is not a recognized command.`);
        errorExit();
}

async function login(client) {
    let logInSuccessful = await client.connect().then(() => {
        return true;
    }, (error) => {
        // show the error message to the user.
        if (error.message.includes('ENOTFOUND')) {
            throw new Error('The host name "' + client.config.host + '" cannot be found.');
        } else if (typeof error.code !== 'undefined' && error.code == 'ECONNRESET') {
            throw new Error(error.message);
        } else if (error.message.includes('ECONNREFUSED')) {
            throw new Error('Connection refused to host ' + client.config.host + ' on port ' + client.config.port);
        } else if (error.isAxiosError) {
            if (typeof error.response !== 'undefined' && typeof error.response.status !== 'undefined' && error.response.status == 401) {
                throw new Error('User name and password combination are not valid. Try again.');
            } else {
                throw error;
            }
        } else {
            throw new Error(error.message);
        }
    });

    if (logInSuccessful) {
        logInSuccessful = await versionSupported(client);
    }

    if (logInSuccessful) {
        if (await installed(client) && await upgraded(client)) {
            return true;
        } else {
            return false;
        }
    } else {
        return false;
    }
}

async function versionSupported(client) {
    var version = await client.maximoVersion();

    if (!version) {
        throw new Error('Could not determine the Maximo version. Only Maximo 7.6.0.8 and greater are supported');
    } else {
        var checkVersion = version.substr(1, version.indexOf('-') - 1);
        if (!supportedVersions.includes(checkVersion)) {
            throw new Error(`The Maximo version ${version} is not supported.`);
        }
    }
    return true;
}

async function installed(client) {
    if (!await client.installed()) {
        if (installOrUpgrade) {
            var result = await client.installOrUpgrade(true);
            if (result && result.status === 'error') {
                throw new Error(result.message);
            } else {
                return true;
            }
        } else {
            throw new Error(`The server ${client.config.host} does not have the required scripts installed and automatic install is turned off.`);
        }
    } else {
        return true;
    }
}

async function upgraded(client) {
    if (await client.upgradeRequired()) {
        if (installOrUpgrade) {
            var result = await client.installOrUpgrade();
            if (result && result.status === 'error') {
                throw new Error(result.message);
            } else {
                return true;
            }

        } else {
            throw new Error(`The server ${client.config.host} has the required scripts but they are out of date and automatic install is turned off.`);
        }
    } else {
        return true;
    }
}


function getMaximoConfig(config) {
    return new MaximoConfig({
        username: config.username,
        password: config.password,
        useSSL: config.ssl,
        host: config.host,
        port: config.port,
        context: config.context,
        connectTimeout: config.timeout * 1000,
        responseTimeout: config.timeout * 1000,
        allowUntrustedCerts: config.allowUntrustedCerts,
        ca: config.ca,
        maxauthOnly: config.maxauth,
        apiKey: config.apikey,
        extractLocation: (config.extract && config.extract.directory) ? config.extract.directory : undefined,
    });
}

function encryptSettings(config) {
    let settings = JSON.parse(fs.readFileSync(config.settingsFile));

    const algorithm = 'aes-256-cbc';

    const keyPath = typeof config.key !== 'undefined' && !config.key ? config.key : '.settings.json.key';

    const keyFile = path.isAbsolute(keyPath) ? keyPath : path.join(path.dirname(config.settingsFile), keyPath);

    if (!fs.existsSync(keyFile)) {
        fs.writeFileSync(keyFile, (new Buffer.from(crypto.randomBytes(16)).toString('hex') + new Buffer.from(crypto.randomBytes(32)).toString('hex')), 'utf8');
    }

    const keydata = fs.readFileSync(keyFile, 'utf8');

    const iv = Buffer.from(keydata.slice(0, 32), 'hex');
    const key = Buffer.from(keydata.slice(32), 'hex');

    if (settings.password && !settings.password.startsWith('{encrypted}')) {
        const cipher = crypto.createCipheriv(algorithm, key, iv);
        let encPassword = cipher.update(settings.password, 'utf-8', 'hex');
        encPassword += cipher.final('hex');

        settings.password = '{encrypted}' + encPassword;
    }
    if (settings.apikey && !settings.apikey.startsWith('{encrypted}')) {
        const cipher = crypto.createCipheriv(algorithm, key, iv);
        let encApiKey = cipher.update(settings.apikey, 'utf-8', 'hex');
        encApiKey += cipher.final('hex');

        settings.apikey = '{encrypted}' + encApiKey;
    }
    fs.writeFileSync(config.settingsFile, JSON.stringify(settings, null, 4));
}

function decryptSettings(config) {

    // if a configuration is not provided return.
    if (typeof config === 'undefined' || !config) {
        return;
    }

    // if the configuration did not come from a settings file then return.
    if (typeof config.settingsFile === 'undefined' || !config.settingsFile) {
        return;
    }

    // if the password or apikey are not encrypted then return.
    if ((typeof config.password === 'undefined' || !config.password || !config.password.startsWith('{encrypted}')) && (typeof config.apikey === 'undefined' || !config.apikey || !config.apikey.startsWith("{encrypted}"))) {
        return;
    }

    const algorithm = 'aes-256-cbc';
    const keyFile = path.join(path.dirname(config.settingsFile), '.settings.json.key');
    if (!fs.existsSync(keyFile)) {
        throw new Error(`The apikey or password cannot be decrypted because the key file ${keyFile} cannot be read.`);
    }

    const keydata = fs.readFileSync(keyFile, 'utf8');

    const iv = Buffer.from(keydata.slice(0, 32), 'hex');
    const key = Buffer.from(keydata.slice(32), 'hex');

    if (config.password && config.password.startsWith('{encrypted}')) {
        const decipher = crypto.createDecipheriv(algorithm, key, iv);
        let decryptedPassword = decipher.update(config.password.substring(11), 'hex', 'utf-8');
        decryptedPassword += decipher.final('utf8');
        config.password = decryptedPassword;
    }

    if (config.apikey && config.apikey.startsWith('{encrypted}')) {
        const decipher = crypto.createDecipheriv(algorithm, key, iv);
        let decryptedApiKey = decipher.update(config.apikey.substring(11), 'hex', 'utf-8');
        decryptedApiKey += decipher.final('utf8');
        config.apikey = decryptedApiKey;
    }
}

function getExtension(scriptLanguage) {
    switch (scriptLanguage.toLowerCase()) {
        case 'python':
        case 'jython':
            return '.py';
        case 'nashorn':
        case 'javascript':
        case 'emcascript':
        case 'js':
            return '.js';
        default:
            return '.unknown';
    }

}

async function asyncForEach(array, callback) {
    for (let index = 0; index < array.length; index++) {
        await callback(array[index], index, array);
    }
}

function errorExit() {
    process.exit(1);
}

function exit() {
    process.exit(0);
}