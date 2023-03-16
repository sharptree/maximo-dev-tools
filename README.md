# Introduction 
The Maximo Developer Tools provide command line tools for developing and deploying automation scripts and other customizations. It is the command line companion to the Maximo Script Deploy Visual Studio Code extension: [https://marketplace.visualstudio.com/items?itemName=sharptree.maximo-script-deploy](https://marketplace.visualstudio.com/items?itemName=sharptree.maximo-script-deploy).

# Install
Using npm:

```bash
$ npm install -g maximo-dev-tools
```

# Settings
The configuration settings can be provided as command line arguments or in a settings JSON file or a combination of the two. The command line arguments override the values provided in the settings JSON file.

## Command Line Arguments

### Global
The following table provides the available global arguments.  

| Argument                      | Default               | Description                                                                                                                                                                   |
| :-----------------------------| :---------------------| :-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| --allow-untrusted-certs       | false                 | Allow untrusted or invalid SSL certificates. Useful for testing when using self signed certificates, default is false.                                                        |
| --apikey &#124; -a            |                       | The Maximo API key that will be used to access Maximo. If provided, the user name and password are ignored if configured.                                                     |
| --ca                          |                       | Path to the Maximo server certificate authority (CA) if it is not part of the system CA chain.                                                                                |
| --context &#124; -c           | maximo                | The part of the URL that follows the hostname, default is `maximo`.                                                                                                           |
| --host &#124; -h              |                       | The Maximo host name or IP address *without* the http/s protocol prefix.                                                                                                      |
| --install &#124; -i           | true                  | Indicates if the utility scripts should install and upgrade automatically, default is true.                                                                                   |
| --key &#124; -k               | .settings.json.key    | The path to the encryption key for the settings encrypted values. A relative path is relative to the settings.json file directory.                                            |
| --maxauth                     | false                 | Force native Maximo authentication, default is false.                                                                                                                         |
| --password &#124; --passwd    |                       | The Maximo user password.                                                                                                                                                     |
| --port &#124; -p              | 80 / 443              | The Maximo server port, defaults to 80 if the --ssl argument is false, 443 if the --ssl argument is true.                                                                     |
| --settings &#124; -s          | settings.json         | The path to the settings file, default is settings.json.                                                                                                                      |
| --ssl                         | true                  | Indicates if SSL will be used, defaults to true.                                                                                                                              | 
| --timeout &#124; -t           | 30                    | The connection timeout in seconds, default is 30 seconds.                                                                                                                     |
| --username &#124; -u          |                       | The maximo user name.                                                                                                                                                         |
| --help                        |                       | Prints the help information.                                                                                                                                                  |
| --version                     |                       | Prints the version number.                                                                                                                                                    |

### Encrypt
The `encrypt` command encrypts the plain text password and API key values in the settings file. There are no additional arguments for the `encrypt` command.

### Extract
The `extract` command extracts scripts from the target Maximo system to a local directory.

| Argument                  | Default               | Description                                                                                                                                                                   |
| :-------------------------| :---------------------| :-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| --directory &#124; -d     | ./                    | The directory to extract the scripts to, defaults is the current directory.                                                                                                   |
| --overwrite &#124; -o     | true                  | Overwrite existing files if different from the server, default is true.                                                                                                       |
| --type                    | script                | The type of object to extract, `script`, `screen` of `form`.                                                                                                                  |

### Deploy
The `deploy` command deploys one or more script files from the local machine to the target Maximo system.

| Argument                  | Default               | Description                                                                                                                                                                   |
| :-------------------------| :---------------------| :-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| --deleteAll               | false                 | Indicates if any script not in the current deploy directory, but on the server, will be deleted from the server. This option is may be destructive, the default is false.     |
| --deleteList              | delete.json           | Path to a file that contains a JSON list of the scripts on the server to delete if they exist, the default is delete.json.                                                    |
| --directory &#124; -d     | ./                    | The directory to deploy the scripts from, defaults is the current directory.                                                                                                  |
| --file &#124; -f          |                       | The path to a single script file to deploy, if a relative path is provided it is relative to the --directory argument path.                                                   |
| --recursive &#124; -r     | true                  | Indicates if subdirectories will be included when deploying all scripts, the default is true.                                                                                 |

### Log
The `log` command streams the Maximo log to the console. This can then be piped to a file using the OS `> filename.log` command.

| Argument                  | Default               | Description                                                                                                                                                                   |
| :-------------------------| :---------------------| :-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| --log-timeout             | 30                    | Number of seconds between logging requests, the default is 30.                                                                                                                |

## Settings File
A sample settings JSON file is provided below with the default values.

```json
{
    "allowUntrustedCerts": false,
    "apikey": undefined,
    "ca": undefined,
    "context": 'maximo',
    "maxauth": false,
    "host": undefined,
    "password": undefined,
    "port": 80|443,
    "ssl": true,
    "key": "~/.settings.json.key",
    "timeout": 30,
    "username": undefined,
    "install": true,
    "deploy": {
        "file": undefined,
        "recursive": true,
        "directory": './',
        "deleteAll": false,
        "deleteList": "delete.json"
    },
    "extract": {
        "directory": "./",
        "overwrite": true
    }
    "log": {
        "timeout": 30
    },
}
```