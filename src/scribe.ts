import pgPromise = require("pg-promise")
import express = require("express")
import Ajv = require("ajv")
import { diff_match_patch } from "diff-match-patch"
import Axios from "axios"
import mkdirp = require("mkdirp")
import yargs = require("yargs")
import { DateTime } from "luxon"
import { RedisClient } from "redis"
const {promisify} = require("util")


const pgtools = require("pgtools")

const get = (p: string, o: any) =>
    p.split(".").reduce((xs: any, x: any) => (xs && xs[x]) ? xs[x] : null, o)

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
    .option("requireSchema", {
        default: false
    })
    .option("redisHost", {
        default: "127.0.0.1"
    })
    .option("redisPort", {
        default: 6379
    })
    .option("redisSchemaDb", {
        default: 1
    })
    .option("schemaBaseUrl", {
        default: "http://localhost:8080/"
    }).argv

interface Schemas {
    [key: string]: ComponentSchema
}

interface ComponentSchema {
    schema: object,
    validator: Ajv.ValidateFunction
}

export async function createServer(schemaOverride: any = undefined) {
    const dbCreateConfig = {
        user: argv.dbUser,
        password: argv.dbPass,
        port: argv.dbPort,
        host: argv.dbHost
    }

    try {
        let res = await pgtools.createdb(dbCreateConfig, argv.dbName)
        console.log(res)
    }
    catch (err) {
        if (err.pgErr === undefined || err.pgErr.code !== "42P04") {
            console.error(err)
        }
    }

    const dbConnectConfig = Object.assign({}, dbCreateConfig, { database: argv.dbName })
    const pgp: pgPromise.IMain = pgPromise({})
    const postgresDb: pgPromise.IDatabase<{}> =  pgp(dbConnectConfig)

    const scribe = express()
    if (argv.mode === "production") {

        mkdirp.sync(argv.home + "/cache/")
        mkdirp.sync(argv.home + "/logs/")

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
        }))
    }

    let db = new DB(postgresDb, schemaOverride)

    scribe.post("/:component/all", express.json(), (req, res, next) => {
        // get all
        db.getAll(req.params.component, req.query, req.body, res).then(result => {
            res.send(result)
        })
        // fail if component doesn't exist
        // returns array always
    })

    scribe.post("/:component/:subcomponent/all", express.json(), (req, res, next) => {
        // get all
        db.getAll(`${req.params.component}_${req.params.subcomponent}`, req.query, req.body, res).then(result => {
            res.send(result)
        })
        // fail if component doesn't exist
        // returns array always
    })

    scribe.post("/:component/:subcomponent", express.json(), async (req, res, next) => {

        const componentSchema = await db.getComponentSchema(`${req.params.component}/${req.params.subcomponent}`)
        if (typeof componentSchema === "string") {
            res.status(500).send(componentSchema)
            return
        }

        // sanity check json body
        if (componentSchema.validator(req.body) === false) {
            res.status(400).send(componentSchema.validator.errors)
            return
        }

        db.createSingle(`${req.params.component}_${req.params.subcomponent}`, req.body, componentSchema.schema).then(result => {
            res.send(result)
        })
        // send response success or fail
    })

    scribe.post("/:component", express.json(), async (req, res, next) => {

        const componentSchema = await db.getComponentSchema(req.params.component)
        if (typeof componentSchema === "string") {
            res.status(500).send(componentSchema)
            return
        }
        // sanity check json body
        if (componentSchema.validator(req.body) === false) {
            res.status(400).send(componentSchema.validator.errors)
            return;
        }

        db.createSingle(req.params.component, req.body, componentSchema.schema).then(result => {
            res.send(result)
        })

        // send response success or fail
    })

    scribe.get("/:component/:subcomponent/all", express.json(), (req, res, next) => {
        // get all
        db.getAll(`${req.params.component}_${req.params.subcomponent}`, req.query, req.body, res).then(result => {
            res.send(result)
        })
        // fail if component doesn't exist
        // returns array always
    })

    scribe.get("/:component/all", express.json(), (req, res, next) => {
        // get all
        db.getAll(req.params.component, req.query, req.body, res).then(result => {
            res.send(result)
        })
        // fail if component doesn't exist
        // returns array always
    })

    scribe.get("/:component/:subcomponent/:id", (req, res, next) => {
        // get id
        db.getSingle(`${req.params.component}_${req.params.subcomponent}`, req.params.id, {}, {}, res).then(result => {
            res.send(result)
        })
        // fail if component doesn't exist
        // returns array always
    })

    scribe.get("/:component/:id", (req, res, next) => {
        // get id
        db.getSingle(req.params.component, req.params.id, {}, {}, res).then(result => {
            res.send(result)
        })
        // fail if component doesn't exist
        // returns array always
    })

    scribe.put("/:component/:subcomponent/:id", express.json(), async (req, res, next) => {
        // sanity check json body
        const componentSchema = await db.getComponentSchema(`${req.params.component}/${req.params.subcomponent}`)
        if (typeof componentSchema === "string") {
            res.status(500).send(componentSchema)
            return
        }
        // sanity check json body
        if (componentSchema.validator(req.body) === false) {
            res.status(400).send(componentSchema.validator.errors)
            return;
        }

        // update id if it exists
        db.updateSingle(`${req.params.component}_${req.params.subcomponent}`, req.params.id, req.body, componentSchema.schema, res).then(result => {
            res.send(result)
        })
    })

    scribe.put("/:component/:id", express.json(), async (req, res, next) => {
        // sanity check json body
        const componentSchema = await db.getComponentSchema(req.params.component)
        if (typeof componentSchema === "string") {
            res.status(500).send(componentSchema)
            return
        }

        // sanity check json body
        if (componentSchema.validator(req.body) === false) {
            res.status(400).send(componentSchema.validator.errors)
            return;
        }

        // update id if it exists
        db.updateSingle(req.params.component, req.params.id, req.body, componentSchema.schema, res).then(result => {
            res.send(result)
        })
    })
    scribe.delete("/:component/:subcomponent/all", (req, res, next) => {
        // delete id if it exists
        // fail if it doesn't exist
        db.deleteAll(`${req.params.component}_${req.params.subcomponent}`, res).then(result => {
            res.send(result)
        })
    })

    scribe.delete("/:component/all", (req, res, next) => {
        // delete id if it exists
        // fail if it doesn't exist
        db.deleteAll(req.params.component, res).then(result => {
            res.send(result)
        })
    })

    scribe.delete("/:component/:subcomponent/:id", (req, res, next) => {
        // delete id if it exists
        // fail if it doesn't exist
        db.deleteSingle(`${req.params.component}_${req.params.subcomponent}`, req.params.id, res).then(result => {
            res.send(result)
        })
    })

    scribe.delete("/:component/:id", (req, res, next) => {
        // allow :subcomponent route to fall through
        if (Number.isNaN(Number.parseInt(req.params.id))) {
            next()
            return
        }
        // fail if it doesn't exist
        db.deleteSingle(req.params.component, req.params.id, res).then(result => {
            res.send(result)
        })
    })

    scribe.delete("/:component/:subcomponent", (req, res, next) => {
        // delete table if it exists
        db.dropTable(`${req.params.component}_${req.params.subcomponent}`, res).then(result => {
            res.send(result)
        })
        // send response success or fail
    })

    scribe.delete("/:component", (req, res, next) => {
        // delete table if it exists
        db.dropTable(req.params.component, res).then(result => {
            res.send(result)
        })

        if (req.query.recursive) {
            // TODO find and delete all subcomponents
        }

        // send response success or fail
    })

    scribe.get("/", (req, res, next) => {
        res.statusCode = 200
        res.send()
    })

    scribe.all("*", (req, res, next) => {
        res.status(400).send("Unhandled Route")
    })

   let scribeServer = scribe.listen(argv.port, () => {
        console.log("Scribe - Process: %sd, Name: %s, Home: %s, Port: %d, Mode: %s, DB Name: %s",
            process.pid,
            argv.name,
            argv.home,
            argv.port,
            argv.mode,
            argv.dbName
        )
    })

    scribeServer.on("close", () => {
        postgresDb.$pool.end()
    })

    return scribeServer
}

class DB {
    private db: pgPromise.IDatabase<{}>
    private defaultSchema: object
    private schemaCache: RedisClient
    private schemaGetAsync: any

    constructor(db: pgPromise.IDatabase<{}>, schemaOverride: any = undefined) {
        this.db = db
        let defaultSchema = schemaOverride
        if (schemaOverride === undefined) {
            defaultSchema = require(__dirname + "/default.table.schema.json")
        }

        this.defaultSchema = defaultSchema
        this.schemaCache = new RedisClient({
            host: argv.redisHost,
            port: argv.redisPort,
            db: argv.redisSchemaDb,
        })

        // flush the schema cache upon startup
        this.schemaCache.flushdb()
        this.schemaGetAsync = promisify(this.schemaCache.get).bind(this.schemaCache)
    }

    public async getComponentSchema(component: string): Promise<ComponentSchema | string> {
        const ajv = new Ajv({
            loadSchema: async (uri: string) => {
                try {
                    const res = await Axios.get(uri)
                    return res.data
                }
                catch (error) {
                    throw new Error("Loading error: " + error)
                }
            }
        })

        const storedSchemaString = await this.schemaGetAsync(component)

        if (storedSchemaString) {
            try {
                const schemaObject = JSON.parse(storedSchemaString)
                const validator = await ajv.compileAsync(schemaObject)
                console.log("Using cached schema for " + component)
                return {
                    "schema": schemaObject,
                    validator
                }
            }
            catch(error) {
                console.log(`Cached schema for ${component} is corrupt, querying for it again`)
            }
        }
        else {
            console.log(`No cache entry for ${component} schema, requesting schema from server`)
        }

        let defaultSchema = {
            "schema": this.defaultSchema,
            "validator": ajv.compile(this.defaultSchema)
        }

        if (argv.schemaBaseUrl === undefined) {
            if (!argv.requireSchema) {
                return defaultSchema
            }

            return "Missing Schema Base Url"
        }

        // TODO should this fall back or error? If scribe can't contact the server then should we be allowing random data in?
        try {
            const schemaUrl = `${argv.schemaBaseUrl}${component}/schema`
            let response = await Axios.get(schemaUrl)

            if (response.data === undefined) {
                if (!argv.requireSchema) {
                    console.warn("No schema found, falling back to default schema")
                    return defaultSchema
                }
                return "Failed to get schema at " + schemaUrl
            }

            const validator = await ajv.compileAsync(response.data)
            this.schemaCache.set(component, JSON.stringify(response.data))
            return {
                schema: response.data,
                validator
            }
        }
        catch (err) {
            console.error(err)
        }

        if (!argv.requireSchema) {
            console.warn("Falling back to default schema")
            return defaultSchema
        }

        return "Failed to look up schema"
    }

    private formatQueryData(data: any, schema: any) {
        let queryData = {
            sqlColumnSchemas: [] as string[],
            sqlColumnNames: [] as string[],
            sqlColumnIndexes: [] as string[],
            dataArray: [] as string[]
        }

        let ignoredKeyCount = 0
        Object.keys(schema.properties).forEach(function(key, index) {
            if (key !== "id") {
                queryData.sqlColumnNames.push(key)
                queryData.sqlColumnIndexes.push(`$${index - ignoredKeyCount + 1}`)
                // TODO sanitize data input
                queryData.dataArray.push(JSON.stringify(data[key]))
                let property = schema.properties[key]

                switch (property.type) {
                    case "integer":
                        queryData.sqlColumnSchemas.push(`${key} integer`)
                        break;

                    case "string":
                        if (property.format === "date-time") {
                            queryData.sqlColumnSchemas.push(`${key} timestamptz`)
                        }
                        else {
                            queryData.sqlColumnSchemas.push(`${key} text`)
                        }

                        break;

                    case "object":
                        queryData.sqlColumnSchemas.push(`${key} json`)
                        break;

                    case "number":
                        queryData.sqlColumnSchemas.push(`${key} float8`)
                        break;

                    default:
                        break;
                }
            }
            else {
                ignoredKeyCount++;
            }
        })

        return queryData;
    }

    public async createSingle(component: string, data: JSON, schema: object) {
        // make table and record for info sent
        let queryData = this.formatQueryData(data, schema)

        let createQuery = `CREATE TABLE IF NOT EXISTS ${component}(id serial PRIMARY KEY, ${queryData.sqlColumnSchemas.join(",")})`
        let createHistoryQuery = `CREATE TABLE IF NOT EXISTS ${component}_history(id serial PRIMARY KEY, foreignKey integer REFERENCES ${component} (id) ON DELETE CASCADE, patches json)`

        let ensureAllColumnsExistQuery = `ALTER TABLE ${component} ADD COLUMN IF NOT EXISTS ${queryData.sqlColumnSchemas.join(", ADD COLUMN IF NOT EXISTS ")}`

        let insertQuery = `INSERT INTO ${component}(${queryData.sqlColumnNames.join(",")}) values(${queryData.sqlColumnIndexes.join(",")}) RETURNING *`
        let insertHistoryQuery = `INSERT INTO ${component}_history(foreignKey, patches) values($1, CAST ($2 AS JSON)) RETURNING *`
        // TODO do individual try catches so we can roll back the parts that did succeed if needed and so we can res.send error messages
        try {
            await this.db.query(createQuery)
            await this.db.query(createHistoryQuery)
            await this.db.query(ensureAllColumnsExistQuery)
            let result = await this.db.query(insertQuery, queryData.dataArray)
            let resultString = JSON.stringify(result[0])
            const dmp = new diff_match_patch()
            let diff = dmp.patch_make(resultString, "")
            let diffValues = [result[0].id, JSON.stringify([dmp.patch_toText(diff)])]
            let historyResult = await this.db.query(insertHistoryQuery, diffValues)
            return result;
        } catch (err) {
            console.log(err)
            return []
        }
    }
    public async getAll(component: string, query: any, body: any, res: express.Response) {
        try{
            let getQuery = `SELECT * FROM ${component}`
            const filters: string[] = []
            const userFilter = (query.filter) ? query.filter : body.filter
            let filter = undefined
            try {
                filter = (typeof userFilter === "string") ? JSON.parse(userFilter) : userFilter
            }
            catch(error) {
                res.status(400)
                return "Failed to parse filter"
            }

            if (userFilter) {
                for (let key in filter) {
                    const keyParts = key.split(".")
                    let filterArray: Array<any>
                    if (filter[key] instanceof Array) {
                        filterArray = filter[key] as Array<any>
                    }
                    else {
                        filterArray = [filter[key]]
                    }
                    let filterString = keyParts.shift()
                    filterString = pgPromise.as.value(filterString)
                    for(let i = 0; i < keyParts.length; i++) {
                        filterString += `->>${pgPromise.as.text(keyParts[i])}`
                    }
                    const stringifiedfitlerArray = filterArray.map(x => {
                        if (typeof x !== "string") {
                            return `${pgPromise.as.json(x)}`
                        }

                        return `${pgPromise.as.text(x)}`
                    })

                    filters.push(`${filterString} IN (${stringifiedfitlerArray.join(",")})`)
                }
                getQuery += " WHERE " + filters.join(" AND ")
            }
            getQuery += " ORDER BY id"
            let filteredResponse: any[] = await this.db.query(getQuery)
        // if (!query.where) {
        //     getQuery += "WHERE "+ SqlString.escape(query.where)
        // }
        // try {
        //     let response = await this.db.query(getQuery)
        //     let filteredResponse = [] as any[]
        //     if (!query.filter) {
        //         filteredResponse = response
        //     }
        //     else {
        //         let filter = query.filter
        //         try {
        //             filter = JSON.parse(filter)
        //             for (let i = 0; i < response.length; i++) {
        //                 let matchedFilters = 0
        //                 let filterCount = Object.keys(filter).length
        //                 for (let key in filter) {
        //                     let entryValue = get(key, response[i])
        //                     if (entryValue) {
        //                         let filterArray: Array<any>
        //                         if (filter[key] instanceof Array) {
        //                             filterArray = filter[key] as Array<any>
        //                         }
        //                         else {
        //                             filterArray = [filter[key]]
        //                         }

        //                         if (filterArray.find(x => JSON.stringify(x) === JSON.stringify(entryValue))) {
        //                             matchedFilters++
        //                         }
        //                     }
        //                     else {
        //                         // if the object doesn't contain the filter key then ignore the filter
        //                         matchedFilters++
        //                     }
        //                 }

        //                 if (matchedFilters === filterCount) {
        //                     filteredResponse.push(response[i])
        //                 }
        //             }
        //         }
        //         catch (err) {
        //             console.error(err)
        //             console.error("Failed to apply filter: ")
        //             console.error(filter)
        //         }
        //     }

            if (query.timeMachine) {
                let timeMachine = JSON.parse(query.timeMachine)
                if (timeMachine.key && timeMachine.timestamp) {
                    let allHistory = await this.getAllHistory(component, filteredResponse, res)
                    if (typeof allHistory !== "string") {
                        let timestamp = DateTime.fromISO(timeMachine.timestamp)

                        filteredResponse = allHistory.map(history => {
                            return history.history.reduce((historyAtTime, historyEntry) => {
                                let entryDate = get(timeMachine.key, historyEntry)
                                if (!entryDate) {
                                    return historyAtTime
                                }

                                let historyDate = DateTime.fromISO(entryDate)
                                if (historyDate <= timestamp) {
                                    if (historyAtTime) {
                                        if (DateTime.fromISO(historyAtTime.date_modified) > historyDate) {
                                            return historyAtTime
                                        }
                                    }
                
                                    return historyEntry
                                }
                            }, undefined as any | undefined)
                        })
                    }
                }
            }

            if (query.groupBy && typeof query.groupBy === "string") {
                filteredResponse = filteredResponse.reduce((grouped, item) => {
                    let key = get(query.groupBy, item)
                    grouped[key] = grouped[key] || [];
                    grouped[key].push(item);
                    return grouped;
                }, {});
            }

            return filteredResponse;

        } catch (err) {
            console.error(err)
            res.status(500)
            return "Failed to get record"
        }
    }

    public async getSingle(component: string, id: string, query: any, body: any, res: express.Response) {
        query.filter = JSON.stringify({
            id
        })

        try {
            const response = await this.getAll(component, query, body, res)
            return response;
        } catch (err) {
            console.error(err)
            res.status(500)
            return "Failed to get record"
        }
    }

    public async getSingleHistory(component: string, id: string, res: express.Response) {
        try {
            let rawHistory = await this.getSingleHistoryRaw(component, id)
            rawHistory = rawHistory[0]
            let currentVersion: any = await this.getSingle(component, id, {}, {}, res)
            currentVersion = JSON.stringify(currentVersion[0])
            const dmp = new diff_match_patch()
            let oldVersions = []
            oldVersions.push(JSON.parse(currentVersion))
            // ignore original empty object hence >= 1
            for (let i = rawHistory.patches.length - 1; i >= 1; i--) {
                currentVersion = dmp.patch_apply(dmp.patch_fromText(rawHistory.patches[i]), currentVersion)[0]
                oldVersions.push(JSON.parse(currentVersion))
            }

            return oldVersions
        } catch (err) {
            console.error(err)
            res.status(500)
            return "Failed to get record"
        }
    }

    public async getAllHistory(component: string, entries: any[], res: express.Response) {
        try {
            let allHistory = []
            for (let entry of entries) {
                // TODO speed this up by hitting the db only once
                let history = await this.getSingleHistory(component, entry.id, res)
                if (typeof history !== "string") {
                    allHistory.push({
                        "id": entry.id,
                        "history": history
                    })
                }
            }

            return allHistory

        } catch (err) {
            console.error(err)
            res.status(500)
            return "Failed to get records"
        }
    }

    public async updateSingle(component: string, id: string, data: JSON, schema: object, res: express.Response) {
        let queryData = this.formatQueryData(data, schema)

        let updateQuery = `UPDATE ${component} SET (${queryData.sqlColumnNames.join(",")}) = (${queryData.sqlColumnIndexes.join(",")}) WHERE id = ${id} RETURNING *`
        let updateHistoryQuery = `UPDATE ${component}_history SET patches = $1 WHERE foreignKey = ${id} RETURNING *`
        let ensureAllColumnsExistQuery = `ALTER TABLE ${component} ADD COLUMN IF NOT EXISTS ${queryData.sqlColumnSchemas.join(", ADD COLUMN IF NOT EXISTS ")}`
        try {
            let oldVersion = await this.getSingle(component, id, {}, {}, res)
            let oldHistory = await this.getSingleHistoryRaw(component, id)
            await this.db.query(ensureAllColumnsExistQuery)
            let result = await this.db.query(updateQuery, queryData.dataArray)
            const dmp = new diff_match_patch()
            let diff = dmp.patch_make(JSON.stringify(result[0]), JSON.stringify(oldVersion[0]))
            oldHistory[0].patches.push(dmp.patch_toText(diff))
            let historyResult = await this.db.query(updateHistoryQuery, JSON.stringify(oldHistory[0].patches))
            return result;
        } catch (err) {
            console.error(err)
            res.status(500)
            return "Failed to update record"
        }
    }

    public async deleteSingle(component: string, id: string, res: express.Response) {
        let deleteQuery = `DELETE FROM ${component} WHERE id=$1`
        try {
            let response = await this.db.query(deleteQuery, id)
            return response;
        } catch (err) {
            console.error(err)
            res.status(500)
            return "Failed to delete record"
        }
    }

    public async deleteAll(component: string, res: express.Response) {
        let deleteQuery = `TRUNCATE ${component} RESTART IDENTITY CASCADE`
        try {
            let response = await this.db.query(deleteQuery)
            return response;
        } catch (err) {
            console.error(err)
            res.status(500)
            return "Failed to delete records"
        }
    }

    public async dropTable(component: string, res: express.Response) {
        let deleteAllQuery = `DROP TABLE IF EXISTS ${component}, ${component}_history`
        try {
            let response = await this.db.query(deleteAllQuery)
            return response;
        } catch (err) {
            console.error(err)
            res.status(500)
            return "Failed to drop table"
        }
    }

    private async getSingleHistoryRaw(component: string, id: string) {
        let getQuery = `SELECT * FROM ${component}_history WHERE foreignKey=$1`
        try {
            let response = await this.db.query(getQuery, id)
            return response;
        } catch (err) {
            return err;
        }
    }
}
