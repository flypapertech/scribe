#!/usr/bin/env node
import * as cluster from "cluster"
import * as os from "os"
import { createServer } from "./scribe"

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
