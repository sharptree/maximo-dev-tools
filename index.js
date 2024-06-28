#!/usr/bin/env node
/* eslint-disable no-case-declarations */
/* eslint-disable indent */
/* eslint-disable no-undef */
/* eslint-disable-next-line no-case-declarations */
import isValidHostname from "is-valid-hostname";

import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { homedir } from "os";
import MaximoConfig from "./maximo/maximo-config.js";
import MaximoClient from "./maximo/maximo-client.js";
import format from "xml-formatter";
import { parseString, Builder } from "xml2js";
import * as yauzl from "yauzl";
import archiver from "archiver";
import { PassThrough } from "stream";

const yarg = yargs(hideBin(process.argv));

var installOrUpgrade = true;

// Command line options
const deploy = {
    command: "deploy",
    desc: "Deploy a single script, screen or inspection form definition or all the scripts, screens or inspection form definitions in a directory.",
    builder: (yargs) =>
        yargs
            .option("allowAdminMode", {
                desc: "Indicates that the deployment can place the server in Admin Mode and perform a Database Configuration if required. This option may cause a system disruption, the default is false.",
                type: "boolean"
            })
            .option("deleteAll", {
                desc: "Indicates if any script not in the current deploy directory, but on the server, will be deleted from the server. This option is may be destructive, the default is false. (Does not apply to screens or inspection forms)",
                type: "boolean"
            })
            .option("deleteList", {
                desc: "Path to a file that contains a JSON list of the scripts on the server to delete if they exist, the default is delete.json. (Does not apply to screens or inspection forms)",
                type: "boolean"
            })
            .option("directory", {
                desc: "The directory containing the script, screen, report or inspection form definitions to deploy.",
                type: "string",
                alias: "d",
                global: false
            })
            .option("file", {
                desc: "The path to a single script, screen, report or inspection form definition file to deploy, if a relative path is provided it is relative to the --directory argument path.",
                type: "string",
                alias: "f",
                global: false
            })
            .option("recursive", {
                desc: "Indicates if subdirectories will be included when deploying all scripts, screen or inspection form definitions, the default is true.",
                type: "boolean",
                alias: "r"
            })
};
const encrypt = {
    command: "encrypt",
    desc: "Encrypt the settings password."
};
const extract = {
    command: "extract",
    desc: "Extract script, screen or inspection form definitions to a local directory.",
    builder: (yargs) =>
        yargs
            .option("directory", {
                desc: "The directory to extract the scripts, screens or inspection forms to, defaults is the current directory.",
                type: "string",
                alias: "d",
                global: false
            })
            .option("overwrite", {
                desc: "Overwrite existing files if different from the server, default is true.",
                type: "boolean",
                alias: "o",
                global: false
            })
            .option("type", {
                desc: 'The type of object to extract, "script", "screen", "report" or "form". Defaults to "script".',
                type: "string",
                global: false
            })
};
const streamLog = {
    command: "log",
    desc: "Stream the Maximo log to the console.",
    builder: (yargs) =>
        yargs.option("log-timeout", {
            desc: "Number of seconds between logging requests, the default is 30.",
            type: "number"
        })
};

const argv = yarg
    .usage("Usage: $0 <command> [options]")
    .option("allow-untrusted-certs", {
        desc: "Allow untrusted SSL certificates.",
        type: "boolean"
    })
    .option("apikey", {
        desc: "The Maximo API key that will be used to access Maximo. If provided, the user name and password are ignored if configured.",
        type: "string",
        alias: "a"
    })
    .option("ca", {
        desc: "Path to the Maximo server certificate authority (CA) if it is not part of the system CA chain.",
        type: "string"
    })
    .option("context", {
        desc: "The part of the URL that follows the hostname, default is maximo.",
        type: "string",
        alias: "c"
    })
    .option("host", {
        desc: "The Maximo host name or IP address *without* the http/s protocol prefix. .",
        type: "string",
        alias: "h"
    })
    .option("install", {
        desc: "Indicates if the utility scripts should install and upgrade automatically, default is true.",
        type: "boolean",
        alias: "i"
    })
    .option("key", {
        desc: "The path to the encryption key for the settings encrypted values. A relative path is relative to the settings.json file directory.",
        type: "string",
        alias: "k"
    })
    .option("maxauth", {
        desc: "Force native Maximo authentication, default is false.",
        type: "boolean"
    })
    .option("password", {
        desc: "The Maximo user password.",
        type: "string",
        alias: "passwd"
    })
    .option("port", {
        desc: "The Maximo server port, defaults to 80 if the --ssl argument is false, 443 if the --ssl argument is true.",
        type: "number",
        alias: "p"
    })
    .option("settings", {
        desc: "The path to the settings file, default is settings.json.",
        type: "string",
        alias: "s",
        default: "./settings.json"
    })
    .option("ssl", {
        desc: "Indicates if SSL will be used, defaults to true.",
        type: "boolean"
    })
    .option("timeout", {
        desc: "The connection timeout in seconds, default is 30 seconds.",
        type: "number",
        alias: "t"
    })
    .option("username", {
        desc: "The Maximo user name.",
        type: "string",
        alias: "u"
    })
    .command(encrypt)
    .command(extract)
    .command(deploy)
    .command(streamLog)
    .demandCommand(
        1,
        1,
        'Either the "encrypt", "extract", "deploy", or "log" command must be provided.',
        'Only one command can be provided, either "encrypt", "extract", "deploy", or "log".'
    )
    .fail((msg, err, yargs) => {
        if (msg == "Unknown argument: l") {
            console.error(msg + ", Did you use -ssl instead of --ssl?");
            errorExit();
        } else if (err) {
            console.error(err.message);
            errorExit();
        } else {
            console.error(msg);            
            errorExit();
        }
    })
    .help()
    .strict().argv;

class Configuration {
    constructor(args) {
        let settings = {
            allowUntrustedCerts: false,
            apikey: undefined,
            ca: undefined,
            context: "maximo",
            maxauth: false,
            host: undefined,
            password: undefined,
            port: undefined,
            ssl: true,
            key: homedir() + path.sep + ".settings.json.key",
            timeout: 30,
            username: undefined,
            install: true,
            deploy: {
                allowAdminMode: false,
                file: undefined,
                recursive: true,
                directory: "./",
                deleteAll: false,
                deleteList: "delete.json"
            },
            log: {
                timeout: 30
            },
            extract: {
                directory: "./",
                overwrite: true,
                type: "script"
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
                if (args.settings !== "./settings.json") {
                    console.error(`The settings file ${args.settings} cannot be read.`);
                    errorExit();
                }
            }
        }

        this.command = argv._[0];

        this.allowUntrustedCerts = this.__selectCLIIfDefined(args["allow-untrusted-certs"], settings.allowUntrustedCerts, false);
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
            case "deploy":
                this.file = this.__selectCLIIfDefined(args.file, settings.deploy.file);
                this.recursive = this.__selectCLIIfDefined(args.recursive, settings.deploy.recursive);
                this.directory = this.__selectCLIIfDefined(args.directory, settings.deploy.directory);
                this.deleteAll = this.__selectCLIIfDefined(args.deleteAll, settings.deploy.deleteAll);
                this.allowAdminMode = this.__selectCLIIfDefined(args.allowAdminMode, settings.deploy.allowAdminMode);
                this.deleteList = this.__selectCLIIfDefined(args.deleteList, settings.deploy.deleteList);
                break;
            case "log":
                this.logTimeout = this.__selectCLIIfDefined(args["log-timeout"], settings.log.timeout);
                break;
            case "extract":
                this.directory = this.__selectCLIIfDefined(args.directory, settings.extract.directory);
                this.overwrite = this.__selectCLIIfDefined(args.overwrite, settings.extract.overwrite);
                this.type = this.__selectCLIIfDefined(args.type, settings.extract.type);
                break;
        }

        if (typeof this.port === "undefined") {
            this.port = this.ssl ? 443 : 80;
        }
    }

    validate() {
        try {
            switch (this.command) {
                case "encrypt":
                    if (typeof this.settingsFile === "undefined") {
                        console.error("The settings file must be provided to encrypt the password.");
                        errorExit();
                    }
                    try {
                        let tmpSettings = JSON.parse(fs.readFileSync(this.settingsFile));
                        const password = tmpSettings.password;
                        const apikey = tmpSettings.apikey;
                        if ((password === "undefined" || !password) && (typeof apikey === "undefined" || !apikey)) {
                            console.error(
                                `Neither an apikey or password is not specified in the settings file ${this.settingsFile}. There is no value to encrypt.`
                            );
                            errorExit();
                        } else if (password && password.startsWith("{encrypted}") && !apikey) {
                            console.error(
                                `The password in ${this.settingsFile} is already encrypted and no apikey is present to encrypt, to re-encrypt the password reset the password to plain text and try again.`
                            );
                            errorExit();
                        } else if (apikey && apikey.startsWith("{encrypted}") && !password) {
                            console.error(
                                `The apikey in ${this.settingsFile} is already encrypted and no password is present to encrypt, to re-encrypt the apikey reset the apikey to plain text and try again.`
                            );
                            errorExit();
                        } else if (apikey && apikey.startsWith("{encrypted}") && password && password.startsWith("{encrypted}")) {
                            console.error(
                                `The apikey and password in ${this.settingsFile} are already encrypted, to re-encrypt the apikey or password reset the apikey or password to plain text and try again.`
                            );
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
                case "extract":
                    decryptSettings(this);
                    this.__validateCommon();
                    if (!fs.existsSync(this.directory)) {
                        throw new Error(`The script extract directory ${this.directory} does not exist.`);
                    }

                    break;
                case "deploy":
                    decryptSettings(this);
                    this.__validateCommon();

                    let hasDirectory = typeof this.directory === "undefined" || !this.directory;
                    let hasFile = typeof this.file !== "undefined" && this.file;
                    let isAbsolute = hasFile ? path.isAbsolute(this.file) : false;
                    if (hasDirectory) {
                        if (hasFile) {
                            throw new Error("Neither a directory nor a file was provided to deploy. Either a directory or a file is required.");
                        } else if (!isAbsolute) {
                            throw new Error(
                                `The file ${this.file} is relative but a directory has not be provided.  A directory is required for files with a relative path.`
                            );
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

                        if (
                            !file.endsWith(".py") &&
                            !file.endsWith(".js") &&
                            !file.endsWith(".xml") &&
                            !file.endsWith(".json") &&
                            !file.endsWith(".rptdesign")
                        ) {
                            throw new Error(`Only .js, json, .py, .rptdesign or xml files can be deployed. The file ${file} does not meet this requirement.`);
                        }
                    }

                    break;
                case "log":
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
        if (typeof this.host === "undefined" || !this.host) {
            throw new Error("A host name or IP address is required.");
        } else {
            if (!isValidHostname(this.host)) {
                throw new Error(`${this.host} is not a valid host name or IP address.`);
            }
        }

        if (
            (typeof this.apikey === "undefined" || !this.apikey) &&
            (typeof this.username == "undefined" || !this.username || typeof this.password == "undefined" || !this.password)
        ) {
            throw new Error("An apikey or username and password are required to connect to Maximo.");
        }

        if (this.port <= 0 || this.port > 65535 || !Number.isInteger(this.port)) {
            throw new Error(`The port number ${this.port} must be a positive integer between 1 and 65535.`);
        }

        if (typeof this.ca !== "undefined" && !this.ca) {
            if (!fs.existsSync(this.ca)) {
                throw new Error(`The CA file ${this.ca} cannot be read.`);
            }
        }

        if (this.timeout < 0 || this.timeout > 300 || !Number.isInteger(this.timeout)) {
            throw new Error(`The connection timeout is ${this.timeout}, it must be a positive integer between 1 and 300.`);
        }

        if (typeof this.logTimeout !== "undefined" && (this.logTimeout < 30 || this.logTimeout > 300 || !Number.isInteger(this.logTimeout))) {
            throw new Error(`The logging timeout is ${this.logTimeout}, it must be a positive integer between 30 and 300.`);
        }
    }

    __selectCLIIfDefined(clia, setting) {
        return typeof clia !== "undefined" ? clia : setting;
    }

    __getFileContentsOrUndefined(file) {
        if (typeof file !== "undefined" && file) {
            let file = path.isAbsolute(file) ? path.resolve(config.file) : path.resolve("./", config.file);
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
    case "encrypt":
        try {
            encryptSettings(config);
            console.log(`The password and apikey if present have been encrypted in the ${config.settingsFile} settings file.`);
        } catch (error) {
            console.error("Error encrypting settings file. " + error);
            errorExit();
        }
        exit();
        break;
    case "deploy":
        try {
            client = new MaximoClient(getMaximoConfig(config));
            let deployedScripts = [];
            let noScriptName = false;
            if (await login(client)) {
                let deployFile = async function (file) {
                    try {
                        let fileContent = fs.readFileSync(file, "utf8");
                        let result;
                        if (file.endsWith(".xml")) {
                            // ignore reports.xml as they are report files
                            if (!file.endsWith("reports.xml")) {
                                result = await client.postScreen(fileContent);
                            }
                        } else if (
                            (file.endsWith(".js") || file.endsWith(".py")) &&
                            !file.endsWith(".deploy" + file.substring(file.lastIndexOf("."))) &&
                            !file.endsWith("-deploy" + file.substring(file.lastIndexOf(".")))
                        ) {
                            let deployFileName = file.substring(0, file.lastIndexOf(".")) + "-deploy" + file.substring(file.lastIndexOf("."));
                            let deployDotFileName = file.substring(0, file.lastIndexOf(".")) + ".deploy" + file.substring(file.lastIndexOf("."));
                            var deployJSONFileName = file.substring(0, file.lastIndexOf(".")) + ".json";
                            let preDeployJSONFileName = file.substring(0, file.lastIndexOf(".")) + ".predeploy.json";

                            var scriptDeploy;

                            if (fs.existsSync(deployFileName)) {
                                scriptDeploy = fs.readFileSync(deployFileName);
                            } else if (fs.existsSync(deployDotFileName)) {
                                scriptDeploy = fs.readFileSync(deployDotFileName);
                            }

                            if (fs.existsSync(preDeployJSONFileName)) {
                                let preConfigDeploy = fs.readFileSync(preDeployJSONFileName, "utf8");

                                console.log(`Applying pre-deploy configuration file ${preDeployJSONFileName}`);
                                await client.postConfig(preConfigDeploy);

                                const preDeployConfig = JSON.parse(preConfigDeploy);
                                if (
                                    typeof preDeployConfig.maxObjects !== "undefined" &&
                                    Array.isArray(preDeployConfig.maxObjects) &&
                                    preDeployConfig.maxObjects.length > 0
                                ) {
                                    if (typeof preDeployConfig.noDBConfig === "undefined" || preDeployConfig.noDBConfig === false) {
                                        if (await client.dbConfigRequired()) {
                                            console.log(`Checking if Admin Mode is required to apply changes to the database.`);
                                            const adminModeRequired = await client.dbConfigRequiresAdminMode();
                                            if (adminModeRequired) {
                                                console.log(`Admin Mode is required to apply changes to the database.`);
                                                if (config.allowAdminMode) {
                                                    if (typeof preDeployConfig.noAdminMode === "undefined" || preDeployConfig.noAdminMode === false) {
                                                        console.log("Requesting Admin Mode On");
                                                        await client.setAdminModeOn();
                                                        await new Promise((resolve) => setTimeout(resolve, 2000));
                                                        console.log(`Requested Admin Mode On`);
                                                        //put the server in admin mode, then do the config.
                                                        while ((await client.isAdminModeOn()) === false) {
                                                            await new Promise((resolve) => setTimeout(resolve, 2000));
                                                            console.log(`Waiting for Admin Mode On`);
                                                        }
                                                        console.log(`Admin Mode is On, applying database configurations.`);
                                                        await client.applyDBConfig();
                                                        console.log(`Requested database configuration start`);

                                                        // wait for the server to respond that the db config is in progress
                                                        while ((await client.dbConfigInProgress()) === false) {
                                                            await new Promise((resolve) => setTimeout(resolve, 2000));
                                                        }

                                                        // wait for the database configuration to complete
                                                        const regex = /BMX.*?E(?= -)/;
                                                        while ((await client.dbConfigInProgress()) === true) {
                                                            await new Promise((resolve) => setTimeout(resolve, 2000));

                                                            var messages = await client.dbConfigMessages();
                                                            if (messages.length > 0) {
                                                                var messageList = messages.split("\n");
                                                                messageList.forEach((message) => {
                                                                    if (regex.test(message) || messages.startsWith("BMXAA6819I")) {
                                                                        throw new Error("An error occurred during database configuration: " + message);
                                                                    }
                                                                });
                                                                console.log(messageList[messageList.length - 1]);
                                                            } else {
                                                                console.log(`Waiting for database configuration to complete`);
                                                            }
                                                        }
                                                        console.log(`Database configuration is complete`);
                                                        console.log(`Requesting Admin Mode Off`);
                                                        await client.setAdminModeOff();
                                                        await new Promise((resolve) => setTimeout(resolve, 2000));
                                                        console.log(`Requested Admin Mode Off`);

                                                        while ((await client.isAdminModeOn()) === true) {
                                                            await new Promise((resolve) => setTimeout(resolve, 2000));
                                                            console.log(`Waiting for Admin Mode Off`);
                                                        }
                                                        await new Promise((resolve) => setTimeout(resolve, 2000));
                                                        console.log(`Admin Mode is Off`);
                                                    } else {
                                                        throw new Error(
                                                            "The script deployment specifies that Admin Mode should not be applied, but the script cannot be deployed until the database configurations have been applied.\nThe configurations have been added to Maximo and can be manually applied by an administrator."
                                                        );
                                                    }
                                                } else {
                                                    throw new Error(
                                                        "The command line parameter allowAdminMode is false, but the script cannot be deployed until the database configurations have been applied.\nThe configurations have been added to Maximo and can be manually applied by an administrator."
                                                    );
                                                }
                                            } else {
                                                console.log(`Admin Mode is not required to apply changes to the database.`);
                                                // just do the config.
                                                await client.applyDBConfig();
                                                console.log(`Requested database configuration start`);
                                                await new Promise((resolve) => setTimeout(resolve, 2000));
                                                while ((await client.dbConfigInProgress()) === true) {
                                                    await new Promise((resolve) => setTimeout(resolve, 2000));
                                                    console.log(`Database configuration is complete`);
                                                }
                                            }
                                        }
                                    }
                                }
                            }

                            result = await client.postScript(fileContent, file, scriptDeploy);
                        } else if (file.endsWith(".json") && !file.endsWith("-predeploy.json") && !file.endsWith(".predeploy.json")) {
                            var deployJavaScriptFileName = file.substring(0, file.lastIndexOf(".")) + ".js";
                            var deployPythonFileName = file.substring(0, file.lastIndexOf(".")) + ".py";
                            if (!fs.existsSync(deployJavaScriptFileName) && !fs.existsSync(deployPythonFileName)) {
                                result = await client.postForm(JSON.parse(fileContent));
                            }
                        } else if (file.endsWith(".rptdesign")) {
                            let reportContent = fs.readFileSync(file, "utf8");
                            let fileName = path.basename(file);
                            let reportName = path.basename(file, path.extname(file));

                            let folderPath = path.dirname(file);

                            // Get the name of the containing folder
                            let appName = path.basename(folderPath);

                            let reportsXML = folderPath + "/reports.xml";

                            if (!fs.existsSync(reportsXML)) {
                                console.error("The selected report must have a reports.xml in the same folder that describes the report parameters.");
                                return;
                            }

                            // Read the XML file
                            let xmlContent = fs.readFileSync(reportsXML, "utf8");

                            let reportConfigs = await new Promise((resolve, reject) => {
                                parseString(xmlContent, function (error, result) {
                                    if (error) {
                                        reject(error);
                                    } else {
                                        resolve(result);
                                    }
                                });
                            });

                            let reportConfig = reportConfigs.reports.report.filter((report) => report.$.name === fileName)[0];

                            if (typeof reportConfig === "undefined" || reportConfig === null || reportConfig.attribute.length === 0) {
                                console.error("The selected report does not have an entry that contains at least one attribute value in the reports.xml.");
                                return;
                            }

                            let resourceData = null;
                            let resourceFolder = folderPath + "/" + reportName;
                            if (fs.existsSync(resourceFolder) && fs.readdirSync(resourceFolder).length > 0) {
                                resourceData = await createZipFromFolder(resourceFolder);
                            }

                            let attributes = reportConfig.attribute;

                            let reportData = {
                                reportName: reportConfig.$.name,
                                description: attributes.find((attr) => attr.$.name === "description")?._ ?? null,
                                reportFolder: attributes.find((attr) => attr.$.name === "reportfolder")?._ ?? null,
                                appName: appName,
                                toolbarLocation: attributes.find((attr) => attr.$.name === "toolbarlocation")?._ ?? "NONE",
                                toolbarIcon: attributes.find((attr) => attr.$.name === "toolbaricon")?._ ?? null,
                                toolbarSequence: attributes.find((attr) => attr.$.name === "toolbarsequence")?._ ?? null,
                                noRequestPage: attributes.find((attr) => attr.$.name === "norequestpage")?._ == 1 ? true : false ?? false,
                                detail: attributes.find((attr) => attr.$.name === "detail")?._ == 1 ? true : false ?? false,
                                useWhereWithParam: attributes.find((attr) => attr.$.name === "usewherewithparam")?._ == 1 ? true : false ?? false,
                                langCode: attributes.find((attr) => attr.$.name === "langcode")?._ ?? null,
                                recordLimit: attributes.find((attr) => attr.$.name === "recordlimit")?._ ?? null,
                                browserView: attributes.find((attr) => attr.$.name === "ql")?._ == 1 ? true : false ?? false,
                                directPrint: attributes.find((attr) => attr.$.name === "dp")?._ == 1 ? true : false ?? false,
                                printWithAttachments: attributes.find((attr) => attr.$.name === "pad")?._ == 1 ? true : false ?? false,
                                browserViewLocation: attributes.find((attr) => attr.$.name === "qlloc")?._ ?? "NONE",
                                directPrintLocation: attributes.find((attr) => attr.$.name === "dploc")?._ ?? "NONE",
                                printWithAttachmentsLocation: attributes.find((attr) => attr.$.name === "padloc")?._ ?? "NONE",
                                priority: attributes.find((attr) => attr.$.name === "priority")?._ ?? null,
                                scheduleOnly: attributes.find((attr) => attr.$.name === "scheduleonly")?._ == 1 ? true : false ?? false,
                                displayOrder: attributes.find((attr) => attr.$.name === "displayorder")?._ ?? null,
                                paramColumns: attributes.find((attr) => attr.$.name === "paramcolumns")?._ ?? null,
                                design: reportContent,
                                resources: resourceData
                            };

                            if (
                                typeof reportConfig.parameters !== "undefined" &&
                                reportConfig.parameters.length == 1 &&
                                typeof reportConfig.parameters[0].parameter !== "undefined" &&
                                reportConfig.parameters[0].parameter.length > 0
                            ) {
                                let parameters = reportConfig.parameters[0].parameter;
                                reportData.parameters = [];
                                parameters.forEach((parameter) => {
                                    let attributes = parameter.attribute;

                                    reportData.parameters.push({
                                        parameterName: parameter.$.name,
                                        attributeName: attributes.find((attr) => attr.$.name === "attributename")?._ ?? null,
                                        defaultValue: attributes.find((attr) => attr.$.name === "defaultvalue")?._ ?? null,
                                        labelOverride: attributes.find((attr) => attr.$.name === "labeloverride")?._ ?? null,
                                        sequence: attributes.find((attr) => attr.$.name === "sequence")?._ ?? null,
                                        lookupName: attributes.find((attr) => attr.$.name === "lookupname")?._ ?? null,
                                        required: attributes.find((attr) => attr.$.name === "required")?._ == 1 ? true : false ?? false,
                                        hidden: attributes.find((attr) => attr.$.name === "hidden")?._ == 1 ? true : false ?? false,
                                        multiLookup: attributes.find((attr) => attr.$.name === "multilookup")?._ == 1 ? true : false ?? false,
                                        operator: attributes.find((attr) => attr.$.name === "operator")?._ ?? null
                                    });
                                });
                            }

                            console.log(`Deploying report ${fileName}`);

                            await new Promise((resolve) => setTimeout(resolve, 500));

                            result = await client.postReport(reportData);
                        } else {
                            result = {
                                "status": "ignored"
                            };
                        }
                        if (result) {
                            if (result.status === "error") {
                                if (result.message) {
                                    throw new Error(result.message);
                                } else if (result.cause) {
                                    throw new Error(`Error: ${JSON.stringify(result.cause)}`);
                                } else {
                                    throw new Error("An unknown error occurred: " + JSON.stringify(result));
                                }
                            } else if (result.status !== "ignored") {
                                if (fs.existsSync(deployJSONFileName)) {
                                    let configDeploy = fs.readFileSync(deployJSONFileName);
                                    await client.postConfig(configDeploy);
                                }

                                if (typeof result.scriptName !== "undefined" && result.scriptName) {
                                    deployedScripts.push(result.scriptName.toLowerCase());
                                    console.log(`Deployed ${file} as ${result.scriptName} to Maximo.`);
                                } else {
                                    if (file.endsWith(".py") || file.endsWith(".js")) {
                                        noScriptName = true;
                                        console.log(`Deployed ${file} but a script name was not returned.`);
                                    } else if (file.endsWith(".rptdesign")) {
                                        console.log(`Deployed report ${path.basename(file)} to Maximo.`);
                                    } else {
                                        console.log(`Deployed ${file} to Maximo.`);
                                    }
                                }
                            }
                        } else {
                            throw new Error("Did not receive a response from Maximo.");
                        }
                    } catch (error) {
                        if (error && error.message) {
                            console.error(error.message);
                        } else {
                            console.error(error);
                        }
                    }
                };

                if (typeof config.file !== "undefined" && config.file) {
                    let file = path.isAbsolute(config.file) ? path.resolve(config.file) : path.resolve(config.directory, config.file);
                    await deployFile(file);
                } else {
                    let deployDir = async function (directory, deployFile) {
                        await asyncForEach(fs.readdirSync(directory, { withFileTypes: true }), async (file) => {
                            if (config.recursive && file.isDirectory()) {
                                await deployDir(path.resolve(directory, file.name), deployFile);
                            } else {
                                if (!file.isDirectory()) {
                                    if (
                                        file.name.endsWith(".js") ||
                                        file.name.endsWith(".py") ||
                                        file.name.endsWith(".xml") ||
                                        file.name.endsWith(".rptdesign") ||
                                        file.name.endsWith(".json")
                                    ) {
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

                            await asyncForEach(undeployedScripts, async (script) => {
                                await client.deleteScriptIfExists(script);
                            });
                        } else {
                            console.warn(
                                "The delete all flag was set but one or more of the script name was not returned after deploying the script. Deleting all is an unsafe operation.  Ensure you have at least version 1.15.0 of the SHARPTREE.AUTOSCRIPT.DEPLOY script deployed."
                            );
                        }
                    } else if (typeof config.deleteList !== "undefined" && config.deleteList && fs.existsSync(config.deleteList)) {
                        let deleteList = JSON.parse(fs.readFileSync(config.deleteList));
                        if (typeof deleteList !== "undefined" && Array.isArray(deleteList)) {
                            await asyncForEach(deleteList, async (script) => {
                                await client.deleteScriptIfExists(script);
                            });
                        }
                    }
                }
            } else {
                console.error("Login unsuccessful, unable to login to Maximo.");
                errorExit();
            }
        } catch (error) {
            console.error("Error deploying scripts to maximo: " + error);
            errorExit();
        } finally {
            if (typeof client !== "undefined") {
                await client.disconnect();
            }
        }
        exit();
        break;
    case "extract":
        try {
            client = new MaximoClient(getMaximoConfig(config));
            if (await login(client)) {
                if (config.type == "screen") {
                    let screenNames = await client.getAllScreenNames();
                    if (typeof screenNames !== "undefined" && screenNames.length > 0) {
                        await asyncForEach(screenNames, async (screenName) => {
                            if (typeof screenName !== "undefined" && screenName) {
                                let screenInfo = await client.getScreen(screenName);
                                let fileExtension = ".xml";
                                let outputFile = config.directory + "/" + screenName.toLowerCase() + fileExtension;
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
                } else if (config.type == "report") {
                    let reportNames = await client.getAllReports();
                    if (typeof reportNames !== "undefined" && reportNames.length > 0) {
                        let mappedReportNames = reportNames.map((report) => {
                            return report.description + " (" + report.report + ")";
                        });

                        await asyncForEach(mappedReportNames, async (reportName) => {
                            var report = reportNames.find((x) => x.description + " (" + x.report + ")" == reportName);
                            let reportInfo;
                            try {
                                reportInfo = await client.getReport(report.reportId);
                            } catch (error) {
                                if (!error.message && error.message.includes("BMXAA5476E")) {
                                    throw error;
                                } else {
                                    console.log(`Report ${reportName} does not have a report design in Maximo and will be skipped.`);
                                }
                            }
                            if (reportInfo) {
                                let outputFile = config.directory + "/" + reportInfo.reportFolder + "/" + report.report;
                                if (reportInfo.design) {
                                    let xml = reportInfo.design;

                                    // if the file doesn't exist then just write it out.
                                    if (!fs.existsSync(outputFile)) {
                                        fs.mkdirSync(config.directory + "/" + reportInfo.reportFolder, { recursive: true });
                                        fs.writeFileSync(outputFile, xml);
                                        console.log(`Extracted ${reportName}`);
                                    } else {
                                        let incomingHash = crypto.createHash("sha256").update(xml).digest("hex");
                                        let fileHash = crypto.createHash("sha256").update(fs.readFileSync(outputFile)).digest("hex");

                                        if (fileHash !== incomingHash || config.overwrite) {
                                            fs.writeFileSync(outputFile, xml);
                                            console.log(`Extracted ${reportName}`);
                                        } else {
                                            console.log(`Report ${reportName} exists and overwriting is disabled, skipping.`);
                                        }
                                    }
                                    await writeResources(reportInfo, config.directory);
                                    await writeMetaData(reportInfo, config.directory);
                                }
                            }
                        });
                    }
                } else if (config.type == "form") {
                    let forms = await client.getAllForms();
                    if (typeof forms !== "undefined" && forms.length > 0) {
                        await asyncForEach(forms, async (form) => {
                            if (typeof form !== "undefined" && form) {
                                let formInfo = await client.getForm(form.id);
                                let outputFile = config.directory + "/" + formInfo.name.toLowerCase().replaceAll(" ", "-") + ".json";
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
                    if (typeof scriptNames !== "undefined" && scriptNames.length > 0) {
                        await asyncForEach(scriptNames, async (scriptName) => {
                            if (typeof scriptName !== "undefined" && scriptName) {
                                let scriptInfo = await client.getScript(scriptName);
                                let fileExtension = getExtension(scriptInfo.scriptLanguage);
                                let outputFile = config.directory + "/" + scriptName.toLowerCase() + fileExtension;

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
                        throw new Error("No scripts were found to extract.");
                    }
                }
            } else {
                console.error("Login unsuccessful, unable to login to Maximo.");
                errorExit();
            }
        } catch (error) {
            console.error("Error extracting " + config.type + " from maximo: " + error);
            errorExit();
        } finally {
            if (typeof client !== "undefined") {
                console.log("disconnecting");
                await client.disconnect();
            }
        }
        exit();
        break;
    case "log":
        try {
            client = new MaximoClient(getMaximoConfig(config));
            if (await login(client)) {
                await client.startLogging(config.logTimeout);
            } else {
                console.error("Login unsuccessful, unable to login to Maximo.");
                errorExit();
            }
        } catch (error) {
            if (typeof error !== "undefined" && typeof error.toJSON === "function") {
                let jsonError = error.toJSON();
                if (typeof jsonError.message !== "undefined") {
                    console.error(jsonError.message);
                    errorExit();
                } else {
                    window.showErrorMessage(JSON.stringify(jsonError), { modal: true });
                }
            } else if (typeof error !== "undefined" && typeof error.Error !== "undefined" && typeof error.Error.message !== "undefined") {
                console.error(error.Error.message);
            } else if (error instanceof Error) {
                console.error(error.message);
            } else {
                console.error(error);
            }
            errorExit();
        } finally {
            if (typeof client !== "undefined") {
                console.log("disconnecting");
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
    let logInSuccessful = await client.connect().then(
        () => {
            return true;
        },
        (error) => {
            // show the error message to the user.
            if (error.message.includes("ENOTFOUND")) {
                throw new Error('The host name "' + client.config.host + '" cannot be found.');
            } else if (typeof error.code !== "undefined" && error.code == "ECONNRESET") {
                throw new Error(error.message);
            } else if (error.message.includes("ECONNREFUSED")) {
                throw new Error("Connection refused to host " + client.config.host + " on port " + client.config.port);
            } else if (error.isAxiosError) {
                if (typeof error.response !== "undefined" && typeof error.response.status !== "undefined" && error.response.status == 401) {
                    throw new Error("User name and password combination are not valid. Try again.");
                } else {
                    throw error;
                }
            } else {
                throw new Error(error.message);
            }
        }
    );

    if (logInSuccessful) {
        if ((await installed(client)) && (await upgraded(client))) {
            return true;
        } else {
            return false;
        }
    } else {
        return false;
    }
}

async function installed(client) {
    if (!(await client.installed())) {
        if (installOrUpgrade) {
            var result = await client.installOrUpgrade(true);
            if (result && result.status === "error") {
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
            if (result && result.status === "error") {
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
        extractLocation: config.extract && config.extract.directory ? config.extract.directory : undefined
    });
}

function encryptSettings(config) {
    let settings = JSON.parse(fs.readFileSync(config.settingsFile));

    const algorithm = "aes-256-cbc";

    const keyPath = typeof config.key !== "undefined" && !config.key ? config.key : ".settings.json.key";

    const keyFile = path.isAbsolute(keyPath) ? keyPath : path.join(path.dirname(config.settingsFile), keyPath);

    if (!fs.existsSync(keyFile)) {
        fs.writeFileSync(keyFile, new Buffer.from(crypto.randomBytes(16)).toString("hex") + new Buffer.from(crypto.randomBytes(32)).toString("hex"), "utf8");
    }

    const keydata = fs.readFileSync(keyFile, "utf8");

    const iv = Buffer.from(keydata.slice(0, 32), "hex");
    const key = Buffer.from(keydata.slice(32), "hex");

    if (settings.password && !settings.password.startsWith("{encrypted}")) {
        const cipher = crypto.createCipheriv(algorithm, key, iv);
        let encPassword = cipher.update(settings.password, "utf-8", "hex");
        encPassword += cipher.final("hex");

        settings.password = "{encrypted}" + encPassword;
    }
    if (settings.apikey && !settings.apikey.startsWith("{encrypted}")) {
        const cipher = crypto.createCipheriv(algorithm, key, iv);
        let encApiKey = cipher.update(settings.apikey, "utf-8", "hex");
        encApiKey += cipher.final("hex");

        settings.apikey = "{encrypted}" + encApiKey;
    }
    fs.writeFileSync(config.settingsFile, JSON.stringify(settings, null, 4));
}

function decryptSettings(config) {
    // if a configuration is not provided return.
    if (typeof config === "undefined" || !config) {
        return;
    }

    // if the configuration did not come from a settings file then return.
    if (typeof config.settingsFile === "undefined" || !config.settingsFile) {
        return;
    }

    // if the password or apikey are not encrypted then return.
    if (
        (typeof config.password === "undefined" || !config.password || !config.password.startsWith("{encrypted}")) &&
        (typeof config.apikey === "undefined" || !config.apikey || !config.apikey.startsWith("{encrypted}"))
    ) {
        return;
    }

    const algorithm = "aes-256-cbc";
    const keyFile = path.join(path.dirname(config.settingsFile), ".settings.json.key");
    if (!fs.existsSync(keyFile)) {
        throw new Error(`The apikey or password cannot be decrypted because the key file ${keyFile} cannot be read.`);
    }

    const keydata = fs.readFileSync(keyFile, "utf8");

    const iv = Buffer.from(keydata.slice(0, 32), "hex");
    const key = Buffer.from(keydata.slice(32), "hex");

    if (config.password && config.password.startsWith("{encrypted}")) {
        const decipher = crypto.createDecipheriv(algorithm, key, iv);
        let decryptedPassword = decipher.update(config.password.substring(11), "hex", "utf-8");
        decryptedPassword += decipher.final("utf8");
        config.password = decryptedPassword;
    }

    if (config.apikey && config.apikey.startsWith("{encrypted}")) {
        const decipher = crypto.createDecipheriv(algorithm, key, iv);
        let decryptedApiKey = decipher.update(config.apikey.substring(11), "hex", "utf-8");
        decryptedApiKey += decipher.final("utf8");
        config.apikey = decryptedApiKey;
    }
}

function getExtension(scriptLanguage) {
    switch (scriptLanguage.toLowerCase()) {
        case "python":
        case "jython":
            return ".py";
        case "nashorn":
        case "javascript":
        case "emcascript":
        case "js":
            return ".js";
        default:
            return ".unknown";
    }
}

async function writeMetaData(reportInfo, extractLoc) {
    let xmlFilePath = extractLoc + "/" + reportInfo.reportFolder + "/reports.xml";

    let reportsXML = await new Promise((resolve, reject) => {
        if (fs.existsSync(xmlFilePath)) {
            const xml = fs.readFileSync(xmlFilePath, "utf-8");
            parseString(xml, (err, result) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(result);
            });
        } else {
            // Initialize xmlObject with a reports element
            resolve({ reports: {} });
        }
    });

    if (!reportsXML) {
        reportsXML = {};
    }

    if (typeof reportsXML.reports === "undefined" || !reportsXML.reports) {
        reportsXML.reports = {};
    }

    if (typeof reportsXML.reports.report === "undefined" || !reportsXML.reports.report) {
        reportsXML.reports.report = [];
    }

    reportsXML.reports.report = reportsXML.reports.report.filter((report) => {
        // Assuming each report has an $ object with an id attribute
        // Keep the report if its id is not the one we want to remove
        return !(report.$ && report.$.name === reportInfo.reportName);
    });

    let report = { $: { name: reportInfo.reportName } };
    report.attribute = [];
    report.attribute.push({ _: reportInfo.reportName, $: { name: "filename" } });
    report.attribute.push({ _: reportInfo.description, $: { name: "description" } });
    report.attribute.push({ _: reportInfo.directPrintLocation, $: { name: "dploc" } });
    report.attribute.push({ _: reportInfo.directPrint, $: { name: "dp" } });
    report.attribute.push({ _: reportInfo.browserViewLocation, $: { name: "qlloc" } });
    report.attribute.push({ _: reportInfo.browserView, $: { name: "ql" } });
    report.attribute.push({ _: reportInfo.printWithAttachmentsLocation, $: { name: "padloc" } });
    report.attribute.push({ _: reportInfo.printWithAttachments, $: { name: "pad" } });
    if (reportInfo.toolbarSequence) report.attribute.push({ _: reportInfo.toolbarSequence, $: { name: "toolbarsequence" } });
    report.attribute.push({ _: reportInfo.noRequestPage ? 1 : 0, $: { name: "norequestpage" } });
    report.attribute.push({ _: reportInfo.detail ? 1 : 0, $: { name: "detail" } });
    if (reportInfo.recordLimit) report.attribute.push({ _: reportInfo.recordLimit, $: { name: "recordlimit" } });
    report.attribute.push({ _: reportInfo.reportFolder, $: { name: "reportfolder" } });
    if (reportInfo.priority) report.attribute.push({ _: reportInfo.priority, $: { name: "priority" } });
    report.attribute.push({ _: reportInfo.scheduleOnly ? 1 : 0, $: { name: "scheduleonly" } });
    report.attribute.push({ _: reportInfo.toolbarLocation, $: { name: "toolbarlocation" } });
    report.attribute.push({ _: reportInfo.useWhereWithParam ? 1 : 0, $: { name: "usewherewithparam" } });
    report.attribute.push({ _: reportInfo.displayOrder ? 1 : 0, $: { name: "displayOrder" } });
    report.attribute.push({ _: reportInfo.paramColumns ? 1 : 0, $: { name: "paramcolumns" } });

    if (reportInfo.parameters.length > 0) {
        report.parameters = {};
        report.parameters.parameter = [];
        reportInfo.parameters.forEach((param) => {
            let parameter = { $: { name: param.parameterName } };
            parameter.attribute = [];
            parameter.attribute.push({ _: param.attributeName, $: { name: "attributename" } });
            parameter.attribute.push({ _: param.defaultValue, $: { name: "defaultvalue" } });
            parameter.attribute.push({ _: param.labelOverride, $: { name: "labeloverride" } });
            parameter.attribute.push({ _: param.lookupName, $: { name: "lookupname" } });
            parameter.attribute.push({ _: param.hidden ? 1 : 0, $: { name: "hidden" } });
            parameter.attribute.push({ _: param.lookup ? 1 : 0, $: { name: "lookup" } });
            parameter.attribute.push({ _: param.operator, $: { name: "operator" } });
            parameter.attribute.push({ _: param.multiLookup, $: { name: "multilookup" } });
            parameter.attribute.push({ _: param.hidden ? 1 : 0, $: { name: "hidden" } });
            parameter.attribute.push({ _: param.required ? 1 : 0, $: { name: "required" } });
            parameter.attribute.push({ _: param.sequence, $: { name: "sequence" } });
            report.parameters.parameter.push(parameter);
        });
    }
    if (reportInfo.resources) {
        const reportName = path.basename(reportInfo.reportName, path.extname(reportInfo.reportName));

        let outputDir = extractLoc + "/" + reportInfo.reportFolder + "/" + reportName;
        report.resources = {};
        report.resources.resource = [];
        if (fs.existsSync(outputDir)) {
            const files = fs.readdirSync(outputDir);
            files.forEach((file) => {
                let resource = {};
                resource.reference = { _: path.basename(file) };
                resource.filename = "./" + reportName + "/" + path.basename(file);
                report.resources.resource.push(resource);
            });
        }
    }

    reportsXML.reports.report.push(report);

    const xml = new Builder().buildObject(reportsXML);
    fs.writeFileSync(xmlFilePath, xml, "utf-8");
}

async function writeResources(reportInfo, extractLoc) {
    if (reportInfo.resources) {
        let binaryBuffer = Buffer.from(reportInfo.resources, "base64");
        const reportName = path.basename(reportInfo.reportName, path.extname(reportInfo.reportName));

        let outputDir = extractLoc + "/" + reportInfo.reportFolder + "/" + reportName;

        fs.mkdirSync(outputDir, { recursive: true });

        for (const file of fs.readdirSync(outputDir)) {
            fs.unlinkSync(path.join(outputDir, file));
        }

        await new Promise((resolve, reject) => {
            yauzl.fromBuffer(binaryBuffer, { lazyEntries: true }, (err, zipFile) => {
                if (err) reject(err);
                zipFile.readEntry();
                zipFile.on("entry", function (entry) {
                    if (/\/$/.test(entry.fileName)) {
                        // Directory file names end with '/'
                        fs.mkdirSync(path.join(outputDir, entry.fileName), { recursive: true });

                        zipFile.readEntry();
                    } else {
                        // File entry
                        zipFile.openReadStream(entry, (err, readStream) => {
                            if (err) reject(err);
                            const filePath = path.join(outputDir, entry.fileName);
                            fs.mkdirSync(path.dirname(filePath), { recursive: true });

                            readStream.pipe(fs.createWriteStream(filePath));
                            readStream.on("end", () => {
                                zipFile.readEntry();
                                resolve();
                            });
                        });
                    }
                });
                zipFile.on("end", () => {});
            });
        });
    }
}

async function createZipFromFolder(folderPath) {
    let result = await new Promise((resolve, reject) => {
        const archive = archiver("zip", {
            zlib: { level: 9 } // Sets the compression level.
        });

        const bufferStream = new PassThrough();
        let chunks = [];

        bufferStream.on("data", (chunk) => {
            chunks.push(chunk);
        });

        // Good practice to catch warnings (like stat failures and other non-blocking errors)
        archive.on("warning", function (err) {
            if (err.code === "ENOENT") {
                console.warn(err);
            } else {
                // Throw error for any unexpected warning
                reject(err);
            }
        });

        // Catch errors explicitly
        archive.on("error", function (err) {
            reject(err);
        });

        archive.on("finish", function () {
            const fullBuffer = Buffer.concat(chunks);
            const base64String = fullBuffer.toString("base64");
            resolve(base64String);
        });

        // Pipe archive data to the file
        archive.pipe(bufferStream);

        // // Append files from a directory
        archive.directory(folderPath, false);

        // Finalize the archive (ie we are done appending files but streams have to finish yet)
        // 'close', 'end' or 'finish' may be fired right after calling this method so register to them beforehand
        archive.finalize();
    });

    return result;
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
