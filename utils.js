var path = require('path');
var fs = require('fs');
var _ = require('underscore');
var chalk = require('chalk');
_.str = require('underscore.string');
_.mixin(_.str.exports());
var ngParseModule = require('ng-parse-module');


exports.JS_MARKER = "<!-- Add New Component JS Above -->";
exports.LESS_MARKER = "/* Add Component LESS Above */";
exports.SCSS_MARKER = "/* Add Component SCSS Above */";

exports.ROUTE_MARKER = "/* Add New Routes Above */";
exports.STATE_MARKER = "/* Add New States Above */";
exports.SRC_APP = 'app/';

exports.addToFile = function(filename, lineToAdd, beforeMarker) {
    try {
        var fullPath = path.resolve(process.cwd() + '/' + exports.SRC_APP, filename);
        var fileSrc = fs.readFileSync(fullPath, 'utf8');

        var indexOf = fileSrc.indexOf(beforeMarker);
        var lineStart = fileSrc.substring(0, indexOf).lastIndexOf('\n') + 1;
        var indent = fileSrc.substring(lineStart, indexOf);
        fileSrc = fileSrc.substring(0, indexOf) + lineToAdd + "\n" + indent + fileSrc.substring(indexOf);

        fs.writeFileSync(fullPath, fileSrc);
    } catch (e) {
        throw e;
    }
};

exports.processTemplates = function(name, dir, type, that, defaultDir, configName, module) {

    if (!defaultDir) {
        defaultDir = 'templates'
    }
    if (!configName) {
        configName = type + 'Templates';
    }
    var templateDirectory = path.join(path.dirname(that.resolved), defaultDir);
    if (that.config.get(configName)) {
        templateDirectory = path.join(process.cwd(), that.config.get(configName));
    }


    _.chain(fs.readdirSync(templateDirectory))
        .filter(function(template) {
            return template[0] !== '.';
        })
        .each(function(template) {
            //all files are suffixed with -typje
            var customTemplateName;

            if ((type === 'partial' && template.indexOf('partial') >= 0) ||
                (type === 'sub-section' && template.indexOf('partial') >= 0)) {
                customTemplateName = template.replace('partial', name);
            } else if (type === 'module') {
                customTemplateName = template.replace(type, name);
            } else {
                customTemplateName = name + '-' + template;
            }
            var templateFile = path.join(templateDirectory, template);
            /*console.log('template file '+templateFile);
            console.log('template'+template);*/
            //create the file
            that.template(templateFile, path.join(dir, customTemplateName));
            //inject the file reference into index.html/app.less/etc as appropriate
            exports.inject(path.join(dir, customTemplateName), that, module);
        });
};

exports.inject = function(filename, that, module) {
    //special case to skip unit tests
    if (_(filename).endsWith('-spec.js') ||
        _(filename).endsWith('_spec.js') ||
        _(filename).endsWith('-test.js') ||
        _(filename).endsWith('_test.js')) {
        return;
    }

    var ext = path.extname(filename);
    if (ext[0] === '.') {
        ext = ext.substring(1);
    }
    var config = that.config.get('inject')[ext];
    if (config) {
        var configFile = _.template(config.file)({
            module: path.basename(module.file, '.js')
        });
        var injectFileRef = filename;
        if (config.relativeToModule) {
            configFile = path.join(path.dirname(module.file), configFile);
            injectFileRef = path.relative(path.dirname(module.file), filename);
        }
        injectFileRef = injectFileRef.replace(/\\/g, '/');
        injectFileRef = injectFileRef.replace(/app\//g, ''); //exports.SRC_APP
        var lineTemplate = _.template(config.template)({
            filename: injectFileRef
        });
        exports.addToFile(configFile, lineTemplate, config.marker);
        that.log.writeln(chalk.green(' updating') + ' %s', path.basename(configFile));
    }
};

exports.injectRoute = function(moduleFile, uirouter, name, route, routeUrl, that) {

    routeUrl = routeUrl.replace(/\\/g, '/');

    if (uirouter) {
        var code = '$stateProvider.state(\'' + name + '\', {\n        url: \'/' + route + '\',\n        templateUrl: \'' + routeUrl + '\'\n    });';
        exports.addToFile(moduleFile, code, exports.STATE_MARKER);
    } else {
        exports.addToFile(moduleFile, '$routeProvider.when(\'' + route + '\',{templateUrl: \'' + routeUrl + '\'});', exports.ROUTE_MARKER);
    }

    that.log.writeln(chalk.green(' updating') + ' %s', path.basename(moduleFile));

};

exports.getParentModule = function(dir) {
    //starting this dir, find the first module and return parsed results
    if (fs.existsSync(dir)) {
        var files = fs.readdirSync(dir);
        for (var i = 0; i < files.length; i++) {
            if (path.extname(files[i]) !== '.js') {
                continue;
            }
            var results = ngParseModule.parse(path.join(dir, files[i]));
            if (results) {
                return results;
            }
        }
    }

    if (fs.existsSync(path.join(dir, '.yo-rc.json'))) {
        //if we're in the root of the project then bail
        return;
    }

    return exports.getParentModule(path.join(dir, '..'));
};



exports.askForSubSection = function(type, that, cb) {
    var mainModule = ngParseModule.parse(exports.SRC_APP + 'app.js');
    mainModule.primary = true;
    var subSections = that.config.get('sub-sections');

    var choices = _.pluck(subSections, 'name');
    var prompts = [{
        name: 'subSection',
        message: 'Which sub-section would you like to place the new ' + type + '?',
        type: 'list',
        choices: choices,
        default: 0
    }];
    that.prompt(prompts, function(props) {
        console.log('got sub-section: ' + props.subSection);
        var subDir = _.where(subSections, {
            name: props.subSection
        })[0].dir;
        cb.bind(that)(mainModule, subDir);
    });
}



exports.askForParent = function(type, that, cb) {
    var mainModule = ngParseModule.parse(exports.SRC_APP + 'app.js');
    mainModule.primary = true;
    var subSections = that.config.get('sub-sections')
    if (!subSections || subSections.length == 0) {
        exports.askForModule(type, that, cb);
    } else {

        var choices = [mainModule.name + ' (Primary Application Module)',
            'Other Modules', 'Sub-Sections'
        ];
        var prompts = [{
            name: 'parent_name',
            message: 'Where would you like to place the new ' + type + '?',
            type: 'list',
            choices: choices,
            default: 0
        }];

        that.prompt(prompts, function(props) {
            console.log('got here with ' + JSON.stringify(props));
            var i = choices.indexOf(props.parent_name);
            if (i === 0) {
                cb.bind(that)(mainModule);
            }
            if (i === 1) {
                exports.askForModule(type, that, cb);
            }
            if (i === 2) {
                exports.askForSubSection(type, that, cb);
            }
        });


    }
}



exports.askForModule = function(type, that, cb) {

    var modules = that.config.get('modules');
    var mainModule = ngParseModule.parse(exports.SRC_APP + 'app.js');
    mainModule.primary = true;

    if (!modules || modules.length === 0) {
        cb.bind(that)(mainModule);
        return;
    }

    var choices = _.pluck(modules, 'name');
    //choices.unshift(mainModule.name + ' (Primary Application Module)');

    if (that.options.selectedmodule === undefined) {
        var prompts = [{
            name: 'module',
            message: 'Which module would you like to place the new ' + type + '?',
            type: 'list',
            choices: choices,
            default: 0
        }];

        that.prompt(prompts, function(props) {

            var i = choices.indexOf(props.module);

            var module;
            console.log('module file at ' + modules[i].file);
            module = ngParseModule.parse(modules[i].file);

            cb.bind(that)(module);
        }.bind(that));
    } else {
        var i = choices.indexOf(that.options.selectedmodule);
        var module;

        if (i === 0) {
            module = mainModule;
        } else if (i > 0) {
            module = ngParseModule.parse(modules[i - 1].file);
        } else {
            this.log.writeln("ERROR: module (" + that.options.selectedmodule + ") is not present");
        }

        cb.bind(that)(module);
    }

};


/*exports.askForModule = function(type, that, cb) {

    var modules = that.config.get('modules');
    var mainModule = ngParseModule.parse(exports.SRC_APP + 'app.js');
    mainModule.primary = true;

    if (!modules || modules.length === 0) {
        cb.bind(that)(mainModule);
        return;
    }

    var choices = _.pluck(modules, 'name');
    choices.unshift(mainModule.name + ' (Primary Application Module)');

    if (that.options.selectedmodule === undefined) {
        var prompts = [{
            name: 'module',
            message: 'Which module would you like to place the new ' + type + '?',
            type: 'list',
            choices: choices,
            default: 0
        }];

        that.prompt(prompts, function(props) {

            var i = choices.indexOf(props.module);

            var module;

            if (i === 0) {
                module = mainModule;
            } else {
                module = ngParseModule.parse(modules[i - 1].file);
            }

            cb.bind(that)(module);
        }.bind(that));
    } else {
        var i = choices.indexOf(that.options.selectedmodule);
        var module;

        if (i === 0) {
            module = mainModule;
        } else if (i > 0) {
            module = ngParseModule.parse(modules[i - 1].file);
        } else {
            this.log.writeln("ERROR: module (" + that.options.selectedmodule + ") is not present");
        }

        cb.bind(that)(module);
    }

};
*/
exports.askForDir = function(type, that, module, ownDir, cb, subSectionDir) {


    var mainModule = ngParseModule.parse(exports.SRC_APP + 'app.js');


    if (!module) {
        module = mainModule;
    }


    that.module = module;
    that.appname = module.name;
    that.dir = path.dirname(module.file);

    var configedDir = that.config.get(type + 'Directory');

    if (!configedDir) {
        configedDir = '.';
    } //removing the modules dir in module folder

    var defaultDir;

    if (module.primary) {
        defaultDir = that.dir + '/components/';
    } else {
        defaultDir = that.dir + '/';
    }

    defaultDir = path.relative(process.cwd(), defaultDir);

    if (subSectionDir) {
        defaultDir = subSectionDir;
    }

    if (ownDir) {
        if (type === 'sub-section') {
            defaultDir = path.join(defaultDir, that.name );
        } else {
            defaultDir = path.join(defaultDir, that.name + '-' + type);
        }
    }

    defaultDir = path.join(defaultDir, '/');

    var dirPrompt = [{
        name: 'dir',
        message: 'Where would you like to create the ' + type + ' files?',
        default: defaultDir,
        validate: function(dir) {
            if (!module.primary) {
                //ensure dir is in module dir or subdir of it
                dir = path.resolve(dir);
                if (path.relative(that.dir, dir).substring(0, 2) === '..') {
                    return 'Files must be placed inside the module directory or a subdirectory of the module.'
                }
            }
            return true;
        }
    }];

    var dirPromptCallback = function(props) {

        that.dir = path.join(props.dir, '/');
        var dirToCreate = that.dir;
        if (ownDir) {
            dirToCreate = path.join(dirToCreate, '..');
        }

        if (!fs.existsSync(dirToCreate)) {
            that.prompt([{
                name: 'isConfirmed',
                type: 'confirm',
                message: chalk.cyan(dirToCreate) + ' does not exist.  Create it?'
            }], function(props) {
                if (props.isConfirmed) {
                    cb();
                } else {
                    that.prompt(dirPrompt, dirPromptCallback);
                }
            });
        } else if (ownDir && fs.existsSync(that.dir)) {
            //if the dir exists and this type of thing generally is inside its own dir, confirm it
            that.prompt([{
                name: 'isConfirmed',
                type: 'confirm',
                message: chalk.cyan(that.dir) + ' already exists.  Components of this type contain multiple files and are typically put inside directories of their own.  Continue?'
            }], function(props) {
                if (props.isConfirmed) {
                    cb();
                } else {
                    that.prompt(dirPrompt, dirPromptCallback);
                }
            });
        } else {
            cb();
        }

    };

    if (that.options.defaultDir === undefined)
        that.prompt(dirPrompt, dirPromptCallback);
    else {
        that.dir = that.options.defaultDir;
        cb();
    }
};

exports.askForModuleAndDir = function(type, that, ownDir, cb) {
    console.log('got here asking for module and dir');
    exports.askForParent(type, that, function(module, subDir) {
        console.log(' sub-section dir is ' + subDir);
        exports.askForDir(type, that, module, ownDir, cb, subDir);
    });

    /* exports.askForModule(type, that, function(module) {
         exports.askForDir(type, that, module, ownDir, cb);
     });*/
};


exports.saveAsSubSection = function(generator) {
    var sections = generator.config.get('sub-sections');
    if (!sections) {
        sections = [];
    }
    console.log(sections);
    //added code to maintain linux/windows compatiblility
    var normalizedDir = generator.dir.replace('\\', '/');
    normalizedDir = normalizedDir.substring(0, normalizedDir.length - 1) + '/';
    sections.push({
        name: _.camelize(generator.name),
        dir: normalizedDir
    });
    generator.config.set('sub-sections', sections);
    console.log('writing to save ');
    generator.config.save();
}