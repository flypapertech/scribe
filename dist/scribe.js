"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const pgPromise = require("pg-promise");
const express = require("express");
const Ajv = require("ajv");
const diff_match_patch_1 = require("diff-match-patch");
const axios_1 = require("axios");
const mkdirp = require("mkdirp");
const yargs = require("yargs");
const pgtools = require("pgtools");
const get = (p, o) => p.split(".").reduce((xs, x) => (xs && xs[x]) ? xs[x] : null, o);
const argv = yargs.env("SCRIBE_APP")
    .option("n", {
    alias: "name",
    default: process.env.HOSTNAME || "localhost"
})
    .option("m", {
    alias: "mode",
    default: process.env.NODE_ENV || "development",
})
    .option("h", {
    alias: "home",
    default: process.cwd()
})
    .option("p", {
    alias: "port",
    default: 1337
})
    .option("dbHost", {
    default: "localhost"
})
    .option("dbPass", {
    default: ""
})
    .option("dbUser", {
    default: ""
})
    .option("dbPort", {
    default: 5432
})
    .option("dbName", {
    default: "scribe"
})
    .option("schemaBaseUrl", {
    default: "http://localhost:8080/"
}).argv;
function createServer(schemaOverride = undefined) {
    return __awaiter(this, void 0, void 0, function* () {
        const dbCreateConfig = {
            user: argv.dbUser,
            password: argv.dbPass,
            port: argv.dbPort,
            host: argv.dbHost
        };
        try {
            let res = yield pgtools.createdb(dbCreateConfig, argv.dbName);
            console.log(res);
        }
        catch (err) {
            if (err.pgErr === undefined || err.pgErr.code !== "42P04") {
                console.error(err);
            }
        }
        const dbConnectConfig = Object.assign({}, dbCreateConfig, { database: argv.dbName });
        const pgp = pgPromise({});
        const postgresDb = pgp(dbConnectConfig);
        const scribe = express();
        if (argv.mode === "production") {
            mkdirp.sync(argv.home + "/cache/");
            mkdirp.sync(argv.home + "/logs/");
            scribe.use(require("express-bunyan-logger")({
                name: argv.name,
                streams: [
                    {
                        level: "error",
                        stream: process.stderr
                    },
                    {
                        level: "info",
                        type: "rotating-file",
                        path: argv.home + `/logs/${argv.name}.${process.pid}.json`,
                        period: "1d",
                        count: 365
                    }
                ],
            }));
        }
        let db = new DB(postgresDb, schemaOverride);
        scribe.post("/:component/:subcomponent", express.json(), (req, res, next) => __awaiter(this, void 0, void 0, function* () {
            let componentSchema = yield db.getComponentSchema(`${req.params.component}/${req.params.subcomponent}`);
            // sanity check json body
            if (componentSchema.validator(req.body) === false) {
                res.status(400).send(componentSchema.validator.errors);
                return;
            }
            db.createSingle(`${req.params.component}_${req.params.subcomponent}`, req.body, componentSchema.schema).then(result => {
                res.send(result);
            });
            // send response success or fail
        }));
        scribe.post("/:component", express.json(), (req, res, next) => __awaiter(this, void 0, void 0, function* () {
            let componentSchema = yield db.getComponentSchema(req.params.component);
            // sanity check json body
            if (componentSchema.validator(req.body) === false) {
                res.status(400).send(componentSchema.validator.errors);
                return;
            }
            db.createSingle(req.params.component, req.body, componentSchema.schema).then(result => {
                res.send(result);
            });
            // send response success or fail
        }));
        scribe.get("/:component/:subcomponent/all", (req, res, next) => {
            // get all
            db.getAll(`${req.params.component}_${req.params.subcomponent}`, req.query.filter, req.query.groupBy).then(result => {
                res.send(result);
            });
            // fail if component doesn't exist
            // returns array always
        });
        scribe.get("/:component/all", (req, res, next) => {
            // get all
            db.getAll(req.params.component, req.query.filter, req.query.groupBy).then(result => {
                res.send(result);
            });
            // fail if component doesn't exist
            // returns array always
        });
        scribe.get("/:component/:subcomponent/all/history", (req, res, next) => {
            // get all
            db.getAllHistory(`${req.params.component}_${req.params.subcomponent}`, req.query.filter, req.query.groupBy).then(result => {
                res.send(result);
            });
            // fail if component doesn't exist
            // returns array always
        });
        scribe.get("/:component/all/history", (req, res, next) => {
            // get all
            db.getAllHistory(req.params.component, req.query.filter, req.query.groupBy).then(result => {
                res.send(result);
            });
            // fail if component doesn't exist
            // returns array always
        });
        scribe.get("/:component/:subcomponent/:id", (req, res, next) => {
            // get id
            db.getSingle(`${req.params.component}_${req.params.subcomponent}`, req.params.id).then(result => {
                res.send(result);
            });
            // fail if component doesn't exist
            // returns array always
        });
        scribe.get("/:component/:id", (req, res, next) => {
            // get id
            db.getSingle(req.params.component, req.params.id).then(result => {
                res.send(result);
            });
            // fail if component doesn't exist
            // returns array always
        });
        scribe.get("/:component/:subcomponent/:id/history", (req, res, next) => {
            // get history of id
            db.getSingleHistory(`${req.params.component}_${req.params.subcomponent}`, req.params.id).then(result => {
                res.send(result);
            });
            // fail if component doesn't exist
            // returns array always
        });
        scribe.get("/:component/:id/history", (req, res, next) => {
            // get history of id
            db.getSingleHistory(req.params.component, req.params.id).then(result => {
                res.send(result);
            });
            // fail if component doesn't exist
            // returns array always
        });
        scribe.put("/:component/:subcomponent/:id", express.json(), (req, res, next) => __awaiter(this, void 0, void 0, function* () {
            // sanity check json body
            let componentSchema = yield db.getComponentSchema(`${req.params.component}/${req.params.subcomponent}`);
            // sanity check json body
            if (componentSchema.validator(req.body) === false) {
                res.status(400).send(componentSchema.validator.errors);
                return;
            }
            // update id if it exists
            db.updateSingle(`${req.params.component}_${req.params.subcomponent}`, req.params.id, req.body, componentSchema.schema).then(result => {
                res.send(result);
            });
        }));
        scribe.put("/:component/:id", express.json(), (req, res, next) => __awaiter(this, void 0, void 0, function* () {
            // sanity check json body
            let componentSchema = yield db.getComponentSchema(req.params.component);
            // sanity check json body
            if (componentSchema.validator(req.body) === false) {
                res.status(400).send(componentSchema.validator.errors);
                return;
            }
            // update id if it exists
            db.updateSingle(req.params.component, req.params.id, req.body, componentSchema.schema).then(result => {
                res.send(result);
            });
        }));
        scribe.delete("/:component/:subcomponent/all", (req, res, next) => {
            // delete id if it exists
            // fail if it doesn't exist
            db.deleteAll(`${req.params.component}_${req.params.subcomponent}`).then(result => {
                res.send(result);
            });
        });
        scribe.delete("/:component/all", (req, res, next) => {
            // delete id if it exists
            // fail if it doesn't exist
            db.deleteAll(req.params.component).then(result => {
                res.send(result);
            });
        });
        scribe.delete("/:component/:subcomponent/:id", (req, res, next) => {
            // delete id if it exists
            // fail if it doesn't exist
            db.deleteSingle(`${req.params.component}_${req.params.subcomponent}`, req.params.id).then(result => {
                res.send(result);
            });
        });
        scribe.delete("/:component/:id", (req, res, next) => {
            // delete id if it exists
            // fail if it doesn't exist
            db.deleteSingle(req.params.component, req.params.id).then(result => {
                res.send(result);
            });
        });
        scribe.delete("/:component/:subcomponent", (req, res, next) => {
            // let :id route fall through
            if (parseInt(req.params.subcomponent) !== NaN) {
                next();
                return;
            }
            // delete table if it exists
            db.dropTable(`${req.params.component}_${req.params.subcomponent}`).then(result => {
                res.send(result);
            });
            // send response success or fail
        });
        scribe.delete("/:component", (req, res, next) => {
            // delete table if it exists
            db.dropTable(req.params.component).then(result => {
                res.send(result);
            });
            if (req.query.recursive) {
                // TODO find and delete all subcomponents
            }
            // send response success or fail
        });
        scribe.get("/", (req, res, next) => {
            res.statusCode = 200;
            res.send();
        });
        scribe.all("*", (req, res, next) => {
            res.status(400).send("Unhandled Route");
        });
        let scribeServer = scribe.listen(argv.port, () => {
            console.log("Scribe - Process: %sd, Name: %s, Home: %s, Port: %d, Mode: %s, DB Name: %s", process.pid, argv.name, argv.home, argv.port, argv.mode, argv.dbName);
        });
        scribeServer.on("close", () => {
            postgresDb.$pool.end();
        });
        return scribeServer;
    });
}
exports.createServer = createServer;
class DB {
    constructor(db, schemaOverride = undefined) {
        this.db = db;
        let defaultSchema = schemaOverride;
        if (schemaOverride === undefined) {
            defaultSchema = require(__dirname + "/default.table.schema.json");
        }
        this.defaultSchema = defaultSchema;
    }
    getComponentSchema(component) {
        return __awaiter(this, void 0, void 0, function* () {
            const ajv = new Ajv();
            let defaultSchema = {
                "schema": this.defaultSchema,
                "validator": ajv.compile(this.defaultSchema)
            };
            if (argv.schemaBaseUrl === undefined) {
                return defaultSchema;
            }
            // TODO should this fall back or error? If scribe can't contact the server then should we be allowing random data in?
            try {
                let response = yield axios_1.default.get(`${argv.schemaBaseUrl}${component}/schema`);
                if (response.data === undefined) {
                    return defaultSchema;
                }
                return {
                    schema: response.data,
                    validator: ajv.compile(response.data)
                };
            }
            catch (err) {
                // console.error(err)
            }
            return defaultSchema;
        });
    }
    formatQueryData(data, schema) {
        let queryData = {
            sqlColumnSchemas: [],
            sqlColumnNames: [],
            sqlColumnIndexes: [],
            dataArray: []
        };
        let ignoredKeyCount = 0;
        Object.keys(schema.properties).forEach(function (key, index) {
            if (key !== "id") {
                queryData.sqlColumnNames.push(key);
                queryData.sqlColumnIndexes.push(`$${index - ignoredKeyCount + 1}`);
                // TODO sanitize data input
                queryData.dataArray.push(JSON.stringify(data[key]));
                let property = schema.properties[key];
                switch (property.type) {
                    case "integer":
                        queryData.sqlColumnSchemas.push(`${key} integer`);
                        break;
                    case "string":
                        if (property.format === "date-time") {
                            queryData.sqlColumnSchemas.push(`${key} timestamptz`);
                        }
                        else {
                            queryData.sqlColumnSchemas.push(`${key} text`);
                        }
                        break;
                    case "object":
                        queryData.sqlColumnSchemas.push(`${key} json`);
                        break;
                    case "number":
                        queryData.sqlColumnSchemas.push(`${key} float8`);
                        break;
                    default:
                        break;
                }
            }
            else {
                ignoredKeyCount++;
            }
        });
        return queryData;
    }
    createSingle(component, data, schema) {
        return __awaiter(this, void 0, void 0, function* () {
            // make table and record for info sent
            let queryData = this.formatQueryData(data, schema);
            let createQuery = `CREATE TABLE IF NOT EXISTS ${component}(id serial PRIMARY KEY, ${queryData.sqlColumnSchemas.join(",")})`;
            let createHistoryQuery = `CREATE TABLE IF NOT EXISTS ${component}_history(id serial PRIMARY KEY, foreignKey integer REFERENCES ${component} (id) ON DELETE CASCADE, patches json)`;
            let ensureAllColumnsExistQuery = `ALTER TABLE ${component} ADD COLUMN IF NOT EXISTS ${queryData.sqlColumnSchemas.join(", ADD COLUMN IF NOT EXISTS ")}`;
            let insertQuery = `INSERT INTO ${component}(${queryData.sqlColumnNames.join(",")}) values(${queryData.sqlColumnIndexes.join(",")}) RETURNING *`;
            let insertHistoryQuery = `INSERT INTO ${component}_history(foreignKey, patches) values($1, CAST ($2 AS JSON)) RETURNING *`;
            try {
                yield this.db.query(createQuery);
                yield this.db.query(createHistoryQuery);
                yield this.db.query(ensureAllColumnsExistQuery);
                let result = yield this.db.query(insertQuery, queryData.dataArray);
                let resultString = JSON.stringify(result[0]);
                const dmp = new diff_match_patch_1.diff_match_patch();
                let diff = dmp.patch_make(resultString, "");
                let diffValues = [result[0].id, JSON.stringify([dmp.patch_toText(diff)])];
                let historyResult = yield this.db.query(insertHistoryQuery, diffValues);
                return result;
            }
            catch (err) {
                console.log(err);
                return [];
            }
        });
    }
    getAll(component, filter, groupBy) {
        return __awaiter(this, void 0, void 0, function* () {
            let getQuery = `SELECT * FROM ${component} ORDER BY id`;
            try {
                let response = yield this.db.query(getQuery);
                let filteredResponse = [];
                if (!filter) {
                    filteredResponse = response;
                }
                else {
                    try {
                        filter = JSON.parse(filter);
                        for (let i = 0; i < response.length; i++) {
                            let matchedFilters = 0;
                            let filterCount = Object.keys(filter).length;
                            for (let key in filter) {
                                let entryValue = get(key, response[i]);
                                if (entryValue) {
                                    let filterArray;
                                    if (filter[key] instanceof Array) {
                                        filterArray = filter[key];
                                    }
                                    else {
                                        filterArray = [filter[key]];
                                    }
                                    if (filterArray.find(x => JSON.stringify(x) === JSON.stringify(entryValue))) {
                                        matchedFilters++;
                                    }
                                }
                            }
                            if (matchedFilters === filterCount) {
                                filteredResponse.push(response[i]);
                            }
                        }
                    }
                    catch (err) {
                        console.error(err);
                        console.error("Failed to apply filter: ");
                        console.error(filter);
                    }
                }
                if (groupBy && typeof groupBy === "string") {
                    filteredResponse = filteredResponse.reduce((grouped, item) => {
                        let key = get(groupBy, item);
                        grouped[key] = grouped[key] || [];
                        grouped[key].push(item);
                        return grouped;
                    }, {});
                }
                return filteredResponse;
            }
            catch (err) {
                console.error(err);
                return [];
            }
        });
    }
    getSingle(component, id) {
        return __awaiter(this, void 0, void 0, function* () {
            let getQuery = `SELECT * FROM ${component} WHERE id=$1 ORDER BY id`;
            try {
                let response = yield this.db.query(getQuery, id);
                return response;
            }
            catch (err) {
                console.error(err);
                return [];
            }
        });
    }
    getSingleHistory(component, id) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                let rawHistory = yield this.getSingleHistoryRaw(component, id);
                rawHistory = rawHistory[0];
                let currentVersion = yield this.getSingle(component, id);
                currentVersion = JSON.stringify(currentVersion[0]);
                const dmp = new diff_match_patch_1.diff_match_patch();
                let oldVersions = [];
                oldVersions.push(JSON.parse(currentVersion));
                // ignore original empty object hence >= 1
                for (let i = rawHistory.patches.length - 1; i >= 1; i--) {
                    currentVersion = dmp.patch_apply(dmp.patch_fromText(rawHistory.patches[i]), currentVersion)[0];
                    oldVersions.push(JSON.parse(currentVersion));
                }
                return oldVersions;
            }
            catch (err) {
                console.error(err);
                return [];
            }
        });
    }
    getAllHistory(component, filter, groupBy) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                let allRows = yield this.getAll(component, filter, groupBy);
                let allHistory = [];
                for (let entry of allRows) {
                    // TODO speed this up by hitting the db only once
                    let history = yield this.getSingleHistory(component, entry.id);
                    allHistory.push({
                        "id": entry.id,
                        "history": history
                    });
                }
                return allHistory;
            }
            catch (err) {
                console.error(err);
                return [];
            }
        });
    }
    updateSingle(component, id, data, schema) {
        return __awaiter(this, void 0, void 0, function* () {
            let queryData = this.formatQueryData(data, schema);
            let updateQuery = `UPDATE ${component} SET (${queryData.sqlColumnNames.join(",")}) = (${queryData.sqlColumnIndexes.join(",")}) WHERE id = ${id} RETURNING *`;
            let updateHistoryQuery = `UPDATE ${component}_history SET patches = $1 WHERE foreignKey = ${id} RETURNING *`;
            let ensureAllColumnsExistQuery = `ALTER TABLE ${component} ADD COLUMN IF NOT EXISTS ${queryData.sqlColumnSchemas.join(", ADD COLUMN IF NOT EXISTS ")}`;
            try {
                let oldVersion = yield this.getSingle(component, id);
                let oldHistory = yield this.getSingleHistoryRaw(component, id);
                yield this.db.query(ensureAllColumnsExistQuery);
                let result = yield this.db.query(updateQuery, queryData.dataArray);
                const dmp = new diff_match_patch_1.diff_match_patch();
                let diff = dmp.patch_make(JSON.stringify(result[0]), JSON.stringify(oldVersion[0]));
                oldHistory[0].patches.push(dmp.patch_toText(diff));
                let historyResult = yield this.db.query(updateHistoryQuery, JSON.stringify(oldHistory[0].patches));
                return result;
            }
            catch (err) {
                console.error(err);
                return [];
            }
        });
    }
    deleteSingle(component, id) {
        return __awaiter(this, void 0, void 0, function* () {
            let deleteQuery = `DELETE FROM ${component} WHERE id=$1`;
            try {
                let response = yield this.db.query(deleteQuery, id);
                return response;
            }
            catch (err) {
                console.error(err);
                return [];
            }
        });
    }
    deleteAll(component) {
        return __awaiter(this, void 0, void 0, function* () {
            let deleteQuery = `TRUNCATE ${component} RESTART IDENTITY CASCADE`;
            try {
                let response = yield this.db.query(deleteQuery);
                return response;
            }
            catch (err) {
                console.error(err);
                return [];
            }
        });
    }
    dropTable(component) {
        return __awaiter(this, void 0, void 0, function* () {
            let deleteAllQuery = `DROP TABLE IF EXISTS ${component}, ${component}_history`;
            try {
                let response = yield this.db.query(deleteAllQuery);
                return response;
            }
            catch (err) {
                console.error(err);
                return [];
            }
        });
    }
    getSingleHistoryRaw(component, id) {
        return __awaiter(this, void 0, void 0, function* () {
            let getQuery = `SELECT * FROM ${component}_history WHERE foreignKey=$1`;
            try {
                let response = yield this.db.query(getQuery, id);
                return response;
            }
            catch (err) {
                return err;
            }
        });
    }
}
