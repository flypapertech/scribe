import * as cluster from "cluster"
import * as express from "express"
import * as parser from "body-parser"
import * as os from "os"

const mkdirp = require("mkdirp")

const argv = require("yargs").argv
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

    scribe.get("/:component", parser.urlencoded({ extended: true }), (req, res, next) => {
    })

    const server = scribe.listen(argv.port, () => {
        console.log("Scribe - Core: %s, Process: %sd, Name: %s, Home: %s, Port: %d",
            cluster.worker.id,
            process.pid,
            argv.name,
            argv.home,
            argv.port
        )
    })

    module.exports = server
}
