import * as cluster from "cluster"
import * as express from "express"
import * as parser from "body-parser"
import * as os from "os"
import * as mkdirp from "mkdirp"
import * as yargs from "yargs"
import * as pgPromise from "pg-promise"
import * as pgtools from "pgtools"
import * as Ajv from "ajv"

const argv = yargs.argv

argv.name = argv.name || process.env.SCRIBE_APP_NAME || process.env.HOSTNAME || "localhost"
argv.home = argv.home || process.env.SCRIBE_APP_HOME || process.cwd()
argv.port = argv.port || process.env.SCRIBE_APP_PORT || process.env.PORT || 1337
argv.mode = argv.mode || process.env.SCRIBE_APP_MODE || process.env.NODE_MODE || "development"
argv.dbHost = argv.dbHost || process.env.SCRIBE_APP_DB_HOST || "localhost"
argv.dbPass = argv.dbPass || process.env.SCRIBE_APP_DB_PASS || ""
argv.dbUser = argv.dbUser || process.env.SCRIBE_APP_DB_USER || ""
argv.dbPort = argv.dbPort || process.env.SCRIBE_APP_DB_PORT || 5432
argv.dbName = argv.dbName || process.env.SCRIBE_APP_DB_NAME || "scribe"

const dbConfig = {
    user: argv.dbUser,
    password: argv.dbPass,
    port: argv.dbPort,
    host: argv.dbHost,
    database: argv.dbName
}

if (cluster.isMaster) {
    pgtools.createdb(dbConfig, argv.dbName).then(res => {
        console.log(res)
    }).catch(err => {
        if (err.pgErr.code != "42P04") {
            console.error(err)
        }
    })

    let cores = os.cpus()

    for (let i = 0; i < cores.length; i++) {
        cluster.fork()
    }

    cluster.on("exit", worker => {
        cluster.fork()
    })

} else {
   createServer()
}

export function createServer() {
    class DB {
        private db: pgPromise.IDatabase<{}>
    
        constructor(){
            const pgp:pgPromise.IMain = pgPromise({})
            this.db = pgp(dbConfig)
        }

        private formatQueryData(data: JSON, schema: any){
            var queryData = {
                sqlColumnSchemas: [],
                sqlColumnNames: [],
                sqlColumnIndexes: [],
                dataArray: []
            }

            Object.keys(schema.properties).forEach(function(key, index){
                queryData.sqlColumnNames.push(key)
                queryData.sqlColumnIndexes.push(`$${index+1}`)
                // TODO sanitize data input
                queryData.dataArray.push(JSON.stringify(data[key]))
                var property = schema.properties[key]

                switch (property.type) {
                    case "integer":
                        queryData.sqlColumnSchemas.push(`${key} integer`)
                        break;

                    case "string":
                        if (property.format === "date-time"){
                            queryData.sqlColumnSchemas.push(`${key} timestamp`)
                        }
                        else {
                            queryData.sqlColumnSchemas.push(`${key} text`)
                        }

                        break;

                    case "object":
                        queryData.sqlColumnSchemas.push(`${key} json`)
                    
                    default:
                        break;
                }
            })

            return queryData;
        }
    
        public async createSingle(component: string, data: JSON, schema: any){
            // make table and record for info sent
            let queryData = this.formatQueryData(data, schema)
            
            var createQuery = `CREATE TABLE IF NOT EXISTS ${component}(id serial PRIMARY KEY, ${queryData.sqlColumnSchemas.join(",")})`
            var insertQuery = `INSERT INTO ${component}(${queryData.sqlColumnNames.join(",")}) values(${queryData.sqlColumnIndexes.join(",")}) RETURNING *`
            try {
                await this.db.query(createQuery)
                let result = await this.db.query(insertQuery, queryData.dataArray)
                return result;
            } catch (err){
                return err;
            }
        }
    
        public async getAll(component: string){
            var getQuery = `SELECT * FROM ${component}`
            try {
                let response = await this.db.query(getQuery)
                return response;
            } catch (err){
                return err;
            }
        }
    
        public async getSingle(component: string, id:string){
            var getQuery = `SELECT * FROM ${component} WHERE id=$1`
            try {
                let response = await this.db.query(getQuery, id)
                return response;
            } catch (err){
                return err;
            }
        }
    
        public getSingleHistory(component: string, id:string){
    
        }
    
        public async updateSingle(component: string, id: string, data: JSON, schema: object){
            let queryData = this.formatQueryData(data, schema)

            var updateQuery = `UPDATE ${component} SET (${queryData.sqlColumnNames.join(",")}) = (${queryData.sqlColumnIndexes.join(",")}) WHERE id = ${id} RETURNING *`
            try {
                let result = await this.db.query(updateQuery, queryData.dataArray)
                return result;
            } catch (err){
                return err;
            }
        }
    
        public async deleteSingle(component: string, id: string){
            var deleteQuery = `DELETE FROM ${component} WHERE id=$1`
            try {
                let response = await this.db.query(deleteQuery, id)
                return response;
            } catch (err){
                return err;
            }
        }
    
        public async deleteAll(component: string){
            var deleteAllQuery = `DROP TABLE IF EXISTS ${component}`
            try {
                let response = await this.db.query(deleteAllQuery)
                return response;
            } catch (err){
                return err;
            }
        }
    }

    const scribe = express()
    scribe.locals.argv = argv
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

    const ajv = new Ajv();
    const schema = require("./default.table.schema.json")
    const validate = ajv.compile(schema)
    let db = new DB()

    scribe.post("/v0/:component", parser.json(), (req, res, next) => {

        // sanity check json body
        if (validate(req.body) === false){
            res.statusCode = 400
            res.send(validate.errors)
            return;
        }

        db.createSingle(req.params.component, req.body, schema).then(result => {
            res.send(result)
        })

        // send response success or fail
    })

    scribe.delete("/v0/:component", parser.urlencoded({ extended: true }), (req, res, next) => {
        // delete table if it exists
        db.deleteAll(req.params.component).then(result => {
            res.send(result)
        })
        // send response success or fail
    })

    scribe.get("/v0/:component/all", parser.urlencoded({ extended: true }), (req, res, next) => {
        // get all
        db.getAll(req.params.component).then(result => {
            res.send(result)
        })
        // fail if component doesn't exist
        // returns array always
    })

    scribe.get("/v0/:component/:id", parser.urlencoded({ extended: true }), (req, res, next) => {
        // get id
        db.getSingle(req.params.component, req.params.id).then(result => {
            res.send(result)
        })
        // fail if component doesn't exist
        // returns array always
    })

    scribe.get("/v0/:component/:id/history", parser.urlencoded({ extended: true }), (req, res, next) => {
        // get history of id
        db.getSingleHistory(req.params.component, req.params.id)
        // fail if component doesn't exist
        // returns array always
    })
    
    scribe.put("/v0/:component/:id", parser.json(), (req, res, next) => {
        // sanity check json body
        if (validate(req.body) === false){
            res.statusCode = 400
            res.send(validate.errors)
            return;
        }

        // update id if it exists
        db.updateSingle(req.params.component, req.params.id, req.body, schema).then(result => {
            res.send(result)
        })
    })

    scribe.delete("/v0/:component/:id", parser.urlencoded({ extended: true }), (req, res, next) => {
        // delete id if it exists
        // fail if it doesn't exist
        db.deleteSingle(req.params.component, req.params.id).then(result => {
            res.send(result)
        })
    })

    return scribe.listen(argv.port, () => {
        console.log("Scribe - Process: %sd, Name: %s, Home: %s, Port: %d, Mode: %s",
            process.pid,
            argv.name,
            argv.home,
            argv.port,
            argv.mode
        )
    })
}
