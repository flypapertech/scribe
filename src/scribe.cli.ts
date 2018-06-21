import * as cluster from "cluster"
import * as express from "express"
import * as parser from "body-parser"
import * as os from "os"
import * as mkdirp from "mkdirp"
import * as yargs from "yargs"

const argv = yargs.argv

argv.name = argv.name || process.env.SCRIBE_APP_NAME || process.env.HOSTNAME || "localhost"
argv.home = argv.home || process.env.SCRIBE_APP_HOME || process.cwd()
argv.port = argv.port || process.env.SCRIBE_APP_PORT || process.env.PORT || 1337
argv.mode = argv.mode || process.env.SCRIBE_APP_MODE || process.env.NODE_MODE || "development"

if (cluster.isMaster) {
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

    scribe.post("/v0/:component", parser.urlencoded({ extended: true }), (req, res, next) => {
        // make table and record for info sent
        // send response success or fail
    })

    scribe.delete("/v0/:component", parser.urlencoded({ extended: true }), (req, res, next) => {
        // delete table if it exists
        // send response success or fail
    })

    scribe.get("/v0/:component/all", parser.urlencoded({ extended: true }), (req, res, next) => {
        // get all
        // fail if component doesn't exist
        // returns array always
    })

    scribe.get("/v0/:component/:id", parser.urlencoded({ extended: true }), (req, res, next) => {
        // get id
        // fail if component doesn't exist
        // returns array always
    })

    scribe.get("/v0/:component/:id/history", parser.urlencoded({ extended: true }), (req, res, next) => {
        // get history of id
        // fail if component doesn't exist
        // returns array always
    })
    
    scribe.put("/v0/:component/:id", parser.urlencoded({ extended: true }), (req, res, next) => {
        // update id if it exists
        // fail if it doesn't
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
