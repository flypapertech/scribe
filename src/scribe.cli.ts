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
argv.dbPort = argv.dbPort || process.env.SCRIBE_APP_DB_USER || 5432
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
    
        public async createSingle(component: string, data: JSON, schema: any){
            // make table and record for info sent
            var sqlColumnSchemas: string[] = []
            var sqlColumnNames: string[] = []
            var sqlColumnIndexes: string[] = []
            var dataArray: string[] = []
            Object.keys(schema.properties).forEach(function(key, index){
                sqlColumnNames.push(key)
                sqlColumnIndexes.push(`$${index+1}`)
                // TODO sanitize data input
                dataArray.push(JSON.stringify(data[key]))
                var property = schema.properties[key]

                switch (property.type) {
                    case "integer":
                        sqlColumnSchemas.push(`${key} integer`)
                        break;

                    case "string":
                        if (property.format == "date-time"){
                            sqlColumnSchemas.push(`${key} timestamp`)
                        }
                        else {
                            sqlColumnSchemas.push(`${key} text`)
                        }

                        break;

                    case "object":
                        sqlColumnSchemas.push(`${key} json`)
                    
                    default:
                        break;
                }
            })

            var createQuery = `CREATE TABLE IF NOT EXISTS ${component}(id serial PRIMARY KEY, ${sqlColumnSchemas.join(",")})`
            console.log(createQuery)
            this.db.query(createQuery)

            var insertQuery = `INSERT INTO ${component}(${sqlColumnNames.join(",")}) values(${sqlColumnIndexes.join(",")}) RETURNING *`
            console.log(insertQuery)
            console.log(JSON.stringify(dataArray))
            try {
                let result = await this.db.query(insertQuery, dataArray)
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
    
        public updateSingle(component: string, id: string, data: JSON, schema: object){
            
        }
    
        public deleteSingle(component: string, id: string){
    
        }
    
        public deleteAll(component: string){
    
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
    const createSchema = require("./default.table.create.schema.json")
    const validateCreate = ajv.compile(createSchema)
    let db = new DB()

    scribe.post("/v0/:component", parser.json(), (req, res, next) => {
        // sanity check json body
        console.log(req.body)
        if (validateCreate(req.body) == false){
            console.log(validateCreate.errors)
            res.statusCode = 400
            res.send("Invalid json request format")
            return;
        }

        db.createSingle(req.params.component, req.body, createSchema).then(result => {
            res.send(result)
        })

        // send response success or fail
    })

    scribe.delete("/v0/:component", parser.urlencoded({ extended: true }), (req, res, next) => {
        // delete table if it exists
        db.deleteAll(req.params.component)
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
    
    scribe.put("/v0/:component/:id", parser.urlencoded({ extended: true }), (req, res, next) => {
        // sanity check json body
       /* if (validate(req.body) == false){
            res.statusCode = 400
            res.send("Invalid json request format")
            return;
        }

        // update id if it exists
        db.updateSingle(req.params.component, req.params.id, req.body, schema)
        // fail if it doesn't
        */
    })

    scribe.delete("/v0/:component/:id", parser.urlencoded({ extended: true }), (req, res, next) => {
        // delete id if it exists
        // fail if it doesn't exist
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
